"""Collect unretouched engine evidence and exact continuation for D12-D13."""
from pathlib import Path
import json,hashlib,shutil,zipfile
ROOT=Path(__file__).resolve().parents[2];QA=ROOT/'qa-artifacts/world-final';DOC=ROOT/'docs/world-final'
OUT=DOC/'evidence/D13-geology';OUT.mkdir(parents=True,exist_ok=True)
def read(path):return json.loads(path.read_text())
walk=read(QA/'reseated-frames-D13/groundcover-review.json')
native=read(DOC/'native-roundtrip-D13.json')
assert walk['all_walks_pass'] and native['source_unchanged'] and native['cliff_edit_verified_in_export']
selected=[]
for r in walk['walks']:
    a,b=int(r['first_frame']),int(r['last_frame'])
    for index in [a,(a+b)//2,b]:
        src=QA/f'reseated-frames-D13/frame-{index:05}.jpg';dest=OUT/src.name;shutil.copy2(src,dest)
        selected.append(dict(path=dest.name,walk=r['id'],frame=index,sha256=hashlib.sha256(src.read_bytes()).hexdigest()))
for name in ['whole-world-forests','snow-treeline','volcano-surface','rotten-forest-mass','lake-shore']:
    src=QA/f'reseated-frames-D13/{name}.png';shutil.copy2(src,OUT/src.name)
for revision in ['D12','D13']:
    for name in ['snow-ridges','volcano-ridges']:
        src=QA/f'geology-frames-{revision}/{name}.png';dest=OUT/f'{revision}-{name}.png';shutil.copy2(src,dest)
shutil.copy2(QA/'reseated-frames-D13/groundcover-review.json',OUT/'groundcover-review.json')
(OUT/'frames.json').write_text(json.dumps(dict(captured_motion_frames=walk['frames'],selected_motion_frames=selected,source='Godot viewport; unchanged images',final_visual_acceptance=False),indent=2)+'\n')
launch_names=['native-geology-D12','import-geology-D12','geology-appearance-D12','import-geology-paint-D12','geology-paint-D12','native-geology-D13','import-geology-D13','geology-appearance-D13','native-nature-D13','reopen-native-D13','import-reseated-D13','reseated-walks-D13']
launches=[]
for name in launch_names:
    folder=QA/name;result=read(folder/'result.json')
    launches.append(dict(name=name,operation_completed=result['operation_completed'],exit_code=result['exit_code'],timed_out=result['timed_out'],elapsed_s=result['elapsed_s']))
# Full command lines, host paths and process samples stay in local QA backups.
(OUT/'launches.json').write_text(json.dumps(launches,indent=2)+'\n')
for name in ['authored-D13.json','groundcover-authored-D13.json']:
    path=ROOT/'godot-pc/world-final/nature'/name;data=read(path);data['native_roundtrip_verified']=True
    if 'native_editing' in data:data['native_editing']['round_trip_verified']=True
    path.write_text(json.dumps(data,separators=(',',':'))+'\n',encoding='utf-8')
report_path=DOC/'nature-reseat-D13.json';report=read(report_path)
report.update(native_roundtrip_pending=False,native_roundtrip_verified=True,rendered_walks=walk['walks'],rendered_frames=walk['frames'],whole_world_finished=False,material_native_parity=False)
report_path.write_text(json.dumps(report,indent=2)+'\n')
state=read(ROOT/'WORLD_STATE.json')
state['D13_in_progress'].update(native_source=native['native_source'],native_sha256=native['sha256'],native_launch_result='Original 120s launch timed out, exit unknown; source later saved. Separate native reopen/edit-export completed exit 0 in 12.797s.',combined_visual_verified='Inspected; final visual quality remains unfinished.',native_roundtrip_verified=True,rendered_walks=3,rendered_frames=walk['frames'],stop_drift_m=0,evidence='docs/world-final/evidence/D13-geology')
state['stages']['D']='partial: D13 terrain and reseated full nature source verified; 92973 forest placements, 362189 grass points and 151 cliffs preserved. Three rendered walks and native forest/grass/cliff edit-export checks pass. Final geology/vegetation quality, native material parity, shore/swamp and unique ancient tree remain unfinished.'
state['next_task']='Package, clean-restore and publish D12-D13 native/evidence checkpoint. Then finish D nature art: unique hollow ancient tree and root mass at the existing L03 anchor, swamp/shore details, grass ground transitions and coherent snow/rock silhouettes. E atmosphere/maps, F main/NPC/portals/saves, G exact1000 and H release remain pending.'
state['not_verified'].append('D13: native terrain/forest/grass/cliff edit tests and three actual rendered walks pass. Snow cover too uniform, mountain faces too smooth, isolated scan edges, abrupt grass tufts/ground palette, exact native shader parity are unfinished. Main still old world.')
(ROOT/'WORLD_STATE.json').write_text(json.dumps(state,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
print(json.dumps(dict(selected_motion=len(selected),launches=len(launches),failed_launches=[r['name'] for r in launches if not r['operation_completed']])),flush=True)
