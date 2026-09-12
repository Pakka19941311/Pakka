"""Normalize inspected, licensed sources as separate visual candidates.

Blender 4.2.3. This never edits a canonical actor or live population. Source
animation windows are preserved; missing actions remain explicit gaps.
"""
import argparse,sys,json,hashlib,math
from pathlib import Path
import bpy
from mathutils import Vector,Quaternion

p=argparse.ArgumentParser();p.add_argument('--skip-render',action='store_true');p.add_argument('--intake',required=True);p.add_argument('--output',required=True);p.add_argument('--reports',required=True);p.add_argument('--mob',choices=['MOB-06','MOB-07','MOB-08'],required=True)
a=p.parse_args(sys.argv[sys.argv.index('--')+1:]);root=Path(a.intake).resolve();out=Path(a.output).resolve();reports=Path(a.reports).resolve();out.mkdir(parents=True,exist_ok=True);reports.mkdir(parents=True,exist_ok=True)
mob=a.mob
config={
 'MOB-06':('spider.blend','01e0d50597ba9d4a1d5ebaaa78da89ef6fd79df207f3fa9962b3e4e069b0112b','Spider','Spider_Armature',.55,'CohortSpiderSource'),
 'MOB-07':('extracted/Defender.blend','3951410d2d096e5ec2e0f9d49082326b2e4da721abdeda0e66c24bff07ecdc2b','Defender','Defender_Ske',1.85,'CohortBrigandSource'),
 'MOB-08':('extracted/cat_2-80.blend','3f911c286c20b681045aba6f7be6c27919692b76d9fe6db15ce1a57c14a8974c','Cube.001',None,.65,'CohortCatReference')}
filename,digest,mesh_name,rig_name,target,name=config[mob];source=root/mob/filename
if digest:assert hashlib.sha256(source.read_bytes()).hexdigest()==digest
bpy.ops.wm.open_mainfile(filepath=str(source),load_ui=False,use_scripts=False)
if bpy.context.object and bpy.context.object.mode != 'OBJECT':bpy.ops.object.mode_set(mode='OBJECT')
scene=bpy.context.scene;mesh=bpy.data.objects[mesh_name];rig=bpy.data.objects.get(rig_name) if rig_name else None
for obj in list(scene.objects):
 if obj not in [mesh,rig]:bpy.data.objects.remove(obj,do_unlink=True)
mesh.hide_render=False;mesh.hide_set(False)
if rig:
 rig.hide_set(False);rig.hide_render=False
 for track in rig.animation_data.nla_tracks:track.mute=True
images={}
if mob=='MOB-06':images['body']=bpy.data.images.load(str(root/mob/'spider.png'),check_existing=False)
elif mob=='MOB-07':images={'body':bpy.data.images['Done3.png'],'weapon':bpy.data.images['DoneWeps.png']}
else:images['body']=bpy.data.images.load(str(root/mob/'cat_free.png'),check_existing=False)
for material in mesh.data.materials:
 material.use_nodes=True;nodes=material.node_tree.nodes;nodes.clear();output=nodes.new('ShaderNodeOutputMaterial');shader=nodes.new('ShaderNodeBsdfPrincipled');shader.inputs['Roughness'].default_value=.75
 material.node_tree.links.new(shader.outputs['BSDF'],output.inputs['Surface']);texture=nodes.new('ShaderNodeTexImage');texture.image=images['weapon' if 'Weapon' in material.name else 'body'];material.node_tree.links.new(texture.outputs['Color'],shader.inputs['Base Color'])
 # Opaque source body textures. No alternate texture or raster generation.
 material.blend_method='OPAQUE'
for image in images.values():
 if max(image.size)>1024:image.scale(int(image.size[0]*1024/max(image.size)),int(image.size[1]*1024/max(image.size)))
 if not image.packed_file:image.pack()
clips=[]
if rig:
 source_actions=list(bpy.data.actions)
 windows=[('idle','IDLE',0,16,16),('walk','WALK',0,16,16),('attack','ATTACK',0,16,16)] if mob=='MOB-06' else [
  ('walk','Walk-normal.001',1,87,63),('run','Run-flee.001',1,22,21),('attack','Attack-two handed2',108,136,28),('attack_2','Attack-two handed2',216,246,30),('death','Death-Backwards',2,98,96)]
 baked={}
 for title,original,start,end,duration in windows:
  rig.animation_data.action=bpy.data.actions[original];samples=[]
  for frame in range(duration+1):
   value=start+(end-start)*frame/duration;scene.frame_set(math.floor(value),subframe=value%1);bpy.context.view_layer.update()
   samples.append({pb.name:pb.matrix.copy() for pb in rig.pose.bones})
  baked[title]=(samples,original,start,end,duration)
 for track in list(rig.animation_data.nla_tracks):rig.animation_data.nla_tracks.remove(track)
 for pb in rig.pose.bones:
  for constraint in list(pb.constraints):pb.constraints.remove(constraint)
  pb.rotation_mode='QUATERNION'
 for title,(samples,original,start,end,duration) in baked.items():
  action=bpy.data.actions.new(title);rig.animation_data.action=action
  for frame,pose in enumerate(samples):
   scene.frame_set(frame)
   for pb in rig.pose.bones:
    pb.matrix=pose[pb.name];bpy.context.view_layer.update()
   for pb in rig.pose.bones:
    pb.keyframe_insert('location',frame=frame);pb.keyframe_insert('rotation_quaternion',frame=frame);pb.keyframe_insert('scale',frame=frame)
  for fc in action.fcurves:
   for key in fc.keyframe_points:key.interpolation='LINEAR'
  clips.append({'name':title,'source_action':original,'source_frames':[start,end],'duration_seconds':duration/scene.render.fps,'kind':'source_window_baked'})
 if mob=='MOB-07':
  # The original NLA Idle strip has no action. Create a clearly authored quiet
  # pose from settled walk source frame 20.111; do not invent a supplied idle clip.
  neutral=baked['walk'][0][14];action=bpy.data.actions.new('idle');rig.animation_data.action=action
  for frame in range(0,101,5):
   scene.frame_set(frame)
   for pb in rig.pose.bones:
    pb.matrix=neutral[pb.name];bpy.context.view_layer.update()
   for pb in rig.pose.bones:
    if pb.name.lower() in ['spine','chest','spine1']:pb.rotation_quaternion=pb.rotation_quaternion@Quaternion((1,0,0),math.sin(frame/100*math.tau)*.008)
    pb.keyframe_insert('location',frame=frame);pb.keyframe_insert('rotation_quaternion',frame=frame);pb.keyframe_insert('scale',frame=frame)
  clips.append({'name':'idle','kind':'authored_quiet_pose_from_source_walk_frame_20_111','duration_seconds':4})
 for action in source_actions:
  if action.name not in [c['name']for c in clips]:bpy.data.actions.remove(action)
 rig.animation_data.action=bpy.data.actions['idle']
