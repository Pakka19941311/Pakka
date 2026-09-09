"""Export the assembled character as standalone, verified glTF 2.0 assets.

Run with Blender 4.2.3; --preflight opens the source and checks the contract
without exporting. The master .blend and all gameplay files remain untouched.
"""
import argparse
import hashlib
import importlib.util
import json
import struct
import sys
from pathlib import Path

import bpy
import numpy as np
from mathutils import Matrix


FILENAMES = {
    'scarlet': 'Varendor_Forgotten_Knight_Scarlet.glb',
    'northwatch': 'Varendor_Forgotten_Knight_Northwatch.glb',
    'ashwarden': 'Varendor_Forgotten_Knight_Ashwarden.glb',
}
COMPONENTS = {5120: '<i1', 5121: '<u1', 5122: '<i2', 5123: '<u2',
              5125: '<u4', 5126: '<f4'}
WIDTHS = {'SCALAR': 1, 'VEC2': 2, 'VEC3': 3, 'VEC4': 4,
          'MAT2': 4, 'MAT3': 9, 'MAT4': 16}


def load_assembly(path):
    spec = importlib.util.spec_from_file_location('knight_assembly_export', path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def glb_read(path):
    raw = path.read_bytes()
    magic, version, size = struct.unpack_from('<4sII', raw)
    if magic != b'glTF' or version != 2 or size != len(raw):
        raise RuntimeError('Invalid GLB header: ' + path.name)
    cursor, chunks = 12, []
    while cursor < len(raw):
        length, kind = struct.unpack_from('<I4s', raw, cursor)
        cursor += 8
        if length % 4 or cursor + length > len(raw):
            raise RuntimeError('Invalid GLB chunk length')
        chunks.append((kind, raw[cursor:cursor + length]))
        cursor += length
    if not chunks or chunks[0][0] != b'JSON':
        raise RuntimeError('Missing GLB JSON chunk')
    return json.loads(chunks[0][1]), chunks[1:]


def glb_write(path, document, other_chunks):
    payload = json.dumps(document, separators=(',', ':'), ensure_ascii=False).encode('utf-8')
    payload += b' ' * (-len(payload) % 4)
    chunks = [(b'JSON', payload), *other_chunks]
    length = 12 + sum(8 + len(data) for _, data in chunks)
    with path.open('wb') as stream:
        stream.write(struct.pack('<4sII', b'glTF', 2, length))
        for kind, data in chunks:
            stream.write(struct.pack('<I4s', len(data), kind))
            stream.write(data)


def accessor_values(document, blob, index):
    item = document['accessors'][index]
    if 'sparse' in item or 'bufferView' not in item:
        raise RuntimeError('Unexpected sparse/empty accessor')
    view = document['bufferViews'][item['bufferView']]
    if view.get('buffer', 0) != 0:
        raise RuntimeError('Unexpected external accessor buffer')
    dtype = np.dtype(COMPONENTS[item['componentType']])
    width = WIDTHS[item['type']]
    stride = view.get('byteStride', width * dtype.itemsize)
    offset = view.get('byteOffset', 0) + item.get('byteOffset', 0)
    end = offset + max(0, item['count'] - 1) * stride + width * dtype.itemsize
    if item['count'] and end > view.get('byteOffset', 0) + view['byteLength']:
        raise RuntimeError('Accessor extends beyond its buffer view')
    values = np.ndarray((item['count'], width), dtype=dtype, buffer=blob,
                        offset=offset, strides=(stride, dtype.itemsize))
    if item.get('normalized') and item['componentType'] != 5126:
        scale = float(np.iinfo(dtype).max)
        values = np.maximum(values.astype(np.float64) / scale, -1)
    return values


def patch_palette(path, palette, material_factors):
    """Use standard glTF factors for Blender's texture-multiply tint.

    No pixels or texture bytes are modified. Explicit factors avoid relying on
    nonstandard Blender shader-node interpretation in downstream engines.
    """
    document, chunks = glb_read(path)
    factors = {}
    for material in document.get('materials', []):
        name = material.get('name', '')
        if name in material_factors and 'baseColorTexture' in material.get('pbrMetallicRoughness', {}):
            factor = material_factors[name]
            material.setdefault('pbrMetallicRoughness', {})['baseColorFactor'] = factor
            factors[name] = factor
    document.setdefault('asset', {}).setdefault('extras', {}).update({
        'character': 'Varendor Forgotten Knight', 'palette': palette,
        'scope': 'Character art asset; not a gameplay update',
        'armor_source': 'https://sketchfab.com/3d-models/the-forgotten-knight-d14eb14d83bd4e7ba7cbe443d76a10fd',
        'armor_author': 'Igor Oskolskiy (dark_igorek)',
        'armor_license': 'CC-BY-4.0', 'body_license': 'CC0',
        'motion_source': 'Quaternius Universal Animation Library',
        'motion_license': 'CC0', 'up_axis': '+Y', 'visual_forward_axis': '+Z',
    })
    glb_write(path, document, chunks)
    return factors


def verify_glb(path, action_names, body_only, expected_bones):
    document, chunks = glb_read(path)
    blob = next((data for kind, data in chunks if kind == b'BIN\0'), None)
    if blob is None or any('uri' in b for b in document.get('buffers', [])):
        raise RuntimeError('GLB must contain all binary buffers')
    for image in document.get('images', []):
        if 'bufferView' not in image or 'uri' in image:
            raise RuntimeError('GLB must embed every texture image')
    exported_names = [a.get('name', '') for a in document.get('animations', [])]
    if sorted(exported_names) != sorted(action_names):
        raise RuntimeError(f'Animation mismatch: {exported_names!r} != {action_names!r}')
    nodes = document.get('nodes', [])
    forbidden = [n.get('name', '') for n in nodes
                 if n.get('name', '').startswith('Review') or 'camera' in n or 'KHR_lights_punctual' in n.get('extensions', {})]
    if forbidden:
        raise RuntimeError('Studio nodes leaked into export: ' + repr(forbidden))
    mesh_nodes = [n for n in nodes if 'mesh' in n]
    if body_only:
        if [n.get('name') for n in mesh_nodes] != ['FK_Base_Body']:
            raise RuntimeError('BaseBody export contains equipment or lacks the body')
    elif any(n.get('name') == 'FK_Base_Body' for n in mesh_nodes):
        raise RuntimeError('Covered anatomical body leaked into equipped export')
    skins = document.get('skins', [])
    if len(skins) != 1 or len(skins[0]['joints']) != expected_bones:
        raise RuntimeError(f'Expected one {expected_bones}-joint skin; got {[len(s["joints"]) for s in skins]}')
    for index, item in enumerate(document.get('accessors', [])):
        if item['componentType'] == 5126:
            if not np.isfinite(accessor_values(document, blob, index)).all():
                raise RuntimeError(f'Non-finite float accessor {index}')
    worst_weight_error, vertices, primitives = 0.0, 0, 0
    for node in mesh_nodes:
        if 'skin' not in node:
            raise RuntimeError('Unskinned mesh: ' + node.get('name', ''))
        joint_count = len(skins[node['skin']]['joints'])
        for primitive in document['meshes'][node['mesh']]['primitives']:
            attrs = primitive['attributes']
            for required in ('POSITION', 'NORMAL', 'TEXCOORD_0', 'JOINTS_0', 'WEIGHTS_0'):
                if required not in attrs:
                    raise RuntimeError(f'{node.get("name")}: missing {required}')
            weights = accessor_values(document, blob, attrs['WEIGHTS_0'])
            joints = accessor_values(document, blob, attrs['JOINTS_0'])
            if np.any(weights < 0) or not np.isfinite(weights).all():
                raise RuntimeError('Invalid skin weights')
            error = float(np.max(np.abs(weights.sum(axis=1) - 1))) if len(weights) else 0
            worst_weight_error = max(worst_weight_error, error)
            if error > 1e-3 or np.any(joints < 0) or np.any(joints >= joint_count):
                raise RuntimeError(f'Invalid skin normalization/joint index: {node.get("name")}')
            if 'JOINTS_1' in attrs or 'WEIGHTS_1' in attrs:
                raise RuntimeError('Unexpected more than four skin influences')
            vertices += len(weights)
            primitives += 1
    material_summary = []
    for material in document.get('materials', []):
        pbr = material.get('pbrMetallicRoughness', {})
        name = material.get('name', '')
        textured = not body_only and 'eye_plug' not in name
        if textured and any(key not in pbr for key in ('baseColorTexture', 'metallicRoughnessTexture')):
            raise RuntimeError('Missing PBR color/roughness-metal texture: ' + name)
        if textured and 'normalTexture' not in material:
            raise RuntimeError('Missing PBR normal texture: ' + name)
        material_summary.append({'name': name, 'base_color_factor': pbr.get('baseColorFactor', [1, 1, 1, 1]),
                                 'base_color_texture': 'baseColorTexture' in pbr,
                                 'metallic_roughness_texture': 'metallicRoughnessTexture' in pbr,
                                 'normal_texture': 'normalTexture' in material})
    with path.open('rb') as stream:
        digest = hashlib.file_digest(stream, 'sha256').hexdigest()
    return {'file': path.name, 'bytes': path.stat().st_size, 'sha256': digest,
            'animations': exported_names, 'animation_count': len(exported_names),
            'bones': expected_bones, 'skins': len(skins), 'mesh_nodes': [n.get('name') for n in mesh_nodes],
            'primitives': primitives, 'primitive_vertices': vertices,
            'max_skin_weight_sum_error': worst_weight_error,
            'all_float_accessors_finite': True, 'all_textures_embedded': True,
            'materials': material_summary}


def export_options():
    options = dict(export_format='GLB', use_selection=True, use_visible=False,
                   use_renderable=False, use_active_scene=True, export_yup=True,
                   export_apply=False, export_normals=True, export_tangents=True,
                   export_materials='EXPORT', export_image_format='AUTO',
                   export_animations=True, export_animation_mode='ACTIONS',
                   export_frame_range=False, export_frame_step=1,
                   export_force_sampling=True, export_anim_single_armature=True,
                   export_reset_pose_bones=True, export_current_frame=False,
                   export_rest_position_armature=True, export_skins=True,
                   export_def_bones=False, export_leaf_bone=False,
                   export_all_influences=False, export_influence_nb=4,
                   export_morph=False, export_extras=True, export_cameras=False,
                   export_lights=False, export_optimize_animation_size=True)
    available = bpy.ops.export_scene.gltf.get_rna_type().properties.keys()
    missing = sorted(set(options) - set(available))
    if missing:
        raise RuntimeError('Unsupported Blender exporter options: ' + repr(missing))
    return options


def select_assets(objects, rig):
    bpy.ops.object.select_all(action='DESELECT')
    for obj in [rig, *objects]:
        obj.hide_set(False)
        obj.hide_viewport = False
        obj.hide_render = False
        obj.select_set(True)
    bpy.context.view_layer.objects.active = rig
    rig.animation_data_create()
    rig.animation_data.action = None
    for track in rig.animation_data.nla_tracks:
        track.mute = True
    rig.data.pose_position = 'POSE'
    for bone in rig.pose.bones:
        bone.matrix_basis = Matrix.Identity(4)
    bpy.context.scene.frame_set(0)
    bpy.context.view_layer.update()


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--master', required=True)
    ap.add_argument('--output', required=True)
    ap.add_argument('--assembly', default=str(Path(__file__).with_name('assemble_character.py')))
    ap.add_argument('--preflight', action='store_true')
    ap.add_argument('--variants', nargs='+', choices=list(FILENAMES), default=list(FILENAMES))
    ap.add_argument('--skip-base', action='store_true')
    args = ap.parse_args(sys.argv[sys.argv.index('--') + 1:])
    master = Path(args.master).resolve()
    bpy.ops.wm.open_mainfile(filepath=str(master), use_scripts=False)
    assembly = load_assembly(args.assembly)
    rig, body = bpy.data.objects['FK_Humanoid_Rig'], bpy.data.objects['FK_Base_Body']
    equipment = [o for o in bpy.data.objects if o.type == 'MESH' and o.name.startswith('FK_') and o != body]
    if len(rig.data.bones) != 56 or not equipment or not any(o.name == 'FK_weapon_sword' for o in equipment):
        raise RuntimeError('Assembled master does not satisfy the 56-bone/equipment/sword contract')
    actions = sorted(a.name for a in bpy.data.actions)
    if len(actions) != 24:
        raise RuntimeError(f'Expected 24 baked Actions, found {len(actions)}')
    options = export_options()
    print('EXPORT_PREFLIGHT ' + json.dumps({'master': str(master), 'bones': len(rig.data.bones),
          'actions': actions, 'equipment_meshes': len(equipment), 'export_options': options}), flush=True)
    if args.preflight:
        return
    output = Path(args.output).resolve()
    output.mkdir(parents=True, exist_ok=True)
    # Older staged masters may not retain unused material variants. Recreate all
    # variants only when any is missing, without saving or changing the master.
    originals = {m.get('source_material', m.name) for o in equipment for m in o.data.materials if m}
    required = {f'{key}__{name}' for key in assembly.PALETTES if key != 'scarlet' for name in originals}
    if any(name not in bpy.data.materials for name in required):
        assembly.apply_palette(equipment, 'scarlet')
        for name in sorted(required):
            old = bpy.data.materials.get(name)
            if old is not None:
                bpy.data.materials.remove(old, do_unlink=True)
        assembly.prepare_palettes(equipment)
    # The 2 cm studio lift is a preview placement, not character geometry.
    lift = float(rig.get('preview_floor_clearance_m', 0))
    rig.location.z -= lift
    bpy.context.scene.render.fps = 30
    results = []
    for key in args.variants:
        assembly.apply_palette(equipment, key)
        select_assets(equipment, rig)
        factors = {m.name: list(m.get('gltf_base_color_factor', [1, 1, 1, 1]))
                   for o in equipment for m in o.data.materials if m}
        destination = output / FILENAMES[key]
        temporary = output / (destination.stem + '.pending.glb')
        bpy.ops.export_scene.gltf(filepath=str(temporary), **options)
        patch_palette(temporary, key, factors)
        result = verify_glb(temporary, actions, False, len(rig.data.bones))
        temporary.replace(destination)
        result.update(file=destination.name, palette=key)
        results.append(result)
        print('EXPORTED_CHARACTER ' + json.dumps({k: result[k] for k in ('file', 'bytes', 'animation_count', 'bones')}), flush=True)
    if not args.skip_base:
        select_assets([body], rig)
        temporary = output / 'BaseBody.pending.glb'
        bpy.ops.export_scene.gltf(filepath=str(temporary), **options)
        result = verify_glb(temporary, actions, True, len(rig.data.bones))
        temporary.replace(output / 'BaseBody.glb')
        result.update(file='BaseBody.glb', palette='anatomical_base')
        results.append(result)
    palette_factors = [next(m['base_color_factor'] for m in r['materials'] if m['name'].endswith('center_armor_mat'))
                       for r in results if r['palette'] != 'anatomical_base']
    if len({tuple(v) for v in palette_factors}) != len(palette_factors):
        raise RuntimeError('Exported palette factors are not distinct')
    manifest = {'master_file': master.name, 'blender': bpy.app.version_string,
                'scope': 'Character art exports only; not integrated into gameplay',
                'up_axis': '+Y', 'visual_forward_axis': '+Z', 'unit': 'meter',
                'preview_rig_lift_removed_m': lift, 'all_24_actions_in_base_body': True,
                'outputs': results}
    (output / 'export_manifest.json').write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + '\n')
    print('EXPORTS_READY ' + str(output / 'export_manifest.json'), flush=True)


if __name__ == '__main__':
    main()
