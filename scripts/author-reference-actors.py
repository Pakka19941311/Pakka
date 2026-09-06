#!/usr/bin/env python3
"""Deterministic B02 actor derivatives; run offline with Python, NumPy and Pillow.

No raster image is generated or edited. Original knight textures are embedded
unchanged. Wolf fur retains its source texture; runtime shading removes orange
without discarding the eyes and muzzle painted inside source triangles.
The spatial remap is applied to mesh vertices, joint rest positions, inverse bind
matrices and translation animation keys together. Rotations and clip timing stay
as authored by the credited source artists.
"""
from __future__ import annotations

import base64
import copy
import io
import json
import struct
from pathlib import Path

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'public/assets/models/reference'
DTYPES = {5120: np.int8, 5121: np.uint8, 5122: np.int16, 5123: np.uint16,
          5125: np.uint32, 5126: np.float32}
WIDTHS = {'SCALAR': 1, 'VEC2': 2, 'VEC3': 3, 'VEC4': 4, 'MAT4': 16}


class Asset:
    def __init__(self, path):
        raw = path.read_bytes()
        if path.suffix == '.glb':
            size = struct.unpack_from('<I', raw, 12)[0]
            self.doc = json.loads(raw[20:20 + size])
            self.buffers = [raw[28 + size:]]
        else:
            self.doc = json.loads(raw)
            self.buffers = [base64.b64decode(b['uri'].split(',')[1]) for b in self.doc['buffers']]
        self.extra = bytearray()
        self.extra_index = len(self.buffers)

    def read(self, index):
        a = self.doc['accessors'][index]
        v = self.doc['bufferViews'][a['bufferView']]
        n, dtype = WIDTHS[a['type']], np.dtype(DTYPES[a['componentType']])
        buf = self.extra if v['buffer'] == self.extra_index else self.buffers[v['buffer']]
        stride = v.get('byteStride', n * dtype.itemsize)
        return np.ndarray((a['count'], n), dtype=dtype, buffer=buf,
                          offset=v.get('byteOffset', 0) + a.get('byteOffset', 0),
                          strides=(stride, dtype.itemsize)).copy()

    def add(self, data, kind, component=5126, bounds=False):
        data = np.asarray(data, dtype=DTYPES[component])
        while len(self.extra) % 4:
            self.extra.append(0)
        view = {'buffer': self.extra_index, 'byteOffset': len(self.extra), 'byteLength': data.nbytes}
        self.extra.extend(data.tobytes())
        self.doc['bufferViews'].append(view)
        a = {'bufferView': len(self.doc['bufferViews']) - 1, 'componentType': component,
             'count': len(data), 'type': kind}
        if bounds:
            a.update(min=data.min(axis=0).tolist(), max=data.max(axis=0).tolist())
        self.doc['accessors'].append(a)
        return len(self.doc['accessors']) - 1

    def image(self, index):
        im = self.doc['images'][index]
        if 'uri' in im:
            raw = base64.b64decode(im['uri'].split(',')[1])
        else:
            v = self.doc['bufferViews'][im['bufferView']]
            raw = self.buffers[v['buffer']][v.get('byteOffset', 0):v.get('byteOffset', 0) + v['byteLength']]
        return np.asarray(Image.open(io.BytesIO(raw)).convert('RGB')) / 255

    def save(self, name):
        self.doc['buffers'] = [{'byteLength': len(b), 'uri': 'data:application/octet-stream;base64,' +
                                base64.b64encode(b).decode()} for b in [*self.buffers, bytes(self.extra)]]
        self.doc['asset']['generator'] = 'Varendor B02 reference derivative; scripts/author-reference-actors.py'
        OUT.mkdir(parents=True, exist_ok=True)
        (OUT / name).write_text(json.dumps(self.doc, ensure_ascii=False, separators=(',', ':')) + '\n')


