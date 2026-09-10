"""Edit the preserved B06 native world into C05 architectural geometry.

Terrain, roads, water and landmark pivots are retained from the actual master.
Only identified blockout components are replaced. Never overwrites a master.
"""
from pathlib import Path
import bpy,hashlib,json,math,random,sys
from mathutils import Vector
sys.path.insert(0,str(Path(__file__).resolve().parent))
from export_landmark_collision import export_collision

ROOT=Path(__file__).resolve().parents[2];GEO=ROOT/'godot-pc/world-final/geography'
SOURCE=ROOT/'art/world-final/Varendor_Geography_final-1.0-layout-06.blend'
TARGET=ROOT/'art/world-final/Varendor_Architecture_C-05.blend'
if TARGET.exists():raise RuntimeError('Preserve existing native master; choose a new version')
bpy.ops.wm.open_mainfile(filepath=str(SOURCE))
coll=bpy.data.collections['03_Editable_Spatial_Landmarks_STAGE_B']
water=bpy.data.collections['02_Water_Basins_And_Flow']
layout=json.loads((ROOT/'godot-pc/world-final/world_layout.json').read_text('utf-8'))
support=json.loads((GEO/'support-surfaces.json').read_text('utf-8'))
rng=random.Random(91835);metrics=[]

def pbr(name,color,texture=None,normal=.45):
    mat=bpy.data.materials.new(name);mat.use_nodes=True
    nodes=mat.node_tree.nodes;links=mat.node_tree.links;bsdf=nodes.get('Principled BSDF')
    bsdf.inputs['Base Color'].default_value=(*color,1);bsdf.inputs['Roughness'].default_value=.85
    if texture:
        for suffix,socket in [('albedo.jpg','Base Color'),('roughness.png','Roughness'),('normal.jpg',None)]:
            path=ROOT/'godot-pc/generated'/f'world_{texture}_{suffix}'
            if not path.exists():continue
            image=bpy.data.images.load(str(path),check_existing=True);image.pack()
            if socket!='Base Color':image.colorspace_settings.name='Non-Color'
            node=nodes.new('ShaderNodeTexImage');node.image=image
            if socket:links.new(node.outputs['Color'],bsdf.inputs[socket])
            else:
                norm=nodes.new('ShaderNodeNormalMap');norm.inputs['Strength'].default_value=normal
                links.new(node.outputs['Color'],norm.inputs['Color']);links.new(norm.outputs['Normal'],bsdf.inputs['Normal'])
    return mat

stone=pbr('C_Masonry_2m',(.33,.34,.32),'castle_wall_slates')
roof=pbr('C_Slate_2m',(.15,.20,.23),'roof_slates_02')
wood=pbr('C_Aged_Timber_2m',(.2,.12,.07),'medieval_wood')
plaster=pbr('C_Lime_Plaster',(.53,.49,.39))
dark=pbr('C_Recess_Shadow',(.026,.032,.032))
iron=pbr('C_Forged_Iron',(.085,.085,.074));iron.node_tree.nodes.get('Principled BSDF').inputs['Metallic'].default_value=.65
glass=pbr('C_Old_Glass',(.075,.12,.13));glass.node_tree.nodes.get('Principled BSDF').inputs['Roughness'].default_value=.32
trim=pbr('C_Dressed_Stone',(.42,.42,.37))

def xyz(p):return p[0],-p[2],p[1]
def uv_project(obj,scale=2):
    uv=obj.data.uv_layers.get('UVMap') or obj.data.uv_layers.new(name='UVMap')
    for face in obj.data.polygons:
        axis=max(range(3),key=lambda i:abs(face.normal[i]));axes=[i for i in range(3) if i!=axis]
        for li in face.loop_indices:
            p=obj.data.vertices[obj.data.loops[li].vertex_index].co
            uv.data[li].uv=(p[axes[0]]/scale,p[axes[1]]/scale)
