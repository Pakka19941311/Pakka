"""Author isolated city NPC motion on the supplied MPFB game_engine skeleton.

Uses the staged CC0 bodies/clothes and the project's credited CC-BY4.0 sword
and open helmet. Does not rewrite the original NPCs, knight or gameplay data.
Blender4.2.3, no external addon required for this derivative of prepare_npc.py.
"""
import argparse,sys,json,hashlib,math
from pathlib import Path
import bpy,numpy as np,bmesh
from mathutils import Vector,Matrix,Quaternion

def args():
 p=argparse.ArgumentParser();p.add_argument('--repo',default=str(Path(__file__).resolve().parents[3]));p.add_argument('--output',required=True);p.add_argument('--reports',required=True)
 p.add_argument('--role',choices=['guard','resident'],default='guard');p.add_argument('--idle-only',action='store_true');p.add_argument('--no-render',action='store_true');return p.parse_args(sys.argv[sys.argv.index('--')+1:])

def clear_pose(rig):
 for pb in rig.pose.bones:pb.rotation_mode='QUATERNION';pb.matrix_basis=Matrix.Identity(4)

def world_rest(rig,bone):return rig.matrix_world@rig.data.bones[bone].matrix_local

def orient(rig,name,head,direction):
 rest=world_rest(rig,name);rotation=(rest.to_quaternion()@Vector((0,1,0))).rotation_difference(direction.normalized())@rest.to_quaternion()
 m=(rotation.to_matrix()@Matrix.Diagonal(rest.to_scale())).to_4x4();m.translation=head;rig.pose.bones[name].matrix=rig.matrix_world.inverted()@m
 bpy.context.view_layer.update()

def limb(rig,upper,lower,end,goal,pole):
 s=(rig.matrix_world@rig.pose.bones[upper].matrix).translation
 a=(world_rest(rig,upper).translation-world_rest(rig,lower).translation).length;b=(world_rest(rig,lower).translation-world_rest(rig,end).translation).length
 v=goal-s;d=min(v.length,a+b-.0001);unit=v.normalized();goal=s+unit*d;projection=pole-unit*pole.dot(unit)
 if projection.length<.001:projection=Vector((1,0,0))
 x=(a*a-b*b+d*d)/(2*d);elbow=s+unit*x+projection.normalized()*math.sqrt(max(0,a*a-x*x))
 orient(rig,upper,s,elbow-s);orient(rig,lower,elbow,goal-elbow)
 return goal

def finger_pose(rig,side,grip):
 # Close joints around the anatomical palm normal; no hand-scale shortcuts.
 palm=world_rest(rig,'hand_'+side).to_quaternion()
 for finger in ['index','middle','ring','pinky']:
  for joint in [1,2,3]:
   name=f'{finger}_{joint:02}_{side}';pb=rig.pose.bones[name]
   angle=math.radians(([44,62,45] if grip else [12,18,10])[joint-1]);axis=world_rest(rig,name).to_quaternion().inverted()@(palm@Vector((1,0,0)))
   pb.rotation_quaternion=Quaternion(axis,angle)
 for joint in [1,2,3]:
  name=f'thumb_{joint:02}_{side}';rig.pose.bones[name].rotation_quaternion=Quaternion((1,0,0),math.radians((18 if grip else 4)*joint/2))

