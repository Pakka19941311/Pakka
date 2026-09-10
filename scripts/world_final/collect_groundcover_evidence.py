"""Preserve selected original Godot frames and complete launch diagnostics."""
from pathlib import Path
import json,shutil,hashlib,zipfile
ROOT=Path(__file__).resolve().parents[2];QA=ROOT/'qa-artifacts/world-final'
OUT=ROOT/'docs/world-final/evidence/D11-groundcover'
OUT.mkdir(parents=True,exist_ok=True)
frames=QA/'groundcover-walk-frames-D11'
report=json.loads((frames/'groundcover-review.json').read_text())
selected=['whole-world-forests.png','snow-treeline.png','volcano-surface.png','lake-shore.png','forest-ground.png','swamp-ground.png','lakeside-ground.png','forest-sample-stop.png']
for walk in report['walks']:
    selected.extend(f'frame-{int(i):05d}.jpg' for i in [walk['first_frame'],(walk['first_frame']+walk['last_frame'])//2,walk['last_frame']])
assert all((frames/name).is_file() for name in selected)
manifest=[]
for name in selected:
    source=frames/name;target=OUT/name
    if target.exists():assert target.read_bytes()==source.read_bytes(),'Preserve existing evidence: '+name
    else:shutil.copy2(source,target)
    manifest.append({'path':name,'source':source.relative_to(ROOT).as_posix(),'sha256':hashlib.sha256(source.read_bytes()).hexdigest(),'bytes':source.stat().st_size})
shutil.copy2(frames/'groundcover-review.json',OUT/'groundcover-review.json')
launches=['library-D11A','gallery-D11A','library-D11B','native-groundcover-D11','native-reopen-D11','native-attributes-D11','native-attributes-repair-D11C',
    'native-reopen-D11C','native-roundtrip-error-D11C','native-attributes-repair-D11D','native-reopen-D11D','import-groundcover-D11',
    'groundcover-appearance-D11','import-shared-cliffs-D11','groundcover-walks-D11','main-after-D11','grass-color-D12','grass-normals-D12']
summaries=[]
with zipfile.ZipFile(OUT/'launch-logs.zip','w',compression=zipfile.ZIP_DEFLATED,compresslevel=7) as archive:
    for name in launches:
        path=QA/name;result=json.loads((path/'result.json').read_text())
        logs='\n'.join(p.read_text(encoding='utf-8',errors='replace') for p in path.glob('*.log'))
        actual_pass=result['operation_completed'] and 'Traceback (most recent call last):' not in logs
        compact={k:v for k,v in result.items() if k!='samples'}
        compact.update(launch_id=name,accepted_operation_completed=actual_pass)
        if name=='native-reopen-D11':compact['correction']='Original wrapper returned exit 0 on a Python exception. This check failed; corrected launcher uses --python-exit-code 86 and scans the traceback.'
        summaries.append(compact)
        for file in sorted(path.iterdir()):
            if file.is_file() and file.suffix in ('.json','.log'):archive.write(file,name+'/'+file.name)
for folder in ['grass-color-frames-D12','grass-normals-frames-D12']:
    destination=OUT/folder;destination.mkdir()
    for file in (QA/folder).glob('*.png'):shutil.copy2(file,destination/file.name)
(OUT/'launches.json').write_text(json.dumps(summaries,indent=2)+'\n',encoding='utf-8')
(OUT/'frame-manifest.json').write_text(json.dumps({'original_frames':True,'retouching':False,'motion_recorded_frames':report['frames'],'motion_frames_selected':18,'selection':'First, middle, last from each of six uninterrupted physics walks. Full local sequence remains in qa-artifacts.','files':manifest},indent=2)+'\n',encoding='utf-8')
print(json.dumps({'evidence':OUT.relative_to(ROOT).as_posix(),'frames':len(manifest),'launches':len(launches),'all_walks_pass':report['all_walks_pass'],'stop_drift_max':max(w['stop_drift_m'] for w in report['walks'])}),flush=True)
