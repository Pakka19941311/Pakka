"""Prepare the approved artist models with editable rigs and sampled game clips.

Blender 4.2/4.5, --background --disable-autoexec --python this.py -- SOURCE_DIR [names].
No source scripts run. No generative service receives any artist mesh or texture.
"""
import bpy, bmesh, sys, math, json, hashlib, re
from pathlib import Path
from mathutils import Vector, Matrix, Quaternion
from math import sin, cos, pi
ROOT=Path(__file__).resolve().parents[1]
args=sys.argv[sys.argv.index('--')+1:]; SOURCE=Path(args[0]).resolve()
NAMES=args[1:] or ['IceGolem','FireGolem','RiftWarden','HellforgedWarden','Werewolf','GiantBat','Zombie','SkeletonV3','WraithV3']
OUT=ROOT/'art/monsters-v3'; (OUT/'runtime').mkdir(parents=True,exist_ok=True);(OUT/'editable').mkdir(parents=True,exist_ok=True)
HEIGHT={'IceGolem':3.1,'FireGolem':3.1,'RiftWarden':5.1,'HellforgedWarden':2.8,'Werewolf':3.2,'GiantBat':1.6,'Zombie':1.92,'SkeletonV3':1.92,'WraithV3':2.15}
TRIS={'FireGolem':24000,'RiftWarden':36000,'Werewolf':26000,'GiantBat':22000}
def select(objects):
 bpy.ops.object.select_all(action='DESELECT')
 for o in objects:o.hide_set(False);o.select_set(True)
 bpy.context.view_layer.objects.active=objects[0]
def bounds(objects,evaluated=False):
 dg=bpy.context.evaluated_depsgraph_get();p=[]
 for o in objects:
  v=o.evaluated_get(dg) if evaluated else o
  if len(v.data.vertices):p.extend(v.matrix_world@c.co for c in v.data.vertices)
 return Vector(tuple(min(v[i] for v in p) for i in range(3))),Vector(tuple(max(v[i] for v in p) for i in range(3)))
def mat(name,color,metal=0,rough=.8):
 m=bpy.data.materials.new(name);m.diffuse_color=(*color,1);m.use_nodes=True;p=m.node_tree.nodes.get('Principled BSDF');p.inputs['Base Color'].default_value=(*color,1);p.inputs['Metallic'].default_value=metal;p.inputs['Roughness'].default_value=rough;return m
def clear_anim(rig):
 rig.animation_data_create();rig.animation_data.action=None
 for t in list(rig.animation_data.nla_tracks):rig.animation_data.nla_tracks.remove(t)
