import bpy,json,math,hashlib,statistics,sys
from pathlib import Path
from mathutils import Vector,Matrix
import argparse
args_parser=argparse.ArgumentParser()
args_parser.add_argument('--intake',required=True)
args_parser.add_argument('--output',required=True)
args_parser.add_argument('--reports',required=True)
args_parser.add_argument('--repo',required=True)
args=args_parser.parse_args(sys.argv[sys.argv.index('--')+1:])
ROOT=Path(args.intake)
REPO=Path(args.repo)
OUTPUT=Path(args.output);OUTPUT.mkdir(parents=True,exist_ok=True)
REPORTS=Path(args.reports);REPORTS.mkdir(parents=True,exist_ok=True)
SPECS={'MOB-04':dict(model='V3BoarCandidate',source=ROOT/'MOB-04-boar-enemies/anatomy.glb',height=.8,turn=math.pi,feet=['ContactFrontL','ContactFrontR','ContactBackL','ContactBackR'],head='head',map={'idle':'Idle','walk':'Walk','run':'Walk','attack':'Attack','death':'Die'},author='Danimal; original boar Myname; credit Clint Bellanger',license='CC-BY-SA-4.0',page='https://opengameart.org/content/boar-enemies',candidate_boar=True)}

def evaluate(meshes):
 bpy.context.view_layer.update();graph=bpy.context.evaluated_depsgraph_get();points=[]
 for obj in meshes:
  ev=obj.evaluated_get(graph);data=ev.to_mesh();points.extend(ev.matrix_world@v.co for v in data.vertices);ev.to_mesh_clear()
 assert points and all(math.isfinite(v) for p in points for v in p)
 return Vector([min(p[i] for p in points) for i in range(3)]),Vector([max(p[i] for p in points) for i in range(3)])

def copy_window(source,name,start=None,end=None,duration_factor=1.):
 action=bpy.data.actions.new(name);action.use_fake_user=True
 start=float(source.frame_range[0]) if start is None else start
 end=float(source.frame_range[1]) if end is None else end
 # Explicit sampled source-pose window, preserving its original seconds.
 for curve in source.fcurves:
  target=action.fcurves.new(curve.data_path,index=curve.array_index)
  for frame in range(math.ceil(end-start)+1):
   p=target.keyframe_points.insert(frame*duration_factor,curve.evaluate(min(end,start+frame)))
   p.interpolation='LINEAR'
 return action

def render_review(meshes,path):
 lo,hi=evaluate(meshes);center=(lo+hi)/2;size=max(hi-lo)
 data=bpy.data.cameras.new('p2_camera');camera=bpy.data.objects.new('p2_camera',data);bpy.context.scene.collection.objects.link(camera);data.type='ORTHO';data.ortho_scale=size*1.4;camera.location=center+Vector((1.2,1.6,.7))*size;camera.rotation_euler=(center-camera.location).to_track_quat('-Z','Y').to_euler();bpy.context.scene.camera=camera
 for index,offset in enumerate([(1,1,2),(-1,0,1)]):
  light_data=bpy.data.lights.new('p2_light','SUN');light_data.energy=2 if index==0 else .6;light_data.angle=.2
  light=bpy.data.objects.new('p2_light',light_data);bpy.context.scene.collection.objects.link(light);light.location=center+Vector(offset)*size;light.rotation_euler=(center-light.location).to_track_quat('-Z','Y').to_euler()
 world=bpy.data.worlds.new('p2_world');world.use_nodes=True;world.node_tree.nodes.get('Background').inputs[0].default_value=(.15,.17,.2,1);world.node_tree.nodes.get('Background').inputs[1].default_value=.5;bpy.context.scene.world=world
 scene=bpy.context.scene;scene.render.engine='CYCLES';scene.cycles.samples=16;scene.render.resolution_x=800;scene.render.resolution_y=600;scene.render.resolution_percentage=100;scene.render.image_settings.file_format='PNG';scene.render.filepath=str(path);scene.view_settings.view_transform='Standard';bpy.ops.render.render(write_still=True)

