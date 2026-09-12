"""Original asymmetrical, faceless crawling slime; editable mesh/rig/actions.
No third-party geometry or generated bitmap. Reproduce with checked Blender.
"""
import bpy,math,json,hashlib
from pathlib import Path
from mathutils import Vector
repo=Path(__file__).resolve().parents[3]
out=repo/'godot-pc/world-expansion-v3/actors/production';out.mkdir(parents=True,exist_ok=True)
art=repo/'art/production-creatures';art.mkdir(parents=True,exist_ok=True)
bpy.ops.wm.read_factory_settings(use_empty=True)
scene=bpy.context.scene;scene.render.fps=30
verts=[];faces=[];segments=64;rings=22
# A low flowing mantle with four unequal lobes and an extended leading lip.
for ring in range(rings+1):
 t=ring/rings;theta=t*math.pi/2
 for j in range(segments):
  a=j*math.tau/segments
  lobes=1+.10*math.sin(3*a+.6)+.045*math.cos(7*a)
  front=max(0,math.sin(a))**8
  radius=.50*math.sin(theta)**.78*lobes+.16*front*t**3
  x=radius*math.cos(a);y=radius*math.sin(a)*.88
  z=.65*math.cos(theta)**1.35*(1+.025*math.sin(3*a)*math.sin(theta))
  verts.append((x,y,z))
for r in range(rings):
 for j in range(segments):
  a=r*segments+j;b=r*segments+(j+1)%segments;c=(r+1)*segments+(j+1)%segments;d=(r+1)*segments+j
  faces.append((a,b,c,d))
center=len(verts);verts.append((0,0,0))
for j in range(segments):faces.append((center,rings*segments+(j+1)%segments,rings*segments+j))
mesh=bpy.data.meshes.new('SlimeMantleMesh');mesh.from_pydata(verts,[],faces);mesh.update()
body=bpy.data.objects.new('Faceless_Mantle',mesh);scene.collection.objects.link(body)
for p in mesh.polygons:p.use_smooth=True
material=bpy.data.materials.new('Wet_peat_gel');material.use_nodes=True
nodes=material.node_tree.nodes;links=material.node_tree.links;bsdf=nodes.get('Principled BSDF')
bsdf.inputs['Base Color'].default_value=(.045,.11,.085,1);bsdf.inputs['Roughness'].default_value=.27;bsdf.inputs['Coat Weight'].default_value=.6
noise=nodes.new('ShaderNodeTexNoise');noise.inputs['Scale'].default_value=13;noise.inputs['Detail'].default_value=3
ramp=nodes.new('ShaderNodeValToRGB');ramp.color_ramp.elements[0].color=(.018,.045,.029,1);ramp.color_ramp.elements[1].color=(.11,.18,.095,1)
links.new(noise.outputs['Fac'],ramp.inputs[0]);links.new(ramp.outputs['Color'],bsdf.inputs['Base Color'])
# Vertex colour survives glTF without relying on unsupported procedural nodes.
colors=mesh.color_attributes.new(name='GelVariation',type='FLOAT_COLOR',domain='CORNER')
for poly in mesh.polygons:
 for li in poly.loop_indices:
  v=mesh.vertices[mesh.loops[li].vertex_index].co;n=.5+.25*math.sin(v.x*25+v.z*12)+.2*math.cos(v.y*31-v.x*11)
  colors.data[li].color=(.032+n*.09,.065+n*.115,.035+n*.07,1)
vertex=nodes.new('ShaderNodeVertexColor');vertex.layer_name='GelVariation';links.new(vertex.outputs['Color'],bsdf.inputs['Base Color'])
body.data.materials.append(material)
rigdata=bpy.data.armatures.new('SlimeFlowRig');rig=bpy.data.objects.new('SlimeFlowRig',rigdata);scene.collection.objects.link(rig)
bpy.context.view_layer.objects.active=rig;rig.select_set(True);bpy.ops.object.mode_set(mode='EDIT')
root=rigdata.edit_bones.new('Root');root.head=(0,0,0);root.tail=(0,0,.15)
core=rigdata.edit_bones.new('Core');core.head=(0,0,.15);core.tail=(0,0,.65);core.parent=root
for i in range(8):
 a=i*math.tau/8;b=rigdata.edit_bones.new('Flow_%d'%i);b.head=(.32*math.cos(a),.30*math.sin(a),0);b.tail=(b.head.x,b.head.y,.30);b.parent=root
