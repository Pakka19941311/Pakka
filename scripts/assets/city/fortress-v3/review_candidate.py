from pathlib import Path
import bpy,json,math,struct
from mathutils import Vector
ROOT=Path(__file__).resolve().parents[4];OUT=ROOT/'work/qa/fortress-v3';OUT.mkdir(parents=True,exist_ok=True)
bpy.ops.wm.open_mainfile(filepath=str(ROOT/'art/city-fortress-v3/Greenfall_Fortress_v3.blend'),load_ui=False,use_scripts=False)
# Candidate master already contains native material factors and the replacement defense.
meta=json.loads((ROOT/'godot-pc/world-final/geology-D13/terrain.json').read_text(encoding='utf-8'))
raw=(ROOT/'work/qa/fortress-v3/candidate/hill/heightmap.f32').read_bytes();height=struct.unpack('<'+str(len(raw)//4)+'f',raw)
# Road membership is native COLOR_0 and has a simple Blender preview here.
ob=bpy.data.objects.get('F3_ground_continuous')
if ob:
 mat=bpy.data.materials.new('F3_Ground_Review');mat.use_nodes=True;bs=mat.node_tree.nodes.get('Principled BSDF')
 attr=mat.node_tree.nodes.new('ShaderNodeVertexColor');attr.layer_name='Col'
 mix=mat.node_tree.nodes.new('ShaderNodeMixRGB');mix.inputs[1].default_value=(.18,.15,.105,1);mix.inputs[2].default_value=(.36,.34,.28,1)
 mat.node_tree.links.new(attr.outputs['Color'],mix.inputs[0])
 for socket,path,tint in [(1,'godot-pc/world-final/nature/textures/trail_diff.jpg',(.60,.54,.43,1)),(2,'godot-pc/generated/world_cobblestone_floor_001_albedo.jpg',(.65,.64,.59,1))]:
  tex=mat.node_tree.nodes.new('ShaderNodeTexImage');tex.image=bpy.data.images.load(str(ROOT/path),check_existing=True)
  mul=mat.node_tree.nodes.new('ShaderNodeMixRGB');mul.blend_type='MULTIPLY';mul.inputs[0].default_value=1;mul.inputs[2].default_value=tint
  mat.node_tree.links.new(tex.outputs['Color'],mul.inputs[1]);mat.node_tree.links.new(mul.outputs[0],mix.inputs[socket])
 mat.node_tree.links.new(mix.outputs[0],bs.inputs['Base Color']);bs.inputs['Roughness'].default_value=.9
 ob.data.materials.clear();ob.data.materials.append(mat)
# Metadata below is read rather than assuming a new terrain floor.
minx,minz=-meta['width']/2,-meta['depth']/2;cols=meta['columns'];rows=meta['rows'];step=meta['step']
verts=[];faces=[];nx=221;nz=206
for j in range(nz):
 z=-430+j*2
 for i in range(nx):
  x=-310+i*2;gx=(x-minx)/step;gz=(-z-minz)/step;c=int(gx);r=int(gz);u=gx-c;v=gz-r
  a=height[r*(cols+1)+c];b=height[r*(cols+1)+c+1];cc=height[(r+1)*(cols+1)+c];d=height[(r+1)*(cols+1)+c+1]
  y=a+u*(b-a)+v*(d-b) if u>=v else a+u*(d-cc)+v*(cc-a)
  verts.append((x,z,y))
for j in range(nz-1):
 for i in range(nx-1):a=j*nx+i;faces.append((a,a+1,a+nx+1,a+nx))
mesh=bpy.data.meshes.new('Actual_D13_Castle_Hill');mesh.from_pydata(verts,[],faces);mesh.update();[setattr(face,'use_smooth',True) for face in mesh.polygons];ob=bpy.data.objects.new(mesh.name,mesh);bpy.context.collection.objects.link(ob)
mat=bpy.data.materials.new('Review_Hill');mat.diffuse_color=(.16,.19,.105,1);ob.data.materials.append(mat)
scene=bpy.context.scene;scene.render.engine='CYCLES';scene.cycles.samples=12;scene.render.threads_mode='FIXED';scene.render.threads=4
scene.render.resolution_x=1400;scene.render.resolution_y=950;scene.render.resolution_percentage=100;scene.view_settings.view_transform='AgX'
scene.world=bpy.data.worlds.new('ReviewSky');scene.world.use_nodes=True;scene.world.node_tree.nodes['Background'].inputs['Color'].default_value=(.34,.40,.48,1);scene.world.node_tree.nodes['Background'].inputs['Strength'].default_value=.65
sun=bpy.data.objects.new('ReviewSun',bpy.data.lights.new('ReviewSun','SUN'));scene.collection.objects.link(sun);sun.data.energy=2.2;sun.rotation_euler=(math.radians(25),math.radians(-30),math.radians(-30))
cam=bpy.data.objects.new('OverviewCamera',bpy.data.cameras.new('OverviewCamera'));scene.collection.objects.link(cam);scene.camera=cam
cam.location=(100,-390,260);target=Vector((-100,-148,75));cam.rotation_euler=(target-cam.location).to_track_quat('-Z','Y').to_euler();cam.data.type='ORTHO';cam.data.ortho_scale=305
for name,position,target,scale in [('candidate-overview',(100,-390,260),(-100,-148,75),305),('candidate-gate',(-112,-278,82),(-100,-215,79),110),('candidate-upper-court',(-72,-162,95),(-109,-102,88),103)]:
 cam.location=position;cam.rotation_euler=(Vector(target)-cam.location).to_track_quat('-Z','Y').to_euler();cam.data.ortho_scale=scale;cam.data.type='PERSP' if name=='candidate-gate' else 'ORTHO';cam.data.lens=35
 scene.render.filepath=str(OUT/(name+'.png'));bpy.ops.render.render(write_still=True)
print('FORTRESS_OVERVIEW_READY',flush=True)
