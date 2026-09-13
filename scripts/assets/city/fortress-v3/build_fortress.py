"""Greenfall fortress: local measured architecture, independent of global world layout.
Blender 4.2.3. Input remains the approved P2 master; --activate writes its runtime replacement.
No service/actor identity, trading rules, portal or tavern interior is generated here.
"""
from pathlib import Path
from collections import defaultdict
import bpy,bmesh,json,math,hashlib,sys,struct,random
from mathutils import Vector
ROOT=Path(__file__).resolve().parents[4]
ART=ROOT/'art/city-fortress-v3';OUT=ROOT/'work/qa/fortress-v3/candidate';OUT.mkdir(parents=True,exist_ok=True)
BASE=70.14;TOP=74.34;PREFIX='courtyard:fortress-v3:'
data=json.loads((ART/'baseline-courtyard.json').read_text(encoding='utf-8'))
source_hashes=json.loads((ART/'sources.json').read_text(encoding='utf-8'))
assert hashlib.sha256((ROOT/source_hashes['master']).read_bytes()).hexdigest()==source_hashes['master_sha256'],'baseline master changed'
bpy.ops.wm.open_mainfile(filepath=str(ROOT/source_hashes['master']),load_ui=False,use_scripts=False)
factors=json.loads((ART/'baseline-material-factors.json').read_text(encoding='utf-8'))
# Remove the monolithic keep and old detached tower hats. All tavern cutaway groups remain intact.
removed_zones=('Courtyard_citadel_','Courtyard_citadel_detail_','Courtyard_tower_roofs_','Courtyard_gate_facade_')
for ob in list(bpy.context.scene.objects):
 if ob.name.startswith(removed_zones) or ob.name in ['Courtyard_paving_yard_cobbles','Courtyard_streets_road_cobbles']:
  bpy.data.objects.remove(ob,do_unlink=True)
old_roots=['Citadel_donjon','Donjon_gate','Donjon_turret_-1','Donjon_turret_1','Donjon_machicolations','Keep_front_arcade','Citadel_chapel','Chapel_bell_tower']
data['obstacles']=[o for o in data['obstacles'] if not any(o['id'].startswith('courtyard:'+k+':') for k in old_roots)]
data['props']=[p for p in data['props'] if p['id'] not in old_roots and not p['id'].startswith('Curtain_tower_roof_')]
# Old physical outer wall and its graphics are replaced through the existing local mechanism.
if 'FORT' not in data['tavern']['replacesLandmarks']:data['tavern']['replacesLandmarks'].append('FORT')
for b in data['p2City']['buildings']:
 if b['source']!='P2_gatehouse':continue
 ob=bpy.data.objects[b['root']];ob.location.z+=TOP-BASE
 for o in data['obstacles']:
  if o['id'].startswith(b['obstaclePrefix']):o['bottom']+=TOP-BASE;o['top']+=TOP-BASE
 for s in data['supportSurfaces']:
  if b['bounds'][0][0]-1<s['x']<b['bounds'][1][0]+1 and -b['bounds'][1][1]-1<s['z']<-b['bounds'][0][1]+1:s['y']+=TOP-BASE
 b['bounds'][0][2]+=TOP-BASE;b['bounds'][1][2]+=TOP-BASE;b['floor_y']=TOP
materials={}
for key,old in [('stone','fieldstone'),('trim','dressed_limestone'),('roof','slate'),('wood','weathered_oak'),('iron','iron'),('dark','recess'),('banner','indigo'),('gold','brass'),('soil','yard_cobbles'),('road','road_cobbles')]:
 materials[key]=bpy.data.materials.get(old)
 assert materials[key],old
