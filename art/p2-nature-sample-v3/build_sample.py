"""Isolated authored P2 patch. Never opens/saves the production D13 masters."""
from pathlib import Path
import bpy, math, json, random, hashlib, sys
import numpy as np
from mathutils import Vector, Matrix, Quaternion
ROOT=Path(__file__).resolve().parents[2]; OUT=Path(__file__).resolve().parent
S=json.loads((OUT/'site-snapshot.json').read_text()); R=random.Random(912620)
bpy.ops.wm.read_factory_settings(use_empty=True)
scene=bpy.context.scene
scene.render.engine='CYCLES';scene.cycles.samples=40;scene.cycles.use_denoising=True
scene.render.resolution_x=1600;scene.render.resolution_y=900;scene.render.resolution_percentage=100
scene.view_settings.view_transform='AgX';scene.view_settings.look='AgX - Medium High Contrast';scene.view_settings.exposure=.3
COL={}
for name in ['Forest_Candidate','Shore_Candidate','Source_Prototypes','QA_Hero','QA_Cameras']:
 c=bpy.data.collections.new(name);scene.collection.children.link(c);COL[name]=c
def move(obj,col):
 for c in list(obj.users_collection):c.objects.unlink(obj)
 COL[col].objects.link(obj)
def height(region,x,z):
 v=S['regions'][region];b=v['bounds'];step=v['step'];cols=v['columns'];rows=v['rows']
 gx=min(cols-1e-8,max(0,(x-b[0])/step));gz=min(rows-1e-8,max(0,(z-b[1])/step));i=int(gx);j=int(gz);u=gx-i;t=gz-j;a=j*(cols+1)+i;hs=v['heights']
 aa,bb,cc,dd=hs[a],hs[a+1],hs[a+cols+1],hs[a+cols+2]
 return aa+u*(bb-aa)+t*(dd-bb) if u>=t else aa+u*(dd-cc)+t*(cc-aa)
def mat(name,color,rough=.9):
 m=bpy.data.materials.new(name);m.diffuse_color=(*color,1);m.use_nodes=True;p=m.node_tree.nodes.get('Principled BSDF');p.inputs['Base Color'].default_value=(*color,1);p.inputs['Roughness'].default_value=rough;return m
def image(path):
 im=bpy.data.images.load(str(ROOT/path),check_existing=True);im.pack();return im
