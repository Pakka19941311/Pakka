import bpy,bmesh,pathlib,json,math,hashlib,sys
from mathutils import Vector,Matrix
from mathutils.bvhtree import BVHTree
import argparse
args_parser=argparse.ArgumentParser()
args_parser.add_argument('--intake',required=True)
args_parser.add_argument('--output',required=True)
args_parser.add_argument('--reports',required=True)
args_parser.add_argument('--repo',required=True)
args=args_parser.parse_args(sys.argv[sys.argv.index('--')+1:])
root=pathlib.Path(args.intake)/'MOB-04-boar-enemies'
bpy.ops.wm.open_mainfile(filepath=str(root/'prepared.blend'),load_ui=False,use_scripts=False)
mesh=bpy.data.objects['Boar'];arm=mesh.find_armature();arm.animation_data.action=bpy.data.actions['Idle'];bpy.context.scene.frame_set(1)
# Replace the separated source crest surface; retain all torso, head and limb weights.
indices={i for i,m in enumerate(mesh.data.materials) if 'Mane' in m.name}
bm=bmesh.new();bm.from_mesh(mesh.data);faces=[f for f in bm.faces if f.material_index in indices];bmesh.ops.delete(bm,geom=faces,context='FACES')
loose=[v for v in bm.verts if not v.link_faces];bmesh.ops.delete(bm,geom=loose,context='VERTS');bm.to_mesh(mesh.data);bm.free();mesh.data.update();bpy.context.view_layer.update()
# Smooth skin retained from source subdivision. Darken existing distal foot surface
# only where both face bounds and bone assignment identify a hoof region.
def mat(name,color,roughness=.9):
 m=bpy.data.materials.new(name);m.use_nodes=True;p=m.node_tree.nodes.get('Principled BSDF');p.inputs['Base Color'].default_value=(*color,1);p.inputs['Roughness'].default_value=roughness;return m
hoofmat=mat('Authored_HoofHorn',(.038,.032,.026),.7);furmat=mat('Authored_Bristles',(.065,.048,.035));earmat=mat('Authored_EarOuter',(.10,.065,.045));innermat=mat('Authored_EarInner',(.18,.12,.105))
graph=bpy.context.evaluated_depsgraph_get();ev=mesh.evaluated_get(graph);data=ev.to_mesh();pts=[ev.matrix_world@v.co for v in data.vertices];polys=[tuple(p.vertices) for p in data.polygons];ev.to_mesh_clear();body_tree=BVHTree.FromPolygons(pts,polys,all_triangles=False)
# Map a desired neutral world coordinate into an existing bone's bind space.
# No object parenting substitutes for skin weights: the joined art has actual groups.
def inverse_skin(point,bone):
 deform=arm.matrix_world@arm.pose.bones[bone].matrix@arm.data.bones[bone].matrix_local.inverted()@arm.matrix_world.inverted()
 return deform.inverted()@Vector(point)
parts=[];records=[]
def piece(name,vertices,faces,bone,materials,face_materials=None,bevel=0.):
 local=[inverse_skin(v,bone) for v in vertices];me=bpy.data.meshes.new(name);me.from_pydata(local,[],faces);me.update();ob=bpy.data.objects.new(name,me);bpy.context.scene.collection.objects.link(ob)
 for m in materials:me.materials.append(m)
 if face_materials:
  for p,index in zip(me.polygons,face_materials):p.material_index=index
 group=ob.vertex_groups.new(name=bone);group.add(list(range(len(vertices))),1.,'REPLACE')
 if bevel:
  bpy.context.view_layer.objects.active=ob;ob.select_set(True);mod=ob.modifiers.new('Authored rounded hoof edge','BEVEL');mod.width=bevel;mod.segments=2;bpy.ops.object.modifier_apply(modifier=mod.name);ob.select_set(False)
 for p in ob.data.polygons:p.use_smooth=True
 parts.append(ob);records.append({'name':name,'bound_to':bone,'vertices':len(ob.data.vertices)})
 return ob
