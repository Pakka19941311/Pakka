"""One live P2 house, authored with the same support and collision geometry.

Read the accepted editable courtyard; preserve the operational tavern, NPCs,
streets and all other props. Output is separate from the legacy courtyard.
Blender 4.2.3 --background --factory-startup --disable-autoexec --python this.py.
"""
from pathlib import Path
from collections import defaultdict
import bpy,json,math,struct,hashlib
from mathutils import Vector,Matrix

ROOT=Path(__file__).resolve().parents[3]
OUT=ROOT/'godot-pc/world-final/castle'
HOUSE=ROOT/'godot-pc/world-expansion-v3/city/assets/P2_housepack.glb'
MASTER=ROOT/'art/world-final/Greenfall_Castle_Quarter_03.blend'
NAME='Gate_exchange_house'
data=json.loads((OUT/'courtyard.json').read_text(encoding='utf-8'))
legacy_glb=(OUT/'courtyard.glb').read_bytes()
legacy_document=json.loads(legacy_glb[20:20+struct.unpack_from('<I',legacy_glb,12)[0]])
legacy_factors={m['name']:m.get('pbrMetallicRoughness',{}).get('baseColorFactor',[1,1,1,1]) for m in legacy_document['materials']}
bpy.ops.wm.open_mainfile(filepath=str(MASTER),load_ui=False,use_scripts=False)
old=bpy.data.objects[NAME]
for ob in [*old.children_recursive,old]:bpy.data.objects.remove(ob,do_unlink=True)
data['obstacles']=[o for o in data['obstacles'] if not o['id'].startswith('courtyard:'+NAME+':')]
data['props']=[p for p in data['props'] if p['id']!=NAME]

# The city expansion driver shares this exact legacy-preserving baseline.
# A plain invocation still reproduces the original single-house checkpoint.
for extra_name in globals().get('P2_EXTRA_REPLACEMENTS',[]):
 extra=bpy.data.objects.get(extra_name)
 if extra:
  for ob in [*extra.children_recursive,extra]:bpy.data.objects.remove(ob,do_unlink=True)
 data['obstacles']=[o for o in data['obstacles'] if not o['id'].startswith('courtyard:'+extra_name+':')]

# Batch unchanged source pieces exactly as the legacy exporter does. Their
# names are retained because tavern camera hiding depends on district names.
groups=defaultdict(list)
for ob in bpy.context.scene.objects:
 if ob.type=='MESH':groups[(ob.parent['zone'],ob.data.materials[0].name)].append(ob)
bpy.context.view_layer.update()
for (zone,mat),items in groups.items():
 origin=items[0].parent.matrix_world.translation.copy()
 vertices=[];faces=[];uvs=[];smooth=[]
 for ob in items:
  offset=len(vertices);vertices.extend(tuple(ob.matrix_world@v.co-origin) for v in ob.data.vertices)
  uv=ob.data.uv_layers.active
  for poly in ob.data.polygons:
   faces.append(tuple(offset+i for i in poly.vertices));smooth.append(poly.use_smooth)
   uvs.extend(tuple(uv.data[i].uv) for i in poly.loop_indices)
 mesh=bpy.data.meshes.new('Courtyard_'+zone+'_'+mat);mesh.from_pydata(vertices,[],faces);mesh.update()
 uv=mesh.uv_layers.new(name='UVMap')
 for i,value in enumerate(uvs):uv.data[i].uv=value
 for poly,value in zip(mesh.polygons,smooth):poly.use_smooth=value
 ob=bpy.data.objects.new(mesh.name,mesh);bpy.context.collection.objects.link(ob)
 ob.location=origin;ob.data.materials.append(bpy.data.materials[mat])
for items in groups.values():
 for ob in items:bpy.data.objects.remove(ob,do_unlink=True)
for ob in list(bpy.context.scene.objects):
 if ob.type=='EMPTY':bpy.data.objects.remove(ob,do_unlink=True)

before=set(bpy.context.scene.objects)
bpy.ops.import_scene.gltf(filepath=str(HOUSE))
house=[o for o in bpy.context.scene.objects if o not in before]
placement=Matrix.Translation((-79,-211,70.14-.4793))@Matrix.Rotation(math.pi,4,'Z')
for ob in house:
 if ob.parent not in house:ob.matrix_world=placement@ob.matrix_world
bpy.context.view_layer.update()

def bounds(ob):
 pts=[ob.matrix_world@Vector(p) for p in ob.bound_box]
 return [min(p[i] for p in pts) for i in range(3)],[max(p[i] for p in pts) for i in range(3)]

def obstacle(label,lo,hi,solid):
 data['obstacles'].append({'id':'courtyard:p2-house:'+label,'kind':'box','x':round((lo[0]+hi[0])/2,5),'z':round((lo[1]+hi[1])/2,5),
  'halfX':round(max(.015,(hi[0]-lo[0])/2),5),'halfZ':round(max(.015,(hi[1]-lo[1])/2),5),
  'bottom':round(lo[2],5),'top':round(hi[2],5),'rotation':0,'blocksMovement':solid})