def terrain_material(region):
 m=mat('P2N_'+region+'_ground',(.22,.20,.15));nt=m.node_tree;n=nt.nodes;l=nt.links;p=n.get('Principled BSDF')
 uv=n.new('ShaderNodeTexCoord');mapping=n.new('ShaderNodeVectorMath');mapping.operation='MULTIPLY';mapping.inputs[1].default_value=(.28,.28,.28);l.new(uv.outputs['UV'],mapping.inputs[0])
 colors=[]
 for group,path in [('forest','mud_forest/diff.jpg'),('mud','forest_ground_04/diff.jpg' if region=='forest' else 'brown_mud/diff.jpg')]:
  tex=n.new('ShaderNodeTexImage');tex.image=image('public/assets/world/'+path);l.new(mapping.outputs[0],tex.inputs[0]);colors.append(tex.outputs['Color'])
 attr=n.new('ShaderNodeAttribute');attr.attribute_name='P2N_surface_mask';mix=n.new('ShaderNodeMixRGB');l.new(attr.outputs['Fac'],mix.inputs[0]);l.new(colors[0],mix.inputs[1]);l.new(colors[1],mix.inputs[2])
 tint=n.new('ShaderNodeMixRGB');tint.blend_type='MULTIPLY';tint.inputs[0].default_value=.34;tint.inputs[2].default_value=(.57,.66,.34,1) if region=='forest' else (.63,.59,.44,1);l.new(mix.outputs[0],tint.inputs[1]);l.new(tint.outputs[0],p.inputs['Base Color'])
 # A material mosaic, not a second terrain surface: leaf litter, fine moss and
 # dry mineral soil are all shaded on the unchanged D13 triangles.
 mossattr=n.new('ShaderNodeAttribute');mossattr.attribute_name='P2N_moss'
 mossnoise=n.new('ShaderNodeTexNoise');mossnoise.inputs['Scale'].default_value=17;mossnoise.inputs['Detail'].default_value=3;l.new(uv.outputs['UV'],mossnoise.inputs[0])
 ramp=n.new('ShaderNodeValToRGB');ramp.color_ramp.elements[0].position=.22;ramp.color_ramp.elements[0].color=(.034,.059,.011,1);ramp.color_ramp.elements[1].position=.8;ramp.color_ramp.elements[1].color=(.20,.245,.052,1);l.new(mossnoise.outputs['Fac'],ramp.inputs[0])
 mossmix=n.new('ShaderNodeMixRGB');l.new(mossattr.outputs['Fac'],mossmix.inputs[0]);l.new(tint.outputs[0],mossmix.inputs[1]);l.new(ramp.outputs[0],mossmix.inputs[2]);l.new(mossmix.outputs[0],p.inputs['Base Color'])
 noise=n.new('ShaderNodeTexNoise');noise.inputs['Scale'].default_value=110;noise.inputs['Detail'].default_value=2;l.new(mapping.outputs[0],noise.inputs[0]);bump=n.new('ShaderNodeBump');bump.inputs['Strength'].default_value=.18;bump.inputs['Distance'].default_value=.06;l.new(noise.outputs['Fac'],bump.inputs['Height']);l.new(bump.outputs[0],p.inputs['Normal'])
 if region=='shore':
  wet=n.new('ShaderNodeAttribute');wet.attribute_name='P2N_wet';rough=n.new('ShaderNodeMapRange');rough.inputs['To Min'].default_value=.9;rough.inputs['To Max'].default_value=.28;l.new(wet.outputs['Fac'],rough.inputs[0]);l.new(rough.outputs[0],p.inputs['Roughness'])
  damp=n.new('ShaderNodeMixRGB');damp.blend_type='MULTIPLY';damp.inputs[0].default_value=1;damp.inputs[2].default_value=(.38,.42,.33,1);l.new(mossmix.outputs[0],damp.inputs[1]);blend=n.new('ShaderNodeMixRGB');l.new(wet.outputs['Fac'],blend.inputs[0]);l.new(mossmix.outputs[0],blend.inputs[1]);l.new(damp.outputs[0],blend.inputs[2]);l.new(blend.outputs[0],p.inputs['Base Color'])
 return m
def terrain_mesh(region,context=False):
 v=S['contexts' if context else 'regions'][region];b=v['bounds'];cs=v['columns'];rs=v['rows'];verts=[(b[0]+i*v['step'],-(b[1]+j*v['step']),v['heights'][j*(cs+1)+i])for j in range(rs+1)for i in range(cs+1)];faces=[]
 for j in range(rs):
  for i in range(cs):
   if context:
    xx=b[0]+(i+.5)*v['step'];zz=b[1]+(j+.5)*v['step'];c=v['core']
    if c[0]<xx<c[2] and c[1]<zz<c[3]:continue
   a=j*(cs+1)+i;faces.extend([(a,a+cs+2,a+1),(a,a+cs+1,a+cs+2)])
 mesh=bpy.data.meshes.new('D13_exact_triangles_'+region);mesh.from_pydata(verts,[],faces);mesh.materials.append(terrain_material(region));obj=bpy.data.objects.new('D13_Terrain_Reference_'+region,mesh);COL[region.title()+'_Candidate'].objects.link(obj)
 uv=mesh.uv_layers.new(name='WorldMetres');attr=mesh.attributes.new('P2N_surface_mask','FLOAT','POINT');wet=mesh.attributes.new('P2N_wet','FLOAT','POINT');moss=mesh.attributes.new('P2N_moss','FLOAT','POINT')
 for i,(x,y,z) in enumerate(verts):
  mottled=.5+.20*math.sin(x*.49+math.sin(y*.68)*1.7)+.17*math.sin(y*.31+x*.26)+.13*math.sin(x*1.7-y*.97)
  if region=='forest':
   d=min(math.hypot(x-t['position'][0],-y-t['position'][2]) for t in S['trees']);attr.data[i].value=min(1,max(0,(d-4)/7))*.55
   moss.data[i].value=max(0,min(.9,(mottled-.28)*1.7))*(.9 if d<14 else .6)
  else:
   variation=.58*math.sin(x*.9+y*.46)+.3*math.sin(y*1.12-x*.44)
   attr.data[i].value=min(1,max(0,(43-z+variation)/2.4));wet.data[i].value=min(1,max(0,(41.6-z+variation*.7)/1.8))
   moss.data[i].value=max(0,min(.75,(mottled-.36)*1.4))*min(1,max(0,(z-40.7)/2))
 for loop in mesh.loops:uv.data[loop.index].uv=(verts[loop.vertex_index][0],verts[loop.vertex_index][1])
 for poly in mesh.polygons:poly.use_smooth=True
 obj['reference_only']=True;obj['height_changes']=0;obj['source']='geology-D13/heightmap.f32'
