#!/usr/bin/env python3
"""Bounded production input delivery under orbit and physics-frame bursts.

Uses a separate loopback receiver and Godot's real PlayerInput, CameraController,
input transport and thread shutdown. No player data or gameplay server is used.
An optional git baseline replays only the old dispatch queue for root-cause proof.
"""
import argparse
import http.server
import json
from pathlib import Path
import subprocess
import tempfile
import threading
import time


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--godot', required=True)
    parser.add_argument('--output', required=True)
    parser.add_argument('--baseline')
    args = parser.parse_args()
    root = Path(__file__).resolve().parent.parent
    legacy_path = None
    if args.baseline:
        source = subprocess.check_output(['git', 'show', args.baseline + ':godot-pc/scripts/network.gd'], cwd=root, text=True)
        start = source.index('func intent(value: Dictionary) -> void:')
        end = source.index('func pending_path() -> String:', start)
        legacy = 'extends VarendorNetwork\n\n' + source[start:end]
        legacy = legacy.replace('if not connected: return', 'if not connected: return\n\tvalue = value.duplicate(true)\n\tvalue.probe_sent_ms = Time.get_unix_time_from_system() * 1000.0')
        with tempfile.NamedTemporaryFile(mode='w', suffix='.gd', delete=False) as file:
            file.write(legacy)
            legacy_path = file.name
    reports = []
    scenarios = [('orbit', fps) for fps in [30, 60, 144, 360, 0]] + [('physics-burst', fps) for fps in [30, 60, 144]]
    if not args.baseline:
        scenarios.append(('lifecycle', 30))
    try:
        for scenario, fps in scenarios:
            received = []

            class Handler(http.server.BaseHTTPRequestHandler):
                def do_POST(self):
                    value = json.loads(self.rfile.read(int(self.headers['Content-Length'])))
                    received.append({'sequence': value['sequence'], 'generation': value['generation'],
                                     'direction': [value['intent']['x'], value['intent']['z']],
                                     'delivery_ms': time.time() * 1000 - value['intent']['probe_sent_ms']})
                    if value['intent'].get('probe_delay_ms'):
                        time.sleep(value['intent']['probe_delay_ms'] / 1000)
                    body = json.dumps({'sequence': value['sequence']}).encode()
                    try:
                        self.send_response(200)
                        self.send_header('Content-Type', 'application/json')
                        self.send_header('Content-Length', str(len(body)))
                        self.end_headers()
                        self.wfile.write(body)
                    except (BrokenPipeError, ConnectionResetError):
                        pass  # Expected: cancellation closes an in-flight connection.

                def log_message(self, *_args):
                    pass

            with http.server.ThreadingHTTPServer(('127.0.0.1', 0), Handler) as server:
                thread = threading.Thread(target=server.serve_forever, daemon=True)
                thread.start()
                try:
                    command = [args.godot, '--headless', '--max-fps', str(fps), '--path', str(root / 'godot-pc'),
                               '--script', 'res://scripts/network_orbit_probe.gd', '--',
                               f'--transport-probe-url=http://127.0.0.1:{server.server_port}',
                               f'--transport-probe-scenario={scenario}']
                    if legacy_path:
                        command.append('--transport-probe-legacy=' + legacy_path)
                    result = subprocess.run(command, capture_output=True, text=True, timeout=40)
                finally:
                    server.shutdown()
                    thread.join()
            marker = 'VARENDOR_ORBIT_PROBE '
            native = next((json.loads(line[len(marker):]) for line in result.stdout.splitlines() if line.startswith(marker)), {})
            reserved = native.get('reserved', [])
            delivered = [{'sequence': entry['sequence'], 'direction': entry['direction']} for entry in received]
            checks = {
                'runtime_completed_without_errors': result.returncode == 0 and bool(native) and not result.stderr.strip(),
                'all_submitted_directions_arrive_in_order': delivered == reserved,
                'release_received_within_100_ms': bool(received) and received[-1]['direction'] == [0, 0] and 0 <= received[-1]['delivery_ms'] < 100,
                'no_growing_delivery_backlog': bool(received) and max(entry['delivery_ms'] for entry in received) < 150,
            }
            if scenario == 'physics-burst': checks['all_120_physics_steering_samples_and_release'] = len(received) == 121
            if scenario == 'orbit':
                measured = native.get('render_metrics', {})
                checks['real_orbit_changes_heading_through_two_seconds'] = (len(received) >= 40
                    and measured.get('duration_ms', 0) >= 1800
                    and (fps not in [360, 0] or measured.get('observed_fps', 0) > 180))
            if scenario == 'lifecycle':
                checks['cancel_inflight_worker_without_join_stall'] = native.get('maximum_queue', 9999) < 100
                checks['new_generation_input_not_blocked_by_old_connection'] = [entry['generation'] for entry in received] == [1, 2]
            row = {'scenario': scenario, 'fps': fps, 'ok': all(checks.values()), 'checks': checks,
                   'native': native, 'received': received}
            if result.stderr.strip() or not native:
                row.update(stdout=result.stdout[-3000:], stderr=result.stderr[-3000:])
            reports.append(row)
            print(json.dumps({'scenario': scenario, 'fps': fps, 'checks': checks, 'commands': len(received),
                              'release_ms': received[-1]['delivery_ms'] if received else None, 'queue': native.get('maximum_queue'),
                              'render_metrics': native.get('render_metrics')}), flush=True)
    finally:
        if legacy_path: Path(legacy_path).unlink(missing_ok=True)
    report = {'ok': all(row['ok'] for row in reports), 'baseline': args.baseline, 'runs': reports}
    output = Path(args.output)
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(report, indent=2) + '\n', encoding='utf-8')
    raise SystemExit(0 if report['ok'] or args.baseline else 1)


if __name__ == '__main__':
    main()
