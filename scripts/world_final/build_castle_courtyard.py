"""Independent, editable courtyard layer. Does not rewrite geography masters.

Run with Blender --background --python scripts/world_final/build_castle_courtyard.py.
Coordinates in the authored placement calls are server x,z (north is +z).
The same measured props produce the native mesh and server/client obstacles.
"""
from pathlib import Path
import bpy, bmesh, json, math, random, shutil, sys, struct
from mathutils import Vector

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / 'godot-pc/world-final/castle'
OUT.mkdir(parents=True, exist_ok=True)
# Reuse the existing authored animal meshes, but keep the final-map payload
# independent of an optional legacy-world CI cache.
(OUT/'wildlife').mkdir(exist_ok=True)
for species in ['crow','hare']:
    source=ROOT/'godot-pc/generated/wildlife'/f'{species}.glb'
    if source.exists():shutil.copy2(source,OUT/'wildlife'/source.name)
    assert (OUT/'wildlife'/f'{species}.glb').exists(),f'Missing existing animal: {species}'
bpy.ops.object.select_all(action='SELECT'); bpy.ops.object.delete(use_global=False)
rng = random.Random(11092026)
materials = {}; obstacles = []; anchors = []; props = []; group = None

def material(name, color, texture=None, metallic=0):
    m=bpy.data.materials.new(name); m.use_nodes=True
    bs=m.node_tree.nodes.get('Principled BSDF')
    bs.inputs['Base Color'].default_value=(*color,1); bs.inputs['Roughness'].default_value=.82
    bs.inputs['Metallic'].default_value=metallic
    if texture:
        for suffix,socket in [('albedo.jpg','Base Color'),('roughness.png','Roughness')]:
            path=ROOT/'godot-pc/generated'/f'world_{texture}_{suffix}'
            if path.exists():
                im=bpy.data.images.load(str(path),check_existing=True); im.pack()
                if socket!='Base Color': im.colorspace_settings.name='Non-Color'
                tex=m.node_tree.nodes.new('ShaderNodeTexImage'); tex.image=im
                m.node_tree.links.new(tex.outputs['Color'],bs.inputs[socket])
        normal_path=ROOT/'godot-pc/generated'/f'world_{texture}_normal.jpg'
        if normal_path.exists():
            im=bpy.data.images.load(str(normal_path),check_existing=True);im.pack();im.colorspace_settings.name='Non-Color'
            tex=m.node_tree.nodes.new('ShaderNodeTexImage');tex.image=im
            normal=m.node_tree.nodes.new('ShaderNodeNormalMap');normal.inputs['Strength'].default_value=.7
            m.node_tree.links.new(tex.outputs['Color'],normal.inputs['Color']);m.node_tree.links.new(normal.outputs['Normal'],bs.inputs['Normal'])
    materials[name]=m; return m

material('weathered_oak',(.24,.15,.08),'medieval_wood')
material('fieldstone',(.36,.36,.31),'castle_wall_slates')
material('iron',(.055,.067,.07),metallic=.65)
material('linen',(.57,.50,.35)); material('indigo',(.065,.15,.20)); material('wine',(.28,.07,.052))
material('brass',(.48,.32,.10),metallic=.35); material('straw',(.38,.28,.11))
material('apple',(.26,.085,.032)); material('herb',(.12,.23,.085)); material('parchment',(.69,.61,.43))
material('water',(.065,.16,.18),metallic=.25); material('coal',(.025,.026,.028))
material('embers',(.75,.13,.018)); material('sand',(.33,.28,.18))
material('courtyard_paving',(.35,.32,.27),'cobblestone_floor_001')
sand_image=bpy.data.images.load(str(ROOT/'godot-pc/world-final/nature/textures/trail_diff.jpg'),check_existing=True)
sand_image.pack()
sand_node=materials['sand'].node_tree.nodes.new('ShaderNodeTexImage'); sand_node.image=sand_image
materials['sand'].node_tree.links.new(sand_node.outputs['Color'],materials['sand'].node_tree.nodes.get('Principled BSDF').inputs['Base Color'])

