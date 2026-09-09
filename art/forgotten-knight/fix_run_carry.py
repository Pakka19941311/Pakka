"""Keep the run_weapon sword carry outside the visor, preserving all other motion.

Only RightArm/RightForeArm/RightHand rotation channels in run_weapon change.
The anatomical rest skeleton, socket, fingers, feet and other clips are retained.
Call apply_run_carry(rig) after appending the baked Actions, before or after
binding the unchanged sword socket. No constraints or runtime IK are added.
"""
import argparse
import hashlib
import json
import math
import sys
from pathlib import Path

import bpy
import numpy as np
from mathutils import Matrix, Quaternion, Vector

BONES = ['mixamorig:RightArm', 'mixamorig:RightForeArm', 'mixamorig:RightHand']
SOCKET_BLADE = Vector((.4999534487724304, -.11181937158107758, .8588032126426697)).normalized()
VERSION = 'outboard_torso_carry_v1'


def unchanged_channel_digest(action):
    allowed = {f'pose.bones["{name}"].rotation_quaternion' for name in BONES}
    payload = [(f.data_path, f.array_index, [(tuple(k.co), k.interpolation) for k in f.keyframe_points])
               for f in action.fcurves if f.data_path not in allowed]
    return hashlib.sha256(json.dumps(payload, sort_keys=True).encode()).hexdigest()


def aim_bone(rig, name, direction, torso_rotation):
    bone = rig.pose.bones[name]
    rest = bone.bone.matrix_local.to_quaternion()
    rest_rotation = torso_rotation @ rest
    current_y = rest_rotation @ Vector((0, 1, 0))
    rotation = current_y.rotation_difference(direction.normalized()) @ rest_rotation
    matrix = rotation.to_matrix().to_4x4()
    matrix.translation = bone.head.copy()
    bone.matrix = matrix
    bpy.context.view_layer.update()


def hand_rotation(blade, forearm_direction):
    local_z = SOCKET_BLADE
    local_x = (Vector((0, 1, 0)) - local_z * local_z.y).normalized()
    local_y = local_z.cross(local_x).normalized()
    target_z = blade.normalized()
    target_x = (forearm_direction - target_z * forearm_direction.dot(target_z)).normalized()
    target_y = target_z.cross(target_x).normalized()
    local = Matrix((local_x, local_y, local_z)).transposed()
    target = Matrix((target_x, target_y, target_z)).transposed()
    return (target @ local.transposed()).to_quaternion()


def apply_run_carry(rig):
    action = bpy.data.actions['run_weapon']
    if action.get('run_carry_revision') == VERSION:
        return {'revision': VERSION, 'already_applied': True}
    scene = bpy.context.scene
    rig.animation_data_create()
    previous_action = rig.animation_data.action
    previous_frame = scene.frame_current
    before_digest = unchanged_channel_digest(action)
    action_names = sorted(a.name for a in bpy.data.actions)
    start, end = [round(v) for v in action.frame_range]
    rig.animation_data.action = action
    spine = rig.pose.bones['mixamorig:Spine2']
    spine_rest_inverse = spine.bone.matrix_local.to_quaternion().inverted()
    rows = []
    last = {}
    for frame in range(start, end + 1):
        scene.frame_set(frame)
        torso = spine.matrix.to_quaternion() @ spine_rest_inverse
        phase = 2 * math.pi * (frame - start) / max(1, end - start)
        sway = Quaternion(Vector((1, 0, 0)), math.radians(6) * math.sin(phase))
        arm_direction = torso @ (sway @ Vector((-.40, .10, -.91)).normalized())
        forearm_direction = torso @ (sway @ Vector((-.05, -.955, -.293)).normalized())
        blade_direction = torso @ Vector((-.45, -.25, .857)).normalized()
        aim_bone(rig, BONES[0], arm_direction, torso)
        aim_bone(rig, BONES[1], forearm_direction, torso)
        hand = rig.pose.bones[BONES[2]]
        matrix = hand_rotation(blade_direction, forearm_direction).to_matrix().to_4x4()
        matrix.translation = hand.head.copy()
        hand.matrix = matrix
        bpy.context.view_layer.update()
        values = {}
        for name in BONES:
            q = rig.pose.bones[name].rotation_quaternion.copy().normalized()
            if name in last and q.dot(last[name]) < 0:
                q.negate()
            last[name] = q
            values[name] = q
        rows.append((frame, values))
    for frame, values in rows:
        for name, rotation in values.items():
            bone = rig.pose.bones[name]
            bone.rotation_quaternion = rotation
            bone.keyframe_insert(data_path='rotation_quaternion', frame=frame, group=name)
    allowed = {f'pose.bones["{name}"].rotation_quaternion' for name in BONES}
    for curve in action.fcurves:
        if curve.data_path in allowed:
            for key in curve.keyframe_points:
                key.interpolation = 'LINEAR'
    if before_digest != unchanged_channel_digest(action):
        raise RuntimeError('Run carry changed an unauthorized animation channel')
    if action_names != sorted(a.name for a in bpy.data.actions):
        raise RuntimeError('Run carry changed the action list')
    action['run_carry_revision'] = VERSION
    action['run_carry_note'] = 'Torso-relative armed carry; sword socket and all locomotion channels retained'
    rig.animation_data.action = previous_action
    scene.frame_set(previous_frame)
    return {'revision': VERSION, 'action': action.name, 'frames': [start, end],
            'changed_rotation_bones': BONES, 'other_channels_sha256': before_digest,
            'all_other_channels_unchanged': True, 'action_names_unchanged': True}


