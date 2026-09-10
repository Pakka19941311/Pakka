"""Preserve C05, correct material export/ramp seams and author necropolis details."""
from pathlib import Path
import bpy,hashlib,json,math,random,sys
import numpy as np
from mathutils import Vector
sys.path.insert(0,str(Path(__file__).resolve().parent))
from export_landmark_collision import export_collision
from build_geography import sample_grid
ROOT=Path(__file__).resolve().parents[2];GEO=ROOT/'godot-pc/world-final/geography'
SOURCE=ROOT/'art/world-final/Varendor_Architecture_C-05.blend';TARGET=ROOT/'art/world-final/Varendor_Architecture_C-06.blend'
if TARGET.exists():raise RuntimeError('Preserve existing native source')
bpy.ops.wm.open_mainfile(filepath=str(SOURCE))
coll=bpy.data.collections['03_Editable_Spatial_Landmarks_STAGE_B'];water=bpy.data.collections['02_Water_Basins_And_Flow']
layout=json.loads((ROOT/'godot-pc/world-final/world_layout.json').read_text('utf-8'))
heights=np.fromfile(GEO/'heightmap.f32',dtype='<f4').reshape(701,801)
support=json.loads((GEO/'support-surfaces.json').read_text('utf-8'))
rng=random.Random(62180)
for name,factor in [('C_Masonry_2m',(.30,.32,.31)),('C_Slate_2m',(.11,.18,.24)),('C_Aged_Timber_2m',(.22,.18,.13))]:
    mat=bpy.data.materials[name];tree=mat.node_tree;bsdf=tree.nodes.get('Principled BSDF');socket=bsdf.inputs['Base Color']
    upstream=socket.links[0].from_socket
    mix=tree.nodes.new('ShaderNodeMix');mix.name='Authored_Albedo_Factor';mix.data_type='RGBA';mix.blend_type='MULTIPLY'
    mix.inputs[0].default_value=1;mix.inputs[7].default_value=(*factor,1)
    tree.links.new(upstream,mix.inputs[6]);tree.links.new(mix.outputs[2],socket)
    mat['albedo_factor']=factor
for name,color in [('C_Lime_Plaster',(.21,.20,.17)),('C_Dressed_Stone',(.16,.17,.16))]:
    bpy.data.materials[name].node_tree.nodes.get('Principled BSDF').inputs['Base Color'].default_value=(*color,1)
stone=bpy.data.materials['C_Masonry_2m'];trim=bpy.data.materials['C_Dressed_Stone'];iron=bpy.data.materials['C_Forged_Iron']
wood=bpy.data.materials['C_Aged_Timber_2m']

def xyz(p):return p[0],-p[2],p[1]
def mesh(name,verts,faces,mat,parent):
    d=bpy.data.meshes.new(name);d.from_pydata([xyz(v) for v in verts],[],faces);d.update()
    o=bpy.data.objects.new(name,d);coll.objects.link(o);o.parent=parent;d.materials.append(mat)
    uv=d.uv_layers.new(name='UVMap')
    for face in d.polygons:
        axis=max(range(3),key=lambda i:abs(face.normal[i]));axes=[i for i in range(3) if i!=axis]
        for li in face.loop_indices:
            p=d.vertices[d.loops[li].vertex_index].co;uv.data[li].uv=(p[axes[0]]/2,p[axes[1]]/2)
    return o
def box(name,pos,size,mat,parent):
    x,y,z=pos;sx,sy,sz=size
    return mesh(name,[(x+a*sx/2,y+b*sy,z+c*sz/2) for a,b,c in [(-1,0,-1),(1,0,-1),(1,0,1),(-1,0,1),(-1,1,-1),(1,1,-1),(1,1,1),(-1,1,1)]],[(0,1,2,3),(4,7,6,5),(0,4,5,1),(1,5,6,2),(2,6,7,3),(3,7,4,0)],mat,parent)