def matrix(node):
    if 'matrix' in node:
        return np.array(node['matrix']).reshape((4, 4), order='F')
    x, y, z, w = node.get('rotation', [0, 0, 0, 1])
    out = np.eye(4)
    out[:3, :3] = [[1 - 2 * (y*y + z*z), 2 * (x*y - z*w), 2 * (x*z + y*w)],
                   [2 * (x*y + z*w), 1 - 2 * (x*x + z*z), 2 * (y*z - x*w)],
                   [2 * (x*z - y*w), 2 * (y*z + x*w), 1 - 2 * (x*x + y*y)]]
    out[:3, :3] *= np.array(node.get('scale', [1, 1, 1]))
    out[:3, 3] = node.get('translation', [0, 0, 0])
    return out


def hierarchy(doc):
    parents = {child: i for i, node in enumerate(doc['nodes']) for child in node.get('children', [])}
    worlds = {}

    def world(i):
        if i not in worlds:
            worlds[i] = (world(parents[i]) if i in parents else np.eye(4)) @ matrix(doc['nodes'][i])
        return worlds[i]

    for i in range(len(doc['nodes'])):
        world(i)
    return parents, worlds


def bind_hierarchy(asset):
    """The Warrior's default nodes contain a pose, not its mesh bind pose.

    Inverse binds are authoritative for joint rest orientation/position. Using
    the default nodes here would bake the raised sword-arm pose into the mesh.
    """
    doc = asset.doc
    parents, defaults = hierarchy(doc)
    overrides = {}
    for skin_i, skin in enumerate(doc.get('skins', [])):
        mesh_node = next(i for i, n in enumerate(doc['nodes']) if n.get('skin') == skin_i)
        for joint, inverse in zip(skin['joints'], asset.read(skin['inverseBindMatrices'])):
            overrides[joint] = defaults[mesh_node] @ np.linalg.inv(inverse.reshape(4, 4, order='F'))
    output = {}

    def world(i):
        if i not in output:
            output[i] = overrides.get(i)
            if output[i] is None:
                output[i] = (world(parents[i]) if i in parents else np.eye(4)) @ matrix(doc['nodes'][i])
        return output[i]

    for i in range(len(doc['nodes'])):
        world(i)
    return parents, output


def knight_shape(points):
    out = points.copy()
    y = points[:, 1]
    # The source is about 3.2 heads tall. Keep its rig and armour silhouette,
    # but lengthen legs below hips and reduce the oversized head around the neck.
    hip, neck, leg_scale, head_scale = 1.12, 2.07, 1.22, 0.60
    lift = hip * (leg_scale - 1)
    out[:, 1] = np.where(y < hip, y * leg_scale,
                         np.where(y <= neck, y + lift, neck + lift + (y - neck) * head_scale))
    head_weight = np.clip((y - 1.99) / 0.20, 0, 1)
    out[:, 0] *= 1 - head_weight * 0.29
    out[:, 2] = points[:, 2] * (1 - head_weight * 0.29)
    return out


def wolf_shape(points):
    out = points.copy()
    x, y, z = points.T
    # Broader rib cage/neck, shorter ears and a leaner tail. The four feet stay
    # in place; the existing walking/running foot contacts are preserved.
    upper_body = np.clip((y - 25) / 20, 0, 1) * np.clip((z + 44) / 12, 0, 1)
    out[:, 0] *= 1 + upper_body * 0.18
    ears = np.clip((z - 34) / 8, 0, 1)
    out[:, 1] -= np.maximum(0, y - 69) * ears * 0.50
    tail = np.clip((-z - 37) / 12, 0, 1)
    out[:, 0] *= 1 - tail * 0.42
    out[:, 2] += np.maximum(0, -z - 43) * 0.22
    # Compress fluff around its sloping centre line without lifting the paws.
    centre_y = 44 + np.minimum(0, z + 43) * 0.42
    out[:, 1] += (centre_y - y) * tail * 0.22
    return out