def fit_rig(name,mesh,h):
 # Coordinates are fractions of body height, measured from the approved source views.
 # Blender forward -Y, Z up. Separate fitting for squat, digitigrade and winged bodies.
 if name in ['FireGolem','RiftWarden']:
  points={'hips':(0,.025,.46),'chest':(0,.005,.70),'neck':(0,-.065,.79),'head':(0,-.085,.90),'shoulder':(.30,0,.75),'elbow':(.375,-.015,.53),'wrist':(.40,-.065,.32),'fingers':(.405,-.10,.225),'hip':(.14,.025,.46),'knee':(.175,-.015,.265),'ankle':(.18,.0,.09),'toe':(.19,-.145,.045)}
 elif name=='IceGolem':
  points={'hips':(0,.11,.43),'chest':(0,.06,.66),'neck':(0,-.095,.70),'head':(0,-.18,.81),'shoulder':(.27,.0,.68),'elbow':(.30,-.09,.41),'wrist':(.35,-.24,.18),'fingers':(.36,-.31,.12),'hip':(.17,.12,.43),'knee':(.20,.10,.24),'ankle':(.20,.16,.075),'toe':(.20,-.04,.055)}
 elif name=='HellforgedWarden':
  points={'hips':(0,.38,.49),'chest':(0,-.24,.56),'neck':(0,-.40,.48),'head':(0,-.63,.43),'shoulder':(.36,-.25,.53),'elbow':(.44,-.45,.26),'wrist':(.49,-.64,.065),'fingers':(.5,-.82,.04),'hip':(.16,.37,.48),'knee':(.22,.66,.24),'ankle':(.23,.60,.055),'toe':(.23,.49,.035)}
 elif name=='Werewolf':
  points={'hips':(.055,.08,.49),'chest':(.005,.035,.73),'neck':(-.10,-.015,.81),'head':(-.22,-.09,.85),'shoulder':(.245,.04,.79),'elbow':(.33,-.015,.64),'wrist':(.36,-.08,.515),'fingers':(.28,-.12,.47),'hip':(.18,.09,.49),'knee':(.24,-.005,.29),'ankle':(.275,.11,.12),'toe':(.285,-.055,.045)}
 else:
  points={'hips':(0,.04,.25),'chest':(0,0,.52),'neck':(0,-.05,.60),'head':(0,-.11,.70),'shoulder':(.12,.015,.58),'elbow':(.30,0,.82),'wrist':(.34,-.025,.89),'fingers':(.67,-.015,.90),'hip':(.08,.06,.26),'knee':(.12,.025,.17),'ankle':(.10,.04,.06),'toe':(.105,-.05,.025)}
 p={k:Vector(v)*h for k,v in points.items()}
 data=bpy.data.armatures.new(name+'_Skeleton');rig=bpy.data.objects.new(name+'_Rig',data);bpy.context.collection.objects.link(rig);select([rig]);bpy.ops.object.mode_set(mode='EDIT')
 def bone(n,a,b,parent=None):
  v=data.edit_bones.new(n);v.head=a;v.tail=b
  if parent:v.parent=data.edit_bones[parent]
  v.use_deform=n!='Root';return v
 bone('Root',Vector((0,0,0)),Vector((0,0,h*.12)))
 bone('Hips',p['hips'],p['chest'],'Root');bone('Chest',p['chest'],p['neck'],'Hips');bone('Head',p['neck'],p['head'],'Chest')
 for s,sign in [('L',1),('R',-1)]:
  def q(k):
   v=p[k].copy();v.x*=sign;return v
  if name=='Werewolf' and s=='R':
   # Authored left claw is already lifted. Its elbow/wrist need asymmetric pivots.
   elbow=Vector((-.24,-.09,.61))*h;wrist=Vector((-.24,-.22,.58))*h;fingers=Vector((-.255,-.245,.66))*h
  else:elbow,wrist,fingers=q('elbow'),q('wrist'),q('fingers')
  bone('UpperArm.'+s,q('shoulder'),elbow,'Chest');bone('Forearm.'+s,elbow,wrist,'UpperArm.'+s);bone('Hand.'+s,wrist,fingers,'Forearm.'+s)
  bone('Thigh.'+s,q('hip'),q('knee'),'Hips');bone('Shin.'+s,q('knee'),q('ankle'),'Thigh.'+s);bone('Foot.'+s,q('ankle'),q('toe'),'Shin.'+s)
 if name=='HellforgedWarden':bone('Tail',Vector((0,.40,.46))*h,Vector((0,.82,.34))*h,'Hips')
 bpy.ops.object.mode_set(mode='OBJECT')
 mesh.vertex_groups.clear();bones=[b for b in data.bones if b.use_deform]
 groups={b.name:mesh.vertex_groups.new(name=b.name) for b in bones}
 for v in mesh.data.vertices:
  weights=[]
  for b in bones:
   d=b.tail_local-b.head_local;t=max(0,min(1,(v.co-b.head_local).dot(d)/d.length_squared));distance=(v.co-(b.head_local+d*t)).length
   # Capsule distances blend connected joints while keeping close arms off the torso.
   distance=max(.009*h,distance);weights.append((b.name,1/distance**6))
  weights.sort(key=lambda x:x[1],reverse=True);weights=weights[:4];total=sum(w for n,w in weights)
  for n,w in weights:
   if w/total>.005:groups[n].add([v.index],w/total,'REPLACE')
 mesh.parent=rig;modifier=mesh.modifiers.new('Authored skin','ARMATURE');modifier.object=rig
 return rig,{k:k for k in ['Root','Hips','Chest','Head']+[b+'.'+s for s in ['L','R'] for b in ['UpperArm','Forearm','Hand','Thigh','Shin','Foot']]}
def world_bone(rig,n):return rig.matrix_world@rig.pose.bones[n].matrix
def rotate_world(rig,n,angle,axis):
 if not n or abs(angle)<1e-9:return
 bpy.context.view_layer.update();b=rig.pose.bones[n];m=world_bone(rig,n);q=Quaternion(Vector(axis),angle);m=Matrix.Translation(m.translation)@q.to_matrix().to_4x4()@Matrix.Translation(-m.translation)@m;b.matrix=rig.matrix_world.inverted()@m;bpy.context.view_layer.update()
def move_world(rig,n,offset):
 if not n:return
 bpy.context.view_layer.update();m=world_bone(rig,n);m.translation+=Vector(offset);rig.pose.bones[n].matrix=rig.matrix_world.inverted()@m;bpy.context.view_layer.update()
