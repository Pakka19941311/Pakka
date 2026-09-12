"""Author the P2 shore/islets in the exact shared D13 grid, preserving the baseline.
Repro: Python + numpy, git history containing BASE. GLB surgery retains every
unrelated landmark, material, image and accessor byte; no D13 mountain rebuild.
"""
from pathlib import Path
import hashlib,json,math,struct,subprocess,zipfile
import numpy as np
ROOT=Path(__file__).resolve().parents[2]
BASE='e355777964f076aec76e580f0da332b6f64ab114'
OUT=ROOT/'godot-pc/world-final';ART=ROOT/'art/terrain-lake-p2-v3';ART.mkdir(parents=True,exist_ok=True)
def baseline(path):
 cache=ART/'baseline-inputs.zip'
 if cache.exists():
  with zipfile.ZipFile(cache) as archive:
   if path in archive.namelist():return archive.read(path)
 result=subprocess.run(['git','show',BASE+':'+path],cwd=ROOT,stdout=subprocess.PIPE,stderr=subprocess.DEVNULL)
 data=result.stdout if result.returncode==0 else (ROOT/path).read_bytes()
 # Large generated D13 files predate tracking. Preserve their actual bytes so
 # repeat generation never applies shore edits to already edited output.
 with zipfile.ZipFile(cache,'a',compression=zipfile.ZIP_DEFLATED,compresslevel=6) as archive:archive.writestr(path,data)
 return data
def sha(b):return hashlib.sha256(b).hexdigest()
def smooth(v):v=np.clip(v,0,1);return v*v*(3-2*v)
def field(x,z,poly):
 inside=np.zeros(x.shape,dtype=bool);dist=np.full(x.shape,np.inf)
 for a,b in zip(poly,poly[1:]+poly[:1]):
  dx,dz=b[0]-a[0],b[1]-a[1]
  if dz:inside^=((a[1]>z)!=(b[1]>z))&(x<dx*(z-a[1])/dz+a[0])
  t=np.clip(((x-a[0])*dx+(z-a[1])*dz)/(dx*dx+dz*dz),0,1)
  dist=np.minimum(dist,np.hypot(x-a[0]-t*dx,z-a[1]-t*dz))
 return np.where(inside,-dist,dist)
class GLB:
 def __init__(self,b):
  n=struct.unpack_from('<I',b,12)[0];self.doc=json.loads(b[20:20+n]);self.bin=bytearray(b[28+n:])
 def array(self,idx):
  a=self.doc['accessors'][idx];v=self.doc['bufferViews'][a['bufferView']];cols={'SCALAR':1,'VEC2':2,'VEC3':3,'VEC4':4}[a['type']]
  dt={5126:'<f4',5125:'<u4',5123:'<u2'}[a['componentType']]
  return np.frombuffer(self.bin,dtype=dt,count=a['count']*cols,offset=v.get('byteOffset',0)+a.get('byteOffset',0)).reshape(-1,cols)
 def add(self,values,kind='VEC3',ctype=5126):
  while len(self.bin)%4:self.bin.append(0)
  a=np.asarray(values,dtype='<f4' if ctype==5126 else '<u4');b=a.tobytes();off=len(self.bin);self.bin.extend(b)
  vi=len(self.doc['bufferViews']);self.doc['bufferViews'].append(dict(buffer=0,byteOffset=off,byteLength=len(b)))
  entry=dict(bufferView=vi,componentType=ctype,count=len(a),type=kind)
  if kind=='VEC3':entry.update(min=a.min(axis=0).tolist(),max=a.max(axis=0).tolist())
  ai=len(self.doc['accessors']);self.doc['accessors'].append(entry);return ai
 def mesh(self,name,verts,normals,indices,material,uv=None):
  attributes={'POSITION':self.add(verts),'NORMAL':self.add(normals)}
  if uv is not None:attributes['TEXCOORD_0']=self.add(uv,'VEC2')
  mi=len(self.doc['meshes']);self.doc['meshes'].append(dict(name=name,primitives=[dict(attributes=attributes,indices=self.add(np.asarray(indices).reshape(-1,1),'SCALAR',5125),material=material)]));return mi
 def write(self,path):
  while len(self.bin)%4:self.bin.append(0)
  self.doc['buffers'][0]['byteLength']=len(self.bin);j=json.dumps(self.doc,separators=(',',':')).encode();j+=b' '*((-len(j))%4)
  b=struct.pack('<III',0x46546c67,2,28+len(j)+len(self.bin))+struct.pack('<II',len(j),0x4e4f534a)+j+struct.pack('<II',len(self.bin),0x004e4942)+self.bin
  path.write_bytes(b);return sha(b)