def mesh(name,verts,faces,mat,parent):
    data=bpy.data.meshes.new(name);data.from_pydata([xyz(v) for v in verts],[],faces);data.update()
    obj=bpy.data.objects.new(name,data);coll.objects.link(obj);obj.parent=parent;data.materials.append(mat)
    obj['world_stage']='C architecture';uv_project(obj);return obj
def box(name,pos,size,mat,parent):
    x,y,z=pos;sx,sy,sz=size
    return mesh(name,[(x+a*sx/2,y+b*sy,z+c*sz/2) for a,b,c in [(-1,0,-1),(1,0,-1),(1,0,1),(-1,0,1),(-1,1,-1),(1,1,-1),(1,1,1),(-1,1,1)]],[(0,1,2,3),(4,7,6,5),(0,4,5,1),(1,5,6,2),(2,6,7,3),(3,7,4,0)],mat,parent)
def cylinder(name,pos,radius,height,mat,parent,n=12,top_radius=None):
    x,y,z=pos;r2=radius if top_radius is None else top_radius
    verts=[(x+r*math.cos(a*math.tau/n),yy,z+r*math.sin(a*math.tau/n)) for yy,r in [(y,radius),(y+height,r2)] for a in range(n)]
    faces=[tuple(reversed(range(n))),tuple(range(n,n*2))]+[(i,(i+1)%n,(i+1)%n+n,i+n) for i in range(n)]
    return mesh(name,verts,faces,mat,parent)
def beam(name,a,b,width,mat,parent):
    a=Vector(a);b=Vector(b);direction=(b-a).normalized()
    u=direction.cross(Vector((0,0,1)))
    if u.length<.1:u=direction.cross(Vector((1,0,0)))
    u.normalize();v=direction.cross(u).normalized()
    verts=[p+(u*su+v*sv)*width/2 for p in [a,b] for su,sv in [(-1,-1),(1,-1),(1,1),(-1,1)]]
    return mesh(name,verts,[(0,3,2,1),(4,5,6,7),(0,1,5,4),(1,2,6,5),(2,3,7,6),(3,0,4,7)],mat,parent)
def arch(name,x,y,z,rise,halfwidth,depth,mat,parent,thickness=.8,segments=13):
    # The opening stays empty. Each voussoir has its own measured collider.
    for i in range(segments):
        a=math.pi*i/segments;b=math.pi*(i+1)/segments
        points=[(x+rx*math.cos(t),y+ry*math.sin(t),zz) for zz in [z-depth/2,z+depth/2] for rx,ry,t in [(halfwidth,rise,a),(halfwidth,rise,b),(halfwidth+thickness,rise+thickness,b),(halfwidth+thickness,rise+thickness,a)]]
        mesh(f'{name}_lintel_{i:02}',points,[(0,3,2,1),(4,5,6,7),(0,1,5,4),(1,2,6,5),(2,3,7,6),(3,0,4,7)],mat,parent)
def remove_component(parent,fragment):
    for obj in list(parent.children):
        if obj.type=='MESH' and fragment in obj.name:bpy.data.objects.remove(obj,do_unlink=True)

# Existing forms receive consistently sized UVs and shared material families.
for obj in list(coll.objects):
    if obj.type!='MESH':continue
    for i,mat in enumerate(obj.data.materials):
        replacement={'B_Fieldstone':stone,'B_Slate':roof,'B_Old_Timber':wood,'B_Plaster':plaster,'B_Shadowed_Entrances':dark}.get(mat.name)
        if replacement:obj.data.materials[i]=replacement
    uv_project(obj)