# Match both Blender review and exported native base-colour factors.
for mat in bpy.data.materials:
 if mat.name not in factors or not mat.use_nodes:continue
 bs=mat.node_tree.nodes.get('Principled BSDF')
 if not bs:continue
 factor=factors[mat.name]
 if bs.inputs['Base Color'].is_linked:
  link=bs.inputs['Base Color'].links[0];source=link.from_socket;mat.node_tree.links.remove(link)
  mul=mat.node_tree.nodes.new('ShaderNodeMixRGB');mul.blend_type='MULTIPLY';mul.inputs[0].default_value=1;mul.inputs[2].default_value=factor
  mat.node_tree.links.new(source,mul.inputs[1]);mat.node_tree.links.new(mul.outputs[0],bs.inputs['Base Color'])
 else:bs.inputs['Base Color'].default_value=factor
batches=defaultdict(lambda:{'v':[],'f':[],'uv':[]})
obstacles=data['obstacles'];supports=data['supportSurfaces'];group='defense'
def mesh(name,verts,faces,mat='stone',uv_scale=2.2):
 key=(group,mat);g=batches[key];offset=len(g['v']);g['v'].extend(verts)
 for face in faces:
  g['f'].append(tuple(offset+i for i in face))
  n=(Vector(verts[face[1]])-Vector(verts[face[0]])).cross(Vector(verts[face[2]])-Vector(verts[face[0]]))
  axis=max(range(3),key=lambda i:abs(n[i]));axes=[i for i in range(3) if i!=axis]
  g['uv'].extend((verts[i][axes[0]]/uv_scale,verts[i][axes[1]]/uv_scale) for i in face)
def box(name,center,size,mat='stone',yaw=0,solid=None):
 c,s=math.cos(yaw),math.sin(yaw);x,z,y=center;w,d,h=size
 pts=[(x+(a*w/2)*c-(b*d/2)*s,z+(a*w/2)*s+(b*d/2)*c,y+e*h/2) for a,b,e in [(-1,-1,-1),(1,-1,-1),(1,1,-1),(-1,1,-1),(-1,-1,1),(1,-1,1),(1,1,1),(-1,1,1)]]
 mesh(name,pts,[(0,3,2,1),(4,5,6,7),(0,1,5,4),(1,2,6,5),(2,3,7,6),(3,0,4,7)],mat)
 if solid is not None:obstacles.append({'id':PREFIX+name+':'+str(len(obstacles)),'kind':'box','x':x,'z':z,'halfX':w/2,'halfZ':d/2,'rotation':-yaw,'bottom':y-h/2,'top':y+h/2,'blocksMovement':solid})
def cylinder(name,x,z,low,r,h,mat='stone',top=None,n=20,solid=False):
 rt=r if top is None else top
 v=[(x+rr*math.cos(i*math.tau/n),z+rr*math.sin(i*math.tau/n),low+yy) for rr,yy in [(r,0),(rt,h)] for i in range(n)]
 f=[tuple(reversed(range(n))),tuple(range(n,2*n))]+[(i,(i+1)%n,(i+1)%n+n,i+n) for i in range(n)]
 mesh(name,v,f,mat)
 if solid:obstacles.append({'id':PREFIX+name,'kind':'circle','x':x,'z':z,'radius':max(r,rt),'bottom':low,'top':low+h,'blocksMovement':True})
def arch(name,x,z,low,rise,radius,depth=1.0,thickness=.58):
 for i in range(17):
  a=math.pi*i/17;b=math.pi*(i+1)/17
  v=[(x+rr*math.cos(t),zz,low+rise+rr*math.sin(t)) for zz in [z-depth/2,z+depth/2] for rr,t in [(radius,a),(radius,b),(radius+thickness,b),(radius+thickness,a)]]
  mesh(name,v,[(0,3,2,1),(4,5,6,7),(0,1,5,4),(1,2,6,5),(2,3,7,6),(3,0,4,7)],'trim')
 # Clearance is an explicit overhang, never a whole-building collision hull.
 obstacles.append({'id':PREFIX+name+':overhead','kind':'box','x':x,'z':z,'halfX':radius+thickness,'halfZ':depth/2,'rotation':0,'bottom':low+rise+radius*.85,'top':low+rise+radius+thickness,'blocksMovement':False})