def leg_ik(rig,aliases,side,target,foot_basis):
 ns=[aliases.get(x+'.'+side) for x in ['Thigh','Shin','Foot']]
 if not all(ns):return
 a,b,c=[world_bone(rig,n).translation for n in ns];u=(b-a).length;v=(c-b).length;d=target-a;length=min(max(d.length,.001),u+v-.00001);direction=d.normalized();pole=(b-a)-direction*(b-a).dot(direction)
 if pole.length<.001:pole=Vector((0,-1,0))-direction*direction.dot(Vector((0,-1,0)))
 pole.normalize();along=(u*u-v*v+length*length)/(2*length);knee=a+direction*along+pole*math.sqrt(max(0,u*u-along*along))
 def aim(n,old,new):
  q=old.normalized().rotation_difference(new.normalized());m=world_bone(rig,n);pos=m.translation.copy();m=q.to_matrix().to_4x4()@m;m.translation=pos;rig.pose.bones[n].matrix=rig.matrix_world.inverted()@m;bpy.context.view_layer.update()
 aim(ns[0],b-a,knee-a);b=world_bone(rig,ns[1]).translation;c=world_bone(rig,ns[2]).translation;aim(ns[1],c-b,target-b)
 m=world_bone(rig,ns[2]);pos=m.translation.copy();m=foot_basis.copy();m.translation=pos;rig.pose.bones[ns[2]].matrix=rig.matrix_world.inverted()@m;bpy.context.view_layer.update()
def author_clips(name,rig,aliases,h,base,keep):
 scene=bpy.context.scene;scene.render.fps=30;clear_anim(rig)
 for b in rig.pose.bones:b.rotation_mode='QUATERNION'
 def reset():
  for b in rig.pose.bones:b.matrix_basis=base[b.name].copy()
  bpy.context.view_layer.update()
 reset();feet={s:world_bone(rig,aliases['Foot.'+s]).copy() for s in ['L','R'] if aliases.get('Foot.'+s)}
 frames={'Idle':90,'Walk':48 if name not in ['GiantBat','Werewolf'] else (24 if name=='GiantBat' else 34),'Attack':60,'Death':72,'Hit':15}
 for clip,frames_count in frames.items():
  if clip in keep:continue
  action=bpy.data.actions.new(clip);action.use_fake_user=True;rig.animation_data.action=action
  for f in range(frames_count+1):
   scene.frame_set(f);reset();t=f/frames_count
   def rot(k,degrees,axis=(1,0,0)):rotate_world(rig,aliases.get(k),math.radians(degrees),axis)
   def move(k,v):move_world(rig,aliases.get(k),Vector(v)*h)
   if clip=='Idle':
    rot('Chest',1.2*sin(t*2*pi));rot('Head',1.5*sin(t*2*pi+.4),(0,0,1))
    for s,sg in [('L',1),('R',-1)]:rot('UpperArm.'+s,1.2*sin(t*2*pi+.8)*sg,(0,1,0))
   elif clip=='Walk':
    move('Hips',(0,0,-.012*(1-cos(t*4*pi))))
    rot('Chest',2.2*sin(t*2*pi),(0,0,1))
    if name=='WraithV3':
     move('Hips',(0,0,.025*sin(t*2*pi)));rot('Chest',-5)
    for s,offset in [('L',0),('R',.5)]:
     ph=(t+offset)%1;wave=sin(ph*2*pi);rot('UpperArm.'+s,12*wave);rot('Forearm.'+s,4+5*max(0,wave))
     if s in feet:
      target=feet[s].translation.copy();stride=h*(.48 if name=='Werewolf' else .40)
      if ph<.6:target.y+=stride*(ph/.6-.5)
      else:target.y+=stride*(.5-(ph-.6)/.4);target.z+=h*.055*sin(pi*(ph-.6)/.4)
      leg_ik(rig,aliases,s,target,feet[s])
   elif clip=='Attack':
    # A complete authored windup, contact at 42%, follow-through and recovery.
    def env(keys):
     for (ta,va),(tb,vb) in zip(keys,keys[1:]):
      if t<=tb:
       u=max(0,(t-ta)/(tb-ta));return va+(vb-va)*u*u*(3-2*u)
     return keys[-1][1]
    wind=env([(0,0),(.27,1),(.42,0),(.65,0),(1,0)]);strike=env([(0,0),(.27,0),(.42,1),(.57,.85),(1,0)])
    rot('Chest',-7*wind+19*strike);rot('Chest',9*wind-13*strike,(0,0,1));rot('Head',4*strike)
    if name=='RiftWarden':
     for s in ['L','R']:rot('UpperArm.'+s,-105*wind-70*strike);rot('Forearm.'+s,-30*wind+32*strike)
     move('Hips',(0,-.035*strike,-.05*strike))
    elif name=='WraithV3':
     for s in ['L','R']:rot('UpperArm.'+s,-35*wind-80*strike);rot('Forearm.'+s,-20*wind+12*strike)
    else:
     rot('UpperArm.R',-90*wind-65*strike);rot('Forearm.R',-48*wind+18*strike);rot('UpperArm.L',-14*wind+15*strike);move('Hips',(0,-.028*strike,-.022*strike))
    for s in feet:leg_ik(rig,aliases,s,feet[s].translation,feet[s])
   elif clip=='Death':
    u=min(1,t/.82);u=u*u*(3-2*u);rot('Hips',88*u);move('Hips',(0,-.12*u,-.37*u));rot('Chest',12*sin(pi*u));rot('Head',-18*u)
    for s,sign in [('L',1),('R',-1)]:rot('UpperArm.'+s,30*u);rot('UpperArm.'+s,sign*20*u,(0,1,0));rot('Forearm.'+s,-25*u);rot('Thigh.'+s,-35*u);rot('Shin.'+s,60*u)
   elif clip=='Hit':rot('Chest',-8*sin(pi*t));rot('Head',9*sin(pi*t))
   if name=='GiantBat' and clip not in ['Death','Hit']:
    flap=sin(t*2*pi*(3 if clip=='Idle' else 1 if clip=='Walk' else 2));move('Hips',(0,0,.035*flap))
    for s,sign in [('L',1),('R',-1)]:rot('UpperArm.'+s,sign*(28*flap-12),(0,1,0));rot('Forearm.'+s,sign*12*sin(t*2*pi+.65),(0,1,0))
   for b in rig.pose.bones:
    b.keyframe_insert('location',frame=f,group=b.name);b.keyframe_insert('rotation_quaternion',frame=f,group=b.name);b.keyframe_insert('scale',frame=f,group=b.name)
  for fc in action.fcurves:
   for k in fc.keyframe_points:k.interpolation='LINEAR'
  keep[clip]=action
 rig.animation_data.action=keep['Idle'];scene.frame_set(0)
 return frames
