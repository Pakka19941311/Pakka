import bpy,pathlib,json,math,hashlib,struct,sys,argparse
from mathutils import Vector,Matrix
parser=argparse.ArgumentParser()
parser.add_argument('--source',required=True)
parser.add_argument('--output',required=True)
args=parser.parse_args(sys.argv[sys.argv.index('--')+1:])
out=pathlib.Path(args.output);out.mkdir(parents=True,exist_ok=True)
roach_source_path=pathlib.Path(args.source)
assert hashlib.sha256(roach_source_path.read_bytes()).hexdigest()=='9ee26e78d565d55a7304657d7c02436c56c4bf8dc6a82105eedccbb06fd50d16'
bpy.ops.wm.read_factory_settings(use_empty=True);bpy.ops.import_scene.gltf(filepath=str(roach_source_path))
arm=next(o for o in bpy.context.scene.objects if o.type=='ARMATURE');mesh=next(o for o in bpy.context.scene.objects if o.type=='MESH')
for track in list(arm.animation_data.nla_tracks):arm.animation_data.nla_tracks.remove(track)
source_fps=bpy.context.scene.render.fps
for action in bpy.data.actions:
 action.name=action.name.split('_')[0]
 for curve in action.fcurves:
  for point in curve.keyframe_points:
   point.co.x*=60/source_fps;point.handle_left.x*=60/source_fps;point.handle_right.x*=60/source_fps
bpy.context.scene.render.fps=60
arm.animation_data.action=bpy.data.actions['idle'];bpy.context.scene.frame_set(0);bpy.context.view_layer.update()
arm_world=arm.matrix_world.copy();mesh_world=mesh.matrix_world.copy();groups={g.index:g.name for g in mesh.vertex_groups};original_actions=list(bpy.data.actions)
specs=[];created=[]
for side,sign in [('L',-1),('R',1)]:
 old=['ArmRoot'+side,'Arm'+side,'ForearmFront'+side,'ClawFront'+side];new=['MiddleRoot'+side,'MiddleUpper'+side,'MiddleLower'+side,'MiddleClaw'+side];mapping=dict(zip(old,new))
 hip=arm_world@arm.pose.bones[old[1]].head;target=Vector((sign*.055,-.06,.226));scale=.85
 world_G=Matrix.Translation(target)@Matrix.Rotation(-sign*math.radians(35),4,'Z')@Matrix.Scale(scale,4)@Matrix.Translation(-hip)
 G=arm_world.inverted()@world_G@arm_world
 specs.append({'side':side,'old':old,'new':new,'mapping':mapping,'scale':scale,'G':G,'world_G':world_G,'parent_neutral':arm.pose.bones['SpineHigh'].matrix.copy(),'contact':'MiddleContact'+side,'source_contact':'ClawFront'+('LH' if side=='L' else 'RH')})
# Independent middle root/upper/lower/claw chain with a real anatomical marker.
bpy.ops.object.select_all(action='DESELECT');arm.select_set(True);bpy.context.view_layer.objects.active=arm;bpy.ops.object.mode_set(mode='EDIT')
for spec in specs:
 for old,new in spec['mapping'].items():
  source=arm.data.edit_bones[old];index=spec['old'].index(old);end=arm.data.edit_bones[spec['old'][index+1]].head if index<3 else arm.data.edit_bones[spec['source_contact']].head
  b=arm.data.edit_bones.new(new);b.head=spec['G']@source.head;b.tail=spec['G']@end;b.align_roll((spec['G'].to_3x3()@source.z_axis).normalized());b.use_deform=True
  b.parent=arm.data.edit_bones[spec['mapping'].get(source.parent.name,source.parent.name)] if source.parent else None
  b.use_connect=False
 c=arm.data.edit_bones.new(spec['contact']);c.head=spec['G']@arm.data.edit_bones[spec['source_contact']].head;c.tail=c.head+Vector((0,0,.08));c.parent=arm.data.edit_bones[spec['new'][-1]];c.use_deform=False