def author_pose(rig,role,clip,phase):
 clear_pose(rig);bpy.context.view_layer.update()
 walking=clip=='walk';turn=clip.startswith('turn');talk=clip=='talk';breath=math.sin(phase*math.tau)
 pelvis=rig.pose.bones['pelvis'];delta=Vector((.013*breath if walking else 0,0,(-.075+.007*math.cos(phase*math.tau*2)) if walking else -.018+.002*breath))
 pelvis.location=world_rest(rig,'pelvis').to_3x3().inverted()@delta
 rig.pose.bones['spine_02'].rotation_quaternion=Quaternion((1,0,0),.009*breath)
 rig.pose.bones['head'].rotation_quaternion=Quaternion((0,1,0),(.075 if talk else .025)*math.sin(phase*math.tau))
 bpy.context.view_layer.update()
 for side,sign in [('l',-1),('r',1)]:
  restankle=world_rest(rig,'foot_'+side).translation
  ankle=Vector((sign*.113,restankle.y,restankle.z));p=(phase+(.5 if side=='r' else 0))%1
  if walking:
   speed,period=(1.0,1.3) if role=='guard' else (.9,1.4);stride=speed*period*.5
   if p<.5:ankle.y+=stride*(.5-2*p)
   else:
    t=(p-.5)*2;ankle.y+=stride*(-4*t*t*t+6*t*t-t-.5);ankle.z+=(.09 if role=='guard' else .065)*math.sin(math.pi*t)**2
  foot_yaw=0
  if turn:
   end_yaw=(1 if clip=='turn_left' else -1)*math.pi/2;yaw=end_yaw*(phase*phase*(3-2*phase));pivot=Vector((0,0,0))
   swing_first=(side=='l')==(clip=='turn_left');t=max(0,min(1,phase*2-(0 if swing_first else 1)));ease=t*t*(3-2*t)
   world_ankle=pivot+Matrix.Rotation(end_yaw*ease,3,'Z')@(ankle-pivot);world_ankle.z+=.06*math.sin(math.pi*t)
   ankle=pivot+Matrix.Rotation(-yaw,3,'Z')@(world_ankle-pivot);foot_yaw=end_yaw*ease-yaw
  ankle=limb(rig,'thigh_'+side,'calf_'+side,'foot_'+side,ankle,Vector((0,1,0)))
  foot=Matrix.Rotation(foot_yaw,4,'Z')@world_rest(rig,'foot_'+side);foot.translation=ankle;rig.pose.bones['foot_'+side].matrix=rig.matrix_world.inverted()@foot
  bpy.context.view_layer.update()
  shoulder=(rig.matrix_world@rig.pose.bones['upperarm_'+side].matrix).translation
  wrist=Vector((sign*.282,shoulder.y+.035,shoulder.z-.48))
  if walking:wrist.y+=.075*math.sin(phase*math.tau+(0 if side=='r' else math.pi));wrist.z+=.013
  if talk and side=='l':
   gesture=.5-.5*math.cos(phase*math.tau);wrist.y+=.16*gesture;wrist.z+=.15*gesture;wrist.x-=.025*gesture
  wrist=limb(rig,'upperarm_'+side,'lowerarm_'+side,'hand_'+side,wrist,Vector((0,-1,0)))
  orient(rig,'hand_'+side,wrist,Vector((0,.16,-1)))
  finger_pose(rig,side,False)
 bpy.context.view_layer.update()