terrain_mesh('forest');terrain_mesh('shore');terrain_mesh('forest',True);terrain_mesh('shore',True)
PRO={};sources={};obstacles=[];placements=[];root_fit=[]
def segment_distance(x,z,a,b):
 dx=b['x']-a['x'];dz=b['z']-a['z'];t=max(0,min(1,((x-a['x'])*dx+(-z-a['z'])*dz)/(dx*dx+dz*dz))) if dx*dx+dz*dz>1e-9 else 0
 return math.hypot(x-a['x']-dx*t,-z-a['z']-dz*t)
def decor_allowed(x,z,region,radius=.65):
 if region=='shore':return math.hypot(x+40,z+72)>radius+1.4
 if not(-299<x<-221 and 155<z<233) or abs(x+263)<2.5+radius:return False
 if any(math.hypot(x-s['x'],z+s['z'])<radius+1.0 for s in S['regions']['forest']['slots']):return False
 return all(segment_distance(x,z,a,b)>radius+.65 for route in S['routes'] for a,b in zip(route['points'],route['points'][1:]))
def prototype(key):
 if key in PRO:return PRO[key]
 desc=S['catalog'].get(key,S['grassCatalog'].get(key));path='godot-pc/world-final/nature/'+desc['lods'][0]['path'];before=set(bpy.data.objects);bpy.ops.import_scene.gltf(filepath=str(ROOT/path));objects=list(set(bpy.data.objects)-before);parts=[]
 for obj in objects:
  if obj.type=='MESH':
   data=obj.data.copy()
   if key.startswith('grass') or key=='sedge_wet':
    for i,original in enumerate(data.materials):
     m=mat('P2N_D11_Live_Grass',(.10,.16,.033),.9);data.materials[i]=m
     nn=m.node_tree.nodes;ll=m.node_tree.links;trans=nn.new('ShaderNodeBsdfTranslucent');trans.inputs['Color'].default_value=(.25,.34,.065,1);blend=nn.new('ShaderNodeMixShader');blend.inputs[0].default_value=.32;ll.new(nn.get('Principled BSDF').outputs[0],blend.inputs[1]);ll.new(trans.outputs[0],blend.inputs[2]);ll.new(blend.outputs[0],nn.get('Material Output').inputs['Surface'])
   parts.append((data,obj.matrix_world.copy(),obj.name))
 for obj in objects:bpy.data.objects.remove(obj,do_unlink=True)
 sources[key]={'path':path,'sha256':hashlib.sha256((ROOT/path).read_bytes()).hexdigest(),'license':desc.get('source_license','project-authored derivative; see source manifest')};PRO[key]=parts;return parts
