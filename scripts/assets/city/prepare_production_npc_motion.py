"""Bake reviewed NPC motion in a fresh Blender process after variant generation."""
from pathlib import Path
import sys,runpy
repo=Path(__file__).resolve().parents[3]
out=repo/'godot-pc/world-expansion-v3/city/production'
art=repo/'art/city-production'

motion=runpy.run_path(str(repo/'scripts/assets/city/prepare_npc_motion.py'),run_name='__production_motion__')
import bpy,json,hashlib
for variant in ['worker','woman']:
 bpy.ops.wm.read_factory_settings(use_empty=True);bpy.ops.import_scene.gltf(filepath=str(art/'base'/f'P2_{variant}.glb'))
 rig=next(o for o in bpy.data.objects if o.type=='ARMATURE');rig.animation_data_clear();motion['clear_pose'](rig)
 if variant=='woman':motion['tailor_resident'](rig)
 for obj in list(bpy.context.scene.objects):
  if obj.type=='MESH' and obj.parent!=rig:bpy.data.objects.remove(obj,do_unlink=True)
 for action in list(bpy.data.actions):bpy.data.actions.remove(action)
 rig.animation_data_create();scene=bpy.context.scene;scene.render.fps=30
 for name,seconds in [('idle',4),('walk',1.4),('talk',3.2),('turn_left',1.2),('turn_right',1.2)]:
  action=bpy.data.actions.new(name);action.use_fake_user=True;rig.animation_data.action=action;frames=round(seconds*30)
  for f in range(frames+1):
   scene.frame_set(f);motion['author_pose'](rig,'resident',name,f/frames)
   for bone in rig.pose.bones:bone.keyframe_insert('rotation_quaternion',frame=f,group=bone.name);bone.keyframe_insert('location',frame=f,group=bone.name)
  for fc in action.fcurves:
   for kp in fc.keyframe_points:kp.interpolation='LINEAR'
 rig.animation_data.action=bpy.data.actions['idle'];scene.frame_set(0)
 bpy.ops.object.select_all(action='SELECT');bpy.context.view_layer.objects.active=rig
 dest=out/f'P2_{variant}_motion.glb'
 bpy.ops.export_scene.gltf(filepath=str(dest),export_format='GLB',use_selection=True,export_animations=True,export_animation_mode='ACTIONS',export_skins=True,export_force_sampling=True)
 bpy.ops.wm.save_as_mainfile(filepath=str(art/f'P2_{variant}_motion.blend'))
 (art/f'{variant}-motion.json').write_text(json.dumps({'variant':variant,'source':'CC0 MPFB + selected Suits02, pinned sources.json','clips':['idle','walk','talk','turn_left','turn_right'],'sha256':hashlib.sha256(dest.read_bytes()).hexdigest(),'bounds':motion['evaluated_bounds']([o for o in scene.objects if o.type=='MESH'])},indent=2),encoding='utf-8')
 print('PRODUCTION_NPC',variant,flush=True)
