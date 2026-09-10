"""Persist measured terrain paint masks and verified copies of licensed textures."""
from pathlib import Path
import hashlib,json,shutil
import numpy as np
from PIL import Image

ROOT=Path(__file__).resolve().parents[2]
OUT=ROOT/'godot-pc/world-final/materials';OUT.mkdir(exist_ok=True)
target=OUT/'biomes-D10.png'
if target.exists():raise RuntimeError('Preserve authored paint mask; choose a new revision')
data=np.load(ROOT/'godot-pc/world-final/geography/terrain-data.npz')
Image.fromarray(np.rint(np.clip(data['colors'],0,1)*255).astype('uint8')).save(target)
sources={
 'cliff_diff.jpg':'public/assets/world/coastal_cliff_04/coastal_cliff_04_diff_1k.jpg',
 'cliff_normal.jpg':'public/assets/world/coastal_cliff_04/coastal_cliff_04_nor_gl_1k.jpg',
 'cliff_arm.jpg':'public/assets/world/coastal_cliff_04/coastal_cliff_04_arm_1k.jpg',
 'snow_diff.jpg':'art/world-final/materials/snow_02/snow_02_diff_1k.jpg',
 'snow_normal.jpg':'art/world-final/materials/snow_02/snow_02_nor_gl_1k.jpg',
 'snow_rough.jpg':'art/world-final/materials/snow_02/snow_02_rough_1k.jpg',
}
entries=[]
for name,relative in sources.items():
 source=ROOT/relative;destination=OUT/name;digest=hashlib.sha256(source.read_bytes()).hexdigest()
 if destination.exists() and hashlib.sha256(destination.read_bytes()).hexdigest()!=digest:raise RuntimeError('Preserve manual texture '+name)
 shutil.copy2(source,destination)
 assert hashlib.sha256(destination.read_bytes()).hexdigest()==digest
 entries.append({'path':destination.relative_to(ROOT).as_posix(),'source':relative,'sha256':digest,'bytes':destination.stat().st_size})
(OUT/'surface-D10.json').write_text(json.dumps({'revision':'D10','mask':target.name,'channels':['road','snow','ash','wet'],'mask_dimensions':[801,701],'world_bounds_xz':[-800,-700,800,700],'geometry_changed':False,'files':entries,'source_licenses':['docs/assets/world-source-manifest.json','art/world-final/materials/snow_02/source.json'],'native_material_pending':True},indent=2)+'\n',encoding='utf-8')
print(json.dumps({'copied_maps':len(entries),'mask_shape':list(data['colors'].shape)}))
