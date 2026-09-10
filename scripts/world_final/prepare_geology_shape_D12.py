"""A separate D12 geological shape candidate. Never replaces B/D11 inputs.

Authored ridgelines and radial erosion replace the smooth summit silhouettes;
road corridors, architectural platforms and the rest of the world stay exact.
"""
from pathlib import Path
import json,hashlib
import numpy as np
from build_geography import smooth,segment_field,polygon_field,sample_grid
ROOT=Path(__file__).resolve().parents[2];OUT=ROOT/'godot-pc/world-final/geology-D12'
if (OUT/'heightmap.f32').exists():raise RuntimeError('Preserve the reviewed terrain candidate; version further edits')
OUT.mkdir(parents=True,exist_ok=True)
layout=json.loads((ROOT/'godot-pc/world-final/world_layout.json').read_text())
source=np.load(ROOT/'godot-pc/world-final/geography/terrain-data.npz')
old=source['heights'];x,z=np.meshgrid(np.arange(-800,801,2,dtype=float),np.arange(-700,701,2,dtype=float))
rng=np.random.default_rng(12092026)
def noise(scale,seed):
    # Value noise has no repeated diagonal stripes. A distinct fixed lattice
    # per octave keeps the resulting height field reproducible and editable.
    random=np.random.default_rng(seed);lattice=random.uniform(-1,1,(96,96))
    u=(x+920)/scale;v=(z+810)/scale;ix=np.floor(u).astype(int);iz=np.floor(v).astype(int)
    fu=smooth(u-ix);fv=smooth(v-iz)
    return (lattice[iz,ix]*(1-fu)+lattice[iz,ix+1]*fu)*(1-fv)+(lattice[iz+1,ix]*(1-fu)+lattice[iz+1,ix+1]*fu)*fv
n64=noise(64,12);n28=noise(28,28);n20=noise(20,20)
warp_x=x+n64*8;warp_z=z+noise(64,31)*9
road=np.full(x.shape,1e6)
for r in layout['roads']:
    dist,_=segment_field(x,z,r['points_xyz']);road=np.minimum(road,dist-r['width']/2)
lock=smooth((road-5)/15)
for p in layout['platforms']:
    d=np.maximum(abs(x-p['x'])-p['size'][0]/2,abs(z-p['z'])-p['size'][1]/2)
    lock*=smooth((d-4)/18)
snow_poly=next(l['outline_xz'] for l in layout['locations'] if l['id']=='L04')
snow_mask=smooth(-polygon_field(x,z,snow_poly)/45)
snow_mask*=smooth((old-100)/65)
# Each arm has an explicit summit-to-foothill profile. Their maximum creates
# connected knife-edge watersheds and broad gullies instead of round mounds.
ridges=[
    [[-782,259,-674],[-694,357,-615],[-604,310,-571],[-536,329,-604],[-444,359,-622],[-343,240,-674]],
    [[-694,357,-615],[-728,275,-531],[-751,194,-436],[-730,140,-330]],
    [[-604,310,-571],[-632,260,-485],[-590,214,-400],[-542,161,-313]],
    [[-444,359,-622],[-392,279,-548],[-393,220,-461],[-346,153,-366]],
    [[-536,329,-604],[-496,282,-561],[-453,230,-505],[-450,186,-417]],
]
snow_shape=np.array(old,dtype=float)*.35+58
for index,ridge in enumerate(ridges):
    distance,elevation=segment_field(warp_x,warp_z,ridge)
    descent=(.93 if index==0 else .79)*distance+.0009*distance**2
    snow_shape=np.maximum(snow_shape,elevation-descent)
erosion=(n28*3.0+n20*1.25)*(1-smooth((snow_shape-334)/25))
snow_shape+=erosion
vx=warp_x-545;vz=(warp_z+490)*1.12;radius=np.hypot(vx,vz);angle=np.arctan2(vz,vx)
radius+=7*np.sin(angle*5+1.1)+4*np.sin(angle*11-.4)
outer=52+249*np.clip(1-(np.maximum(radius-171,0)/220),0,1)**1.35
inner=216+85*smooth((radius-83)/91)
volcano_shape=np.minimum(outer,inner)
# Channels follow the fall line, vary in depth and end before the arena.
gully=(np.abs(np.sin(angle*10.5+n64*.52))**7)*(8+5*n28)
volcano_shape-=gully*smooth((radius-98)/45)*(1-smooth((radius-325)/65))
volcano_shape+=n28*4*smooth((radius-100)/35)+n20*1.0
volcano_mask=smooth((386-radius)/65)
volcano_mask*=smooth((old-72)/55)
h=np.array(old,dtype=float)
h=h*(1-snow_mask*lock)+snow_shape*snow_mask*lock
h=h*(1-volcano_mask*lock)+volcano_shape*volcano_mask*lock
h=h.astype('<f4')
assert np.isfinite(h).all()
route_differences=[]
for r in layout['roads']:
    errors=[]
    for a,b in zip(r['points_xyz'],r['points_xyz'][1:]):
        t=np.linspace(0,1,max(2,int(np.hypot(b[0]-a[0],b[2]-a[2])*4)))
        px=a[0]+(b[0]-a[0])*t;pz=a[2]+(b[2]-a[2])*t
        errors.extend(abs(sample_grid(h,px,pz)-sample_grid(old,px,pz)).tolist())
    route_differences.append({'id':r['id'],'max_height_change_m':max(errors)})
assert max(r['max_height_change_m'] for r in route_differences)==0
colors=source['colors'].copy()
colors[...,1]=smooth((h-172)/60)*smooth((-x+180)/320)*smooth((-z+160)/230)
np.savez_compressed(OUT/'terrain-data.npz',heights=h,colors=colors)
h.tofile(OUT/'heightmap.f32')
meta=json.loads((ROOT/'godot-pc/world-final/geography/terrain.json').read_text())
meta.update(heights='heightmap.f32',height_sha256=hashlib.sha256(h.tobytes()).hexdigest(),status='D12 shape candidate; not promoted; retained vegetation must be reseated before world integration')
changed=[]
for cell in meta['chunks']:
    row,col,rows,cols=cell['row'],cell['col'],cell['rows'],cell['columns']
    if np.array_equal(h[row:row+rows+1,col:col+cols+1],old[row:row+rows+1,col:col+cols+1]):continue
    changed.append(cell['id'])
meta['changed_cells']=changed
(OUT/'terrain.json').write_text(json.dumps(meta,indent=2)+'\n',encoding='utf-8')
report={'revision':'D12-shape-01','promoted':False,'source_height_sha256':hashlib.sha256(old.tobytes()).hexdigest(),'candidate_height_sha256':meta['height_sha256'],
    'changed_cells':changed,'height_delta_range_m':[float((h-old).min()),float((h-old).max())],
    'candidate_height_range_m':[float(h.min()),float(h.max())],'roads_unchanged':True,'road_measurements':route_differences,
    'native_source_pending':True,'visual_review_pending':True,'vegetation_reseat_pending':True,'ridge_control_points':ridges}
(ROOT/'docs/world-final/geology-shape-D12.json').write_text(json.dumps(report,indent=2)+'\n',encoding='utf-8')
print('D12_GEOLOGY_SHAPE '+json.dumps({k:v for k,v in report.items() if k not in ('road_measurements','ridge_control_points','changed_cells')}),flush=True)
