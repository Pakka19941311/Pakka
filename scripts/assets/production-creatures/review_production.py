"""Neutral Blender review of runtime GLBs, not a native gameplay acceptance."""
import bpy,math,json
from pathlib import Path
from mathutils import Vector
repo=Path(__file__).resolve().parents[3];out=repo/'art/production-creatures/review';out.mkdir(parents=True,exist_ok=True)
def setup():
 bpy.ops.wm.read_factory_settings(use_empty=True);s=bpy.context.scene
 s.render.engine='CYCLES';s.cycles.samples=16;s.cycles.use_denoising=True;s.render.resolution_x=1400;s.render.resolution_y=900;s.render.resolution_percentage=100;s.view_settings.view_transform='AgX'
 s.world=bpy.data.worlds.new('Neutral daylight');s.world.use_nodes=True;s.world.node_tree.nodes['Background'].inputs[0].default_value=(.28,.34,.4,1);s.world.node_tree.nodes['Background'].inputs[1].default_value=.5
 bpy.ops.mesh.primitive_plane_add(size=100);floor=bpy.context.object;m=bpy.data.materials.new('Warm grey floor');m.diffuse_color=(.22,.23,.21,1);floor.data.materials.append(m)
 bpy.ops.object.light_add(type='AREA',location=(1,-4,9));bpy.context.object.data.energy=1800;bpy.context.object.data.shape='DISK';bpy.context.object.data.size=7
 return s
def actor(path,x,height,state='idle',phase=0):
 before=set(bpy.data.objects);oldactions=set(bpy.data.actions);bpy.ops.import_scene.gltf(filepath=str(repo/'godot-pc'/path));objects=list(set(bpy.data.objects)-before);rig=next(o for o in objects if o.type=='ARMATURE')
 if rig.animation_data:
  for t in rig.animation_data.nla_tracks:t.mute=True
  action=next((a for a in set(bpy.data.actions)-oldactions if a.name.lower().split('.')[0]==state),None)
  if action:rig.animation_data.action=action;bpy.context.scene.frame_set(round(action.frame_range.x+(action.frame_range.y-action.frame_range.x)*phase))
 bpy.context.view_layer.update();points=[]
 for o in objects:
  if o.type=='MESH' and any(m.type=='ARMATURE'for m in o.modifiers):
   ev=o.evaluated_get(bpy.context.evaluated_depsgraph_get());mesh=ev.to_mesh();points.extend(ev.matrix_world@v.co for v in mesh.vertices);ev.to_mesh_clear()
 zmin=min(p.z for p in points);zmax=max(p.z for p in points);factor=height/(zmax-zmin)
 roots=[o for o in objects if o.parent not in objects];anchor=bpy.data.objects.new('ReviewScaleAnchor',None);bpy.context.scene.collection.objects.link(anchor)
 for root in roots:root.parent=anchor
 anchor.scale=(factor,)*3;anchor.location=(x,0,-zmin*factor)
 return rig
def render(scene,name,loc,focus,scale):
 bpy.ops.object.camera_add(location=loc);cam=bpy.context.object;cam.rotation_euler=(Vector(focus)-cam.location).to_track_quat('-Z','Y').to_euler();cam.data.type='ORTHO';cam.data.ortho_scale=scale;scene.camera=cam;scene.render.image_settings.file_format='PNG';scene.render.filepath=str(out/name);bpy.ops.render.render(write_still=True)
s=setup()
for i,role in enumerate(['guard','resident','worker','woman']):
 folder='production'if role in ['worker','woman']else'motion/assets';actor(f'world-expansion-v3/city/{folder}/P2_{role}_motion.glb',(i-1.5)*1.25,1.8 if role in ['guard','worker']else 1.74)
render(s,'npc-lineup.png',(3,10,3.3),(0,0,1),6)
s=setup();actor('world-expansion-v3/actors/production/V3FacelessSlime.glb',0,.65);render(s,'faceless-slime.png',(1.6,2.2,1.3),(0,0,.26),1.6)
s=setup();actor('world-expansion-v3/actors/alternatives/roach-six/V3RoachSixLeg.glb',1.5,2.05);actor('world-expansion-v3/city/motion/assets/P2_guard_motion.glb',-1.3,2.05);render(s,'beetle-human-scale.png',(6,-10,4),(0,0,1),6)
print('REVIEW_COMPLETE',out)
