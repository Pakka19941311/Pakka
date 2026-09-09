"""Create an editable modular knight from the immutable approved master.
No game files, accepted armor geometry or accepted motion channels are modified.
"""
import argparse,sys,json,gzip,hashlib,math
from pathlib import Path
from collections import defaultdict
import bpy
from mathutils import Vector,Matrix
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'forgotten-knight'))
from build_fitted import create_piece
from export_assets import export_options,select_assets,glb_read


def weights(obj):
 return [{obj.vertex_groups[g.group].name:g.weight for g in v.groups} for v in obj.data.vertices]

def subset(src,faces,name,rig,collection,offset=0):
 coords=[v.co+v.normal*offset for v in src.data.vertices]
 obj=create_piece(src,faces,coords,weights(src),[Matrix.Identity(3)]*len(coords),name,rig,collection)
 obj['license']=src.get('license','CC0');return obj

def material(name,color,texture=None,alpha=False,rough=.65):
 m=bpy.data.materials.new(name);m.use_nodes=True;b=m.node_tree.nodes.get('Principled BSDF');b.inputs['Base Color'].default_value=(*color,1);b.inputs['Roughness'].default_value=rough
 if texture:
  im=bpy.data.images.load(str(texture),check_existing=True);im.pack();t=m.node_tree.nodes.new('ShaderNodeTexImage');t.image=im;m.node_tree.links.new(t.outputs['Color'],b.inputs['Base Color'])
  if alpha:m.node_tree.links.new(t.outputs['Alpha'],b.inputs['Alpha']);m.surface_render_method='DITHERED';m.use_transparency_overlap=False
 return m

def full_morph(work):
 p=work/'human-base-source';info=json.loads((p/'prepared/athletic_male_hm08.json').read_text());v=[]
 for line in (p/'upstream/src/mpfb/data/3dobjs/base.obj').read_text().splitlines():
  a=line.split()
  if a and a[0]=='v':v.append(Vector(tuple(map(float,a[1:4]))))
 for name,w in info['recipe'].items():
  for line in gzip.open(p/'upstream/src/mpfb/data/targets'/name,'rt'):
   a=line.split()
   if a and not a[0].startswith('#'):v[int(a[0])]+=Vector(tuple(map(float,a[1:4])))*w
 return v,info

def proxy(path,name,mat,rig,coll,raw,info):
 uv=[];faces=[];n=0
 for line in path.with_suffix('.obj').read_text().splitlines():
  a=line.split()
  if not a:continue
  if a[0]=='v':n+=1
  if a[0]=='vt':uv.append(tuple(map(float,a[1:3])))
  if a[0]=='f':faces.append([tuple(int(x)-1 for x in c.split('/')[:2]) for c in a[1:]])
 rows=[];reading=False;scales=[1,1,1]
 for line in path.read_text().splitlines():
  a=line.split()
  if not a or a[0].startswith('#'):continue
  if a[0] in ['x_scale','y_scale','z_scale']:
   k='xyz'.index(a[0][0]);scales[k]=abs(raw[int(a[1])][k]-raw[int(a[2])][k])/float(a[3])
  if a[0]=='verts':reading=True;continue
  if reading:
   if not a[0].lstrip('-').isdigit():break
   if len(a)==1:q=raw[int(a[0])].copy()
   else:q=sum((raw[int(a[i])]*float(a[i+3]) for i in range(3)),Vector())+Vector(tuple(float(a[i+6])*scales[i] for i in range(3)))
   s=info['source_to_blender_scale'];rows.append((q.x*s,-q.z*s,q.y*s+info['source_y_to_ground_shift_m']))
 if len(rows)!=n:raise RuntimeError((name,len(rows),n))
 mesh=bpy.data.meshes.new(name);mesh.from_pydata(rows,[],[[x[0] for x in f] for f in faces]);mesh.update();layer=mesh.uv_layers.new(name='UVMap')
 for p,f in zip(mesh.polygons,faces):
  p.use_smooth=True
  for li,c in zip(p.loop_indices,f):layer.data[li].uv=uv[c[1]]
 o=bpy.data.objects.new(name,mesh);coll.objects.link(o);o.data.materials.append(mat);o.parent=rig;g=o.vertex_groups.new(name='mixamorig:Head');g.add(list(range(n)),1,'REPLACE');o.modifiers.new('HeadSkin','ARMATURE').object=rig;o['license']='CC0';return o

