"""Varendor knight 01: original editable Blender appearance study.

Stage 1 only. Does not load or modify the game, its actors or animations.
Run Blender 4.5: blender -b -t 4 --python create_knight.py -- --output PATH
"""
import bpy
import math
import json
import sys
import argparse
from pathlib import Path
from mathutils import Vector

P = argparse.ArgumentParser()
P.add_argument('--output', default='knight-review')
args = P.parse_args(sys.argv[sys.argv.index('--')+1:] if '--' in sys.argv else [])
OUT = Path(args.output).resolve()
OUT.mkdir(parents=True, exist_ok=True)
bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene
scene.unit_settings.system = 'METRIC'

def collection(name):
    c = bpy.data.collections.new(name)
    scene.collection.children.link(c)
    return c

BODY = collection('01 | Body and underclothes')
ARMOR = collection('02 | Steel armor - separate pieces')
CLOTH = collection('03 | Cloth and leather')
DETAIL = collection('04 | Fasteners and engraved trim')
WEAPONS = collection('05 | Sword and shield')
STUDIO = collection('90 | Review studio - hide for export')

def attach(obj, name, coll, mat=None):
    obj.name = name
    for c in list(obj.users_collection): c.objects.unlink(obj)
    coll.objects.link(obj)
    if mat: obj.data.materials.append(mat)
    if obj.type == 'MESH':
        for p in obj.data.polygons: p.use_smooth = True
    return obj

def material(name, color, metallic=0, rough=.5, texture=0):
    m = bpy.data.materials.new(name)
    m.diffuse_color = (*color, 1)
    m.use_nodes = True
    nt = m.node_tree; n = nt.nodes; links = nt.links
    bs = n.get('Principled BSDF')
    bs.inputs['Base Color'].default_value = (*color, 1)
    bs.inputs['Metallic'].default_value = metallic
    bs.inputs['Roughness'].default_value = rough
    if texture:
        noise = n.new('ShaderNodeTexNoise')
        noise.inputs['Scale'].default_value = 175 if metallic else 110
        noise.inputs['Detail'].default_value = 3
        ramp = n.new('ShaderNodeValToRGB')
        ramp.color_ramp.elements[0].position = .18
        ramp.color_ramp.elements[0].color = (*[x*.68 for x in color],1)
        ramp.color_ramp.elements[1].position = .83
        ramp.color_ramp.elements[1].color = (*[min(x*1.2,1) for x in color],1)
        links.new(noise.outputs['Fac'], ramp.inputs[0])
        links.new(ramp.outputs[0],bs.inputs['Base Color'])
        bump = n.new('ShaderNodeBump')
        bump.inputs['Strength'].default_value = texture
        bump.inputs['Distance'].default_value = .00065 if metallic else .0015
        links.new(noise.outputs['Fac'], bump.inputs['Height'])
        links.new(bump.outputs[0], bs.inputs['Normal'])
    return m

steel = material('Tempered steel | fine forged surface',(.24,.285,.32),.88,.32,.18)
edge = material('Polished steel edges',(.48,.53,.57),.93,.24,.06)
darksteel = material('Darkened steel and recesses',(.055,.073,.085),.84,.4,.2)
brass = material('Worn pale brass',(.39,.265,.105),.8,.34,.1)
leather = material('Dark brown leather',(.044,.027,.021),0,.65,.3)
cloth = material('Ox-blood woven wool',(.145,.014,.025),0,.85,.35)
lining = material('Charcoal padded linen',(.026,.033,.038),0,.9,.4)
skin = material('Underlying body',(.39,.225,.145),0,.65,.15)
black = material('Visor darkness',(.004,.006,.008),0,.96)

def mesh(name, verts, faces, mat, coll=ARMOR, bevel=0):
    data = bpy.data.meshes.new(name+' mesh')
    data.from_pydata(verts,[],faces); data.update()
    o = bpy.data.objects.new(name,data); coll.objects.link(o)
    if mat: data.materials.append(mat)
    for p in data.polygons: p.use_smooth = True
    if bevel:
        b=o.modifiers.new('Soft manufactured edges','BEVEL'); b.width=bevel; b.segments=3
    return o

def solid(o, thickness=.004):
    s=o.modifiers.new('Real material thickness','SOLIDIFY'); s.thickness=thickness; s.offset=-.5
    return o

def smooth(o, levels=1):
    s=o.modifiers.new('Curved surface','SUBSURF'); s.levels=levels; s.render_levels=levels
    return o

