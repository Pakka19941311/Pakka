"""Two distinct MPFB/CC0 visual bases; no population activation.

Requires the pinned city intake and Blender 4.2.3. Idle/walk are explicitly
authored from the project's MPFB motion helper. Combat actions remain gaps.
"""
import argparse,sys,math,json,hashlib,importlib.util
from pathlib import Path
import bpy,bmesh
from mathutils import Vector,Matrix,Quaternion

p=argparse.ArgumentParser();p.add_argument('--skip-render',action='store_true');p.add_argument('--intake',required=True);p.add_argument('--repo',required=True);p.add_argument('--output',required=True);p.add_argument('--reports',required=True);p.add_argument('--mob',choices=['MOB-09','MOB-10'],required=True)
a=p.parse_args(sys.argv[sys.argv.index('--')+1:]);intake=Path(a.intake).resolve();repo=Path(a.repo).resolve();out=Path(a.output).resolve();reports=Path(a.reports).resolve();out.mkdir(parents=True,exist_ok=True);reports.mkdir(parents=True,exist_ok=True)
root=intake/'city-p2';assets=intake/'A03/extracted';suits=root/'suits02/extracted';exile=a.mob=='MOB-09';name='CohortExileBase'if exile else'CohortPoacherBase'
sys.path.insert(0,str(root/'mpfb/extracted/mpfb2-master/src'));bpy.utils.extension_path_user=lambda package,path='',create=False:str(root/'mpfb-session'/path)
import mpfb
bpy.context.preferences.addons.new().module='mpfb';original=mpfb.get_preference;mpfb.get_preference=lambda n:str(root/'mpfb-session')if n=='mpfb_user_data'else original(n);mpfb.register()
from mpfb.services.humanservice import HumanService
from mpfb.services.targetservice import TargetService
from mpfb.entities.objectproperties import HumanObjectProperties
from mpfb.services.exportservice import ExportService
spec=importlib.util.spec_from_file_location('npc_motion',repo/'scripts/assets/city/prepare_npc_motion.py');motion=importlib.util.module_from_spec(spec);spec.loader.exec_module(motion)
bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False)
base=HumanService.create_human();macros={'gender':1.0,'age':.70 if exile else .42,'muscle':.18 if exile else .40,'weight':.18 if exile else .33}
for key,value in macros.items():HumanObjectProperties.set_value(key,value,entity_reference=base)
TargetService.reapply_macro_details(base);skin=next(assets.rglob('young_caucasian_male.mhmat'));HumanService.set_character_skin(str(skin),base,skin_type='GAMEENGINE');rig=HumanService.add_builtin_rig(base,'game_engine')
selected=[]
for pattern,kind in [('low-poly.mhclo','Eyes'),('eyebrow001.mhclo','Eyebrows')]+([]if exile else[('short02.mhclo','Hair')]):
 path=next(assets.rglob(pattern));HumanService.add_mhclo_asset(str(path),base,asset_type=kind,subdiv_levels=0,material_type='GAMEENGINE');selected.append(str(path))
clothes=['donitz_monk_robe','donitz_monk_robe_hood','rehmanpolanski_viking_boots']if exile else['rehmanpolanski_viking_tunic','rehmanpolanski_viking_pants','rehmanpolanski_viking_boots']
for item in clothes:
 path=next(suits.rglob(item+'.mhclo'));HumanService.add_mhclo_asset(str(path),base,asset_type='Clothes',subdiv_levels=0,material_type='GAMEENGINE');selected.append(str(path))