def window(name,x,y,z,parent,width=1.2,height=1.5,side=False):
    if side:
        box(name+'_recess',(x,y,z),(.16,height,width),dark,parent)
        box(name+'_glass',(x+.09,y+.12,z),(.04,height-.24,width-.2),glass,parent)
        for sign in [-1,1]:box(name+'_jamb',(x+.13,y,z+sign*(width/2+.09)),(.22,height+.2,.16),wood,parent)
        box(name+'_sill',(x+.18,y-.15,z),(.45,.2,width+.55),stone,parent)
        box(name+'_bar',(x+.15,y+.7,z),(.08,.08,width),wood,parent)
    else:
        box(name+'_recess',(x,y,z),(width,height,.16),dark,parent)
        box(name+'_glass',(x,y+.12,z+.09),(width-.2,height-.24,.04),glass,parent)
        for sign in [-1,1]:
            box(name+'_jamb',(x+sign*(width/2+.08),y,z+.14),(.16,height+.2,.22),wood,parent)
            box(name+'_shutter',(x+sign*(width*.78),y+.04,z+.10),(width*.34,height-.05,.12),wood,parent)
        box(name+'_sill',(x,y-.15,z+.18),(width+.6,.2,.45),stone,parent)
        box(name+'_bar',(x,y+.7,z+.15),(width,.08,.08),wood,parent)
        box(name+'_mullion',(x,y,z+.15),(.08,height,.08),wood,parent)

def house_detail(item,parent):
    name=item['id'];x,y,z=item['position'];sx,sy,sz=item['size'];wall=sy*.62
    if item['kind']=='church':return
    # Clear individual slate courses, projecting eaves and timber gable braces.
    for sign in [-1,1]:
        beam(name+'_eave',(x+sign*(sx/2+.5),y+wall,z-sz/2-.65),(x+sign*(sx/2+.5),y+wall,z+sz/2+.65),.22,wood,parent)
        for end in [-1,1]:beam(name+'_gable',(x+sign*(sx/2+.55),y+wall,z+end*(sz/2+.74)),(x,y+sy,z+end*(sz/2+.74)),.2,wood,parent)
    beam(name+'_ridge',(x,y+sy+.08,z-sz/2-.85),(x,y+sy+.08,z+sz/2+.85),.26,roof,parent)
    for i in range(1,max(2,int((sy-wall)/.5))):
        t=i/max(2,int((sy-wall)/.5));xx=(sx/2+.64)*(1-t);yy=y+wall+(sy-wall)*t+.04
        for sign in [-1,1]:beam(name+'_slate_course',(x+sign*xx,yy,z-sz/2-.7),(x+sign*xx,yy,z+sz/2+.7),.065,roof,parent)
    for sign in [-1,1]:
        for xx in [-sx/2,-sx/4,0,sx/4,sx/2]:box(name+'_frame',(x+xx,y+.35,z+sign*(sz/2+.09)),(.2,wall-.3,.2),wood,parent)
        for yy in [.7,wall-.12]+([3.3] if wall>5.7 else []):box(name+'_stringcourse',(x,y+yy,z+sign*(sz/2+.11)),(sx+.25,.22,.24),wood,parent)
        for end in [-1,1]:
            box(name+'_corner',(x+end*(sx/2+.09),y+.35,z+sign*sz/2),(.25,wall-.3,.25),wood,parent)
            beam(name+'_brace',(x+end*(sx/2-.25),y+wall-1.6,z+sign*(sz/2+.15)),(x+end*(sx/2-1.6),y+wall-.22,z+sign*(sz/2+.15)),.15,wood,parent)
    levels=[1.15]+([4.2] if wall>6.2 else [])
    for floor,yy in enumerate(levels):
        for n,offset in enumerate([-sx*.29,sx*.29]):window(f'{name}_window_{floor}_{n}',x+offset,y+yy,z+sz/2+.09,parent)
        for offset in [-sz*.28,sz*.28]:window(name+'_side_window',x+sx/2+.1,y+yy,z+offset,parent,side=True)
    # Existing closed decorative door retains the accepted non-enterable footprint.
    front=z+sz/2+.10
    box(name+'_door_panel',(x,y+.1,front+.08),(1.32,2.45,.10),wood,parent)
    for sign in [-1,1]:box(name+'_door_jamb',(x+sign*.83,y,front+.10),(.22,2.83,.32),trim,parent)
    box(name+'_door_lintel',(x,y+2.68,front+.10),(1.88,.28,.32),trim,parent)
    for yy in [.52,1.92]:box(name+'_hinge',(x,y+yy,front+.155),(1.12,.085,.04),iron,parent)
    box(name+'_latch',(x+.38,y+1.21,front+.20),(.08,.22,.10),iron,parent)
    cx=x+sx*.27;cz=z-sz*.2
    box(name+'_chimney',(cx,y+wall*.8,cz),(1.05,sy-wall*.8+1.2,1.2),stone,parent)
    box(name+'_chimney_cap',(cx,y+sy+1.15,cz),(1.3,.3,1.45),trim,parent)
    metrics.append({'id':name,'door_width':1.45,'door_height':2.65,'hero_height':1.84,'roof_height':sy,'decorative_door':True})

