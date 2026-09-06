"""Prepare the approved ChuckCG free castle source with Blender 4.5 LTS.

Run with Python 3.11 + bpy==4.5.13. Source scripts are never executed.
The source purchase link/receipt is private; only the public product URL is
recorded. Each module has a centred footprint, ground at zero and unit height.
"""
import argparse
import hashlib
import json
import math
import shutil
import struct
import tempfile
from pathlib import Path
from urllib.parse import unquote

import bpy
from mathutils import Matrix, Vector

SOURCE_SHA = 'a1d0bb60837ebfeeeb0f9b8da899c0ba3610d743b41e0913d5cf0dd3f8bce55e'
MODULES = {
    'castle_arch': ('castle_element_07', 0),
    'castle_wall': ('castle_element_03', 0),
    'castle_tower': ('castle_element_04', 0),
    'castle_keep': ('castle_element_09', 0),
    'castle_spire': ('castle_element_10', 0),
    'castle_turret': ('castle_element_11', 0),
}


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def bounds(mesh):
    return (Vector(tuple(min(v.co[k] for v in mesh.vertices) for k in range(3))),
            Vector(tuple(max(v.co[k] for v in mesh.vertices) for k in range(3))))


def arch_profile(mesh):
    """Conservative vertical slabs clipped from the actual exported triangles.

    This retains the empty passage while supplying an overhead camera/LOS
    obstruction; a single full-footprint box would close the gate again.
    """
    mesh.calc_loop_triangles()
    low, high = bounds(mesh)
    def clip(polygon, edge, keep_above):
        result = []
        for a, b in zip(polygon, polygon[1:] + polygon[:1]):
            inside_a = a.x >= edge if keep_above else a.x <= edge
            inside_b = b.x >= edge if keep_above else b.x <= edge
            if inside_a:
                result.append(a)
            if inside_a != inside_b:
                result.append(a.lerp(b, (edge - a.x) / (b.x - a.x)))
        return result
    result = []
    for index in range(24):
        a = low.x + (high.x-low.x)*index/24
        b = low.x + (high.x-low.x)*(index+1)/24
        points = []
        for triangle in mesh.loop_triangles:
            polygon = [mesh.vertices[v].co.copy() for v in triangle.vertices]
            if max(v.x for v in polygon) < a or min(v.x for v in polygon) > b:
                continue
            polygon = clip(clip(polygon, a, True), b, False)
            points.extend(polygon)
        if points:
            result.append({'left': round(a/(high.x-low.x),6), 'right': round(b/(high.x-low.x),6),
                           'bottom': round(min(v.z for v in points),6), 'top': round(max(v.z for v in points),6)})
    return result


