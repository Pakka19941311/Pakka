"""Write continuous ground UVs and a shared-vertex road mask into the exported GLB.

The source mesh uses disconnected 1m quads. Explicit accessor output avoids
per-face UV/colour seams; geometry, normals, materials and collisions are retained.
"""
import json,math,struct
from pathlib import Path
def repair(path,data_path):
 raw=bytearray(Path(path).read_bytes());size=struct.unpack_from('<I',raw,12)[0]
 doc=json.loads(raw[20:20+size]);offset=28+size;data=json.loads(Path(data_path).read_text(encoding='utf-8'))
 prim=next(m for m in doc['meshes'] if m['name']=='F3_ground_continuous')['primitives'][0]
 def accessor(name):
  a=doc['accessors'][prim['attributes'][name]];v=doc['bufferViews'][a['bufferView']]
  assert 'byteStride' not in v, 'Interleaved layout needs explicit stride support'
  return a,offset+v.get('byteOffset',0)+a.get('byteOffset',0)
 pos,p=accessor('POSITION');uv,u=accessor('TEXCOORD_0');col,c=accessor('COLOR_0')
 assert pos['componentType']==uv['componentType']==5126 and col['componentType']==5123 and col['normalized']
 assert pos['count']==uv['count']==col['count']
 segments=[]
 for street in data['quarter']['streets']:
  for a,b in zip(street['points'],street['points'][1:]):segments.append((a['x'],a['z'],b['x'],b['z'],street['width']/2))
 def weight(x,z):
  value=0
  for ax,az,bx,bz,width in segments:
   dx,dz=bx-ax,bz-az;t=max(0,min(1,((x-ax)*dx+(z-az)*dz)/(dx*dx+dz*dz or 1)))
   value=max(value,max(0,min(1,(width+.55-math.hypot(x-ax-t*dx,z-az-t*dz))/1.1)))
  for cx,cz,rx,rz in [(-108,-190,17,12),(-115,-151,13,10),(-48,-148,11,17)]:
   value=max(value,max(0,min(1,(1-math.hypot((x-cx)/rx,(z-cz)/rz))*4)))
  return round(value*65535)
 cache={}
 for i in range(pos['count']):
  x,y,z=struct.unpack_from('<3f',raw,p+i*12)
  key=(x,z)
  if key not in cache:cache[key]=weight(x,-z)
  w=cache[key];struct.pack_into('<2f',raw,u+i*8,x/4,z/4);struct.pack_into('<4H',raw,c+i*8,w,w,w,65535)
 Path(path).write_bytes(raw)
 return {'vertices':pos['count'],'sharedCoordinates':len(cache),'alpha':65535,'continuousMask':True}
if __name__=='__main__':
 import sys
 print(json.dumps(repair(sys.argv[1],sys.argv[2])))