def start(name,x,z,zone):
    global group
    group=bpy.data.objects.new(name,None); bpy.context.collection.objects.link(group)
    group.location=(x,z,70); group['zone']=zone; group['editable_courtyard_prop']=True
    props.append({'id':name,'x':x,'z':z,'zone':zone})

def finish(obj,mat):
    obj.parent=group; obj.data.materials.append(materials[mat])
    if obj.type=='MESH':
        uv=obj.data.uv_layers.get('UVMap') or obj.data.uv_layers.new(name='UVMap')
        for face in obj.data.polygons:
            axis=max(range(3),key=lambda i:abs(face.normal[i])); axes=[i for i in range(3) if i!=axis]
            for li in face.loop_indices:
                v=obj.data.vertices[obj.data.loops[li].vertex_index].co
                uv.data[li].uv=(v[axes[0]]/1.5,v[axes[1]]/1.5)
    return obj

def box(name,p,s,mat='weathered_oak',bevel=.025):
    # Direct mesh construction avoids a full scene dependency update for each
    # board/stone; the previous operator loop grew quadratic with a furnished inn.
    data=bpy.data.meshes.new(name)
    data.from_pydata([(a*s[0]/2,b*s[1]/2,c*s[2]/2) for a,b,c in [(-1,-1,-1),(1,-1,-1),(1,1,-1),(-1,1,-1),(-1,-1,1),(1,-1,1),(1,1,1),(-1,1,1)]],[],[(0,3,2,1),(4,5,6,7),(0,1,5,4),(1,2,6,5),(2,3,7,6),(3,0,4,7)])
    if bevel:
        bm=bmesh.new();bm.from_mesh(data)
        bmesh.ops.bevel(bm,geom=list(bm.edges),offset=min(bevel,min(s)*.35),segments=1,affect='EDGES')
        bm.to_mesh(data);bm.free()
    data.update();o=bpy.data.objects.new(name,data);bpy.context.collection.objects.link(o);o.location=p
    return finish(o,mat)

def cylinder(name,p,r,h,mat='weathered_oak',r2=None,n=12):
    upper=r if r2 is None else r2
    v=[(rr*math.cos(i*math.tau/n),rr*math.sin(i*math.tau/n),yy) for rr,yy in [(r,-h/2),(upper,h/2)] for i in range(n)]
    f=[tuple(reversed(range(n))),tuple(range(n,n*2))]+[(i,(i+1)%n,(i+1)%n+n,i+n) for i in range(n)]
    data=bpy.data.meshes.new(name);data.from_pydata(v,[],f);data.update()
    o=bpy.data.objects.new(name,data);bpy.context.collection.objects.link(o);o.location=p
    return finish(o,mat)

def sphere(name,p,s,mat):
    v=[(s[0]*math.sin(j*math.pi/6)*math.cos(i*math.tau/10),s[1]*math.sin(j*math.pi/6)*math.sin(i*math.tau/10),s[2]*math.cos(j*math.pi/6)) for j in range(7) for i in range(10)]
    f=[(j*10+i,j*10+(i+1)%10,(j+1)*10+(i+1)%10,(j+1)*10+i) for j in range(6) for i in range(10)]
    data=bpy.data.meshes.new(name);data.from_pydata(v,[],f);data.update()
    o=bpy.data.objects.new(name,data);bpy.context.collection.objects.link(o);o.location=p
    for f in o.data.polygons:f.use_smooth=True
    return finish(o,mat)

def beam(name,a,b,r=.06,mat='weathered_oak',n=8):
    a,b=Vector(a),Vector(b); o=cylinder(name,(a+b)/2,r,(b-a).length,mat,n=n)
    o.rotation_euler=(b-a).to_track_quat('Z','Y').to_euler(); return o

def mesh(name,v,f,mat):
    data=bpy.data.meshes.new(name); data.from_pydata(v,[],f); data.update()
    o=bpy.data.objects.new(name,data); bpy.context.collection.objects.link(o); return finish(o,mat)

def block(x,z,sx,sz,h,low=0,movement=True):
    obstacles.append({'id':f'courtyard:{group.name}:{len(obstacles)}','kind':'box',
      'x':round(group.location.x+x,4),'z':round(group.location.y+z,4),'halfX':sx/2,'halfZ':sz/2,
      'rotation':0,'bottom':70+low,'top':70+h,'blocksMovement':movement})