def rigid_world_vertices(obj, rig, bone_name):
    bone = rig.pose.bones[bone_name]
    transform = rig.matrix_world @ bone.matrix @ bone.bone.matrix_local.inverted() @ obj.matrix_local
    matrix = np.asarray(transform, dtype=np.float64)
    vertices = np.asarray([(*v.co, 1) for v in obj.data.vertices], dtype=np.float64)
    return (vertices @ matrix.T)[:, :3]


def clearance_report(rig):
    scene = bpy.context.scene
    original_action, original_frame = rig.animation_data.action, scene.frame_current
    rig.animation_data.action = bpy.data.actions['run_weapon']
    sword, helmet = bpy.data.objects['FK_weapon_sword'], bpy.data.objects['FK_head_helmet']
    camera_right = np.asarray(scene.camera.matrix_world.to_3x3().col[0].normalized())
    end = round(rig.animation_data.action.frame_range[1])
    rows = []
    edge_indices = np.asarray([tuple(e.vertices) for e in sword.data.edges], dtype=np.int32)
    for frame in range(end + 1):
        scene.frame_set(frame)
        weapon = rigid_world_vertices(sword, rig, 'mixamorig:RightHand')
        head = rigid_world_vertices(helmet, rig, 'mixamorig:Head')
        lo, hi = head[:, 2].min() - .015, head[:, 2].max() + .015
        band = [weapon[(weapon[:, 2] >= lo) & (weapon[:, 2] <= hi)]]
        a, b = weapon[edge_indices[:, 0]], weapon[edge_indices[:, 1]]
        dz = b[:, 2] - a[:, 2]
        for height in (lo, hi):
            t = np.divide(height - a[:, 2], dz, out=np.full(len(dz), -1.0), where=np.abs(dz) > 1e-12)
            keep = (t >= 0) & (t <= 1)
            band.append(a[keep] + (b[keep] - a[keep]) * t[keep, None])
        band = np.concatenate(band)
        band_gap = float((head @ camera_right).min() - (band @ camera_right).max()) if len(band) else None
        # Separating axes provide a conservative geometric/visual clearance bound.
        # Positive gap means the entire sword is outside the helmet projection.
        rows.append({'frame': frame,
                     'helmet_height_band_camera_separation_m': band_gap,
                     'sword_outside_helmet_height_band': not len(band),
                     'world_x_separation_m': float(head[:, 0].min() - weapon[:, 0].max()),
                     'review_camera_horizontal_separation_m': float((head @ camera_right).min() - (weapon @ camera_right).max())})
    rig.animation_data.action = original_action
    scene.frame_set(original_frame)
    band_gaps = [r['helmet_height_band_camera_separation_m'] for r in rows if r['helmet_height_band_camera_separation_m'] is not None]
    return {'samples': rows,
            'minimum_helmet_height_band_camera_separation_m': min(band_gaps) if band_gaps else None,
            'helmet_band_samples': len(band_gaps),
            'minimum_world_x_separation_m': min(r['world_x_separation_m'] for r in rows),
            'minimum_review_camera_horizontal_separation_m': min(r['review_camera_horizontal_separation_m'] for r in rows)}


def render_pose(rig, frame, destination):
    scene = bpy.context.scene
    rig.animation_data.action = bpy.data.actions['run_weapon']
    scene.frame_set(frame)
    bpy.data.objects['FK_weapon_sword'].hide_render = False
    scene.cycles.samples = 6
    scene.render.resolution_x = 440
    scene.render.resolution_y = 550
    scene.render.resolution_percentage = 100
    scene.render.filepath = str(destination)
    bpy.ops.render.render(write_still=True)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--master', required=True)
    ap.add_argument('--output', required=True)
    ap.add_argument('--render', action='store_true')
    args = ap.parse_args(sys.argv[sys.argv.index('--') + 1:])
    out = Path(args.output).resolve()
    out.mkdir(parents=True, exist_ok=True)
    bpy.ops.wm.open_mainfile(filepath=str(Path(args.master).resolve()), use_scripts=False)
    rig = bpy.data.objects['FK_Humanoid_Rig']
    before = clearance_report(rig)
    original_action, original_frame = rig.animation_data.action, bpy.context.scene.frame_current
    if args.render:
        render_pose(rig, 7, out / 'Run_Before_07.png')
    evidence = apply_run_carry(rig)
    after = clearance_report(rig)
    evidence.update(before=before, after=after)
    print('CARRY_HELMET_BAND_GAP', after['minimum_helmet_height_band_camera_separation_m'], flush=True)
    rig.animation_data.action = original_action
    bpy.context.scene.frame_set(original_frame)
    bpy.ops.wm.save_as_mainfile(filepath=str(out / 'Varendor_Forgotten_Knight_Master.blend'))
    (out / 'run_carry_report.json').write_text(json.dumps(evidence, indent=2) + '\n')
    band_gap = after['minimum_helmet_height_band_camera_separation_m']
    if band_gap is not None and band_gap <= 0:
        raise RuntimeError('Corrected blade overlaps the helmet projection at helmet height; candidate saved for inspection')
    if args.render:
        for frame in [0, 7, 14]:
            render_pose(rig, frame, out / f'Run_After_{frame:02d}.png')
    print('RUN_CARRY_READY', json.dumps({'before_min_projection_gap':before['minimum_review_camera_horizontal_separation_m'],
          'after_min_projection_gap':after['minimum_review_camera_horizontal_separation_m'], 'output':str(out)}), flush=True)


if __name__ == '__main__':
    main()