def existing_aliases(rig,name):
 names=[b.name for b in rig.pose.bones]
 def find(*needles):return next((n for needle in needles for n in names if needle.lower() in n.lower()),None)
 if name=='Zombie':
  a={'Root':find('_rootJoint'),'Hips':find('root.x'),'Chest':find('spine_03'),'Head':find('head.x')}
  patterns={'UpperArm':'arm_stretch','Forearm':'forearm_stretch','Hand':'hand','Thigh':'thigh_stretch','Shin':'leg_stretch','Foot':'foot'}
  for s in ['L','R']:
   for k,v in patterns.items():a[k+'.'+s]=find(v+'.'+s.lower())
 elif name=='SkeletonV3':
  a={'Root':find('_rootJoint'),'Hips':find('Pelvis'),'Chest':find('Spine1_'),'Head':find('Head1_')}
  for s in ['L','R']:
   for k,v in {'UpperArm':'UpperArm','Forearm':'Forearm','Hand':'Hand','Thigh':'Thigh','Shin':'Calf','Foot':'Foot'}.items():a[k+'.'+s]=find('_'+s+'_'+v)
 else:
  # This source calls the shoulder bone Forearm and the elbow bone Arm;
  # Spine3 is the pelvis branch point, Spine5 belongs only to the hanging skirt.
  a={'Root':find('_rootJoint'),'Hips':find('Spine3_'),'Chest':find('Spine1_'),'Head':find('Head_')}
  for s in ['L','R']:
    for k,v in {'UpperArm':'Forearm.','Forearm':'Arm.','Hand':'Hand.'}.items():a[k+'.'+s]=next((n for n in names if n.lower().startswith((v+s.lower()).lower())),None)
 return a
def normalize_images(name):
 folder=OUT/'editable'/'textures'/name;folder.mkdir(parents=True,exist_ok=True)
 for im in bpy.data.images:
  if im.source not in ['FILE','GENERATED'] or not im.size[0]:continue
  if max(im.size)>2048:im.scale(round(im.size[0]*2048/max(im.size)),round(im.size[1]*2048/max(im.size)))
  im.filepath_raw=str(folder/(re.sub(r'[^A-Za-z0-9_.-]','_',im.name)+'.png'));im.file_format='PNG';im.save();im.pack()
