"""Move retained source placements vertically onto D13. No resampling/removal."""
from pathlib import Path
import json,hashlib
import numpy as np
from PIL import Image
from build_geography import sample_grid
ROOT=Path(__file__).resolve().parents[2];OUT=ROOT/'godot-pc/world-final/nature'
for name in ['authored-D13.json','groundcover-authored-D13.json','collision-D13.json']:
    if (OUT/name).exists():raise RuntimeError('Preserve authored data '+name)
old=np.fromfile(ROOT/'godot-pc/world-final/geography/heightmap.f32',dtype='<f4').reshape(701,801)
terrain=np.load(ROOT/'godot-pc/world-final/geology-D13/terrain-data.npz');new=terrain['heights']
dz,dx=np.gradient(new,2,2)
forest=json.loads((OUT/'authored-D08.json').read_text());byid={}
changed_forest=0
for p in forest['placements']:
    x,y,z=p['position'];delta=float(sample_grid(new,x,z)-sample_grid(old,x,z));byid[p['id']]=delta
    if abs(delta)<1e-6:continue
    p['position'][1]+=delta;p['ground']+=delta;changed_forest+=1
assert all(byid[p['id']]==0 for p in forest['placements'] if p['id'].startswith('D01_'))
collision=json.loads((OUT/'collision-D08.json').read_text())
for c in collision['obstacles']:
    delta=byid[c['id']];c['bottom']+=delta;c['top']+=delta
grass=json.loads((OUT/'groundcover-authored-D11.json').read_text());changed_grass=0;max_slope=0;limited=0
for c in grass['grass_cells']:
    for p in c['points']:
        x,z=p[0],p[2];delta=float(sample_grid(new,x,z)-sample_grid(old,x,z))
        if abs(delta)<1e-6:continue
        p[1]+=delta;p[5]=float(sample_grid(dx,x,z));p[6]=float(sample_grid(dz,x,z));changed_grass+=1
        slope=float(np.hypot(p[5],p[6]));max_slope=max(max_slope,slope)
        # Keep tufts upright enough to read on a rocky bank. Position and
        # population are exact; this is an explicit artistic orientation cap.
        if slope>1.4:
            p[5]*=1.4/slope;p[6]*=1.4/slope;limited+=1
for p in grass['cliffs']:
    x,y,z=p['position'];p['position'][1]+=float(sample_grid(new,x,z)-sample_grid(old,x,z))
forest.update(revision='D13',source_revision='D08',native_source_pending=True,native_editing={'round_trip_verified':False,'vertical_reseat_only':True})
grass.update(revision='D13',source_revision='D11D',existing_heightmap_changed=True,native_source_pending=True,native_roundtrip_verified=False,visual_verified=False)
for name,data in [('authored-D13.json',forest),('groundcover-authored-D13.json',grass),('collision-D13.json',collision)]:
    (OUT/name).write_text(json.dumps(data,separators=(',',':'))+'\n',encoding='utf-8')
mask=ROOT/'godot-pc/world-final/materials/biomes-D13.png'
if mask.exists():raise RuntimeError('Preserve existing paint')
Image.fromarray(np.rint(np.clip(terrain['colors'],0,1)*255).astype('uint8')).save(mask)
report=dict(revision='D13',terrain_sha256=hashlib.sha256(new.tobytes()).hexdigest(),retained_forest=len(forest['placements']),retained_grass=grass['counts']['grass_tufts'],retained_cliffs=len(grass['cliffs']),changed_forest_heights=changed_forest,changed_grass_heights=changed_grass,removed_instances=0,xz_and_ids_unchanged=True,sample_unchanged=True,max_new_grass_slope=max_slope,grass_orientation_caps=limited,native_pending=True)
(ROOT/'docs/world-final/nature-reseat-D13.json').write_text(json.dumps(report,indent=2)+'\n')
print(json.dumps(report),flush=True)
