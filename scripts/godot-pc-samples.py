"""P1-11 original modular world samples. Deterministic Blender source + native GLB.
Existing licensed PBR maps retain their provenance; every sample mesh is authored here.
The accepted gameplay world is separate from this review scene.
"""
import bpy, math, random, json
from pathlib import Path
from mathutils import Vector
ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'godot-pc/generated'; SOURCE=ROOT/'world-source/p1-samples'
SOURCE.mkdir(parents=True,exist_ok=True)
bpy.ops.wm.read_factory_settings(use_empty=True)
scene=bpy.context.scene; scene.unit_settings.system='METRIC'; scene.unit_settings.scale_length=1
rng=random.Random(7112026); colliders=[]; assets=[]

def material(name,color,maps=None):
    m=bpy.data.materials.new(name);m.use_nodes=True
    b=m.node_tree.nodes.get('Principled BSDF');b.inputs['Base Color'].default_value=(*color,1);b.inputs['Roughness'].default_value=.9
    if maps:
        for suffix,input_name in [('albedo','Base Color'),('roughness','Roughness'),('normal','Normal')]:
            path=ROOT/f'public/assets/textures/pbr/{maps}_{suffix}.jpg'
            if not path.exists():continue
            n=m.node_tree.nodes.new('ShaderNodeTexImage');n.image=bpy.data.images.load(str(path),check_existing=True)
            if suffix!='albedo':n.image.colorspace_settings.name='Non-Color'
            if suffix=='normal':
                normal=m.node_tree.nodes.new('ShaderNodeNormalMap');m.node_tree.links.new(n.outputs['Color'],normal.inputs['Color']);m.node_tree.links.new(normal.outputs['Normal'],b.inputs[input_name])
            else:m.node_tree.links.new(n.outputs['Color'],b.inputs[input_name])
    return m
stone=material('P1 coursed weathered stone',(.41,.43,.39),'castle_wall_slates')
wood=material('P1 aged pine bark',(.29,.23,.16),'medieval_wood')
earth=material('P1 packed road earth',(.25,.26,.18),'cobblestone_floor_001')
needles=material('P1_Wind_Needles',(.12,.23,.12));grassmat=material('P1_Wind_Grass',(.25,.35,.13))
for m in [needles,grassmat]:
    m.use_backface_culling=False
    n=m.node_tree.nodes.new('ShaderNodeVertexColor');n.layer_name='Color'
    m.node_tree.links.new(n.outputs['Color'],m.node_tree.nodes.get('Principled BSDF').inputs['Base Color'])

def uv(obj):
    mesh=obj.data
    if mesh.uv_layers:layer=mesh.uv_layers.active
    else:layer=mesh.uv_layers.new(name='UVMap')
    for face in mesh.polygons:
        normal=face.normal;axes=(0,1) if abs(normal.z)>.5 else (0,2) if abs(normal.y)>.5 else (1,2)
        for index in face.loop_indices:
            v=obj.matrix_world@mesh.vertices[mesh.loops[index].vertex_index].co
            layer.data[index].uv=(v[axes[0]]/2,v[axes[1]]/2)

def box(name,center,size,mat,bevel=.025):
    bpy.ops.mesh.primitive_cube_add(size=1,location=center);o=bpy.context.object;o.name=name;o.scale=size
    bpy.ops.object.transform_apply(location=False,rotation=False,scale=True);o.data.materials.append(mat);uv(o)
    if bevel:
        b=o.modifiers.new('Worn dressed edges','BEVEL');b.width=bevel;b.segments=2
    return o

def combine(objects,name):
    bpy.ops.object.select_all(action='DESELECT')
    for o in objects:o.select_set(True)
    bpy.context.view_layer.objects.active=objects[0]
    bpy.ops.object.convert(target='MESH');bpy.ops.object.join();o=bpy.context.object;o.name=name
    bpy.ops.object.transform_apply(location=True,rotation=True,scale=True);return o

def collider(x,z,hx,hz,height,rotation=0,bottom=0,walking=True):
    colliders.append(dict(kind='box',x=x,z=z,halfX=hx,halfZ=hz,rotation=rotation,bottom=bottom,top=height,blocksMovement=walking))

def wall(name,x,z,rotation=0):
    parts=[]
    for row in range(6):
        for col in range(4):
            width=.735;height=.47
            px=-1.5+(col+.5)*.75
            block=box(name,(px,0,row*.5+.25),(width,.72+rng.uniform(-.015,.015),height),stone)
            parts.append(block)
    for col in range(3):parts.append(box(name,(-1+(col)*1,0,3.1),(.98,.92,.23),stone))
    obj=combine(parts,name);obj.location.x+=x;obj.location.y+=z;obj.rotation_euler.z=-rotation
    collider(x,z,1.5,.4,3.23,rotation)
    return obj