def ellipsoid(name, center, scale, mat, coll=BODY):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=32, ring_count=20, location=center)
    o=attach(bpy.context.object,name,coll,mat); o.scale=scale
    return o

def curve(name, points, mat=brass, radius=.0022, coll=DETAIL, closed=False):
    d=bpy.data.curves.new(name,'CURVE'); d.dimensions='3D'; d.resolution_u=12
    d.bevel_depth=radius; d.bevel_resolution=3
    sp=d.splines.new('POLY'); sp.points.add(len(points)-1)
    for p,co in zip(sp.points,points): p.co=(*co,1)
    sp.use_cyclic_u=closed
    o=bpy.data.objects.new(name,d); coll.objects.link(o); d.materials.append(mat)
    return o

def loft(name, rings, mat, coll=ARMOR, n=48, cap=False, front_keel=0):
    # ring: z, x radius, y radius, x center, y center
    verts=[]
    for z,rx,ry,cx,cy in rings:
        for j in range(n):
            t=j*math.tau/n; x=rx*math.cos(t); y=ry*math.sin(t)
            y-=front_keel*max(0,-math.sin(t))**12
            verts.append((cx+x,cy+y,z))
    faces=[]
    for i in range(len(rings)-1):
        for j in range(n):
            a=i*n+j; b=i*n+(j+1)%n
            faces.append((a,b,b+n,a+n))
    if cap:
        faces.extend([tuple(reversed(range(n))),tuple((len(rings)-1)*n+j for j in range(n))])
    return mesh(name,verts,faces,mat,coll)

def tube(name, a, b, ra, rb, mat, coll=BODY, n=24):
    a,b=Vector(a),Vector(b); length=(b-a).length
    bpy.ops.mesh.primitive_cone_add(vertices=n,radius1=ra,radius2=rb,depth=length,location=(a+b)/2)
    o=attach(bpy.context.object,name,coll,mat)
    o.rotation_euler=(b-a).to_track_quat('Z','Y').to_euler()
    bevel=o.modifiers.new('Rounded edges','BEVEL'); bevel.width=.005; bevel.segments=3
    return o

def rivet(name, p, size=.0045, mat=brass):
    return ellipsoid(name,p,(size,size*.55,size),mat,DETAIL)

def ellipse_line(name,z,rx,ry,cx=0,cy=0,mat=brass,radius=.0022):
    return curve(name,[(cx+rx*math.cos(t*math.tau/96),cy+ry*math.sin(t*math.tau/96),z) for t in range(96)],mat,radius,closed=True)

def plaque(name, outline, y, mat=steel, coll=ARMOR, thickness=.004, bulge=.015):
    # Outline in x,z; convex raised center for forged plates.
    cx=sum(p[0] for p in outline)/len(outline); cz=sum(p[1] for p in outline)/len(outline)
    verts=[(cx,y-bulge,cz)]+[(x,y,z) for x,z in outline]
    faces=[(0,j+1,(j+1)%len(outline)+1) for j in range(len(outline))]
    return solid(mesh(name,verts,faces,mat,coll,bevel=.002),thickness)

# Anatomical foundation, retained as a separate collection for later rigging.
loft('Body | torso',[(1.00,.14,.10,0,.018),(1.10,.16,.103,0,.02),(1.25,.15,.105,0,.015),(1.43,.215,.12,0,.015),(1.57,.24,.102,0,.02),(1.65,.15,.082,0,.025)],skin,BODY,cap=True)
ellipsoid('Body | pelvis',(0,.02,.99),(.174,.114,.145),skin)
tube('Body | neck',(0,.018,1.60),(0,.018,1.78),.068,.059,skin)
ellipsoid('Body | head under closed helmet',(0,.013,1.835),(.087,.093,.123),skin)
loft('Quilted arming doublet',[(1.02,.18,.13,0,.02),(1.11,.174,.123,0,.015),(1.27,.177,.123,0,.014),(1.46,.23,.135,0,.02),(1.59,.253,.117,0,.025),(1.65,.15,.09,0,.023)],lining,BODY,cap=True)

