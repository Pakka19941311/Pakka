"""Bake licensed Quaternius motions onto the fixed MPFB Mixamo52 skeleton.
No target rest matrix, bone length, mesh geometry, or gameplay mutation.
"""
import bpy,sys,json,math,argparse,hashlib,importlib.util
from pathlib import Path
from mathutils import Vector,Matrix,Quaternion
FPS=30
SOURCE_FILES={}  # Set explicitly from CLI inputs in main().
CLIPS=[
 ('idle',1,'Idle_Loop',True),('idle_weapon',1,'Sword_Idle',True),('run_weapon',1,'Jog_Fwd_Loop',True),('run',1,'Jog_Fwd_Loop',True),('sprint',1,'Sprint_Loop',True),
 ('sword_attack',1,'Sword_Attack',False),('sword_attack_combo',2,'Sword_Regular_Combo',False),('sword_attack_heavy',2,'Sword_Heavy_Combo',False),
 ('cast_enter',1,'Spell_Simple_Enter',False),('cast_loop',1,'Spell_Simple_Idle_Loop',True),('cast_release',1,'Spell_Simple_Shoot',False),('cast_exit',1,'Spell_Simple_Exit',False),
 ('spell1',1,'Spell_Simple_Shoot',False),('hit',1,'Hit_Chest',False),('hit_head',1,'Hit_Head',False),('jump_start',1,'Jump_Start',False),('jump_air',1,'Jump_Loop',True),('jump_land',1,'Jump_Land',False),
 ('sword_strike_a',2,'Sword_Regular_A',False),('sword_recovery_a',2,'Sword_Regular_A_Rec',False),('sword_strike_b',2,'Sword_Regular_B',False),('sword_recovery_b',2,'Sword_Regular_B_Rec',False),('sword_strike_c',2,'Sword_Regular_C',False),('block',2,'Sword_Block',False)]
MAP={'Hips':'pelvis','Spine':'spine_01','Spine1':'spine_02','Spine2':'spine_03','Neck':'neck_01','Head':'Head'}
for side,suffix in [('Left','l'),('Right','r')]:
 for t,s in [('Shoulder','clavicle'),('Arm','upperarm'),('ForeArm','lowerarm'),('Hand','hand'),('UpLeg','thigh'),('Leg','calf'),('Foot','foot'),('ToeBase','ball')]:MAP[side+t]=s+'_'+suffix
 for tf,sf in [('Thumb','thumb'),('Index','index'),('Middle','middle'),('Ring','ring'),('Pinky','pinky')]:
  for n in range(1,4):MAP[side+'Hand'+tf+str(n)]=sf+'_'+str(n).zfill(2)+'_'+suffix
MAP={'mixamorig:'+t:s for t,s in MAP.items()}


def load_source(number):
 prev=set(bpy.data.objects);prev_actions=set(bpy.data.actions)
 bpy.ops.import_scene.gltf(filepath=str(SOURCE_FILES[number]))
 objs=list(set(bpy.data.objects)-prev);rig=next(o for o in objs if o.type=='ARMATURE')
 acts={a.name.rsplit('_Armature',1)[0]:a for a in set(bpy.data.actions)-prev_actions}
 if rig.animation_data:
  for tr in list(rig.animation_data.nla_tracks):rig.animation_data.nla_tracks.remove(tr)
 rig.name='SourceUAL'+str(number)
 for ob in objs:ob.hide_render=True
 return rig,acts,objs

def bone_world_rest(rig,name):return rig.matrix_world@rig.data.bones[name].matrix_local

def palm_frame(rig,names):
 p=[bone_world_rest(rig,n).translation for n in names]
 y=(p[2]-p[0]).normalized();x=(p[1]-p[3]);x=(x-y*x.dot(y)).normalized();z=x.cross(y).normalized()
 return Matrix((x,y,z)).transposed()

