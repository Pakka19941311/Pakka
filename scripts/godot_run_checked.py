"""Bounded Godot QA launch with an existing writable log and Windows memory evidence.

Godot 4.6.3 RotatedFileLogger dereferences a failed FileAccess::open result.
Preflight the exact absolute log file before starting, rather than trusting the
engine to create a missing directory. This does not change project settings.
"""
import argparse
import ctypes
from ctypes import wintypes as w
import datetime
import json
import os
import signal
from pathlib import Path
import subprocess
import time


def memory_sampler():
    if not hasattr(ctypes, 'WinDLL'):
        def sample_linux(pid):
            record = {'pid': pid, 'sampler': 'proc-status'}
            try:
                fields = dict(line.split(':', 1) for line in Path(f'/proc/{pid}/status').read_text().splitlines() if ':' in line)
                for source, target in [('VmRSS', 'working_set'), ('VmHWM', 'peak_working_set')]:
                    if source in fields: record[target] = int(fields[source].split()[0]) * 1024
            except (OSError, ValueError):
                record['memory_unavailable'] = True
            return {'system': None, 'processes': [record]}
        return sample_linux
    kernel = ctypes.WinDLL('kernel32', use_last_error=True)
    psapi = ctypes.WinDLL('psapi', use_last_error=True)
    class MemoryStatus(ctypes.Structure):
        _fields_ = [('length', w.DWORD), ('load_percent', w.DWORD)] + [
            (name, ctypes.c_ulonglong) for name in
            ('physical_total', 'physical_available', 'commit_limit', 'commit_available',
             'virtual_total', 'virtual_available', 'extended_available')]
    class Counters(ctypes.Structure):
        _fields_ = [('cb', w.DWORD), ('page_faults', w.DWORD)] + [
            (name, ctypes.c_size_t) for name in
            ('peak_working_set', 'working_set', 'quota_peak_paged', 'quota_paged',
             'quota_peak_nonpaged', 'quota_nonpaged', 'pagefile', 'peak_pagefile', 'private_bytes')]
    class ProcessEntry(ctypes.Structure):
        _fields_ = [('size', w.DWORD), ('usage', w.DWORD), ('pid', w.DWORD),
                    ('heap', ctypes.c_size_t), ('module', w.DWORD), ('threads', w.DWORD),
                    ('parent_pid', w.DWORD), ('priority', w.LONG), ('flags', w.DWORD),
                    ('exe', w.WCHAR * 260)]
    kernel.GlobalMemoryStatusEx.argtypes = [ctypes.POINTER(MemoryStatus)]
    kernel.OpenProcess.argtypes = [w.DWORD, w.BOOL, w.DWORD]
    kernel.OpenProcess.restype = w.HANDLE
    kernel.CloseHandle.argtypes = [w.HANDLE]
    kernel.CreateToolhelp32Snapshot.argtypes = [w.DWORD, w.DWORD]
    kernel.CreateToolhelp32Snapshot.restype = w.HANDLE
    kernel.Process32FirstW.argtypes = [w.HANDLE, ctypes.POINTER(ProcessEntry)]
    kernel.Process32NextW.argtypes = [w.HANDLE, ctypes.POINTER(ProcessEntry)]
    psapi.GetProcessMemoryInfo.argtypes = [w.HANDLE, ctypes.POINTER(Counters), w.DWORD]
    def sample(root_pid):
        status = MemoryStatus(); status.length = ctypes.sizeof(status)
        ok = kernel.GlobalMemoryStatusEx(ctypes.byref(status))
        result = {'system': {name: getattr(status, name) for name, _ in status._fields_[1:]} if ok else None,
                  'processes': []}
        snap = kernel.CreateToolhelp32Snapshot(2, 0)
        entries = []
        if snap != ctypes.c_void_p(-1).value:
            entry = ProcessEntry(); entry.size = ctypes.sizeof(entry)
            has = kernel.Process32FirstW(snap, ctypes.byref(entry))
            while has:
                entries.append((entry.pid, entry.parent_pid, entry.exe))
                has = kernel.Process32NextW(snap, ctypes.byref(entry))
            kernel.CloseHandle(snap)
        selected = {root_pid}
        for _ in range(4):
            selected.update(pid for pid, parent, exe in entries if parent in selected)
        for pid, parent, exe in entries:
            if pid not in selected: continue
            handle = kernel.OpenProcess(0x0400 | 0x0010, False, pid)
            record = {'pid': pid, 'parent_pid': parent, 'exe': exe}
            if handle:
                counters = Counters(); counters.cb = ctypes.sizeof(counters)
                if psapi.GetProcessMemoryInfo(handle, ctypes.byref(counters), counters.cb):
                    record.update({name: getattr(counters, name) for name in
                                   ('working_set', 'peak_working_set', 'private_bytes', 'peak_pagefile')})
                else: record['memory_error'] = ctypes.get_last_error()
                kernel.CloseHandle(handle)
            else: record['open_error'] = ctypes.get_last_error()
            result['processes'].append(record)
        return result
    return sample


