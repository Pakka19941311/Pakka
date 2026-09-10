"""Enable mip chains for world shader textures, keeping original image bytes."""
from pathlib import Path
import hashlib,json,re
ROOT=Path(__file__).resolve().parents[2]
WORLD=ROOT/'godot-pc/world-final'
paths=list((WORLD/'nature/textures').glob('*.jpg'))+list((WORLD/'materials').glob('*.jpg'))
for pattern in ['*_D07.png','*_D07_vectors.png','*_D09.png','*_D09_vectors.png']:
    paths.extend((WORLD/'nature/impostors').glob(pattern))
report=[]
for image in sorted(set(paths)):
    digest=hashlib.sha256(image.read_bytes()).hexdigest()
    settings=Path(str(image)+'.import')
    text=settings.read_text('utf-8') if settings.exists() else '[remap]\n\nimporter="texture"\ntype="CompressedTexture2D"\n\n[params]\n\nmipmaps/generate=false\n'
    before=re.search(r'^mipmaps/generate=(true|false)$',text,re.M)
    if not before:raise RuntimeError('Unexpected texture profile '+str(settings))
    changed=before.group(1)=='false'
    text=re.sub(r'^mipmaps/generate=(true|false)$','mipmaps/generate=true',text,flags=re.M)
    if changed:settings.write_text(text,encoding='utf-8')
    assert hashlib.sha256(image.read_bytes()).hexdigest()==digest
    report.append({'texture':image.relative_to(ROOT).as_posix(),'sha256':digest,'previous_generate':before.group(1)=='true','generate':True,'profile':settings.relative_to(ROOT).as_posix()})
mesh_profiles=[]
for mesh in sorted((WORLD/'nature/assets').glob('pine_D03_*_lod*.glb')):
    settings=Path(str(mesh)+'.import')
    text=settings.read_text('utf-8') if settings.exists() else '[remap]\nimporter="scene"\nimporter_version=1\ntype="PackedScene"\n\n[params]\nmeshes/generate_lods=true\n'
    before=re.search(r'^meshes/generate_lods=(true|false)$',text,re.M)
    if not before:raise RuntimeError('Unexpected mesh profile '+str(settings))
    text=re.sub(r'^meshes/generate_lods=(true|false)$','meshes/generate_lods=false',text,flags=re.M)
    if before.group(1)=='true':settings.write_text(text,encoding='utf-8')
    mesh_profiles.append({'mesh':mesh.relative_to(ROOT).as_posix(),'profile':settings.relative_to(ROOT).as_posix(),'previous_generate_lods':before.group(1)=='true','generate_lods':False,'reason':'Already authored LOD0/LOD1; additional generic simplification deletes thin disconnected needle cards.'})
out=ROOT/'qa-artifacts/world-final/surface-import-profiles-D10.json'
if out.exists():out=ROOT/'qa-artifacts/world-final/surface-import-profiles-D10-mesh.json'
out.write_text(json.dumps({'changed':sum(not p['previous_generate'] for p in report),'profiles':report,'mesh_profiles':mesh_profiles,'original_images_changed':False},indent=2)+'\n')
print(json.dumps({'profiles':len(report),'changed':sum(not p['previous_generate'] for p in report),'mesh_profiles':len(mesh_profiles)}))
