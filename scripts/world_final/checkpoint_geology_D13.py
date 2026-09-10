"""Preserve the current unpublished geography outside the repository."""
from pathlib import Path
import json,hashlib,shutil,subprocess
ROOT=Path(__file__).resolve().parents[2]
state=json.loads((ROOT/'WORLD_STATE.json').read_text())
state['last_saved_commit']='8403d4a8dc2ca88f56359be7045cf427bd570368'
state['publication'].update(content_checkpoint=state['last_saved_commit'],pending='D12-D13 geography and reseating are local, unverified as a combined world. D11 source/evidence is published.')
state['D13_in_progress']={'terrain_source':'art/world-final/Varendor_Geology_D-13.blend','terrain_sha256':'2d7e1806aa2411e1a8d39a565d6e4aa64ba5fbcb6ed2b9563d9976cd0d51ef0e','shape_report':'docs/world-final/geology-shape-D13.json','reseat_report':'docs/world-final/nature-reseat-D13.json','native_launch':'qa-artifacts/world-final/native-nature-D13','native_launch_result':'timeout 120s; exit unknown; PID24684 still working at checkpoint; do not mark successful','main_integrated':False,'combined_visual_verified':False,'native_roundtrip_verified':False}
state['next_task']='Check completion of Blender PID24684 (native-nature-D13) without rerunning it. Reopen and verify D13 native/placement/mesh preservation, then import and render reseated_world_D13_review.tscn. Refine grass/rock appearance and native materials; retain density. D remains incomplete, E-H remain pending.'
state['backup_current_from_workspace']='outputs/world-final-D13-in-progress'
(ROOT/'WORLD_STATE.json').write_text(json.dumps(state,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
launch=ROOT/'qa-artifacts/world-final/native-nature-D13'
copy=launch/'launched-source.py'
if not copy.exists():shutil.copy2(ROOT/'scripts/world_final/author_reseated_world_D13_blender.py',copy)
destination=ROOT.parents[1]/'outputs/world-final-D13-in-progress'
if destination.exists():raise RuntimeError('Preserve existing backup')
names=set(subprocess.check_output(['git','diff','--name-only','HEAD'],cwd=ROOT,text=True).splitlines())
names.update(subprocess.check_output(['git','ls-files','--others','--exclude-standard'],cwd=ROOT,text=True).splitlines())
for revision in ['D12','D13']:
    for p in (ROOT/f'godot-pc/world-final/geology-{revision}').rglob('*'):
        if p.is_file():names.add(p.relative_to(ROOT).as_posix())
for pattern in ['authored-D13.json','collision-D13.json','groundcover-authored-D13.json','groundcover-collision-D13.json']:
    names.add('godot-pc/world-final/nature/'+pattern)
for p in (ROOT/'godot-pc/world-final/nature/assets').glob('D13_*.glb'):names.add(p.relative_to(ROOT).as_posix())
for p in (ROOT/'art/world-final').glob('*D-1[23]*.blend'):names.add(p.relative_to(ROOT).as_posix())
names.add(copy.relative_to(ROOT).as_posix());manifest=[]
for name in sorted(names):
    source=ROOT/name
    if not source.is_file() or '__pycache__' in name:continue
    target=destination/name;target.parent.mkdir(parents=True,exist_ok=True)
    data=source.read_bytes();target.write_bytes(data);digest=hashlib.sha256(data).hexdigest()
    assert hashlib.sha256(target.read_bytes()).hexdigest()==digest
    manifest.append(dict(path=name,bytes=len(data),sha256=digest))
(destination/'backup-manifest.json').write_text(json.dumps(dict(branch=state['branch'],head=state['last_saved_commit'],native_process_unverified=True,files=manifest),indent=2)+'\n')
print(json.dumps(dict(path=str(destination),files=len(manifest),bytes=sum(x['bytes'] for x in manifest))),flush=True)