def instance(key,pos,scale,yaw,id,region,seat_root=False):
 x,y,z=pos;col=COL[region.title()+'_Candidate'];parent=bpy.data.objects.new(id,None);col.objects.link(parent);parent.location=(x,-z,y);parent.rotation_euler.z=yaw;parent.scale=(scale,)*3;parent['stable_id']=id;parent['source_asset']=key;parent['candidate_only']=True
 trunk=[];deformed=0;lowest=1e6
 for mesh,transform,name in prototype(key):
  data=mesh.copy() if seat_root else mesh;obj=bpy.data.objects.new(id+'_'+name,data);col.objects.link(obj);obj.parent=parent;obj.matrix_local=transform
  if seat_root:
   for v in data.vertices:
    p=transform@v.co
    if .3<p.z<1.65:trunk.append([p.x,p.y])
    if p.z<.75:
     wx=x+scale*(p.x*math.cos(yaw)-p.y*math.sin(yaw));wz=z-scale*(p.x*math.sin(yaw)+p.y*math.cos(yaw));ground=height(region,wx,wz);delta=(ground-y)/scale
     source_height=p.z;amount=max(0,1-max(0,p.z)/.45);p.z+=delta*amount-.045/scale*amount
     if key.startswith('pine'):
      # The scan has a flat bark/soil skirt. Its broad outer lip is buried into
      # the existing hill, leaving a gradual root flare instead of a dark plate.
      radial=min(1,max(0,(math.hypot(p.x,p.y)-.25)/.55));low=min(1,max(0,(.75-source_height)/.3));p.z=p.z*(1-radial*low)+(delta-.035/scale)*radial*low
     v.co=transform.inverted()@p;deformed+=1;lowest=min(lowest,y+scale*p.z-ground)
  for poly in data.polygons:poly.use_smooth=True
 if seat_root and trunk:
  a=np.asarray(trunk);center=(a.min(axis=0)+a.max(axis=0))/2;radius=float(np.linalg.norm(a-center,axis=1).max())*scale
  cx=x+scale*(center[0]*math.cos(yaw)-center[1]*math.sin(yaw));cz=-z+scale*(center[0]*math.sin(yaw)+center[1]*math.cos(yaw));obstacles.append(dict(id=id,kind='circle',x=cx,z=cz,radius=radius,bottom=y-.15,top=y+12*scale,blocksMovement=True))
  root_fit.append({'id':id,'deformedRootVertices':deformed,'lowestVertexToGroundM':lowest,'trunkRadiusM':radius})
 placements.append({'id':id,'asset':key,'position':pos,'scale':scale,'yaw':yaw,'region':region,'rootFit':seat_root})
 return parent
for tree in S['trees']:instance(tree['asset'],tree['position'],tree['scale'],tree['yaw'],tree['id'],'forest',True)
def seated_prop(key,x,z,scale,yaw,id,region,hard=True):
 desc=S['catalog'][key]['lods'][0];lo=desc['low'];hi=desc['high'];y=height(region,x,z)-lo[1]*scale-.12*scale
 obj=instance(key,[x,y,z],scale,yaw,id,region)
 # Rigid tangent placement keeps a log whole. Only the tree root mesh above
 # receives deformation; stones and deadwood are never warped into a slope.
 sx=(height(region,x+.5,z)-height(region,x-.5,z));sz=(height(region,x,z+.5)-height(region,x,z-.5));normal=Vector((-sx,sz,1)).normalized()
 obj.rotation_mode='QUATERNION';obj.rotation_quaternion=Vector((0,0,1)).rotation_difference(normal)@Quaternion((0,0,1),yaw);bpy.context.view_layer.update()
 gaps=[]
 for child in obj.children:
  for v in child.data.vertices:
   local=child.matrix_local@v.co
   if local.z<lo[1]+(hi[1]-lo[1])*.12:
    p=child.matrix_world@v.co;gaps.append(p.z-height(region,p.x,-p.y))
 if gaps:obj.location.z-=float(np.percentile(gaps,75))+.055
 bpy.context.view_layer.update();points=np.asarray([list(child.matrix_world@v.co)for child in obj.children for v in child.data.vertices]);world_lo=points.min(axis=0);world_hi=points.max(axis=0)
 placements[-1]['position'][1]=float(obj.location.z);placements[-1]['rotationQuaternionBlender']=list(obj.rotation_quaternion);placements[-1]['rigidSlopeSeat']=True
 if hard:
  if key.startswith('rock'):
   center=(world_lo[:2]+world_hi[:2])*.5;radius=float(np.linalg.norm(points[:,:2]-center,axis=1).max());obstacles.append(dict(id=id,kind='circle',x=float(center[0]),z=float(center[1]),radius=radius,bottom=float(world_lo[2]),top=float(world_hi[2]),blocksMovement=True))
  else:obstacles.append(dict(id=id,kind='box',x=float((world_lo[0]+world_hi[0])*.5),z=float((world_lo[1]+world_hi[1])*.5),halfX=float((world_hi[0]-world_lo[0])*.5),halfZ=float((world_hi[1]-world_lo[1])*.5),rotation=0,bottom=float(world_lo[2]),top=float(world_hi[2]),blocksMovement=True))
 return obj
