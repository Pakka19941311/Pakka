"""Enable mipmaps on GLB-extracted city textures after the first editor import."""
from pathlib import Path
import json,re
root=Path(__file__).resolve().parents[2]/'godot-pc/world-final/castle'
changed=[];checked=0
for path in sorted(root.glob('courtyard*.import')):
 if path.suffixes[-2].lower() not in ('.jpg','.jpeg','.png','.webp'):continue
 text=path.read_text(encoding='utf-8');checked+=1
 if 'mipmaps/generate=false' in text:
  path.write_text(text.replace('mipmaps/generate=false','mipmaps/generate=true'),encoding='utf-8');changed.append(path.name)
print(json.dumps({'checked':checked,'changed':len(changed),'profiles':changed}))