def ground_patch(rx,rz,mat,phase=0):
    # Uneven, flush edges and metre-scale UVs, with no raised slab or collider.
    v=[(0,0,.015)]
    for i in range(36):
        a=i*math.tau/36; edge=1+.025*math.sin(i*2.3+phase)
        v.append((rx*math.cos(a)*edge,rz*math.sin(a)*edge,.015))
    mesh('worn_ground_apron',v,[(0,1+i,1+(i+1)%36) for i in range(36)],mat)

def barrel(x,z,y=0):
    rings=[(0,.34),(.12,.40),(.47,.44),(.86,.40),(.96,.34)]; n=14
    v=[(x+r*math.cos(i*math.tau/n),z+r*math.sin(i*math.tau/n),y+yy) for yy,r in rings for i in range(n)]
    f=[tuple(reversed(range(n))),tuple(range(4*n,5*n))]
    f += [(j*n+i,j*n+(i+1)%n,(j+1)*n+(i+1)%n,(j+1)*n+i) for j in range(4) for i in range(n)]
    mesh('oak_staves',v,f,'weathered_oak')
    for yy,rr in [(.16,.409),(.78,.418)]:cylinder('iron_hoop',(x,z,y+yy),rr,.055,'iron',n=14)
    for dx in [-.19,0,.19]:box('lid_plank',(x+dx,z,y+.962),(.17,.58,.025),bevel=.006)

def crate(x,z,y=0):
    box('crate_body',(x,z,y+.4),(.82,.76,.78),bevel=.015)
    for yy in [.10,.69]:
        for dz in [-.397,.397]:box('crate_rail',(x,z+dz,y+yy),(.90,.065,.10))
    for dz in [-.405,.405]:beam('diagonal_brace',(x-.38,z+dz,y+.16),(x+.38,z+dz,y+.65),.052)

def table(x=0,z=0,width=3,depth=1.15):
    for dx in [-width/2+.15,width/2-.15]:
        for dz in [-depth/2+.12,depth/2-.12]:box('trestle',(x+dx,z+dz,.47),(.14,.14,.94))
    for i in range(5):box('table_plank',(x,z-depth/2+(i+.5)*depth/5,1.0),(width,depth/5-.012,.12))
    block(x,z,width,depth,1.06)

def awning(width=4.6,depth=3.2,cloth='indigo'):
    for dx in [-width/2,width/2]:
        for dz in [-depth/2,depth/2]:
            beam('canopy_post',(dx,dz,0),(dx,dz,3.4),.075)
            block(dx,dz,.15,.15,3.4)
    for dz in [-depth/2,depth/2]:beam('canopy_crossbar',(-width/2,dz,3.35),(width/2,dz,3.35),.085)
    for i in range(10):
        x1=-width/2+width*i/10; x2=x1+width/10
        v=[(x,y,3.55-.45*abs(y)/(depth/2)-.05*math.sin(i*1.7)) for y in [-depth/2,0,depth/2] for x in [x1,x2]]
        mesh('canvas_stripe',v,[(0,1,3,2),(2,3,5,4)],cloth if i%3 else 'linen')
        mesh('scalloped_edge',[(x1,-depth/2,3.1),(x2,-depth/2,3.1),(x2,-depth/2,2.91),((x1+x2)/2,-depth/2,2.80),(x1,-depth/2,2.91)],[(0,1,2,3,4)],cloth)
    block(0,0,width,depth,3.57,low=2.8,movement=False)

def stall(name,x,z,cloth,goods):
    start(name,x,z,'market'); awning(cloth=cloth); table(z=-.30,width=4.0)
    for i in range(3):
        xx=-1.30+i*1.25
        box('produce_tray',(xx,-.30,1.105),(1.02,.80,.10))
        for j in range(7):
            gx=xx+rng.uniform(-.34,.34); gz=-.30+rng.uniform(-.25,.25)
            if goods=='parchment':
                o=cylinder('cloth_roll',(gx,gz,1.28),.105,.46,'linen',n=10)
                o.rotation_euler.x=math.pi/2
            else:sphere('goods',(gx,gz,1.26),(.11,.10,.105),goods)
    barrel(-2.85,.1); block(-2.85,.1,.88,.88,.96)
    crate(2.85,.25); block(2.85,.25,.90,.83,.8)

