"""Relax D12 earthwork joins while keeping every approved road height exact."""
from pathlib import Path
import json,hashlib
import numpy as np
from build_geography import smooth,segment_field,sample_grid
ROOT=Path(__file__).resolve().parents[2];OUT=ROOT/'godot-pc/world-final/geology-D13'
if (OUT/'heightmap.f32').exists():raise RuntimeError('Preserve the terrain candidate; version later edits')
OUT.mkdir(parents=True,exist_ok=True)
source=np.load(ROOT/'godot-pc/world-final/geography/terrain-data.npz');old=source['heights']
candidate=np.load(ROOT/'godot-pc/world-final/geology-D12/terrain-data.npz')['heights']
layout=json.loads((ROOT/'godot-pc/world-final/world_layout.json').read_text())
x,z=np.meshgrid(np.arange(-800,801,2),np.arange(-700,701,2))
road=np.full(old.shape,1e6)
for r in layout['roads']:
    dist,_=segment_field(x,z,r['points_xyz']);road=np.minimum(road,dist-r['width']/2)
# At least 42 m of additional falloff removes the narrow ridges immediately
# alongside switchbacks. This edits terrain only, never the walking spline.
weight=smooth((road-5)/42)
delta=(candidate-old)*weight
# A screened relaxation softens the secondary ridges. The unmodified world
# and road strips are fixed boundaries; no cyclic wrapping across map edges.
active=abs(candidate-old)>0.00001
target=delta.copy();free=active & (road>5)
for _ in range(100):
    p=np.pad(delta,1,mode='edge')
    average=(p[1:-1,:-2]+p[1:-1,2:]+p[:-2,1:-1]+p[2:,1:-1])*.25
    delta=np.where(free,(average+.014*target)/1.014,0)
h=(old+delta).astype('<f4')
measurements=[]
for r in layout['roads']:
    errors=[]
    for a,b in zip(r['points_xyz'],r['points_xyz'][1:]):
        t=np.linspace(0,1,max(2,int(np.hypot(b[0]-a[0],b[2]-a[2])*4)))
        px=a[0]+(b[0]-a[0])*t;pz=a[2]+(b[2]-a[2])*t
        errors.extend(abs(sample_grid(h,px,pz)-sample_grid(old,px,pz)).tolist())
    measurements.append(dict(id=r['id'],max_height_change_m=max(errors)))
assert max(r['max_height_change_m'] for r in measurements)==0
colors=source['colors'].copy()
colors[...,1]=smooth((h-155)/64)*smooth((-x+180)/320)*smooth((-z+160)/230)
np.savez_compressed(OUT/'terrain-data.npz',heights=h,colors=colors);h.tofile(OUT/'heightmap.f32')
meta=json.loads((ROOT/'godot-pc/world-final/geography/terrain.json').read_text())
changed=[]
for c in meta['chunks']:
    rr,cc,nz,nx=c['row'],c['col'],c['rows'],c['columns']
    if not np.array_equal(h[rr:rr+nz+1,cc:cc+nx+1],old[rr:rr+nz+1,cc:cc+nx+1]):changed.append(c['id'])
meta.update(height_sha256=hashlib.sha256(h.tobytes()).hexdigest(),min_height=float(h.min()),max_height=float(h.max()),changed_cells=changed,status='D13 relaxed ridge candidate; main game and D11 nature unmodified')
(OUT/'terrain.json').write_text(json.dumps(meta,indent=2)+'\n')
(OUT/'.gitignore').write_text('*.f32\n*.npz\n*.glb\nchunks/\n*.import\n')
report=dict(revision='D13',promoted=False,height_sha256=meta['height_sha256'],road_measurements=measurements,roads_unchanged=True,changed_cells=changed,road_falloff_m=42,relaxation_iterations=100,height_range_m=[float(h.min()),float(h.max())],native_source_pending=True,visual_review_pending=True,vegetation_reseat_pending=True)
(ROOT/'docs/world-final/geology-shape-D13.json').write_text(json.dumps(report,indent=2)+'\n')
print(json.dumps({k:v for k,v in report.items() if k not in ('road_measurements','changed_cells')}),flush=True)
