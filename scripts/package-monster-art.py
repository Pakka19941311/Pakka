"""Release actual editable Blender files, textures and original approved sources."""
import json,sys,zipfile,hashlib
from pathlib import Path
root=Path(__file__).resolve().parents[1];out=Path(sys.argv[1]).resolve();out.mkdir(parents=True,exist_ok=True);target=out/'Varendor_Monsters_v3.zip';art=root/'art/monsters-v3'
lock=json.loads((art/'source-lock.json').read_text(encoding='utf8'))
files=[art/'source-lock.json',art/'README_RU.md',art/'sources'/lock['archive']['file']]
for name in [m['name'] for m in lock['models']]:
 report=json.loads((art/'runtime'/(name+'.json')).read_text(encoding='utf8'))
 for kind,ext in [('editable','.blend'),('runtime','.glb')]:
  p=art/kind/(name+ext)
  with p.open('rb') as f:assert hashlib.file_digest(f,'sha256').hexdigest()==report[kind]['sha256'],str(p)
  assert p.stat().st_size==report[kind]['bytes'],str(p)
 files.extend([art/'editable'/(name+'.blend'),art/'runtime'/(name+'.glb'),art/'runtime'/(name+'.json')])
files.extend(p for p in (art/'editable/textures').rglob('*.png'))
files.extend([art/'forest/ForestLord.blend',art/'forest/ForestLord.glb',art/'forest/build.json',art/'forest/source-lock.json',art/'forest/README_RU.md'])
forest_source=root/'qa-artifacts/monster-sources/forest-monster.7z'
pin=json.loads((art/'forest/source-lock.json').read_text(encoding='utf8'))
with forest_source.open('rb') as source:assert hashlib.file_digest(source,'sha256').hexdigest()==pin['sha256']
assert forest_source.stat().st_size==pin['bytes']
with zipfile.ZipFile(target,'w',zipfile.ZIP_DEFLATED,compresslevel=6,allowZip64=True) as z:
 for p in files:
  if not p.is_file():raise FileNotFoundError(p)
  z.write(p,p.relative_to(art).as_posix())
 for p in (root/'public/assets/licenses').glob('*monsters*v3*'):z.write(p,'licenses/'+p.name)
 z.write(root/'public/assets/licenses/forest-monster-v3.txt','licenses/forest-monster-v3.txt')
 z.write(forest_source,'sources/forest-monster.7z')
with zipfile.ZipFile(target) as z:assert z.testzip()is None
with target.open('rb') as f:sha=hashlib.file_digest(f,'sha256').hexdigest()
(out/'monster-art.json').write_text(json.dumps({'sourceCommit':__import__('os').environ.get('GITHUB_SHA'),'file':target.name,'bytes':target.stat().st_size,'sha256':sha,'editableModels':10,'originalSketchfabSourceArchiveIncluded':True,'files':[p.relative_to(art).as_posix() for p in files]},indent=2),encoding='utf8');print(target,sha)
