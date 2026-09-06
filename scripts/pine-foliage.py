"""Rebuild Pine Tree 01 foliage from its own twig atlas and branch positions.

The source has millions of disconnected needle triangles. A global quadric
simplifier deletes almost all of them (248 m2 becomes 5 m2 on variant A).
Instead retain every source twig stem and fit crossed, alpha-tested sprig cards
to that stem. Trunk/bark geometry and the approved source textures are reused.

Run after prepare-world-assets.py: python scripts/pine-foliage.py SOURCE_ROOT
Requires numpy and scipy. No source scripts or Blender drivers are executed.
"""
from pathlib import Path
import hashlib
import json
import struct
import sys

import numpy as np
from scipy.sparse import coo_matrix
from scipy.sparse.csgraph import connected_components

ROOT = Path(__file__).resolve().parents[1]


def accessor(doc, binary, index):
    item = doc['accessors'][index]
    view = doc['bufferViews'][item['bufferView']]
    width = {'SCALAR': 1, 'VEC2': 2, 'VEC3': 3, 'VEC4': 4}[item['type']]
    dtype = np.dtype({5126: '<f4', 5125: '<u4', 5123: '<u2', 5121: 'u1'}[item['componentType']])
    return np.ndarray((item['count'], width), dtype=dtype, buffer=binary,
        offset=view.get('byteOffset', 0) + item.get('byteOffset', 0),
        strides=(view.get('byteStride', width * dtype.itemsize), dtype.itemsize))


def twig_stems(doc, binary, variant):
    primitive = next(p for p in doc['meshes'][doc['nodes'][variant]['mesh']]['primitives']
        if doc['materials'][p['material']]['name'] == 'pine_tree_01_twig')
    positions = accessor(doc, binary, primitive['attributes']['POSITION'])
    uvs = accessor(doc, binary, primitive['attributes']['TEXCOORD_0'])
    faces = accessor(doc, binary, primitive['indices']).reshape(-1, 3)
    graph = coo_matrix((np.ones(len(faces) * 2, dtype='u1'),
        (faces[:, [0, 1]].ravel(), faces[:, [1, 2]].ravel())),
        shape=(len(positions), len(positions)))
    _, labels = connected_components(graph, directed=False)
    del graph
    counts = np.bincount(labels)
    order = np.argsort(labels, kind='stable')
    offsets = np.concatenate(([0], np.cumsum(counts)))
    stems = []
    # Source twig backbones occupy the broad lower-left wood UV island.
    # Individual needles and cones have small, separate UV islands.
    for label in np.flatnonzero(counts > 200):
        indices = order[offsets[label]:offsets[label + 1]]
        uv = uvs[indices]
        low, high = uv.min(axis=0), uv.max(axis=0)
        if not (low[0] < .06 and .40 < low[1] < .43 and .60 < high[0] < .63 and high[1] > .90):
            continue
        points = positions[indices].astype(np.float64)
        centre = points.mean(axis=0)
        _, axes = np.linalg.eigh(np.cov((points - centre).T))
        axis = axes[:, -1]
        if np.dot(axis, [centre[0], 0, centre[2]]) < 0:
            axis = -axis
        along = (points - centre) @ axis
        centre += axis * (along.min() + along.max()) / 2
        length = float(np.ptp(along)) * 1.20
        stems.append((centre, axis, axes[:, 0], length))
    if not 500 <= len(stems) <= 2000:
        raise ValueError(f'Unrecognized source twig layout: {len(stems)} stems')
    return stems


def cards(stems, lod):
    positions, normals, uvs, faces = [], [], [], []
    planes = 3 if lod == 0 else 2
    for centre, axis, side, length in stems:
        other = np.cross(axis, side)
        for plane in range(planes):
            angle = np.pi * plane / planes
            width_axis = side * np.cos(angle) + other * np.sin(angle)
            normal = np.cross(width_axis, axis)
            half_length = axis * length / 2
            half_width = width_axis * length * .36
            start = len(positions)
            positions.extend([centre - half_length - half_width, centre - half_length + half_width,
                centre + half_length + half_width, centre + half_length - half_width])
            normals.extend([normal] * 4)
            # The existing atlas's upper-left sprig; no invented replacement art.
            uvs.extend([(0, .46), (.235, .46), (.235, 0), (0, 0)])
            faces.extend([(start, start + 1, start + 2), (start, start + 2, start + 3)])
    return np.asarray(positions), np.asarray(normals), np.asarray(uvs), np.asarray(faces)


