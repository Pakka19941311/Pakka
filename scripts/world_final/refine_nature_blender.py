"""D02: original wood topology, tighter twig silhouettes, open trail canopy."""
from pathlib import Path
import bpy,bmesh,json,hashlib,math,sys
import numpy as np
from mathutils import Vector
sys.path.insert(0,str(Path(__file__).resolve().parent))
from build_geography import sample_grid
ROOT=Path(__file__).resolve().parents[2];NATURE=ROOT/'godot-pc/world-final/nature'
TARGET=ROOT/'art/world-final/Varendor_Nature_D-02.blend'
if TARGET.exists():raise RuntimeError('Preserve native edits; select a new version')
bpy.ops.wm.open_mainfile(filepath=str(ROOT/'art/world-final/Varendor_Nature_D-01.blend'))
data=json.loads((NATURE/'authored-D01.json').read_text());height=np.fromfile(ROOT/'godot-pc/world-final/geography/heightmap.f32',dtype='<f4').reshape(701,801)
layout=json.loads((ROOT/'godot-pc/world-final/world_layout.json').read_text())
coll=bpy.data.collections.new('D02_Original_Wood_Prototypes');bpy.context.scene.collection.children.link(coll)
templates={};profiles={};stats=[]
for variant in range(3):
    key=f'pine_tree_01_{variant}';before=set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=str(ROOT/f'art/world-final/nature-source/pine-D02/pine_{variant}_restored.glb'))
    objects=list(set(bpy.data.objects)-before);parts=[]
    for obj in objects:
        if obj.type!='MESH':continue
        bpy.ops.object.select_all(action='DESELECT');obj.select_set(True);bpy.context.view_layer.objects.active=obj
        before_parts=set(bpy.data.objects);bpy.ops.object.mode_set(mode='EDIT');bpy.ops.mesh.select_all(action='SELECT');bpy.ops.mesh.separate(type='MATERIAL');bpy.ops.object.mode_set(mode='OBJECT')
        parts.extend([obj]+list(set(bpy.data.objects)-before_parts))
    for obj in parts:
        material=obj.data.materials[0];name=material.name
        obj.name=f'D02_{key}_{name}'
        ratio=.50 if name=='pine_tree_01_bark' else (.22 if 'trunk_' in name else 1.0)
        if ratio<1:
            bpy.context.view_layer.objects.active=obj
            modifier=obj.modifiers.new('Preserve wood volume','DECIMATE');modifier.ratio=ratio
            modifier.use_collapse_triangulate=True;bpy.ops.object.modifier_apply(modifier=modifier.name)
        if 'twig' not in name:
            for polygon in obj.data.polygons:polygon.use_smooth=True
        for old in list(obj.users_collection):old.objects.unlink(obj)
        coll.objects.link(obj)
    templates[key]=[(o.data,o.matrix_world.copy(),o.name) for o in parts]
    near=np.array([o.matrix_world@v.co for o in parts for v in o.data.vertices if .3<(o.matrix_world@v.co).z<1.7])
    center=(near[:,:2].min(axis=0)+near[:,:2].max(axis=0))*.5
    profiles[key]={'x':float(center[0]),'z':float(-center[1]),'radius':float(np.linalg.norm(near[:,:2]-center,axis=1).max())}
    for lod in range(2):
        export_parts=[]
        for original in parts:
            obj=original.copy();obj.data=original.data.copy();coll.objects.link(obj);export_parts.append(obj)
            if lod==1 and 'twig' not in obj.data.materials[0].name:
                bpy.context.view_layer.objects.active=obj;mod=obj.modifiers.new('Distant wood','DECIMATE');mod.ratio=.35;mod.use_collapse_triangulate=True;bpy.ops.object.modifier_apply(modifier=mod.name)
        bpy.ops.object.select_all(action='DESELECT')
        for obj in export_parts:obj.select_set(True)
        target=NATURE/f'assets/pine_D02_{variant}_lod{lod}.glb'
        bpy.ops.export_scene.gltf(filepath=str(target),export_format='GLB',use_selection=True,export_yup=True,export_animations=False,export_cameras=False,export_lights=False)
        triangles=sum(sum(len(p.vertices)-2 for p in obj.data.polygons) for obj in export_parts)
        old=data['catalog'][key]['lods'][lod]
        data['catalog'][key]['lods'][lod]={**old,'path':target.relative_to(NATURE).as_posix(),'sha256':hashlib.sha256(target.read_bytes()).hexdigest(),'triangles':triangles,'geometry_revision':'original wood source restored in D02','derived_native':'art/world-final/Varendor_Nature_D-02.blend'}
        stats.append({'asset':key,'lod':lod,'triangles':triangles})
        for obj in export_parts:bpy.data.objects.remove(obj,do_unlink=True)
