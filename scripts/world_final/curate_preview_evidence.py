"""Keep full incident logs privately; publish focused, machine-independent QA."""
from pathlib import Path
import json,shutil
ROOT=Path(__file__).resolve().parents[2]
backup=ROOT.parents[1]/'outputs/world-preview-private-diagnostics'
paths=list((ROOT/'docs/world-final/evidence/walk-preview').glob('*-result.json'))+list((ROOT/'docs/world-final/evidence/walk-preview').glob('*-launch.json'))
archive=ROOT/'docs/world-final/evidence/D13-geology/launch-logs.zip'
paths.append(archive)
for path in paths:
    target=backup/path.relative_to(ROOT);target.parent.mkdir(parents=True,exist_ok=True);shutil.copy2(path,target)
    assert target.read_bytes()==path.read_bytes()
for name in ['surface','mine','great_cave']:
    source=ROOT/'docs/world-final/evidence/walk-preview'/(name+'-result.json')
    result=json.loads(source.read_text('utf-8'))
    summary={key:result[key] for key in ['operation_completed','exit_code','timed_out','elapsed_s','crash_detected']}
    summary.update(operation='Interactive world exploration, '+name,engine='Godot 4.6.3',raw_host_telemetry_published=False)
    for kind in ['result','launch']:
        (source.parent/(name+'-'+kind+'.json')).write_text(json.dumps(summary,indent=2)+'\n',encoding='utf-8')
assert archive.resolve().is_relative_to(ROOT.resolve())
archive.unlink() # Publication copy only; verified external backup and original QA remain.
print(json.dumps({'private_backup':str(backup),'curated_reports':6,'raw_archive_removed_from_publication':True}))
