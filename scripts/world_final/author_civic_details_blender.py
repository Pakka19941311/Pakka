"""C08 native edit: keep hierarchy and functional settlement/mine details."""
from pathlib import Path
import bpy,hashlib,json,math,sys
import numpy as np
sys.path.insert(0,str(Path(__file__).resolve().parent))
from export_landmark_collision import export_collision
from build_geography import sample_grid
ROOT=Path(__file__).resolve().parents[2];GEO=ROOT/'godot-pc/world-final/geography'
SOURCE=ROOT/'art/world-final/Varendor_Architecture_C-07.blend';TARGET=ROOT/'art/world-final/Varendor_Architecture_C-08.blend'
if TARGET.exists():raise RuntimeError('Preserve versioned native source')
bpy.ops.wm.open_mainfile(filepath=str(SOURCE))
coll=bpy.data.collections['03_Editable_Spatial_Landmarks_STAGE_B'];water=bpy.data.collections['02_Water_Basins_And_Flow']
heights=np.fromfile(GEO/'heightmap.f32',dtype='<f4').reshape(701,801)
stone=bpy.data.materials['C_Masonry_2m'];wood=bpy.data.materials['C_Aged_Timber_2m'];roof=bpy.data.materials['C_Slate_2m'];trim=bpy.data.materials['C_Dressed_Stone'];iron=bpy.data.materials['C_Forged_Iron'];dark=bpy.data.materials['C_Recess_Shadow']
carved=bpy.data.materials['C_Excavated_Stone'].copy();carved.name='C_Carved_Weathered_Stone'
for obj in list(coll.objects):
    if obj.type!='MESH':continue
    statue=obj.parent and obj.parent.name=='GRAVE_STATUE'
    headstone=obj.name.startswith('GRAVE_') and any(s in obj.name for s in ['_headstone','_cross','_shaft'])
    if statue or headstone:
        obj.data.materials.clear();obj.data.materials.append(carved)
    if statue and '_hood' in obj.name:
        mod=obj.modifiers.new('Worn_Carved_Edges','BEVEL');mod.width=.16;mod.segments=3
        bpy.context.view_layer.objects.active=obj;bpy.ops.object.modifier_apply(modifier=mod.name)
def xyz(p):return p[0],-p[2],p[1]
def mesh(name,verts,faces,mat,parent):
    d=bpy.data.meshes.new(name);d.from_pydata([xyz(v) for v in verts],[],faces);d.update();o=bpy.data.objects.new(name,d);coll.objects.link(o);o.parent=parent;d.materials.append(mat)
    uv=d.uv_layers.new(name='UVMap')
    for f in d.polygons:
        axis=max(range(3),key=lambda i:abs(f.normal[i]));axes=[i for i in range(3) if i!=axis]
        for li in f.loop_indices:
            p=d.vertices[d.loops[li].vertex_index].co;uv.data[li].uv=(p[axes[0]]/2,p[axes[1]]/2)
    return o
def box(name,pos,size,mat,parent):
    x,y,z=pos;sx,sy,sz=size
    return mesh(name,[(x+a*sx/2,y+b*sy,z+c*sz/2) for a,b,c in [(-1,0,-1),(1,0,-1),(1,0,1),(-1,0,1),(-1,1,-1),(1,1,-1),(1,1,1),(-1,1,1)]],[(0,1,2,3),(4,7,6,5),(0,4,5,1),(1,5,6,2),(2,6,7,3),(3,7,4,0)],mat,parent)
def cyl(name,x,y,z,r,h,mat,parent,top=None,n=16):
    r2=r if top is None else top
    return mesh(name,[(x+rr*math.cos(i*math.tau/n),yy,z+rr*math.sin(i*math.tau/n)) for yy,rr in [(y,r),(y+h,r2)] for i in range(n)],[tuple(reversed(range(n))),tuple(range(n,n*2))]+[(i,(i+1)%n,(i+1)%n+n,i+n) for i in range(n)],mat,parent)
def parent(name,location,x,z):
    y=float(sample_grid(heights,x,z));p=bpy.data.objects.new(name,None);coll.objects.link(p);p['landmark_id']=name;p['location_id']=location;p['ground_level']=y;p['stage']='C08 civic details';return p,y