def triangulate(poly):
 # Ear clipping works on the actual concave polygon, never a centre fan.
 area=sum(a[0]*b[1]-b[0]*a[1] for a,b in zip(poly,poly[1:]+poly[:1]));left=list(range(len(poly)))
 if area<0:left.reverse()
 def cross(a,b,c):return (b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0])
 triangles=[]
 while len(left)>3:
  for i,mid in enumerate(left):
   a,b,c=left[i-1],mid,left[(i+1)%len(left)]
   if cross(poly[a],poly[b],poly[c])<=1e-8:continue
   if any(cross(poly[a],poly[b],poly[q])>=-1e-8 and cross(poly[b],poly[c],poly[q])>=-1e-8 and cross(poly[c],poly[a],poly[q])>=-1e-8 for q in left if q not in (a,b,c)):continue
   triangles.append((a,c,b));left.pop(i);break
  else:raise RuntimeError('non-simple lake polygon')
 triangles.append((left[0],left[2],left[1]));return triangles
layout=json.loads(baseline('godot-pc/world-final/world_layout.json'));lake=layout['water']['lake'];oldpoly=lake['polygon']
# Inward shore tongues make three sheltered bays. The existing east dock mouth
# and cave approach retain their old controls. Chaikin rounds hard 40 m edges.
controls=[[-55,-100],[-20,-145],[17,-150],[43,-131],[58,-161],[75,-194],[80,-225],[111,-232],[132,-213],[160,-240],[205,-251],[249,-267],[294,-242],[340,-212],[379,-164],[417,-127],[433,-70],[420,-15],[386,22],[357,52],[341,84],[311,111],[277,106],[254,75],[237,35],[215,28],[204,-4],[187,-12],[174,10],[160,-1],[128,-10],[89,-8],[47,-25],[8,-34],[-31,-61]]
poly=controls
for _ in range(2):
 poly=[p for a,b in zip(poly,poly[1:]+poly[:1]) for p in [[.75*a[0]+.25*b[0],.75*a[1]+.25*b[1]],[.25*a[0]+.75*b[0],.25*a[1]+.75*b[1]]]]
poly=[[round(x,4),round(z,4)] for x,z in poly];lake['polygon']=poly
meta=json.loads(baseline('godot-pc/world-final/geology-D13/terrain.json'))
old=np.frombuffer(baseline('godot-pc/world-final/geology-D13/heightmap.f32'),dtype='<f4').reshape(701,801).copy();h=old.copy();x,z=np.meshgrid(np.arange(-800,801,2),np.arange(-700,701,2))
oldf=field(x,z,oldpoly);newf=field(x,z,poly)
# Reclaim the old water strip as a sloping beach. Only submerged/shore vertices
# change; landward routes, buildings and mountain profiles are preserved.
shore=(oldf<2)&(newf>-23)&(old<40.4)
shore_height=40.35+np.where(newf>=0,np.minimum(newf*.24,5.5),newf*.67)
h=np.where(shore,np.maximum(h,shore_height),h)
# Small convex discrepancies introduced by rounding must remain wet inside the
# authoritative boundary; they do not excavate already dry terrain.
islands=[dict(id='LAKE_ISLET_REEDS',x=61,z=-107,rx=28,rz=18,height=46.0,phase=.4),dict(id='LAKE_ISLET_STONE',x=207,z=-132,rx=35,rz=23,height=48.0,phase=2.0),dict(id='LAKE_ISLET_PINE',x=320,z=-84,rx=22,rz=30,height=47.0,phase=4.1)]
for island in islands:
 dx=(x-island['x'])/island['rx'];dz=(z-island['z'])/island['rz'];angle=np.arctan2(dz,dx)
 radius=np.hypot(dx,dz)/(1+.09*np.sin(3*angle+island['phase'])+.055*np.cos(5*angle-island['phase']))
 # The complete underwater toe is in the same grid. No flat island decals.
 dome=island['height']-22*smooth(np.maximum(radius-.18,0)/1.24)
 h=np.where((radius<1.55)&(newf<-7),np.maximum(h,dome),h)