def glb_from_export(path, destination):
    doc = json.loads(path.read_text())
    assert len(doc['buffers']) == 1
    binary = (path.parent / unquote(doc['buffers'][0].pop('uri'))).read_bytes()
    for image in doc.get('images', []):
        relative = Path(unquote(image['uri']))
        assert not relative.is_absolute() and '..' not in relative.parts
        target = destination.parent / relative
        target.parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(path.parent / relative, target)
        image['uri'] = relative.as_posix()
    # Generator is metadata, not a runtime dependency.
    doc['asset']['copyright'] = 'ChuckCG — Medieval Castle Asset Pack; commercial project use permitted.'
    json_bytes = json.dumps(doc, separators=(',', ':')).encode()
    json_bytes += b' ' * (-len(json_bytes) % 4)
    binary += b'\0' * (-len(binary) % 4)
    destination.write_bytes(struct.pack('<4sII', b'glTF', 2, 28 + len(json_bytes) + len(binary))
        + struct.pack('<I4s', len(json_bytes), b'JSON') + json_bytes
        + struct.pack('<I4s', len(binary), b'BIN\0') + binary)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('source', type=Path)
    parser.add_argument('--output', type=Path, default=Path(__file__).resolve().parents[1] / 'public/assets/world/castle_pack')
    args = parser.parse_args()
    if digest(args.source) != SOURCE_SHA:
        raise ValueError('Unreviewed castle source: SHA-256 differs from the approved file.')
    args.output.mkdir(parents=True, exist_ok=True)
    bpy.context.preferences.filepaths.use_scripts_auto_execute = False
    bpy.ops.wm.open_mainfile(filepath=str(args.source.resolve()), load_ui=False, use_scripts=False)
    scene = bpy.context.scene
    scene.render.image_settings.quality = 90
    scene.render.image_settings.color_depth = '8'
    # Keep the source's baked colour, tangent normal and roughness. 4K source
    # textures are reduced before export; local game files share the same maps.
    used_materials = {m for source, _ in MODULES.values() for m in bpy.data.objects[source].data.materials if m}
    images = {n.image for m in used_materials for n in m.node_tree.nodes if n.type == 'TEX_IMAGE' and n.image}
    for image in images:
        if 'displacement' in image.name.lower() or 'height' in image.name.lower():
            continue
        if max(image.size) > 1024:
            image.scale(1024, 1024)
        # Re-pack the changed pixels; exporting the old packed source would
        # silently bring the original 4K maps back into the game.
        image.pack()
    depsgraph = bpy.context.evaluated_depsgraph_get()
    prepared = []
    for key, (source_name, angle) in MODULES.items():
        source = bpy.data.objects[source_name]
        evaluated = source.evaluated_get(depsgraph)
        mesh = bpy.data.meshes.new_from_object(evaluated, preserve_all_data_layers=True, depsgraph=depsgraph)
        # Apply source scale/rotation without its presentation-grid translation.
        transform = source.matrix_world.copy()
        transform.translation = Vector((0, 0, 0))
        mesh.transform(Matrix.Rotation(angle, 4, 'Z') @ transform)
        low, high = bounds(mesh)
        if key == 'castle_arch' and high.x-low.x < high.y-low.y:
            mesh.transform(Matrix.Rotation(math.pi/2, 4, 'Z'))
            low, high = bounds(mesh)
        span = high - low
        centre = Vector(((low.x + high.x) / 2, (low.y + high.y) / 2, low.z))
        for vertex in mesh.vertices:
            vertex.co = (vertex.co - centre) / span.z
        mesh.update()
        near = bpy.data.objects.new(key, mesh)
        scene.collection.objects.link(near)
        mesh.calc_loop_triangles()
        near_triangles = len(mesh.loop_triangles)
        record = {'name': key, 'source_object': source_name,
                  'size': [round(span.x / span.z, 6), 1, round(span.y / span.z, 6)], 'lods': []}
        if key == 'castle_arch':
            record['collision_profile'] = arch_profile(mesh)
        for lod in (0, 1):
            obj = near if lod == 0 else near.copy()
            if lod:
                obj.data = near.data.copy()
                scene.collection.objects.link(obj)
                # Preserve the passage silhouette exactly at both distances.
                if key != 'castle_arch' and near_triangles > 1800:
                    modifier = obj.modifiers.new('Distance simplification', 'DECIMATE')
                    modifier.ratio = .42
                    modifier.delimit = {'MATERIAL', 'SEAM'}
            bpy.ops.object.select_all(action='DESELECT')
            obj.select_set(True)
            bpy.context.view_layer.objects.active = obj
            with tempfile.TemporaryDirectory(prefix='varendor-castle-') as temp:
                exported = Path(temp) / f'{key}_lod{lod}.gltf'
                bpy.ops.export_scene.gltf(filepath=str(exported), export_format='GLTF_SEPARATE',
                    export_texture_dir='textures', use_selection=True, export_apply=True,
                    export_animations=False, export_cameras=False, export_lights=False,
                    export_image_format='AUTO', export_materials='EXPORT', export_yup=True)
                glb_from_export(exported, args.output / f'{key}_lod{lod}.glb')
            evaluated_lod = obj.evaluated_get(bpy.context.evaluated_depsgraph_get()).to_mesh()
            evaluated_lod.calc_loop_triangles()
            record['lods'].append({'lod': lod, 'triangles': len(evaluated_lod.loop_triangles)})
            obj.evaluated_get(bpy.context.evaluated_depsgraph_get()).to_mesh_clear()
            if lod:
                bpy.data.objects.remove(obj, do_unlink=True)
        prepared.append(record)
        print(key, record['lods'], flush=True)
    files = [{'path': p.relative_to(args.output).as_posix(), 'bytes': p.stat().st_size, 'sha256': digest(p)}
             for p in sorted(args.output.rglob('*')) if p.is_file() and p.name != 'prepared-castle.json']
    manifest = {'source': {'url': 'https://chuckcg.gumroad.com/l/sfehn', 'file': 'castle_pack.blend',
        'sha256': SOURCE_SHA, 'bytes': args.source.stat().st_size, 'author': 'ChuckCG',
        'license': 'Author permits commercial project use; machine-learning use excluded.'},
        'toolchain': {'blender': bpy.app.version_string, 'python': '3.11', 'texture_size': 1024},
        'coordinate_contract': 'glTF +Y up, unit height, footprint centred at zero; source floor at zero',
        'modules': prepared, 'files': files}
    (args.output / 'prepared-castle.json').write_text(json.dumps(manifest, indent=2) + '\n')


if __name__ == '__main__':
    main()