def tower_detail(parent,name,x,y,z,r,height,spire=False):
    # Cornices and a stone crown distinguish the tower from a plain cylinder.
    for level in [.8,height*.48,height-1.2]:cylinder(name+'_crown_band',(x,y+level,z),r+.28,.4,trim,parent,n=16)
    for i in range(12):
        a=i*math.tau/12
        if spire:
            continue
        box(name+'_battlement',(x+(r-.1)*math.cos(a),y+height,z+(r-.1)*math.sin(a)),(1.35,1.3,1.35),stone,parent)
    if spire:
        cylinder(name+'_roof_cone',(x,y+height,z),r*1.2,height*.34,roof,parent,n=12,top_radius=.1)
    for i in range(8):
        a=i*math.tau/8;xx=x+(r+.04)*math.cos(a);zz=z+(r+.04)*math.sin(a)
        slit=box(name+'_arrow_slit',(xx,y+height*.68,zz),(.30,1.8,.18),dark,parent)
        # The recess lies along the tangent to the cylinder.
        pivot=Vector(xyz((xx,y+height*.68,zz)))
        for v in slit.data.vertices:
            q=v.co-pivot;angle=math.pi/2-a;v.co=pivot+Vector((q.x*math.cos(angle)-q.y*math.sin(angle),q.x*math.sin(angle)+q.y*math.cos(angle),q.z))

def ruin_detail(item,parent):
    name=item['id'];x,y,z=item['position'];sx,sy,sz=item['size']
    for fragment in ['_walls','_roof','_door']:remove_component(parent,fragment)
    # Broken walls are separate pieces: collision never seals a visible opening.
    for sign in [-1,1]:
        box(name+'_broken_wall',(x+sign*(sx/2-.4),y,z-sz*.2),(.8,sy*(.5 if sign<0 else .83),sz*.6),stone,parent)
        box(name+'_broken_front',(x+sign*(sx/4+1),y,z+sz/2-.4),(sx/2-2,sy*.44,.8),stone,parent)
    box(name+'_rear_wall',(x-sx*.15,y,z-sz/2+.4),(sx*.7,sy*.72,.8),stone,parent)
    for i in range(7):
        xx=x-sx*.31+i*sx*.085
        box(name+'_ragged_coping',(xx,y+sy*.72,z-sz/2+.4),(sx*.082,rng.uniform(.2,1.25),.82),stone,parent)
    # Low slabs are walkable, not a full-height invisible box inside the ruin.
    for o in parent.children:
        if '_foundation' in o.name:o['walkable_floor']=True
    support['surfaces'].append({'id':name+'_floor','kind':'plane','x':x,'z':z,'halfX':(sx+1)/2,'halfZ':(sz+1)/2,'y':y+.3,'angle':0})
    edge=z+(sz+1)/2
    ramp=mesh(name+'_access_ramp',[(x-1.7,y,edge+2),(x+1.7,y,edge+2),(x+1.7,y+.3,edge),(x-1.7,y+.3,edge),(x-1.7,y,edge),(x+1.7,y,edge)],[(0,1,2,3),(0,3,4),(1,5,2),(4,3,2,5),(0,4,5,1)],stone,parent)
    support['surfaces'].append({'id':name+'_access_ramp','kind':'ramp_z','x':x,'z':edge+1,'halfX':1.7,'halfZ':1,'y':y,'high':y+.3,'angle':0})