def action_digest(action):
 return hashlib.sha256(json.dumps([(f.data_path,f.array_index,[(tuple(k.co),k.interpolation) for k in f.keyframe_points]) for f in action.fcurves]).encode()).hexdigest()

def combos(rig):
 """Five linked normalized attack cycles; zero damage callbacks."""
 scene=bpy.context.scene;bones=list(rig.pose.bones)
 specs=[([('sword_strike_a',0,13),('sword_recovery_a',0,29)],9),([('sword_strike_b',0,16),('sword_recovery_b',0,31)],11),([('sword_strike_c',0,60)],20),([('sword_attack',0,46)],13),([('sword_attack_heavy',0,40)],23)]
 samples=[]
 for parts,contact in specs:
  poses=[]
  for name,start,end in parts:
   rig.animation_data.action=bpy.data.actions[name]
   for f in range(start,end+1):
    scene.frame_set(f);poses.append([(b.rotation_quaternion.copy(),b.location.copy(),Vector(b.rotation_euler)) for b in bones])
  def mix(a,b,t):return [(x[0].slerp(y[0],t),x[1].lerp(y[1],t),x[2].lerp(y[2],t)) for x,y in zip(a,b)]
  row=[]
  for f in range(31):
   u=f/30;src=(u/.5*contact) if u<=.5 else contact+(u-.5)/.5*(len(poses)-1-contact)
   i=min(int(src),len(poses)-1);row.append(mix(poses[i],poses[min(i+1,len(poses)-1)],src-i))
  samples.append(row)
 boundaries=[mix(samples[i][-1],samples[(i+1)%5][0],.5) for i in range(5)]
 for i,rows in enumerate(samples):
  for f in range(4):
   u=f/3;t=u*u*(3-2*u);rows[f]=mix(boundaries[(i-1)%5],rows[f],t)
  for f in range(27,31):
   u=(f-27)/3;t=u*u*(3-2*u);rows[f]=mix(rows[f],boundaries[i],t)
  a=bpy.data.actions.new(f'combo_{i+1:02d}');a.use_fake_user=True;a['normalized_duration']=1.0;a['contact_phase']=.5;a['loop']=False;a['source']='Quaternius CC0; normalized and linked for Varendor';rig.animation_data.action=a
  for f,pose in enumerate(rows):
   for b,(q,loc,euler) in zip(bones,pose):
    if b.name.startswith('cape_'):b.rotation_euler=euler;b.keyframe_insert('rotation_euler',frame=f,group=b.name)
    else:b.rotation_quaternion=q;b.keyframe_insert('rotation_quaternion',frame=f,group=b.name)
    if b.name=='mixamorig:Hips':b.location=loc;b.keyframe_insert('location',frame=f,group=b.name)
  for fc in a.fcurves:
   for k in fc.keyframe_points:k.interpolation='LINEAR'
 return {'clips':[f'combo_{i:02d}' for i in range(1,6)],'normalized_duration_seconds':1.0,'visual_contact_phase':.5,'damage_events_authored':0,'timing_owner':'existing authoritative attack timer; this package does not change it','sequence':'advance on each authorized strike, wrap 5 to 1; can stop after any strike','boundaries':'neighbor endpoint poses identical, short eased boundary blends','source_segments':specs}


