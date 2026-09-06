"""Prepare the approved CC0 environment; no Blender install is required for glTF.

Python 3.12, numpy, scipy, Pillow, fast-simplification 0.2.0.
Usage: python scripts/prepare-world-assets.py /path/to/varendor-source
Source geometry stays outside the repository. Source URLs and SHA-256 receipts
are retained in docs/assets/world-source-manifest.json before delivery.
"""
from pathlib import Path
import copy, hashlib, json, struct, sys
import numpy as np
from scipy.spatial import cKDTree
from PIL import Image
import fast_simplification

SOURCE = Path(sys.argv[1])
ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / 'public/assets/world'
OUTPUT.mkdir(parents=True, exist_ok=True)
REPORT = []

def accessor(g, data, i):
    a = g['accessors'][i]; view = g['bufferViews'][a['bufferView']]
    dtype = {5126:'<f4',5125:'<u4',5123:'<u2',5121:'u1'}[a['componentType']]
    width = {'VEC3':3,'VEC2':2,'SCALAR':1,'VEC4':4}[a['type']]
    if view.get('byteStride'):
        return np.ndarray((a['count'],width),dtype=dtype,buffer=data,
            offset=view.get('byteOffset',0)+a.get('byteOffset',0),strides=(view['byteStride'],np.dtype(dtype).itemsize)).copy()
    return np.frombuffer(data,dtype=dtype,count=a['count']*width,
        offset=view.get('byteOffset',0)+a.get('byteOffset',0)).reshape(-1,width)

def write_glb(path, g, binary):
    while len(binary)%4: binary += b'\0'
    g['buffers'] = [{'byteLength':len(binary)}]
    metadata = json.dumps(g,separators=(',',':')).encode()
    metadata += b' ' * (-len(metadata)%4)
    path.write_bytes(struct.pack('<III',0x46546C67,2,28+len(metadata)+len(binary))+
        struct.pack('<II',len(metadata),0x4E4F534A)+metadata+struct.pack('<II',len(binary),0x004E4942)+binary)