ExportService.bake_modifiers_remove_helpers(base,bake_masks=True,bake_subdiv=True,remove_helpers=True)
bpy.context.view_layer.objects.active=base
if base.data.shape_keys:bpy.ops.object.shape_key_remove(all=True,apply_mix=True)
keep={g.index for g in base.vertex_groups if g.name in ['head','neck_01','hand_l','hand_r']or any(g.name.startswith(prefix)for prefix in ['index_','middle_','ring_','pinky_','thumb_'])}
top=max((base.matrix_world@v.co).z for v in base.data.vertices);visible={v.index for v in base.data.vertices if sum(g.weight for g in v.groups if g.group in keep)>.35 or(base.matrix_world@v.co).z>top-.38}
bm=bmesh.new();bm.from_mesh(base.data);bm.verts.ensure_lookup_table();bmesh.ops.delete(bm,geom=[f for f in bm.faces if not any(v.index in visible for v in f.verts)],context='FACES');bm.to_mesh(base.data);bm.free();base.data.update()
for ob in bpy.context.scene.objects:
 if ob.type!='MESH':continue
 for poly in ob.data.polygons:poly.use_smooth=True
 for material in ob.data.materials:
  if not material or not material.use_nodes:continue
  transparent=any(part in ob.name for part in ['eyebrow','short02']);material.blend_method='CLIP'if transparent else'OPAQUE';material.alpha_threshold=.4
  for shader in [n for n in material.node_tree.nodes if n.type=='BSDF_PRINCIPLED']:
   shader.inputs['Roughness'].default_value=.8
   if not transparent:
    for link in list(shader.inputs['Alpha'].links):material.node_tree.links.remove(link)
    shader.inputs['Alpha'].default_value=1
for image in bpy.data.images:
 if image.size[0]>0 and image.name!='Render Result':
  if max(image.size)>1024:image.scale(int(image.size[0]*1024/max(image.size)),int(image.size[1]*1024/max(image.size)))
  if not image.packed_file:image.pack()
models=[o for o in bpy.context.scene.objects if o.type=='MESH'];pts=[];dg=bpy.context.evaluated_depsgraph_get()
for ob in models:
 ev=ob.evaluated_get(dg);me=ev.to_mesh();pts.extend(ev.matrix_world@v.co for v in me.vertices);ev.to_mesh_clear()
lo=Vector([min(v[i]for v in pts)for i in range(3)]);hi=Vector([max(v[i]for v in pts)for i in range(3)]);target=1.78 if exile else 1.84;factor=target/(hi.z-lo.z)
carrier=bpy.data.objects.new(name,None);bpy.context.scene.collection.objects.link(carrier);rig.parent=carrier;carrier.scale=(factor,)*3;carrier.rotation_euler.z=math.pi;carrier.location.z=-lo.z*factor;bpy.context.view_layer.update()
for action in list(bpy.data.actions):bpy.data.actions.remove(action)
rig.animation_data_create();scene=bpy.context.scene;scene.render.fps=30
for clip,seconds in [('idle',4),('walk',1.4)]:
 action=bpy.data.actions.new(clip);action.use_fake_user=True;rig.animation_data.action=action;frames=round(seconds*30)
 for frame in range(frames+1):
  scene.frame_set(frame);motion.author_pose(rig,'resident',clip,frame/frames)
  # Different resting hand language. These are visual bases, not a promised
  # magic or bow attack: both combat cycles still require dedicated animation.
  if exile:
   for side,sign in [('l',-1),('r',1)]:
    wrist=Vector((sign*.24,.14,1.00+.025*math.sin(frame/frames*math.tau)))
    motion.limb(rig,'upperarm_'+side,'lowerarm_'+side,'hand_'+side,wrist,Vector((0,-1,0)));motion.orient(rig,'hand_'+side,wrist,Vector((0,.25,-1)))
  else:motion.finger_pose(rig,'l',True)
  for pb in rig.pose.bones:pb.keyframe_insert('rotation_quaternion',frame=frame);pb.keyframe_insert('location',frame=frame)
 for fc in action.fcurves:
  for key in fc.keyframe_points:key.interpolation='LINEAR'
rig.animation_data.action=bpy.data.actions['idle'];scene.frame_set(0);bpy.context.view_layer.update()

def material(name,color,metal=0):
 m=bpy.data.materials.new(name);m.use_nodes=True;s=m.node_tree.nodes.get('Principled BSDF');s.inputs['Base Color'].default_value=(*color,1);s.inputs['Roughness'].default_value=.78;s.inputs['Metallic'].default_value=metal;return m