def set_loadout(objects,items):
 items=set(items)
 for o in objects:
  if o.type!='MESH':continue
  visible=False
  if o.get('item_id'):visible=o['item_id'] in items
  elif o.get('body_region'):
   region=o['body_region'];visible=True
   if region=='reference':visible=False
   if region in ['head','eyes','brows'] and 'helmet_closed' in items:visible=False
   if region=='hair' and any(i.startswith('helmet') for i in items):visible=False
   if region in ['torso','upperarms'] and 'armor_chest' in items:visible=False
   if region in ['forearms','hands'] and 'armor_gloves' in items:visible=False
   if region=='feet' and 'armor_boots' in items:visible=False
   if region=='calves':visible='armor_chest' in items and 'armor_boots' not in items
  elif o.get('starter_pants'):visible='armor_chest' not in items
  o.hide_render=not visible;o.hide_set(not visible)

def main():
 ap=argparse.ArgumentParser();ap.add_argument('--workspace',required=True);ap.add_argument('--output',required=True);ap.add_argument('--render',action='store_true');args=ap.parse_args(sys.argv[sys.argv.index('--')+1:]);w=Path(args.workspace);out=Path(args.output);out.mkdir(parents=True,exist_ok=True)
 bpy.ops.wm.open_mainfile(filepath=str(w/'knight-v2/accepted/Accepted_Knight_Master.blend'),use_scripts=False)
 rig=bpy.data.objects['FK_Humanoid_Rig'];body=bpy.data.objects['FK_Base_Body'];coll=bpy.data.collections['Forgotten_Knight_Fitted'];scene=bpy.context.scene
 accepted={a.name:action_digest(a) for a in bpy.data.actions};rig.animation_data.action=None;rig.data.pose_position='REST';bpy.context.view_layer.update()
 mh=w/'knight-v2/sources/makehuman';skin=material('Human_Skin_CC0',(1,1,1),mh/'skins/young_caucasian_male/young_lightskinned_male_diffuse.png',rough=.57);body.data.materials.clear();body.data.materials.append(skin);body['body_region']='reference'
 regions=defaultdict(list)
 for p in body.data.polygons:
  q=p.center;groups=defaultdict(float)
  for i in p.vertices:
   for g in body.data.vertices[i].groups:groups[body.vertex_groups[g.group].name]+=g.weight
  bone=max(groups,key=groups.get)
  if q.z>1.57:r='head'
  elif 'Hand' in bone:r='hands'
  elif 'ForeArm' in bone:r='forearms'
  elif bone.endswith('Arm'):r='upperarms'
  elif q.z<.15:r='feet'
  elif q.z<.52:r='calves'
  elif q.z<1.10:continue
  else:r='torso'
  regions[r].append(p.index)
 for region,faces in regions.items():o=subset(body,faces,'body_'+region,rig,coll);o['body_region']=region
 pantsfaces=[p.index for p in body.data.polygons if .14<=p.center.z<1.105 and abs(p.center.x)<.34]
 pants=subset(body,pantsfaces,'starter_pants',rig,coll,.018);pants['starter_pants']=True;pants.data.materials.clear();pants.data.materials.append(material('Starter_Linen',(.075,.062,.043),rough=.9))
 # Level the cut waist boundary and overlap the torso seam.
 edge_use=defaultdict(int)
 for poly in pants.data.polygons:
  for edge in poly.edge_keys:edge_use[tuple(sorted(edge))]+=1
 waist={i for edge,n in edge_use.items() if n==1 and all(pants.data.vertices[j].co.z>1.0 for j in edge) for i in edge}
 for i in waist:pants.data.vertices[i].co.z=1.13
 # A small hem thickness and geometric folds, retaining inherited anatomical weights.
 for v in pants.data.vertices:
  q=v.co;fold=.0025*math.sin(q.z*82+abs(q.x)*19)*math.sin(q.z*13)**2;v.co+=v.normal*fold
 sol=pants.modifiers.new('Cloth_Thickness','SOLIDIFY');sol.thickness=.004
 bpy.context.view_layer.objects.active=pants;bpy.ops.object.modifier_apply(modifier=sol.name)
 raw,info=full_morph(w)
 for path,name,mat,region in [(mh/'hair/short02/short02.mhclo','FK_human_hair',material('Hair_CC0',(1,1,1),mh/'hair/short02/short02_diffuse.png',True), 'hair'),(mh/'eyes/low-poly/low-poly.mhclo','FK_human_eyes',material('Eyes_CC0',(1,1,1),mh/'eyes/materials/brown_eye.png',rough=.22),'eyes'),(mh/'eyebrows/eyebrow001/eyebrow001.mhclo','FK_human_brows',material('Brows_CC0',(1,1,1),mh/'eyebrows/eyebrow001/eyebrow001.png',True),'brows')]:proxy(path,name,mat,rig,coll,raw,info)['body_region']=region
 helm=bpy.data.objects['FK_head_helmet'];faces=[]
 for p in helm.data.polygons:
  q=p.center
  if q.z>1.795 or (q.y>.005 and q.z>1.69) or (abs(q.x)>.085 and q.z>1.70):faces.append(p.index)
 opened=subset(helm,faces,'head_open_helmet',rig,coll);opened['item_id']='helmet_open';opened['equipment_slot']='head'
 items=defaultdict(list)
 for o in coll.objects:
  if o.type!='MESH' or o.get('body_region') or o.get('starter_pants'):continue
  slot=o.get('equipment_slot','');item=o.get('item_id') or ('helmet_closed' if slot=='head' else 'sword' if slot=='weapon' else 'armor_'+slot)
  o['item_id']=item;items[item].append(o.name)
 rig.data.pose_position='POSE';combo=combos(rig)
 for name,d in accepted.items():assert action_digest(bpy.data.actions[name])==d,'Accepted motion changed: '+name
 # Unpack copies without removing packed textures from the editable master.
 tex=out/'Textures';tex.mkdir(exist_ok=True)
 for im in bpy.data.images:
  if im.packed_file:
   (tex/Path(im.filepath or im.name).name).write_bytes(im.packed_file.data)
 rig.animation_data.action=bpy.data.actions['idle'];scene.frame_set(22);scene.frame_start=0;scene.frame_end=75
 objects=list(coll.objects);set_loadout(objects,[])
 bpy.ops.wm.save_as_mainfile(filepath=str(out/'Varendor_Knight_Modular_Master.blend'))
 manifest={'default_loadout':[],'starter':'human body, eyes, hair, brows and plain pants; no armor','items':dict(items),'body_regions':{o.name:o.get('body_region') for o in objects if o.get('body_region')},'starter_pants':pants.name,'combo':combo,'accepted_actions_unchanged':accepted,'body_height_m':1.84,'bone_count':56,'closed_helmet_faces':len(helm.data.polygons),'open_helmet_faces':len(opened.data.polygons),'scope':'art asset and isolated Godot review only; no game combat/inventory edits'}
 (out/'knight_manifest.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2))
 # One modular GLB contains all pieces on a single shared skin. Review controller
 # applies default body visibility immediately; standalone starter export is also provided.
 allmeshes=[o for o in objects if o.type=='MESH' and o!=body]
 rig.location.z=0
 for filename,meshlist in [('Knight_Modular.glb',allmeshes),('Knight_Starter.glb',[o for o in allmeshes if not o.hide_render])]:
  select_assets(meshlist,rig);bpy.ops.export_scene.gltf(filepath=str(out/filename),**export_options())
  doc,_=glb_read(out/filename);assert len(doc.get('animations',[]))==29
 rig.location.z=.02
 if args.render:
  scene.render.engine='CYCLES';scene.cycles.samples=12;scene.render.resolution_x=760;scene.render.resolution_y=1000;scene.camera.data.ortho_scale=2.45
  for label,load in [('Starter',[]),('Helmet_Open',['helmet_open']),('Helmet_Closed',['helmet_closed']),('Armored_Open',['helmet_open','armor_chest','armor_gloves','armor_boots','armor_belt','sword'])]:
   set_loadout(objects,load);rig.animation_data.action=bpy.data.actions['idle'];scene.frame_set(22);scene.render.filepath=str(out/(label+'.png'));bpy.ops.render.render(write_still=True)
 print('V2_ASSETS_READY',out,flush=True)

if __name__=='__main__':main()
