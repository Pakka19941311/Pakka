"""Recover original trunk/limb topology; version derived assets separately."""
from pathlib import Path
import copy,json,struct,numpy as np
ROOT=Path(__file__).resolve().parents[2];SOURCE=ROOT/'art/world-final/nature-source/pine-wood'
OUT=ROOT/'art/world-final/nature-source/pine-D02';OUT.mkdir(parents=True,exist_ok=True)
original=json.loads((SOURCE/'pine_tree_01_1k.gltf').read_text())

def from_glb(path):
    raw=path.read_bytes();n=struct.unpack_from('<I',raw,12)[0]
    return json.loads(raw[20:20+n]),raw[28+n:]

def values(doc,binary,index):
    a=doc['accessors'][index];v=doc['bufferViews'][a['bufferView']]
    width={'SCALAR':1,'VEC2':2,'VEC3':3,'VEC4':4}[a['type']];dtype=np.dtype({5126:'<f4',5125:'<u4',5123:'<u2',5121:'u1'}[a['componentType']])
    array=np.ndarray((a['count'],width),dtype=dtype,buffer=binary,offset=v.get('byteOffset',0)+a.get('byteOffset',0),strides=(v.get('byteStride',width*dtype.itemsize),dtype.itemsize)).copy()
    return array.astype(np.float32)/np.iinfo(dtype).max if a.get('normalized') and dtype.kind in 'ui' else array

for variant in range(3):
    path=ROOT/f'public/assets/world/pine_tree_01/pine_tree_01_{variant}_lod0.glb'
    prepared,oldbin=from_glb(path);doc=copy.deepcopy(prepared)
    doc['accessors']=[];doc['bufferViews']=[];doc['meshes']=[{'name':f'Pine_{variant}_D02','primitives':[]}]
    doc['nodes']=[{'mesh':0,'name':f'Pine_{variant}_D02'}];binary=bytearray()
    def add(array,kind,component=5126):
        arr=np.asarray(array,dtype='<f4' if component==5126 else '<u4')
        binary.extend(b'\0'*(-len(binary)%4));idx=len(doc['bufferViews'])
        doc['bufferViews'].append({'buffer':0,'byteOffset':len(binary),'byteLength':arr.nbytes});binary.extend(arr.tobytes())
        a={'bufferView':idx,'componentType':component,'count':len(arr),'type':kind}
        if kind=='VEC3':a.update(min=arr.min(axis=0).tolist(),max=arr.max(axis=0).tolist())
        doc['accessors'].append(a);return len(doc['accessors'])-1
    for p in original['meshes'][variant]['primitives']:
        name=original['materials'][p['material']]['name'];mat=next(i for i,m in enumerate(doc['materials']) if m['name']==name)
        if name=='pine_tree_01_twig':
            old=next(p for p in prepared['meshes'][0]['primitives'] if prepared['materials'][p['material']]['name']==name)
            attributes={k:values(prepared,oldbin,i) for k,i in old['attributes'].items()}
            positions=attributes['POSITION'].reshape(-1,4,3);centers=positions.mean(axis=1,keepdims=True)
            # Existing cards enlarged each sprig; retain every stem, tighten its
            # geometry to the real branch silhouette, including all three planes.
            attributes['POSITION']=(centers+(positions-centers)*.70).reshape(-1,3)
            indices=values(prepared,oldbin,old['indices'])
        else:
            def original_values(index):
                a=original['accessors'][index];v=original['bufferViews'][a['bufferView']]
                local=copy.deepcopy(original);local['bufferViews'][a['bufferView']]['byteOffset']=0
                return values(local,(SOURCE/f'view-{a["bufferView"]:03}.bin').read_bytes(),index)
            attributes={k:original_values(i) for k,i in p['attributes'].items()};indices=original_values(p['indices'])
        primitive={'material':mat,'attributes':{k:add(a,'VEC2' if k.startswith('TEXCOORD') else ('VEC4' if a.shape[1]==4 else 'VEC3')) for k,a in attributes.items()},'indices':add(indices,'SCALAR',5125)}
        doc['meshes'][0]['primitives'].append(primitive)
    for image in doc['images']:
        uri=image.pop('uri');raw=(path.parent/uri).read_bytes();binary.extend(b'\0'*(-len(binary)%4))
        image['bufferView']=len(doc['bufferViews']);doc['bufferViews'].append({'buffer':0,'byteOffset':len(binary),'byteLength':len(raw)});binary.extend(raw)
    binary.extend(b'\0'*(-len(binary)%4));doc['buffers']=[{'byteLength':len(binary)}]
    js=json.dumps(doc,separators=(',',':')).encode();js+=b' '*(-len(js)%4)
    target=OUT/f'pine_{variant}_restored.glb'
    if target.exists():raise RuntimeError('Refuse to overwrite authored source')
    target.write_bytes(struct.pack('<III',0x46546c67,2,28+len(js)+len(binary))+struct.pack('<II',len(js),0x4e4f534a)+js+struct.pack('<II',len(binary),0x004e4942)+binary)
    print(target.name,len(binary),flush=True)