for mob,spec in SPECS.items():
 bpy.ops.wm.read_factory_settings(use_empty=True);bpy.ops.import_scene.gltf(filepath=str(spec['source']))
 arm=next(o for o in bpy.context.scene.objects if o.type=='ARMATURE');meshes=[o for o in bpy.context.scene.objects if o.type=='MESH' and o.find_armature()]
 for track in list(arm.animation_data.nla_tracks):arm.animation_data.nla_tracks.remove(track)
 originals={a.name:a for a in bpy.data.actions};clips={};provenance=[]
 for name,source_name in spec['map'].items():
  factor=1.75 if mob=='MOB-02' and name=='walk' else .72 if mob in ['MOB-01','MOB-04'] and name=='run' else 1.
  window=(18.,43.) if mob=='MOB-02' and name=='attack' else (None,None)
  if spec.get('candidate_roach'):
   source_name=next(k for k in originals if k==source_name or k==source_name+'_Armature')
   if name in ['walk','run']:
    window=(10.,50.);factor=.6 if name=='walk' else .35
  if spec.get('candidate_boar'):
   source_name=next(k for k in originals if k==source_name or k.startswith(source_name+'_'))
   factor={'idle':12.,'walk':.75,'run':.45,'attack':3.,'death':1.}[name]
  clips[name]=copy_window(originals[source_name],'P2_'+name,*window,duration_factor=factor)
  provenance.append({'clip':name,'source_action':source_name,'source_frame_window_at_24fps':list(window) if window[0] is not None else list(originals[source_name].frame_range),'duration_factor':factor,'kind':'source_window' if window[0] is not None else 'derived_timing' if factor!=1 else 'source_clip'})
 if spec.get('candidate_boar'):
  for name in ['idle','walk','run']:
   action=clips[name];start,end=action.frame_range
   for curve in action.fcurves:
    residual=curve.evaluate(end)-curve.evaluate(start)
    for point in curve.keyframe_points:
     t=(point.co.x-start)/(end-start);point.co.y-=residual*t*t*(3.-2.*t)
   provenance.append({'clip':name,'kind':'authored_loop_closure','description':'Distribute source end/start transform residual smoothly over the cycle. The original right-foot trot seam was about7cm at game scale; retained source pose timing is now a closed derived loop.'})
 # Snapshot the neutral source stance before authoring local rig actions.
 neutral=originals['default_boar_armature'] if mob=='MOB-04' and not spec.get('candidate_boar') else clips['idle']
 arm.animation_data.action=neutral;bpy.context.scene.frame_set(0)
 rest={b.name:(b.location.copy(),b.rotation_quaternion.copy(),b.scale.copy(),b.matrix.copy()) for b in arm.pose.bones}
 authored=['hit'] if spec.get('candidate_boar') else ['idle','hit','death'] if mob=='MOB-04' else ['hit'] if mob=='MOB-01' or spec.get('candidate_roach') else []
 for name in authored:
  action=bpy.data.actions.new('P2_'+name);action.use_fake_user=True;arm.animation_data.action=action
  duration=48 if name=='idle' else 8 if name=='hit' else 28
  for frame in range(duration+1):
   t=frame/duration
   for bone in arm.pose.bones:
    location,rotation,scale,matrix=rest[bone.name];bone.rotation_mode='QUATERNION';bone.location=location;bone.rotation_quaternion=rotation;bone.scale=scale
   if spec.get('candidate_roach'):
    wave=math.sin(t*math.pi)
    body=arm.pose.bones['SpineHigh'];body.matrix=rest[body.name][3]@Matrix.Rotation(-.12*wave,4,'X')
    head=arm.pose.bones['Head'];head.matrix=rest[head.name][3]@Matrix.Rotation(.18*wave,4,'X')
   elif spec.get('candidate_boar'):
    wave=math.sin(t*math.pi)
    body=arm.pose.bones['spine'];body.matrix=rest[body.name][3]@Matrix.Rotation(-.10*wave,4,'X')
    head=arm.pose.bones['head'];head.matrix=rest[head.name][3]@Matrix.Rotation(.14*wave,4,'X')
   elif mob=='MOB-01':
    body=arm.pose.bones['Body'];body.scale=Vector((1.+.13*math.sin(t*math.pi),1.+.13*math.sin(t*math.pi),1.-.20*math.sin(t*math.pi)))
   elif name=='idle':
    body=arm.pose.bones['body.001'];body.scale=Vector((1.,1.,1.+.022*math.sin(t*math.tau)))
   elif name=='hit':
    body=arm.pose.bones['body.001'];wave=math.sin(t*math.pi)
    body.matrix=rest[body.name][3]@Matrix.Rotation(-.16*wave,4,'X')
    head=arm.pose.bones['head'];head.matrix=rest[head.name][3]@Matrix.Rotation(.2*wave,4,'X')
   else:
    root=arm.pose.bones['ROOT'];u=t*t*(3.-2.*t);pivot=Vector((0.,-.2,-.6))
    root.matrix=Matrix.Translation(pivot)@Matrix.Rotation(1.48*u,4,'Y')@Matrix.Translation(-pivot)@rest['ROOT'][3]
   for bone in arm.pose.bones:
    for prop in ['location','rotation_quaternion','scale']:bone.keyframe_insert(prop,frame=frame,group=bone.name)
  for curve in action.fcurves:
   for point in curve.keyframe_points:point.interpolation='LINEAR'
  clips[name]=action;provenance.append({'clip':name,'kind':'authored_local_rig_action','description':'local squash recoil on existing Body bone' if mob=='MOB-01' else 'gentle breath' if name=='idle' else 'local spine/head recoil' if name=='hit' else 'authored roll and settle on existing ROOT rig; floor correction baked','frames':[0,duration],'fps':24})
 arm.animation_data.action=None
 for source in originals.values():bpy.data.actions.remove(source)
 for name,action in clips.items():action.name=name;arm.animation_data.action=action;bpy.context.scene.frame_set(0)
 # Bake ground correction at 60 Hz so fast bites do not dip between 24 Hz keys.
 for action in clips.values():
  for curve in action.fcurves:
   for point in curve.keyframe_points:
    point.co.x*=2.5;point.handle_left.x*=2.5;point.handle_right.x*=2.5
 bpy.context.scene.render.fps=60
 if mob=='MOB-02':
  arm.animation_data.action=clips['idle'];bpy.context.scene.frame_set(0);bpy.context.view_layer.update()
  reference=arm.matrix_world@arm.pose.bones['bassin'].head
  arm.animation_data.action=clips['death']
  death_frames=int(math.ceil(clips['death'].frame_range[1]))
  hip_poses=[]
  for frame in range(death_frames+1):
   bpy.context.scene.frame_set(frame);bpy.context.view_layer.update();hip=arm.pose.bones['bassin'];matrix=hip.matrix.copy();point=arm.matrix_world@matrix.translation
   matrix.translation=arm.matrix_world.inverted()@Vector((reference.x,reference.y,point.z));hip_poses.append((frame,matrix))
  for frame,matrix in hip_poses:
   bpy.context.scene.frame_set(frame);hip=arm.pose.bones['bassin'];hip.matrix=matrix;hip.keyframe_insert('location',frame=frame,group='AuthoredDeathPlanarAnchor')
  provenance.append({'clip':'death','kind':'authored_planar_stabilization','description':'Bassin world XY pinned to idle projection while retaining source fall rotation and vertical movement; prevents corpse sliding away from authoritative actor root.'})
 arm.animation_data.action=clips['idle'];bpy.context.scene.frame_set(0);floor_lo,floor_hi=evaluate(meshes)
 source_floor=float(floor_lo.z);source_height=float(floor_hi.z-floor_lo.z)
 base_location=arm.location.copy();grounding=[]
 # Bake only upward correction at each source frame. This preserves airborne
 # portions and cannot move the authoritative actor root or emit damage.
 for name,action in clips.items():
  arm.animation_data.action=action;arm.location=base_location
  corrections=[];end=int(math.ceil(action.frame_range[1]))
  for frame in range(end+1):
   bpy.context.scene.frame_set(frame);arm.location=base_location;lo,hi=evaluate(meshes)
   lift=source_floor-lo.z if name=='death' else max(0.,source_floor-lo.z);corrections.append((frame,lift))
  for frame,lift in corrections:
   arm.location=base_location+Vector((0,0,lift));arm.keyframe_insert('location',frame=frame,group='AuthoredFloorCorrection')
  for curve in action.fcurves:
   if curve.data_path=='location':
    for point in curve.keyframe_points:point.interpolation='LINEAR'
  grounding.append({'clip':name,'max_upward_source_units':max(c[1] for c in corrections),'frames_checked':len(corrections)})
 arm.animation_data.action=clips['idle'];bpy.context.scene.frame_set(0);lo,hi=evaluate(meshes)
 factor=spec['height']/(hi.z-lo.z)
 feet=[arm.matrix_world@arm.pose.bones[name].head for name in spec['feet']]
 anchor=Vector((sum(p.x for p in feet)/len(feet),sum(p.y for p in feet)/len(feet),lo.z))
 tops=[o for o in bpy.context.scene.objects if o.parent is None];origin=bpy.data.objects.new(spec['model']+'_Origin',None);bpy.context.scene.collection.objects.link(origin)
 for obj in tops:obj.parent=origin
 origin.rotation_euler.z=spec['turn'];origin.scale=(factor,)*3;origin.location=-(Matrix.Rotation(spec['turn'],3,'Z')@anchor)*factor
 textures=[]
 if spec.get('candidate_roach'):
  for obj in meshes:
   for mat in obj.data.materials:
    if not mat or not mat.use_nodes:continue
    bsdf=next(n for n in mat.node_tree.nodes if n.type=='BSDF_PRINCIPLED');bsdf.inputs['Roughness'].default_value=.7
    normal_image=bpy.data.images.load(str(ROOT/'MOB-05-roach/RoachNormal.png'),check_existing=True);normal_image.colorspace_settings.name='Non-Color';normal_image.pack()
    normal_tex=mat.node_tree.nodes.new('ShaderNodeTexImage');normal_tex.image=normal_image
    normal=mat.node_tree.nodes.new('ShaderNodeNormalMap');normal.inputs['Strength'].default_value=.5
    mat.node_tree.links.new(normal_tex.outputs['Color'],normal.inputs['Color']);mat.node_tree.links.new(normal.outputs['Normal'],bsdf.inputs['Normal'])
 for image in bpy.data.images:
  if image.type!='IMAGE' or not image.size[0]:continue
  old=list(image.size)
  texture_limit=1024 if spec.get('candidate_roach') else 512
  if max(image.size)>texture_limit:
   mul=texture_limit/max(image.size);image.scale(round(image.size[0]*mul),round(image.size[1]*mul));image.pack()
  textures.append({'name':image.name,'original':old,'exported':list(image.size)})
 samples=[];gaits={}
 for name,action in clips.items():
  arm.animation_data.action=action;end=float(action.frame_range[1]);duration=end/60.;positions=[]
  for index in range(61):
   frame=end*index/60;bpy.context.scene.frame_set(int(frame),subframe=frame-int(frame));lo,hi=evaluate(meshes)
   samples.append({'clip':name,'phase':index/60.,'floor':float(lo.z),'height':float(hi.z),'finite':True})
   positions.append([list(arm.matrix_world@arm.pose.bones[n].head) for n in spec['feet']])
  if name in ['walk','run']:
   speeds=[]
   for foot in range(len(spec['feet'])):
    zs=[row[foot][2] for row in positions];threshold=min(zs)+(max(zs)-min(zs))*.25
    for index in range(60):
     if max(zs[index:index+2])<=threshold+.002:
      travel=positions[index][foot][1]-positions[index+1][foot][1]
      if travel>1e-5:speeds.append(travel/(duration/60.))
   measured=statistics.median(speeds) if len(speeds)>=3 else None
   gaits[name]={'measured_stance_speed_mps':measured,'stance_segments':len(speeds),'method':'median backward displacement of selected low-quarter support bone heads; visual calibration still required'}
 # Conservative millimetre clearance guards nonlinear in-between skin poses.
 # Idle remains the floor anchor; only affected moving clips receive a lift.
 residual_guards={}
 for name,action in clips.items():
  residual=min(sample['floor'] for sample in samples if sample['clip']==name)
  if name!='idle' and residual<-.001:
   guard=-residual+.0005;residual_guards[name]=guard
   for curve in action.fcurves:
    if curve.data_path=='location' and curve.array_index==2:
     for point in curve.keyframe_points:
      point.co.y+=guard/factor;point.handle_left.y+=guard/factor;point.handle_right.y+=guard/factor
 if residual_guards:
  samples=[]
  for name,action in clips.items():
   arm.animation_data.action=action;end=float(action.frame_range[1])
   for index in range(61):
    frame=end*index/60;bpy.context.scene.frame_set(int(frame),subframe=frame-int(frame));lo,hi=evaluate(meshes)
    samples.append({'clip':name,'phase':index/60.,'floor':float(lo.z),'height':float(hi.z),'finite':True})
 arm.animation_data.action=clips['idle'];bpy.context.scene.frame_set(0);idle_lo,idle_hi=evaluate(meshes)
 for obj in bpy.context.view_layer.objects:obj.select_set(True)
 path=OUTPUT/(spec['model']+'.glb')
 bpy.ops.export_scene.gltf(filepath=str(path),export_format='GLB',use_selection=True,export_animations=True,export_animation_mode='BROADCAST',export_skins=True,export_force_sampling=True,export_cameras=False,export_lights=False)
 report={'mob_id':mob,'model':spec['model'],'path':str(path),'sha256':hashlib.sha256(path.read_bytes()).hexdigest(),'bytes':path.stat().st_size,'source':str(spec['source']),'source_sha256':hashlib.sha256(spec['source'].read_bytes()).hexdigest(),'author':spec['author'],'license':spec['license'],'source_url':spec['page'],'target_height':spec['height'],'source_normalization_factor':factor,'axis':'GLB +Y up / -Z forward; native adapter rotates visual PI to match actor yaw=-serverYaw+PI','idle_bounds_blender':{'min':list(idle_lo),'max':list(idle_hi)},'clips':provenance,'texture_sizes':textures,'ground_corrections':grounding,'dense_floor_samples':samples,'gait_measurements':gaits,'clip_lengths_seconds':{name:float(a.frame_range[1]-a.frame_range[0])/60. for name,a in clips.items()},'status':'P2 visual candidate; no gameplay art acceptance'}
 (REPORTS/(mob+'.json')).write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf-8')
 if spec.get('candidate_roach') or spec.get('candidate_boar'):bpy.ops.wm.save_as_mainfile(filepath=str(REPORTS/'candidate.blend'))
 report['residual_clearance_guards_meters']=residual_guards
 (REPORTS/(mob+'.json')).write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf-8')
 render_review(meshes,REPORTS/(mob+'_idle.png'))
 if mob=='MOB-04':
  arm.animation_data.action=clips['death'];bpy.context.scene.frame_set(70);render_review(meshes,REPORTS/(mob+'_death.png'))
 print('P2_SOURCE_READY '+mob,flush=True)