def attach_equipment(repo,rig):
 prev=set(bpy.data.objects);bpy.ops.import_scene.gltf(filepath=str(repo/'godot-pc/assets/knight/Knight_Modular.glb'));source=list(set(bpy.data.objects)-prev)
 sr=next(o for o in source if o.type=='ARMATURE');sr.animation_data_clear();clear_pose(sr);bpy.context.view_layer.update()
 pieces=[]
 for original,bone,sourcebone,scale in [('FK_head_open_helmet','head','mixamorig:Head',1.0),('FK_weapon_sword','pelvis','mixamorig:RightHand',.67)]:
  o=next(o for o in source if o.name==original);sm=world_rest(sr,sourcebone);tm=world_rest(rig,bone)
  if bone=='head':
   # Remove source ornamental horn/crest islands, retaining the cap, cheek
   # plates and rear lames. Thresholds refer to this pinned source geometry.
   adjacency={i:set()for i in range(len(o.data.vertices))}
   for edge in o.data.edges:
    u,v=edge.vertices;adjacency[u].add(v);adjacency[v].add(u)
   seen=set();discard=set()
   for i in adjacency:
    if i in seen:continue
    stack=[i];part=[];seen.add(i)
    while stack:
     j=stack.pop();part.append(j)
     for k in adjacency[j]-seen:seen.add(k);stack.append(k)
    points=[o.matrix_world@o.data.vertices[j].co for j in part];lo=[min(p[k]for p in points)for k in range(3)];hi=[max(p[k]for p in points)for k in range(3)]
    horn=hi[2]>1.85 and (lo[0]>.075 or hi[0]<-.075);crest=lo[2]>=1.78 and lo[1]<-.16
    if horn or crest:discard.update(part)
   bm=bmesh.new();bm.from_mesh(o.data);bm.verts.ensure_lookup_table();bmesh.ops.delete(bm,geom=[bm.verts[i]for i in discard],context='VERTS');bm.to_mesh(o.data);bm.free();o.data.update()
  # Both supplied bodies share the MH rest proportions; their global forward
  # axes differ by exactly half a turn. Preserve the sword's authored grip.
  transform=Matrix.Rotation(math.pi,4,'Z');transform.translation=tm.translation-transform.to_3x3()@(sm.translation*scale)
  if bone=='pelvis':
   original_points=[o.matrix_world@v.co for v in o.data.vertices]
   array=np.array(original_points);_,_,axes=np.linalg.svd(array-array.mean(axis=0),full_matrices=False)
   source_axis=Vector(axes[0]);center=Vector(array.mean(axis=0))
   if source_axis.dot(center-sm.translation)<0:source_axis.negate()
   sword_axis=Vector((-.15,-.08,-1)).normalized();rotation=source_axis.rotation_difference(sword_axis);grip=Vector((-.255,.08,1.04))
   world_vertices=[grip+rotation@(p-sm.translation)*scale for p in original_points]
   verts=[rig.matrix_world.inverted()@p for p in world_vertices]
  else:
   transform.translation.z-=.065;transform.translation.y-=.025
   verts=[rig.matrix_world.inverted()@(transform@(o.matrix_world@v.co*scale)) for v in o.data.vertices]
  me=o.data.copy();me.name='P2_'+original
  for v,p in zip(me.vertices,verts):v.co=p
  obj=bpy.data.objects.new('P2_guard_'+('helmet' if bone=='head' else 'sword'),me);bpy.context.scene.collection.objects.link(obj)
  obj.parent=rig;obj.matrix_parent_inverse=Matrix.Identity(4);obj.matrix_basis=Matrix.Identity(4)
  vg=obj.vertex_groups.new(name=bone);vg.add(list(range(len(me.vertices))),1,'REPLACE');mod=obj.modifiers.new('MPFB rigid attachment','ARMATURE');mod.object=rig
  obj['source']='The Forgotten Knight / Igor Oskolskiy (dark_igorek)';obj['license']='CC-BY-4.0';pieces.append(obj)
  if bone=='pelvis':
   # New leather scabbard around the actual source blade, belt-bound so the
   # guard can walk and speak without holding a horizontal naked sword.
   middle=sum(world_vertices,Vector())/len(world_vertices);origin=middle-sword_axis*((middle-grip).dot(sword_axis))
   tip=max((p-origin).dot(sword_axis)for p in world_vertices)+.012
   wide=(rotation@Vector(axes[1])).normalized();thin=sword_axis.cross(wide).normalized();coords=[]
   blade=[p for p in world_vertices if (p-origin).dot(sword_axis)>.15]
   width=max(abs((p-origin).dot(wide))for p in blade)+.003;depth=max(abs((p-origin).dot(thin))for p in blade)+.003
   section=[(-1,-.6),(-.72,-1),(.72,-1),(1,-.6),(1,.6),(.72,1),(-.72,1),(-1,.6)]
   for t,w in [(.11,width),(tip-.035,width*.94),(tip,.012)]:
    coords.extend(rig.matrix_world.inverted()@(origin+sword_axis*t+wide*(u*w)+thin*(v*depth))for u,v in section)
   faces=[tuple(range(7,-1,-1)),tuple(range(16,24))]
   for ring in range(2):
    for j in range(8):faces.append((ring*8+j,ring*8+(j+1)%8,(ring+1)*8+(j+1)%8,(ring+1)*8+j))
   mesh=bpy.data.meshes.new('Guard fitted scabbard');mesh.from_pydata(coords,[],faces);sheath=bpy.data.objects.new('P2_guard_scabbard',mesh);bpy.context.scene.collection.objects.link(sheath);sheath.parent=rig
   vg=sheath.vertex_groups.new(name='pelvis');vg.add(list(range(len(coords))),1,'REPLACE');mod=sheath.modifiers.new('Belt attachment','ARMATURE');mod.object=rig
   leather=bpy.data.materials.new('Guard scabbard dark leather');leather.use_nodes=True;bsdf=leather.node_tree.nodes['Principled BSDF'];bsdf.inputs['Base Color'].default_value=(.055,.028,.012,1);bsdf.inputs['Roughness'].default_value=.78;mesh.materials.append(leather);pieces.append(sheath)
   # Two visible leather straps join the source belt to the fitted sheath.
   for index,(start,end) in enumerate([(Vector((-.20,.09,1.025)),origin+sword_axis*.12),(Vector((-.225,.015,1.01)),origin+sword_axis*.22)]):
    vec=(end-start).normalized();width_axis=vec.cross(Vector((0,1,0))).normalized()*.016
    verts=[rig.matrix_world.inverted()@p for p in [start-width_axis,start+width_axis,end+width_axis,end-width_axis]]
    strapmesh=bpy.data.meshes.new('Scabbard strap');strapmesh.from_pydata(verts,[],[(0,1,2,3)]);strap=bpy.data.objects.new('P2_guard_strap_'+str(index),strapmesh);bpy.context.scene.collection.objects.link(strap);strap.parent=rig;strapmesh.materials.append(leather)
    vg=strap.vertex_groups.new(name='pelvis');vg.add([0,1,2,3],1,'REPLACE');mod=strap.modifiers.new('Belt attachment','ARMATURE');mod.object=rig;solid=strap.modifiers.new('Leather thickness','SOLIDIFY');solid.thickness=.003;pieces.append(strap)
 for o in source:bpy.data.objects.remove(o,do_unlink=True)
 return pieces