def calibrate(target,source):
 corr={};refs={};palms={}
 for side,suffix in [('Left','l'),('Right','r')]:
  Hs=palm_frame(source,['hand_'+suffix,'index_01_'+suffix,'middle_01_'+suffix,'pinky_01_'+suffix])
  Ht=palm_frame(target,['mixamorig:'+side+'Hand','mixamorig:'+side+'HandIndex1','mixamorig:'+side+'HandMiddle1','mixamorig:'+side+'HandPinky1'])
  palms[side]=Hs@Ht.inverted()
 for tn,sn in MAP.items():
  S=bone_world_rest(source,sn).to_quaternion().to_matrix();T=bone_world_rest(target,tn).to_quaternion().to_matrix();name=tn.split(':')[-1]
  if 'Hand' in name:
   ref=palms['Left' if name.startswith('Left') else 'Right']@T
  elif name in ['LeftArm','RightArm','LeftForeArm','RightForeArm','LeftUpLeg','RightUpLeg','LeftLeg','RightLeg']:
   a=(T@Vector((0,1,0))).rotation_difference(S@Vector((0,1,0))).to_matrix();ref=a@T
  else:ref=T
  refs[tn]=ref;corr[tn]=S.inverted()@ref
 return corr,refs

def topological(rig):
 return sorted(rig.data.bones,key=lambda b:len(b.parent_recursive))

def retarget_frame(target,source,corr,frame,leg_scale,zoffset=0):
 bpy.context.scene.frame_set(int(frame),subframe=frame-int(frame));bpy.context.view_layer.update()
 worlds={};inv=target.matrix_world.inverted();rigrot=inv.to_quaternion().to_matrix()
 sp0=bone_world_rest(source,'pelvis').translation;sp=(source.matrix_world@source.pose.bones['pelvis'].matrix).translation
 targethip=target.data.bones['mixamorig:Hips'].matrix_local.translation
 for b in topological(target):
  sn=MAP.get(b.name)
  R=rigrot@(source.matrix_world@source.pose.bones[sn].matrix).to_quaternion().to_matrix()@corr[b.name]
  if b.parent:
   head=worlds[b.parent.name]@b.parent.matrix_local.inverted()@b.matrix_local.translation
  else:head=targethip+rigrot@((sp-sp0)*leg_scale)+Vector((0,0,zoffset))
  M=R.to_4x4();M.translation=head;worlds[b.name]=M
  pb=target.pose.bones[b.name]
  if b.parent:
   basis=b.convert_local_to_pose(M,b.matrix_local,parent_matrix=worlds[b.parent.name],parent_matrix_local=b.parent.matrix_local,invert=True)
  else:basis=b.convert_local_to_pose(M,b.matrix_local,invert=True)
  pb.matrix_basis=basis
 return worlds

def mesh_min_z(body):
 bpy.context.view_layer.update();evalob=body.evaluated_get(bpy.context.evaluated_depsgraph_get());mesh=evalob.to_mesh();val=min((evalob.matrix_world@v.co).z for v in mesh.vertices);evalob.to_mesh_clear();return val

def setup_render(scene):
 scene.render.engine='CYCLES';scene.cycles.device='CPU';scene.cycles.samples=8;scene.cycles.use_denoising=True
 scene.render.resolution_x=520;scene.render.resolution_y=700;scene.render.resolution_percentage=100
 world=bpy.data.worlds.new('ReviewWorld');world.use_nodes=True;world.node_tree.nodes['Background'].inputs[0].default_value=(.1,.13,.18,1);world.node_tree.nodes['Background'].inputs[1].default_value=.35;scene.world=world
 for name,loc,power,size in [('Key',(-3,-4,5),650,4),('Fill',(3,-2,3),350,3),('Rim',(1,2,4),900,2)]:
  data=bpy.data.lights.new(name,'AREA');data.energy=power;data.shape='DISK';data.size=size;ob=bpy.data.objects.new(name,data);scene.collection.objects.link(ob);ob.location=loc;ob.rotation_euler=(Vector((0,0,1))-ob.location).to_track_quat('-Z','Y').to_euler()
 data=bpy.data.cameras.new('ReviewCamera');cam=bpy.data.objects.new('ReviewCamera',data);scene.collection.objects.link(cam);scene.camera=cam;cam.location=(2.5,-7,2.5);cam.rotation_euler=(Vector((0,0,.93))-cam.location).to_track_quat('-Z','Y').to_euler();data.type='ORTHO';data.ortho_scale=2.35
 bpy.ops.mesh.primitive_plane_add(size=200,location=(0,0,-.01));plane=bpy.context.object;plane.name='ReviewFloor';mat=bpy.data.materials.new('Floor');mat.diffuse_color=(.08,.1,.14,1);mat.use_nodes=True;mat.node_tree.nodes['Principled BSDF'].inputs['Base Color'].default_value=(.08,.1,.14,1);plane.data.materials.append(mat)
 scene.view_settings.view_transform='AgX';scene.render.image_settings.file_format='PNG'