for item in layout['objects']:
    parent=coll.objects.get(item['id'])
    if not parent:continue
    name=item['id'];kind=item['kind'];x,y,z=item['position'];sx,sy,sz=item['size']
    if kind in ['house','shed','civic_house']:house_detail(item,parent)
    elif kind=='ruined_house':ruin_detail(item,parent)
    elif kind in ['tower','ruined_tower']:
        tower_detail(parent,name,x,y,z,sx*.5,sy,kind=='tower')
    elif kind=='fortress':
        for sign in [-1,1]:
            for zz in range(int(z-sz/2+10),int(z+sz/2-8),13):
                box(name+'_buttress',(x+sign*(sx/2+2.8),y,zz),(1.1,sy*.64,2.2),stone,parent)
            for zz in range(int(z-sz/2+4),int(z+sz/2-3),4):
                box(name+'_merlon',(x+sign*(sx/2+.9),y+sy,zz),(1.8,1.6,1.8),stone,parent)
            for zz in [-sz/2,sz/2]:tower_detail(parent,name+'_corner',x+sign*sx/2,y,z+zz,8,item['tower_height'])
        for xx in range(int(x-sx/2+5),int(x+sx/2-4),4):
            for sign in [-1,1]:
                if sign==1 and abs(xx-x)<23:continue
                box(name+'_merlon',(xx,y+sy,z+sign*(sz/2+.9)),(1.8,1.6,1.8),stone,parent)
        for sign in [-1,1]:tower_detail(parent,name+'_gate',x+sign*14,y,z+sz/2,7,item['gate_tower_height'])
        arch(name+'_gate_arch',x,y+6,z+sz/2,7,7,5,trim,parent,1.0,17)
        for dx in range(-6,7):box(name+'_raised_portcullis',(x+dx,y+10,z+sz/2),(0.12,8,.14),iron,parent)
        for yy in [11,14,17]:box(name+'_portcullis_bar',(x,y+yy,z+sz/2),(13,.15,.18),iron,parent)
        metrics.append({'id':'FORT_GATE','clear_width_min':14,'clear_height_min':10,'wall_height':12,'tower_height':24,'gate_tower_height':26})
    elif kind=='church':
        # Gothic buttresses, portals, clerestory and a readable bell tower.
        for sign in [-1,1]:
            for dz in [-sz*.35,-sz*.15,sz*.08,sz*.30]:
                box(name+'_buttress',(x+sign*(sx/2+1.1),y,z+dz),(2.2,sy*.22,2.4),stone,parent)
                beam(name+'_flying_buttress',(x+sign*(sx/2+2.2),y+8,z+dz),(x+sign*(sx/2-.2),y+sy*.28,z+dz),1.0,trim,parent)
        front=z+sz/2+.2
        arch(name+'_portal',x,y+5,front,4.2,3.3,.7,trim,parent,.65,15)
        for sign in [-1,1]:box(name+'_portal_jamb',(x+sign*3.65,y,front),(.7,5,.7),trim,parent)
        box(name+'_closed_door',(x,y,front),(6.5,5,.12),wood,parent)
        for dx in [-sx*.3,sx*.3]:
            window(name+'_front_window',x+dx,y+5,front,parent,2.2,6.0)
            arch(name+'_window_arch',x+dx,y+11,front,2,1.1,.3,trim,parent,.3)
        for obj in parent.children:
            if '_bell_tower' in obj.name:
                for v in obj.data.vertices:v.co.z=y+(v.co.z-y)*(sy-12)/sy
        tower_detail(parent,name+'_bell',x,y,z-sz*.33,sx*.21,sy-12,False)
        cylinder(name+'_roof_spire',(x,y+sy-12,z-sz*.33),sx*.26,12,roof,parent,n=8,top_radius=.07)
    elif kind=='crypt':
        # Heavy stone family, no house-style timber frame on tombs.
        for sign in [-1,1]:box(name+'_pilaster',(x+sign*(sx*.42),y,z+sz/2+.13),(.7,sy*.59,.7),trim,parent)
        arch(name+'_portal',x,y+2.65,z+sz/2+.2,1.2,.75,.35,trim,parent,.32)
        box(name+'_cornice',(x,y+sy*.6,z),(sx+.5,.4,sz+.5),trim,parent)
    elif kind in ['mine_portal','cave_mouth']:
        if kind=='mine_portal':
            for sign in [-1,1]:
                box(name+'_timber_jamb',(x+sign*sx*.36,y,z+sz*.52),(.85,sy*.78,.85),wood,parent)
                beam(name+'_brace',(x+sign*sx*.35,y+sy*.55,z+sz*.55),(x+sign*sx*.20,y+sy*.75,z+sz*.55),.65,wood,parent)
            box(name+'_crossbeam',(x,y+sy*.76,z+sz*.52),(sx*.85,.9,1.0),wood,parent)
            for sign in [-1,1]:
                rail=box(name+'_rail',(x+sign*.7,y+.06,z+sz*.4),(.09,.08,sz*1.4),iron,parent)
                rail['walkable_floor']=True
        else:
            remove_component(parent,'_lintel')
            arch(name+'_natural_arch',x,y+sy*.4,z+sz*.05,sy*.43,sx*.38,sz,stone,parent,3.5,17)
    elif kind=='sanctuary':
        parent['ground_level']=y+3
        remove_component(parent,'_entablature')
        for o in list(parent.children):
            if '_column' not in o.name:continue
            low=min(v.co.z for v in o.data.vertices);center=o.location
            # Existing cylinder location contains its authored pivot.
            xx=center.x;zz=-center.y
            cylinder(name+'_column_base',(xx,y+3,zz),2.7,.8,trim,parent,n=12)
            cylinder(name+'_column_capital',(xx,y+3+sy*.7-.2,zz),2.5,.7,trim,parent,n=12)
        for left,right,zz in [(-.4,0,-.4),(.2,.4,-.4),(-.4,-.2,.4)]:
            box(name+'_broken_entablature',(x+sx*(left+right)/2,y+3+sy*.7,z+sz*zz),(sx*(right-left)+4,2.5,5),stone,parent)
        # Central broken monolith and altar leave the axial path and both flanks open.
        box(name+'_ritual_base',(x,y+3,z-8),(10,1.2,8),stone,parent)
        box(name+'_altar',(x,y+4.2,z-8),(5,1.7,2.8),trim,parent)
        for sign in [-1,1]:box(name+'_central_remnant',(x+sign*13,y+3,z-12),(3.2,34 if sign<0 else 25,4.0),stone,parent)
    parent['stage']='C architectural pass; atmosphere/dressing pending'