def evaluated_bounds(objects):
 dg=bpy.context.evaluated_depsgraph_get();points=[]
 for o in objects:
  ev=o.evaluated_get(dg);mesh=ev.to_mesh();points.extend(ev.matrix_world@v.co for v in mesh.vertices);ev.to_mesh_clear()
 return [[min(p[i]for p in points)for i in range(3)],[max(p[i]for p in points)for i in range(3)]]

def tailor_resident(rig):
 for o in list(bpy.data.objects):
  if o.type!='MESH':continue
  if 'boots' in o.name:
   bm=bmesh.new();bm.from_mesh(o.data);remove=[f for f in bm.faces if all((o.matrix_world@v.co).z>.18 for v in f.verts)];bmesh.ops.delete(bm,geom=remove,context='FACES');bm.to_mesh(o.data);bm.free()
  if 'robe' in o.name:
   inv=o.matrix_world.inverted()
   for vertex in o.data.vertices:
    world=o.matrix_world@vertex.co
    if world.z<.65:
     amount=max(0,min(1,(.65-world.z)/.4));world.x*=1+.12*amount;world.y=.13+(world.y-.13)*(1+.65*amount)
     # An ankle-length hem clears the lifted toe. Retain the full boot below
     # it rather than hiding visible feet to mask cloth penetration.
     world.z+=.14*max(0,min(1,(.45-world.z)/.3));vertex.co=inv@world
     blend=max(0,min(1,(.65-world.z)/.2));weights={o.vertex_groups[g.group].name:g.weight*(1-blend)for g in vertex.groups}
     for name,weight in [('pelvis',.7),('thigh_l',.15),('thigh_r',.15)]:weights[name]=weights.get(name,0)+weight*blend
     for group in o.vertex_groups:group.remove([vertex.index])
     total=sum(weights.values())
     for name,weight in weights.items():
      if weight>0:
       group=o.vertex_groups.get(name)or o.vertex_groups.new(name=name);group.add([vertex.index],weight/total,'REPLACE')
   o.data.update()