def replace_crown(path, foliage):
    raw = path.read_bytes()
    size = struct.unpack_from('<I', raw, 12)[0]
    doc = json.loads(raw[20:20 + size])
    old_binary = raw[28 + size:]
    original = [(p, {key: accessor(doc, old_binary, value).copy() for key, value in p['attributes'].items()},
        accessor(doc, old_binary, p['indices']).copy()) for p in doc['meshes'][0]['primitives']]
    doc['accessors'], doc['bufferViews'] = [], []
    binary = bytearray()

    def add(values, kind, component=5126):
        binary.extend(b'\0' * (-len(binary) % 4))
        values = np.asarray(values, dtype='<f4' if component == 5126 else '<u4')
        view = len(doc['bufferViews'])
        doc['bufferViews'].append({'buffer': 0, 'byteOffset': len(binary), 'byteLength': values.nbytes})
        binary.extend(values.tobytes())
        record = {'bufferView': view, 'componentType': component, 'count': len(values), 'type': kind}
        if kind == 'VEC3':
            record.update(min=values.min(axis=0).tolist(), max=values.max(axis=0).tolist())
        doc['accessors'].append(record)
        return len(doc['accessors']) - 1

    triangles = 0
    for primitive, attributes, indices in original:
        if doc['materials'][primitive['material']]['name'] == 'pine_tree_01_twig':
            position, normal, uv, indices = foliage
            attributes = {'POSITION': position, 'NORMAL': normal, 'TEXCOORD_0': uv}
        primitive['attributes'] = {key: add(value, 'VEC2' if key.startswith('TEXCOORD') else 'VEC3')
            for key, value in attributes.items()}
        primitive['indices'] = add(indices.reshape(-1, 1), 'SCALAR', 5125)
        triangles += indices.size // 3
    for image in doc.get('images', []):
        image['mimeType'] = 'image/png' if image['uri'].endswith('.png') else 'image/jpeg'
    material = next(m for m in doc['materials'] if m['name'] == 'pine_tree_01_twig')
    material.update(alphaMode='MASK', alphaCutoff=.35, doubleSided=True)
    doc['buffers'] = [{'byteLength': len(binary)}]
    metadata = json.dumps(doc, separators=(',', ':')).encode()
    metadata += b' ' * (-len(metadata) % 4)
    binary.extend(b'\0' * (-len(binary) % 4))
    path.write_bytes(struct.pack('<4sII', b'glTF', 2, 28 + len(metadata) + len(binary))
        + struct.pack('<I4s', len(metadata), b'JSON') + metadata
        + struct.pack('<I4s', len(binary), b'BIN\0') + binary)
    return triangles


def main():
    source = Path(sys.argv[1])
    receipts = json.loads((ROOT / 'docs/assets/world-source-manifest.json').read_text())['files']
    for name in ['pine_tree_01/pine_tree_01_1k.gltf', 'pine_tree_01/pine_tree_01.bin']:
        receipt = next(r for r in receipts if r['path'] == name)
        path = source / name
        with path.open('rb') as handle:
            digest = hashlib.file_digest(handle, 'sha256').hexdigest()
        if path.stat().st_size != receipt['bytes'] or digest != receipt['sha256']:
            raise ValueError(f'Approved source does not match: {name}')
    doc = json.loads((source / 'pine_tree_01/pine_tree_01_1k.gltf').read_text())
    data = np.memmap(source / 'pine_tree_01/pine_tree_01.bin', mode='r', dtype='u1')
    manifest_path = ROOT / 'public/assets/world/prepared-assets.json'
    manifest = json.loads(manifest_path.read_text())
    for variant in range(3):
        stems = twig_stems(doc, data, variant)
        print(f'Variant {variant}: preserved {len(stems)} source twig stems', flush=True)
        for lod in range(2):
            relative = f'assets/world/pine_tree_01/pine_tree_01_{variant}_lod{lod}.glb'
            path = ROOT / 'public' / relative
            triangles = replace_crown(path, cards(stems, lod))
            entry = next(item for item in manifest if item['path'] == relative)
            entry.update(triangles=triangles, bytes=path.stat().st_size,
                sha256=hashlib.sha256(path.read_bytes()).hexdigest(),
                foliage={'method': 'source-twig-atlas-cards', 'sourceStems': len(stems), 'planesPerStem': 3 if lod == 0 else 2})
            print(path.name, triangles, 'triangles', flush=True)
    manifest_path.write_text(json.dumps(manifest, indent=2) + '\n')


if __name__ == '__main__':
    main()