stall('Elsa_provisions',-114,-187,'indigo','apple')
stall('Caravan_exchange',-121,-199,'wine','parchment')
stall('Mira_herbs',-129,-177,'linen','herb')

start('Bran_forge',-139,-187,'workshop')
box('forge_stone_base',(0,0,.48),(2.5,1.8,.96),'fieldstone')
box('hearth',(0,0,1.0),(1.9,1.3,.10),'coal')
for i in range(14):sphere('coal',(rng.uniform(-.65,.65),rng.uniform(-.4,.4),1.12),(.15,.13,.1),'embers' if i%4==0 else 'coal')
box('chimney',(-.85,.55,2.5),(.65,.6,3.2),'fieldstone')
block(0,0,2.5,1.8,1.18); block(-.85,.55,.65,.6,4.1)
cylinder('anvil_stump',(2,-2,.45),.43,.9)
box('anvil_base',(2,-2,.94),(.68,.44,.14),'iron')
box('anvil_waist',(2,-2,1.08),(.40,.30,.20),'iron')
box('anvil_face',(2,-2,1.24),(.90,.42,.14),'iron')
beam('anvil_horn',(2.4,-2,1.20),(2.94,-2,1.23),.13,'iron')
block(2.2,-2,1.5,.86,1.31)
table(-.1,-3,2.2,.8)
for dx in [-.6,.1,.7]:
    beam('tool_handle',(dx,-3,1.15),(dx+.20,-2.75,1.15),.025)
    box('tool_head',(dx+.21,-2.73,1.16),(.20,.12,.12),'iron')
barrel(-2.3,-1.5); block(-2.3,-1.5,.88,.88,.96)

start('Courtyard_well',-114,-151,'rest')
for row in range(3):
    for i in range(14):
        a=(i+(row%2)*.5)*math.tau/14
        o=box('well_stone',(math.cos(a)*1.1,math.sin(a)*1.1,.16+row*.29),(.46,.38,.28),'fieldstone'); o.rotation_euler.z=a+math.pi/2
block(0,0,2.58,2.58,.92)
cylinder('well_water',(0,0,.3),.91,.025,'water',n=32)
for dx in [-1.35,1.35]:beam('winch_post',(dx,0,0),(dx,0,2.95),.11); block(dx,0,.22,.22,2.95)
beam('winch_spindle',(-1.55,0,2.45),(1.55,0,2.45),.14)
beam('rope',(0,0,.55),(0,0,2.45),.022,'straw')
cylinder('bucket',(.55,-1.6,.22),.24,.42,r2=.29); block(.55,-1.6,.58,.58,.43)
for side in [-1,1]:
    mesh('well_roof',[(0,-1.3,3.55),(0,1.3,3.55),(side*1.9,1.3,2.96),(side*1.9,-1.3,2.96)],[(0,1,2,3)],'weathered_oak')
block(0,0,3.8,2.6,3.55,low=2.96,movement=False)

for name,x,z in [('Well_bench',-120,-156),('Rest_bench',-108,-145),('Barracks_bench',-123,-132)]:
    start(name,x,z,'rest')
    for dx in [-1.1,1.1]:box('bench_leg',(dx,0,.28),(.25,.52,.56))
    for dz in [-.2,0,.2]:box('bench_seat',(0,dz,.57),(2.8,.18,.13))
    for dx in [-1.18,1.18]:box('back_support',(dx,.27,.87),(.12,.12,.95))
    for hh in [.88,1.17]:box('bench_back',(0,.27,hh),(2.8,.10,.18))
    block(0,0,2.8,.66,1.27)

start('Store_delivery',-58,-189,'supply')
for dx,dz,yy in [(-2.8,0,0),(-2.8,0,.8),(-2.8,1.0,0),(2.3,1.6,0)]:
    crate(dx,dz,yy); block(dx,dz,.90,.83,yy+.8)