# Short, layered bristles follow the actual evaluated back surface. Their roots
# stay below skin; asymmetric tuft lengths break the prior continuous sail.
for n in range(57):
 y=-.51+n*.019+math.sin(n*2.37)*.004
 for row in [-2,-1,0,1,2]:
  x=row*.013+math.sin(n*1.9+row)*.006
  hit=body_tree.ray_cast(Vector((x,y,2)),Vector((0,0,-1)))
  if hit[0] is None:continue
  z=hit[0].z-.004;h=.009+.012*(.5+.5*math.sin(n*2.1+row*.8));spread=.0011
  bone='neck' if y<-.40 else 'ribs' if y<-.08 else 'spine' if y<.33 else 'hips'
  verts=[(x-spread,y-.006,z),(x+spread,y-.006,z),(x+spread*.7,y+.008,z),(x-spread*.7,y+.008,z),(x+row*.010,y+.013,z+h)]
  piece('Bristle_%02d_%d'%(n,row),verts,[(0,1,4),(1,2,4),(2,3,4),(3,0,4),(3,2,1,0)],bone,[furmat])
# Two rounded horny toes per foot, with a real central cleft. Source toes remain
# as underlying anatomy and are shaded horn-dark below the joint.
foot_names=['hand.L','hand.R','toe.L','toe.R']
for foot in foot_names:
 group_index=mesh.vertex_groups[foot].index
 selected=[(pts[v.index],v.index) for v in mesh.data.vertices if pts[v.index].z<.027 and any(g.group==group_index and g.weight>.55 for g in v.groups)]
 assert selected,foot
 center=sum((p for p,j in selected),Vector())/len(selected)
 for side in [-1,1]:
  cx=center.x+side*.029;cy=center.y-.01;z=.0025;width=.052;depth=.156
  outline=[(-.42,-.48),(.30,-.50),(.50,-.34),(.50,.33),(.32,.50),(-.36,.49),(-.50,.30),(-.50,-.30)]
  vertices=[(cx+xx*width,cy+yy*depth,z+level) for level in [0,.067] for xx,yy in outline]
  # Slightly narrower upper rim creates a coronet/hoof transition.
  for j in range(8,16):vertices[j]=(cx+(vertices[j][0]-cx)*.78,cy+(vertices[j][1]-cy)*.75,vertices[j][2])
  faces=[tuple(reversed(range(8))),tuple(range(8,16))]+[(j,(j+1)%8,(j+1)%8+8,j+8) for j in range(8)]
  piece('ClovenHoof_'+foot+str(side),vertices,faces,foot,[hoofmat],bevel=.006)
mesh.data.materials.append(hoofmat);hoofindex=len(mesh.data.materials)-1
for p in mesh.data.polygons:
 if max(pts[j].z for j in p.vertices)<.095:p.material_index=hoofindex
# Thick curved ears: an outer rim, cupped inner face and rear shell, all skinned
# to the existing head. These are mesh anatomy, not alpha cards.
for side in [-1,1]:
 outline=[(.105,-.46,.85),(.175,-.448,.995),(.265,-.51,1.097),(.29,-.556,1.09),(.254,-.592,1.02),(.192,-.601,.90),(.115,-.574,.82)]
 front=[Vector((side*x,y,z)) for x,y,z in outline];normal=Vector((side*.35,-.92,.15)).normalized();back=[v-normal*.027 for v in front]
 center=sum(front,Vector())/len(front)-normal*.012;backcenter=sum(back,Vector())/len(back)
 verts=[list(v) for v in front+back+[center,backcenter]];faces=[];mi=[]
 for j in range(7):
  k=(j+1)%7;faces.extend([(j,k,14),(j+7,15,k+7),(j,j+7,k+7,k)]);mi.extend([1,0,0])
 ear=piece('ThickEar_'+str(side),verts,faces,'head',[earmat,innermat],mi)
 bpy.context.view_layer.objects.active=ear;ear.select_set(True);sub=ear.modifiers.new('Curved ear cartilage','SUBSURF');sub.levels=2;bpy.ops.object.modifier_apply(modifier=sub.name);ear.select_set(False)