# Three authored groups stay outside saved hunt paths and spawn approach discs.
prop_groups=[(-294.2,198.8),(-289.4,224.3),(-288.8,182.1)]
for g,(cx,cz) in enumerate(prop_groups):
 for j,(dx,dz,scale) in enumerate([(0,0,.43),(1.65,.65,.23),(-1.05,-.85,.27)]):
  x,z=cx+dx,cz+dz
  if decor_allowed(x,z,'forest',scale*2):seated_prop('rock_moss_set_01_'+str((g+j)%6),x,z,scale,g*1.7+j*.8,f'P2N_rock_group_{g}_{j}','forest')
 x,z=cx+.35,cz+2.3
 if decor_allowed(x,z,'forest',2):seated_prop('fallen_trunk_0',x,z,1.25,g*1.1+.35,f'P2N_deadwood_{g}','forest')
# Retain a subset of the exact existing grass IDs in the candidate. Give shade
# and root aprons a material-led floor, instead of increasing grass density.
excluded=[]
for region in ['forest','shore']:
 for i,p in enumerate(S['regions'][region]['baseGrass']):
  x,y,z=p[:3];dry=y>40.25 if region=='shore' else True
  near=min(math.hypot(x-t['position'][0],z-t['position'][2])for t in S['trees']) if region=='forest' else 99
  if not dry or near<1.1:excluded.append({'region':region,'sourceIndex':p[7]});continue
  instance('grass_shade' if near<6 else 'grass_short',[x,y,z],p[4],p[3],f'P2N_basegrass_{region}_{i:04}',region)
for index,t in enumerate(S['trees']):
 x,y,z=t['position']
 for j in range(8 if 'pine' in t['asset'] else 5):
  angle=R.uniform(0,6.283);r=R.uniform(1.2,4.4);xx=x+math.cos(angle)*r;zz=z+math.sin(angle)*r
  if not decor_allowed(xx,zz,'forest',.35):continue
  instance('fern_02_'+str((index+j)%4),[xx,height('forest',xx,zz)-.015,zz],R.uniform(.8,1.45),R.uniform(-3.14,3.14),f'P2N_fern_{index:02}_{j}','forest')

def shrub_clump(x,z,size,index):
 # shrub_04 is a 21cm leaf spray, not a whole bush. Radial staggered sprays
 # create a low branching volume; the stable parent remains hand editable.
 col=COL['Forest_Candidate'];parent=bpy.data.objects.new(f'P2N_shrub_clump_{index:02}',None);col.objects.link(parent);parent['stable_id']=parent.name;parent['authored_from']='CC0 shrub_04_0 leaf sprays';parent['candidate_only']=True
 for j in range(16):
  angle=j*2.399;rad=(.12+.32*(j%5)/4)*size;xx=x+math.cos(angle)*rad;zz=z+math.sin(angle)*rad;yy=height('forest',xx,zz)+(.05+.36*(j%4)/3)*size
  leaf=instance('shrub_04_0',[xx,yy,zz],size*(1.15+.5*(j%3)/2),angle+math.pi,f'P2N_shrub_{index:02}_spray_{j:02}','forest');leaf.parent=parent;leaf.rotation_euler.x=(j%3-1)*.25
 parent['nominal_height_m']=size*.75
 return parent
shrub_centres=[(-296.2,202),(-293,191),(-296.3,177.5),(-286.4,225.1),(-239.9,228.4),(-292.1,210.1),(-283.8,215.3),(-290.2,217.6),(-286.5,196.7),(-296.8,187.1),(-288.2,177.6),(-225.8,214.0),(-233,166),(-238,173),(-285,221.3)]
for i,(x,z) in enumerate(shrub_centres):
 if decor_allowed(x,z,'forest',.85):shrub_clump(x,z,.95+(i%4)*.22,i)
# Local curtains of mixed grass connect the lower layer; they do not fill the
# combat clearing. Irregular clusters leave the same route / target buffers.
for index,(cx,cz) in enumerate(shrub_centres+[(t['position'][0]+1.9,t['position'][2]-1.6)for t in S['trees']]):
 for j in range(27):
  angle=R.uniform(0,math.tau);rad=R.uniform(.15,2.3);x=cx+math.cos(angle)*rad;z=cz+math.sin(angle)*rad
  if not decor_allowed(x,z,'forest',.23):continue
  instance('grass_shade' if j%3 else 'grass_meadow',[x,height('forest',x,z)-.02,z],R.uniform(.7,1.18),R.uniform(-math.pi,math.pi),f'P2N_grass_cluster_{index:02}_{j:02}','forest')
