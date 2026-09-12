"""Review only: render the exported city geometry with its GLB material factors."""
from pathlib import Path
import bpy,json,math,struct
from mathutils import Vector
ROOT=Path(__file__).resolve().parents[3];OUT=ROOT/'work/qa/city-upgrade';OUT.mkdir(parents=True,exist_ok=True)
bpy.ops.wm.open_mainfile(filepath=str(ROOT/'art/world-final/Greenfall_Courtyard_P2.blend'),load_ui=False,use_scripts=False)
raw=(ROOT/'godot-pc/world-final/castle/courtyard-p2.glb').read_bytes();doc=json.loads(raw[20:20+struct.unpack_from('<I',raw,12)[0]])
factors={m['name']:m.get('pbrMetallicRoughness',{}).get('baseColorFactor',[1,1,1,1]) for m in doc['materials']}
for mat in bpy.data.materials:
 if not mat.use_nodes or mat.name not in factors:continue
 bs=mat.node_tree.nodes.get('Principled BSDF');factor=factors[mat.name]
 if not bs:continue
 if bs.inputs['Base Color'].is_linked:
  link=bs.inputs['Base Color'].links[0];source=link.from_socket;mat.node_tree.links.remove(link)
  multiply=mat.node_tree.nodes.new('ShaderNodeMixRGB');multiply.blend_type='MULTIPLY';multiply.inputs[0].default_value=1;multiply.inputs[2].default_value=factor
  mat.node_tree.links.new(source,multiply.inputs[1]);mat.node_tree.links.new(multiply.outputs[0],bs.inputs['Base Color'])
 else:bs.inputs['Base Color'].default_value=factor
scene=bpy.context.scene;scene.render.engine='CYCLES';scene.cycles.samples=12;scene.render.threads_mode='FIXED';scene.render.threads=4
scene.render.resolution_x=1200;scene.render.resolution_y=800;scene.render.resolution_percentage=100;scene.view_settings.view_transform='AgX'
scene.world=bpy.data.worlds.new('ReviewSky');scene.world.use_nodes=True;scene.world.node_tree.nodes['Background'].inputs['Color'].default_value=(.34,.40,.48,1);scene.world.node_tree.nodes['Background'].inputs['Strength'].default_value=.65
sun=bpy.data.objects.new('ReviewSun',bpy.data.lights.new('ReviewSun','SUN'));scene.collection.objects.link(sun);sun.data.energy=2.2;sun.rotation_euler=(math.radians(25),math.radians(-30),math.radians(-30))
camera=bpy.data.objects.new('ReviewCamera',bpy.data.cameras.new('ReviewCamera'));scene.collection.objects.link(camera);scene.camera=camera
for name,position,target,lens in [
 ('city-overview',(-40,-240,134),(-104,-155,77),42),
 ('city-market',(-98,-208,75),(-131,-161,77),26),
 ('city-citadel',(-102,-154,74),(-116,-108,82),25)]:
 camera.location=position;camera.rotation_euler=(Vector(target)-camera.location).to_track_quat('-Z','Y').to_euler();camera.data.lens=lens
 scene.render.filepath=str(OUT/(name+'.png'));bpy.ops.render.render(write_still=True)
print('CITY_RENDER_READY',flush=True)