bpy.ops.object.mode_set(mode='OBJECT')
# Copy actual skinned source leg faces and UVs, assign the new joint chain.
for spec in specs:
 leg=set(spec['old']);strength={v.index:sum(g.weight for g in v.groups if groups[g.group] in leg) for v in mesh.data.vertices}
 faces=[p for p in mesh.data.polygons if all(strength[v]>=.40 for v in p.vertices)]
 indices=sorted({v for p in faces for v in p.vertices});lookup={v:i for i,v in enumerate(indices)};local_G=mesh_world.inverted()@spec['world_G']@mesh_world
 data=bpy.data.meshes.new('MiddleLeg'+spec['side']);data.from_pydata([local_G@mesh.data.vertices[v].co for v in indices],[],[tuple(lookup[v] for v in p.vertices) for p in faces]);data.update()
 obj=bpy.data.objects.new('MiddleLeg'+spec['side'],data);bpy.context.scene.collection.objects.link(obj);obj.parent=mesh.parent;obj.matrix_world=mesh_world
 for m in mesh.data.materials:data.materials.append(m)
 for target,original in zip(data.polygons,faces):target.material_index=original.material_index;target.use_smooth=True
 for layer in mesh.data.uv_layers:
  uv=data.uv_layers.new(name=layer.name)
  for target,original in zip(data.polygons,faces):
   for to,fr in zip(target.loop_indices,original.loop_indices):uv.data[to].uv=layer.data[fr].uv
 for original_index in indices:
  values={}
  for g in mesh.data.vertices[original_index].groups:
   name=spec['mapping'].get(groups[g.group],spec['new'][0]);values[name]=values.get(name,0.)+g.weight
  total=sum(values.values())
  for name,w in values.items():
   group=obj.vertex_groups.get(name) or obj.vertex_groups.new(name=name);group.add([lookup[original_index]],w/total,'REPLACE')
 mod=obj.modifiers.new('Middle leg skin','ARMATURE');mod.object=arm;created.append(obj)
 spec['geometry']={'vertices':len(indices),'polygons':len(faces),'selection':'all face vertices have>=40% source front-chain influence; remainder mapped to middle root'}
# Bake the new chain in all six existing clips. Gaits use half-cycle offset;
# the root follows the source root at the CURRENT phase, anchoring the socket.
for action in original_actions:
 action.use_fake_user=True;arm.animation_data.action=action;end=float(action.frame_range[1]);frames=sorted(set([0.,end]+[float(f) for f in range(math.ceil(end)+1)]));record=[]
 for frame in frames:
  bpy.context.scene.frame_set(int(frame),subframe=frame-int(frame));bpy.context.view_layer.update();current={s['side']:arm.pose.bones[s['old'][0]].matrix.copy() for s in specs};parent_current=arm.pose.bones['SpineHigh'].matrix.copy()
  shifted=(frame+end*.5)%end if action.name in ['walk','run'] and end else frame
  bpy.context.scene.frame_set(int(shifted),subframe=shifted-int(shifted));bpy.context.view_layer.update();poses={}
  for s in specs:
   relative=current[s['side']]@arm.pose.bones[s['old'][0]].matrix.inverted();delta=parent_current@s['parent_neutral'].inverted();current_G=delta@s['G']@delta.inverted()
   for old,new in s['mapping'].items():
    rest_correction=arm.data.bones[old].matrix_local.inverted()@s['G'].inverted()@arm.data.bones[new].matrix_local
    poses[new]=current_G@relative@arm.pose.bones[old].matrix@rest_correction
  record.append((frame,poses))
 for frame,poses in record:
  bpy.context.scene.frame_set(int(frame),subframe=frame-int(frame))
  for name,matrix in poses.items():
   bone=arm.pose.bones[name];bone.rotation_mode='QUATERNION';bone.matrix=matrix;bpy.context.view_layer.update()
   for prop in ['location','rotation_quaternion','scale']:bone.keyframe_insert(prop,frame=frame,group=name)
 for curve in action.fcurves:
  if 'Middle' in curve.data_path:
   for p in curve.keyframe_points:p.interpolation='LINEAR'