def roof(name,x,z,w,d,base,rise,mat='roof'):
 v=[(x-w/2,z-d/2,base),(x+w/2,z-d/2,base),(x-w/2,z+d/2,base),(x+w/2,z+d/2,base),(x-w*.32,z,base+rise),(x+w*.32,z,base+rise)]
 mesh(name,v,[(0,1,5,4),(2,4,5,3),(0,4,2),(1,3,5)],mat)
 box(name+'_ridge',(x,z,base+rise+.08),(w*.68,.28,.22),'trim')
 # Small horizontal subdivisions keep camera collision close to the actual pitched roof.
 for ix in range(math.ceil(w/2)):
  for iz in range(math.ceil(d/2)):
   sx=w/math.ceil(w/2);sz=d/math.ceil(d/2);xx=x-w/2+(ix+.5)*sx;zz=z-d/2+(iz+.5)*sz
   yy=base+rise*(1-abs(zz-z)/(d/2))
   obstacles.append({'id':PREFIX+name+':roof:'+str(ix)+':'+str(iz),'kind':'box','x':xx,'z':zz,'halfX':sx/2,'halfZ':sz/2,'rotation':0,'bottom':yy-.35-rise*sz/d,'top':yy+.35+rise*sz/d,'blocksMovement':False})
def tower(name,x,z,r,h,base=BASE,roof_h=4.5):
 cylinder(name+'_battered_foot',x,z,base-1.5,r+.7,3.0,top=r,solid=True)
 cylinder(name+'_shaft',x,z,base+.6,r,h-.6,solid=True)
 for yy in [base+3,base+h*.55,base+h-.25]:cylinder(name+'_course',x,z,yy,r+.18,.32,'trim')
 for i in range(16):
  a=math.tau*i/16;rr=r+.20
  box(name+'_corbel',(x+rr*math.cos(a),z+rr*math.sin(a),base+h-.65),(.5,.95,.9),'trim',a)
 cylinder(name+'_gallery',x,z,base+h,r+.65,.55,'trim')
 for i in range(12):
  a=math.tau*(i+.5)/12;rr=r+.20
  box(name+'_parapet',(x+rr*math.cos(a),z+rr*math.sin(a),base+h+1.05),(.8,1.15,1.0),'stone',a)
 cylinder(name+'_slate_roof',x,z,base+h+1.3,r+.42,roof_h,'roof',top=.24,n=8)
 cylinder(name+'_finial',x,z,base+h+1.3+roof_h,.12,.85,'iron',top=.04,n=8)
 for level in [base+5.3,base+h-3.8]:
  for i in range(6):
   a=math.tau*i/6;rr=r+.015
   # Deep narrow openings and stone jambs, with no painted large black squares.
   box(name+'_slit',(x+rr*math.cos(a),z+rr*math.sin(a),level),(.065,.40,1.45),'dark',a)
   for side in [-1,1]:
    box(name+'_slit_jamb',(x+(rr+.08)*math.cos(a)-side*.29*math.sin(a),z+(rr+.08)*math.sin(a)+side*.29*math.cos(a),level),(.21,.17,1.73),'trim',a)
   box(name+'_slit_sill',(x+(rr+.1)*math.cos(a),z+(rr+.1)*math.sin(a),level-.82),(.32,.91,.20),'trim',a)