def review(scene,role,reports,rig):
 scene.render.engine='CYCLES';scene.cycles.samples=16;scene.cycles.use_denoising=True;scene.render.resolution_x=900;scene.render.resolution_y=1100;scene.render.resolution_percentage=100;scene.view_settings.view_transform='AgX'
 scene.world=bpy.data.worlds.new('NPC review');scene.world.use_nodes=True;scene.world.node_tree.nodes['Background'].inputs[0].default_value=(.15,.17,.2,1);scene.world.node_tree.nodes['Background'].inputs[1].default_value=.4
 bpy.ops.mesh.primitive_plane_add(size=200);floor=bpy.context.object;floor.name='Review floor';mat=bpy.data.materials.new('Stone-grey studio');mat.diffuse_color=(.13,.15,.17,1);floor.data.materials.append(mat)
 focus=Vector((0,.12,.95))
 for name,loc,power,size in [('Key',(3,4,5),600,4),('Fill',(-3,2,3),300,3),('Rim',(0,-3,4),500,2)]:
  data=bpy.data.lights.new(name,'AREA');data.energy=power;data.shape='DISK';data.size=size;ob=bpy.data.objects.new(name,data);scene.collection.objects.link(ob);ob.location=loc;ob.rotation_euler=(focus-ob.location).to_track_quat('-Z','Y').to_euler()
 cd=bpy.data.cameras.new('Review camera');cam=bpy.data.objects.new('Review camera',cd);scene.collection.objects.link(cam);cd.type='ORTHO';cd.ortho_scale=2.35;scene.camera=cam
 for label,loc in [('front',(0,5,1.4)),('three-quarter',(3,5,1.7)),('side',(5,0,1.4))]:
  cam.location=loc;cam.rotation_euler=(focus-cam.location).to_track_quat('-Z','Y').to_euler();scene.render.filepath=str(reports/f'{role}-{label}.png');bpy.ops.render.render(write_still=True)
 for clip in ['walk','talk','turn_left']:
  action=bpy.data.actions.get(clip)
  if not action:continue
  rig.animation_data.action=action;cam.location=(3,5,1.6);cam.rotation_euler=(focus-cam.location).to_track_quat('-Z','Y').to_euler();scene.render.resolution_x=480;scene.render.resolution_y=600;scene.cycles.samples=8
  for phase in ([0,.125,.25,.375,.5,.625,.75,.875]if clip=='walk'else [.25,.5,.75]):
   scene.frame_set(round(action.frame_range[1]*phase));scene.render.filepath=str(reports/f'{role}-{clip}-{round(phase*100):02}.png');bpy.ops.render.render(write_still=True)

def audit_motion(rig,role):
 # Evaluate baked actions, rather than the authoring goals. Stance feet plus
 # the prescribed root travel must remain fixed in world space.
 scene=bpy.context.scene;speed,period=(1.0,1.3)if role=='guard'else(.9,1.4)
 rows=[];loops={};maximum=0;maximum_scale_error=0
 for clip in ['idle','walk','talk','turn_left','turn_right']:
  action=bpy.data.actions.get(clip)
  if not action:continue
  rig.animation_data.action=action;end=round(action.frame_range[1]);first=None;previous={}
  for frame in range(end+1):
   scene.frame_set(frame);bpy.context.view_layer.update();phase=frame/end
   matrices={b.name:(rig.matrix_world@b.matrix).copy()for b in rig.pose.bones}
   maximum_scale_error=max(maximum_scale_error,max(abs(v-1)for b in rig.pose.bones for v in b.scale))
   if first is None:first=matrices
   if clip=='walk':
    for side,offset in [('l',0),('r',.5)]:
     p=(phase+offset)%1;foot=matrices['foot_'+side].translation+Vector((0,frame/30*speed,0))
     if .05<p<.45 and side in previous and .05<previous[side][0]<p:
      slip=(foot-previous[side][1]).length;maximum=max(maximum,slip);rows.append({'side':side,'phase':phase,'worldFoot':list(foot),'stepSlipM':slip})
     previous[side]=(p,foot)
  if clip in ['idle','walk','talk']:
   loops[clip]={'positionM':max((first[n].translation-matrices[n].translation).length for n in first),'angleRad':max(first[n].to_quaternion().rotation_difference(matrices[n].to_quaternion()).angle for n in first)}
 rig.animation_data.action=bpy.data.actions['idle'];scene.frame_set(0);bpy.context.view_layer.update()
 return {'rootSpeedMps':speed,'walkCycleSeconds':period,'maxStanceStepSlipM':maximum,'maxBoneScaleDeviation':maximum_scale_error,'loopSeams':loops,'stanceSamples':rows,'passed':maximum<.002 and maximum_scale_error<.001 and all(v['positionM']<.001 and v['angleRad']<.002 for v in loops.values())}

