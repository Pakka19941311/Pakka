"""Create a separate native water source from the saved D16 geometry candidate."""
from pathlib import Path
import hashlib
import json
import bpy

root = Path(__file__).resolve().parents[2]
report_path = root / 'docs/world-final/swamp-water-D16.json'
report = json.loads(report_path.read_text())
source = root / report['mesh']
target = root / 'art/world-final/Varendor_Wetlands_D-16.blend'
if target.exists():
    raise RuntimeError('Preserve native edits; choose a new revision')
assert hashlib.sha256(source.read_bytes()).hexdigest() == report['sha256']
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=str(source))
objects = [obj for obj in bpy.data.objects if obj.type == 'MESH']
assert len(objects) == 1 and len(objects[0].data.vertices) == report['vertices']
water = objects[0]
water.name = 'SWAMP_WATER'
water['stable_id'] = 'SWAMP_WATER'
water['source_revision'] = 'D16'
water['water_level_m'] = report['level_m']
material = bpy.data.materials.new('D16_Shallow_Swamp_Editable')
material.use_nodes = True
nodes, links = material.node_tree.nodes, material.node_tree.links
bsdf = nodes.get('Principled BSDF')
attribute = nodes.new('ShaderNodeAttribute')
attribute.attribute_name = water.data.color_attributes[0].name
split = nodes.new('ShaderNodeSeparateColor')
links.new(attribute.outputs['Color'], split.inputs['Color'])
depth = nodes.new('ShaderNodeMapRange')
depth.clamp = True
depth.interpolation_type = 'SMOOTHSTEP'
depth.inputs['From Max'].default_value = .72
links.new(split.outputs['Red'], depth.inputs['Value'])
mix = nodes.new('ShaderNodeMixRGB')
mix.inputs[1].default_value = (.18, .19, .12, 1)
mix.inputs[2].default_value = (.045, .075, .068, 1)
links.new(depth.outputs['Result'], mix.inputs[0])
links.new(mix.outputs['Color'], bsdf.inputs['Base Color'])
bsdf.inputs['Roughness'].default_value = .34
bsdf.inputs['Specular IOR Level'].default_value = .35
water.data.materials.clear()
water.data.materials.append(material)
bpy.context.scene['scope'] = 'D16 editable swamp water candidate. Terrain, collision and movement unchanged; visual review pending.'
bpy.ops.wm.save_as_mainfile(filepath=str(target), compress=True)
report.update(native_source=target.relative_to(root).as_posix(),
              native_sha256=hashlib.sha256(target.read_bytes()).hexdigest(),
              native_blender_pending=False, visual_verified=False)
report_path.write_text(json.dumps(report, indent=2) + '\n')
print('D16_NATIVE_WATER ' + json.dumps(report), flush=True)