def parent_node(name,x,y,z):
    p=bpy.data.objects.new(name,None);coll.objects.link(p);p['landmark_id']=name;p['location_id']='L12';p['ground_level']=y;p['stage']='C necropolis';return p

# Low end of every ruin ramp touches measured terrain instead of a nominal plane.
ramps=[]
for surf in support['surfaces']:
    if surf['id'].startswith(('R01_','R02_','R03_','R04_')) and surf['kind']=='ramp_z':
        low=float(sample_grid(heights,surf['x'],surf['z']+surf['halfZ']))
        obj=coll.objects[surf['id']]
        old=float(surf['y'])
        for v in obj.data.vertices:
            if abs(v.co.z-old)<.0001:v.co.z=low
        surf['y']=low;ramps.append({'id':surf['id'],'old_low':old,'terrain_low':low,'top':surf['high']})

# One authored monumental robed guardian; not a new creature or boss.
statue=coll.objects['GRAVE_STATUE'];x,y,z=422,28,498
for o in list(statue.children):
    if '_figure' in o.name:bpy.data.objects.remove(o,do_unlink=True)
n=32;verts=[]
for i,(h,r,depth) in enumerate([(4,3.1,2.1),(5,2.8,1.8),(9,2.3,1.5),(13,1.7,1.25),(16,2.65,1.45),(17.5,2.3,1.4),(18,1.1,1.15)]):
    for j in range(n):
        a=j*math.tau/n;fold=1+.1*math.cos(9*a+i*.12)
        verts.append((x+r*math.cos(a)*fold,y+h,z+depth*math.sin(a)*fold))
faces=[tuple(reversed(range(n))),tuple(range(6*n,7*n))]+[(i*n+j,i*n+(j+1)%n,(i+1)*n+(j+1)%n,(i+1)*n+j) for i in range(6) for j in range(n)]
mesh('GRAVE_STATUE_robe',verts,faces,stone,statue)
# Hood and lowered head are solid carved forms, not a capsule placeholder.
verts=[(x+rx,y+hy,z+rz) for rx,hy,rz in [(-1.3,18,-.8),(1.3,18,-.8),(1.3,18,1.0),(-1.3,18,1.0),(-.85,21,-.7),(.85,21,-.7),(.8,20.5,.5),(-.8,20.5,.5),(0,22,-.15)]]
mesh('GRAVE_STATUE_hood',verts,[(0,1,2,3),(0,4,5,1),(1,5,6,2),(2,6,7,3),(3,7,4,0),(4,8,5),(5,8,6),(6,8,7),(7,8,4)],trim,statue)
box('GRAVE_STATUE_sword',(x,y+4,z+2.0),(.8,10,.38),trim,statue)
box('GRAVE_STATUE_crossguard',(x,y+14,z+2.0),(3.6,.5,.65),trim,statue)
for sign in [-1,1]:
    mesh('GRAVE_STATUE_folded_arm',[(x+sign*a,y+h,z+d) for a,h,d in [(2.4,16,0),(2.5,14,0),(.4,13.8,2),(.3,15,2),(2.1,16.3,-.8),(2.2,14.2,-.8),(.4,14.1,1.4),(.3,15.3,1.4)]],[(0,1,2,3),(4,7,6,5),(0,4,5,1),(1,5,6,2),(2,6,7,3),(3,7,4,0)],stone,statue)

# Graves in irregular groups, with lanes and existing road/building exclusions.
roads=[np.array(r['points_xyz'],float) for r in layout['roads']]
buildings=[i for i in layout['objects'] if i['location_id']=='L12']
def clear(x,z):
    for road,desc in zip(roads,layout['roads']):
        for a,b in zip(road,road[1:]):
            ab=b[[0,2]]-a[[0,2]];q=np.array([x,z])-a[[0,2]];t=np.clip(q@ab/(ab@ab),0,1)
            if np.linalg.norm(q-t*ab)<float(desc.get('width',7))/2+5:return False
    for item in buildings:
        xx,yy,zz=item['position'];sx,sy,sz=item['size']
        if abs(x-xx)<sx*.75+5 and abs(z-zz)<sz*.65+6:return False
    return True
