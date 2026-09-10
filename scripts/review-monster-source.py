"""Render actual Blender poses for review; no source edits are saved."""
import bpy,sys,math
from pathlib import Path
from mathutils import Vector
args=sys.argv[sys.argv.index('--')+1:]
source,output=Path(args[0]).resolve(),Path(args[1]).resolve();output.mkdir(parents=True,exist_ok=True)
bpy.ops.wm.open_mainfile(filepath=str(source),load_ui=False,use_scripts=False)
scene=bpy.context.scene;scene.render.engine='CYCLES';scene.cycles.samples=24;scene.cycles.use_denoising=True
scene.view_settings.view_transform='AgX';scene.view_settings.exposure=0;scene.view_settings.gamma=1
scene.render.resolution_x=800;scene.render.resolution_y=900;scene.render.resolution_percentage=100
scene.world=bpy.data.worlds.new('Review studio');scene.world.use_nodes=True;scene.world.node_tree.nodes['Background'].inputs[0].default_value=(.12,.15,.19,1)
objects=[o for o in scene.objects if o.type=='MESH']
coords=[o.matrix_world@Vector(c) for o in objects for c in o.bound_box]
lo=Vector(tuple(min(v[i] for v in coords) for i in range(3)));hi=Vector(tuple(max(v[i] for v in coords) for i in range(3)))
height=hi.z-lo.z;center=(lo+hi)*.5
camera=bpy.data.objects.new('Review camera',bpy.data.cameras.new('Review camera'));scene.collection.objects.link(camera);camera.location=center+Vector((height*.85,-height*1.9,height*.35))
camera.rotation_euler=(center-camera.location).to_track_quat('-Z','Y').to_euler();camera.data.type='ORTHO';camera.data.ortho_scale=max(height,(hi.x-lo.x)*1.05)*1.22;camera.data.clip_end=height*30;camera.data.clip_start=height*.0001;scene.camera=camera
for offset,power,size in [((.7,-.8,1.3),1800,.65),((-.8,-.2,.7),1000,.7),((.3,.6,1),2300,.4)]:
 lamp=bpy.data.objects.new('Review light',bpy.data.lights.new('Review light','AREA'));scene.collection.objects.link(lamp);lamp.location=center+Vector(offset)*height
 lamp.data.energy=power*height*height/40;lamp.data.shape='DISK';lamp.data.size=size*height;lamp.rotation_euler=(center-lamp.location).to_track_quat('-Z','Y').to_euler()
rig=next(o for o in scene.objects if o.type=='ARMATURE')
for name,fraction in [('Idle',.25),('Walk',.5),('Attack',.42),('Death',.90)]:
 action=bpy.data.actions.get(name)
 if not action:continue
 rig.animation_data.action=action;scene.frame_set(round(action.frame_range.x+(action.frame_range.y-action.frame_range.x)*fraction))
 scene.render.filepath=str(output/(name+'.png'));bpy.ops.render.render(write_still=True)