def cloth_layer(source,rig,h,lo,name,lower,upper,color,torso=False):
 dg=bpy.context.evaluated_depsgraph_get();ev=source.evaluated_get(dg);coords=[ev.matrix_world@v.co for v in ev.data.vertices]
 assert len(coords)==len(source.data.vertices)
 o=source.copy();o.data=source.data.copy();o.name=name;bpy.context.collection.objects.link(o)
 if o.data.shape_keys:o.shape_key_clear()
 bm=bmesh.new();bm.from_mesh(o.data);bm.verts.ensure_lookup_table();bm.faces.ensure_lookup_table()
 discard=[]
 for face in bm.faces:
  c=sum((coords[v.index] for v in face.verts),Vector())/len(face.verts);z=(c.z-lo.z)/h
  if z<lower+.006*sin(c.x/h*115) or z>upper or torso and abs(c.x)>.145*h:discard.append(face)
 bmesh.ops.delete(bm,geom=discard,context='FACES');bm.to_mesh(o.data);bm.free();o.data.update()
 scale=sum(o.matrix_world.to_scale())/3
 for v in o.data.vertices:v.co+=v.normal*(h*.006/scale)
 o.data.materials.clear();o.data.materials.append(mat(name+' material',color,0,.95))
 for p in o.data.polygons:p.material_index=0;p.use_smooth=True
 return o
def bind_attachment(o,rig,bone):
 select([o]);bpy.ops.object.transform_apply(location=True,rotation=True,scale=True)
 transform=rig.data.bones[bone].matrix_local@rig.pose.bones[bone].matrix.inverted()@rig.matrix_world.inverted()
 o.data.transform(transform);o.parent=rig;o.matrix_world=rig.matrix_world.copy();o.vertex_groups.clear();g=o.vertex_groups.new(name=bone);g.add(list(range(len(o.data.vertices))),1,'REPLACE');mod=o.modifiers.new('Equipment skin','ARMATURE');mod.object=rig
def tube_between(name,a,b,radius,material,rig,bone):
 direction=b-a;bpy.ops.mesh.primitive_cylinder_add(vertices=10,radius=radius,depth=direction.length,location=(a+b)/2);o=bpy.context.object;o.name=name;o.rotation_euler=direction.to_track_quat('Z','Y').to_euler();o.data.materials.append(material);bind_attachment(o,rig,bone);return o
def equip_undead(name,rig,aliases,meshes,h):
 scene=bpy.context.scene;scene.frame_set(0);bpy.context.view_layer.update();lo,hi=bounds(meshes,True)
 leather=mat('Weathered umber leather',(.065,.041,.023),0,.94);iron=mat('Pitted old iron',(.11,.115,.10),.62,.74);wood=mat('Charred wood',(.075,.041,.016),0,.94)
 if name=='Zombie':
  body=max(meshes,key=lambda o:len(o.data.vertices));meshes.append(cloth_layer(body,rig,h,lo,'Torn miner trousers',.13,.545,(.055,.043,.033)));meshes.append(cloth_layer(body,rig,h,lo,'Worn sleeveless miner vest',.545,.83,(.08,.055,.027),True))
 hand=aliases.get('Hand.R')
 if hand:
  center=world_bone(rig,hand).translation
  a=center+Vector((0,0,(-.17 if name=='Zombie' else -.08)*h));b=center+Vector((0,0,(.30 if name=='Zombie' else .06)*h));meshes.append(tube_between('Pick handle' if name=='Zombie' else 'Sword grip',a,b,h*.013,wood,rig,hand))
  if name=='Zombie':
   verts=[];faces=[]
   for x,z,width in [(-.20,-.055,.001),(-.13,.015,.013),(-.055,.03,.022),(.015,.022,.024),(.09,-.008,.016),(.17,-.065,.001)]:
    for y,dz in [(-width,0),(0,-width),(width,0),(0,width)]:verts.append(b+Vector((x,y,z+dz))*h)
   for j in range(5):
    for k in range(4):faces.append((j*4+k,j*4+(k+1)%4,(j+1)*4+(k+1)%4,(j+1)*4+k))
   data=bpy.data.meshes.new('Forged tapered pick');data.from_pydata(verts,[],faces);o=bpy.data.objects.new('Old iron pick head',data);bpy.context.collection.objects.link(o);data.materials.append(iron);bind_attachment(o,rig,hand);meshes.append(o)
  else:
   meshes.append(tube_between('Sword crossguard',center+Vector((-.085*h,0,.055*h)),center+Vector((.085*h,0,.055*h)),h*.015,iron,rig,hand))
   verts=[];faces=[]
   for z,w in [(.06,.025),(.39,.023),(.49,0)]:
    for x,y in [(-w,0),(0,-.007),(w,0),(0,.007)]:verts.append(center+Vector((x,y,z))*h)
   for j in range(2):
    for k in range(4):faces.append((j*4+k,j*4+(k+1)%4,(j+1)*4+(k+1)%4,(j+1)*4+k))
   data=bpy.data.meshes.new('Chipped sword blade');data.from_pydata(verts,[],faces);o=bpy.data.objects.new('Chipped sword blade',data);bpy.context.collection.objects.link(o);data.materials.append(iron);bind_attachment(o,rig,hand);meshes.append(o)
 if name=='SkeletonV3':
  for alias,scale in [('UpperArm.L',(.065,.068,.044))]:
   bone=aliases.get(alias)
   if not bone:continue
   center=world_bone(rig,bone).translation;center.z+=h*.015;bpy.ops.mesh.primitive_uv_sphere_add(segments=20,ring_count=10,location=center);o=bpy.context.object;o.name='Damaged iron '+alias;o.scale=Vector(scale)*h
   bm=bmesh.new();bm.from_mesh(o.data);bmesh.ops.delete(bm,geom=[v for v in bm.verts if v.co.z<-.1],context='VERTS');bm.to_mesh(o.data);bm.free();o.data.materials.append(iron)
   for face in o.data.polygons:face.use_smooth=True
   bind_attachment(o,rig,bone);meshes.append(o)
  chest=aliases['Chest'];c=world_bone(rig,chest).translation
  a=c+Vector((.10,-.085,.12))*h;b=c+Vector((-.09,-.085,-.19))*h
  bpy.ops.mesh.primitive_cube_add(size=1,location=(a+b)/2);o=bpy.context.object;o.name='Old leather baldric';o.rotation_euler=(b-a).to_track_quat('Z','Y').to_euler();o.scale=Vector((h*.034,h*.006,(b-a).length));o.data.materials.append(leather);bind_attachment(o,rig,chest);meshes.append(o)