# Small eyes sit on the measured cheek surface; preserve a readable animal face
# after replacing the source flap topology. Both are skinned to head.
eyemat=mat('Authored_BoarEyes',(.008,.006,.004),.16)
for side in [-1,1]:
 hit=body_tree.ray_cast(Vector((side*1.,-.635,.785)),Vector((-side,0,0)))
 assert hit[0] is not None
 center=hit[0]+Vector((side*.006,0,0));verts=[]
 for ring in range(7):
  phi=math.pi*ring/6
  for segment in range(12):
   angle=math.tau*segment/12
   verts.append(center+Vector((math.cos(phi)*.011,math.sin(phi)*math.cos(angle)*.017,math.sin(phi)*math.sin(angle)*.013)))
 faces=[]
 for ring in range(6):
  for segment in range(12):
   j=ring*12+segment;k=ring*12+(segment+1)%12;faces.append((j,k,k+12,j+12))
 piece('Eye_'+str(side),verts,faces,'head',[eyemat])
# Join in bind space; preserve the existing armature and group names.
for o in bpy.context.selected_objects:o.select_set(False)
mesh.select_set(True)
for o in parts:o.select_set(True)
bpy.context.view_layer.objects.active=mesh;bpy.ops.object.join()
# Remove non-rig UV bookkeeping groups and normalize only actual skin weights.
for g in list(mesh.vertex_groups):
 if g.name not in arm.data.bones:mesh.vertex_groups.remove(g)
for v in mesh.data.vertices:
 weights=[(g.group,max(0.,g.weight)) for g in v.groups];total=sum(w for j,w in weights)
 if total:
  for group,w in weights:mesh.vertex_groups[group].add([v.index],w/total,'REPLACE')
mesh.data.validate(verbose=True);bpy.context.view_layer.update()
for o in [mesh,arm]:o.select_set(True)
bpy.ops.export_scene.gltf(filepath=str(root/'anatomy.glb'),export_format='GLB',use_selection=True,export_animations=True,export_animation_mode='BROADCAST',export_skins=True,export_force_sampling=True,export_cameras=False,export_lights=False)
bpy.ops.wm.save_as_mainfile(filepath=str(root/'anatomy.blend'))
graph=bpy.context.evaluated_depsgraph_get();ev=mesh.evaluated_get(graph);me=ev.to_mesh();ps=[ev.matrix_world@v.co for v in me.vertices];ev.to_mesh_clear();lo=Vector([min(v[j] for v in ps) for j in range(3)]);hi=Vector([max(v[j] for v in ps) for j in range(3)]);center=(lo+hi)/2;size=max(hi-lo)
camdata=bpy.data.cameras.new('review');cam=bpy.data.objects.new('review',camdata);bpy.context.scene.collection.objects.link(cam);camdata.type='ORTHO';camdata.ortho_scale=size*1.35;bpy.context.scene.camera=cam
for n,offset in enumerate([(1,-1,2),(-1,-.4,1)]):
 ld=bpy.data.lights.new('review','SUN');ld.energy=1.7 if n==0 else .65;ob=bpy.data.objects.new('review',ld);bpy.context.scene.collection.objects.link(ob);ob.location=center+Vector(offset)*size;ob.rotation_euler=(center-ob.location).to_track_quat('-Z','Y').to_euler()
w=bpy.data.worlds.new('review');w.use_nodes=True;w.node_tree.nodes['Background'].inputs[0].default_value=(.17,.19,.22,1);w.node_tree.nodes['Background'].inputs[1].default_value=.5;bpy.context.scene.world=w
s=bpy.context.scene;s.render.engine='CYCLES';s.cycles.samples=24;s.render.resolution_x=1000;s.render.resolution_y=750;s.render.resolution_percentage=100;s.view_settings.view_transform='Standard'
for name,offset in [('anatomy-review',(1.2,-1.6,.7)),('anatomy-side',(1.7,0,.4))]:
 cam.location=center+Vector(offset)*size;cam.rotation_euler=(center-cam.location).to_track_quat('-Z','Y').to_euler();s.render.filepath=str(root/(name+'.png'));bpy.ops.render.render(write_still=True)
(root/'anatomy-changes.json').write_text(json.dumps({'source':'prepared.blend','output':'anatomy.glb','sha256':hashlib.sha256((root/'anatomy.glb').read_bytes()).hexdigest(),'removed':'source sail-like separated mane surface','authored_parts':records,'skin_policy':'New art bound to existing head, hoof and spine bones in bind space; source rig retained; nonbone UV group removed and true weights normalized.','source_body_subdivision_retained':2,'preview_bounds':[list(lo),list(hi)],'no_rider_no_armor':True,'status':'anatomy candidate; gait not measured yet'},indent=2))
print('BOAR_ANATOMY_DONE',len(records))