supports=[]
for ob in house:
 if ob.type!='MESH':continue
 lo,hi=bounds(ob)
 # Two actual enclosed ground floors, not a bounding box across the passage.
 if ob.name in ['StoneLeft','StoneRight']:obstacle(ob.name,lo,hi,True)
 elif ob.name in ['Connection','BalconyWood','LeftLevel2','LeftLevel3','RightLevel2','RightLevel3']:
  obstacle(ob.name,lo,hi,False)
 elif ob.name in ['RoofBalcony','Roof']:
  # A single bounding box around several pitched roofs fills the air above
  # the stairs and pushes the camera into the hero. Small face bounds retain
  # each roof's actual height instead of using the lowest eave everywhere.
  ob.data.calc_loop_triangles();pieces=[]
  def split_triangle(points):
   lengths=[(points[(i+1)%3]-points[i]).length for i in range(3)]
   edge=max(range(3),key=lambda i:lengths[i])
   if lengths[edge]<=1.5:pieces.append(points);return
   a,b,c=points[edge],points[(edge+1)%3],points[(edge+2)%3];mid=(a+b)/2
   split_triangle([a,mid,c]);split_triangle([mid,b,c])
  for tri in ob.data.loop_triangles:split_triangle([ob.matrix_world@ob.data.vertices[i].co for i in tri.vertices])
  for index,pts in enumerate(pieces):obstacle(ob.name+':'+str(index),[min(p[i] for p in pts) for i in range(3)],[max(p[i] for p in pts) for i in range(3)],False)
 if ob.name in ['Stair','DoorLeftLevel1Step']:
  for poly in ob.data.polygons:
   points=[ob.matrix_world@ob.data.vertices[i].co for i in poly.vertices]
   low=[min(p[i] for p in points) for i in range(3)];high=[max(p[i] for p in points) for i in range(3)]
   normal=ob.matrix_world.to_3x3()@poly.normal
   if normal.z<.95 or high[2]-low[2]>.005 or min(high[0]-low[0],high[1]-low[1])<.05:continue
   supports.append({'kind':'plate','x':round((low[0]+high[0])/2,5),'z':round(-(low[1]+high[1])/2,5),
    'halfX':round((high[0]-low[0])/2,5),'halfZ':round((high[1]-low[1])/2,5),'angle':0,'y':round(high[2],5)})
 # Preserve texture detail, with the original neutral house palette.
 ob['p2_live_house']=True
for x in [6.14,8.01]:
 a=placement@Vector((x-.065,-2.2,.4793));b=placement@Vector((x+.065,2.54,3.4861))
 obstacle('stair-rail-'+str(x),[min(a[i],b[i]) for i in range(3)],[max(a[i],b[i]) for i in range(3)],True)
data['supportSurfaces'].extend(supports)
data['props'].append({'id':'P2_Gate_exchange_house','x':-79,'z':-211,'zone':'quarter_south','source':'P2_housepack','enterable':False,'stairs':'physical exterior steps; upper door closed'})
data['p2City']={'version':1,'replaces':[NAME],'houseSourceSha256':hashlib.sha256(HOUSE.read_bytes()).hexdigest(),
 'position_server':[-79,-211],'floor_y':70.14,'source_sink':.4793,'yaw':math.pi,'step_supports':supports,
 'scope':'one residential facade and accessible exterior stair; no new shop or interior'}
data['id']='greenfall-courtyard-p2'
if globals().get('P2_FINISH_CITY'):P2_FINISH_CITY(globals())
(OUT/'courtyard-p2.json').write_text(json.dumps(data,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')

# A full editable project is derived deterministically from the saved master
# and the imported source; the generator and source hashes preserve authorship.
for image in bpy.data.images:
 if image.source=='FILE' and image.has_data and not image.packed_file:
  image.pack()
bpy.ops.wm.save_as_mainfile(filepath=str(ROOT/'art/world-final/Greenfall_Courtyard_P2.blend'))
bpy.ops.export_scene.gltf(filepath=str(OUT/'courtyard-p2.glb'),export_format='GLB',export_yup=True,export_apply=True,export_animations=False,export_extras=True)
path=OUT/'courtyard-p2.glb';raw=path.read_bytes();size=struct.unpack_from('<I',raw,12)[0]
doc=json.loads(raw[20:20+size]);tail=raw[20+size:]
for mat in doc.get('materials',[]):
 if mat['name'] in legacy_factors:mat.setdefault('pbrMetallicRoughness',{})['baseColorFactor']=legacy_factors[mat['name']]
packed=json.dumps(doc,separators=(',',':'),ensure_ascii=False).encode();packed+=b' '*((-len(packed))%4)
path.write_bytes(struct.pack('<4sII',b'glTF',2,20+len(packed)+len(tail))+struct.pack('<I4s',len(packed),b'JSON')+packed+tail)
print('P2_CITY_HOUSE_READY',json.dumps({'supports':len(supports),'obstacles':len(data['obstacles']),'sha256':hashlib.sha256(path.read_bytes()).hexdigest()}))