bpy.context.view_layer.update()
collision=export_collision(coll,GEO/'collision.json')
(GEO/'support-surfaces.json').write_text(json.dumps(support,indent=2)+'\n',encoding='utf-8',newline='\n')
bpy.ops.object.select_all(action='DESELECT')
for obj in [*coll.objects,*water.objects]:obj.select_set(True)
bpy.ops.export_scene.gltf(filepath=str(GEO/'landmarks.glb'),export_format='GLB',use_selection=True,export_animations=False,export_cameras=False,export_lights=False,export_yup=True)
bpy.context.scene['status']='C ARCHITECTURE PASS, FINAL VEGETATION/ATMOSPHERE NOT COMPLETE'
bpy.ops.wm.save_as_mainfile(filepath=str(TARGET),compress=True)
report={'revision':'C05','native_source':TARGET.relative_to(ROOT).as_posix(),'native_sha256':hashlib.sha256(TARGET.read_bytes()).hexdigest(),'source_preserved':SOURCE.relative_to(ROOT).as_posix(),'geometry':len([o for o in coll.objects if o.type=='MESH']),'collision_entries':len(collision),'scale_metrics':metrics,'routes_verified':False,'visual_verified':False,'main_integrated':False}
(ROOT/'docs/world-final/architecture-C05.json').write_text(json.dumps(report,indent=2)+'\n',encoding='utf-8',newline='\n')
print('ARCHITECTURE_C05_SAVED '+json.dumps(report),flush=True)