bpy.ops.object.mode_set(mode='OBJECT');body.parent=rig
mod=body.modifiers.new('Weighted organic flow','ARMATURE');mod.object=rig
groups={name:body.vertex_groups.new(name=name) for name in ['Root','Core']+['Flow_%d'%i for i in range(8)]}
for v in mesh.vertices:
 h=max(0,min(1,v.co.z/.65));corew=h*.7
 angle=(math.atan2(v.co.y/.88,v.co.x)%math.tau)/math.tau*8;i=int(angle)%8;t=angle-int(angle)
 groups['Core'].add([v.index],corew,'REPLACE');groups['Flow_%d'%i].add([v.index],(1-corew)*(1-t),'REPLACE');groups['Flow_%d'%((i+1)%8)].add([v.index],(1-corew)*t,'REPLACE')
rig.animation_data_create();clips={'idle':3.0,'walk':1.6,'run':1.0,'attack':19/30,'hit':.5,'death':1.6}
for name,duration in clips.items():
 action=bpy.data.actions.new(name);action.use_fake_user=True;rig.animation_data.action=action;count=round(duration*30)
 for f in range(count+1):
  phase=f/count;wave=math.sin(phase*math.tau)
  for b in rig.pose.bones:b.location=(0,0,0);b.scale=(1,1,1)
  core=rig.pose.bones['Core']
  if name in ['idle','walk','run']:
   strength=.018 if name=='idle' else .08
   core.scale=(1-strength*wave,1+strength*wave,1+.04*wave)
   for i in range(8):
    b=rig.pose.bones['Flow_%d'%i];w=math.sin(phase*math.tau-i*math.pi/4)
    b.location.x=strength*.25*math.cos(i*math.pi/4)*w;b.location.y=strength*.4*w;b.scale=(1+.06*w,1-.04*w,1+.1*w)
  elif name=='attack':
   pulse=math.sin(math.pi*min(1,phase/.75))**2 if phase<.75 else 0
   core.location.y=.22*pulse;core.scale=(1-.14*pulse,1+.45*pulse,1+.13*pulse)
   for i in [1,2,3]:rig.pose.bones['Flow_%d'%i].location.y=.17*pulse
  elif name=='hit':core.scale=(1+.14*math.sin(phase*math.pi),1+.10*math.sin(phase*math.pi),1-.27*math.sin(phase*math.pi))
  else:
   collapse=phase*phase*(3-2*phase);core.scale=(1+.6*collapse,1+.7*collapse,max(.10,1-.90*collapse));core.location.z=-.125*collapse
   for i in range(8):rig.pose.bones['Flow_%d'%i].scale=(1+.3*collapse,1+.3*collapse,1-.68*collapse)
  for b in rig.pose.bones:b.keyframe_insert('location',frame=f);b.keyframe_insert('scale',frame=f)
 for fc in action.fcurves:
  for kp in fc.keyframe_points:kp.interpolation='LINEAR'
rig.animation_data.action=bpy.data.actions['idle'];scene.frame_set(0)
bpy.ops.object.select_all(action='DESELECT');body.select_set(True);rig.select_set(True);bpy.context.view_layer.objects.active=rig
dest=out/'V3FacelessSlime.glb'
bpy.ops.export_scene.gltf(filepath=str(dest),export_format='GLB',use_selection=True,export_animations=True,export_animation_mode='ACTIONS',export_skins=True,export_force_sampling=True)
bpy.ops.wm.save_as_mainfile(filepath=str(art/'V3FacelessSlime.blend'))
report={'model':'V3FacelessSlime','height':.65,'width':max(v[0]for v in verts)-min(v[0]for v in verts),'depth':max(v[1]for v in verts)-min(v[1]for v in verts),'triangles':sum(len(f)-2 for f in faces),'bones':10,'clips':clips,'license':'CC0-1.0, original Varendor authored geometry/rig/actions','sha256':hashlib.sha256(dest.read_bytes()).hexdigest()}
(art/'slime-manifest.json').write_text(json.dumps(report,indent=2),encoding='utf-8')
print('SLIME_EXPORTED',json.dumps(report))