leather=material('Worn leather',(.10,.065,.035));wood=material('Bow wood',(.17,.09,.035));iron=material('Old iron',(.07,.075,.08),.55);linen=material('Undyed bindings',(.25,.23,.19));dark=material('Arrow horn',(.035,.04,.03))

def attach_mesh(label,vertices,faces,bone,mat):
 pose=rig.matrix_world@rig.pose.bones[bone].matrix;rest=motion.world_rest(rig,bone);transform=rig.matrix_world.inverted()@rest@pose.inverted()
 mesh=bpy.data.meshes.new(label);mesh.from_pydata([transform@Vector(v)for v in vertices],[],faces);mesh.update();obj=bpy.data.objects.new(label,mesh);scene.collection.objects.link(obj);obj.parent=rig;obj.matrix_parent_inverse=Matrix.Identity(4);obj.matrix_basis=Matrix.Identity(4);obj.data.materials.append(mat)
 for f in obj.data.polygons:f.use_smooth=True
 obj.vertex_groups.new(name=bone).add(list(range(len(vertices))),1,'REPLACE');obj.modifiers.new('Rigid bone attachment','ARMATURE').object=rig;models.append(obj);return obj

def tube(label,points,radii,bone,mat,sides=10):
 vertices=[];faces=[]
 for i,p in enumerate(points):
  tangent=(Vector(points[min(i+1,len(points)-1)])-Vector(points[max(0,i-1)])).normalized();axis=tangent.cross(Vector((1,0,0)))
  if axis.length<.001:axis=tangent.cross(Vector((0,1,0)))
  axis.normalize();second=tangent.cross(axis).normalized()
  for j in range(sides):vertices.append(Vector(p)+radii[i]*(axis*math.cos(j/sides*math.tau)+second*math.sin(j/sides*math.tau)))
  if i:
   for j in range(sides):faces.append(((i-1)*sides+j,(i-1)*sides+(j+1)%sides,i*sides+(j+1)%sides,i*sides+j))
 faces.extend([tuple(reversed(range(sides))),tuple((len(points)-1)*sides+j for j in range(sides))]);return attach_mesh(label,vertices,faces,bone,mat)

if exile:
 for side in ['l','r']:
  wrist=(rig.matrix_world@rig.pose.bones['hand_'+side].matrix).translation
  points=[wrist+Vector((.052*math.cos(i/20*math.tau),.045*math.sin(i/20*math.tau),.015))for i in range(21)]
  tube('Broken shackle '+side,points,[.011]*21,'hand_'+side,iron)
  for j in range(3):
   center=wrist+Vector((0,0,-.026-j*.033));loop=[center+Vector((.018*math.cos(i/12*math.tau),0,.026*math.sin(i/12*math.tau)))for i in range(13)];tube('Loose iron link '+side+str(j),loop,[.004]*13,'hand_'+side,iron,6)
 tube('Ritual bone token',[(-.035,.12,1.34),(.015,.14,1.23),(.043,.12,1.20)],[.014,.013,.007],'spine_02',linen,8)
