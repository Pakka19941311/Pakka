import bpy,json,math
from pathlib import Path
from mathutils import Vector
repo=Path(__file__).resolve().parents[3];rows=[]
for name,path,height in [('FireGolem','generated/actors/FireGolem.glb',6.2),('IceGolem','generated/actors/IceGolem.glb',6.2),('RiftWarden','generated/actors/RiftWarden.glb',10.2),('V3RoachSixLeg','world-expansion-v3/actors/alternatives/roach-six/V3RoachSixLeg.glb',2.05)]:
 bpy.ops.wm.read_factory_settings(use_empty=True);bpy.ops.import_scene.gltf(filepath=str(repo/'godot-pc'/path))
 scene=bpy.context.scene;rig=next(o for o in scene.objects if o.type=='ARMATURE')
 if rig.animation_data:
  for track in rig.animation_data.nla_tracks:track.mute=True
  action=next((a for a in bpy.data.actions if 'idle' in a.name.lower()),None)
  if action:rig.animation_data.action=action;scene.frame_set(int(action.frame_range.x))
 bpy.context.view_layer.update();points=[];core_points=[]
 for obj in scene.objects:
  if obj.type!='MESH' or not any(m.type=='ARMATURE' for m in obj.modifiers):continue
  ev=obj.evaluated_get(bpy.context.evaluated_depsgraph_get());mesh=ev.to_mesh();points.extend(ev.matrix_world@v.co for v in mesh.vertices)
  core_groups={g.index for g in obj.vertex_groups if g.name in ['Hips','Chest','MasterBone','SpineHigh','SpineLow','Shoulder']}
  for vertex in obj.data.vertices:
   if sum(g.weight for g in vertex.groups if g.group in core_groups)>=.6:core_points.append(ev.matrix_world@mesh.vertices[vertex.index].co)
  ev.to_mesh_clear()
 lo=Vector(tuple(min(p[i]for p in points)for i in range(3)));hi=Vector(tuple(max(p[i]for p in points)for i in range(3)));factor=height/(hi.z-lo.z)
 scaled=[Vector((p.x*factor,p.y*factor,(p.z-lo.z)*factor))for p in points]
 feet=[p for p in scaled if p.z<height*.18]
 low=Vector(tuple(min(p[i]for p in feet)for i in range(3)));high=Vector(tuple(max(p[i]for p in feet)for i in range(3)))
 slices={}
 core=[Vector((p.x*factor,p.y*factor,(p.z-lo.z)*factor))for p in core_points]
 if core:slices['weighted_torso']={'bounds':[[min(p[i]for p in core)for i in range(3)],[max(p[i]for p in core)for i in range(3)]],'max_radius':max(math.hypot(p.x,p.y)for p in core),'selection':'sum of Hips/Chest (golem), MasterBone/Spine/Shoulder (roach) weights >= 0.6'}
 for label,minz,maxz in [('contact_5pct',0,.05),('torso_35_60pct',.35,.60)]:
  pts=[p for p in scaled if height*minz<=p.z<=height*maxz]
  slices[label]={'bounds':[[min(p[i]for p in pts)for i in range(3)],[max(p[i]for p in pts)for i in range(3)]],'max_radius':max(math.hypot(p.x,p.y)for p in pts)}
 rows.append({'model':name,'height':height,'source_height':hi.z-lo.z,'scale':factor,'full_width':(hi.x-lo.x)*factor,'full_depth':(hi.y-lo.y)*factor,'lower_18pct_bounds':[list(low),list(high)],'support_radius':max(math.hypot(p.x,p.y)for p in feet),'slices':slices,'head_height':((rig.matrix_world@rig.pose.bones['Head'].head).z-lo.z)*factor if 'Head' in rig.pose.bones else None,'bones':[b.name for b in rig.data.bones],'source':path})
out=repo/'art/production-creatures/size-measurements.json';out.parent.mkdir(parents=True,exist_ok=True);out.write_text(json.dumps(rows,indent=2),encoding='utf-8');print('MEASURED',json.dumps(rows))