# A few separated reed colonies, with individual height and density variation.
# Their centres are found on the real Y40m shoreline, not a new water outline.
shore_centres=[]
for z in [-90,-85,-77,-67,-61,-52]:
 samples=[(-57+i*.25,z)for i in range(180)];x,z=min(samples,key=lambda q:abs(height('shore',*q)-40.5));shore_centres.append((x,z))
for g,(cx,cz) in enumerate(shore_centres):
 for j in range([15,8,21,11,18,9][g]):
  angle=R.uniform(0,math.tau);rad=R.uniform(.1,1.8);x=cx+math.cos(angle)*rad;z=cz+math.sin(angle)*rad;y=height('shore',x,z)
  if 39.65<y<42 and decor_allowed(x,z,'shore',.3):instance('sedge_wet',[x,y-.045,z],R.uniform(.48,1.35),R.uniform(-math.pi,math.pi),f'P2N_sedge_{g}_{j:02}','shore')
 for j in range(5):
  x=cx+R.uniform(-3,1.8);z=cz+R.uniform(-2.8,2.8);size=R.uniform(.10,.26)
  if decor_allowed(x,z,'shore',size*2):seated_prop('rock_moss_set_01_'+str((j+g)%6),x,z,size,R.uniform(-math.pi,math.pi),f'P2N_shore_stone_{g}_{j}','shore',True)
# A cropped water surface at the existing level; only triangles inside lake.
poly=S['water']['lake']['polygon']
def in_poly(x,z):
 inside=False
 for a,b in zip(poly,poly[1:]+poly[:1]):
  if (a[1]>z)!=(b[1]>z) and x<(b[0]-a[0])*(z-a[1])/(b[1]-a[1])+a[0]:inside=not inside
 return inside
water_mat=mat('Existing_Lake_40m_Transparent_Candidate',(.19,.31,.25),.12);p=water_mat.node_tree.nodes.get('Principled BSDF');p.inputs['Transmission Weight'].default_value=.92;p.inputs['IOR'].default_value=1.333
wn=water_mat.node_tree.nodes;wl=water_mat.node_tree.links;noise=wn.new('ShaderNodeTexNoise');noise.inputs['Scale'].default_value=1.8;noise.inputs['Detail'].default_value=2;tc=wn.new('ShaderNodeTexCoord');wl.new(tc.outputs['Object'],noise.inputs[0]);bump=wn.new('ShaderNodeBump');bump.inputs['Strength'].default_value=.18;bump.inputs['Distance'].default_value=.016;wl.new(noise.outputs['Fac'],bump.inputs['Height']);wl.new(bump.outputs[0],p.inputs['Normal'])
wv=[(x,-z,40)for x,z in poly];wf=[tuple(range(len(wv)-1,-1,-1))]
mesh=bpy.data.meshes.new('Cropped_Existing_Lake');mesh.from_pydata(wv,[],wf);mesh.materials.append(water_mat);water=bpy.data.objects.new('Existing_Lake_40m_Reference',mesh);COL['Shore_Candidate'].objects.link(water);water['reference_only']=True
# Existing actual character only as a visible scale reference, no new hero art.
before=set(bpy.data.objects);bpy.ops.import_scene.gltf(filepath=str(ROOT/'godot-pc/assets/knight/Knight_Modular.glb'));host=list(set(bpy.data.objects)-before)
hide=['FK_body_torso','FK_body_upperarms','FK_body_hands','FK_body_forearms','FK_body_calves','FK_body_feet','FK_human_hair','FK_human_eyes','FK_human_brows','FK_body_head','FK_starter_pants','FK_head_open_helmet']
for obj in host:
 move(obj,'QA_Hero')
 if obj.type=='MESH' and (not obj.name.startswith('FK_') or any(obj.name==n or obj.name.startswith(n+'.')for n in hide)):obj.hide_render=True
hero=bpy.data.objects.new('QA_Knight_Actual_Model',None);COL['QA_Hero'].objects.link(hero)
for obj in host:
 if obj.parent not in host:obj.parent=hero;obj.scale*=2.05/1.84
