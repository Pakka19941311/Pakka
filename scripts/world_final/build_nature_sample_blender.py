"""Save real linked nature meshes in a new native world; export authored data."""
from pathlib import Path
import bpy,json,math,hashlib,sys,struct
import numpy as np
from mathutils import Matrix,Vector
sys.path.insert(0,str(Path(__file__).resolve().parent))
from build_geography import sample_grid
ROOT=Path(__file__).resolve().parents[2];OUT=ROOT/'godot-pc/world-final/nature'
SOURCE=ROOT/'art/world-final/Varendor_Architecture_C-09.blend';TARGET=ROOT/'art/world-final/Varendor_Nature_D-01.blend'
if TARGET.exists():raise RuntimeError('Preserve native manual changes; choose a new version')
data=json.loads((OUT/'sample-D01.json').read_text('utf-8'));layout=json.loads((ROOT/'godot-pc/world-final/world_layout.json').read_text('utf-8'))
height=np.fromfile(ROOT/'godot-pc/world-final/geography/heightmap.f32',dtype='<f4').reshape(701,801)
bpy.ops.wm.open_mainfile(filepath=str(SOURCE))
templates=bpy.data.collections.new('D01_Original_Nature_Prototypes');bpy.context.scene.collection.children.link(templates)
nature=bpy.data.collections.new('D01_Editable_Forest_Sample');bpy.context.scene.collection.children.link(nature)
parts={};profiles={}
for key,desc in data['catalog'].items():
    before=set(bpy.data.objects);bpy.ops.import_scene.gltf(filepath=str(ROOT/desc['lods'][0]['source']))
    new=set(bpy.data.objects)-before;parts[key]=[];trunk=[]
    for obj in new:
        for coll in list(obj.users_collection):coll.objects.unlink(obj)
        templates.objects.link(obj)
        if obj.type!='MESH':continue
        parts[key].append((obj.data,obj.matrix_world.copy(),obj.name))
        if desc['group']=='pine_tree_01':
            points=np.array([obj.matrix_world@v.co for v in obj.data.vertices]);near=points[(points[:,2]>.3)&(points[:,2]<1.7)]
            if len(near):trunk.extend(near[:,:2].tolist())
    if trunk:
        pts=np.array(trunk);center=(pts.min(axis=0)+pts.max(axis=0))*.5;radius=float(np.linalg.norm(pts-center,axis=1).max())
        profiles[key]={'x':float(center[0]),'z':float(-center[1]),'radius':radius}
templates.hide_render=True;templates.hide_viewport=True

segments=[]
for road in layout['roads']:
    for a,b in zip(road['points_xyz'],road['points_xyz'][1:]):segments.append((np.array([a[0],a[2]],float),np.array([b[0],b[2]],float),float(road['width'])/2))
def clearance(point):
    best=(1e9,None,0)
    for a,b,width in segments:
        ab=b-a;t=np.clip((point-a)@ab/(ab@ab),0,1);closest=a+t*ab;d=float(np.linalg.norm(point-closest))-width
        if d<best[0]:best=(d,closest,width)
    return best

authored=[];obstacles=[];adjusted=[]
for source in data['placements']:
    p=dict(source);key=p['asset'];scale=p['scale'];yaw=p['yaw'];x,y,z=p['position'];desc=data['catalog'][key]['lods'][0]
    radius=0
    if p['kind']=='tree':radius=profiles[key]['radius']*scale
    if p['kind']=='rock':radius=math.hypot(desc['high'][0]-desc['low'][0],desc['high'][2]-desc['low'][2])*.5*scale
    if radius:
        point=np.array([x,z],float);d,closest,width=clearance(point)
        if d<radius+.72:
            away=point-closest;away/=max(.00001,float(np.linalg.norm(away)))
            point=closest+away*(width+radius+.74);adjusted.append(p['id']);x,z=point.tolist()
    ground=float(sample_grid(height,x,z));y=ground-float(desc['low'][1])*scale-.055
    parent=bpy.data.objects.new(p['id'],None);nature.objects.link(parent)
    parent.location=(x,-z,y);parent.rotation_euler.z=yaw;parent.scale=(scale,scale,scale)
    for mesh,transform,name in parts[key]:
        obj=bpy.data.objects.new(p['id']+'_'+name,mesh);nature.objects.link(obj);obj.parent=parent;obj.matrix_local=transform
    parent['asset_key']=key;parent['kind']=p['kind'];parent['stable_id']=p['id'];parent['source_placement']='sample-D01.json';parent['ground']=ground
    p['position']=[x,y,z];p['ground']=ground;authored.append(p)
    if p['kind']=='tree':
        local=np.array([profiles[key]['x'],profiles[key]['z']])*scale
        center=np.array([x,z])+np.array([local[0]*math.cos(yaw)+local[1]*math.sin(yaw),-local[0]*math.sin(yaw)+local[1]*math.cos(yaw)])
        obstacles.append({'id':p['id'],'kind':'circle','x':float(center[0]),'z':float(-center[1]),'radius':radius,'bottom':ground-.1,'top':y+float(desc['high'][1])*scale,'blocksMovement':True,'source_mesh':key,'landmark':p['id']})
    elif p['kind']=='rock':
        local=np.array([(desc['low'][0]+desc['high'][0])*.5,(desc['low'][2]+desc['high'][2])*.5])*scale
        center=np.array([x,z])+np.array([local[0]*math.cos(yaw)+local[1]*math.sin(yaw),-local[0]*math.sin(yaw)+local[1]*math.cos(yaw)])
        obstacles.append({'id':p['id'],'kind':'box','x':float(center[0]),'z':float(-center[1]),'halfX':(desc['high'][0]-desc['low'][0])*.5*scale,'halfZ':(desc['high'][2]-desc['low'][2])*.5*scale,'rotation':-yaw,'bottom':ground-.1,'top':y+float(desc['high'][1])*scale,'blocksMovement':True,'source_mesh':key,'landmark':p['id']})

for image in bpy.data.images:
    if image.source=='FILE' and image.has_data and not image.packed_file:
        try:image.pack()
        except RuntimeError:pass
bpy.context.scene['status']='D01 real forest sample; whole-world vegetation is not finished'
bpy.ops.wm.save_as_mainfile(filepath=str(TARGET),compress=True)
data['placements']=authored;data['native_source']=TARGET.relative_to(ROOT).as_posix();data['native_sha256']=hashlib.sha256(TARGET.read_bytes()).hexdigest();data['road_clearance_adjustments']=adjusted
data['source_seed_layout_sha256']=hashlib.sha256((OUT/'sample-D01.json').read_bytes()).hexdigest()
(OUT/'authored-D01.json').write_text(json.dumps(data,indent=2)+'\n',encoding='utf-8',newline='\n')
(OUT/'collision-D01.json').write_text(json.dumps({'schema':1,'obstacles':obstacles},indent=2)+'\n',encoding='utf-8',newline='\n')
(ROOT/'docs/world-final/nature-D01.json').write_text(json.dumps({'native_source':data['native_source'],'native_sha256':data['native_sha256'],'counts':data['counts'],'moved_clear_of_trails':len(adjusted),'trunk_profiles':profiles,'visual_verified':False,'actual_canopy_verified':False,'full_world':False},indent=2)+'\n',encoding='utf-8',newline='\n')
print('NATURE_D01_NATIVE '+json.dumps({'instances':len(authored),'collisions':len(obstacles),'trail_adjustments':len(adjusted)}),flush=True)
