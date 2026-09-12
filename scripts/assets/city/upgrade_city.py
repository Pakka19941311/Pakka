"""Author the approved city expansion from existing CC0 house/gate sources.

Uses place_house.py's preserved courtyard and operational tavern as baseline.
New solids, physical steps and camera overhangs are derived from the same meshes.
No service, resident, street, population or gameplay item definition is generated.
"""
from pathlib import Path
from collections import defaultdict
import bpy,json,math,runpy,hashlib
from mathutils import Vector,Matrix
ROOT=Path(__file__).resolve().parents[3]
REPORT=ROOT/'work/qa/city-upgrade';REPORT.mkdir(parents=True,exist_ok=True)
ASSETS=ROOT/'godot-pc/world-expansion-v3/city/assets'
HOUSES=[
 ('House_of_herbs',-130,-164,.72,0,'sage'),
 ('Merchant_guild',-132,-141,.86,math.pi/2,'ochre'),
 ('Guildhall_east',-80,-138,1,-math.pi/2,'cream'),
 ('Podkova_alehouse',-60,-209,.86,math.pi,'warm'),
 ('Leatherworkers_house',-35,-202,.90,-math.pi/2,'sage'),
 ('Coopers_house',-32,-177,.82,math.pi,'ochre'),
]
GATES=[('Citadel_west_hall',-136,-110),('Citadel_east_hall',-66,-107)]

def points_bounds(points):
 return ([min(p[i] for p in points) for i in range(3)],[max(p[i] for p in points) for i in range(3)])

