from pathlib import Path
import bpy,json,math,struct
from mathutils import Vector
ROOT=Path(__file__).resolve().parents[4];OUT=ROOT/'work/qa/fortress-v3';OUT.mkdir(parents=True,exist_ok=True)
bpy.ops.wm.open_mainfile(filepath=str(ROOT/'art/world-final/Greenfall_Courtyard_P2.blend'),load_ui=False,use_scripts=False)
# Apply glTF color factors to the editable source exactly as the current game does.
raw=(ROOT/'godot-pc/world-final/castle/courtyard-p2.glb').read_bytes();doc=json.loads(raw[20:20+struct.unpack_from('<I',raw,12)[0]])
factors={m['name']:m.get('pbrMetallicRoughness',{}).get('baseColorFactor',[1,1,1,1]) for m in doc['materials']}
for mat in bpy.data.materials:
 if not mat.use_nodes or mat.name not in factors:continue
 bs=mat.node_tree.nodes.get('Principled BSDF');factor=factors[mat.name]
 if not bs:continue
 if bs.inputs['Base Color'].is_linked:
  link=bs.inputs['Base Color'].links[0];source=link.from_socket;mat.node_tree.links.remove(link)
  mul=mat.node_tree.nodes.new('ShaderNodeMixRGB');mul.blend_type='MULTIPLY';mul.inputs[0].default_value=1;mul.inputs[2].default_value=factor
  mat.node_tree.links.new(source,mul.inputs[1]);mat.node_tree.links.new(mul.outputs[0],bs.inputs['Base Color'])
 else:bs.inputs['Base Color'].default_value=factor
before=set(bpy.context.scene.objects)
bpy.ops.import_scene.gltf(filepath=str(ROOT/'godot-pc/world-final/geography/landmarks.glb'))
for ob in list(bpy.context.scene.objects):
 if ob not in before and not ob.name.startswith('FORT'):
  bpy.data.objects.remove(ob,do_unlink=True)
# The imported glTF converts back to Blender's server X/Z authoring convention.
meta=json.loads((ROOT/'godot-pc/world-final/geology-D13/terrain.json').read_text(encoding='utf-8'))
print('TERRAIN_META',meta.keys(),flush=True)
raw=(ROOT/'godot-pc/world-final/geology-D13/heightmap.f32').read_bytes();height=struct.unpack('<'+str(len(raw)//4)+'f',raw)

# Metadata below is read rather than assuming a new terrain floor.
minx,minz=-meta['width']/2,-meta['depth']/2;cols=meta['columns'];rows=meta['rows'];step=meta['step']
verts=[];faces=[];nx=131;nz=136
for j in range(nz):
 z=-285+j*2
 for i in range(nx):
  x=-230+i*2;gx=(x-minx)/step;gz=(-z-minz)/step;c=int(gx);r=int(gz);u=gx-c;v=gz-r
  a=height[r*(cols+1)+c];b=height[r*(cols+1)+c+1];cc=height[(r+1)*(cols+1)+c];d=height[(r+1)*(cols+1)+c+1]
  y=a+u*(b-a)+v*(d-b) if u>=v else a+u*(d-cc)+v*(cc-a)
  verts.append((x,z,y))
for j in range(nz-1):
 for i in range(nx-1):a=j*nx+i;faces.append((a,a+1,a+nx+1,a+nx))
mesh=bpy.data.meshes.new('Actual_D13_Castle_Hill');mesh.from_pydata(verts,[],faces);mesh.update();ob=bpy.data.objects.new(mesh.name,mesh);bpy.context.collection.objects.link(ob)
mat=bpy.data.materials.new('Review_Hill');mat.diffuse_color=(.16,.19,.105,1);ob.data.materials.append(mat)
scene=bpy.context.scene;scene.render.engine='CYCLES';scene.cycles.samples=12;scene.render.threads_mode='FIXED';scene.render.threads=4
scene.render.resolution_x=1400;scene.render.resolution_y=950;scene.render.resolution_percentage=100;scene.view_settings.view_transform='AgX'
scene.world=bpy.data.worlds.new('ReviewSky');scene.world.use_nodes=True;scene.world.node_tree.nodes['Background'].inputs['Color'].default_value=(.34,.40,.48,1);scene.world.node_tree.nodes['Background'].inputs['Strength'].default_value=.65
sun=bpy.data.objects.new('ReviewSun',bpy.data.lights.new('ReviewSun','SUN'));scene.collection.objects.link(sun);sun.data.energy=2.2;sun.rotation_euler=(math.radians(25),math.radians(-30),math.radians(-30))
cam=bpy.data.objects.new('OverviewCamera',bpy.data.cameras.new('OverviewCamera'));scene.collection.objects.link(cam);scene.camera=cam
cam.location=(100,-390,260);target=Vector((-100,-148,75));cam.rotation_euler=(target-cam.location).to_track_quat('-Z','Y').to_euler();cam.data.type='ORTHO';cam.data.ortho_scale=305
scene.render.filepath=str(OUT/'current-overview.png');bpy.ops.render.render(write_still=True)
print('FORTRESS_OVERVIEW_READY',flush=True)
