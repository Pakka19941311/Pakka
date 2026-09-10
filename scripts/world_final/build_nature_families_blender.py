"""Author native dead-tree, deciduous understorey and fallen-wood families.

Existing D03 meshes and image pixels are preserved. New meshes and three LODs
are saved before world placement. Run with Blender --background --python.
"""
from pathlib import Path
import bpy, json, math, hashlib, random
from mathutils import Vector, Matrix

ROOT=Path(__file__).resolve().parents[2]
OUT=ROOT/'godot-pc/world-final/nature'
TARGET=ROOT/'art/world-final/Varendor_Nature_D-08A.blend'
if TARGET.exists():raise RuntimeError('Preserve the authored master; use a new revision')
bpy.ops.wm.read_factory_settings(use_empty=True)
# Load the preserved mesh library, not thousands of placed world instances.
# This keeps each prototype modifier evaluation local and bounded.
with bpy.data.libraries.load(str(ROOT/'art/world-final/Varendor_Nature_D-03.blend'),link=False) as (available,requested):
    requested.collections=['D02_Original_Wood_Prototypes']
source=json.loads((OUT/'authored-D03.json').read_text())
root=bpy.data.collections.new('D08A_Authored_Nature_Families');bpy.context.scene.collection.children.link(root)
catalog={};profiles={};prototype_collections={}

def own_collection(key):
    coll=bpy.data.collections.new('Prototype_'+key);root.children.link(coll);prototype_collections[key]=coll
    return coll

def import_flat(path,coll):
    before=set(bpy.data.objects);bpy.ops.import_scene.gltf(filepath=str(path))
    imported=list(set(bpy.data.objects)-before);result=[]
    for obj in imported:
        if obj.type!='MESH':continue
        transform=obj.matrix_world.copy();obj.parent=None;obj.data.transform(transform);obj.matrix_world=Matrix.Identity(4)
        for previous in list(obj.users_collection):previous.objects.unlink(obj)
        coll.objects.link(obj);result.append(obj)
    for obj in imported:
        if obj.type!='MESH':bpy.data.objects.remove(obj,do_unlink=True)
    return result

def reduce(obj,ratio):
    # Blender 4.2.3 Decimate can leave duplicate faces/unused corners on the
    # small disconnected leaf mesh. Repair only this derived copy before it
    # reaches another modifier/normal calculation; original sources stay intact.
    obj.data.validate(clean_customdata=True)
    bpy.context.view_layer.objects.active=obj
    modifier=obj.modifiers.new('Authored distance reduction','DECIMATE');modifier.ratio=ratio;modifier.use_collapse_triangulate=True
    bpy.ops.object.modifier_apply(modifier=modifier.name)
    repaired=obj.data.validate(clean_customdata=True)
    obj.data.update()
    if repaired:print('REPAIRED_DERIVED_TOPOLOGY '+obj.name,flush=True)

def tube(name,points,radii,material,coll,sides=9):
    vertices=[];faces=[];uvs=[];length=0.0
    for i,point in enumerate(points):
        point=Vector(point)
        tangent=(Vector(points[min(i+1,len(points)-1)])-Vector(points[max(0,i-1)])).normalized()
        axis=tangent.cross(Vector((0,1,0)))
        if axis.length<.01:axis=tangent.cross(Vector((1,0,0)))
        axis.normalize();second=tangent.cross(axis).normalized()
        if i:length+=(point-Vector(points[i-1])).length
        for j in range(sides):
            angle=j/sides*math.tau;vertices.append(point+radii[i]*(math.cos(angle)*axis+math.sin(angle)*second));uvs.append((j/sides,length*.45))
        if i:
            for j in range(sides):faces.append(((i-1)*sides+j,(i-1)*sides+(j+1)%sides,i*sides+(j+1)%sides,i*sides+j))
    faces.extend([tuple(reversed(range(sides))),tuple(range((len(points)-1)*sides,len(points)*sides))])
    mesh=bpy.data.meshes.new(name);mesh.from_pydata(vertices,[],faces);mesh.materials.append(material);mesh.update()
    uv=mesh.uv_layers.new(name='UVMap')
    for loop in mesh.loops:uv.data[loop.index].uv=uvs[loop.vertex_index]
    for poly in mesh.polygons:poly.use_smooth=True
    obj=bpy.data.objects.new(name,mesh);coll.objects.link(obj);return obj

def finish(key,parts,group,ratios,tree=False):
    coll=prototype_collections[key]
    points=[obj.matrix_world@v.co for obj in parts for v in obj.data.vertices]
    low=[min(v[i] for v in points) for i in range(3)];high=[max(v[i] for v in points) for i in range(3)]
    entry={'group':group,'is_tree':tree,'source_license':'CC0-1.0','source_receipt':'docs/assets/world-source-manifest.json','prototype_collection':coll.name,'lods':[]}
    if tree:
        base=[p for p in points if .25<p.z<1.5]
        center=Vector(((min(v.x for v in base)+max(v.x for v in base))*.5,(min(v.y for v in base)+max(v.y for v in base))*.5,0))
        radius=max(Vector((p.x-center.x,p.y-center.y)).length for p in base)
        profiles[key]={'x':center.x,'z':-center.y,'radius':radius}
    for lod,ratio in enumerate(ratios):
        copies=[];reduced_meshes={}
        for original in parts:
            obj=original.copy();coll.objects.link(obj);copies.append(obj)
            identity=original.data.as_pointer()
            if identity not in reduced_meshes:
                obj.data=original.data.copy()
                if ratio<1:reduce(obj,ratio)
                reduced_meshes[identity]=obj.data
            else:obj.data=reduced_meshes[identity]
        bpy.ops.object.select_all(action='DESELECT')
        for obj in copies:obj.select_set(True)
        target=OUT/f'assets/{key}_D08_lod{lod}.glb'
        bpy.ops.export_scene.gltf(filepath=str(target),export_format='GLB',use_selection=True,export_yup=True,export_animations=False,export_cameras=False,export_lights=False)
        triangles=sum(len(p.vertices)-2 for o in copies for p in o.data.polygons)
        entry['lods'].append({'path':target.relative_to(OUT).as_posix(),'source':target.relative_to(ROOT).as_posix(),'sha256':hashlib.sha256(target.read_bytes()).hexdigest(),'triangles':triangles,'low':[low[0],low[2],-high[1]],'high':[high[0],high[2],-low[1]],'derived_native':TARGET.relative_to(ROOT).as_posix()})
        for obj in copies:bpy.data.objects.remove(obj,do_unlink=True)
    catalog[key]=entry
    print('FAMILY '+key+' '+json.dumps([v['triangles'] for v in entry['lods']]),flush=True)