def pitched(name,x,y,z,sx,wall,sz,height,parent,wallmat=stone):
    box(name+'_walls',(x,y,z),(sx,wall,sz),wallmat,parent)
    mesh(name+'_roof',[(x+dx,y+dy,z+dz) for dx,dy,dz in [(-sx/2-.6,wall,-sz/2-.7),(sx/2+.6,wall,-sz/2-.7),(0,height,-sz/2-.7),(-sx/2-.6,wall,sz/2+.7),(sx/2+.6,wall,sz/2+.7),(0,height,sz/2+.7)]],[(0,1,2),(3,5,4),(0,2,5,3),(2,1,4,5),(0,3,4,1)],roof,parent)

keep=coll.objects['F_KEEP']
for obj in list(keep.children):bpy.data.objects.remove(obj,do_unlink=True)
x,y,z=-128,70,116
pitched('F_KEEP_main',x,y,z,22,16,28,23,keep)
box('F_KEEP_foundation',(x,y-.3,z),(23,.65,29),stone,keep)
for sign in [-1,1]:
    tx=x+sign*12;tz=z-8
    cyl('F_KEEP_turret_shaft',tx,y,tz,3.6,21,stone,keep)
    cyl('F_KEEP_turret_crown',tx,y+20.5,tz,4.0,.7,trim,keep)
    cyl('F_KEEP_turret_roof',tx,y+21.2,tz,4.1,5.5,roof,keep,top=.05)
    for zz in [-9,0,9]:box('F_KEEP_buttress',(x+sign*11.4,y,z+zz),(1.1,12,1.6),stone,keep)
for yy in [3.5,8.5,13]:
    box('F_KEEP_belt',(x,y+yy-.4,z+14.12),(22,.22,.26),trim,keep)
    for dx in [-7,-3.5,3.5,7]:
        box('F_KEEP_window_recess',(x+dx,y+yy,z+14.08),(1.15,2.1,.13),dark,keep)
        for sign in [-1,1]:box('F_KEEP_window_jamb',(x+dx+sign*.69,y+yy-.1,z+14.15),(.18,2.35,.28),trim,keep)
        box('F_KEEP_window_lintel',(x+dx,y+yy+2.12,z+14.15),(1.58,.24,.28),trim,keep)
box('F_KEEP_closed_door',(x,y+.1,z+14.12),(2.6,4.0,.20),wood,keep)
for sign in [-1,1]:box('F_KEEP_gate_jamb',(x+sign*1.55,y,z+14.25),(.35,4.5,.55),trim,keep)
box('F_KEEP_gate_lintel',(x,y+4.2,z+14.25),(3.5,.45,.55),trim,keep)
keep['stage']='C08 keep: 22x28m hall, 23m roof, 26.7m turret tips; decorative closed entrance'

p,yy=parent('VILLAGE_WELL','L01',-503,355);x,z=-503,355
n=16;verts=[]
for r,h in [(1.6,0),(1.6,1.0),(1.15,1.0),(1.15,.15)]:
    verts += [(x+r*math.cos(i*math.tau/n),yy+h,z+r*math.sin(i*math.tau/n)) for i in range(n)]
faces=[]
for band in range(3):faces += [(band*n+i,band*n+(i+1)%n,(band+1)*n+(i+1)%n,(band+1)*n+i) for i in range(n)]
mesh('VILLAGE_WELL_masonry',verts,faces,stone,p)
cyl('VILLAGE_WELL_dark_water',x,yy+.17,z,1.14,.03,dark,p)
for sign in [-1,1]:box('VILLAGE_WELL_post',(x+sign*1.8,yy,z),(.25,3.1,.25),wood,p)
pitched('VILLAGE_WELL_cover',x,yy+3,z,4.3,.05,3.2,1.1,p,wood)
box('VILLAGE_WELL_rope',(x,yy+.4,z),(.025,2.7,.025),wood,p)
cyl('VILLAGE_WELL_bucket',x,yy+.55,z,.28,.42,wood,p,n=10)