def finish(g):
 data=g['data'];floor=70.14;records=[];obstacles=data['obstacles'];supports=data['supportSurfaces']
 # Coplanar road strips in the old quarter overlapped at every junction.
 # Their exact planar union removes black z-fighting rectangles, preserving
 # the authored street footprint and UV scale rather than lifting the roads.
 road=bpy.data.objects.get('Courtyard_streets_road_cobbles')
 if road:
  def area(poly):return sum(a.x*b.y-b.x*a.y for a,b in zip(poly,poly[1:]+poly[:1]))/2
  def split(poly,a,b):
   inside=[];outside=[]
   for p,q in zip(poly,poly[1:]+poly[:1]):
    dp=(b.x-a.x)*(p.y-a.y)-(b.y-a.y)*(p.x-a.x);dq=(b.x-a.x)*(q.y-a.y)-(b.y-a.y)*(q.x-a.x)
    (inside if dp>=-1e-7 else outside).append(p)
    if (dp>=-1e-7)!=(dq>=-1e-7):
     v=p+(q-p)*(dp/(dp-dq));inside.append(v);outside.append(v)
   return inside,outside
  def difference(poly,clip):
   remain=poly;parts=[]
   for a,b in zip(clip,clip[1:]+clip[:1]):
    if len(remain)<3:break
    remain,outside=split(remain,a,b)
    if len(outside)>=3 and abs(area(outside))>1e-7:parts.append(outside)
   return parts
  previous=[];verts=[];faces=[];uvs=[];uv=road.data.uv_layers.active
  for poly in road.data.polygons:
   original=[road.matrix_world@road.data.vertices[i].co for i in poly.vertices]
   if abs(area(original))<1e-7:continue
   texture=[uv.data[i].uv.copy() for i in poly.loop_indices]
   if area(original)<0:original.reverse();texture.reverse()
   a,b,c=original[:3];ua,ub,uc=texture[:3];bx,by=b.x-a.x,b.y-a.y;cx,cy=c.x-a.x,c.y-a.y;det=bx*cy-by*cx
   fragments=[original]
   for clip in previous:fragments=[part for f in fragments for part in difference(f,clip)]
   for f in fragments:
    offset=len(verts);verts.extend(tuple(v) for v in f);faces.append(tuple(range(offset,offset+len(f))))
    for v in f:
     u=((v.x-a.x)*cy-(v.y-a.y)*cx)/det;vv=(bx*(v.y-a.y)-by*(v.x-a.x))/det
     uvs.append(tuple(ua+(ub-ua)*u+(uc-ua)*vv))
   previous.append(original)
  mesh=bpy.data.meshes.new('Continuous_cobbled_streets');mesh.from_pydata(verts,[],faces);mesh.update();layer=mesh.uv_layers.new()
  for i,uv in enumerate(uvs):layer.data[i].uv=uv
  for mat in road.data.materials:mesh.materials.append(mat)
  road.data=mesh;road.matrix_world=Matrix.Identity(4)
 baseline_preserved={k:hashlib.sha256(json.dumps(data[k],sort_keys=True).encode()).hexdigest() for k in ['residents','residentLooks','wildlife','signs','tavern','quarter']}
 image_cache={};material_cache={}
 def canonical_material(mat,palette):
  if not mat or not mat.use_nodes:return mat
  bs=mat.node_tree.nodes.get('Principled BSDF');tex=next((n.image for n in mat.node_tree.nodes if n.type=='TEX_IMAGE' and n.image),None)
  keyname=tex.name.split('.')[0] if tex else mat.name.split('.')[0]
  tint={'sage':(.72,.79,.68,1),'ochre':(.91,.79,.59,1),'warm':(.90,.76,.66,1),'cream':(.9,.9,.82,1)}.get(palette,(1,1,1,1))
  color=tint if 'Plaster' in keyname else (.74,.76,.73,1) if 'Stone' in keyname else (1,1,1,1)
  key=(keyname,color,round(float(bs.inputs['Metallic'].default_value),3),round(float(bs.inputs['Roughness'].default_value),3))
  if key in material_cache:return material_cache[key]
  mat.name='P2City_'+keyname+'_'+palette
  bs.inputs['Base Color'].default_value=color
  # glTF combines a diffuse texture with this factor at runtime.
  g['legacy_factors'][mat.name]=list(color)
  if tex:
   if keyname in image_cache:
    for node in mat.node_tree.nodes:
     if node.type=='TEX_IMAGE' and node.image==tex:node.image=image_cache[keyname]
   else:image_cache[keyname]=tex
  material_cache[key]=mat;return mat
 def obstacle(prefix,label,lo,hi,solid):
  if hi[2]-lo[2]<.015:return
  obstacles.append({'id':prefix+label,'kind':'box','x':round((lo[0]+hi[0])/2,5),'z':round((lo[1]+hi[1])/2,5),
   'halfX':round(max(.018,(hi[0]-lo[0])/2),5),'halfZ':round(max(.018,(hi[1]-lo[1])/2),5),
   'bottom':round(lo[2],5),'top':round(hi[2],5),'rotation':0,'blocksMovement':solid})
 def support_polygon(points,normal):
  lo,hi=points_bounds(points)
  if normal.z>.95 and hi[2]-lo[2]<.006 and min(hi[0]-lo[0],hi[1]-lo[1])>.06:
   supports.append({'kind':'plate','x':round((lo[0]+hi[0])/2,5),'z':round(-(lo[1]+hi[1])/2,5),
    'halfX':round((hi[0]-lo[0])/2,5),'halfZ':round((hi[1]-lo[1])/2,5),'angle':0,'y':round(hi[2],5)})
 def load(name,rootname,placement,palette):
  before=set(bpy.context.scene.objects);bpy.ops.import_scene.gltf(filepath=str(ASSETS/(name+'.glb')))
  objects=[o for o in bpy.context.scene.objects if o not in before]
  root=bpy.data.objects.new(rootname,None);bpy.context.collection.objects.link(root)
  for ob in objects:
   mw=ob.matrix_world.copy()
   if ob.parent not in objects:ob.parent=root;ob.matrix_world=placement@mw
  bpy.context.view_layer.update()
  meshes=[o for o in objects if o.type=='MESH']
  for ob in meshes:
   for slot in ob.material_slots:slot.material=canonical_material(slot.material,palette)
  return root,meshes,objects
 def batch(root,meshes):
  # Static shared-material surfaces, not hundreds of tiny texture-identical draws.
  groups=defaultdict(list)
  for ob in meshes:
   for index,mat in enumerate(ob.data.materials):groups[mat].append((ob,index))
  for mat,items in groups.items():
   verts=[];faces=[];uvs=[];smooth=[]
   for ob,index in items:
    offset=len(verts);verts.extend(tuple(ob.matrix_world@v.co) for v in ob.data.vertices);uv=ob.data.uv_layers.active
    for poly in ob.data.polygons:
     if poly.material_index!=index:continue
     faces.append(tuple(offset+i for i in poly.vertices));smooth.append(poly.use_smooth)
     uvs.extend(tuple(uv.data[i].uv) if uv else (0,0) for i in poly.loop_indices)
   mesh=bpy.data.meshes.new(root.name+'_'+mat.name);mesh.from_pydata(verts,[],faces);mesh.update()
   uv=mesh.uv_layers.new(name='UVMap')
   for i,value in enumerate(uvs):uv.data[i].uv=value
   for poly,value in zip(mesh.polygons,smooth):poly.use_smooth=value
   ob=bpy.data.objects.new(mesh.name,mesh);bpy.context.collection.objects.link(ob);ob.parent=root;ob.data.materials.append(mat)
  for ob in meshes:bpy.data.objects.remove(ob,do_unlink=True)
  return len(groups)
 for name,x,z,scale,yaw,palette in HOUSES:
  prefix='courtyard:city-v3:'+name+':'
  placement=Matrix.Translation((x,z,floor-.4793))@Matrix.Rotation(yaw,4,'Z')@Matrix.Diagonal((scale,scale,1,1))
  root,meshes,objects=load('P2_housepack','P2_House_'+name,placement,palette)
  stairs=None;before_obs=len(obstacles);before_support=len(supports)
  for ob in meshes:
   original=ob.name.split('.')[0];lo,hi=points_bounds([ob.matrix_world@Vector(p) for p in ob.bound_box])
   if original in ['StoneLeft','StoneRight']:obstacle(prefix,original,lo,hi,True)
   if original in ['Connection','BalconyWood','LeftLevel2','LeftLevel3','RightLevel2','RightLevel3']:
    obstacle(prefix,original,lo,hi,False)
   if original in ['Roof','RoofBalcony']:
    for i,poly in enumerate(ob.data.polygons):
     a,b=points_bounds([ob.matrix_world@ob.data.vertices[j].co for j in poly.vertices]);obstacle(prefix,original+':'+str(i),a,b,False)
   if original in ['Stair','DoorLeftLevel1Step']:
    for poly in ob.data.polygons:support_polygon([ob.matrix_world@ob.data.vertices[j].co for j in poly.vertices],ob.matrix_world.to_3x3()@poly.normal)
    if original=='Stair':stairs={'min':[lo[0]-.45,lo[1]-.45],'max':[hi[0]+.45,hi[1]+.45]}
  for side in [6.14,8.01]:
   pts=[placement@Vector((xx,yy,zz)) for xx in [side-.065,side+.065] for yy in [-2.2,2.54] for zz in [.4793,3.4861]]
   obstacle(prefix,'stair-rail-'+str(side),*points_bounds(pts),True)
  bounds=points_bounds([ob.matrix_world@Vector(p) for ob in meshes for p in ob.bound_box])
  draws=batch(root,meshes)
  records.append({'id':name,'root':root.name,'source':'P2_housepack','position':[x,z],'scale_xy':scale,'scale_height':1,'yaw':yaw,'palette':palette,
   'bounds':bounds,'passageCenter':[x-.25*scale*math.cos(yaw),z-.25*scale*math.sin(yaw)],'obstaclePrefix':prefix,'stairs':stairs,'obstacles':len(obstacles)-before_obs,'supports':len(supports)-before_support,'drawSurfaces':draws})
  for prop in data['props']:
   if prop['id']==name:prop.update(source='P2_housepack',root=root.name,enterable=False,exterior_stairs=True)
 for name,x,z in GATES:
  prefix='courtyard:city-v3:'+name+':'
  placement=Matrix.Translation((x,z,floor))@Matrix.Rotation(math.pi,4,'Z')
  root,meshes,objects=load('P2_gatehouse','P2_Guardhouse_'+name,placement,'stone')
  before_obs=len(obstacles);before_support=len(supports)
  for ob in meshes:
   original=ob.name.split('.')[0]
   # Real separate source grilles are raised above the authored pedestrian arch.
   if original.startswith('Portcullis'):ob.location.z+=2.4
  bpy.context.view_layer.update()
  for ob in meshes:
   original=ob.name.split('.')[0]
   if original in ['Flag','FlagHolder']:continue
   for i,poly in enumerate(ob.data.polygons):
    pts=[ob.matrix_world@ob.data.vertices[j].co for j in poly.vertices];lo,hi=points_bounds(pts)
    normal=(ob.matrix_world.to_3x3()@poly.normal).normalized()
    if abs(normal.z)>.95 and hi[2]<floor+.1:continue
    # Thin face bounds preserve the source arch, doors and round tower walls.
    # No whole-building box across the three-metre passage.
    solid=lo[2]<floor+1.6 and hi[2]>floor+.12 and abs(normal.z)<.75
    obstacle(prefix,original+':'+str(i),lo,hi,solid)
    if original=='GateHouse' and floor+.12<hi[2]<floor+8:support_polygon(pts,normal)
  bounds=points_bounds([ob.matrix_world@Vector(p) for ob in meshes for p in ob.bound_box]);draws=batch(root,meshes)
  records.append({'id':name,'root':root.name,'source':'P2_gatehouse','position':[x,z],'scale':1,'yaw':math.pi,'bounds':bounds,
   'passageCenter':[x,z],'obstaclePrefix':prefix,'obstacles':len(obstacles)-before_obs,'supports':len(supports)-before_support,'drawSurfaces':draws})
  for prop in data['props']:
   if prop['id']==name:prop.update(source='P2_gatehouse',root=root.name,passage=True)
 # Restore rich wood, pale stone and human-scale plaster within the existing
 # tavern/market/citadel meshes. Meshes/doors/sign anchors are retained.
 for name,factor in {'fieldstone':(.50,.49,.43,1),'dressed_limestone':(.60,.56,.45,1),
  'weathered_oak':(.38,.26,.15,1),'frame_oak':(.25,.15,.075,1),
  'lime_cream':(.42,.34,.23,1),'lime_ochre':(.40,.27,.12,1),'lime_pale':(.35,.38,.28,1),
  'lime_russet':(.40,.22,.12,1),'shop_green':(.08,.16,.065,1),'shop_ochre':(.34,.19,.045,1),
  'yard_cobbles':(.36,.35,.31,1),'road_cobbles':(.40,.38,.33,1),
  'fair_red':(.25,.065,.04,1),'fair_blue':(.06,.11,.15,1),'aged_canvas':(.36,.29,.18,1)}.items():
  g['legacy_factors'][name]=list(factor)
  mat=bpy.data.materials.get(name)
  if mat and mat.use_nodes:mat.node_tree.nodes['Principled BSDF'].inputs['Base Color'].default_value=factor
 for key,expected in baseline_preserved.items():assert hashlib.sha256(json.dumps(data[key],sort_keys=True).encode()).hexdigest()==expected,key
 # glTF triangles often have identical rectangular bounds. Merge only boxes
 # sharing both untouched axes; this retains their union, not a coarse hull
 # over the arch. The sole tolerance is exporter rounding below 0.05 mm.
 for record in records:
  prefix=record['obstaclePrefix'];raw=[o for o in obstacles if o['id'].startswith(prefix)]
  boxes=[([o['x']-o['halfX'],o['z']-o['halfZ'],o['bottom']],
          [o['x']+o['halfX'],o['z']+o['halfZ'],o['top']],o['blocksMovement']) for o in raw]
  for repeat in range(3):
   for axis in range(3):
    groups=defaultdict(list)
    for lo,hi,solid in boxes:
     key=(solid,)+tuple(round(v,4) for j in range(3) if j!=axis for v in [lo[j],hi[j]])
     groups[key].append((lo,hi,solid))
    boxes=[]
    for rows in groups.values():
     rows.sort(key=lambda r:r[0][axis]);lo,hi,solid=rows[0]
     for nlo,nhi,ss in rows[1:]:
      if nlo[axis]<=hi[axis]+.00002:hi[axis]=max(hi[axis],nhi[axis])
      else:boxes.append((lo,hi,solid));lo,hi=nlo,nhi
     boxes.append((lo,hi,solid))
  obstacles[:]=[o for o in obstacles if not o['id'].startswith(prefix)]
  for i,(lo,hi,solid) in enumerate(boxes):obstacle(prefix,'merged:'+str(i),lo,hi,solid)
  record['rawObstacles']=len(raw);record['obstacles']=len(boxes)
 data['p2City'].update(version=2,upgrade='inhabited-streets-and-citadel-guards',buildings=records,
  preserve=['service IDs and anchors','resident IDs and routes','operational tavern','main gate width','first P2 house and staircase'],
  sourceHashes={name:hashlib.sha256((ASSETS/(name+'.glb')).read_bytes()).hexdigest() for name in ['P2_housepack','P2_gatehouse']})
 (REPORT/'geometry.json').write_text(json.dumps({'buildings':records,'preserved':baseline_preserved,'obstacles':len(obstacles),'supports':len(supports)},indent=2),encoding='utf-8')
 print('CITY_UPGRADE_GEOMETRY',len(records),'buildings',len(obstacles),'obstacles',flush=True)

runpy.run_path(str(ROOT/'scripts/assets/city/place_house.py'),init_globals={
 'P2_EXTRA_REPLACEMENTS':[r[0] for r in HOUSES+GATES],'P2_FINISH_CITY':finish},run_name='__main__')