def finish_werewolf(mesh,high,h):
 select([mesh]);bpy.ops.object.mode_set(mode='EDIT');bpy.ops.mesh.select_all(action='SELECT');bpy.ops.uv.smart_project(angle_limit=1.15,island_margin=.008);bpy.ops.object.mode_set(mode='OBJECT')
 m=mesh.data.materials[0];nodes=m.node_tree.nodes;links=m.node_tree.links;p=nodes.get('Principled BSDF')
 scene=bpy.context.scene;scene.render.engine='CYCLES';scene.cycles.samples=16;scene.render.bake.margin=10
 normal=bpy.data.images.new('Werewolf_Sculpt_Normal',width=2048,height=2048);normal.colorspace_settings.name='Non-Color';tex=nodes.new('ShaderNodeTexImage');tex.image=normal;nodes.active=tex
 high.hide_render=False;select([mesh,high]);bpy.context.view_layer.objects.active=mesh
 scene.render.bake.use_selected_to_active=True;scene.render.bake.cage_extrusion=h*.025;scene.render.bake.max_ray_distance=h*.075;bpy.ops.object.bake(type='NORMAL');bpy.data.objects.remove(high,do_unlink=True)
 normal_node=nodes.new('ShaderNodeNormalMap');normal_node.inputs['Strength'].default_value=.8;links.new(tex.outputs['Color'],normal_node.inputs['Color']);links.new(normal_node.outputs['Normal'],p.inputs['Normal'])
 noise=nodes.new('ShaderNodeTexNoise');noise.inputs['Scale'].default_value=8;noise.inputs['Detail'].default_value=4;noise.inputs['Roughness'].default_value=.8
 coord=nodes.new('ShaderNodeTexCoord');mapping=nodes.new('ShaderNodeVectorMath');mapping.operation='MULTIPLY';mapping.inputs[1].default_value=(10,10,1.2);links.new(coord.outputs['Generated'],mapping.inputs[0]);links.new(mapping.outputs[0],noise.inputs['Vector'])
 ramp=nodes.new('ShaderNodeValToRGB');ramp.color_ramp.elements[0].position=.2;ramp.color_ramp.elements[0].color=(.019,.014,.01,1);ramp.color_ramp.elements[1].position=.78;ramp.color_ramp.elements[1].color=(.16,.102,.059,1);links.new(noise.outputs['Fac'],ramp.inputs[0]);links.new(ramp.outputs['Color'],p.inputs['Base Color'])
 color=bpy.data.images.new('Werewolf_Umber_Hide',width=2048,height=2048);c=nodes.new('ShaderNodeTexImage');c.image=color;nodes.active=c;select([mesh]);scene.render.bake.use_selected_to_active=False;scene.render.bake.use_pass_direct=False;scene.render.bake.use_pass_indirect=False;scene.render.bake.use_pass_color=True;bpy.ops.object.bake(type='DIFFUSE');links.new(c.outputs['Color'],p.inputs['Base Color']);normal.pack();color.pack()