# Author planted middle contacts with inverse kinematics; a real three-joint
# chain solves the endpoint, instead of lifting the entire animal to hide errors.
targets=[];constraints=[];ik_records={};ik_errors={}
for s in specs:
 target=bpy.data.objects.new('TemporaryMiddleTarget'+s['side'],None);bpy.context.scene.collection.objects.link(target);targets.append(target)
 c=arm.pose.bones[s['new'][-1]].constraints.new('IK');c.target=target;c.chain_count=3;c.use_tail=True;c.use_stretch=False;c.iterations=64;constraints.append(c)
for action in original_actions:
 arm.animation_data.action=action;end=float(action.frame_range[1]);records=[];errors=[]
 for frame in range(math.ceil(end)+1):
  for c in constraints:c.influence=0.
  bpy.context.scene.frame_set(frame);bpy.context.view_layer.update()
  for s,target in zip(specs,targets):
   point=arm.matrix_world@arm.pose.bones[s['contact']].head
   if action.name in ['walk','run']:
    phase=(frame/end+(.25 if s['side']=='L' else .75))%1.;duty=.55;half=.16655
    if phase<duty:y=half-2*half*phase/duty;z=.003
    else:u=(phase-duty)/(1-duty);y=-half+2*half*(.5-.5*math.cos(math.pi*u));z=.003+.07*math.sin(math.pi*u)
    point=Vector(((-1 if s['side']=='L' else 1)*.26,y-.025,z))
   elif action.name in ['idle','hit']:point=Vector(((-1 if s['side']=='L' else 1)*.26,0.,.003))
   else:point.z=max(.003,point.z)
   target.location=point
  for c in constraints:c.influence=1.
  bpy.context.view_layer.update();poses={}
  for s,target in zip(specs,targets):
   errors.append((arm.matrix_world@arm.pose.bones[s['contact']].head-target.location).length)
   for name in s['new'][1:]+[s['contact']]:poses[name]=arm.pose.bones[name].matrix.copy()
  records.append((frame,poses))
 ik_records[action.name]=records;ik_errors[action.name]=max(errors)
for s,c in zip(specs,constraints):arm.pose.bones[s['new'][-1]].constraints.remove(c)
for target in targets:bpy.data.objects.remove(target,do_unlink=True)
for action in original_actions:
 arm.animation_data.action=action
 for frame,poses in ik_records[action.name]:
  bpy.context.scene.frame_set(frame)
  for name,matrix in poses.items():
   bone=arm.pose.bones[name];bone.rotation_mode='QUATERNION';bone.matrix=matrix;bpy.context.view_layer.update()
   for prop in ['location','rotation_quaternion','scale']:bone.keyframe_insert(prop,frame=frame,group=name)
 for curve in action.fcurves:
  if 'Middle' in curve.data_path:
   for p in curve.keyframe_points:p.interpolation='LINEAR'
