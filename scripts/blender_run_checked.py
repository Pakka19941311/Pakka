"""Bounded native authoring launch; retain failed exits and measured memory."""
from pathlib import Path
import argparse,datetime,json,subprocess,time
from godot_run_checked import memory_sampler,close_windows_for_processes

def main():
    parser=argparse.ArgumentParser(description=__doc__)
    for name in ('exe','script','output'):parser.add_argument('--'+name,required=True)
    parser.add_argument('--timeout',type=float,default=180)
    args=parser.parse_args()
    exe,script,out=(Path(value).resolve() for value in (args.exe,args.script,args.output))
    if not exe.is_file() or not script.is_file():parser.error('Missing executable or authoring script')
    out.mkdir(parents=True,exist_ok=False)
    command=[str(exe),'--background','--python',str(script)]
    result={'command':command,'cwd':str(Path.cwd()),'utc_start':datetime.datetime.now(datetime.timezone.utc).isoformat(),'timeout_seconds':args.timeout,'timed_out':False,'samples':[]}
    sample=memory_sampler();start=time.monotonic()
    with (out/'stdout.log').open('wb') as stdout,(out/'stderr.log').open('wb') as stderr:
        process=subprocess.Popen(command,stdout=stdout,stderr=stderr,creationflags=getattr(subprocess,'CREATE_NO_WINDOW',0))
        result['pid']=process.pid
        (out/'launch.json').write_text(json.dumps(result,indent=2)+'\n',encoding='utf-8')
        while process.poll() is None:
            reading=sample(process.pid);reading['elapsed_s']=round(time.monotonic()-start,3);result['samples'].append(reading)
            if time.monotonic()-start>args.timeout:
                result['timed_out']=True
                result['close_requested_pids']=close_windows_for_processes({p['pid'] for p in reading.get('processes',[])})
                try:process.wait(timeout=5)
                except subprocess.TimeoutExpired:
                    attempt=subprocess.run(['taskkill','/PID',str(process.pid),'/T','/F'],capture_output=True)
                    result['termination_attempt']={'exit_code':attempt.returncode,'stderr':attempt.stderr.decode('utf-8',errors='replace')}
                break
            time.sleep(.5)
        try:result['exit_code']=process.wait(timeout=10)
        except subprocess.TimeoutExpired:result.update(exit_code=None,termination_incomplete=True,remaining_processes=sample(process.pid).get('processes',[]))
    result['elapsed_s']=round(time.monotonic()-start,3)
    result['peak_working_set_bytes']=max((p.get('peak_working_set',0) for s in result['samples'] for p in s['processes']),default=0)
    result['min_available_bytes']=min((s['system']['physical_available'] for s in result['samples'] if s['system']),default=None)
    result['operation_completed']=result['exit_code']==0 and not result['timed_out']
    (out/'result.json').write_text(json.dumps(result,indent=2)+'\n',encoding='utf-8')
    print(json.dumps({k:v for k,v in result.items() if k!='samples'}),flush=True)
    return 0 if result['operation_completed'] else 1

if __name__=='__main__':raise SystemExit(main())