# Octagonal curtain: wall sections actually meet at their clipped corners.
outline=[(-163,-224),(-110,-224),(-90,-224),(-37,-224),(-17,-204),(-17,-96),(-37,-76),(-163,-76),(-183,-96),(-183,-204)]
for idx,(a,b) in enumerate(zip(outline,outline[1:]+outline[:1])):
 if idx==1:continue
 dx,dz=b[0]-a[0],b[1]-a[1];length=math.hypot(dx,dz);yaw=math.atan2(dz,dx);mx,mz=(a[0]+b[0])/2,(a[1]+b[1])/2
 # Clockwise exterior lies to the right of the walking direction.
 nx,nz=dz/length,-dx/length
 box('curtain_body',(mx,mz,BASE+5.9),(length+.15,3.6,11.8),'stone',yaw,True)
 box('curtain_foot',(mx,mz,BASE+.3),(length+.4,4.65,1.1),'trim',yaw,True)
 box('wall_walk',(mx-nx*.7,mz-nz*.7,BASE+10.7),(length+.4,4.2,.55),'trim',yaw,False)
 box('parapet_course',(mx+nx*1.65,mz+nz*1.65,BASE+11.7),(length+.2,.75,1.3),'stone',yaw)
 for j in range(max(2,round(length/2.5))):
  t=(j+.5)/max(2,round(length/2.5));x=a[0]+dx*t;z=a[1]+dz*t
  box('crenel',(x+nx*1.65,z+nz*1.65,BASE+12.8),(1.15,.95,1.35),'stone',yaw)
  box('crenel_cap',(x+nx*1.65,z+nz*1.65,BASE+13.53),(1.35,1.12,.19),'trim',yaw)
 for j in range(max(1,round(length/11))):
  t=(j+.5)/max(1,round(length/11));x=a[0]+dx*t;z=a[1]+dz*t
  box('wall_buttress',(x+nx*2.35,z+nz*2.35,BASE+4.4),(1.5,1.6,8.8),'stone',yaw,True)
  box('buttress_weather_cap',(x+nx*2.35,z+nz*2.35,BASE+8.85),(1.75,1.82,.24),'trim',yaw)
for name,x,z,r,h,roof_h in [('southwest',-175,-216,6.4,17,4.4),('southeast',-25,-216,6.4,17.5,4.4),('northwest',-175,-84,6.8,19,5),('northeast',-25,-84,6.3,16.5,4.2),('gate_west',-110,-224,5.4,18.5,4.8),('gate_east',-90,-224,5.4,18.5,4.8)]:
 tower(name,x,z,r,h,roof_h=roof_h)
arch('south_gate',-100,-224,BASE,4.15,4.45,3.8,.85)
for side in [-1,1]:box('gate_jamb',(-100+side*4.875,-224,BASE+2.075),(.85,3.8,4.15),'trim',solid=True)
# Solid spandrels connect the voussoirs to the overhead bridge. The opening stays empty.
for i in range(20):
 a=-5.3+i*10.6/20;b=-5.3+(i+1)*10.6/20
 ya=BASE+4.15+math.sqrt(max(0,5.3**2-a*a));yb=BASE+4.15+math.sqrt(max(0,5.3**2-b*b));high=BASE+10.95
 verts=[(-100+xx,zz,yy) for zz in [-225.9,-222.1] for xx,yy in [(a,ya),(b,yb),(b,high),(a,high)]]
 mesh('gate_spandrel',verts,[(0,3,2,1),(4,5,6,7),(0,1,5,4),(1,2,6,5),(2,3,7,6),(3,0,4,7)],'stone')
 obstacles.append({'id':PREFIX+'gate-spandrel:'+str(i),'kind':'box','x':-100+(a+b)/2,'z':-224,'halfX':(b-a)/2,'halfZ':1.9,'rotation':0,'bottom':min(ya,yb),'top':high,'blocksMovement':False})

box('gate_bridge',(-100,-224,BASE+12.4),(10.3,5.0,3.1),'stone',solid=False)
for x in [-103.9,-96.1]:box('gate_chain',(x,-225.4,BASE+9.9),(.10,.10,8.0),'iron')
for x in range(-104,-95):box('raised_gate_bar',(x,-224.2,BASE+13),(.10,.16,5.3),'iron')
for h in [11,13.5,15]:box('gate_iron_transom',(-100,-224.2,BASE+h),(8.4,.16,.12),'iron')
# Upper court: physical support ramp and perimeter retaining masonry share the exact vertices.
group='citadel'
box('terrace_foundation',(-100,-101.5,(BASE+TOP-.12)/2),(112,43,TOP-BASE-.12),'stone')
box('terrace_paving',(-100,-101.5,TOP-.025),(112,43,.05),'road')
supports.append({'id':'fortress-v3-upper-court','kind':'plate','x':-100,'z':101.5,'halfX':56,'halfZ':21.5,'angle':0,'y':TOP})
for x1,x2 in [(-156,-107.2),(-92.8,-44)]:
 box('terrace_front',((x1+x2)/2,-123,(BASE+TOP)/2),(x2-x1,1.0,TOP-BASE),'stone',solid=True)
 box('terrace_coping',((x1+x2)/2,-123,TOP+.22),(x2-x1+.2,1.3,.44),'trim',solid=True)
