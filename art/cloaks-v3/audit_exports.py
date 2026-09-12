"""Read the delivered GLBs, validate skin weights and distinct actual geometry."""
import hashlib, json, struct, sys
from pathlib import Path
ROOT=Path(__file__).resolve().parents[2]
FOLDER=ROOT/'art/cloaks-v3/staging' if '--staging' in sys.argv else ROOT/'godot-pc/assets/cloaks-v3'

def read_glb(path):
    raw=path.read_bytes(); magic,version,length=struct.unpack_from('<III',raw)
    assert magic==0x46546c67 and version==2 and length==len(raw),path
    n,kind=struct.unpack_from('<II',raw,12); assert kind==0x4e4f534a
    doc=json.loads(raw[20:20+n]);start=20+n;n,kind=struct.unpack_from('<II',raw,start)
    assert kind==0x004e4942
    return doc,raw[start+8:start+8+n],raw

def accessor(doc,data,index):
    a=doc['accessors'][index];view=doc['bufferViews'][a['bufferView']]
    sizes={'SCALAR':1,'VEC2':2,'VEC3':3,'VEC4':4,'MAT4':16}
    fmt={5121:'B',5123:'H',5125:'I',5126:'f'}[a['componentType']]; count=sizes[a['type']]
    stride=view.get('byteStride',struct.calcsize(fmt)*count);offset=view.get('byteOffset',0)+a.get('byteOffset',0)
    return [struct.unpack_from('<'+fmt*count,data,offset+i*stride) for i in range(a['count'])]

reports=[];geometry_hashes=[]
for item in ['defense','captain','sky']:
    path=FOLDER/('cloak_'+item+'.glb');doc,data,raw=read_glb(path)
    assert len(doc['meshes'])==1 and len(doc['skins'])==1
    skin=doc['skins'][0];names=[doc['nodes'][j]['name'] for j in skin['joints']]
    assert set(names)=={'cloak_root','cloak_01','cloak_02','cloak_03'},names
    assert len(accessor(doc,data,skin['inverseBindMatrices']))==4
    geometry=hashlib.sha256(); vertices=0;triangles=0; max_error=0;joint_mass=[0.0]*4
    for primitive in doc['meshes'][0]['primitives']:
        attrs=primitive['attributes'];positions=accessor(doc,data,attrs['POSITION']);joints=accessor(doc,data,attrs['JOINTS_0']);weights=accessor(doc,data,attrs['WEIGHTS_0'])
        assert len(positions)==len(joints)==len(weights)
        for p,j,w in zip(positions,joints,weights):
            assert all(0<=v<4 for v in j) and all(0<=v<=1 for v in w)
            error=abs(sum(w)-1);max_error=max(max_error,error);assert error<.00001
            geometry.update(struct.pack('<3f',*p))
            for bone,weight in zip(j,w): joint_mass[bone]+=weight
        vertices+=len(positions);triangles+=len(accessor(doc,data,primitive['indices']))//3
    assert triangles<9000
    assert all(mass>0 for mass in joint_mass),'Every lower cloth bone must actually influence vertices'
    assert doc.get('images') and all('bufferView' in image and 'uri' not in image for image in doc['images'])
    assert not doc.get('animations') # Avatar controller is the only pose/time owner.
    geometry_hashes.append(geometry.hexdigest())
    reports.append({'item':'cloak_'+item,'sha256':hashlib.sha256(raw).hexdigest(),'geometrySha256':geometry.hexdigest(),'bytes':len(raw),'triangles':triangles,'verticesWithSeams':vertices,'surfaces':len(doc['meshes'][0]['primitives']),'bones':names,'maximumWeightSumError':max_error,'embeddedImages':len(doc['images'])})
assert len(set(geometry_hashes))==3,'A recolor cannot count as another cloak construction'
out=ROOT/'art/cloaks-v3/export-audit.json'
out.write_text(json.dumps({'result':'PASS','source':str(FOLDER.relative_to(ROOT)),'assets':reports},indent=2)+'\n')
print(json.dumps({'result':'PASS','assets':3,'distinctGeometries':3,'triangles':[r['triangles'] for r in reports]}))