for side in [-1,1]:
    tag='R' if side<0 else 'L'
    shoulder=(side*.253,.02,1.565); elbow=(side*.345,.015,1.295); wrist=(side*.405,-.018,1.025)
    tube('Body | upper arm '+tag,shoulder,elbow,.082,.063,skin)
    tube('Quilted sleeve '+tag,shoulder,elbow,.094,.072,lining)
    ellipsoid('Elbow articulation '+tag,elbow,(.069,.069,.078),lining)
    tube('Body | forearm '+tag,elbow,wrist,.065,.041,skin)
    tube('Leather sleeve '+tag,elbow,wrist,.071,.047,leather)
    # Fitted upper-arm and forearm armor, following the relaxed arm angle.
    upper=tube('Rerebrace '+tag,(side*.285,.018,1.50),(side*.339,.016,1.325),.093,.076,steel,ARMOR)
    lower=tube('Vambrace '+tag,(side*.358,.01,1.25),(side*.40,-.013,1.065),.078,.055,steel,ARMOR)
    for z,cx,r in [(1.49,side*.288,.095),(1.335,side*.337,.078),(1.24,side*.36,.079),(1.078,side*.397,.057)]:
        ellipse_line('Arm rolled rim '+tag,z,r,r,cx,.012,edge,.0025)
    # Elbow cop and side wing.
    ellipsoid('Couter '+tag,(side*.345,-.031,1.292),(.081,.081,.074),steel,ARMOR)
    plaque('Couter wing '+tag,[(side*.365,1.35),(side*.453,1.313),(side*.433,1.253),(side*.365,1.241)],-.012,steel)
    # Proportioned padded thigh, knee joint and calf.
    hx=side*.123; kx=side*.137; ax=side*.15
    tube('Body | thigh '+tag,(hx,.025,1.025),(kx,.0,.588),.109,.068,skin)
    tube('Wool trousers '+tag,(hx,.022,1.02),(kx,.0,.591),.117,.076,lining)
    ellipsoid('Knee cloth '+tag,(kx,0,.573),(.075,.078,.077),lining)
    tube('Body | calf '+tag,(kx,.018,.552),(ax,.015,.16),.076,.041,skin)
    tube('Boot leather shaft '+tag,(kx,.018,.545),(ax,.015,.105),.082,.05,leather)
    # Thigh and shin plates use shaped cross sections, not straight cylinders.
    loft('Cuisses '+tag,[(.635,.077,.080,kx,0),(.66,.085,.088,kx,0),(.79,.100,.095,hx,.014),(.94,.111,.102,hx,.017),(.97,.106,.098,hx,.017)],steel,ARMOR,front_keel=.005)
    for z,rx,ry,cx in [(.641,.078,.081,kx),(.962,.108,.099,hx)]: ellipse_line('Thigh border '+tag,z,rx,ry,cx,0,brass,.002)
    loft('Greaves '+tag,[(.134,.052,.057,ax,.018),(.17,.052,.060,ax,.018),(.31,.068,.082,ax,.021),(.42,.082,.090,kx,.023),(.51,.074,.082,kx,.01),(.53,.072,.075,kx,.01)],steel,ARMOR,front_keel=.014)
    curve('Greave ridge '+tag,[(ax,-.055,.14),(ax,-.078,.30),(kx,-.082,.44),(kx,-.072,.521)],edge,.002)
    for z,rx,ry,cx in [(.155,.054,.060,ax),(.515,.074,.083,kx)]: ellipse_line('Shin rolled rim '+tag,z,rx,ry,cx,.01,edge,.002)
    # Sculpted knee shield with medial ridge and a modest lateral wing.
    plaque('Poleyn '+tag,[(kx-.065,.616),(kx-.072,.57),(kx-.045,.527),(kx+.048,.527),(kx+.071,.57),(kx+.062,.616),(kx,.636)],-.084,steel,bulge=.036)
    curve('Knee ridge '+tag,[(kx,-.09,.632),(kx,-.126,.584),(kx,-.115,.545)],edge,.0025)
    plaque('Poleyn wing '+tag,[(kx+side*.054,.613),(kx+side*.124,.594),(kx+side*.13,.553),(kx+side*.053,.540)],-.002,steel)
    # Foot and overlapping articulated sabaton lames.
    ellipsoid('Boot '+tag,(ax,-.061,.081),(.069,.152,.063),leather,CLOTH)
    for i in range(6):
        y=-.165+i*.036; width=.061+(.006 if i in [2,3] else 0)
        verts=[]
        for yy,z in [(y-.023,.091+i*.006),(y+.022,.107+i*.009)]:
            for j in range(17):
                t=math.pi*j/16
                verts.append((ax+width*math.cos(t),yy,z+.025*math.sin(t)))
        faces=[(j,j+1,j+18,j+17) for j in range(16)]
        solid(mesh('Sabaton lame %s %02d'%(tag,i+1),verts,faces,steel,ARMOR),.003)
        curve('Sabaton lip '+tag,verts[:17],edge,.0018)
    # Gloves have separate thumb and four curved fingers for a later hand rig.
    ellipsoid('Glove palm '+tag,(side*.415,-.022,.996),(.051,.040,.064),leather,CLOTH)
    ellipsoid('Gauntlet back '+tag,(side*.414,.009,1.003),(.050,.024,.062),steel,ARMOR)
    for f in range(4):
        xx=side*(.386+f*.018)
        a=(xx,-.026,.968); b=(xx,-.048,.943); c=(xx,-.074,.961)
        tube('Finger leather %s %s'%(tag,f),a,b,.010,.009,leather,CLOTH,12)
        tube('Finger tip %s %s'%(tag,f),b,c,.009,.007,leather,CLOTH,12)
        for center in [a,b]: ellipsoid('Finger articulation '+tag,center,(.011,.012,.014),steel,ARMOR)
    tube('Thumb '+tag,(side*.372,-.016,1.018),(side*.361,-.053,.978),.017,.014,leather,CLOTH,16)