for dx,dz in [(1.9,-1.2),(2.8,-1.3)]:barrel(dx,dz); block(dx,dz,.88,.88,.96)
for x in [-.75,.75]:
    for y in [-.95,.95]:
        o=cylinder('cart_wheel',(x,y,.6),.55,.10,'weathered_oak',n=16); o.rotation_euler.y=math.pi/2
        for a in range(6):beam('wheel_spoke',(x,y,.6),(x,y+math.cos(a*math.pi/3)*.5,.6+math.sin(a*math.pi/3)*.5),.028,'iron')
for y in [-.95,.95]:beam('axle',(-.86,y,.6),(.86,y,.6),.085,'iron')
box('cart_bed',(0,0,.87),(1.5,2.7,.16))
for x in [-.70,.70]:
    for h in [1.04,1.25,1.46]:box('cart_side',(x,0,h),(.09,2.7,.16))
for y in [-1.30,1.30]:box('cart_end',(0,y,1.2),(1.5,.12,.65))
for x in [-.5,.5]:beam('cart_handle',(x,-1.4,.9),(x,-3.0,.7),.055)
block(0,0,1.74,2.8,1.55); block(0,-2.2,1.15,1.55,.97)
for dx,dz in [(-.3,-.65),(.28,.3),(0,.8)]:sphere('grain_sack',(dx,dz,1.27),(.3,.38,.4),'linen')

start('Stable_supplies',-154,-170,'stable')
table(0,0,3.4,1.0)
for xx in [-1.05,0,1.05]:box('cut_timber',(xx,0,1.22),(.28,.85,.28))
for dx,dz in [(-3,0),(-3,1.1),(2.8,.2)]:barrel(dx,dz); block(dx,dz,.88,.88,.96)
for dx in [-1,0,1]:
    o=box('hay_bale',(dx,3,.42),(.93,1.15,.80),'straw',.12)
    for dz in [2.65,3.35]:box('bale_binding',(dx,dz,.83),(.93,.05,.035),'linen')
block(0,3,3.0,1.15,.85)

for name,x,z in [('Herb_bed_A',-168,-190),('Herb_bed_B',-168,-197)]:
    start(name,x,z,'garden')
    box('soil',(0,0,.12),(4.3,2.5,.22),'sand')
    for dx in [-2.2,2.2]:box('bed_edge',(dx,0,.2),(.16,2.7,.4))
    for dz in [-1.3,1.3]:box('bed_edge',(0,dz,.2),(4.5,.16,.4))
    for i in range(30):
        x=rng.uniform(-1.95,1.95); z=rng.uniform(-1.0,1.0)
        for a in range(3):
            aa=a*math.tau/3
            mesh('herb_leaf',[(x,z,.24),(x+.34*math.cos(aa),z+.34*math.sin(aa),.52),(x+.12*math.cos(aa+.6),z+.12*math.sin(aa+.6),.74)],[(0,1,2)],'herb')
    block(0,0,4.5,2.7,.4)

start('Training_sand',-46,-147,'training')
ground_patch(10.7,13.2,'sand')
for i,(x,z) in enumerate([(-41,-138),(-41,-151),(-37,-159)]):
    start('Training_target_'+str(i),x,z,'training')
    cylinder('dummy_post',(0,0,.95),.11,1.9)
    beam('dummy_crossbar',(0,-.85,1.55),(0,.85,1.55),.10)
    sphere('straw_torso',(0,0,1.28),(.26,.44,.58),'straw'); sphere('dummy_head',(0,0,2.03),(.25,.25,.26),'linen')
    for h in [1.05,1.48]:beam('straw_rope',(0,-.39,h),(0,.39,h),.033,'linen')
    o=cylinder('shield_target',(-.3,0,1.36),.40,.075,'wine' if i<2 else 'indigo',n=20); o.rotation_euler.y=math.pi/2
    o=cylinder('shield_boss',(-.345,0,1.36),.09,.07,'brass'); o.rotation_euler.y=math.pi/2
    block(0,0,.66,1.85,2.29)