else:clips=[{'name':'KeyAction','kind':'source_two_shape_keys','duration_seconds':29/24,'skeletal':False}]
scene.frame_set(0 if rig else 1);bpy.context.view_layer.update()
def points():
 ev=mesh.evaluated_get(bpy.context.evaluated_depsgraph_get());data=ev.to_mesh();result=[ev.matrix_world@v.co for v in data.vertices];ev.to_mesh_clear();return result
pts=points();body_indices={v for face in mesh.data.polygons if face.material_index==1 for v in face.vertices} if mob=='MOB-07' else set(range(len(pts)))
body=[pts[i]for i in body_indices];lo=Vector([min(v[i]for v in body)for i in range(3)]);hi=Vector([max(v[i]for v in body)for i in range(3)]);scale=target/(hi.z-lo.z)
carrier=bpy.data.objects.new(name,None);scene.collection.objects.link(carrier)
root_object=rig if rig else mesh;matrix=root_object.matrix_world.copy();root_object.parent=carrier;root_object.matrix_world=matrix
carrier.scale=(scale,)*3;carrier.location=Vector((-(lo.x+hi.x)*.5,-(lo.y+hi.y)*.5,-lo.z))*scale
scene.frame_start=0;scene.frame_end=max(round(c['duration_seconds']*scene.render.fps)for c in clips);bpy.context.view_layer.update()
bpy.ops.object.select_all(action='DESELECT')
for obj in [carrier,mesh,rig]:
 if obj:obj.select_set(True)
bpy.context.view_layer.objects.active=rig if rig else mesh
dest=out/(name+'.glb');bpy.ops.export_scene.gltf(filepath=str(dest),export_format='GLB',use_selection=True,export_animations=True,export_animation_mode='ACTIONS',export_skins=True,export_force_sampling=True)
bpy.ops.wm.save_as_mainfile(filepath=str(reports/(name+'.blend')))
all_points=points();bounds={'min':[min(v[i]for v in all_points)for i in range(3)],'max':[max(v[i]for v in all_points)for i in range(3)]}
report={'mob_id':mob,'name':name,'source':str(source),'source_sha256':hashlib.sha256(source.read_bytes()).hexdigest(),'path':str(dest),'sha256':hashlib.sha256(dest.read_bytes()).hexdigest(),'bytes':dest.stat().st_size,'triangles':sum(len(f.vertices)-2 for f in mesh.data.polygons),'bones':len(rig.data.bones)if rig else 0,'target_body_height_m':target,'blender_bounds':bounds,'clips':clips,'images':[{'name':im.name,'size':list(im.size)}for im in images.values()], 'status':'source_candidate_not_runtime_accepted','gaps':['new_anatomical_mesh','hit','death','natural_gait']if mob=='MOB-06'else ['lynx_anatomy','skeletal_rig','full_combat_cycle']if mob=='MOB-08'else ['hit','visual_role_fit','gait_measurement','attack_contract']}
(reports/(name+'.json')).write_bytes((json.dumps(report,indent=2)+'\n').encode())
if not a.skip_render:
 center=Vector((0,0,target*.52));camera_data=bpy.data.cameras.new('Review');camera=bpy.data.objects.new('Review',camera_data);scene.collection.objects.link(camera);camera.location=(target*2.4,-target*3,target*1.25);camera.rotation_euler=(center-camera.location).to_track_quat('-Z','Y').to_euler();camera_data.type='ORTHO';camera_data.ortho_scale=max(target*1.4,(bounds['max'][0]-bounds['min'][0])*1.35);scene.camera=camera
 scene.world=bpy.data.worlds.new('Review');scene.world.use_nodes=True;scene.world.node_tree.nodes['Background'].inputs['Color'].default_value=(.32,.36,.42,1);scene.world.node_tree.nodes['Background'].inputs['Strength'].default_value=.5
 light_data=bpy.data.lights.new('Key','AREA');light=bpy.data.objects.new('Key',light_data);scene.collection.objects.link(light);light.location=(target*2,-target*3,target*4);light.rotation_euler=(center-light.location).to_track_quat('-Z','Y').to_euler();light_data.energy=500;light_data.size=target*3
 scene.render.engine='CYCLES';scene.cycles.samples=16;scene.render.resolution_x=900;scene.render.resolution_y=900;scene.render.resolution_percentage=100;scene.view_settings.view_transform='AgX';scene.render.image_settings.file_format='PNG';scene.render.filepath=str(reports/(name+'.png'));bpy.ops.render.render(write_still=True)
print('COHORT_SOURCE_CANDIDATE',json.dumps(report),flush=True)