def main():
 a=args();repo=Path(a.repo).resolve();out=Path(a.output).resolve();reports=Path(a.reports).resolve();out.mkdir(parents=True,exist_ok=True);reports.mkdir(parents=True,exist_ok=True)
 source=repo/f'godot-pc/world-expansion-v3/city/assets/P2_{a.role}.glb';bpy.ops.wm.read_factory_settings(use_empty=True);bpy.ops.import_scene.gltf(filepath=str(source));rig=next(o for o in bpy.data.objects if o.type=='ARMATURE');rig.animation_data_clear();clear_pose(rig)
 for action in list(bpy.data.actions):bpy.data.actions.remove(action)
 if a.role=='guard':
  attach_equipment(repo,rig)
  for ob in list(bpy.data.objects):
   if ob.type=='MESH' and 'short02' in ob.name:bpy.data.objects.remove(ob,do_unlink=True)
 else:tailor_resident(rig)
 # glTF custom-shape helper objects are not costume meshes or runtime actors.
 for ob in list(bpy.context.scene.objects):
  if ob.type=='MESH' and ob.parent!=rig:bpy.data.objects.remove(ob,do_unlink=True)
 for action in list(bpy.data.actions):bpy.data.actions.remove(action)
 models=[o for o in bpy.context.scene.objects if o.type=='MESH'];rig.animation_data_create();scene=bpy.context.scene;scene.render.fps=30
 clips=[('idle',4)] if a.idle_only else [('idle',4),('walk',1.3 if a.role=='guard' else 1.4),('talk',3.2),('turn_left',1.2),('turn_right',1.2)]
 motion=[]
 for name,seconds in clips:
  action=bpy.data.actions.new(name);action.use_fake_user=True;rig.animation_data.action=action;frames=round(seconds*30)
  for frame in range(frames+1):
   scene.frame_set(frame);author_pose(rig,a.role,name,frame/frames)
   for pb in rig.pose.bones:pb.keyframe_insert('rotation_quaternion',frame=frame,group=pb.name);pb.keyframe_insert('location',frame=frame,group=pb.name)
  for fc in action.fcurves:
   for point in fc.keyframe_points:point.interpolation='LINEAR'
  motion.append({'name':name,'duration':frames/30,'source':'authored in prepare_npc_motion.py; no borrowed walk claim','rootMotion':False})
 rig.animation_data.action=bpy.data.actions['idle'];scene.frame_start=0;scene.frame_end=120;scene.frame_set(0);bpy.context.view_layer.update()
 audit=audit_motion(rig,a.role);bounds=evaluated_bounds(models);dest=out/f'P2_{a.role}_motion.glb'
 assert audit['passed'],json.dumps(audit)
 bpy.ops.object.select_all(action='DESELECT')
 for o in list(scene.objects):o.select_set(True)
 bpy.context.view_layer.objects.active=rig;bpy.ops.export_scene.gltf(filepath=str(dest),export_format='GLB',use_selection=True,export_animations=True,export_animation_mode='ACTIONS',export_skins=True,export_force_sampling=True)
 bpy.ops.wm.save_as_mainfile(filepath=str(reports/f'P2_{a.role}_motion.blend'))
 report={'role':a.role,'bones':len(rig.data.bones),'bodySource':str(source.relative_to(repo)),'bodySha256':hashlib.sha256(source.read_bytes()).hexdigest(),'path':str(dest),'sha256':hashlib.sha256(dest.read_bytes()).hexdigest(),'bounds':bounds,'clips':motion,'motionAudit':audit,'status':'visual candidate; not integrated','gearSource':'Forgotten Knight CC-BY4.0 open helmet and sword'if a.role=='guard'else None}
 (reports/f'{a.role}-motion.json').write_text(json.dumps(report,indent=2))
 if not a.no_render:review(scene,a.role,reports,rig)
 print('NPC_MOTION_COMPLETE',a.role)

if __name__=='__main__':main()