def main():
 global SOURCE_FILES
 ap=argparse.ArgumentParser(description='Bake the shipped CC0 motions onto the prepared MPFB body.')
 ap.add_argument('--human-builder',required=True,help='Path to build_human.py beside its prepared data folder')
 ap.add_argument('--ual1',required=True,help='Path to UAL1_Standard.glb (non-RM version)')
 ap.add_argument('--ual2',required=True,help='Path to UAL2_Standard.glb (non-RM version)')
 ap.add_argument('--output',required=True,help='Directory for actions blend, metadata and optional previews')
 ap.add_argument('--preview-only',action='store_true');ap.add_argument('--no-render',action='store_true')
 args=ap.parse_args(sys.argv[sys.argv.index('--')+1:] if '--' in sys.argv else [])
 builder_path=Path(args.human_builder).expanduser().resolve()
 SOURCE_FILES={1:Path(args.ual1).expanduser().resolve(),2:Path(args.ual2).expanduser().resolve()}
 for path in [builder_path,*SOURCE_FILES.values()]:
  if not path.is_file():raise FileNotFoundError(path)
 output=Path(args.output).expanduser().resolve();output.mkdir(parents=True,exist_ok=True)
 spec=importlib.util.spec_from_file_location('varendor_human_builder_for_retarget',builder_path)
 builder=importlib.util.module_from_spec(spec);spec.loader.exec_module(builder)
 create_human=builder.create_human
 bpy.ops.wm.read_factory_settings(use_empty=True);scene=bpy.context.scene;scene.render.fps=FPS
 body,target,info=create_human(height=1.84);body.data.materials[0].node_tree.nodes['Principled BSDF'].inputs['Base Color'].default_value=(.25,.33,.4,1)
 target.animation_data_create();sources={i:load_source(i) for i in [1,2]};rest_before={b.name:[list(row) for row in b.matrix_local] for b in target.data.bones}
 cal={i:calibrate(target,sources[i][0])[0] for i in sources}
 src=sources[1][0];tleg=sum(target.data.bones[n].length for n in ['mixamorig:LeftUpLeg','mixamorig:LeftLeg']);sleg=sum(src.data.bones[n].length for n in ['thigh_l','calf_l']);scale=tleg/sleg
 src.animation_data.action=sources[1][1]['Idle_Loop'];retarget_frame(target,src,cal[1],0,scale);baseline=-mesh_min_z(body)
 report={'method':'hybrid semantic rest calibration; source world orientations, fixed target joint lengths; source palm frame propagated through fingers','target_rest_changed':False,'target_height_m':1.84,'fps':FPS,'leg_translation_scale':scale,'constant_ground_offset_m':baseline,'sources':[{'path':str(p),'sha256':hashlib.sha256(p.read_bytes()).hexdigest(),'license':'CC0-1.0'} for p in SOURCE_FILES.values()],'mapping':MAP,'actions':[],'motion_qa':[]}
 print('CALIBRATION',scale,baseline,flush=True)
 rendered=output/'retarget_preview';rendered.mkdir(exist_ok=True)
 specs=CLIPS if not args.preview_only else [c for c in CLIPS if c[0] in ['idle_weapon','run_weapon','sword_attack','cast_release','hit','jump_start']]
 for name,num,source_name,loop in specs:
  sr,acts,_=sources[num];sr.animation_data.action=acts[source_name];action=bpy.data.actions.new(name);action.use_fake_user=True;target.animation_data.action=action;maxframe=float(acts[source_name].frame_range[1]);duration=maxframe/FPS
  frames=range(0,round(maxframe)+1) if not args.preview_only else sorted(set([0,round(maxframe*.25),round(maxframe*.5),round(maxframe*.75),round(maxframe)]))
  prevq={};hands=[]
  for frame in frames:
   worlds=retarget_frame(target,sr,cal[num],frame,scale,baseline)
   for pb in target.pose.bones:
    q=pb.rotation_quaternion.copy()
    if pb.name in prevq and q.dot(prevq[pb.name])<0:q.negate();pb.rotation_quaternion=q
    prevq[pb.name]=q
    pb.keyframe_insert('rotation_quaternion',frame=frame,group=pb.name)
    if pb.name=='mixamorig:Hips':pb.keyframe_insert('location',frame=frame,group=pb.name)
   hands.append((frame,list(worlds['mixamorig:RightHand'].translation)))
  for fc in action.fcurves:
   for k in fc.keyframe_points:k.interpolation='LINEAR'
  action['source_url']='https://quaternius.itch.io/universal-animation-library'+('-2' if num==2 else '')
  action['source_clip']=source_name;action['license']='CC0-1.0';action['loop']=loop;action['duration_seconds']=duration;action['root_motion']='none; pelvis secondary motion only'
  report['actions'].append({'name':name,'source_library':num,'source_clip':source_name,'duration_seconds':duration,'frames':[0,round(maxframe)],'loop':loop,'forward_hand_peak_phase':min(hands,key=lambda h:h[1][1])[0]/maxframe if maxframe else 0,'contact_phase':'requires sword attachment pose review; forward-hand peak is a diagnostic only'})
  print('BAKED',name,round(maxframe)+1,flush=True)
 for _,_,obs in sources.values():
  for ob in obs:bpy.data.objects.remove(ob,do_unlink=True)
 # Source actions are unnecessary in the output; retain only baked target actions.
 baked={e['name'] for e in report['actions']}
 for act in list(bpy.data.actions):
  if act.name not in baked:bpy.data.actions.remove(act,do_unlink=True)
 target.animation_data.action=bpy.data.actions['idle_weapon'];scene.frame_set(0);bpy.context.view_layer.update()
 assert rest_before=={b.name:[list(row) for row in b.matrix_local] for b in target.data.bones}
 target['retarget_source']='Quaternius UAL1 + UAL2 Standard CC0';target['rest_unchanged']=True
 scene.frame_start=0;scene.frame_end=75
 bpy.ops.wm.save_as_mainfile(filepath=str(output/('retarget_preview.blend' if args.preview_only else 'retargeted_actions.blend')))
 (output/'retarget_metadata.json').write_text(json.dumps(report,indent=2))
 if args.no_render:return
 setup_render(scene)
 for name,phase in [('idle_weapon',.2),('run_weapon',.15),('run_weapon',.5),('sword_attack',.25),('sword_attack',.5),('sword_attack',.75),('cast_release',.5),('hit',.5),('jump_start',.5)]:
  if name not in baked:continue
  target.animation_data.action=bpy.data.actions[name];frame=round(target.animation_data.action.frame_range[1]*phase);scene.frame_set(frame);bpy.context.view_layer.update()
  report['motion_qa'].append({'action':name,'phase':phase,'body_min_z_m':mesh_min_z(body)})
  scene.render.filepath=str(rendered/(name+'_'+str(round(phase*100)).zfill(2)+'.png'));bpy.ops.render.render(write_still=True)
 (output/'retarget_metadata.json').write_text(json.dumps(report,indent=2))

if __name__=='__main__':main()