arm.animation_data.action=bpy.data.actions['idle'];bpy.context.scene.frame_set(0);bpy.context.view_layer.update()
# Two curved, volumetric mandibles, each weighted to the existing animated jaw.
mat=bpy.data.materials.new('Authored organic mandible');mat.use_nodes=True;p=mat.node_tree.nodes.get('Principled BSDF');p.inputs['Base Color'].default_value=(.033,.037,.028,1);p.inputs['Roughness'].default_value=.64;p.inputs['Specular IOR Level'].default_value=.3
for side,sign in [('L',-1),('R',1)]:
 bone='Jaw'+side;control=[Vector((sign*x,y,z)) for x,y,z in [(.047,.105,.221),(.067,.145,.204),(.066,.195,.190),(.040,.23,.189),(.009,.225,.197)]];widths=[.014,.014,.012,.009,.001];points=[];radii=[]
 for segment in range(4):
  a,b,c,d=[control[max(0,min(4,n))] for n in [segment-1,segment,segment+1,segment+2]]
  for step in range(5):
   t=step/5;points.append((2*b+(-a+c)*t+(2*a-5*b+4*c-d)*t*t+(-a+3*b-3*c+d)*t*t*t)*.5);radii.append(widths[segment]*(1-t)+widths[segment+1]*t)
 points.append(control[-1]);radii.append(widths[-1])
 deform=arm.matrix_world@arm.pose.bones[bone].matrix@arm.data.bones[bone].matrix_local.inverted()@arm.matrix_world.inverted();verts=[]
 for i,point in enumerate(points):
  tangent=(points[min(i+1,len(points)-1)]-points[max(i-1,0)]).normalized();across=tangent.cross(Vector((0,0,1))).normalized();vertical=tangent.cross(across).normalized()
  for n in range(8):
   irregular=1.+.06*math.sin(i*2.3+n*1.7)+.03*math.sin(i*4.7-n*2.9)
   v=point+across*math.cos(n*math.tau/8)*radii[i]*irregular+vertical*math.sin(n*math.tau/8)*radii[i]*.72*irregular;verts.append(mesh_world.inverted()@deform.inverted()@v)
 faces=[tuple(range(7,-1,-1)),tuple(range((len(points)-1)*8,len(points)*8))]
 for ring in range(len(points)-1):
  for n in range(8):j=ring*8+n;k=ring*8+(n+1)%8;faces.append((j,k,k+8,j+8))
 data=bpy.data.meshes.new('Mandible'+side);data.from_pydata(verts,[],faces);data.update();obj=bpy.data.objects.new('Mandible'+side,data);bpy.context.scene.collection.objects.link(obj);obj.parent=mesh.parent;obj.matrix_world=mesh_world;data.materials.append(mat)
 for poly in data.polygons:poly.use_smooth=True
 group=obj.vertex_groups.new(name=bone);group.add(list(range(len(verts))),1.,'REPLACE');mod=obj.modifiers.new('Jaw skin','ARMATURE');mod.object=arm;created.append(obj)
# Material adaptation keeps original UV/image/normal; shader tint avoids painted
# or generated replacement textures. Segmented relief remains source-authored.
for material in mesh.data.materials:
 if not material or not material.use_nodes:continue
 node=next(n for n in material.node_tree.nodes if n.type=='BSDF_PRINCIPLED');links=material.node_tree.links
 source=next((l.from_socket for l in links if l.to_socket==node.inputs['Base Color']),None)
 if source:
  tint=material.node_tree.nodes.new('ShaderNodeMixRGB');tint.blend_type='MULTIPLY';tint.inputs[0].default_value=1.;tint.inputs[2].default_value=(.60,.46,.31,1);links.new(source,tint.inputs[1]);links.new(tint.outputs[0],node.inputs['Base Color'])
 node.inputs['Roughness'].default_value=.56;node.inputs['Specular IOR Level'].default_value=.28;node.inputs['Coat Weight'].default_value=.1;node.inputs['Coat Roughness'].default_value=.6
# GLTF cannot export arbitrary MixRGB for base colour. Keep the original image
# in the exported material and record tint as factor, a standard GLTF property.
for material in mesh.data.materials:
 if not material or not material.use_nodes:continue
 node=next(n for n in material.node_tree.nodes if n.type=='BSDF_PRINCIPLED');tints=[n for n in material.node_tree.nodes if n.type=='MIX_RGB']
 for tint in tints:
  texture=next((l.from_socket for l in material.node_tree.links if l.to_socket==tint.inputs[1]),None)
  if texture:material.node_tree.links.new(texture,node.inputs['Base Color'])
  material.node_tree.nodes.remove(tint)
 node.inputs['Base Color'].default_value=(.60,.46,.31,1)