start('Training_weapon_rack',-35,-144,'training')
for z in [-1.1,1.1]:beam('rack_upright',(0,z,0),(0,z,1.8),.07)
for h in [.35,1.4]:beam('rack_crossbar',(0,-1.2,h),(0,1.2,h),.06)
for z in [-.8,-.25,.3,.85]:
    beam('wooden_blade',(-.25,z,.2),(.0,z,1.7),.035)
    beam('practice_hilt',(-.025,z-.20,1.48),(-.025,z+.20,1.48),.025)
block(0,0,.65,2.55,1.8)

for name,x,z,height in [('Gate_west_standard',-108,-214,5.4),('Gate_east_standard',-92,-214,5.4),('Hall_standard',-88,-132,4.6)]:
    start(name,x,z,'guard')
    cylinder('standard_foot',(0,0,.13),.34,.26,'fieldstone')
    beam('standard_pole',(0,0,.2),(0,0,height),.055,'iron')
    beam('standard_bar',(-.85,0,height-.2),(.85,0,height-.2),.042,'brass')
    mesh('swallowtail_banner',[(-.75,0,height-.25),(.75,0,height-.25),(.75,-.06,height-2.3),(0,-.12,height-1.97),(-.75,-.06,height-2.3)],[(0,1,2,3,4)],'indigo')
    for sign in [-1,1]:beam('heraldic_spear',(sign*.45,-.10,height-1.7),(-sign*.40,-.1,height-.6),.025,'brass')
    block(0,0,.68,.68,.26); block(0,0,.12,.12,height)

start('Notice_board',-94,-204,'guard')
for dx in [-1.0,1.0]:box('board_post',(dx,0,1.1),(.14,.14,2.2)); block(dx,0,.14,.14,2.2)
box('board',(0,0,1.72),(2.45,.15,1.22)); block(0,0,2.45,.15,2.33)
for dx,dz in [(-.72,-.28),(-.02,.06),(.73,-.05)]:box('notice',(dx,-.087,1.7+dz),(.48,.018,.56),'parchment',.004)
for name,x,z in [('Store_ledger',-78,-185),('Roen_dispatches',-102,-177)]:
    start(name,x,z,'supply'); table(width=2.0,depth=.8)
    box('ledger',(0,0,1.12),(.5,.36,.09),'wine'); box('open_page',(.55,0,1.1),(.36,.45,.014),'parchment',0)

start('Well_paving',-114,-151,'rest'); ground_patch(5.1,5.4,'courtyard_paving',1)
start('Market_paving',-116,-186,'market'); ground_patch(7.7,5.4,'courtyard_paving',3)

anchors=[{'text':'ГРИНФОЛЛ','x':-100,'z':-224,'height':8.5,'range':75},
 {'text':'Рынок снабжения','x':-121,'z':-199,'height':3.95,'range':28},
 {'text':'Учебный двор','x':-48,'z':-164,'height':2.6,'range':32}]

def waypoint(x,z,activity='walk',look=None,seconds=3,clip='',interval=5):
    result={'x':x,'z':z,'activity':activity,'duration':seconds,'interval':interval}
    if look:result['look']={'x':look[0],'z':look[1]}
    if clip:result['clip']=clip
    return result

residents=[]
def resident(name,model,route,role,seed,speed=1.1,civilian=False,phase=0):
    residents.append({'name':name,'model':model,'x':route[0]['x'],'z':route[0]['z'],'route':route,'role':role,
      'seed':seed,'speed':speed,'start_index':0,'phase':phase,'civilian':civilian})

