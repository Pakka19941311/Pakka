import bpy,json,pathlib,sys,math
from mathutils import Vector
import argparse
args_parser=argparse.ArgumentParser()
args_parser.add_argument('--intake',required=True)
args_parser.add_argument('--output',required=True)
args_parser.add_argument('--reports',required=True)
args_parser.add_argument('--repo',required=True)
args=args_parser.parse_args(sys.argv[sys.argv.index('--')+1:])
root=pathlib.Path(args.intake)/'MOB-04-boar-enemies'
bpy.ops.wm.open_mainfile(filepath=str(root/'extracted/Boar.blend'),load_ui=False,use_scripts=False)
if bpy.context.object and bpy.context.object.mode!='OBJECT':bpy.ops.object.mode_set(mode='OBJECT')
mesh=bpy.data.objects['Boar'];arm=mesh.find_armature()
print('BOAR_ARM',arm.name,flush=True)
for o in list(bpy.data.objects):
 if o not in [mesh,arm]:bpy.data.objects.remove(o,do_unlink=True)
for o in [mesh,arm]:
 for c in list(o.users_collection):c.objects.unlink(o)
 bpy.context.scene.collection.objects.link(o);o.hide_render=False;o.hide_viewport=False;o.hide_set(False)
arm.animation_data_create()
for t in list(arm.animation_data.nla_tracks):arm.animation_data.nla_tracks.remove(t)
for a in list(bpy.data.actions):
 if a.name not in ['Idle','Walk','Attack','Die']:bpy.data.actions.remove(a)
 else:a.use_fake_user=True
arm.animation_data.action=bpy.data.actions['Idle'];bpy.context.scene.frame_set(1);bpy.context.view_layer.update()
# Explicit contact markers preserve original anatomical toe tips through GLTF,
# whose imported bone display tails otherwise have invented lengths.
bpy.context.view_layer.objects.active=arm;arm.select_set(True)
bpy.ops.object.mode_set(mode='EDIT')
for name,parent in [('ContactFrontL','hand.L'),('ContactFrontR','hand.R'),('ContactBackL','toe.L'),('ContactBackR','toe.R')]:
 source_bone=arm.data.edit_bones[parent];bone=arm.data.edit_bones.new(name);bone.head=source_bone.tail;bone.tail=bone.head+Vector((0,0,.03));bone.parent=source_bone;bone.use_deform=False
bpy.ops.object.mode_set(mode='OBJECT')
materials=[]
for index,old in enumerate(list(mesh.data.materials)):
 mat=bpy.data.materials.new('Boar_'+old.name);mat.use_nodes=True;p=mat.node_tree.nodes.get('Principled BSDF');p.inputs['Roughness'].default_value=.85
 p.inputs['Base Color'].default_value=(.075,.043,.025,1) if 'Mane' in old.name else (.68,.59,.40,1) if 'Fangs' in old.name else (.3,.2,.14,1)
 if 'Fur' in old.name:
  img=bpy.data.images['nowa textura pras.000'];tex=mat.node_tree.nodes.new('ShaderNodeTexImage');tex.image=img;mat.node_tree.links.new(tex.outputs['Color'],p.inputs['Base Color'])
 mesh.data.materials[index]=mat;materials.append({'source_material':old.name,'adapted':mat.name})
# Replace the source's thin connected ear flaps with a closed cheek surface;
# properly thick skinned ears are added by boar_anatomy.py after subdivision.
import bmesh
cage=bmesh.new();cage.from_mesh(mesh.data);cage.verts.ensure_lookup_table()
ear_ids=set(range(117,135))|set(range(286,304))
boundaries=[[49,36,59,84,85,83,82,50],[191,178,201,229,230,228,227,192]]
boundary_verts=[[cage.verts[j] for j in row] for row in boundaries]
uv_layer=cage.loops.layers.uv.active
# Existing body fur UV, taken from a torso face rather than painting a texture.
# Inspect the deformed source cage to select a torso-fur UV patch, not a dark hoof.
sub_for_probe=next(m for m in mesh.modifiers if m.type=='SUBSURF');old_visible=sub_for_probe.show_viewport;sub_for_probe.show_viewport=False;bpy.context.view_layer.update()
ev=mesh.evaluated_get(bpy.context.evaluated_depsgraph_get());probe=ev.to_mesh();posed=[ev.matrix_world@v.co for v in probe.vertices];ev.to_mesh_clear();sub_for_probe.show_viewport=old_visible
candidates=[f for f in cage.faces if f.material_index==0 and not any(v.index in ear_ids for v in f.verts)]
body_face=min(candidates,key=lambda f:(sum((posed[v.index] for v in f.verts),Vector())/len(f.verts)-Vector((.28,.08,.80))).length)
uv_center=sum((l[uv_layer].uv.copy() for l in body_face.loops),Vector((0,0)))/len(body_face.loops)
ear_faces=[f for f in cage.faces if any(v.index in ear_ids for v in f.verts)]
bmesh.ops.delete(cage,geom=ear_faces,context='FACES')
boundary_uv={v:next(loop[uv_layer].uv.copy() for face in v.link_faces for loop in face.loops if loop.vert==v) for row in boundary_verts for v in row}
for vertices in boundary_verts:
 face=cage.faces.new(vertices);face.material_index=0;face.smooth=True
 for n,loop in enumerate(face.loops):
  loop[uv_layer].uv=boundary_uv[loop.vert]