# Torso: shaped steel shell with a narrow waist and central keel.
chest_rings=[(1.13,.186,.134,0,.010),(1.17,.190,.141,0,.012),(1.30,.201,.152,0,.01),(1.43,.243,.156,0,.008),(1.53,.260,.139,0,.019),(1.59,.225,.120,0,.023),(1.625,.143,.095,0,.027)]
solid(loft('Cuirass | breast and back shell',chest_rings,steel,front_keel=.018),.005)
ellipse_line('Cuirass lower rolled edge',1.14,.188,.139,0,.008,edge,.003)
curve('Breastplate central ridge',[(0,-.155,1.16),(0,-.183,1.31),(0,-.181,1.43),(0,-.144,1.58)],edge,.0023)
for side in [-1,1]:
    curve('Breastplate upper border',[(side*.018,-.125,1.61),(side*.10,-.111,1.611),(side*.179,-.092,1.59),(side*.235,-.063,1.548)],brass,.003)
    curve('Breastplate chased chevron',[(side*.012,-.184,1.39),(side*.09,-.163,1.435),(side*.158,-.138,1.486),(side*.201,-.11,1.527)],brass,.002)
    # Decorative short feather-like inlays, kept restrained and legible.
    for i in range(4):
        x=side*(.056+i*.035); z=1.425+i*.022
        y=-.176+i*.011
        curve('Chased leaf',[(x,y,z),(x+side*.013,y+.001,z+.020),(x+side*.025,y+.010,z+.027)],brass,.0012)
    for z in [1.22,1.31,1.4,1.49]: rivet('Cuirass side fastening',(side*.19,-.075,z),.004)
    # Back seams/straps and buckles remain visible in the rear view.
    curve('Backplate joint '+str(side),[(side*.018,.155,1.19),(side*.035,.167,1.40),(side*.082,.14,1.57)],darksteel,.002)
    for z in [1.24,1.44]: rivet('Backplate fastening',(side*.12,.147,z),.004)

# Gorget/neck guard and layered shoulder lames.
for i in range(3):
    z=1.631+i*.029; rx=.125-i*.018; ry=.102-i*.012
    solid(loft('Gorget articulated band %s'%i,[(z,rx,ry,0,.019),(z+.026,rx-.012,ry-.008,0,.019)],steel),.004)
    ellipse_line('Gorget bright lip',z+.025,rx-.010,ry-.006,0,.019,brass,.002)
for side in [-1,1]:
    tag='R' if side<0 else 'L'
    # Curved shoulder dome, shaped as a real cap, followed by four shingles.
    verts=[]; nu=32; nv=12
    for v in range(nv+1):
        angle=.07+v/nv*1.42
        for u in range(nu+1):
            theta=u/nu*math.tau
            verts.append((side*(.265+.125*math.sin(angle)*math.cos(theta)),.023+.135*math.sin(angle)*math.sin(theta),1.562+.126*math.cos(angle)))
    faces=[(v*(nu+1)+u,v*(nu+1)+u+1,(v+1)*(nu+1)+u+1,(v+1)*(nu+1)+u) for v in range(nv) for u in range(nu)]
    solid(mesh('Pauldron dome '+tag,verts,faces,steel),.005)
    curve('Pauldron rolled rim '+tag,verts[-(nu+1):],brass,.003,closed=True)
    for i in range(3):
        cx=side*(.285+i*.012); z=1.558-i*.035; rad=.12-i*.010
        verts=[]
        for level in [0,1]:
            for j in range(25):
                t=math.pi+math.pi*j/24
                verts.append((cx+rad*math.cos(t),.023+(rad+.018)*math.sin(t),z-level*.049))
        solid(mesh('Shoulder overlapping lame %s %s'%(tag,i),verts,[(j,j+1,j+26,j+25) for j in range(24)],steel),.003)
        curve('Shoulder lame edge '+tag,verts[25:],edge,.002)
        rivet('Pauldron rivet',(side*(.35+i*.008),-.071,z-.023),.004)