h=h.astype('<f4');delta=h-old;hz,hx=np.gradient(h,2,2)
changed=[]
for cell in meta['chunks']:
 c,r,nx,nz=cell['col'],cell['row'],cell['columns'],cell['rows'];patch=delta[max(0,r-1):r+nz+2,max(0,c-1):c+nx+2]
 if not np.any(patch):continue
 path='godot-pc/world-final/geology-D13/'+cell['glb'];g=GLB(baseline(path));prim=g.doc['meshes'][0]['primitives'][0]
 verts=g.array(prim['attributes']['POSITION']);cols=np.rint((verts[:,0]+800)/2).astype(int);rows=np.rint((verts[:,2]+700)/2).astype(int)
 verts[:,1]=h[rows,cols];a=g.doc['accessors'][prim['attributes']['POSITION']];a['min']=verts.min(axis=0).tolist();a['max']=verts.max(axis=0).tolist()
 normals=g.array(prim['attributes']['NORMAL']);n=np.stack([-hx[rows,cols],np.ones(len(rows)),-hz[rows,cols]],axis=1);normals[:]=n/np.linalg.norm(n,axis=1)[:,None]
 changed.append(dict(id=cell['id'],glb=cell['glb'],sha256=g.write(ROOT/path),vertices=len(verts)))
# Keep NPZ mask channels byte-equivalent, update only the shared heights.
import io
npz=np.load(io.BytesIO(baseline('godot-pc/world-final/geology-D13/terrain-data.npz')))
np.savez_compressed(OUT/'geology-D13/terrain-data.npz',heights=h,colors=npz['colors'])
(OUT/'geology-D13/heightmap.f32').write_bytes(h.tobytes());meta['sha256']=sha(h.tobytes());meta['p2_lake_revision']='organic-shore-islets-v3';meta['p2_source_generator']='scripts/world_final/author_lake_p2.py';meta['p2_changed_chunks']=changed;meta['native_source_scope']='Preserved D13 baseline Blender master. The P2 lake edit is reproducible from scripts/world_final/author_lake_p2.py and art/terrain-lake-p2-v3/baseline-inputs.zip.';meta['status']='Active D13 with P2 organic lake and shared collision grid; native baseline master preserved.'
(OUT/'geology-D13/terrain.json').write_text(json.dumps(meta,indent=2)+'\n',encoding='utf-8')
g=GLB(baseline('godot-pc/world-final/geography/landmarks.glb'));water_node=next(n for n in g.doc['nodes'] if n.get('name')=='Lake_Level_40m');water_node['mesh']=g.mesh('Lake_Level_40m_P2_Organic',[(a,40,b) for a,b in poly],[(0,1,0)]*len(poly),triangulate(poly),0)
# One accessible additional south-west jetty: paired with the retained east PIER.
# Normal and UV data use the existing licensed aged timber material.
verts=[];normals=[];uv=[];indices=[]
def box(cx,cy,cz,sx,sy,sz,top_slope=0):
 v=np.array([[cx+dx*sx/2,cy+dy*sy/2+top_slope*dz*sz/2,cz+dz*sz/2] for dx,dy,dz in [(-1,-1,-1),(1,-1,-1),(1,-1,1),(-1,-1,1),(-1,1,-1),(1,1,-1),(1,1,1),(-1,1,1)]])
 for f in [(0,3,2,1),(4,5,6,7),(0,1,5,4),(1,2,6,5),(2,3,7,6),(3,0,4,7)]:
  pts=v[list(reversed(f))];normal=np.cross(pts[1]-pts[0],pts[2]-pts[0]);normal/=np.linalg.norm(normal);start=len(verts);verts.extend(pts.tolist());normals.extend([normal.tolist()]*4);uv.extend([[0,0],[sx/2,0],[sx/2,sz/2],[0,sz/2]]);indices.extend([(start,start+1,start+2),(start,start+2,start+3)])
