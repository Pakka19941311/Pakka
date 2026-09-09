"""Convert CDmir's approved CC0 source to a packed, animated Godot asset.
Run Blender with --disable-autoexec and this script; no external scripts run.
"""
import bpy,sys,json,math,hashlib
from pathlib import Path
from mathutils import Vector
ROOT=Path(__file__).resolve().parents[1]
args=sys.argv[sys.argv.index('--')+1:] if '--' in sys.argv else []
source=Path(args[0]).resolve() if args else ROOT/'art/monsters-v3/forest/original/forest-monster-final.blend'
out=ROOT/'art/monsters-v3/forest';out.mkdir(parents=True,exist_ok=True)
bpy.ops.wm.open_mainfile(filepath=str(source),load_ui=False,use_scripts=False)
scene=bpy.context.scene;rig=bpy.data.objects['Armature']
for obj in list(bpy.data.objects):
 if obj.name not in ['Armature','Monster','Tree']:bpy.data.objects.remove(obj,do_unlink=True)
rig.animation_data.action=bpy.data.actions['Idle'];scene.frame_set(0)
for name,prefix in [('Monster','forest-monster'),('Tree','tree')]:
 obj=bpy.data.objects[name];obj.hide_viewport=False;obj.hide_render=False;obj.hide_set(False)
 obj.data.validate(clean_customdata=False);obj.data.update()
 # Match the glTF four-weight limit explicitly in the editable source.
 for vertex in obj.data.vertices:
  groups=sorted([(g.group,g.weight) for g in vertex.groups if g.weight>0],key=lambda g:g[1],reverse=True)
  for group,weight in groups[4:]:obj.vertex_groups[group].remove([vertex.index])
  total=sum(w for _,w in groups[:4])
  if total:
   for group,weight in groups[:4]:obj.vertex_groups[group].add([vertex.index],weight/total,'REPLACE')
 mat=bpy.data.materials[name];mat.use_nodes=True;mat.node_tree.nodes.clear();nodes=mat.node_tree.nodes;links=mat.node_tree.links
 shader=nodes.new('ShaderNodeBsdfPrincipled');shader.inputs['Roughness'].default_value=.86
 output=nodes.new('ShaderNodeOutputMaterial');links.new(shader.outputs['BSDF'],output.inputs['Surface'])
 for suffix,socket in [('skin1' if name=='Monster' else '', 'Base Color'),('norm','Normal')]:
  filename=f'{prefix}-{suffix}.png' if suffix else 'tree.png';path=source.parent/'texture'/filename
  image=bpy.data.images.load(str(path),check_existing=True);image.pack();tex=nodes.new('ShaderNodeTexImage');tex.image=image
  if socket=='Normal':
   image.colorspace_settings.name='Non-Color';normal=nodes.new('ShaderNodeNormalMap');normal.inputs['Strength'].default_value=.7;links.new(tex.outputs['Color'],normal.inputs['Color']);links.new(normal.outputs['Normal'],shader.inputs['Normal'])
  else:
   links.new(tex.outputs['Color'],shader.inputs[socket])
   if name=='Tree':
    clip=nodes.new('ShaderNodeMath');clip.operation='ROUND';links.new(tex.outputs['Alpha'],clip.inputs[0]);links.new(clip.outputs[0],shader.inputs['Alpha'])
    mat.use_backface_culling=False
 obj.data.materials.clear();obj.data.materials.append(mat)
 for poly in obj.data.polygons:poly.use_smooth=True
# Preserve the authored rig and IK; the exporter samples evaluated bones.
for action in bpy.data.actions:
 action.use_fake_user=True
 if action.name=='Dying':action.name='Death'
 if action.name=='Melee_Hold':action.name='CombatIdle'
rig.hide_set(False);rig.hide_viewport=False
for obj in bpy.context.selected_objects:obj.select_set(False)
for name in ['Armature','Monster','Tree']:bpy.data.objects[name].select_set(True)
bpy.context.view_layer.objects.active=rig
scene.render.fps=30
scene.frame_set(0)
bpy.ops.wm.save_as_mainfile(filepath=str(out/'ForestLord.blend'))
props={p.identifier for p in bpy.ops.export_scene.gltf.get_rna_type().properties}
options=dict(filepath=str(out/'ForestLord.glb'),export_format='GLB',use_selection=True,export_animations=True,export_skins=True,export_morph=False,export_yup=True,export_apply=False,export_force_sampling=True,export_frame_range=False,export_nla_strips=True)
options={k:v for k,v in options.items() if k in props}
bpy.ops.export_scene.gltf(**options)
report={'source':'https://opengameart.org/content/forest-monster','author':'CDmir / Čestmír Dammer','license':'CC0','changes':['Principled PBR materials with original CC0 diffuse/normal maps','Removed editor rig widgets, camera and lights','Preserved authored rig; normalized four strongest skin weights per vertex; evaluated animation sampling','Packed textures; standalone Blender and GLB'],'vertices':sum(len(bpy.data.objects[n].data.vertices) for n in ['Monster','Tree']),'bones':len(rig.data.bones),'animations':[a.name for a in bpy.data.actions]}
for filename in ['ForestLord.blend','ForestLord.glb']:
 data=(out/filename).read_bytes();report[filename]={'bytes':len(data),'sha256':hashlib.sha256(data).hexdigest()}
(out/'build.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf8')
print(json.dumps(report,ensure_ascii=False))