# Closed sallet-style helmet: no fantasy horns, slim visor and tapered crown.
solid(loft('Helmet | forged shell',[(1.735,.102,.10,0,.032),(1.77,.109,.118,0,.020),(1.83,.113,.128,0,.008),(1.9,.105,.122,0,.012),(1.956,.075,.092,0,.013),(1.988,.023,.031,0,.018),(1.994,.002,.003,0,.019)],steel,n=64,cap=True),.004)
# Visor is formed around an actual dark horizontal viewing slit.
plaque('Visor dark eye opening',[(-.104,1.848),(-.052,1.854),(0,1.85),(.052,1.854),(.104,1.848),(.097,1.832),(0,1.835),(-.097,1.832)],-.123,black,ARMOR,bulge=.018)
plaque('Visor brow',[(-.106,1.869),(-.066,1.904),(0,1.915),(.066,1.904),(.106,1.869),(.104,1.851),(0,1.856),(-.104,1.851)],-.124,steel,bulge=.028)
plaque('Visor face plate',[(-.098,1.829),(0,1.835),(.098,1.829),(.083,1.765),(.041,1.737),(0,1.728),(-.041,1.737),(-.083,1.765)],-.121,steel,bulge=.047)
curve('Visor central ridge',[(0,-.16,1.913),(0,-.158,1.86)],edge,.002)
curve('Visor nose and chin ridge',[(0,-.15,1.83),(0,-.171,1.788),(0,-.147,1.733)],edge,.0022)
curve('Visor lip', [(-.10,-.125,1.849),(-.048,-.145,1.854),(0,-.151,1.851),(.048,-.145,1.854),(.10,-.125,1.849)],edge,.002)
for side in [-1,1]:
    rivet('Visor hinge',(side*.109,-.029,1.853),.010,brass)
    for col in range(3):
        for row in range(2):
            x=side*(.033+col*.018); z=1.788+row*.014
            rivet('Visor breathing recess',(x,-.153+abs(x)*.23,z),.0031,black)
    curve('Helmet crown seam',[(side*.012,.102,1.87),(side*.01,.073,1.955),(0,.015,1.996),(0,-.077,1.95)],darksteel,.0014)
ellipse_line('Helmet neck rolled edge',1.737,.103,.103,0,.028,edge,.0028)