for x in [-156,-44]:box('terrace_side',(x,-101.5,(BASE+TOP)/2),(1,43,TOP-BASE),'stone',solid=True)
for x in [-156,-44]:box('terrace_side_guard',(x,-101.5,TOP+.54),(1,43,1.08),'stone',solid=True)
box('terrace_north_guard',(-100,-80,TOP+.54),(112,1,1.08),'stone',solid=True)
# 25 m long / 13 m wide; slope 9.54 degrees; exact planar support evaluated by both runtimes.
rx=-100;lowz=-148;highz=-123;half=6.5
mesh('citadel_approach',[(rx-half,lowz,BASE),(rx+half,lowz,BASE),(rx+half,highz,TOP),(rx-half,highz,TOP)],[(0,1,2,3)],'road')
supports.append({'id':'fortress-v3-citadel-ramp','kind':'ramp_z','x':rx,'z':-(lowz+highz)/2,'halfX':half,'halfZ':(highz-lowz)/2,'angle':0,'y':BASE,'high':TOP})
for side in [-1,1]:
 x=rx+side*(half+.45)
 mesh('ramp_cheek',[(x-.35,lowz,BASE),(x+.35,lowz,BASE),(x+.35,highz,BASE),(x-.35,highz,BASE),(x-.35,lowz,BASE+.45),(x+.35,lowz,BASE+.45),(x+.35,highz,TOP+.45),(x-.35,highz,TOP+.45)],[(0,3,2,1),(4,5,6,7),(0,1,5,4),(1,2,6,5),(2,3,7,6),(3,0,4,7)],'stone')
 # Bounded 1 m ramp edge colliders follow the slope, never fill the main lane.
 for j in range(25):
  z=lowz+j+.5;y=BASE+(TOP-BASE)*(j+.5)/25
  obstacles.append({'id':PREFIX+'ramp-cheek:'+str(side)+':'+str(j),'kind':'box','x':x,'z':z,'halfX':.35,'halfZ':.5,'rotation':0,'bottom':BASE,'top':y+.5,'blocksMovement':True})
# The donjon is a lower hall linked to one main tower and a smaller rear tower.
box('great_hall',(-101,-95,TOP+7.2),(31,28,14.4),'stone',solid=True)
for h in [.5,5.5,10.9,14.25]:box('hall_course',(-101,-95,TOP+h),(31.55,28.55,.32),'trim')
roof('great_hall_roof',-101,-95,32.6,29.6,TOP+14.6,5.5)
tower('main_donjon',-116,-94,5.3,24,base=TOP,roof_h=5.2)
tower('rear_stair_tower',-84,-86,4.0,18.7,base=TOP,roof_h=4.4)
# Front stone porch: deep arches and a clear 3 m cross passage beneath the eave.
for x in [-114,-107,-95,-88]:box('hall_arcade_pier',(x,-113,TOP+2.75),(.72,.85,5.5),'stone',solid=True)
for x in [-110.5,-91.5]:arch('hall_arcade',x,-113,TOP,3.65,3.1,.8,.5)
box('hall_arcade_lintel',(-101,-113,TOP+6.9),(28,.95,1.25),'stone',solid=False)
box('hall_entry_door',(-101,-109.08,TOP+2.6),(4.6,.18,5.2),'wood')
arch('hall_door',-101,-109.35,TOP,3.05,2.4,.75,.5)
for xx in [-112,-105,-97,-90]:
 for h in [7.5,11.9]:
  box('hall_window_recess',(xx,-109.05,TOP+h),(1.25,.12,2.0),'dark')
  for dx in [-.77,.77]:box('hall_window_jamb',(xx+dx,-109.15,TOP+h),(.24,.4,2.38),'trim')
  for yy in [-1.15,1.15]:box('hall_window_course',(xx,-109.15,TOP+h+yy),(1.8,.45,.24),'trim')