barrels=[]
for idx,(location,x,z) in enumerate([('L01',-537,345),('L01',-537,347),('L01',-432,338),('L01',-499,283),('L02',-51,165),('L02',-51,167),('L06',478,62),('L06',478,64)]):
    p,y=parent(f'BARREL_{idx:02}',location,x,z)
    n=12;v=[]
    for h,r in [(0,.36),(.15,.43),(.58,.5),(1.05,.42),(1.15,.36)]:
        v += [(x+r*math.cos(i*math.tau/n),y+h,z+r*math.sin(i*math.tau/n)) for i in range(n)]
    mesh(f'BARREL_{idx:02}_body',v,[tuple(reversed(range(n))),tuple(range(4*n,5*n))]+[(k*n+i,k*n+(i+1)%n,(k+1)*n+(i+1)%n,(k+1)*n+i) for k in range(4) for i in range(n)],wood,p)
    for h,r in [(.16,.435),(.88,.453)]:cyl(f'BARREL_{idx:02}_hoop',x,y+h,z,r,.07,iron,p,n=12)
    barrels.append([x,y,z])

p,y=parent('MINE_CART','L05',23,-410);x,z=23,-410
box('MINE_CART_floor',(x,y+.62,z),(2.2,.16,1.4),wood,p)
for sign in [-1,1]:
    box('MINE_CART_side',(x,y+.7,z+sign*.7),(2.35,.75,.16),wood,p)
    box('MINE_CART_end',(x+sign*1.1,y+.7,z),(.16,.75,1.4),wood,p)
    for zz in [-.55,.55]:
        # Polygonal solid iron wheels, their axle axis lies along the cart width.
        wheel=mesh('MINE_CART_wheel',[(x+sign*.75+.37*math.cos(i*math.tau/12),y+.38+.37*math.sin(i*math.tau/12),z+zz+d) for d in [-.10,.10] for i in range(12)],[tuple(reversed(range(12))),tuple(range(12,24))]+[(i,(i+1)%12,(i+1)%12+12,i+12) for i in range(12)],iron,p)

# Ruined iron fence fragments; broken runs retain access between burial groups.
fences=[]
for idx,(cx,cz) in enumerate([(474,365),(551,378),(601,400),(493,490),(572,560),(434,580)]):
    p,y=parent(f'GRAVE_FENCE_{idx:02}','L12',cx,cz)
    for dx in [-6,0,6]:
        py=float(sample_grid(heights,cx+dx,cz));box('GRAVE_FENCE_stone_post',(cx+dx,py-.2,cz),(.7,1.65,.7),stone,p)
    for dx in range(-5,6):
        py=float(sample_grid(heights,cx+dx,cz));box('GRAVE_FENCE_iron',(cx+dx,py+.1,cz),(.065,1.1,.065),iron,p)
    for high in [.35,1.0]:box('GRAVE_FENCE_crossbar',(cx,y+high,cz),(12,.06,.06),iron,p)
    fences.append([cx,y,cz])

bpy.context.view_layer.update();obstacles=export_collision(coll,GEO/'collision.json')
bpy.ops.object.select_all(action='DESELECT')
for obj in [*coll.objects,*water.objects]:obj.select_set(True)
bpy.ops.export_scene.gltf(filepath=str(GEO/'landmarks.glb'),export_format='GLB',use_selection=True,export_animations=False,export_cameras=False,export_lights=False,export_yup=True)
bpy.ops.wm.save_as_mainfile(filepath=str(TARGET),compress=True)
meta=json.loads((GEO/'terrain.json').read_text('utf-8'));meta['native_source']=TARGET.relative_to(ROOT).as_posix();meta['architecture_revision']='C08'
(GEO/'terrain.json').write_text(json.dumps(meta,indent=2)+'\n',encoding='utf-8',newline='\n')
report={'revision':'C08','native_source':TARGET.relative_to(ROOT).as_posix(),'native_sha256':hashlib.sha256(TARGET.read_bytes()).hexdigest(),'keep':{'body':[22,16,28],'roof_height':23,'turret_height':26.7,'door':[2.6,4]},'barrels':barrels,'fences':fences,'well':[-503,355],'mine_cart':[23,-410],'collision_entries':len(obstacles),'visual_verified':False,'routes_verified':False}
(ROOT/'docs/world-final/architecture-C08.json').write_text(json.dumps(report,indent=2)+'\n',encoding='utf-8',newline='\n')
print('ARCHITECTURE_C08_SAVED '+json.dumps({'native_source':report['native_source'],'collisions':len(obstacles)}),flush=True)