def remap(asset, shape):
    doc = asset.doc
    parents, before = bind_hierarchy(asset)
    after = {i: m.copy() for i, m in before.items()}
    for i, m in after.items():
        m[:3, 3] = shape(before[i][:3, 3][None])[0]
    offsets = {}
    for i, node in enumerate(doc['nodes']):
        new_local = np.linalg.inv(after[parents[i]]) @ after[i] if i in parents else after[i]
        old_local = np.linalg.inv(before[parents[i]]) @ before[i] if i in parents else before[i]
        offsets[i] = new_local[:3, 3] - old_local[:3, 3]
        if 'matrix' in node:
            default = matrix(node)
            default[:3, 3] += offsets[i]
            node['matrix'] = default.flatten(order='F').tolist()
        else:
            node['translation'] = (np.array(node.get('translation', [0, 0, 0])) + offsets[i]).tolist()
    diagnostics = []
    for node_i, node in enumerate(doc['nodes']):
        if 'mesh' not in node:
            continue
        old, new = before[node_i], after[node_i]
        for primitive in doc['meshes'][node['mesh']]['primitives']:
            attrs = primitive['attributes']
            positions = asset.read(attrs['POSITION'])
            world = positions @ old[:3, :3].T + old[:3, 3]
            mapped = shape(world)
            local = (mapped - new[:3, 3]) @ np.linalg.inv(new[:3, :3]).T
            attrs['POSITION'] = asset.add(local, 'VEC3', bounds=True)
            if 'NORMAL' in attrs:
                normals = asset.read(attrs['NORMAL']) @ np.linalg.inv(old[:3, :3])
                # Normals use the inverse transpose of the local deformation,
                # not a position-vector remap (important at steel shoulders).
                eps = .0001
                jac = np.stack([(shape(world + np.eye(3)[axis] * eps) -
                                 shape(world - np.eye(3)[axis] * eps)) / (2 * eps)
                                for axis in range(3)], axis=2)
                normals = np.linalg.solve(jac.transpose(0, 2, 1), normals[..., None])[..., 0]
                normals = normals @ new[:3, :3]
                normals /= np.maximum(1e-9, np.linalg.norm(normals, axis=1))[:, None]
                attrs['NORMAL'] = asset.add(normals, 'VEC3')
            diagnostics.append({'mesh': doc['meshes'][node['mesh']].get('name'),
                                'sourceMin': world.min(0).tolist(), 'sourceMax': world.max(0).tolist(),
                                'referenceMin': mapped.min(0).tolist(), 'referenceMax': mapped.max(0).tolist()})
    for skin_i, skin in enumerate(doc.get('skins', [])):
        mesh_node = next(i for i, n in enumerate(doc['nodes']) if n.get('skin') == skin_i)
        ibm = [(np.linalg.inv(after[j]) @ after[mesh_node]).flatten(order='F') for j in skin['joints']]
        skin['inverseBindMatrices'] = asset.add(ibm, 'MAT4')
    for animation in doc.get('animations', []):
        # A sampler can be reused by several channels: clone before adjustment.
        for channel in animation['channels']:
            if channel['target']['path'] != 'translation':
                continue
            sampler = copy.deepcopy(animation['samplers'][channel['sampler']])
            values = asset.read(sampler['output'])
            offset = offsets[channel['target']['node']]
            if sampler.get('interpolation') == 'CUBICSPLINE':
                values[1::3] += offset
            else:
                values += offset
            sampler['output'] = asset.add(values, 'VEC3')
            animation['samplers'].append(sampler)
            channel['sampler'] = len(animation['samplers']) - 1
    return diagnostics


def sample(image, uv):
    h, w = image.shape[:2]
    return image[np.clip((uv[:, 1] * h).astype(int), 0, h-1),
                 np.clip((uv[:, 0] * w).astype(int), 0, w-1)]


def knight_materials(asset):
    """Keep the detailed source maps, separate exposed metal from cloth/skin."""
    doc = asset.doc
    texture = asset.image(0)
    original = copy.deepcopy(doc['materials'][0])
    palette = []
    for name, metallic, roughness in [('Reference tempered steel', .67, .44),
                                      ('Reference worn leather and cloth', .0, .88),
                                      ('Reference skin', .0, .73)]:
        material = copy.deepcopy(original)
        material['name'] = name
        material['pbrMetallicRoughness'].update(metallicFactor=metallic, roughnessFactor=roughness)
        palette.append(len(doc['materials']))
        doc['materials'].append(material)
    doc['materials'][1]['pbrMetallicRoughness'].update(metallicFactor=.72, roughnessFactor=.34)
    doc['materials'][1]['name'] = 'Reference forged sword'
    for mesh in doc['meshes']:
        split = []
        for primitive in mesh['primitives']:
            if primitive.get('material') != 0:
                split.append(primitive)
                continue
            uv = asset.read(primitive['attributes']['TEXCOORD_0'])
            indices = asset.read(primitive['indices']).flatten().reshape(-1, 3)
            colors = sample(texture, uv[indices].mean(axis=1))
            steel = colors.max(1) - colors.min(1) < .105
            skin = (colors[:, 0] > .52) & (colors[:, 1] > .35) & (colors[:, 2] > .19)
            category = np.where(skin, 2, np.where(steel, 0, 1))
            for kind, material in enumerate(palette):
                selected = indices[category == kind].reshape(-1, 1)
                if not len(selected):
                    continue
                part = copy.deepcopy(primitive)
                part['material'] = material
                part['indices'] = asset.add(selected, 'SCALAR', 5123)
                split.append(part)
        mesh['primitives'] = split