# Keep the two source-derived side gatehouses; new short roofed galleries connect to their masonry.
for x,w in [(-137,22),(-65,20)]:
 box('upper_gallery_back',(x,-90.0,TOP+3.5),(w,.85,7),'stone',solid=True)
 for xx in [x-w/2+.5,x,x+w/2-.5]:box('upper_gallery_column',(xx,-96.8,TOP+2.8),(.7,.7,5.6),'stone',solid=True)
 roof('upper_gallery',x,-93.5,w+1,8,TOP+6.3,2.6)
# Continuous ground material and loop mask. Existing route points stay exact.
group='ground'
streets=data['quarter']['streets']
new_streets=[{'name':'Northern ring connection','points':[{'x':-140.5,'z':-153},{'x':-119,'z':-153},{'x':-100,'z':-151},{'x':-90,'z':-151},{'x':-69,'z':-151}], 'width':4.5},
 {'name':'Eastern alehouse lane','points':[{'x':-90,'z':-196},{'x':-74,'z':-196},{'x':-70,'z':-204},{'x':-69,'z':-212},{'x':-51,'z':-215},{'x':-44,'z':-208},{'x':-44,'z':-190},{'x':-44,'z':-167},{'x':-49,'z':-146}], 'width':3.6}]
data['quarter']['streets'].extend(new_streets)
def inside(x,z):
 polygon=[(-162,-220),(-38,-220),(-21,-203),(-21,-97),(-38,-80),(-162,-80),(-179,-97),(-179,-203)]
 hit=False
 for a,b in zip(polygon,polygon[1:]+polygon[:1]):
  if (a[1]>z)!=(b[1]>z) and x<(b[0]-a[0])*(z-a[1])/(b[1]-a[1])+a[0]:hit=not hit
 return hit
segments=[]
for street in streets:
 for a,b in zip(street['points'],street['points'][1:]):segments.append((a['x'],a['z'],b['x'],b['z'],street['width']/2))
def road_weight(x,z):
 weight=0
 for ax,az,bx,bz,width in segments:
  dx,dz=bx-ax,bz-az;t=max(0,min(1,((x-ax)*dx+(z-az)*dz)/(dx*dx+dz*dz or 1)))
  gap=math.hypot(x-ax-t*dx,z-az-t*dz)
  weight=max(weight,max(0,min(1,(width+.55-gap)/1.1)))
 # Market and well courts are paving fields, not isolated raised squares.
 for cx,cz,rx,rz in [(-108,-190,17,12),(-115,-151,13,10),(-48,-148,11,17)]:
  weight=max(weight,max(0,min(1,(1-math.hypot((x-cx)/rx,(z-cz)/rz))*4)))
 return weight
v=[];f=[];col=[];uv=[]
for z in range(-220,-80):
 for x in range(-179,-21):
  if not inside(x+.5,z+.5):continue
  index=len(v)
  for dx,dz in [(0,0),(1,0),(1,1),(0,1)]:
   xx,zz=x+dx,z+dz;v.append((xx,zz,BASE+.005));col.append(road_weight(xx,zz));uv.append((xx/4,zz/4))
  f.append((index,index+1,index+2,index+3))
me=bpy.data.meshes.new('F3_ground_continuous');me.from_pydata(v,[],f);me.update();layer=me.uv_layers.new();colors=me.color_attributes.new(name='Col',type='FLOAT_COLOR',domain='CORNER')
for i,loop in enumerate(me.loops):layer.data[i].uv=uv[loop.vertex_index];weight=col[loop.vertex_index];colors.data[i].color=(weight,weight,weight,1)
ob=bpy.data.objects.new(me.name,me);bpy.context.collection.objects.link(ob);ob.data.materials.append(materials['soil'])
# Batches bound draw calls, while all authored measured parts retain their collision IDs.
for (zone,mat),g in batches.items():
 me=bpy.data.meshes.new('F3_'+zone+'_'+mat);me.from_pydata(g['v'],[],g['f']);me.update();uv=me.uv_layers.new()
 for i,xy in enumerate(g['uv']):uv.data[i].uv=xy
 ob=bpy.data.objects.new(me.name,me);bpy.context.collection.objects.link(ob);ob.data.materials.append(materials[mat])
