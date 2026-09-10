"""C07: seat architecture on measured terrain and build a real lake pier access."""
from pathlib import Path
import bpy,hashlib,json,math,sys
import numpy as np
from mathutils import Matrix
sys.path.insert(0,str(Path(__file__).resolve().parent))
from export_landmark_collision import export_collision
from build_geography import sample_grid
ROOT=Path(__file__).resolve().parents[2];GEO=ROOT/'godot-pc/world-final/geography'
SOURCE=ROOT/'art/world-final/Varendor_Architecture_C-06.blend';TARGET=ROOT/'art/world-final/Varendor_Architecture_C-07.blend'
if TARGET.exists():raise RuntimeError('Versioned native source already exists')
bpy.ops.wm.open_mainfile(filepath=str(SOURCE))
coll=bpy.data.collections['03_Editable_Spatial_Landmarks_STAGE_B'];water=bpy.data.collections['02_Water_Basins_And_Flow']
layout=json.loads((ROOT/'godot-pc/world-final/world_layout.json').read_text('utf-8'))
heights=np.fromfile(GEO/'heightmap.f32',dtype='<f4').reshape(701,801)
stone=bpy.data.materials['C_Masonry_2m'];wood=bpy.data.materials['C_Aged_Timber_2m']
adjustments=[]
for item in layout['objects']:
    if item['kind'] not in ['house','shed','civic_house','crypt','statue','ruined_gate']:continue
    if item['location_id']=='L02':continue
    x,y,z=item['position'];sx,sy,sz=item['size'];angle=math.radians(item.get('rotation_y_deg',0))
    samples=[]
    for dx in np.linspace(-sx*.52,sx*.52,5):
        for dz in np.linspace(-sz*.52,sz*.52,5):
            xx=x+dx*math.cos(angle)+dz*math.sin(angle);zz=z-dx*math.sin(angle)+dz*math.cos(angle)
            samples.append(float(sample_grid(heights,xx,zz)))
    # Level masonry footings follow the local high edge, with a buried skirt.
    new_y=max(samples)+.06;delta=new_y-y
    parent=coll.objects[item['id']];parent.matrix_world.translation.z+=delta;parent['ground_level']=new_y
    parent['original_ground_level']=y;parent['terrain_seated']=True
    for obj in parent.children:
        if '_foundation' in obj.name or (item['kind']=='statue' and '_base' in obj.name):
            old_low=min(v.co.z for v in obj.data.vertices)
            for v in obj.data.vertices:
                if abs(v.co.z-old_low)<.001:v.co.z=min(samples)-.2-delta
        elif item['kind']=='ruined_gate' and any(s in obj.name for s in ['_left','_right']):
            old_low=min(v.co.z for v in obj.data.vertices)
            for v in obj.data.vertices:
                if abs(v.co.z-old_low)<.001:v.co.z=min(samples)-.2-delta
    adjustments.append({'id':item['id'],'original_y':y,'seated_y':new_y,'terrain_min':min(samples),'terrain_max':max(samples),'delta_y':delta})

# The upper mine opening is a facade in a slope; its supports reach the rock.
upper=coll.objects['MINE_UPPER'];upper_y=float(sample_grid(heights,64,-490));delta=upper_y-155
upper.matrix_world.translation.z+=delta;upper['ground_level']=upper_y
adjustments.append({'id':'MINE_UPPER','original_y':155,'seated_y':upper_y,'delta_y':delta})

def xyz(p):return p[0],-p[2],p[1]
def mesh(name,verts,faces,mat,parent):
    d=bpy.data.meshes.new(name);d.from_pydata([xyz(v) for v in verts],[],faces);d.update();o=bpy.data.objects.new(name,d)
    coll.objects.link(o);o.parent=parent;d.materials.append(mat);uv=d.uv_layers.new(name='UVMap')
    for f in d.polygons:
        axis=max(range(3),key=lambda i:abs(f.normal[i]));axes=[i for i in range(3) if i!=axis]
        for li in f.loop_indices:
            p=d.vertices[d.loops[li].vertex_index].co;uv.data[li].uv=(p[axes[0]]/2,p[axes[1]]/2)
    return o
def box(name,pos,size,mat,parent):
    x,y,z=pos;sx,sy,sz=size
    return mesh(name,[(x+a*sx/2,y+b*sy,z+c*sz/2) for a,b,c in [(-1,0,-1),(1,0,-1),(1,0,1),(-1,0,1),(-1,1,-1),(1,1,-1),(1,1,1),(-1,1,1)]],[(0,1,2,3),(4,7,6,5),(0,4,5,1),(1,5,6,2),(2,6,7,3),(3,7,4,0)],mat,parent)