loose=[v for v in cage.verts if not v.link_faces];bmesh.ops.delete(cage,geom=loose,context='VERTS')
bmesh.ops.recalc_face_normals(cage,faces=list(cage.faces));cage.to_mesh(mesh.data);cage.free();mesh.data.update()
# Preserve the source subdivision design as geometry supported by GLTF.
bpy.context.view_layer.objects.active=mesh;mesh.select_set(True)
sub=next(m for m in mesh.modifiers if m.type=='SUBSURF');sub.levels=2;sub.render_levels=2
bpy.ops.object.modifier_apply(modifier=sub.name)
mesh.data.validate(verbose=True)
for a in bpy.data.actions:arm.animation_data.action=a;bpy.context.scene.frame_set(int(a.frame_range[0]))
arm.animation_data.action=bpy.data.actions['Idle'];bpy.context.scene.frame_set(1);bpy.context.view_layer.update()
for o in [mesh,arm]:o.select_set(True)
bpy.ops.export_scene.gltf(filepath=str(root/'prepared.glb'),export_format='GLB',use_selection=True,export_animations=True,export_animation_mode='BROADCAST',export_skins=True,export_force_sampling=True,export_cameras=False,export_lights=False)
bpy.ops.wm.save_as_mainfile(filepath=str(root/'prepared.blend'))
graph=bpy.context.evaluated_depsgraph_get();ev=mesh.evaluated_get(graph);data=ev.to_mesh();points=[ev.matrix_world@v.co for v in data.vertices];ev.to_mesh_clear();lo=Vector([min(p[i] for p in points) for i in range(3)]);hi=Vector([max(p[i] for p in points) for i in range(3)]);center=(lo+hi)/2;size=max(hi-lo)
camdata=bpy.data.cameras.new('review');cam=bpy.data.objects.new('review',camdata);bpy.context.scene.collection.objects.link(cam);camdata.type='ORTHO';camdata.ortho_scale=size*1.4;cam.location=center+Vector((1.2,-1.6,.7))*size;cam.rotation_euler=(center-cam.location).to_track_quat('-Z','Y').to_euler();bpy.context.scene.camera=cam
for i,offset in enumerate([(1,-1,2),(-1,-.4,1)]):
 d=bpy.data.lights.new('review','SUN');d.energy=1.7 if i==0 else .7;l=bpy.data.objects.new('review',d);bpy.context.scene.collection.objects.link(l);l.location=center+Vector(offset)*size;l.rotation_euler=(center-l.location).to_track_quat('-Z','Y').to_euler()
w=bpy.data.worlds.new('review');w.use_nodes=True;w.node_tree.nodes.get('Background').inputs[0].default_value=(.17,.19,.22,1);w.node_tree.nodes.get('Background').inputs[1].default_value=.5;bpy.context.scene.world=w
s=bpy.context.scene;s.render.engine='CYCLES';s.cycles.samples=16;s.render.resolution_x=960;s.render.resolution_y=720;s.render.resolution_percentage=100;s.view_settings.view_transform='Standard';s.render.filepath=str(root/'review.png');bpy.ops.render.render(write_still=True)
(root/'preparation.json').write_text(json.dumps({'source':str(root/'extracted/Boar.blend'),'selected_mesh':'Boar','selected_rig':arm.name,'bounds':[list(lo),list(hi)],'dimensions':list(hi-lo),'forward':'inspect image and source rig before normalizing','materials':materials,'source_subdivision_baked':2,'actions':[{ 'name':a.name,'frames':list(a.frame_range)} for a in bpy.data.actions]},indent=2))