box('P1_sample_ground',(0,0,-.2),(30,28,.35),earth,0)
for index in range(4):wall(f'P1_wall_{index}',-10.5+3*index,4)
wall('P1_corner_return',-12,2.1,math.pi/2)
assets.append(dict(assetId='varendor.p1.wall',version=1,focus=[-7.5,4],height=3.23,modules=4,uvMetres=2,lod='Godot generated mesh LOD'))
assets.append(dict(assetId='varendor.p1.corner',version=1,focus=[-12,3],height=3.23,lod='Godot generated mesh LOD'))
# Dressed semicircular arch: the hole is geometry, never an invisible solid box.
x,z=4.3,4;parts=[]
for side in [-1,1]:
    for row in range(6):parts.append(box('P1_gate_pier',(x+side*1.95,z,row*.5+.25),(.56,.9,.48),stone))
    collider(x+side*1.95,z,.3,.45,3)
for i in range(18):
    a=i*math.pi/18+.005;b=(i+1)*math.pi/18-.005;v=[]
    for y in [z-.45,z+.45]:
        for radius,angle in [(1.66,a),(2.24,a),(2.24,b),(1.66,b)]:v.append((x+math.cos(angle)*radius,y,3+math.sin(angle)*radius))
    mesh=bpy.data.meshes.new('Arch dressed wedge');mesh.from_pydata(v,[],[(0,3,2,1),(4,5,6,7),(0,1,5,4),(1,2,6,5),(2,3,7,6),(3,0,4,7)]);mesh.update()
    o=bpy.data.objects.new('Arch wedge',mesh);scene.collection.objects.link(o);o.data.materials.append(stone);uv(o);parts.append(o)
    lo=min(p[0] for p in v);hi=max(p[0] for p in v);bottom=min(p[2] for p in v);top=max(p[2] for p in v)
    collider((lo+hi)/2,z,(hi-lo)/2,.45,top,bottom=bottom,walking=False)
combine(parts,'P1_gate')
assets.append(dict(assetId='varendor.p1.gate',version=1,focus=[x,z],height=5.24,clearWidth=3.32,clearHeight=3,lod='Godot generated mesh LOD'))
# Authored weathered boulder; fixed seed retains contact and silhouette.
bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=3,radius=1,location=(2.5,-4,0));rock=bpy.context.object;rock.name='P1_boulder'
for v in rock.data.vertices:
    c=v.co;factor=1+.14*math.sin(c.x*8+c.z*5)+.07*math.cos(c.y*11)
    c.x*=1.6*factor;c.y*=1.2*factor;c.z=(c.z+1)*.98*factor
rock.data.materials.append(stone);uv(rock)
for p in rock.data.polygons:p.use_smooth=True
colliders.append(dict(kind='circle',x=2.5,z=-4,radius=1.36,bottom=0,top=2.2))
assets.append(dict(assetId='varendor.p1.boulder',version=1,focus=[2.5,-4],height=2.2,lod='Godot generated mesh LOD',seed=7112026))

def beam(name,a,b,r1,r2,mat,vertices=9):
    a,b=Vector(a),Vector(b);v=b-a
    bpy.ops.mesh.primitive_cone_add(vertices=vertices,radius1=r1,radius2=r2,depth=v.length,location=(a+b)/2)
    o=bpy.context.object;o.name=name;o.rotation_euler=v.to_track_quat('Z','Y').to_euler();o.data.materials.append(mat);uv(o);return o

def foliage(name,vertices,faces,colors,mat):
    mesh=bpy.data.meshes.new(name);mesh.from_pydata(vertices,[],faces);mesh.update()
    color=mesh.color_attributes.new(name='Color',type='FLOAT_COLOR',domain='POINT')
    for i,c in enumerate(colors):color.data[i].color=c
    o=bpy.data.objects.new(name,mesh);scene.collection.objects.link(o);mesh.materials.append(mat);return o

# Woody trunk/roots never receive the foliage wind material. Three explicit LODs
# keep the same crown envelope and seed; only needle density changes.
x,z=-5,-5;branches=[beam('P1_pine_trunk',(x,z,0),(x+.07,z,9),.29,.025,wood,14)]
for k in range(7):
    a=k*math.tau/7;branches.append(beam('P1_pine_root',(x+math.cos(a)*.8,z+math.sin(a)*.8,.03),(x,z,.55),.07,.15,wood))