def close_windows_for_processes(pids):
    """Gracefully close only windows belonging to this launch's sampled PIDs."""
    if not hasattr(ctypes, 'WinDLL'):
        return []
    user = ctypes.WinDLL('user32', use_last_error=True)
    callback_type = ctypes.WINFUNCTYPE(w.BOOL, w.HWND, w.LPARAM)
    user.GetWindowThreadProcessId.argtypes = [w.HWND, ctypes.POINTER(w.DWORD)]
    user.PostMessageW.argtypes = [w.HWND, w.UINT, w.WPARAM, w.LPARAM]
    user.EnumWindows.argtypes = [callback_type, w.LPARAM]
    requested = []
    @callback_type
    def visit(hwnd, parameter):
        pid = w.DWORD()
        user.GetWindowThreadProcessId(hwnd, ctypes.byref(pid))
        if pid.value in pids and user.PostMessageW(hwnd, 0x0010, 0, 0):
            requested.append(pid.value)
        return True
    user.EnumWindows(visit, 0)
    return requested


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--exe', required=True)
    parser.add_argument('--project', required=True)
    parser.add_argument('--output', required=True, help='New evidence directory; refuses to overwrite a run')
    parser.add_argument('--cwd', default='.')
    parser.add_argument('--timeout', type=float, default=90)
    parser.add_argument('godot_args', nargs=argparse.REMAINDER)
    args = parser.parse_args()
    exe, project, cwd, output = (Path(v).resolve() for v in (args.exe, args.project, args.cwd, args.output))
    if not exe.is_file(): parser.error('Godot executable is missing')
    if not (project / 'project.godot').is_file(): parser.error('project.godot is missing')
    godot_args = args.godot_args[1:] if args.godot_args[:1] == ['--'] else args.godot_args
    if any(v in godot_args for v in ('--log-file', '--path')):
        parser.error('The checked launcher owns --path and --log-file')
    output.mkdir(parents=True, exist_ok=False)
    log = output / 'engine.log'
    with log.open('xb') as f:
        f.write(b'')
        f.flush()
    command = [exe.as_posix(), '--path', project.as_posix(), '--log-file', log.as_posix(), '--verbose', *godot_args]
    result = {'command': command, 'windows_command_line': subprocess.list2cmdline(command),
              'cwd': str(cwd), 'utc_start': datetime.datetime.now(datetime.timezone.utc).isoformat(),
              'environment_overrides': {}, 'project_settings_changed': False,
              'log_precreated_and_writable': True, 'timeout_seconds': args.timeout,
              'visual_check': False, 'samples': []}
    sample = memory_sampler()
    start = time.monotonic()
    with (output / 'stdout.log').open('wb') as out, (output / 'stderr.log').open('wb') as err:
        process = subprocess.Popen(command, cwd=cwd, stdout=out, stderr=err,
                                   creationflags=getattr(subprocess, 'CREATE_NO_WINDOW', 0),
                                   start_new_session=os.name != 'nt')
        result['launcher_pid'] = process.pid
        result['timed_out'] = False
        (output / 'launch.json').write_text(json.dumps({k:v for k,v in result.items() if k!='samples'}, indent=2), encoding='utf-8')
        while process.poll() is None:
            reading = sample(process.pid)
            reading['elapsed_s'] = round(time.monotonic() - start, 3)
            result['samples'].append(reading)
            if time.monotonic() - start > args.timeout:
                # Terminate only this launched process tree, never unrelated Godot sessions.
                result['timed_out'] = True
                selected = {p['pid'] for p in reading.get('processes', [])}
                result['close_requested_pids'] = close_windows_for_processes(selected)
                if os.name != 'nt':
                    # Only this launch's new process group is terminated.
                    try: os.killpg(process.pid, signal.SIGTERM)
                    except ProcessLookupError: pass
                try:
                    process.wait(timeout=5)
                except subprocess.TimeoutExpired:
                    if os.name == 'nt':
                        stopped = subprocess.run(['taskkill', '/PID', str(process.pid), '/T', '/F'], capture_output=True)
                        result['termination_attempt'] = {'exit_code': stopped.returncode,
                            'stderr': stopped.stderr.decode('utf-8', errors='replace')}
                    else:
                        try: os.killpg(process.pid, signal.SIGKILL)
                        except ProcessLookupError: pass
                        result['termination_attempt'] = {'signal': 'SIGKILL', 'process_group': process.pid}
                break
            time.sleep(0.2)
        try:
            result['exit_code'] = process.wait(timeout=10)
        except subprocess.TimeoutExpired:
            # Preserve the failed operation and the exact outstanding processes;
            # never let a launcher exception erase the diagnostic record.
            result['exit_code'] = None
            result['termination_incomplete'] = True
            result['remaining_processes'] = sample(process.pid).get('processes', [])
    result['elapsed_s'] = round(time.monotonic() - start, 3)
    data = '\n'.join((output / name).read_text('utf-8', errors='replace') for name in ('engine.log', 'stderr.log'))
    result['error_lines'] = [line for line in data.splitlines() if 'ERROR:' in line or 'SCRIPT ERROR:' in line]
    result['clean_error_log'] = not result['error_lines']
    result['crash_detected'] = 'CrashHandlerException' in data or 'Program crashed' in data
    result['operation_completed'] = result['exit_code'] == 0 and not result['timed_out'] and not result['crash_detected']
    result['peak_process_working_set_bytes'] = max((p.get('peak_working_set', 0) for s in result['samples'] for p in s['processes']), default=0)
    result['peak_process_private_bytes'] = max((p.get('private_bytes', 0) for s in result['samples'] for p in s['processes']), default=0)
    result['minimum_available_physical_bytes'] = min((s['system']['physical_available'] for s in result['samples'] if s['system']), default=None)
    (output / 'result.json').write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding='utf-8')
    print(json.dumps({k: v for k, v in result.items() if k not in ('samples', 'command')}, ensure_ascii=False), flush=True)
    return 0 if result['operation_completed'] else 1


if __name__ == '__main__':
    raise SystemExit(main())
