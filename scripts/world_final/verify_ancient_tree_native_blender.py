"""Read the saved D14 master and verify a real in-memory mesh edit survives GLB export."""
from pathlib import Path
import hashlib
import json
import struct
import bpy
import numpy as np

root = Path(__file__).resolve().parents[2]
record = json.loads((root / 'docs/world-final/ancient-tree-D14.json').read_text())
source = root / record['native_source']
before = hashlib.sha256(source.read_bytes()).hexdigest()
assert before == record['native_sha256']
bpy.ops.wm.open_mainfile(filepath=str(source))
meshes = [obj for obj in bpy.data.objects if obj.type == 'MESH']
assert len(meshes) == record['editable_meshes']
assert all(len(obj.data.vertices) and len(obj.data.polygons) and obj.data.uv_layers for obj in meshes)
assert not bpy.data.libraries
assert all(image.packed_file for image in bpy.data.images if image.source == 'FILE')
shell = bpy.data.objects['D14_Ancient_Hollow_Trunk']
assert shell['real_hollow']
vertices = [tuple(v.co) for v in shell.data.vertices]
faces = [tuple(face.vertices) for face in shell.data.polygons]
index = len(vertices) // 3
edited = list(vertices[index]); edited[0] += .375; vertices[index] = tuple(edited)
bpy.ops.wm.read_factory_settings(use_empty=True)
mesh = bpy.data.meshes.new('D14_edit_roundtrip')
mesh.from_pydata(vertices, [], faces)
obj = bpy.data.objects.new('D14_edit_roundtrip', mesh)
bpy.context.scene.collection.objects.link(obj)
obj.select_set(True); bpy.context.view_layer.objects.active = obj
output = root / 'qa-artifacts/world-final/d14-native'
output.mkdir(parents=True, exist_ok=True)
target = output / 'edited-shell.glb'
bpy.ops.export_scene.gltf(filepath=str(target), export_format='GLB', use_selection=True, export_animations=False, export_yup=True)
raw = target.read_bytes()
length = struct.unpack_from('<I', raw, 12)[0]
doc = json.loads(raw[20:20+length]); binary = raw[28+length:]
wanted = np.array([edited[0], edited[2], -edited[1]], dtype='f4')
found = False
for mesh in doc['meshes']:
    for primitive in mesh['primitives']:
        accessor = doc['accessors'][primitive['attributes']['POSITION']]
        view = doc['bufferViews'][accessor['bufferView']]
        offset = view.get('byteOffset', 0) + accessor.get('byteOffset', 0)
        points = np.ndarray((accessor['count'], 3), dtype='<f4', buffer=binary, offset=offset, strides=(view.get('byteStride', 12), 4))
        found |= bool(np.any(np.max(abs(points - wanted), axis=1) < .0001))
assert found and hashlib.sha256(source.read_bytes()).hexdigest() == before
result = {'native_source': record['native_source'], 'sha256': before,
          'blender_version': bpy.app.version_string, 'editable_meshes': record['editable_meshes'],
          'packed_textures_verified': True, 'real_hollow': True, 'edit_offset_m': .375,
          'edited_vertex_found_in_export': found, 'source_unchanged': True,
          'visual_acceptance': False}
(output / 'result.json').write_text(json.dumps(result, indent=2) + '\n')
print('D14_NATIVE_ROUNDTRIP ' + json.dumps(result), flush=True)