coll.hide_render=True;coll.hide_viewport=True
segments=[]
for road in layout['roads']:
    for a,b in zip(road['points_xyz'],road['points_xyz'][1:]):segments.append((np.array([a[0],a[2]],float),np.array([b[0],b[2]],float),float(road['width'])/2))
def nearest(point):
    result=(1e9,None,0)
    for a,b,w in segments:
        ab=b-a;t=np.clip((point-a)@ab/max(.00001,float(ab@ab)),0,1);q=a+t*ab;distance=float(np.linalg.norm(point-q))-w
        if distance<result[0]:result=(distance,q,w)
    return result
obstacles=[];moved=[]
old_obstacles={o['id']:o for o in json.loads((NATURE/'collision-D01.json').read_text())['obstacles']}
for p in data['placements']:
    if p['kind']!='tree':
        if p['id'] in old_obstacles:obstacles.append(old_obstacles[p['id']])
        continue
    parent=bpy.data.objects[p['id']];key=p['asset'];s=p['scale'];yaw=p['yaw'];x,y,z=p['position']
    # The 3 m leaf clearance keeps the camera-facing trail open, preserving all
    # trees in nearby irregular groups instead of deleting the dense forest.
    point=np.array([x,z],float);distance,closest,width=nearest(point)
    if distance<3.8:
        direction=(point-closest)/max(.00001,float(np.linalg.norm(point-closest)))
        point=closest+direction*(width+3.85);x,z=point.tolist();moved.append(p['id'])
        y+=float(sample_grid(height,x,z))-p['ground'];p['ground']=float(sample_grid(height,x,z));p['position']=[x,y,z]
        parent.location=(x,-z,y)
    for child in list(parent.children):bpy.data.objects.remove(child,do_unlink=True)
    for mesh,transform,name in templates[key]:
        obj=bpy.data.objects.new(p['id']+'_'+name,mesh);bpy.data.collections['D01_Editable_Forest_Sample'].objects.link(obj);obj.parent=parent;obj.matrix_local=transform
    local=np.array([profiles[key]['x'],profiles[key]['z']])*s
    center=np.array([x,z])+np.array([local[0]*math.cos(yaw)+local[1]*math.sin(yaw),-local[0]*math.sin(yaw)+local[1]*math.cos(yaw)])
    obstacles.append({'id':p['id'],'kind':'circle','x':float(center[0]),'z':float(-center[1]),'radius':profiles[key]['radius']*s,'bottom':p['ground']-.1,'top':y+data['catalog'][key]['lods'][0]['high'][1]*s,'blocksMovement':True,'source_mesh':key,'landmark':p['id']})
for image in bpy.data.images:
    if image.source=='FILE' and image.has_data and not image.packed_file:image.pack()
bpy.context.scene['status']='D02 forest sample, improved source wood; whole world D is not finished'
bpy.ops.wm.save_as_mainfile(filepath=str(TARGET),compress=True)
data.update(revision='D02',native_source=TARGET.relative_to(ROOT).as_posix(),native_sha256=hashlib.sha256(TARGET.read_bytes()).hexdigest(),road_canopy_repositioned=moved)
(NATURE/'authored-D02.json').write_text(json.dumps(data,indent=2)+'\n',encoding='utf-8',newline='\n')
(NATURE/'collision-D02.json').write_text(json.dumps({'schema':1,'obstacles':obstacles},indent=2)+'\n',encoding='utf-8',newline='\n')
(ROOT/'docs/world-final/nature-D02.json').write_text(json.dumps({'native_source':data['native_source'],'sha256':data['native_sha256'],'prototypes':stats,'trunk_profiles':profiles,'moved_away_from_trail':len(moved),'tree_count':data['counts']['tree'],'visual_verified':False},indent=2)+'\n',encoding='utf-8')
print('NATURE_D02 '+json.dumps({'prototypes':stats,'repositioned':len(moved)}),flush=True)