resident('Дозорный Хальд','Warrior',[waypoint(-106,-211,'guard',(-100,-233),18),waypoint(-110,-208,'guard',(-100,-210),7)],'gate',101)
resident('Дозорная Веста','Ranger',[waypoint(-94,-210,'guard',(-100,-234),15),waypoint(-89,-208,'guard',(-95,-201),8)],'gate',102)
resident('Патрульный Ольгер','Warrior',[waypoint(-105,-204),waypoint(-106,-165),waypoint(-104,-135,'guard',(-98,-135),6),waypoint(-95,-135),waypoint(-94,-169),waypoint(-94,-201,'guard',(-100,-213),4)],'patrol',103)
resident('Купец Вальтер','Monk',[waypoint(-121,-197.7,'trade',(-121,-201),35,'pickup',8)],'merchant',104,civilian=True)
resident('Караванщица Нелла','Rogue',[waypoint(-121,-201,'trade',(-121,-197.7),27,'pickup',9),waypoint(-127,-204,'inspect',(-125,-201),5),waypoint(-123,-203)],'buyer',105,civilian=True,phase=4)
resident('Снабженец Ден','Monk',[waypoint(-117,-190,'inspect',(-114,-187),6,'pickup'),waypoint(-118,-182),waypoint(-123,-179,'trade',(-129,-177),8,'pickup'),waypoint(-119,-194),waypoint(-118,-201,'talk',(-121,-201),6)],'buyer',106,civilian=True)
resident('Сержант Гаррен','Warrior',[waypoint(-49,-146,'instruct',(-43,-145),12,'punch',5),waypoint(-48,-153,'instruct',(-43,-151),10,'punch',6)],'instructor',107)
resident('Новобранец Ильмар','Warrior',[waypoint(-43,-138,'train',(-41,-138),17,'sword_attack',3.5),waypoint(-47,-135,'rest',(-43,-138),7)],'trainee',108)
resident('Новобранец Рик','Warrior',[waypoint(-43,-151,'train',(-41,-151),19,'sword_attack2',4),waypoint(-47,-154,'rest',(-43,-151),6)],'trainee',109,phase=1.5)
resident('Стрелок Тая','Ranger',[waypoint(-50,-159,'train',(-37,-159),20,'bow_shoot',5),waypoint(-53,-162,'rest',(-37,-159),7)],'archer',110,phase=2.5)
resident('Подмастерье Йорен','Monk',[waypoint(-154,-168.8,'work',(-154,-170),14,'pickup',6),waypoint(-157,-172,'inspect',(-154,-170),6),waypoint(-150,-172)],'worker',111,civilian=True)
resident('Носильщик Бек','Monk',[waypoint(-71,-187,'collect',(-68,-187),7,'pickup'),waypoint(-73,-181),waypoint(-72,-162),waypoint(-98,-162),waypoint(-139,-168),waypoint(-150,-173,'deliver',(-154,-170),6,'pickup'),waypoint(-138,-175),waypoint(-99,-172),waypoint(-78,-177)],'porter',112,speed=1.2,civilian=True)
resident('Писарь Эмиль','Rogue',[waypoint(-78,-183.5,'ledger',(-78,-185),16,'pickup',9),waypoint(-82,-181,'talk',(-75,-189),5)],'scribe',113,civilian=True)
resident('Садовница Лина','Monk',[waypoint(-165,-190,'garden',(-168,-190),12,'pickup',6),waypoint(-163,-184),waypoint(-141,-178),waypoint(-134,-180,'trade',(-129,-177),6,'pickup'),waypoint(-142,-177),waypoint(-164,-184)],'gardener',114,civilian=True)
resident('Горожанин Освин','Rogue',[waypoint(-118,-154,'rest',(-114,-151),10),waypoint(-109,-149,'talk',(-114,-151),8),waypoint(-108,-134,'inspect',(-123,-132),7),waypoint(-115,-140)],'walker',115,civilian=True)

wildlife=[{'species':'crow','x':-54,'z':-185},{'species':'crow','x':-56,'z':-194},
 {'species':'crow','x':-116,'z':-155},{'species':'hare','x':-172,'z':-191},{'species':'hare','x':-164,'z':-202}]
sys.path.insert(0,str(Path(__file__).resolve().parent))
from castle_architecture import rebuild
print('Building castle quarter revision 03',flush=True)
rebuild(globals())
from castle_quarter import build as build_quarter
build_quarter(globals())
print('Authored castle and walk-in tavern geometry',flush=True)
for name,factor in material_factors.items():
    material_value=materials[name]; tree=material_value.node_tree
    socket=tree.nodes.get('Principled BSDF').inputs['Base Color']
    if socket.is_linked:
        source=socket.links[0].from_socket
        tint=tree.nodes.new('ShaderNodeMixRGB'); tint.blend_type='MULTIPLY'; tint.inputs[0].default_value=1
        tint.inputs[2].default_value=factor
        tree.links.new(source,tint.inputs[1]);tree.links.new(tint.outputs[0],socket)

