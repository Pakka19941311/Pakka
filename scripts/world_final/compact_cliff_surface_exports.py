"""Remove redundant embedded pictures from fitted cliff runtime GLBs.

The shared Godot terrain shader supplies those surfaces. Every vertex, normal,
UV, index and node transform remains byte-identical to the native export.
Original exports are preserved in QA before moving out of the import tree.
"""
from pathlib import Path
import json,struct,hashlib,shutil
ROOT=Path(__file__).resolve().parents[2];OUT=ROOT/'godot-pc/world-final/nature'
data=json.loads((OUT/'groundcover-authored-D11.json').read_text())
backup=ROOT/'qa-artifacts/world-final/D11-source-exports'
backup.mkdir(parents=True,exist_ok=False)
records=[]
for entry in data['cliff_meshes']:
    source=OUT/entry['path'];b=source.read_bytes()
    assert hashlib.sha256(b).hexdigest()==entry['sha256']
    length=struct.unpack_from('<I',b,12)[0];d=json.loads(b[20:20+length]);binary=b[28+length:]
    image_views={image['bufferView'] for image in d['images']}
    referenced={accessor['bufferView'] for accessor in d['accessors']}
    assert not referenced&image_views and not d.get('extensionsRequired')
    assert referenced==set(range(len(referenced))) and min(image_views)==len(referenced)
    views=d['bufferViews'][:len(referenced)];end=max(v.get('byteOffset',0)+v['byteLength'] for v in views)
    geometry=binary[:end];geometry+=b'\x00'*((-len(geometry))%4)
    for name in ['images','textures','samplers']:d.pop(name,None)
    d['materials']=[{'name':'D11_Shared_Terrain_Shader_Required','pbrMetallicRoughness':{'baseColorFactor':[.4,.4,.4,1],'metallicFactor':0,'roughnessFactor':.9}}]
    for mesh in d['meshes']:
        for primitive in mesh['primitives']:primitive['material']=0
    d['bufferViews']=views;d['buffers']=[{'byteLength':len(geometry)}]
    encoded=json.dumps(d,separators=(',',':')).encode();encoded+=b' '*((-len(encoded))%4)
    output=struct.pack('<III',0x46546c67,2,28+len(encoded)+len(geometry))+struct.pack('<II',len(encoded),0x4e4f534a)+encoded+struct.pack('<II',len(geometry),0x004e4942)+geometry
    target=source.with_name(source.stem+'_surface.glb')
    if target.exists():raise RuntimeError('Preserve compacted export revision')
    target.write_bytes(output)
    # Compare each accessor buffer view, not only the total file size.
    for view in views:
        start=view.get('byteOffset',0);stop=start+view['byteLength'];assert geometry[start:stop]==binary[start:stop]
    original_sha=hashlib.sha256(b).hexdigest();saved=backup/source.name;shutil.copy2(source,saved)
    assert hashlib.sha256(saved.read_bytes()).hexdigest()==original_sha
    records.append({'original':source.relative_to(ROOT).as_posix(),'original_sha256':original_sha,'runtime':target.relative_to(ROOT).as_posix(),
        'runtime_sha256':hashlib.sha256(output).hexdigest(),'original_bytes':len(b),'runtime_bytes':len(output),'accessor_bytes_unchanged':True})
    entry.update(path=target.relative_to(OUT).as_posix(),sha256=records[-1]['runtime_sha256'])
manifest={'reason':'One shared shader material instead of 453 redundant extracted cliff images','native_geometry_changed':False,'entries':records}
(backup/'manifest.json').write_text(json.dumps(manifest,indent=2)+'\n',encoding='utf-8')
(ROOT/'docs/world-final/cliff-runtime-exports-D11.json').write_text(json.dumps(manifest,indent=2)+'\n',encoding='utf-8')
(OUT/'groundcover-authored-D11.json').write_text(json.dumps(data,separators=(',',':'))+'\n',encoding='utf-8')
print(json.dumps({'cliffs':len(records),'before_bytes':sum(r['original_bytes'] for r in records),'after_bytes':sum(r['runtime_bytes'] for r in records),'all_accessor_bytes_unchanged':True}),flush=True)