# Join all additions to the original skinned mesh, retaining real deform groups.
bpy.ops.object.select_all(action='DESELECT');mesh.select_set(True)
for obj in created:obj.select_set(True)
bpy.context.view_layer.objects.active=mesh;bpy.ops.object.join();mesh.data.validate();bpy.context.view_layer.update()
death=bpy.data.actions['death'];arm.animation_data.action=death;ground=[]
for frame in range(math.ceil(death.frame_range[1])+1):
 bpy.context.scene.frame_set(frame);bpy.context.view_layer.update();ev=mesh.evaluated_get(bpy.context.evaluated_depsgraph_get());me=ev.to_mesh();floor=min((ev.matrix_world@v.co).z for v in me.vertices);ev.to_mesh_clear();ground.append((frame,arm.location.copy(),-floor))
for frame,location,lift in ground:
 bpy.context.scene.frame_set(frame);delta=arm.parent.matrix_world.inverted().to_3x3()@Vector((0,0,lift)) if arm.parent else Vector((0,0,lift));arm.location=location+delta;arm.keyframe_insert('location',frame=frame,group='SixLegCorpseGround')
for a in original_actions:arm.animation_data.action=a;bpy.context.scene.frame_set(0)
arm.animation_data.action=bpy.data.actions['idle'];bpy.context.scene.frame_set(0);bpy.context.view_layer.update()
bpy.ops.wm.save_as_mainfile(filepath=str(out/'six-leg.blend'))
bpy.ops.object.select_all(action='SELECT');bpy.ops.export_scene.gltf(filepath=str(out/'V3RoachSixLeg.glb'),export_format='GLB',use_selection=True,export_animations=True,export_animation_mode='BROADCAST',export_skins=True,export_force_sampling=True,export_cameras=False,export_lights=False)
path=out/'V3RoachSixLeg.glb';binary=path.read_bytes();length=struct.unpack_from('<I',binary,12)[0];document=json.loads(binary[20:20+length])
for material in document['materials']:
 if material['name']=='intake_Roach':material['pbrMetallicRoughness']['baseColorFactor']=[.60,.46,.31,1.]
chunk=json.dumps(document,separators=(',',':')).encode('utf-8');chunk+=b' '*((-len(chunk))%4);rest=binary[20+length:];path.write_bytes(struct.pack('<III',0x46546c67,2,20+len(chunk)+len(rest))+struct.pack('<II',len(chunk),0x4e4f534a)+chunk+rest)
report={'status':'six-leg anatomy candidate; ground/stride/native unverified','source':str(roach_source_path),'source_sha256':hashlib.sha256(roach_source_path.read_bytes()).hexdigest(),'sha256':hashlib.sha256(path.read_bytes()).hexdigest(),'new_chains':[{k:v for k,v in s.items() if k not in ['G','world_G','parent_neutral']} for s in specs],'added_art':'Two skinned middle legs, each with root/upper/lower/claw and contact marker; two curved volumetric mandibles attached to animated jaw bones.','action_policy':'Middle root follows parent-relative body transformation; authored middle foot stance55% cycle, stroke0.3331m, swing height0.07m; left/right phases0.25/0.75; IK baked into physical joints. Source bones untouched.','ik_max_endpoint_error_m':ik_errors,'corpse_ground_max_lift_m':max(g[2] for g in ground),'material_policy':'Original image/UV/normal retained; standard GLTF baseColorFactor(.60,.46,.31) added after exporter, which otherwise drops a linked socket default.'}
(out/'six-leg-adaptation.json').write_text(json.dumps(report,indent=2));print('ROACH_SIX_LEG_GENERATED',len(arm.data.bones),len(mesh.data.vertices))