def prepare_model(name):
    src = SOURCE/name; original = json.loads((src/f'{name}_1k.gltf').read_text())
    data = np.memmap(src/original['buffers'][0]['uri'],mode='r',dtype='u1')
    dest = OUTPUT/name; dest.mkdir(exist_ok=True)
    # Re-encode source maps only; never synthesize a different artistic texture.
    image_uris = []
    for img in original.get('images',[]):
        filename = Path(img['uri']).name; texture = Image.open(src/img['uri'])
        texture.thumbnail((1024,1024))
        alpha = src/'textures'/filename.replace('_diff_', '_alpha_').replace('.jpg','.png')
        if '_diff_' in filename and alpha.exists():
            texture=texture.convert('RGBA');texture.putalpha(Image.open(alpha).convert('L').resize(texture.size))
            filename=filename.replace('.jpg','.png');texture.save(dest/filename,optimize=True)
        else:
            texture.convert('RGB').save(dest/filename,quality=88,optimize=True)
        image_uris.append(filename)
    for node_index,node in enumerate(original['nodes']):
        if 'mesh' not in node:continue
        mesh = original['meshes'][node['mesh']]
        for lod in range(2):
            g={k:copy.deepcopy(v) for k,v in original.items() if k not in ['accessors','bufferViews','buffers','nodes','scenes','meshes','animations','scene']}
            g.update(accessors=[],bufferViews=[],nodes=[{'mesh':0,'name':f'{name}_{node_index}_lod{lod}'}],scenes=[{'nodes':[0]}],scene=0,meshes=[{'primitives':[]}])
            for img,uri in zip(g.get('images',[]),image_uris):img['uri']=uri
            for material in g.get('materials',[]):
                material.pop('extensions',None)
                if material.get('name')=='pine_tree_01_twig':material.update(alphaMode='MASK',alphaCutoff=.35,doubleSided=True)
            binary=bytearray();total=0;original_total=0
            def add(values,kind,component=5126):
                while len(binary)%4:binary.extend(b'\0')
                values=np.asarray(values,dtype='<f4' if component==5126 else '<u4')
                view=len(g['bufferViews']);g['bufferViews'].append({'buffer':0,'byteOffset':len(binary),'byteLength':values.nbytes})
                binary.extend(values.tobytes());a={'bufferView':view,'componentType':component,'count':len(values),'type':kind}
                if kind=='VEC3':a.update(min=values.min(axis=0).tolist(),max=values.max(axis=0).tolist())
                idx=len(g['accessors']);g['accessors'].append(a);return idx
            for primitive in mesh['primitives']:
                pos=accessor(original,data,primitive['attributes']['POSITION']);faces=accessor(original,data,primitive['indices']).reshape(-1,3)
                count=len(faces);original_total+=count
                material=original['materials'][primitive['material']]['name']
                if name=='pine_tree_01':target=(18000 if 'twig' in material else 1800 if 'trunk' in material else 1000)//(1 if lod==0 else 4)
                elif name=='coastal_cliff_04':target=24000//(1 if lod==0 else 4)
                elif name=='rock_moss_set_01':target=2400//(1 if lod==0 else 4)
                elif name=='shrub_04':target=6000//(1 if lod==0 else 3)
                else:target=count//(1 if lod==0 else 2)
                target=max(24,min(target,count))
                cache=SOURCE/f'{name}_{node_index}_{primitive["material"]}_lod{lod}_simplified.npz'
                if target<count:
                    if cache.exists():cached=np.load(cache);p=cached['p'];f=cached['f'];nearest=cached['nearest']
                    else:
                        p,f=fast_simplification.simplify(pos,faces,target_count=target,agg=7)
                        _,nearest=cKDTree(pos).query(p,workers=2)
                        np.savez(cache,p=p,f=f,nearest=nearest)
                else:p=pos;f=faces;nearest=np.arange(len(pos))
                attrs={'POSITION':add(p,'VEC3')}
                for attr,kind in [('NORMAL','VEC3'),('TEXCOORD_0','VEC2')]:
                    if attr in primitive['attributes']:attrs[attr]=add(accessor(original,data,primitive['attributes'][attr])[nearest],kind)
                g['meshes'][0]['primitives'].append({'attributes':attrs,'indices':add(f.reshape(-1,1),'SCALAR',5125),'material':primitive['material']})
                total+=len(f)
            path=dest/f'{name}_{node_index}_lod{lod}.glb';write_glb(path,g,binary)
            record={'path':str(path.relative_to(ROOT/'public')),'triangles':total,'sourceTriangles':original_total,'bytes':path.stat().st_size,'sha256':hashlib.sha256(path.read_bytes()).hexdigest()}
            REPORT.append(record);print(path.name,total,'triangles',flush=True)

for name in ['fern_02','shrub_04','rock_moss_set_01','coastal_cliff_04','pine_tree_01']:prepare_model(name)
for name in ['forest_ground_04','brown_mud','mud_forest','roots','brown_mud_03']:
    dest=OUTPUT/name;dest.mkdir(exist_ok=True)
    for kind in ['diff','nor_gl','rough']:
        image=Image.open(SOURCE/name/f'{name}_{kind}_1k.jpg')
        image.save(dest/f'{kind}.jpg',quality=90,optimize=True)
    packed=Image.open(SOURCE/name/f'{name}_nor_gl_1k.jpg').convert('RGBA')
    packed.putalpha(Image.open(SOURCE/name/f'{name}_rough_1k.jpg').convert('L').resize(packed.size))
    packed.save(dest/'normal-roughness.png',optimize=True)
sky='kloppenheim_05_puresky';(OUTPUT/f'{sky}_1k.hdr').write_bytes((SOURCE/sky/f'{sky}_1k.hdr').read_bytes())
(OUTPUT/'prepared-assets.json').write_text(json.dumps(REPORT,indent=2)+'\n')