else:
 wrist=(rig.matrix_world@rig.pose.bones['hand_l'].matrix).translation;bow=[]
 for i in range(25):
  t=i/24;bow.append(wrist+Vector((0,.15*math.sin(math.pi*t),-.55+t*1.1)))
 tube('Hunting bow',bow,[.012+.006*math.sin(math.pi*i/24)for i in range(25)],'hand_l',wood)
 tube('Bow string',[bow[0],wrist,bow[-1]],[.0018]*3,'hand_l',linen,6)
 tube('Leather quiver',[(.20,-.15,1.03),(.26,-.16,1.57)],[.066,.074],'spine_02',leather,14)
 for j in range(5):
  start=Vector((.20+(j%2)*.024,-.155+(j//2)*.023,1.28));end=start+Vector((.065,0,.45+(j%3)*.04));tube('Arrow shaft '+str(j),[start,end],[.0035,.0035],'spine_02',wood,6)
  tube('Arrow fletching '+str(j),[end-Vector((0,0,.09)),end-Vector((0,0,.055)),end-Vector((0,0,.02))],[.0015,.010,.0015],'spine_02',dark,4)
 # A short back mantle creates a different upper silhouette from the guard.
 vertices=[];faces=[]
 for row in range(9):
  t=row/8
  for col in range(13):
   u=col/12;side=abs(u-.5)*2;span=.32+.32*math.sin(math.pi*min(1,t*1.8)/2);x=(u-.5)*span;y=-.135-.07*t+.035*side*side+.012*math.cos(u*math.tau*4)*t;z=1.53-.51*t-.10*side*(1-t)+.07*side*t;vertices.append((x,y,z))
 for row in range(8):
  for col in range(12):i=row*13+col;faces.append((i,i+1,i+14,i+13))
 cape=attach_mesh('Short hunter mantle',vertices,faces,'spine_02',leather);solid=cape.modifiers.new('Cloth thickness','SOLIDIFY');solid.thickness=.007;bpy.context.view_layer.objects.active=cape;bpy.ops.object.modifier_apply(modifier=solid.name)

scene.frame_set(0);bpy.context.view_layer.update();audit=motion.audit_motion(rig,'resident');bounds=motion.evaluated_bounds(models)
bpy.ops.object.select_all(action='DESELECT')
for obj in [carrier,rig,*models]:obj.select_set(True)
bpy.context.view_layer.objects.active=rig;dest=out/(name+'.glb');bpy.ops.export_scene.gltf(filepath=str(dest),export_format='GLB',use_selection=True,export_animations=True,export_animation_mode='ACTIONS',export_skins=True,export_force_sampling=True)
bpy.ops.wm.save_as_mainfile(filepath=str(reports/(name+'.blend')))
report={'mob_id':a.mob,'name':name,'source':'Pinned MakeHuman/MPFB core + selected Suits02 CC0; conventional authored geometry/poses','macros':macros,'selected_assets':selected,'target_height_m':target,'triangles':sum(sum(len(p.vertices)-2 for p in o.data.polygons)for o in models),'bones':len(rig.data.bones),'bounds':bounds,'sha256':hashlib.sha256(dest.read_bytes()).hexdigest(),'bytes':dest.stat().st_size,'clips':[{'name':'idle','seconds':4,'kind':'authored'},{'name':'walk','seconds':1.4,'kind':'authored'}],'walk_audit':audit,'status':'visual_basis_not_runtime_accepted','gaps':['full_run_attack_hit_death','silhouette_art_acceptance','floor_and_cloth_native_check','rigged_cloak_or_chain_secondary_motion']}
(reports/(name+'.json')).write_bytes((json.dumps(report,indent=2)+'\n').encode())
if not a.skip_render:
 focus=Vector((0,.05,.94));scene.render.engine='CYCLES';scene.cycles.samples=16;scene.cycles.use_denoising=True;scene.render.resolution_x=850;scene.render.resolution_y=1000;scene.render.resolution_percentage=100;scene.view_settings.view_transform='AgX';scene.world=bpy.data.worlds.new('Review');scene.world.use_nodes=True;scene.world.node_tree.nodes['Background'].inputs[0].default_value=(.24,.27,.32,1);scene.world.node_tree.nodes['Background'].inputs[1].default_value=.6
 for label,loc,energy in [('Key',(3,4,5),550),('Rim',(-2,-3,3),400)]:
  data=bpy.data.lights.new(label,'AREA');data.energy=energy;data.size=4;ob=bpy.data.objects.new(label,data);scene.collection.objects.link(ob);ob.location=loc;ob.rotation_euler=(focus-ob.location).to_track_quat('-Z','Y').to_euler()
 data=bpy.data.cameras.new('Review');cam=bpy.data.objects.new('Review',data);scene.collection.objects.link(cam);data.type='ORTHO';data.ortho_scale=2.2;scene.camera=cam
 for view,loc in [('front',(2.5,5,1.7)),('back',(-2.5,-5,1.7))]:
  cam.location=loc;cam.rotation_euler=(focus-cam.location).to_track_quat('-Z','Y').to_euler();scene.render.filepath=str(reports/(name+'-'+view+'.png'));bpy.ops.render.render(write_still=True)
print('COHORT_HUMANOID',json.dumps(report),flush=True)