hero['reference_only']=True
world=bpy.data.worlds.new('P2N_Daylight');scene.world=world;world.use_nodes=True;nt=world.node_tree;env=nt.nodes.new('ShaderNodeTexEnvironment');env.image=image('public/assets/world/kloppenheim_05_puresky_1k.hdr');nt.links.new(env.outputs['Color'],nt.nodes.get('Background').inputs['Color']);nt.nodes.get('Background').inputs['Strength'].default_value=.72
bpy.ops.object.light_add(type='SUN');sun=bpy.context.object;sun.name='QA_Sun';sun.rotation_euler=(.6,-.3,-.65);sun.data.energy=1.8;sun.data.angle=.2;move(sun,'QA_Cameras')
bpy.ops.object.camera_add();camera=bpy.context.object;move(camera,'QA_Cameras');scene.camera=camera;camera.data.sensor_fit='VERTICAL';camera.data.sensor_height=24;camera.data.lens=24/(2*math.tan(.82/2));camera.data.clip_end=1000
shots=[('forest-gameplay','forest',(-284,208),(-295,188),10.5),('forest-roots','forest',(-291,219),(-289,222),6.8),('shore-gameplay','shore',(-40,-72),(-20,-48),10.5)]
def set_shot(shot):
 name,region,(hx,hz),(tx,tz),distance=shot;hy=height(region,hx,hz);hero.location=(hx,-hz,hy);direction=Vector((tx-hx,-tz+hz,0)).normalized();hero.rotation_euler.z=math.atan2(-direction.x,direction.y)+math.pi
 pitch=.24 if name=='forest-gameplay' else .510796
 focus=Vector((hx,-hz,hy+1.35))+direction*2.15;camera.location=focus-direction*(distance*math.cos(pitch))+Vector((0,0,distance*math.sin(pitch)));camera.rotation_euler=(focus-camera.location).to_track_quat('-Z','Y').to_euler()
 return {'name':name,'region':region,'heroGodot':[hx,hy,hz],'cameraBlender':list(camera.location),'focusBlender':list(focus),'distance':distance,'pitchRadians':pitch,'verticalFovRadians':.82,'lensMm':camera.data.lens}
shot_manifest=[set_shot(s)for s in shots];set_shot(shots[0])
for im in bpy.data.images:
 if im.source=='FILE' and im.has_data and not im.packed_file:im.pack()
# GLB imports can leave unused originals and identical embedded textures. Keep
# all live editable geometry but deduplicate byte-identical packed images.
images_by_hash={}
for im in list(bpy.data.images):
 if im.packed_file:
  digest=hashlib.sha256(im.packed_file.data).hexdigest()
  if digest in images_by_hash:im.user_remap(images_by_hash[digest]);bpy.data.images.remove(im)
  else:images_by_hash[digest]=im
bpy.data.orphans_purge(do_recursive=True)
scene['scope']='Separate P2 candidate. Terrain exact sampled reference; no runtime changes.'
scene['source_snapshot']='site-snapshot.json';scene['coordinates']=S['coordinates']
target=OUT/'Varendor_P2_Nature_Candidate_01.blend'
if target.exists() and '--replace-own-candidate' not in sys.argv:raise RuntimeError('Preserve manual edits; version or explicitly rebuild only this own candidate')
bpy.ops.wm.save_as_mainfile(filepath=str(target),compress=True)
manifest={'schema':1,'scope':'Blender candidate only; runtime acceptance pending','master':target.relative_to(ROOT).as_posix(),'masterSha256':hashlib.sha256(target.read_bytes()).hexdigest(),'bounds':{k:v['bounds']for k,v in S['regions'].items()},'sources':sources,'placements':placements,'obstacles':obstacles,'rootFit':root_fit,'excludedBaseGrass':excluded,'shots':shot_manifest,'terrainHeightChanges':0,'existingNaturePlacementsChanged':0,'populationSlotsChanged':0}
(OUT/'candidate-placements.json').write_text(json.dumps(manifest,indent=2)+'\n');print('CANDIDATE_SAVED '+json.dumps({'trees':len(S['trees']),'obstacles':len(obstacles),'objects':len(placements),'rootFit':root_fit}),flush=True)
if '--no-render' not in sys.argv:
 for shot in shots:
  set_shot(shot);scene.render.filepath=str(OUT/(shot[0]+'.png'));bpy.ops.render.render(write_still=True);print('RENDERED '+shot[0],flush=True)