# Broad working belt, metal buckle, pouches; separate cloth skirt panels.
loft('Waist belt',[(1.115,.202,.148,0,.009),(1.159,.204,.15,0,.009)],leather,CLOTH)
ellipse_line('Belt seam upper',1.152,.205,.151,0,.009,brass,.001)
ellipse_line('Belt seam lower',1.121,.204,.15,0,.009,brass,.001)
curve('Belt rectangular buckle',[(-.037,-.15,1.164),(.037,-.15,1.164),(.037,-.16,1.112),(-.037,-.16,1.112)],brass,.006,closed=True)
curve('Buckle tongue',[(0,-.17,1.115),(0,-.17,1.16)],steel,.003)
for side in [-1,1]:
    ellipsoid('Leather belt pouch '+str(side),(side*.19,.073,1.049),(.05,.055,.080),leather,CLOTH)
    rivet('Pouch clasp',(side*.19,.016,1.07),.005)
    # Fauld of four overlapping plates bridging the cuirass and hips.
    for i in range(3 if side < 0 else 0):
        z=1.117-i*.041; rx=.20+i*.012; ry=.148+i*.007
        solid(loft('Fauld articulated band %s %s'%(side,i),[(z-.039,rx+.009,ry+.007,0,.012),(z,rx,ry,0,.012)],steel,n=48),.003)
        if side<0: ellipse_line('Fauld rolled lip',z-.038,rx+.01,ry+.008,0,.012,edge,.002)
    # Fabric panels have modelled folds and sewn hems.
    nx=18; nz=20; verts=[]
    for iz in range(nz+1):
        t=iz/nz; z=1.075-t*.47
        for ix in range(nx+1):
            u=ix/nx
            x=side*(.014+u*(.167+.047*t))
            y=-.163-.01*t+.016*math.sin(u*math.pi*4+.5)*(.3+t)
            zz=z+.025*math.sin(u*math.pi)**2*t*t
            verts.append((x,y,zz))
    faces=[(iz*(nx+1)+ix,iz*(nx+1)+ix+1,(iz+1)*(nx+1)+ix+1,(iz+1)*(nx+1)+ix) for iz in range(nz) for ix in range(nx)]
    solid(smooth(mesh('Front split tabard '+str(side),verts,faces,cloth,CLOTH)),.002)
    curve('Tabard hem '+str(side),verts[-(nx+1):],brass,.0014,coll=CLOTH)
    curve('Tabard outer seam '+str(side),[verts[i*(nx+1)+nx] for i in range(nz+1)],brass,.0012,coll=CLOTH)
    # Tassets hang over the upper corners of the cloth, leaving the center open.
    cx=side*.161
    for i in range(3):
        z=1.035-i*.06; w=.074-i*.003
        outline=[(cx-w,z+.014),(cx+w,z+.014),(cx+w-.01,z-.053),(cx,z-.066),(cx-w+.01,z-.053)]
        plaque('Tasset %s %s'%(side,i),outline,-.159-i*.002,steel,bulge=.024)
        curve('Tasset lip',[(x,-.165-i*.002,zz) for x,zz in outline[2:]],brass,.0018)
        for dx in [-.047,.047]: rivet('Tasset rivet',(cx+dx,-.173-i*.002,z),.003)

# Rear cloth, restrained short split panels rather than a rigid cape.
for side in [-1,1]:
    verts=[]
    for iz in range(17):
        t=iz/16
        for ix in range(13):
            u=ix/12; verts.append((side*(.012+u*(.16+.07*t)),.172+.01*t+.012*math.sin(u*math.pi*4)*t,1.075-.43*t+.018*math.sin(u*math.pi)*t))
    faces=[(i*13+j,(i+1)*13+j,(i+1)*13+j+1,i*13+j+1) for i in range(16) for j in range(12)]
    solid(smooth(mesh('Back split tabard '+str(side),verts,faces,cloth,CLOTH)),.002)
    curve('Back cloth hem',verts[-13:],brass,.0014,coll=CLOTH)

# Sword: diamond-section blade, fuller, substantial crossguard and wrapped grip.
guard=Vector((-.426,-.075,.947))
axis=Vector((-.145,-.035,-1)).normalized()
across=Vector((1,0,-.145)).normalized(); depth=axis.cross(across).normalized()
def swordpoint(x,y,t): return tuple(guard+across*x+depth*y+axis*t)
verts=[]
for t,w,d in [(0,.028,.005),(.07,.029,.0048),(.53,.021,.004),(.70,.013,.003),(.78,0,.0001)]:
    for x,y in [(-w,0),(0,-d),(w,0),(0,d)]: verts.append(swordpoint(x,y,t))
faces=[]
for i in range(4):
    for j in range(4): faces.append((4*i+j,4*i+(j+1)%4,4*(i+1)+(j+1)%4,4*(i+1)+j))
blade=mesh('Sword | forged diamond section blade',verts,faces,edge,WEAPONS)
for p in blade.data.polygons: p.use_smooth=False
curve('Sword fuller front',[swordpoint(0,-.0052,.07),swordpoint(0,-.0047,.39),swordpoint(0,-.0041,.54)],darksteel,.0018,WEAPONS)
curve('Sword fuller back',[swordpoint(0,.0052,.07),swordpoint(0,.0047,.39),swordpoint(0,.0041,.54)],darksteel,.0018,WEAPONS)
curve('Sword | swept crossguard',[swordpoint(-.122,0,.023),swordpoint(-.092,0,.006),swordpoint(-.045,0,-.002),swordpoint(0,0,-.003),swordpoint(.045,0,-.002),swordpoint(.092,0,.006),swordpoint(.122,0,.023)],steel,.009,WEAPONS)
tube('Sword | leather grip',swordpoint(0,0,-.015),swordpoint(0,0,-.149),.018,.015,leather,WEAPONS)
for i in range(11):
    t=-.02-i*.011
    pts=[swordpoint(.018*math.cos(j*math.tau/24),.018*math.sin(j*math.tau/24),t-.008*j/24) for j in range(25)]
    curve('Sword grip wrap',pts,darksteel,.0015,WEAPONS)
