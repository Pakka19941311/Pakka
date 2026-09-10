"""Persist the current ridge paint and unchanged, licensed tileable rock maps."""
from pathlib import Path
import json,hashlib,shutil
import numpy as np
from PIL import Image
ROOT=Path(__file__).resolve().parents[2]
OUT=ROOT/'godot-pc/world-final/materials'
mask=OUT/'biomes-D12.png'
if mask.exists():raise RuntimeError('Preserve the authored mask; version new paint')
data=np.load(ROOT/'godot-pc/world-final/geology-D12/terrain-data.npz')
Image.fromarray(np.rint(np.clip(data['colors'],0,1)*255).astype('uint8')).save(mask)
entries=[]
for name,suffix in [('diff','diff'),('normal','nor_gl'),('rough','rough')]:
    source=ROOT/f'art/world-final/materials/rock_wall_02/rock_wall_02_{suffix}_1k.jpg'
    target=OUT/f'rock_{name}-D12.jpg'
    if target.exists():raise RuntimeError('Preserve existing texture '+str(target))
    shutil.copy2(source,target)
    digest=hashlib.sha256(source.read_bytes()).hexdigest()
    assert hashlib.sha256(target.read_bytes()).hexdigest()==digest
    entries.append(dict(source=source.relative_to(ROOT).as_posix(),target=target.relative_to(ROOT).as_posix(),sha256=digest))
(ROOT/'docs/world-final/geology-material-D12.json').write_text(json.dumps(dict(revision='D12',source_license='art/world-final/materials/rock_wall_02/source.json',files=entries,coastal_atlas_used_on_terrain=False,mask='godot-pc/world-final/materials/biomes-D12.png',native_material_pending=True),indent=2)+'\n')