pine_source=bpy.data.collections['D02_Original_Wood_Prototypes']
wood_material=next(o.data.materials[0] for o in pine_source.objects if o.type=='MESH' and 'bark' in o.name)
for variant in range(3):
    key=f'dead_pine_{variant}';coll=own_collection(key);parts=[]
    for original in pine_source.objects:
        if original.type!='MESH' or not original.name.startswith(f'D02_pine_tree_01_{variant}_') or 'twig' in original.name:continue
        obj=original.copy();obj.data=original.data.copy();obj.parent=None;obj.data.transform(original.matrix_world);obj.matrix_world=Matrix.Identity(4);coll.objects.link(obj);parts.append(obj)
        for vertex in obj.data.vertices:
            z=vertex.co.z;vertex.co.x+=math.sin(z*.19+variant)*(.005*z*z);vertex.co.y+=math.sin(z*.13)*(.004*z*z)*(1 if variant%2 else -1)
        reduce(obj,.45)
    for arm in range(7):
        angle=arm*math.tau/7+.27*variant;length=1.4+(arm%3)*.43
        points=[(0,0,.38),(math.cos(angle)*.6,math.sin(angle)*.6,.14),(math.cos(angle+.12)*length,math.sin(angle+.12)*length,-.03)]
        parts.append(tube(f'{key}_root_{arm}',points,[.15,.10,.025],wood_material,coll,7))
    finish(key,parts,'dead_pine',[1,.22,.035],True)

for variant in range(2):
    key=f'alder_understorey_{variant}';coll=own_collection(key);rng=random.Random(9081+variant);height=4.6+variant*1.9
    parts=[tube(key+'_stem',[(0,0,-.06),(.07,0,height*.23),(-.08,.1,height*.56),(.24,.05,height*.83),(.35,.10,height)],[.16,.12,.08,.045,.012],wood_material,coll)]
    leaf_parts=import_flat(OUT/'assets/shrub_04_0_lod0.glb',coll)
    for obj in leaf_parts:reduce(obj,.095)
    for branch in range(24+variant*8):
        angle=branch*2.39996323;level=height*(.38+.57*branch/(23+variant*8));extent=(.65+math.sin(branch/(24+variant*8)*math.pi)*.9)*(1+variant*.15)
        start=Vector((.04,0,level-.35));end=Vector((math.cos(angle)*extent,math.sin(angle)*extent,level))
        parts.append(tube(f'{key}_branch_{branch}',[start,start*.48+end*.52+Vector((0,0,.1)),end],[.035,.022,.005],wood_material,coll,6))
        for spray in range(3):
            for original in leaf_parts:
                obj=original.copy();obj.data=original.data;coll.objects.link(obj)
                obj.name=f'{key}_leaf_spray_{branch}_{spray}'
                obj.location=end+Vector((math.cos(angle)*.18*spray,math.sin(angle)*.18*spray,.1*spray))
                obj.rotation_euler=(rng.uniform(-.22,.22),rng.uniform(-.4,.4),angle+math.pi+rng.uniform(-.6,.6));obj.scale=(1.2,1.2,1.2);parts.append(obj)
    for obj in leaf_parts:bpy.data.objects.remove(obj,do_unlink=True)
    finish(key,parts,'deciduous_understorey',[1,.35,.06],True)

for key,folder in [('fallen_trunk_0','dead_tree_trunk'),('stump_0','tree_stump_01')]:
    coll=own_collection(key)
    path=ROOT/f'public/assets/models/realism/{folder}/{folder}_1k.gltf'
    parts=import_flat(path,coll)
    for obj in parts:reduce(obj,.13)
    finish(key,parts,'deadwood',[1,.25])

for image in bpy.data.images:
    if image.source=='FILE' and image.has_data and not image.packed_file:image.pack()
root.hide_viewport=True;root.hide_render=True
bpy.context.scene['status']='D08A authored nature prototypes; population and full-world vegetation are not complete'
bpy.ops.wm.save_as_mainfile(filepath=str(TARGET),compress=True)
document={'revision':'D08A','catalog':catalog,'trunk_profiles':profiles,'native_source':TARGET.relative_to(ROOT).as_posix(),'native_sha256':hashlib.sha256(TARGET.read_bytes()).hexdigest(),'visual_verified':False,'source_notes':'Dead pine topology derived from D03 restored Poly Haven wood. Alder stems/branches authored here; leaf sprays from existing CC0 shrub_04. Deadwood scans reuse licensed project sources. Texture pixels unchanged.'}
(OUT/'families-D08A.json').write_text(json.dumps(document,indent=2)+'\n',encoding='utf-8',newline='\n')
print('NATURE_FAMILIES_NATIVE_SAVED '+str(TARGET),flush=True)
