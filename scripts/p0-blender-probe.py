"""P0 technical Blender sample derived from a tracked model, never used by the game."""
import bpy
import hashlib
import json
import math
from pathlib import Path
from mathutils import Vector

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'docs/migration/p0/toolchain-sample'
OUT.mkdir(parents=True, exist_ok=True)
source = ROOT / 'public/assets/models/realism/wooden_crate_01/wooden_crate_01_1k.gltf'
texture = source.parent / 'textures/wooden_crate_01_diff_1k.jpg'
bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene
scene.unit_settings.system = 'METRIC'
scene.unit_settings.scale_length = 1.0
bpy.ops.import_scene.gltf(filepath=str(source))
meshes = [o for o in scene.objects if o.type == 'MESH']
obj = max(meshes, key=lambda o: len(o.data.polygons))
source_mesh_name = obj.name
for other in meshes:
    if other != obj:
        bpy.data.objects.remove(other, do_unlink=True)
obj.rotation_mode = 'XYZ'
obj.name = 'P0Crate'

def check_material(obj):
    assert len(obj.data.uv_layers) > 0
    images = [n.image for m in obj.data.materials if m and m.use_nodes
              for n in m.node_tree.nodes if n.type == 'TEX_IMAGE' and n.image]
    assert images, 'No material texture node'
    for im in images:
        if not im.packed_file:
            im.reload()
        pixel = im.pixels[:4]
        assert len(pixel) == 4 and im.has_data, (im.name, im.filepath, tuple(im.size))
    return [list(im.size) for im in images]

image_sizes = check_material(obj)
original_dimensions = list(obj.dimensions)
scene.frame_start, scene.frame_end = 1, 25
scene.render.fps = 24
obj.keyframe_insert(data_path='rotation_euler', frame=1)
obj.rotation_euler.z += math.radians(20)
obj.keyframe_insert(data_path='rotation_euler', frame=25)
obj.animation_data.action.name = 'P0Rotate'
scene.frame_set(1)
points = [obj.matrix_world @ Vector(c) for c in obj.bound_box]
lo = Vector([min(v[i] for v in points) for i in range(3)])
hi = Vector([max(v[i] for v in points) for i in range(3)])
bpy.ops.mesh.primitive_cube_add(size=1, location=(lo+hi)/2)
collision = bpy.context.object
collision.name = 'P0Collision-colonly'
collision.dimensions = hi-lo
bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
collision['purpose'] = 'P0 collision candidate; Godot behavior not yet verified'
collision.hide_render = True
bpy.ops.file.pack_all()
bpy.context.preferences.filepaths.save_version = 0
bpy.ops.wm.save_as_mainfile(filepath=str(OUT/'p0-crate.blend'), compress=True)
for name in ['p0-crate.glb', 'p0-crate-repeat.glb']:
    bpy.ops.export_scene.gltf(filepath=str(OUT/name), export_format='GLB', export_animations=True, export_extras=True)
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=str(OUT/'p0-crate.glb'))
scene = bpy.context.scene
scene.frame_set(1)
obj = scene.objects['P0Crate']
roundtrip_sizes = check_material(obj)
assert all(abs(a-b) < 1e-5 for a,b in zip(obj.dimensions, original_dimensions)), (list(obj.dimensions), original_dimensions)
assert obj.animation_data and bpy.data.actions
assert 'P0Collision-colonly' in scene.objects
scene.objects['P0Collision-colonly'].hide_render = True
points = [obj.matrix_world @ Vector(c) for c in obj.bound_box]
center = sum(points, Vector())/8
bpy.ops.object.camera_add(location=center+Vector((2,-3,2)))
camera = bpy.context.object
camera.rotation_euler = (center-camera.location).to_track_quat('-Z','Y').to_euler()
camera.data.type = 'ORTHO'
camera.data.ortho_scale = 1.6
scene.camera = camera
bpy.ops.object.light_add(type='AREA', location=center+Vector((2,-2,3)))
bpy.context.object.data.energy = 350
bpy.context.object.data.size = 3
scene.world = bpy.data.worlds.new('P0World')
scene.world.color = (0.15,0.15,0.15)
scene.render.engine = 'CYCLES'
scene.cycles.device = 'CPU'
scene.cycles.samples = 16
scene.render.resolution_x = scene.render.resolution_y = 480
scene.render.resolution_percentage = 100
scene.render.image_settings.file_format = 'PNG'
scene.render.filepath = str(OUT/'blender-cpu-render.png')
bpy.ops.render.render(write_still=True)
report = {
    'blender_version': bpy.app.version_string,
    'source': str(source.relative_to(ROOT)),
    'source_mesh_name': source_mesh_name,
    'source_sha256': hashlib.sha256(source.read_bytes()).hexdigest(),
    'texture': str(texture.relative_to(ROOT)),
    'texture_sha256': hashlib.sha256(texture.read_bytes()).hexdigest(),
    'source_dimensions_blender_m': original_dimensions,
    'roundtrip_dimensions_blender_m': list(obj.dimensions),
    'source_texture_sizes': image_sizes,
    'roundtrip_texture_sizes': roundtrip_sizes,
    'material_uv_scale_rigid_animation_roundtrip': True,
    'repeat_export_completed': True,
    'animation_kind': 'technical rigid rotation, not character skeletal animation',
    'render': 'Blender Cycles CPU 480x480, 16 samples; no game GPU/FPS claim',
    'godot_checks_performed_by_this_script': False,
    'p1_started': False,
}
(OUT/'blender-report.json').write_text(json.dumps(report,indent=2)+'\n')
print(json.dumps(report,indent=2))
