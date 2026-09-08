"""Original editable Varendor environment meshes. Metres; Blender Z is height.
No downloaded model replacements and no changes to the accepted character rigs.
"""
import bpy, math, random
from mathutils import Vector, Matrix

def build_prop(p, mats, mesh, height_at=None):
    before=set(bpy.data.objects);name=p['name'];kind=p['kind'];h=p.get('height',1)
    w=p.get('width',1);d=p.get('depth',1);rng=random.Random(p.get('seed',17))
    def box(label,center,size,mat='wood'):
        x,y,z=center;a,b,c=[s/2 for s in size]
        v=[(x+dx*a,y+dy*b,z+dz*c) for dx,dy,dz in [(-1,-1,-1),(1,-1,-1),(1,1,-1),(-1,1,-1),(-1,-1,1),(1,-1,1),(1,1,1),(-1,1,1)]]
        return mesh(name+'-'+label,v,[(0,3,2,1),(4,5,6,7),(0,1,5,4),(1,2,6,5),(2,3,7,6),(3,0,4,7)],mats[mat])
    def cone(label,center,r1,r2,height,mat='stone',vertices=16):
        bpy.ops.mesh.primitive_cone_add(vertices=vertices,radius1=r1,radius2=r2,depth=height,location=center)
        o=bpy.context.object;o.name=name+'-'+label;o.data.materials.append(mats[mat]);return o
    def beam(label,a,b,r=.055,mat='wood'):
        a,b=Vector(a),Vector(b);v=b-a;o=cone(label,(a+b)/2,r,r,v.length,mat,8);o.rotation_euler=v.to_track_quat('Z','Y').to_euler();return o
    def roof(label,width,depth,height,z=0,mat='roof'):
        a,b=width/2,depth/2
        return mesh(name+'-'+label,[(-a,-b,z),(a,-b,z),(0,-b,z+height),(-a,b,z),(a,b,z),(0,b,z+height)],[(0,1,2),(5,4,3),(0,2,5,3),(2,1,4,5)],mats[mat])
    def slit(x,y,z,width=.38,height=1.15):
        box('dark-window',(x,y,z),(width,.045,height),'dark')
        for dx in [-width/2-.08,width/2+.08]:box('window-jamb',(x+dx,y-.03,z),(.13,.17,height+.26),'stone')
        box('window-lintel',(x,y-.05,z+height/2+.1),(width+.35,.22,.17),'stone')
        box('window-sill',(x,y-.12,z-height/2-.08),(width+.44,.38,.14),'stone')
    if kind=='box':
        box('surface',(0,0,0),(w,d,h),p.get('material','stone'))
    elif kind=='cylinder':
        cone('body',(0,0,0),p['diameter']/2,p['diameter']/2,h,p.get('material','stone'),20)
    elif kind=='roof':
        roof('gable',w,d,h)
        for y in [-d/2,d/2]:
            beam('gable-barge',(-w/2,y,0),(0,y,h),.095);beam('gable-barge',(0,y,h),(w/2,y,0),.095)
        beam('ridge',(0,-d/2,h),(0,d/2,h),.12,'roof')
    elif kind=='battlement':
        box('coping',(0,0,.05),(w,d,.3),'stone')
        count=max(1,round(w/1.65))
        for i in range(count):box('merlon',(-w/2+(i+.5)*w/count,0,.58),(.85,d*.82,.95),'stone')
    elif kind=='tower_crown':
        r=p['radius'];cone('parapet',(0,0,.15),r,r,.32,'stone',24)
        for i in range(12):
            a=i*math.tau/12;o=box('merlon',(math.cos(a)*r*.86,math.sin(a)*r*.86,.72),(.78,.66,1),'stone');o.rotation_euler.z=a
    elif kind=='spire':cone('slate-spire',(0,0,h/2),p['radius'],.12,h,'roof',12)
    elif kind=='windows':
        for i in range(p['count']):
            a=i*math.tau/p['count'];x=math.sin(a)*p['radius'];y=-math.cos(a)*p['radius'];o=box('arrow-slit',(x,y,p['level']),(.27,.065,h),'dark');o.rotation_euler.z=a
    elif kind=='arch':
        r=w/2;s=p['spring'];outer=r+1
        for i in range(18):
            a=i*math.pi/18+.004;b=(i+1)*math.pi/18-.004;v=[]
            for y in [-d/2,d/2]:
                for radius,angle in [(r,a),(outer,a),(outer,b),(r,b)]:v.append((math.cos(angle)*radius,y,s+math.sin(angle)*radius))
            mesh(name+'-voussoir',v,[(1,2,3,0),(7,6,5,4),(4,5,1,0),(5,6,2,1),(6,7,3,2),(7,4,0,3)],mats['stone'])
        box('gate-cornice',(0,0,s+outer+.12),(w+2.3,d+.35,.3),'stone')
    elif kind=='house':
        style=p.get('style','house')
        for x in [-w/2-.03,w/2+.03]:
            for y in [-d/2-.03,d/2+.03]:box('corner-timber',(x,y,h/2),(.24,.24,h),'wood')
        for z in [.55,h*.53,h-.12]:
            for y in [-d/2-.045,d/2+.045]:box('timber-course',(0,y,z),(w+.3,.22,.21))
            for x in [-w/2-.045,w/2+.045]:box('timber-course',(x,0,z),(.22,d+.3,.21))
        for y in [-d/2-.09,d/2+.09]:
            for x in [-w*.31,w*.31]:
                slit(x,y,h*.7,.75 if style!='keep' else .45,1.35)
                box('timber-upright',(x,y,h*.35),(.18,.18,h*.6))
        box('door-frame',(0,-d/2-.12,1.45),(2.1,.22,2.9),'stone')
        for i in range(9):box('door-plank',(-.8+i*.2,-d/2-.255,1.3),(.187,.12,2.55))
        for z in [.5,1.95]:box('door-strap',(0,-d/2-.33,z),(1.72,.04,.12),'iron')
        cone('door-stud',(.56,-d/2-.4,1.35),.09,.09,.08,'iron',8).rotation_euler.x=math.pi/2
        # Diagonal half timber in each bay and chimney silhouette.
        for x in [-w*.32,w*.32]:beam('diagonal-brace',(x-1,-d/2-.11,.75),(x+1,-d/2-.11,h*.5),.095)
        box('chimney',(w*.3,d*.15,h+1.8),(1.05,1.05,4.2),'stone')
        box('chimney-cap',(w*.3,d*.15,h+4),(1.32,1.32,.25),'stone')
        if style=='tavern':
            beam('sign-arm',(w*.3,-d/2,h*.6),(w*.3,-d/2-1.5,h*.6),.08)
            box('tavern-sign',(w*.3,-d/2-1.35,h*.6-.55),(1,.18,.75),'wood')
        if style=='keep':
            for x in [-w/2+.3,w/2-.3]:box('buttress',(x,-d/2-.35,h*.42),(.8,1,h*.84),'stone')
    elif kind=='canopy':
        roof('canvas',w+.4,d+.4,.6,3.05,'canvas')
        for y in [-d/2,d/2]:box('cross-beam',(0,y,3.08),(w+.4,.2,.22))
        for x in [-w/2,w/2]:beam('awning-brace',(x,-d/2,2.25),(x,-d/2+.65,3.05),.085)
    elif kind=='banner':
        # Dense cloth strip; pinned header, free scalloped lower edge.
        vertices=[];faces=[];colors=[]
        for row in range(13):
            t=row/12
            for col in range(5):
                u=col/4;vertices.append(((u-.5)*w,-p.get('offset',.12)+math.sin(t*7)*.05,-t*h+(.2*abs(u-.5) if row==12 else 0)))
                colors.append((1,1,1,t))
        for row in range(12):
            for col in range(4):a=row*5+col;faces.append((a,a+1,a+6,a+5))
        o=mesh(name+'-cloth',vertices,faces,mats['banner']);color=o.data.color_attributes.new(name='Color',type='FLOAT_COLOR',domain='POINT')
        for i,c in enumerate(colors):color.data[i].color=c
        beam('banner-header',(-w*.6,-p.get('offset',.12),.02),(w*.6,-p.get('offset',.12),.02),.065,'iron')
        # An original pale branching tree emblem, with no borrowed heraldry.
        beam('tree-sigil',(0,-p.get('offset',.12)-.07,-h*.72),(0,-p.get('offset',.12)-.07,-h*.2),.026,'gold')
        for side in [-1,1]:
            for z in [-h*.42,-h*.57]:beam('tree-branch',(0,-p.get('offset',.12)-.075,z),(side*w*.23,-p.get('offset',.12)-.075,z+h*.16),.018,'gold')
    elif kind=='anvil':
        box('anvil-foot',(0,0,.72),(.7,.55,.15),'iron');box('anvil-waist',(0,0,.88),(.46,.42,.25),'iron');box('anvil-face',(.05,0,1.05),(1.02,.45,.16),'iron')
        o=cone('anvil-horn',(.72,0,1.04),.2,.015,.54,'iron');o.rotation_euler.y=math.pi/2
    elif kind=='forge':
        for x in [-.86,.86]:box('hearth-side',(x,0,1.1),(.28,1.3,2.2),'stone')
        box('smoke-hood',(0,.3,2.2),(2.1,.8,.6),'iron');box('coals',(0,-.5,1.46),(1.4,.6,.05),'ember')
    elif kind=='barrel_hoops':
        for z in [.1,h*.5,h-.12]:
            bpy.ops.mesh.primitive_torus_add(major_segments=16,minor_segments=4,major_radius=p['radius'],minor_radius=.025,location=(0,0,z));bpy.context.object.data.materials.append(mats['iron'])
    elif kind=='crate_braces':
        for y in [-d/2,d/2]:
            for x in [-w*.35,w*.35]:box('brace',(x,y,h/2),(.075,.045,h),'iron')
            beam('crate-diagonal',(-w/2,y,0),(w/2,y,h),.028)
    elif kind=='rack':
        for x in [-.95,.95]:beam('upright',(x,0,0),(x,0,2),.07)
        box('crossbar',(0,0,1.55),(2.2,.17,.18))
        for x in [-.7,0,.7]:
            beam('spear-shaft',(x,0,.1),(x,.05,2.2),.025);cone('spear-tip',(x,.05,2.32),.09,0,.26,'iron',4)
    elif kind=='training':
        beam('cross-arms',(-.7,0,1.5),(.7,0,1.5),.09)
        cone('straw-body',(0,0,1.22),.34,.29,.9,'straw');cone('straw-head',(0,0,1.94),.21,.15,.32,'straw')
    elif kind=='memorial':
        box('stele',(0,0,1.8),(.95,.65,2.8),'stone');roof('stele-cap',1.25,.95,.4,3.2,'stone')
        box('inscription',(0,-.34,2.3),(.68,.03,.7),'dark')
        beam('memorial-sword',(0,-.43,1),(0,-.43,2.13),.046,'iron');beam('crossguard',(-.25,-.43,1.78),(.25,-.43,1.78),.045,'iron')
    elif kind=='noticeboard':
        for x in [-1.1,1.1]:beam('post',(x,0,0),(x,0,2.3),.075)
        box('board',(0,0,1.65),(2.4,.22,1.1));roof('board-roof',2.7,.7,.25,2.3)
        for x,z in [(-.7,1.65),(-.05,1.75),(.68,1.52)]:box('quest-paper',(x,-.13,z),(.43,.018,.59),'paper')
    elif kind=='firepit':
        for i in range(12):
            a=i*math.tau/12;cone('ring-stone',(math.cos(a)*.8,math.sin(a)*.8,.15),.2,.16,.3,'stone',7)
        for i in range(5):a=i*math.tau/5;beam('fire-log',(-math.cos(a)*.6,-math.sin(a)*.6,.18),(math.cos(a)*.6,math.sin(a)*.6,.3),.07)
        cone('fire-coals',(0,0,.12),.52,.5,.12,'ember')
    elif kind=='well':
        for x in [-1,1]:beam('well-upright',(x,0,0),(x,0,2.5),.1)
        roof('well-roof',2.8,2.5,.7,2.5);beam('well-winch',(-1,0,1.8),(1,0,1.8),.07)
    elif kind=='grave':
        box('slab',(0,0,h*.48),(.55,.18,h),'stone');roof('marker-top',.63,.25,.19,h,'stone')
    elif kind in ['den','mine']:
        box('cave-dark',(0,d/2-.1,2.1),(w*.8,.15,4.2),'dark')
        for side in [-1,1]:
            beam('entrance-timber',(side*w*.33,-d*.3,0),(side*w*.33,-d*.3,4.5),.24)
            beam('entrance-brace',(side*w*.33,-d*.3,3),(side*w*.15,-d*.3,4.5),.16)
        box('entrance-lintel',(0,-d*.3,4.5),(w*.77,.55,.48))
        if kind=='mine':
            for x in [-.8,.8]:beam('mine-rail',(x,-5,.06),(x,d/2,.06),.045,'iron')
            for y in range(-5,3):box('rail-sleeper',(0,y,.02),(2.5,.22,.1))
    elif kind=='tent':
        roof('canvas-tent',w,d,h,0,'tent')
        beam('ridge-pole',(0,-d/2-.4,h),(0,d/2+.4,h),.06)
        for x in [-w/2,w/2]:
            for y in [-d/2,d/2]:beam('guy-rope',(x*.85,y,.65),(x*1.1,y*1.1,0),.012,'straw')
    elif kind=='grass':
        vertices=[];faces=[];colors=[]
        for i in range(p.get('blades',28)):
            x=(rng.random()-.5)*p['patch'];y=(rng.random()-.5)*p['patch'];angle=rng.random()*math.tau;height=h*(.6+rng.random()*.5);width=.009+rng.random()*.005
            dx=math.cos(angle)*width;dy=math.sin(angle)*width;n=len(vertices)
            base=height_at(p['x']+x,p['z']+y)-p['y'] if height_at else 0
            vertices.extend([(x-dx,y-dy,base),(x+dx,y+dy,base),(x+dx+.08,y+dy,base+height*.6),(x+.1,y,base+height)])
            faces.extend([(n,n+1,n+2),(n,n+2,n+3)]);shade=.72+rng.random()*.26;colors.extend([(shade,shade,shade,0),(shade,shade,shade,0),(shade,shade,shade,.6),(shade,shade,shade,1)])
        o=mesh(name,vertices,faces,mats['grass']);layer=o.data.color_attributes.new(name='Color',type='FLOAT_COLOR',domain='POINT')
        for i,c in enumerate(colors):layer.data[i].color=c
    elif kind=='pebbles':
        for i in range(5):
            x=(rng.random()-.5)*p['patch'];y=(rng.random()-.5)*p['patch'];r=.07+rng.random()*.08
            base=height_at(p['x']+x,p['z']+y)-p['y'] if height_at else 0
            cone('track-stone',(x,y,base+.025),r,r*.6,.06+rng.random()*.05,'stone',6)
    elif kind=='mountain':
        bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=2,radius=1);o=bpy.context.object;o.name=name
        for v in o.data.vertices:
            c=v.co;scale=.85+rng.random()*.3;c.x*=p['radius']*scale;c.y*=p['radius']*.72*scale;c.z=(c.z+1)*h*.5*scale
        o.data.materials.append(mats['stone'])
    elif kind=='signpost':
        for z,offset in [(2.2,.2),(1.75,-.2)]:box('direction-board',(offset,0,z),(1.7,.14,.28))
    elif kind=='lantern':
        beam('iron-post',(0,0,0),(0,0,h),.035,'iron');beam('iron-arm',(0,0,h),(.55,0,h),.03,'iron')
        box('lantern-light',(.55,0,h-.36),(.24,.24,.44),'ember')
        for x in [.41,.69]:
            for y in [-.14,.14]:beam('lantern-frame',(x,y,h-.62),(x,y,h-.12),.015,'iron')
        roof('lantern-cap',.45,.42,.15,h-.12,'iron')
    else:
        raise ValueError('Unimplemented territory prop '+kind)
    transform=Matrix.Translation((p.get('x',0),p.get('z',0),p.get('y',0)))@Matrix.Rotation(-p.get('rotation',0),4,'Z')
    for obj in set(bpy.data.objects)-before:obj.matrix_world=transform@obj.matrix_world

