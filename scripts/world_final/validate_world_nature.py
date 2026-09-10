"""Validate saved nature data and concrete road/collision risks, not all gameplay."""
from pathlib import Path
import json,hashlib,math,collections
import numpy as np
from build_geography import segment_field,sample_grid
ROOT=Path(__file__).resolve().parents[2];NATURE=ROOT/'godot-pc/world-final/nature'
data=json.loads((NATURE/'authored-D08.json').read_text());original=json.loads((NATURE/'authored-D03.json').read_text())
layout=json.loads((ROOT/'godot-pc/world-final/world_layout.json').read_text());heights=np.fromfile(ROOT/'godot-pc/world-final/geography/heightmap.f32',dtype='<f4').reshape(701,801)
placements=data['placements'];by_id={p['id']:p for p in placements};assert len(by_id)==len(placements)
assert all(by_id[p['id']]==p for p in original['placements']),'Original sample was modified'
assert dict(collections.Counter(p['kind'] for p in placements))==data['counts']
assert hashlib.sha256((ROOT/data['native_source']).read_bytes()).hexdigest()==data['native_sha256']
for key,desc in data['catalog'].items():
    for lod in desc['lods']:assert hashlib.sha256((NATURE/lod['path']).read_bytes()).hexdigest()==lod['sha256'],lod['path']
positions=np.array([p['position'] for p in placements]);assert np.isfinite(positions).all()
assert (np.abs(positions[:,0])<=800).all() and (np.abs(positions[:,2])<=700).all()
ground=np.array([p['ground'] for p in placements]);gap=np.abs(sample_grid(heights,positions[:,0],positions[:,2])-ground)
assert gap.max()<.002,('terrain anchor gap',gap.max())
collisions=json.loads((NATURE/'collision-D08.json').read_text())['obstacles'];assert len({o['id'] for o in collisions})==len(collisions)
new=[o for o in collisions if o['id'].startswith('D08_')];x=np.array([o['x'] for o in new]);z=np.array([-o['z'] for o in new]);clearance=np.full(len(new),1e6)
for road in layout['roads']:
    dist,_=segment_field(x,z,road['points_xyz']);clearance=np.minimum(clearance,dist-float(road['width'])/2)
radius=np.array([o['radius'] if o['kind']=='circle' else math.hypot(o['halfX'],o['halfZ']) for o in new]);margin=clearance-radius
blocked=[{'id':o['id'],'clearance_m':float(margin[i])} for i,o in enumerate(new) if margin[i]<.46]
assert not blocked,blocked[:20]
report={'schema':1,'revision':'D08','placement_count':len(placements),'counts':data['counts'],'sample_preserved_count':len(original['placements']),'collider_count':len(collisions),'new_collider_road_minimum_margin_m':float(margin.min()),'maximum_anchor_height_delta_m':float(gap.max()),'native_and_glb_sha256_verified':True,'actual_navigation_and_visuals':'Separate Godot world-D08 graphical review; these data checks do not replace it','passed':True}
out=ROOT/'docs/world-final/evidence/D08-world';out.mkdir(parents=True,exist_ok=True);(out/'data-validation.json').write_text(json.dumps(report,indent=2)+'\n',encoding='utf-8')
print(json.dumps(report),flush=True)