for zz in np.arange(-29.7,-6,.6):box(100,41.24,float(zz),4,.32,.56)
# Shore ramp rises from deck y41.4 at z-6 to retained terrain y44.72 at z6.
ramp_high=44.72
for zz in np.arange(-5.7,6,.6):box(100,41.4+(zz+6)/12*(ramp_high-41.4)-.16,float(zz),4,.32,.56,(ramp_high-41.4)/12)
for xx in [98.25,101.75]:
 box(xx,40.75,-18, .25,.35,24)
 for zz in [-29,-23,-17,-11]:box(xx,39.25,zz,.26,6.3,.26)
box(100,41.24,-30,7,.32,3.6)
# Rails are on the outer edge, not across either walkable entrance.
for xx in [96.7,103.3]:box(xx,41.8,-30,.22,1.25,.22)
mi=g.mesh('P2_LAKE_WEST_PIER',verts,normals,indices,1,uv);ni=len(g.doc['nodes']);g.doc['nodes'].append(dict(mesh=mi,name='P2_LAKE_WEST_PIER'));g.doc['scenes'][g.doc.get('scene',0)]['nodes'].append(ni)
landmark_sha=g.write(OUT/'geography/landmarks.glb')
support=json.loads(baseline('godot-pc/world-final/geography/support-surfaces.json'))
support['surfaces'] += [dict(id='P2_LAKE_WEST_PIER_deck',kind='box',x=100,z=-18,halfX=2,halfZ=12,angle=0,y=41.4),dict(id='P2_LAKE_WEST_PIER_head',kind='box',x=100,z=-30,halfX=3.5,halfZ=1.8,angle=0,y=41.4),dict(id='P2_LAKE_WEST_PIER_ramp',kind='ramp_z',x=100,z=0,halfX=2,halfZ=6,angle=0,y=ramp_high,high=41.4)]
(OUT/'geography/support-surfaces.json').write_bytes((json.dumps(support,indent=2)+'\n').encode('utf-8'))
lake['p2_islets']=islands;lake['p2_additional_pier']=dict(id='P2_LAKE_WEST_PIER',shore_layout=[100,6],head_layout=[100,-30],deck_y=41.4,access='Existing land approach; no walkable water or implicit island teleport')
(OUT/'world_layout.json').write_bytes((json.dumps(layout,ensure_ascii=False,indent=2)+'\n').encode('utf-8'))
manifest=json.loads((OUT/'nature/p2-sample-v3/manifest.json').read_text('utf-8'));manifest['qaWaterPolygon']=poly;manifest['qaShorePolyline']=[p for p in poly if -65<p[0]<0 and -105<p[1]<-40]
(OUT/'nature/p2-sample-v3/manifest.json').write_text(json.dumps(manifest,indent=2)+'\n',encoding='utf-8')
road_changes=0
for road in layout['roads']:
 for a,b in zip(road['points_xyz'],road['points_xyz'][1:]):
  dx,dz=b[0]-a[0],b[2]-a[2];t=np.clip(((x-a[0])*dx+(z-a[2])*dz)/(dx*dx+dz*dz or 1),0,1)
  road_changes+=int(np.count_nonzero((np.hypot(x-a[0]-t*dx,z-a[2]-t*dz)<road['width']/2+2)&(delta!=0)))
assert road_changes==0,('existing road corridor changed',road_changes)
report=dict(road_corridor_vertices_changed=road_changes,schema=1,status='authored geometry; native visual acceptance pending',baseline_revision=BASE,source_generator='scripts/world_final/author_lake_p2.py',old_polygon_vertices=len(oldpoly),new_polygon_vertices=len(poly),islets=islands,terrain_changed_vertices=int(np.count_nonzero(delta)),changed_chunks=changed,maximum_raise_m=float(delta.max()),height_sha256=sha(h.tobytes()),landmarks_sha256=landmark_sha,support_count=len(support['surfaces']),old_east_pier_retained=True,baseline_landmark_nodes_retained=len(g.doc['nodes'])-1,water_level=40)
(ART/'manifest.json').write_text(json.dumps(report,indent=2)+'\n',encoding='utf-8');print(json.dumps(report,indent=2))