pier=coll.objects['PIER']
for o in list(pier.children):bpy.data.objects.remove(o,do_unlink=True)
pier.matrix_world=Matrix.Identity(4);pier['ground_level']=41.2;pier['stage']='C07 pier with dry shore landing and sloped wooden access'
box('PIER_deck',(335,40.85,25),(20,.35,8),wood,pier)
box('PIER_landing_deck',(378.5,47.65,25),(7,.35,4),wood,pier)
mesh('PIER_access_ramp',[(345,41.2,23),(345,41.2,27),(375,48,27),(375,48,23),(345,40.85,23),(345,40.85,27),(375,47.65,27),(375,47.65,23)],[(0,1,2,3),(4,7,6,5),(0,4,5,1),(1,5,6,2),(2,6,7,3),(3,7,4,0)],wood,pier)
for xx in [327,335,343,350,360,370]:
    yy=41.2 if xx<345 else 41.2+(xx-345)/30*6.8
    zzs=[21.7,28.3] if xx<345 else [23.15,26.85]
    for zz in zzs:
        ground=float(sample_grid(heights,xx,zz))-.6
        box('PIER_post',(xx,ground,zz),(.32,yy-ground+.85,.32),wood,pier)
for sign in [-1,1]:
    box('PIER_guard_rail',(335,42.0,25+sign*3.8),(20,.16,.18),wood,pier)
support=json.loads((GEO/'support-surfaces.json').read_text('utf-8'))
support['surfaces']=[s for s in support['surfaces'] if not s['id'].startswith('PIER_')]
support['surfaces'] += [
    {'id':'PIER_deck','kind':'plane','x':335,'z':25,'halfX':10,'halfZ':4,'y':41.2,'angle':0},
    {'id':'PIER_landing_deck','kind':'plane','x':378.5,'z':25,'halfX':3.5,'halfZ':2,'y':48,'angle':0},
    {'id':'PIER_access_ramp','kind':'ramp_z','x':360,'z':25,'halfX':2,'halfZ':15,'y':41.2,'high':48,'angle':-math.pi/2}]

# Natural stone at the cave portal; source material is already licensed/packed.
with bpy.data.libraries.load(str(ROOT/'art/world-final/Varendor_Interiors_C-04.blend'),link=False) as (available,selected):
    selected.materials=['C_Excavated_Stone']
rock=selected.materials[0]
for obj in coll.objects['CAVE_MOUTH'].children:
    if obj.type=='MESH':
        obj.data.materials.clear();obj.data.materials.append(rock)
        bevel=obj.modifiers.new('Worn_Rock_Edges','BEVEL');bevel.width=.65;bevel.segments=2
        bpy.context.view_layer.objects.active=obj;obj.select_set(True);bpy.ops.object.modifier_apply(modifier=bevel.name);obj.select_set(False)

bpy.context.view_layer.update();obstacles=export_collision(coll,GEO/'collision.json')
(GEO/'support-surfaces.json').write_text(json.dumps(support,indent=2)+'\n',encoding='utf-8',newline='\n')
bpy.ops.object.select_all(action='DESELECT')
for obj in [*coll.objects,*water.objects]:obj.select_set(True)
bpy.ops.export_scene.gltf(filepath=str(GEO/'landmarks.glb'),export_format='GLB',use_selection=True,export_animations=False,export_cameras=False,export_lights=False,export_yup=True)
bpy.ops.wm.save_as_mainfile(filepath=str(TARGET),compress=True)
meta=json.loads((GEO/'terrain.json').read_text('utf-8'));meta['native_source']=TARGET.relative_to(ROOT).as_posix();meta['architecture_revision']='C07'
(GEO/'terrain.json').write_text(json.dumps(meta,indent=2)+'\n',encoding='utf-8',newline='\n')
report={'revision':'C07','native_source':TARGET.relative_to(ROOT).as_posix(),'native_sha256':hashlib.sha256(TARGET.read_bytes()).hexdigest(),'adjustments':adjustments,'pier':{'deck':[325,345,41.2],'shore_landing':[375,382,48],'access_slope_degrees':math.degrees(math.atan(6.8/30))},'terrain_edited':False,'routes_verified':False,'visual_verified':False}
(ROOT/'docs/world-final/architecture-C07.json').write_text(json.dumps(report,indent=2)+'\n',encoding='utf-8',newline='\n')
print('ARCHITECTURE_C07_SAVED '+json.dumps({'native_source':report['native_source'],'seated':len(adjustments),'collisions':len(obstacles)}),flush=True)
