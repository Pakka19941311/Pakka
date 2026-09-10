"""Persist a high-resolution trail/material mask and referenced existing textures."""
from pathlib import Path
import hashlib,json,shutil
import numpy as np
from PIL import Image
from build_geography import segment_field,polygon_field,sample_grid
ROOT=Path(__file__).resolve().parents[2];OUT=ROOT/'godot-pc/world-final/nature';(OUT/'textures').mkdir(exist_ok=True)
layout=json.loads((ROOT/'godot-pc/world-final/world_layout.json').read_text('utf-8'));sample=json.loads((OUT/'sample-D01.json').read_text('utf-8'))
x0,z0,x1,z1=sample['bounds_xz'];size=680
x,z=np.meshgrid(np.linspace(x0,x1,size),np.linspace(z0,z1,size));dist=np.full(x.shape,1e6)
for road in layout['roads']:
    d,_=segment_field(x,z,road['points_xyz']);dist=np.minimum(dist,d-float(road['width'])/2)
road=np.clip((.45-dist)/.9,0,1);forest=np.ones(x.shape)
for mask in layout['masks']:
    if mask['kind']=='clearing':forest=np.minimum(forest,np.clip(polygon_field(x,z,mask['polygon'])/3,0,1))
heights=np.fromfile(ROOT/'godot-pc/world-final/geography/heightmap.f32',dtype='<f4').reshape(701,801)
h=sample_grid(heights,x,z);hz,hx=np.gradient(h,(z1-z0)/(size-1),(x1-x0)/(size-1));rock=np.clip((np.hypot(hx,hz)-.4)/.65,0,1)
mask=np.stack([road,forest,rock,np.ones(x.shape)],axis=-1);Image.fromarray(np.uint8(mask*255)).save(OUT/'ground-sample-D01.png')
sources=[('forest_diff.jpg','public/assets/world/forest_ground_04/diff.jpg'),('forest_normal.jpg','public/assets/world/forest_ground_04/nor_gl.jpg'),('trail_diff.jpg','public/assets/world/brown_mud/diff.jpg'),('trail_normal.jpg','public/assets/world/brown_mud/nor_gl.jpg'),('rock_diff.jpg','art/world-final/materials/rock_wall_02/rock_wall_02_diff_1k.jpg'),('rock_normal.jpg','art/world-final/materials/rock_wall_02/rock_wall_02_nor_gl_1k.jpg')]
receipts=[]
for name,source in sources:
    origin=ROOT/source;target=OUT/'textures'/name;shutil.copy2(origin,target)
    receipts.append({'path':target.relative_to(ROOT).as_posix(),'source':source,'sha256':hashlib.sha256(target.read_bytes()).hexdigest(),'license':'CC0-1.0'})
(OUT/'ground-sample-D01.json').write_text(json.dumps({'bounds_xz':sample['bounds_xz'],'mask':'ground-sample-D01.png','mask_size':[size,size],'channels':['trail','forest','slope_rock','one'],'textures':receipts,'source_manifest':'docs/assets/world-source-manifest.json'},indent=2)+'\n',encoding='utf-8',newline='\n')
print(json.dumps({'mask_size':size,'texel_metres':(x1-x0)/(size-1),'textures':len(receipts)}))