# Remove empty unchanged source roots to keep transforms deterministic.
for ob in list(bpy.context.scene.objects):
 if ob.type=='EMPTY' and not ob.children:bpy.data.objects.remove(ob,do_unlink=True)
for image in bpy.data.images:
 if image.source=='FILE' and image.has_data and not image.packed_file:image.pack()
data['fortressV3']={'revision':1,'transitZones':[{'polygon': [[-156, -80], [-44, -80], [-44, -123], [-93.5, -123], [-93.5, -148], [-106.5, -148], [-106.5, -123], [-156, -123]], 'exit': [{'x': -100, 'z': -121}, {'x': -100, 'z': -153}]}, {'polygon': [[-163, -224], [-110, -224], [-90, -224], [-37, -224], [-17, -204], [-17, -96], [-37, -76], [-163, -76], [-183, -96], [-183, -204]], 'exit': [{'x': -100, 'z': -214}, {'x': -100, 'z': -236}]}],'outerOutlineServer':outline,'gateClearWidth':7.8,'gateClearHeight':8.0,'wallWalk':'visible; not player-accessible','upperCourtY':TOP,'ramp':{'from':[-100,-148,BASE],'to':[-100,-123,TOP],'width':13,'length':25,'slopeDegrees':math.degrees(math.atan((TOP-BASE)/25))},'preserves':['13 service IDs and coordinates','39 residents and routes','5 wildlife','Black Raven interior'],'addedStreetIds':[s['name'] for s in new_streets],'replacesOuterLandmark':'FORT','generator':'scripts/assets/city/fortress-v3/build_fortress.py'}
# Existing imported house identities remain present; historical P2 metadata is augmented, not repurposed.
(OUT/'courtyard.json').write_text(json.dumps(data,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
bpy.ops.wm.save_as_mainfile(filepath=str(ROOT/'art/city-fortress-v3/Greenfall_Fortress_v3.blend'))
bpy.ops.export_scene.gltf(filepath=str(OUT/'courtyard.glb'),export_format='GLB',export_yup=True,export_apply=True,export_animations=False,export_extras=True,export_vertex_color='ACTIVE',export_all_vertex_colors=False)
# glTF exporter does not serialize the Blender multiply nodes; preserve the exact explicit factors.
p=OUT/'courtyard.glb';raw=p.read_bytes();size=struct.unpack_from('<I',raw,12)[0];doc=json.loads(raw[20:20+size]);tail=raw[20+size:]
for mat in doc.get('materials',[]):
 if mat['name'] in factors:mat.setdefault('pbrMetallicRoughness',{})['baseColorFactor']=factors[mat['name']]
packed=json.dumps(doc,separators=(',',':'),ensure_ascii=False).encode();packed+=b' '*((-len(packed))%4)
p.write_bytes(struct.pack('<4sII',b'glTF',2,20+len(packed)+len(tail))+struct.pack('<I4s',len(packed),b'JSON')+packed+tail)
import runpy
ground_receipt=runpy.run_path(str(Path(__file__).with_name('fix_ground_attributes.py')))['repair'](p,OUT/'courtyard.json')
receipt={'sha256':hashlib.sha256(p.read_bytes()).hexdigest(),'bytes':len(p.read_bytes()),'obstacles':len(obstacles),'supports':len(supports),'batches':len(batches),'vertices_added':sum(len(g['v']) for g in batches.values())+len(v),'scene_objects':len(bpy.context.scene.objects),'architecture':data['fortressV3'],'groundAttributes':ground_receipt}
(OUT/'geometry.json').write_text(json.dumps(receipt,indent=2),encoding='utf-8');print('FORTRESS_V3_READY',json.dumps(receipt),flush=True)