data={'schema':2,'id':'greenfall-courtyard','coordinates':'server x,z; +z north','center':[-100,-150],
 'active_radius':210,'props':props,'obstacles':obstacles,'residents':residents,'residentLooks':{},'wildlife':wildlife,'signs':anchors,'tavern':tavern,'quarter':quarter,
 'supportSurfaces':[{'kind':'plate','x':-100,'z':150,'halfX':77.5,'halfZ':68.5,'angle':0,'y':70.14},
                    {'kind':'plate','x':-155,'z':199,'halfX':12.2,'halfZ':13.5,'angle':0,'y':70.2275}]}
(OUT/'courtyard.json').write_text(json.dumps(data,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')

# Keep editable pieces in Blender; batch runtime meshes by district/material.
native=ROOT/'art/world-final/Greenfall_Castle_Quarter_03.blend'; native.parent.mkdir(parents=True,exist_ok=True)
print('Saving editable quarter',flush=True)
bpy.ops.wm.save_as_mainfile(filepath=str(native))
print('Batching runtime meshes',flush=True)
objects=[o for o in bpy.context.scene.objects if o.type=='MESH']
groups={}
for o in objects:groups.setdefault((o.parent['zone'],o.data.materials[0].name),[]).append(o)
bpy.context.view_layer.update()
for (zone,mat),items in groups.items():
    origin=items[0].parent.matrix_world.translation.copy()
    vertices=[]; faces=[]; uv_values=[]; smooth=[]
    for item in items:
        matrix=item.matrix_world.copy();offset=len(vertices)
        vertices.extend(tuple(matrix@v.co-origin) for v in item.data.vertices)
        uv=item.data.uv_layers.active
        for poly in item.data.polygons:
            faces.append(tuple(offset+i for i in poly.vertices));smooth.append(poly.use_smooth)
            uv_values.extend(tuple(uv.data[i].uv) for i in poly.loop_indices)
    name='Courtyard_'+zone+'_'+mat
    data=bpy.data.meshes.new(name);data.from_pydata(vertices,[],faces);data.update()
    uv=data.uv_layers.new(name='UVMap')
    for i,value in enumerate(uv_values):uv.data[i].uv=value
    for poly,value in zip(data.polygons,smooth):poly.use_smooth=value
    o=bpy.data.objects.new(name,data);bpy.context.collection.objects.link(o)
    o.location=origin;o.data.materials.append(materials[mat])
for o in objects:bpy.data.objects.remove(o,do_unlink=True)
for o in list(bpy.context.scene.objects):
    if o.type=='EMPTY':bpy.data.objects.remove(o,do_unlink=True)
print('Exporting batched quarter',flush=True)
bpy.ops.export_scene.gltf(filepath=str(OUT/'courtyard.glb'),export_format='GLB',export_yup=True,export_apply=True,export_animations=False,export_extras=True)
# Preserve the numeric tint in the runtime PBR factors as well as in Blender.
runtime=OUT/'courtyard.glb'; raw=runtime.read_bytes(); length=struct.unpack_from('<I',raw,12)[0]
document=json.loads(raw[20:20+length]); tail=raw[20+length:]
for value in document.get('materials',[]):
    if value['name'] in material_factors:value.setdefault('pbrMetallicRoughness',{})['baseColorFactor']=material_factors[value['name']]
packed=json.dumps(document,separators=(',',':'),ensure_ascii=False).encode();packed+=b' '*((-len(packed))%4)
runtime.write_bytes(struct.pack('<4sII',b'glTF',2,20+len(packed)+len(tail))+struct.pack('<I4s',len(packed),b'JSON')+packed+tail)
print('CASTLE_COURTYARD '+json.dumps({'props':len(props),'residents':len(residents),'animals':len(wildlife),'runtime_draw_groups':len(groups),'obstacles':len(obstacles)}))
