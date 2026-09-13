"""Bounded D13 corner slopes for the accepted Greenfall fortress footprint.
Default output is an isolated candidate. --apply requires an agreed production freeze.
The city interior, road corridors, other eleven zones, lake and river are unchanged.
"""
from pathlib import Path
import sys,json,struct,hashlib,zipfile,io
import numpy as np
ROOT=Path(__file__).resolve().parents[4];ART=ROOT/'art/city-fortress-v3';SOURCE=ROOT/'godot-pc/world-final/geology-D13'
OUT=ROOT/'work/qa/fortress-v3/candidate/hill';OUT.mkdir(parents=True,exist_ok=True)
CACHE=ART/'terrain-baseline.zip'
def read_baseline(name):
 if CACHE.exists():
  with zipfile.ZipFile(CACHE) as z:
   if name in z.namelist():return z.read(name)
 b=(SOURCE/name).read_bytes()
 with zipfile.ZipFile(CACHE,'a',compression=zipfile.ZIP_DEFLATED,compresslevel=6) as z:z.writestr(name,b)
 return b
sha=lambda b:hashlib.sha256(b).hexdigest()
def smooth(v):v=np.clip(v,0,1);return v*v*(3-2*v)
def segment_gap(x,z,a,b):
 dx,dz=b[0]-a[0],b[1]-a[1];t=np.clip(((x-a[0])*dx+(z-a[1])*dz)/(dx*dx+dz*dz or 1),0,1)
 return np.hypot(x-a[0]-t*dx,z-a[1]-t*dz)
def field(x,z,poly):
 inside=np.zeros(x.shape,dtype=bool);distance=np.full(x.shape,np.inf)
 for a,b in zip(poly,poly[1:]+poly[:1]):
  if b[1]!=a[1]:inside^=((a[1]>z)!=(b[1]>z))&(x<(b[0]-a[0])*(z-a[1])/(b[1]-a[1])+a[0])
  distance=np.minimum(distance,segment_gap(x,z,a,b))
 return np.where(inside,-distance,distance)
class GLB:
 def __init__(self,b):
  size=struct.unpack_from('<I',b,12)[0];self.doc=json.loads(b[20:20+size]);self.bin=bytearray(b[28+size:])
 def array(self,index):
  a=self.doc['accessors'][index];v=self.doc['bufferViews'][a['bufferView']];cols={'VEC3':3,'VEC2':2,'VEC4':4,'SCALAR':1}[a['type']]
  return np.frombuffer(self.bin,dtype='<f4',count=a['count']*cols,offset=v.get('byteOffset',0)+a.get('byteOffset',0)).reshape(-1,cols)
 def save(self,path):
  doc=json.dumps(self.doc,separators=(',',':')).encode();doc+=b' '*((-len(doc))%4)
  b=struct.pack('<III',0x46546c67,2,28+len(doc)+len(self.bin))+struct.pack('<II',len(doc),0x4e4f534a)+doc+struct.pack('<II',len(self.bin),0x004e4942)+self.bin
  path.parent.mkdir(parents=True,exist_ok=True);path.write_bytes(b);return sha(b)
meta=json.loads(read_baseline('terrain.json'));old=np.frombuffer(read_baseline('heightmap.f32'),dtype='<f4').reshape(meta['rows']+1,meta['columns']+1)
xx=np.linspace(-800,800,meta['columns']+1);zz=np.linspace(-700,700,meta['rows']+1);x,gz=np.meshgrid(xx,zz);z=-gz
outline=[[-163,-224],[-37,-224],[-17,-204],[-17,-96],[-37,-76],[-163,-76],[-183,-96],[-183,-204]]
outside=field(x,z,outline)
# All changes are strictly inside the agreed server-coordinate footprint.
edge=smooth(np.minimum.reduce([x+190,-10-x,z+235,-70-z])/5.0)
weight=smooth((outside-3.5)/10)*edge
for cx,cz,r in [(-175,-216,6.4),(-25,-216,6.4),(-175,-84,6.8),(-25,-84,6.3),(-110,-224,5.4),(-90,-224,5.4)]:
 weight*=smooth((np.hypot(x-cx,z-cz)-r-2.4)/4)
layout=json.loads((ROOT/'godot-pc/world-final/world_layout.json').read_text(encoding='utf-8'));road_mask=np.zeros(x.shape,dtype=bool)
for road in layout['roads']:
 for a,b in zip(road['points_xyz'],road['points_xyz'][1:]):road_mask|=segment_gap(x,gz,[a[0],a[2]],[b[0],b[2]])<road['width']/2+2
weight[road_mask]=0
h=(old-2.8*weight).astype('<f4');delta=h-old
assert np.all(delta[(x<-190)|(x>-10)|(z<-235)|(z>-70)]==0)
assert np.all(delta[road_mask]==0)
hz,hx=np.gradient(h,2,2);changed=[]
for cell in meta['chunks']:
 c,r,nx,nz=cell['col'],cell['row'],cell['columns'],cell['rows']
 if not np.any(delta[max(0,r-1):r+nz+2,max(0,c-1):c+nx+2]):continue
 g=GLB(read_baseline(cell['glb']));prim=g.doc['meshes'][0]['primitives'][0];verts=g.array(prim['attributes']['POSITION'])
 cols=np.rint((verts[:,0]+800)/2).astype(int);rows=np.rint((verts[:,2]+700)/2).astype(int);verts[:,1]=h[rows,cols]
 a=g.doc['accessors'][prim['attributes']['POSITION']];a['min']=verts.min(axis=0).tolist();a['max']=verts.max(axis=0).tolist()
 normals=g.array(prim['attributes']['NORMAL']);n=np.stack([-hx[rows,cols],np.ones(len(rows)),-hz[rows,cols]],axis=1);normals[:]=n/np.linalg.norm(n,axis=1)[:,None]
 changed.append({'id':cell['id'],'glb':cell['glb'],'sha256':g.save(OUT/cell['glb']),'vertices':len(verts)})
npz=np.load(io.BytesIO(read_baseline('terrain-data.npz')));np.savez_compressed(OUT/'terrain-data.npz',heights=h,colors=npz['colors'])
(OUT/'heightmap.f32').write_bytes(h.tobytes());meta['sha256']=meta['height_sha256']=sha(h.tobytes())
meta['fortress_v3']={'generator':'scripts/assets/city/fortress-v3/author_hill.py','footprint_server':[-190,-235,-10,-70],'changed_vertices':int(np.count_nonzero(delta)),'changed_chunks':changed,'road_vertices_changed':0,'maximum_lowering_m':float(-delta.min())}
(OUT/'terrain.json').write_text(json.dumps(meta,indent=2)+'\n',encoding='utf-8')
report={'height_sha256':sha(h.tobytes()),'baseline_height_sha256':sha(old.tobytes()),'outside_footprint_changed':0,'interior_floor_changed':int(np.count_nonzero(delta[outside<=3.5])),'towers_footings_preserved':True,**meta['fortress_v3']}
(ART/'hill-receipt.json').write_text(json.dumps(report,indent=2)+'\n',encoding='utf-8')
if '--apply' in sys.argv:
 import shutil
 for name in ['heightmap.f32','terrain-data.npz','terrain.json']+[c['glb'] for c in changed]:shutil.copyfile(OUT/name,SOURCE/name)
print('FORTRESS_HILL_READY',json.dumps(report),flush=True)