def run(name):
 bpy.ops.wm.read_factory_settings(use_empty=True);bpy.ops.import_scene.gltf(filepath=str(SOURCE/(name+'.glb')));scene=bpy.context.scene;scene.render.fps=24
 widgets={b.custom_shape for arm in scene.objects if arm.type=='ARMATURE' for b in arm.pose.bones if b.custom_shape}
 meshes=[o for o in scene.objects if o.type=='MESH' and len(o.data.vertices)>0 and not o.hide_render and o not in widgets]
 for o in list(scene.objects):
  if o.type=='MESH' and o not in meshes:bpy.data.objects.remove(o,do_unlink=True)
 rig=next((o for o in scene.objects if o.type=='ARMATURE'),None);original_triangles=sum(sum(len(p.vertices)-2 for p in o.data.polygons) for o in meshes);keep={}
 if not rig:
  # Flatten glTF import wrappers, then correct only the model's source axis/units.
  for o in meshes:m=o.matrix_world.copy();o.parent=None;o.matrix_world=m
  select(meshes);bpy.ops.object.join();mesh=bpy.context.object;bpy.ops.object.transform_apply(location=True,rotation=True,scale=True)
  if name in ['FireGolem','RiftWarden']:mesh.data.transform(Matrix.Rotation(-pi/2,4,'Z'))
  lo,hi=bounds([mesh]);scale=HEIGHT[name]/(hi.z-lo.z);center=(lo+hi)*.5;center.z=lo.z
  mesh.data.transform(Matrix.Scale(scale,4)@Matrix.Translation(-center));h=HEIGHT[name]
  mesh.name=name+'_Body';mesh.data.name=name+'_GameMesh'
  high=None
  if name=='Werewolf':high=mesh.copy();high.data=mesh.data.copy();high.name='Werewolf approved high sculpt';bpy.context.collection.objects.link(high)
  if name in TRIS:
   # Weld the arbitrary 16-bit glTF chunks before simplifying across their borders.
   select([mesh]);bpy.ops.object.mode_set(mode='EDIT');bpy.ops.mesh.select_all(action='SELECT');bpy.ops.mesh.remove_doubles(threshold=h*.0000005);bpy.ops.object.mode_set(mode='OBJECT')
   count=sum(len(p.vertices)-2 for p in mesh.data.polygons);d=mesh.modifiers.new('Game silhouette reduction','DECIMATE');d.ratio=min(1,TRIS[name]/count);d.use_collapse_triangulate=True;bpy.ops.object.modifier_apply(modifier=d.name)
  # Retain every referenced UV set: imported color, roughness and normal maps
  # may deliberately use different channels even when their coordinates match.
  if name=='Werewolf':
   m=mat('Werewolf dark umber hide',(.115,.09,.067),0,.86);mesh.data.materials.clear();mesh.data.materials.append(m)
   for p in mesh.data.polygons:p.material_index=0;p.use_smooth=True
   finish_werewolf(mesh,high,h)
  for material in mesh.data.materials:
   if not material or not material.use_nodes:continue
   p=next((n for n in material.node_tree.nodes if n.type=='BSDF_PRINCIPLED'),None)
   if not p:continue
   if name in ['FireGolem','RiftWarden']:
    p.inputs['Roughness'].default_value=.8
    # Texture already carries baked high-poly normals and lava fissure color.
    base=p.inputs['Base Color']
    if base.links:
     material.node_tree.links.new(base.links[0].from_socket,p.inputs['Emission Color']);p.inputs['Emission Strength'].default_value=.28
  rig,aliases=fit_rig(name,mesh,h);meshes=[mesh]
  for o in list(scene.objects):
   if o.type=='EMPTY':bpy.data.objects.remove(o,do_unlink=True)
  base={b.name:b.matrix_basis.copy() for b in rig.pose.bones}
 else:
  aliases=existing_aliases(rig,name)
  # Preserve the artist's rig and sampled action, including its root-axis correction.
  actions=[a for a in bpy.data.actions if a.frame_range.y>1 and any('pose.bones' in f.data_path for f in a.fcurves)]
  for a in actions:
   low=a.name.lower();label='Idle' if 'idle' in low or 'iddle'in low or name=='SkeletonV3' else 'Walk' if 'walk'in low or 'chasing'in low else 'Attack' if 'attack'in low else None
   if label:a.name=label;a.use_fake_user=True;keep[label]=a
  assert 'Idle'in keep,(name,[a.name for a in actions]);clear_anim(rig);rig.animation_data.action=keep['Idle'];scene.frame_set(0);bpy.context.view_layer.update()
  lo,hi=bounds(meshes,True);h=hi.z-lo.z
  base={b.name:b.matrix_basis.copy() for b in rig.pose.bones}
  # Convert the original 24 fps action time to the project's 30 fps time base.
  for a in keep.values():
   for fc in a.fcurves:
    for k in fc.keyframe_points:k.co.x*=1.25;k.handle_left.x*=1.25;k.handle_right.x*=1.25
  for o in scene.objects:
   if o!=rig and o.animation_data:o.animation_data_clear()
  # Imported clips omit unchanged channels. Bake those from the same rest pose,
  # otherwise a preceding authored clip leaves unkeyed knees/shoulders behind.
  for label,original in list(keep.items()):
   samples=[];end=math.ceil(original.frame_range.y)
   for f in range(end+1):
    rig.animation_data.action=None
    for b in rig.pose.bones:b.matrix_basis=base[b.name].copy()
    rig.animation_data.action=original;scene.frame_set(f);bpy.context.view_layer.update();samples.append({b.name:b.matrix_basis.copy() for b in rig.pose.bones})
   original.name='Source_'+label;action=bpy.data.actions.new(label);rig.animation_data.action=action;action.use_fake_user=True
   for f,pose in enumerate(samples):
    for b in rig.pose.bones:
     b.rotation_mode='QUATERNION';b.matrix_basis=pose[b.name]
     b.keyframe_insert('location',frame=f,group=b.name);b.keyframe_insert('rotation_quaternion',frame=f,group=b.name);b.keyframe_insert('scale',frame=f,group=b.name)
   keep[label]=action
  if name=='SkeletonV3':keep={}
  # Root wrapper units are left intact; Godot normalizes to the measured visible body.
 frames=author_clips(name,rig,aliases,h,base,keep);bpy.context.view_layer.update();calibration_lo,calibration_hi=bounds(meshes,True)
 if name in ['Zombie','SkeletonV3']:equip_undead(name,rig,aliases,meshes,h)
 for a in list(bpy.data.actions):
  if a not in keep.values():bpy.data.actions.remove(a)
 for label,a in keep.items():a.name=label
 for o in scene.objects:
  if o!=rig and o.animation_data:o.animation_data_clear()
 normalize_images(name);rig.name=name+'_Rig';rig.show_in_front=True
 scene.frame_set(0);scene.render.fps=30;scene.frame_start=0;scene.frame_end=90;bpy.context.view_layer.update()
 # Store only the actual runtime actor and editable authoring data.
 bpy.ops.wm.save_as_mainfile(filepath=str(OUT/'editable'/(name+'.blend')))
 select([o for o in scene.objects if o.type in ['MESH','ARMATURE','EMPTY']]);bpy.ops.export_scene.gltf(filepath=str(OUT/'runtime'/(name+'.glb')),export_format='GLB',use_selection=True,export_animations=True,export_skins=True,export_morph=False,export_yup=True,export_force_sampling=True,export_frame_range=False,export_nla_strips=True)
 report={'name':name,'sourceTriangles':original_triangles,'gameTriangles':sum(sum(len(p.vertices)-2 for p in o.data.polygons) for o in meshes),'bones':len(rig.data.bones),'targetHeight':HEIGHT[name],'sourceHeight':calibration_hi.z-calibration_lo.z,'sourceFloor':calibration_lo.z,'sourceWidth':calibration_hi.x-calibration_lo.x,'sourceDepth':calibration_hi.y-calibration_lo.y,'attackContact':.42,'actions':{label:{'frames':list(a.frame_range),'seconds':(a.frame_range.y-a.frame_range.x)/30} for label,a in keep.items()},'aliases':aliases,'changes':['Original approved geometry and texture identity preserved','Game mesh reduction where needed; source high-poly normals retained','Per-model anatomical rig fit; sampled idle, gait, contact/recovery, hit and death','Packed textures capped to 2048px','No source auto-execution or generative processing']}
 for sub in ['runtime','editable']:
  p=OUT/sub/(name+('.glb' if sub=='runtime' else '.blend'));b=p.read_bytes();report[sub]={'bytes':len(b),'sha256':hashlib.sha256(b).hexdigest()}
 (OUT/'runtime'/(name+'.json')).write_text(json.dumps(report,indent=2),encoding='utf8');print('BUILT '+json.dumps(report),flush=True)
for name in NAMES:run(name)