plots=[(451,347),(518,325),(581,356),(655,389),(690,450),(519,460),(444,456),(539,537),(622,569),(403,552)]
graves=[]
for group,(cx,cz) in enumerate(plots):
    for row in range(5):
        for col in range(7):
            xx=cx+(col-3)*4+rng.uniform(-.5,.5);zz=cz+(row-2)*5+rng.uniform(-.7,.7)
            if not clear(xx,zz):continue
            yy=float(sample_grid(heights,xx,zz));name=f'GRAVE_{group+1:02}_{row:02}_{col:02}'
            p=parent_node(name,xx,yy,zz);height=rng.uniform(.85,1.7);width=rng.uniform(.65,1.1)
            box(name+'_base',(xx,yy-.10,zz),(width+.3,.25,.55),stone,p)
            variant=(group+row+col)%4
            if variant==0:
                box(name+'_shaft',(xx,yy+.12,zz),(.25,height,.22),trim,p)
                box(name+'_cross',(xx,yy+height*.7,zz),(width,.22,.22),trim,p)
            else:
                top=[(-width/2,height-.18),(width/2,height-.18),(width/2-.12,height),(-width/2+.12,height)] if variant==1 else [(-width/2,height),(width/2,height*.78),(width/2,height*.78),(-width/2,height)]
                outline=[(-width/2,.12),(width/2,.12),(width/2,height*.75),(width*.25,height),(0,height+.12),(-width*.3,height),(-width/2,height*.8)]
                if variant==3:outline=[(-width/2,.12),(width/2,.12),(width/2,height*.72),(.1,height*.85),(-.12,height*.67),(-width/2,height)]
                count=len(outline);v=[(xx+a,yy+b,zz+d) for d in [-.12,.12] for a,b in outline]
                f=[tuple(reversed(range(count))),tuple(range(count,count*2))]+[(i,(i+1)%count,(i+1)%count+count,i+count) for i in range(count)]
                mesh(name+'_headstone',v,f,stone,p)
            graves.append({'id':name,'position':[round(xx,3),round(yy,3),round(zz,3)],'variant':variant})

bpy.context.view_layer.update();obstacles=export_collision(coll,GEO/'collision.json')
(GEO/'support-surfaces.json').write_text(json.dumps(support,indent=2)+'\n',encoding='utf-8',newline='\n')
bpy.ops.object.select_all(action='DESELECT')
for o in [*coll.objects,*water.objects]:o.select_set(True)
bpy.ops.export_scene.gltf(filepath=str(GEO/'landmarks.glb'),export_format='GLB',use_selection=True,export_animations=False,export_cameras=False,export_lights=False,export_yup=True)
bpy.ops.wm.save_as_mainfile(filepath=str(TARGET),compress=True)
report={'revision':'C06','native_source':TARGET.relative_to(ROOT).as_posix(),'source_sha256':hashlib.sha256(TARGET.read_bytes()).hexdigest(),'ramps':ramps,'grave_count':len(graves),'graves':graves,'statue':'unique robed stone guardian; decorative landmark','collision_entries':len(obstacles),'visual_verified':False,'routes_verified':False,'main_integrated':False}
(ROOT/'docs/world-final/architecture-C06.json').write_text(json.dumps(report,indent=2)+'\n',encoding='utf-8',newline='\n')
meta=json.loads((GEO/'terrain.json').read_text('utf-8'));meta['native_source']=TARGET.relative_to(ROOT).as_posix();meta['architecture_revision']='C06'
(GEO/'terrain.json').write_text(json.dumps(meta,indent=2)+'\n',encoding='utf-8',newline='\n')
print('ARCHITECTURE_C06_SAVED '+json.dumps({k:v for k,v in report.items() if k!='graves'}),flush=True)