def build_wildlife(out,mats):
    """Two original silhouettes with named parts, animated locally in Godot."""
    out.mkdir(parents=True,exist_ok=True)
    for species in ['crow','hare']:
        before=set(bpy.data.objects);root=bpy.data.objects.new(species,None);bpy.context.scene.collection.objects.link(root)
        def ellipsoid(name,position,scale,mat):
            bpy.ops.mesh.primitive_uv_sphere_add(segments=12,ring_count=8,radius=1,location=position);o=bpy.context.object;o.name=name;o.scale=scale;o.data.materials.append(mats[mat]);o.parent=root
            for face in o.data.polygons:face.use_smooth=True
            return o
        if species=='crow':
            ellipsoid('body',(0,0,.23),(.12,.23,.13),'crow');ellipsoid('head',(0,-.18,.34),(.09,.105,.095),'crow')
            ellipsoid('beak',(0,-.29,.32),(.03,.08,.025),'iron')
            for side in [-1,1]:
                ellipsoid('eye'+str(side),(side*.077,-.223,.366),(.012,.012,.012),'gold')
                wing=ellipsoid('wing_left' if side<0 else 'wing_right',(side*.105,.03,.23),(.065,.25,.045),'crow')
                ellipsoid('leg'+str(side),(side*.055,-.03,.08),(.015,.018,.08),'iron')
                ellipsoid('foot'+str(side),(side*.055,-.05,.025),(.033,.06,.015),'iron')
            ellipsoid('tail',(0,.27,.2),(.075,.13,.027),'crow')
        else:
            ellipsoid('body',(0,0,.25),(.16,.3,.21),'hare');ellipsoid('head',(0,-.24,.35),(.115,.13,.115),'hare')
            ellipsoid('nose',(0,-.35,.33),(.027,.025,.022),'dark')
            for side in [-1,1]:
                ellipsoid('ear'+str(side),(side*.065,-.21,.56),(.035,.032,.16),'hare')
                ellipsoid('inner-ear'+str(side),(side*.065,-.241,.57),(.018,.008,.115),'canvas')
                ellipsoid('eye'+str(side),(side*.09,-.304,.4),(.017,.012,.018),'dark')
                ellipsoid('hind-leg'+str(side),(side*.13,.13,.12),(.08,.135,.115),'hare')
                ellipsoid('fore-leg'+str(side),(side*.065,-.18,.11),(.035,.045,.105),'hare')
            ellipsoid('tail',(0,.29,.23),(.055,.055,.06),'paper')
        bpy.ops.object.select_all(action='DESELECT')
        objects=set(bpy.data.objects)-before
        for obj in objects:obj.select_set(True)
        bpy.ops.export_scene.gltf(filepath=str(out/(species+'.glb')),export_format='GLB',use_selection=True,export_animations=False,export_yup=True)
        for obj in objects:bpy.data.objects.remove(obj,do_unlink=True)