ellipsoid('Sword | wheel pommel',swordpoint(0,0,-.177),(.027,.016,.029),steel,WEAPONS)
ellipsoid('Sword | pommel inset',swordpoint(0,-.017,-.177),(.012,.003,.012),brass,WEAPONS)

# Curved heater shield, dark lacquered face, forged border and original emblem.
shield_center=Vector((.492,-.18,1.126))
outline=[(-.222,.273),(-.176,.307),(0,.32),(.176,.307),(.222,.273),(.204,.019),(.149,-.155),(0,-.347),(-.149,-.155),(-.204,.019)]
def sp(x,z,offset=0): return (shield_center.x+x,shield_center.y-.055*(1-(x/.225)**2)+offset,shield_center.z+z)
verts=[sp(0,0,-.005)]+[sp(x,z) for x,z in outline]
faces=[(0,i+1,(i+1)%len(outline)+1) for i in range(len(outline))]
shield=solid(mesh('Shield | curved steel core',verts,faces,darksteel,WEAPONS,bevel=.003),.015)
inset=[(x*.89,z*.91) for x,z in outline]
verts=[sp(0,0,-.009)]+[sp(x,z,-.009) for x,z in inset]
mesh('Shield | ox-blood lacquer face',verts,faces,cloth,WEAPONS)
curve('Shield | thick steel rim',[sp(x,z,-.006) for x,z in outline],steel,.012,WEAPONS,closed=True)
curve('Shield | brass inlay border',[sp(x,z,-.012) for x,z in inset],brass,.003,WEAPONS,closed=True)
for x,z in outline:
    ellipsoid('Shield rim rivet',sp(x*.95,z*.96,-.018),(.005,.003,.005),brass,WEAPONS)
# Long stylized spear/leaf insignia, made from geometry (no raster dependency).
plaque('Shield | central silver heraldic blade',[(.492,1.344),(.458,1.253),(.478,1.259),(.478,.977),(.492,.932),(.506,.977),(.506,1.259),(.526,1.253)],-.25,edge,WEAPONS,thickness=.003,bulge=.004)
for side in [-1,1]:
    for i in range(4):
        x=side*(.031+.022*i); z=.012+i*.031
        curve('Shield | laurel stem',[sp(x,z,-.022),sp(x+side*.028,z+.025,-.022),sp(x+side*.028,z+.061,-.022)],brass,.003,WEAPONS)
curve('Shield rear arm strap',[sp(-.09,.08,.047),sp(-.10,.02,.098),sp(.02,-.055,.098),sp(.085,-.09,.041)],leather,.016,WEAPONS)
curve('Shield rear handle',[sp(-.054,.02,.032),sp(-.027,.012,.104),sp(.037,.012,.104),sp(.073,.02,.032)],leather,.016,WEAPONS)

# Modest dimensional chainmail at visible elbow/neck gaps. Shared mesh rings.
bpy.ops.mesh.primitive_torus_add(major_segments=12,minor_segments=4,major_radius=.0042,minor_radius=.00085)
template=bpy.context.object; ring_mesh=template.data
ring_mesh.materials.append(darksteel)
bpy.data.objects.remove(template,do_unlink=True)
for side in [-1,1]:
    for row in range(7):
        for col in range(12):
            x=side*.345+(col-5.5)*.007; z=1.27+row*.007
            o=bpy.data.objects.new('Mail | elbow link',ring_mesh); DETAIL.objects.link(o)
            o.location=(x,-.063-.005*(row%2),z); o.rotation_euler=(math.pi/2,.3*(-1 if row%2 else 1),0)
for row in range(4):
    for col in range(36):
        theta=math.tau*col/36
        o=bpy.data.objects.new('Mail | neck link',ring_mesh); DETAIL.objects.link(o)
        o.location=(.080*math.cos(theta),.021+.077*math.sin(theta),1.708+row*.007)
        o.rotation_euler=(math.pi/2,0,theta-math.pi/2)

# Display origin at the feet; body/slots stay editable and separately named.
root=bpy.data.objects.new('VARENDOR | Knight 01 - appearance stage',None)
scene.collection.objects.link(root)
for c in [BODY,ARMOR,CLOTH,DETAIL,WEAPONS]:
    for o in c.objects: o.parent=root
