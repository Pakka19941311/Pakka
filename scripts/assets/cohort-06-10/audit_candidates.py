"""Inspect exported GLBs and sample their imported animation, without Godot.

Blender 4.2.3 --background --factory-startup --disable-autoexec --python this.py
-- --models <cohort folder> --output <report directory>
Floor observations are evidence, not runtime acceptance or collider values.
"""
import argparse, hashlib, json, math, struct, sys
from pathlib import Path
import bpy

p = argparse.ArgumentParser()
p.add_argument('--models', required=True)
p.add_argument('--output', required=True)
a = p.parse_args(sys.argv[sys.argv.index('--') + 1:])
root, out = Path(a.models).resolve(), Path(a.output).resolve()
out.mkdir(parents=True, exist_ok=True)
results = []

for source in sorted(root.glob('*/*.glb')):
    data = source.read_bytes()
    assert data[:4] == b'glTF'
    length = struct.unpack_from('<I', data, 12)[0]
    gltf = json.loads(data[20:20 + length])
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.context.scene.render.fps = 30
    bpy.ops.import_scene.gltf(filepath=str(source))
    scene = bpy.context.scene
    custom_shapes = {bone.custom_shape for obj in scene.objects if obj.type == 'ARMATURE' for bone in obj.pose.bones if bone.custom_shape}
    meshes = [o for o in scene.objects if o.type == 'MESH' and o not in custom_shapes]
    holders = [o for o in scene.objects if o.animation_data]
    holders += [o.data.shape_keys for o in meshes if o.data.shape_keys and o.data.shape_keys.animation_data]
    track_names = sorted({t.name for o in holders for t in o.animation_data.nla_tracks})
    for holder in holders:
        holder.animation_data.action = None
    clips = []
    for track_name in track_names:
        strips = []
        for holder in holders:
            for track in holder.animation_data.nla_tracks:
                track.mute = track.name != track_name
                if not track.mute:
                    strips.extend(track.strips)
        start = min(s.frame_start for s in strips)
        end = max(s.frame_end for s in strips)
        samples, joint_hashes = [], set()
        for index in range(31):
            frame = start + (end - start) * index / 30
            scene.frame_set(math.floor(frame), subframe=frame % 1)
            bpy.context.view_layer.update()
            dg = bpy.context.evaluated_depsgraph_get()
            points = []
            for obj in meshes:
                evaluated = obj.evaluated_get(dg)
                mesh = evaluated.to_mesh()
                points.extend(evaluated.matrix_world @ v.co for v in mesh.vertices)
                evaluated.to_mesh_clear()
            assert points and all(math.isfinite(c) for v in points for c in v)
            bounds = [[min(v[i] for v in points) for i in range(3)],
                      [max(v[i] for v in points) for i in range(3)]]
            samples.append({'seconds': (frame - start) / 30, 'bounds_blender_m': bounds})
            joint_hashes.add(hashlib.sha256(json.dumps([[round(c, 5) for c in v] for v in points[::17]]).encode()).hexdigest())
        first, last = samples[0]['bounds_blender_m'], samples[-1]['bounds_blender_m']
        clips.append({'name': track_name, 'duration_seconds': (end - start) / 30,
                      'sample_count': 31, 'distinct_mesh_samples': len(joint_hashes),
                      'min_floor_m': min(s['bounds_blender_m'][0][2] for s in samples),
                      'max_floor_m': max(s['bounds_blender_m'][0][2] for s in samples),
                      'max_extent_m': max(max(s['bounds_blender_m'][1][i] - s['bounds_blender_m'][0][i] for i in range(3)) for s in samples),
                      'bounds_loop_difference_m': max(abs(first[b][i] - last[b][i]) for b in range(2) for i in range(3)),
                      'samples': samples})
    result = {'mob_id': source.parent.name, 'file': source.name,
              'sha256': hashlib.sha256(data).hexdigest(), 'bytes': len(data),
              'triangles_exported': sum(gltf['accessors'][part['indices']]['count'] // 3 for mesh in gltf['meshes'] for part in mesh['primitives']),
              'skin_joint_counts': [len(s['joints']) for s in gltf.get('skins', [])],
              'mesh_count': len(gltf['meshes']),
              'texture_dimensions': [{'name': im.name, 'size': list(im.size)} for im in bpy.data.images if im.size[0] > 0],
              'animation_names_in_glb': [c['name'] for c in gltf.get('animations', [])],
              'imported_animation_tracks': track_names, 'clips': clips,
              'all_samples_finite': True, 'godot_import_tested': False,
              'runtime_accepted': False}
    assert len(clips) == len(result['animation_names_in_glb'])
    (out / (source.parent.name + '.json')).write_bytes((json.dumps(result, indent=2) + '\n').encode())
    results.append({k: v for k, v in result.items() if k != 'clips'} | {'clips': [{k: v for k, v in clip.items() if k != 'samples'} for clip in clips]})
    print('COHORT_EXPORTED_AUDIT', json.dumps(results[-1]), flush=True)
(out / 'EXPORTED_GLB_AUDIT.json').write_bytes((json.dumps(results, indent=2) + '\n').encode())
