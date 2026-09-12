# Reproduces the staged P2 city art from locally cached, hash-checked sources.
# Run with Blender4.2.3 --background --factory-startup --disable-autoexec.
import argparse
import sys
from pathlib import Path
_parser=argparse.ArgumentParser()
_parser.add_argument('--intake',required=True,help='Asset intake root containing city-p2 and A03')
_parser.add_argument('--output',required=True,help='Explicit destination for reproduced GLBs')
_parser.add_argument('--reports',required=True,help='Explicit destination for review images and JSON')
_parser.add_argument('--repo',default=str(Path(__file__).resolve().parents[3]))
_args=_parser.parse_args(sys.argv[sys.argv.index('--')+1:] if '--' in sys.argv else [])
intake=Path(_args.intake).resolve()
root=intake/'city-p2'
repo=Path(_args.repo).resolve()
out=Path(_args.output).resolve();out.mkdir(parents=True,exist_ok=True)
reports=Path(_args.reports).resolve();reports.mkdir(parents=True,exist_ok=True)

import bpy,sys,pathlib,json,math,hashlib,bmesh
from mathutils import Vector,Quaternion
sys.path.insert(0,str(root/'mpfb/extracted/mpfb2-master/src'))
bpy.utils.extension_path_user=lambda package,path='',create=False: str(root/'mpfb-session'/path)
import mpfb
bpy.context.preferences.addons.new().module='mpfb'
original_get_preference=mpfb.get_preference
mpfb.get_preference=lambda name:str(root/'mpfb-session') if name=='mpfb_user_data' else original_get_preference(name)
mpfb.register()
from mpfb.services.humanservice import HumanService
from mpfb.services.targetservice import TargetService
from mpfb.entities.objectproperties import HumanObjectProperties
from mpfb.services.exportservice import ExportService
assets=intake/'A03/extracted'
suits=root/'suits02/extracted'
for role in ['guard','resident']:
 bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False)
 for stale_action in list(bpy.data.actions):bpy.data.actions.remove(stale_action)
 base=HumanService.create_human()
 for key,value in {'gender':1.0,'age':.48 if role=='guard' else .68,'muscle':.68 if role=='guard' else .38,'weight':.48}.items():HumanObjectProperties.set_value(key,value,entity_reference=base)
 TargetService.reapply_macro_details(base)
 HumanService.set_character_skin(str(next(assets.rglob('young_caucasian_male.mhmat'))),base,skin_type='GAMEENGINE')
 rig=HumanService.add_builtin_rig(base,'game_engine')
 selected=[]
 for pattern,kind in [('low-poly.mhclo','Eyes'),('eyebrow001.mhclo','Eyebrows'),('short02.mhclo','Hair')]:
  p=next(assets.rglob(pattern));HumanService.add_mhclo_asset(str(p),base,asset_type=kind,subdiv_levels=0,material_type='GAMEENGINE');selected.append(str(p))
 clothes=['rehmanpolanski_viking_tunic','rehmanpolanski_viking_pants','rehmanpolanski_viking_boots'] if role=='guard' else ['donitz_monk_robe','rehmanpolanski_viking_boots']
 for item in clothes:
  p=next(suits.rglob(item+'.mhclo'));HumanService.add_mhclo_asset(str(p),base,asset_type='Clothes',subdiv_levels=0,material_type='GAMEENGINE');selected.append(str(p))
 ExportService.bake_modifiers_remove_helpers(base,bake_masks=True,bake_subdiv=True,remove_helpers=True)
 bpy.context.view_layer.objects.active=base
 if base.data.shape_keys:bpy.ops.object.shape_key_remove(all=True,apply_mix=True)
 # Both selected costumes cover torso, arms, legs and feet. Strip hidden base body
 # surfaces instead of allowing independently interpolated clothing weights to reveal them.
 # Head/neck and hands/fingers remain the complete visible skin meshes.
 keep_groups={g.index for g in base.vertex_groups if g.name in ['head','neck_01','hand_l','hand_r'] or any(g.name.startswith(p) for p in ['index_','middle_','ring_','pinky_','thumb_'])}
 top_z=max((base.matrix_world@v.co).z for v in base.data.vertices)
 keep_indices={v.index for v in base.data.vertices if sum(g.weight for g in v.groups if g.group in keep_groups)>.35 or (base.matrix_world@v.co).z>top_z-.38}
 bm=bmesh.new();bm.from_mesh(base.data);bm.verts.ensure_lookup_table()
 remove_faces=[f for f in bm.faces if not any(v.index in keep_indices for v in f.verts)]
 bmesh.ops.delete(bm,geom=remove_faces,context='FACES')
 bm.to_mesh(base.data);bm.free();base.data.update()
 for obj in bpy.context.scene.objects:
  if obj.type=='MESH':
   for poly in obj.data.polygons:poly.use_smooth=True
   for mat in obj.data.materials:
    if not mat or not mat.use_nodes:continue
    transparent=any(part in obj.name for part in ['eyebrow','short02'])
    mat.blend_method='CLIP' if transparent else 'OPAQUE'
    mat.alpha_threshold=.4
    if not transparent:
     for bsdf in [n for n in mat.node_tree.nodes if n.type=='BSDF_PRINCIPLED']:
      for link in list(bsdf.inputs['Alpha'].links):mat.node_tree.links.remove(link)
      bsdf.inputs['Alpha'].default_value=1.0
 for im in bpy.data.images:
  if im.size[0]>0 and im.name!='Render Result':
   if max(im.size)>1024:im.scale(int(im.size[0]*1024/max(im.size)),int(im.size[1]*1024/max(im.size)))
   try:im.pack()
   except:pass
 rig.animation_data_create()
 action=bpy.data.actions.new('idle');rig.animation_data.action=action
 # Authored breathing/looking pose only; no source walk or combat animation is claimed.
 rest={b.name:b.matrix_local.to_quaternion() for b in rig.data.bones}
 for frame in range(0,121,10):
  phase=frame/120*math.tau
  for bone in rig.pose.bones:
   bone.rotation_mode='QUATERNION';bone.rotation_quaternion=Quaternion();bone.location=(0,0,0)
  for suffix,angle in [('l',math.radians(30)),('r',-math.radians(30))]:
   pb=rig.pose.bones['upperarm_'+suffix];pb.rotation_quaternion=Quaternion(rest[pb.name].inverted()@Vector((0,1,0)),angle)
  rig.pose.bones['spine_02'].rotation_quaternion=Quaternion((1,0,0),math.sin(phase)*.012)
  rig.pose.bones['head'].rotation_quaternion=Quaternion((0,1,0),math.sin(phase)*.045)
  for bone in rig.pose.bones:bone.keyframe_insert(data_path='rotation_quaternion',frame=frame)
 scene=bpy.context.scene;scene.render.fps=30;scene.frame_start=0;scene.frame_end=120;scene.frame_set(0)
 bpy.context.view_layer.update()
 meshes=[o for o in scene.objects if o.type=='MESH']
 dg=bpy.context.evaluated_depsgraph_get();pts=[]
 for o in meshes:
  ev=o.evaluated_get(dg);me=ev.to_mesh();pts.extend(ev.matrix_world@v.co for v in me.vertices);ev.to_mesh_clear()
 lo=Vector(tuple(min(v[i] for v in pts) for i in range(3)));hi=Vector(tuple(max(v[i] for v in pts) for i in range(3)))
 target=1.8 if role=='guard' else 1.74;factor=target/(hi.z-lo.z)
 par=bpy.data.objects.new('P2_'+role,None);scene.collection.objects.link(par);rig.parent=par;par.scale=(factor,)*3;par.location=Vector((-(hi.x+lo.x)*.5,-(hi.y+lo.y)*.5,-lo.z))*factor
 # Source MakeHuman faces Blender -Y; rotate to +Y = Godot -Z for staged scene.
 par.rotation_euler.z=math.pi
 for o in scene.objects:o.select_set(True)
 bpy.context.view_layer.objects.active=rig
 dest=out/('P2_'+role+'.glb')
 bpy.ops.export_scene.gltf(filepath=str(dest),export_format='GLB',use_selection=True,export_animations=True,export_animation_mode='ACTIONS',export_skins=True,export_force_sampling=True)
 bpy.ops.wm.save_as_mainfile(filepath=str(reports/('P2_'+role+'.blend')))
 center=Vector((0,0,target*.52));camdata=bpy.data.cameras.new('review');cam=bpy.data.objects.new('review',camdata);scene.collection.objects.link(cam);cam.location=(2.5,4,1.5);cam.rotation_euler=(center-cam.location).to_track_quat('-Z','Y').to_euler();camdata.type='ORTHO';camdata.ortho_scale=target*1.3;scene.camera=cam
 scene.world=bpy.data.worlds.new('review');scene.world.use_nodes=True;scene.world.node_tree.nodes['Background'].inputs['Color'].default_value=(.4,.45,.5,1);scene.world.node_tree.nodes['Background'].inputs['Strength'].default_value=.65
 ld=bpy.data.lights.new('key','AREA');ob=bpy.data.objects.new('key',ld);scene.collection.objects.link(ob);ob.location=(2,4,4);ob.rotation_euler=(center-ob.location).to_track_quat('-Z','Y').to_euler();ld.energy=500;ld.shape='DISK';ld.size=4
 scene.render.engine='CYCLES';scene.cycles.samples=16;scene.render.resolution_x=700;scene.render.resolution_y=900;scene.render.resolution_percentage=100;scene.view_settings.view_transform='AgX';scene.render.image_settings.file_format='PNG';scene.render.filepath=str(reports/(role+'-review.png'));bpy.ops.render.render(write_still=True)
 report={'role':role,'source':'MakeHuman MPFB core + system assets + suits02 CC0; no AI generation','selected_assets':selected,'sha256':hashlib.sha256(dest.read_bytes()).hexdigest(),'path':str(dest),'target_height':target,'triangles':sum(sum(len(p.vertices)-2 for p in o.data.polygons) for o in meshes),'bones':len(rig.data.bones),'clips':{'idle':'authored breathing and head glance, 4 seconds; no source animation claim'},'status':'visual candidate; no walking or guard combat readiness claimed'}
 (reports/(role+'-adaptation.json')).write_text(json.dumps(report,indent=2));print('NPC_DONE',role,flush=True)