whorls=[]
for row in range(9):
    height=2.1+row*.72;radius=(9-height)*.37
    for k in range(7):
        angle=k*math.tau/7+row*.71
        start=Vector((x,z,height));tip=start+Vector((math.cos(angle)*radius,math.sin(angle)*radius,.24))
        branches.append(beam('P1_pine_branch',start,tip,.035*(1-row*.07),.007,wood,6));whorls.append((start,tip,angle,row))
combine(branches,'P1_pine_wood')
for lod,density in [(0,12),(1,7),(2,4)]:
    verts=[];faces=[];colors=[];random_leaf=random.Random(119)
    for start,tip,angle,row in whorls:
        for tuft in range(11):
            t=.13+tuft*.079;center=start.lerp(tip,t)
            for needle in range(density):
                a=angle+(needle/max(1,density-1)-.5)*2.9
                length=.26+(1-t)*.34;length*=.85+random_leaf.random()*.3
                lateral=Vector((-math.sin(a),math.cos(a),0))*(.025 if lod==0 else .045)
                end=center+Vector((math.cos(a)*length,math.sin(a)*length,.09+random_leaf.random()*.07))
                n=len(verts);verts += [tuple(center-lateral),tuple(center+lateral),tuple(end)];faces.append((n,n+1,n+2))
                shade=.8+random_leaf.random()*.35
                colors += [( .16*shade,.25*shade,.11*shade,center.z/9)]*3
    o=foliage(f'P1_pine_needles_LOD{lod}',verts,faces,colors,needles);o['lod']=lod
colliders.append(dict(kind='circle',x=x,z=z,radius=.32,bottom=0,top=9))
assets.append(dict(assetId='varendor.p1.pine',version=1,focus=[x,z],height=9,lodDistances=[30,55,110],wind='foliage vertex alpha; woody trunk and roots fixed',seed=119))
# A handful of grass species with blade silhouettes rather than alpha cards.
for patch in range(4):
    verts=[];faces=[];colors=[];cx=6+patch*.8;cz=-3+patch*.4
    for tuft in range(16):
        tx=cx+rng.uniform(-.65,.65);tz=cz+rng.uniform(-.6,.6)
        for blade in range(9):
            angle=rng.random()*math.tau;h=rng.uniform(.22,.62);w=rng.uniform(.018,.035)
            base=Vector((tx,tz,.015));side=Vector((math.cos(angle)*w,math.sin(angle)*w,0));bend=Vector((math.cos(angle)*h*.22,math.sin(angle)*h*.22,h))
            n=len(verts);verts += [tuple(base-side),tuple(base+side),tuple(base+bend*.6+side*.6),tuple(base+bend)]
            faces += [(n,n+1,n+2),(n,n+2,n+3)];colors += [(.14,.20,.075,0),(.14,.20,.075,0),(.29,.39,.13,.6),(.4,.45,.2,1)]
    foliage(f'P1_grass_{patch}',verts,faces,colors,grassmat)
assets.append(dict(assetId='varendor.p1.grass',version=1,focus=[7,-2.5],height=.62,lod='distance fade at 45 m; roots fixed',seed=7112026))
for image in bpy.data.images:
    if image.source=='FILE':image.pack()
manifest={'schema':1,'sampleVersion':'p1-11-v1','units':'metres','seed':7112026,'meshes':'original geometry authored in scripts/godot-pc-samples.py','materialSources':['public/assets/textures/pbr/castle_wall_slates_*','public/assets/textures/pbr/medieval_wood_*','public/assets/textures/pbr/cobblestone_floor_001_*'],'licenseReferences':'public/assets/licenses','assets':assets,'colliders':colliders,'artApproval':'pending owner review; not deployed across gameplay map'}
(SOURCE/'ASSETS.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2)+'\n')
(OUT/'p1-samples.json').write_text(json.dumps(manifest,ensure_ascii=False)+'\n')
bpy.ops.wm.save_as_mainfile(filepath=str(SOURCE/'Varendor_P1_Samples.blend'))
bpy.ops.export_scene.gltf(filepath=str(OUT/'p1-samples.glb'),export_format='GLB',export_animations=False,export_apply=True,export_yup=True)
print('VARENDOR_P1_SAMPLES_READY '+json.dumps({'assets':len(assets),'colliders':len(colliders),'triangles':sum(len(o.data.polygons) for o in scene.objects if o.type=='MESH')}))
