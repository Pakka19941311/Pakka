"""Save a separate editable water mesh; never regenerate or change terrain.

Clip the existing terrain triangles at the authored swamp water level. Dry
islands remain holes, and both clipping and depth use the runtime triangle split.
"""
from pathlib import Path
import hashlib
import json
import struct
import numpy as np
from build_geography import polygon_field, sample_grid

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / 'godot-pc/world-final/nature/assets/swamp_water_D16.glb'
if OUT.exists():
    raise RuntimeError('Preserve saved water geometry; choose a new revision')
height_path = ROOT / 'godot-pc/world-final/geology-D13/heightmap.f32'
source_hash = hashlib.sha256(height_path.read_bytes()).hexdigest()
height = np.fromfile(height_path, dtype='<f4').reshape(701, 801)
layout = json.loads((ROOT / 'godot-pc/world-final/world_layout.json').read_text())
swamp = layout['water']['swamp']
level = swamp['level']
x, z = np.meshgrid(np.linspace(-800, 800, 801), np.linspace(-700, 700, 701))
boundary = polygon_field(x, z, swamp['polygon'])


def clip(vertices, field):
    output = []
    for a, b in zip(vertices, vertices[1:] + vertices[:1]):
        if a[field] <= 0:
            output.append(a)
        if (a[field] <= 0) != (b[field] <= 0):
            t = a[field] / (a[field] - b[field])
            output.append(a + (b - a) * t)
    return output


positions, colors, indices, lookup = [], [], [], {}
area = 0.0
for row, col in np.argwhere((boundary[:-1, :-1] < 3) & (height[:-1, :-1] < level + 3)):
    a, b, c, d = (row, col), (row, col + 1), (row + 1, col), (row + 1, col + 1)
    for corners in [(a, d, b), (a, c, d)]:
        polygon = [np.array([x[r, q], z[r, q], height[r, q] - level + .01, boundary[r, q]]) for r, q in corners]
        polygon = clip(polygon, 2)
        if len(polygon) < 3:
            continue
        polygon = clip(polygon, 3)
        for i in range(1, len(polygon) - 1):
            triangle = [polygon[0], polygon[i], polygon[i + 1]]
            p = np.array([v[:2] for v in triangle])
            triangle_area = abs(np.linalg.det(np.stack([p[1] - p[0], p[2] - p[0]]))) / 2
            if triangle_area < 1e-8:
                continue
            area += triangle_area
            for v in triangle:
                key = (round(float(v[0]), 5), round(float(v[1]), 5))
                if key not in lookup:
                    lookup[key] = len(positions)
                    positions.append([v[0], level, v[1]])
                    depth = float(level - sample_grid(height, v[0], v[1]))
                    colors.append([np.clip(depth / 2.5, 0, 1), 0, 0, 1])
                indices.append(lookup[key])

positions = np.asarray(positions, dtype='<f4')
assert len(positions) and len(indices) % 3 == 0
depths = level - sample_grid(height, positions[:, 0], positions[:, 2])
assert depths.min() >= .009, 'Water must not cover dry terrain'
normals = np.tile(np.array([0, 1, 0], dtype='<f4'), (len(positions), 1))
arrays = [positions, normals, np.asarray(colors, dtype='<f4'), np.asarray(indices, dtype='<u4')]
binary = bytearray()
views, accessors = [], []
for array, kind, component in zip(arrays, ['VEC3', 'VEC3', 'VEC4', 'SCALAR'], [5126, 5126, 5126, 5125]):
    views.append({'buffer': 0, 'byteOffset': len(binary), 'byteLength': array.nbytes})
    binary.extend(array.tobytes())
    accessors.append({'bufferView': len(views)-1, 'componentType': component, 'count': len(array), 'type': kind})
accessors[0].update(min=positions.min(axis=0).tolist(), max=positions.max(axis=0).tolist())
doc = {'asset': {'version': '2.0', 'generator': 'Varendor saved D16 water'},
       'scene': 0, 'scenes': [{'nodes': [0]}],
       'nodes': [{'name': 'SWAMP_WATER_D16', 'mesh': 0}],
       'meshes': [{'name': 'SWAMP_WATER_D16', 'primitives': [{'attributes': {'POSITION': 0, 'NORMAL': 1, 'COLOR_0': 2}, 'indices': 3, 'material': 0}]}],
       'materials': [{'name': 'D16_Shallow_Swamp', 'pbrMetallicRoughness': {'baseColorFactor': [.075, .10, .065, 1], 'metallicFactor': 0, 'roughnessFactor': .34}}],
       'buffers': [{'byteLength': len(binary)}], 'bufferViews': views, 'accessors': accessors}
data = json.dumps(doc, separators=(',', ':')).encode()
data += b' ' * (-len(data) % 4)
OUT.write_bytes(struct.pack('<III', 0x46546c67, 2, 28 + len(data) + len(binary)) + struct.pack('<II', len(data), 0x4e4f534a) + data + struct.pack('<II', len(binary), 0x004e4942) + binary)
assert hashlib.sha256(height_path.read_bytes()).hexdigest() == source_hash
report = {'revision': 'D16', 'status': 'candidate_not_integrated', 'mesh': OUT.relative_to(ROOT).as_posix(),
          'sha256': hashlib.sha256(OUT.read_bytes()).hexdigest(), 'terrain_sha256': source_hash,
          'vertices': len(positions), 'triangles': len(indices)//3, 'area_m2': area,
          'level_m': level, 'minimum_depth_m': float(depths.min()), 'maximum_depth_m': float(depths.max()),
          'terrain_changed': False, 'collision_added': False, 'native_blender_pending': True,
          'visual_verified': False}
(ROOT / 'docs/world-final/swamp-water-D16.json').write_text(json.dumps(report, indent=2) + '\n')
print(json.dumps(report))