root['stage']='Appearance review only; rig, animation, game integration follow approval.'
root['authoring']='Original procedural mesh construction in Blender; no downloaded character assets.'
root['height_m']=1.994

# Studio: controlled diffuse key and broad edge highlights to reveal steel forms.
ground=material('Studio charcoal',(.023,.029,.038),.1,.62)
bpy.ops.mesh.primitive_plane_add(size=200,location=(0,0,-.001))
attach(bpy.context.object,'Studio floor',STUDIO,ground)
world=bpy.data.worlds.new('Neutral studio'); world.use_nodes=True
world.node_tree.nodes['Background'].inputs[0].default_value=(.10,.13,.18,1)
world.node_tree.nodes['Background'].inputs[1].default_value=.3
scene.world=world
def aim(o, p): o.rotation_euler=(Vector(p)-o.location).to_track_quat('-Z','Y').to_euler()
def light(name,pos,power,color,size,target=(0,0,1.2)):
    d=bpy.data.lights.new(name,'AREA'); d.energy=power; d.color=color; d.shape='DISK'; d.size=size
    o=bpy.data.objects.new(name,d); STUDIO.objects.link(o); o.location=pos; aim(o,target)
light('Large soft key',(-3,-4,4.3),700,(1,.87,.72),3.5)
light('Cool edge',(2.5,1.8,3.4),950,(.58,.76,1),2.5)
light('Front fill',(2,-4,2.1),330,(.83,.9,1),3)
light('Top steel reflection',(-.3,.4,5),400,(1,.89,.73),2)
camera_data=bpy.data.cameras.new('Review camera'); camera_data.type='ORTHO'; camera_data.ortho_scale=2.45
camera=bpy.data.objects.new('Review camera',camera_data); STUDIO.objects.link(camera); scene.camera=camera
scene.render.engine='CYCLES'
scene.cycles.device='CPU'; scene.cycles.samples=40; scene.cycles.use_denoising=True
scene.cycles.max_bounces=6
scene.render.resolution_x=1400; scene.render.resolution_y=1680; scene.render.resolution_percentage=100
scene.render.image_settings.file_format='PNG'
scene.render.film_transparent=False
scene.view_settings.view_transform='AgX'
scene.view_settings.look='AgX - Medium High Contrast'
scene.render.threads_mode='FIXED'; scene.render.threads=4
scene.camera.location=(3.4,-6,2.9); aim(scene.camera,(0,0,1.04))
# A clean material preview on opening the file, with model selected.
bpy.ops.object.select_all(action='DESELECT'); root.select_set(True); bpy.context.view_layer.objects.active=root
for screen in bpy.data.screens:
    for area in screen.areas:
        if area.type=='VIEW_3D':
            area.spaces.active.region_3d.view_distance=3.3
            area.spaces.active.region_3d.view_location=Vector((0,0,1.03))
            area.spaces.active.clip_end=300
            area.spaces.active.shading.type='MATERIAL'
blend_path=OUT/'Varendor_Knight_01.blend'
bpy.ops.wm.save_as_mainfile(filepath=str(blend_path))
info={'name':'Varendor Knight 01','stage':'1 - appearance review','blender':bpy.app.version_string,'height_m':1.994,'original_assets':True,'rigged':False,'animated':False,'game_files_modified':False,'collections':{c.name:len(c.objects) for c in [BODY,ARMOR,CLOTH,DETAIL,WEAPONS]},'mesh_objects':sum(o.type=='MESH' for o in bpy.data.objects),'raw_faces':sum(len(o.data.polygons) for o in bpy.data.objects if o.type=='MESH'),'note':'Editable Blender appearance study. Procedural materials; no baked game textures or LOD claimed. Retopology/rig and game delivery are subsequent stages.'}
(OUT/'model-info.json').write_text(json.dumps(info,ensure_ascii=False,indent=2))
views=[('01_three_quarter',(3.4,-6,2.7),(0,0,1.04),2.42),('02_front',(0,-7,1.9),(0,0,1.04),2.40),('03_back',(-3.2,6,2.6),(0,0,1.04),2.42),('04_armor_detail',(-2,-5,2.8),(0,-.02,1.54),1.12)]
for name,pos,target,scale in views:
    camera.location=pos; aim(camera,target); camera_data.ortho_scale=scale
    scene.render.filepath=str(OUT/(name+'.png'))
    print('RENDERING '+name,flush=True)
    bpy.ops.render.render(write_still=True)
print('KNIGHT_STAGE_1_COMPLETE '+json.dumps(info),flush=True)