def wolf_materials(asset):
    """Preserve the source face/coat pixels for runtime grayscale shading."""
    doc = asset.doc
    for mesh in doc['meshes']:
        for primitive in mesh['primitives']:
            attrs = primitive['attributes']
            # Smooth duplicated source normals across coincident vertices;
            # retain mesh topology, UVs, skin weights and all animation clips.
            pos = asset.read(attrs['POSITION'])
            if 'NORMAL' in attrs:
                normals = asset.read(attrs['NORMAL'])
            else:
                faces = (asset.read(primitive['indices']).reshape(-1, 3) if 'indices' in primitive
                         else np.arange(len(pos)).reshape(-1, 3))
                normals = np.zeros_like(pos)
                face_normals = np.cross(pos[faces[:, 1]] - pos[faces[:, 0]],
                                        pos[faces[:, 2]] - pos[faces[:, 0]])
                for corner in range(3):
                    np.add.at(normals, faces[:, corner], face_normals)
            groups = {}
            for i, p in enumerate(pos):
                groups.setdefault(tuple(np.round(p, 4)), []).append(i)
            for group in groups.values():
                average = normals[group].sum(axis=0)
                average /= max(1e-9, np.linalg.norm(average))
                normals[group] = average
            attrs['NORMAL'] = asset.add(normals, 'VEC3')
    doc['materials'][0]['name'] = 'Reference grey wolf coat'
    doc['materials'][0]['pbrMetallicRoughness'].update(
        baseColorFactor=[1, 1, 1, 1], metallicFactor=0, roughnessFactor=.94)


def main():
    knight = Asset(ROOT / 'public/assets/models/characters/Warrior.gltf')
    knight_report = remap(knight, knight_shape)
    knight_materials(knight)
    knight.doc['extras'] = {'varendorReference': 'b02-knight-v1', 'logicalModel': 'Warrior',
                            'source': 'Quaternius RPG Character Pack, CC0',
                            'changes': 'Longer legs, smaller head; recomputed bind pose; separate steel/leather/skin PBR'}
    knight.save('Knight_Reference.gltf')
    wolf = Asset(ROOT / 'public/assets/models/monsters-glb/Fox.glb')
    wolf_report = remap(wolf, wolf_shape)
    wolf_materials(wolf)
    wolf.doc['extras'] = {'varendorReference': 'b02-grey-wolf-v1', 'logicalModel': 'Fox',
                          'source': 'PixelMannen CC0 model; tomkranis rig/animation, AsoboStudio/scurest glTF CC BY 4.0',
                          'changes': 'Broader chest, shorter ears/tail; source texture with runtime grey coat and smooth normals; recomputed bind pose'}
    wolf.save('Grey_Wolf_Reference.gltf')
    (OUT / 'reference-actors.json').write_text(json.dumps({
        'knight': {'path': 'Knight_Reference.gltf', 'logicalModel': 'Warrior', 'meshes': knight_report},
        'wolf': {'path': 'Grey_Wolf_Reference.gltf', 'logicalModel': 'Fox', 'meshes': wolf_report},
        'limitations': 'Existing source topology and clip set retained; this is the B02 reference step, not the final actor art replacement.'
    }, indent=2) + '\n')
    print('Authored Knight_Reference.gltf and Grey_Wolf_Reference.gltf from local licensed source assets.')


if __name__ == '__main__':
    main()
