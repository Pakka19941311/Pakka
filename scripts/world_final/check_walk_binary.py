"""Exercise the exact exported binary, including non-resource PCK data."""
from pathlib import Path
import argparse,json,subprocess
p=argparse.ArgumentParser();p.add_argument('exe',type=Path);p.add_argument('output',type=Path)
a=p.parse_args();a.exe=a.exe.resolve();a.output=a.output.resolve()
for space in ['surface','mine','great_cave']:
    output=a.output/space;output.mkdir(parents=True,exist_ok=True)
    engine=output/'engine.log';engine.touch()
    command=[str(a.exe),'--headless','--log-file',str(engine),'--','--walk-preview-qa='+str(output),'--preview-space='+space]
    with (output/'stdout.log').open('w',encoding='utf-8') as log:
        result=subprocess.run(command,cwd=output,stdout=log,stderr=subprocess.STDOUT,timeout=300)
    record={'command':command,'cwd':str(output),'exit':result.returncode,'headless':True}
    (output/'launch.json').write_text(json.dumps(record,indent=2)+'\n',encoding='utf-8')
    assert result.returncode==0,record
    report=json.loads((output/'preview-qa.json').read_text('utf-8'))
    assert report['ok'] and report['headless'] and not report['personal_saves_opened'],report
    logs=(output/'stdout.log').read_text('utf-8')
    assert not any(error in logs for error in ['SCRIPT ERROR:','Parse Error:','Failed loading resource:']),logs[-16000:]
    print(json.dumps(report),flush=True)
