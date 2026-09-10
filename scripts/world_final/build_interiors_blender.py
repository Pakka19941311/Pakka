"""Author real, separate mine/cave shells in Blender from the editable C layout.

Floors, inward-facing ceilings, thick walls and fitted timber/rock features are
saved in a versioned native master. Exports never touch the accepted surface.
"""
from pathlib import Path
import bpy,bmesh,json,math,hashlib,sys
import numpy as np
from mathutils import Vector
ROOT=Path(__file__).resolve().parents[2]
OUT=ROOT/'godot-pc/world-final/interiors'
layout=json.loads((OUT/'spaces.json').read_text('utf-8'))
source=ROOT/'art/world-final'/('Varendor_Interiors_'+layout['revision']+'.blend')
if source.exists():raise RuntimeError('Preserve existing native source; use a new authored revision')
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.context.scene.unit_settings.system='METRIC'

def material(name,color,texture=None,normal=None):
    m=bpy.data.materials.new(name);m.use_nodes=True;m.use_backface_culling=True
    p=m.node_tree.nodes.get('Principled BSDF');p.inputs['Base Color'].default_value=(*color,1);p.inputs['Roughness'].default_value=.85
    for path,socket,normal_map in [(texture,'Base Color',False),(normal,'Normal',True)]:
        if path and path.exists():
            image=bpy.data.images.load(str(path),check_existing=True);image.pack()
            tex=m.node_tree.nodes.new('ShaderNodeTexImage');tex.image=image
            if normal_map:
                image.colorspace_settings.name='Non-Color';n=m.node_tree.nodes.new('ShaderNodeNormalMap');n.inputs['Strength'].default_value=.5
                m.node_tree.links.new(tex.outputs['Color'],n.inputs['Color']);m.node_tree.links.new(n.outputs['Normal'],p.inputs[socket])
            else:m.node_tree.links.new(tex.outputs['Color'],p.inputs[socket])
    return m
rock_dir=ROOT/'art/world-final/materials/rock_wall_02'
rock=material('C_Excavated_Stone',(.12,.145,.155),rock_dir/'rock_wall_02_diff_1k.jpg',rock_dir/'rock_wall_02_nor_gl_1k.jpg')
rough=bpy.data.images.load(str(rock_dir/'rock_wall_02_rough_1k.jpg'),check_existing=True);rough.colorspace_settings.name='Non-Color';rough.pack()
rough_node=rock.node_tree.nodes.new('ShaderNodeTexImage');rough_node.image=rough
rock.node_tree.links.new(rough_node.outputs['Color'],rock.node_tree.nodes.get('Principled BSDF').inputs['Roughness'])
ground=material('C_Wet_Earth',(.12,.105,.075),ROOT/'public/assets/world/brown_mud/diff.jpg',ROOT/'public/assets/world/brown_mud/nor_gl.jpg')
timber=material('C_Aged_Mine_Timber',(.16,.10,.05),ROOT/'godot-pc/generated/world_medieval_wood_albedo.jpg',ROOT/'godot-pc/generated/world_medieval_wood_normal.jpg')
iron=material('C_Old_Iron',(.035,.04,.045));iron.node_tree.nodes.get('Principled BSDF').inputs['Metallic'].default_value=.65
mineral=material('C_Stone_Fracture',(.20,.215,.19))

def xyz(x,y,z):return (x,-z,y)
def floor_y(x,z):return .014*z+.11*math.sin(x*.12+z*.035)*math.sin(z*.11)
def ceiling_y(space,x,z):
    h=space['tunnel_height']
    for room in space['rooms']:
        cx,cz=room['center'];rx,rz=room['radii'];d=((x-cx)/rx)**2+((z-cz)/rz)**2
        h=max(h,room['height']-(d*.24)*room['height'])
    return floor_y(x,z)+h+.7*math.sin(x*.15+z*.06)*math.cos(z*.17)
def make_mesh(name,verts,faces,mat,coll,uv_kind='floor'):
    data=bpy.data.meshes.new(name);data.from_pydata(verts,[],faces);data.update()
    o=bpy.data.objects.new(name,data);coll.objects.link(o);data.materials.append(mat)
    o['space_id']=coll['space_id'];o['native_geometry']=True
    uv=data.uv_layers.new(name='UVMap')
    for poly in data.polygons:
        poly.use_smooth=uv_kind=='wall'
        for loop in poly.loop_indices:
            v=data.vertices[data.loops[loop].vertex_index].co
            uv.data[loop].uv=(v.x/3,v.y/3) if uv_kind=='floor' else ((v.x if abs(poly.normal.x)<.7 else v.y)/3,v.z/3)
    return o
def block(name,pos,size,mat,coll):
    x,y,z=pos;sx,sy,sz=size
    verts=[xyz(x+dx*sx/2,y+dy*sy,z+dz*sz/2) for dx,dy,dz in [(-1,0,-1),(1,0,-1),(1,0,1),(-1,0,1),(-1,1,-1),(1,1,-1),(1,1,1),(-1,1,1)]]
    return make_mesh(name,verts,[(0,1,2,3),(4,7,6,5),(0,4,5,1),(1,5,6,2),(2,6,7,3),(3,7,4,0)],mat,coll,'wall')

def smooth_union(a,b,k):
    h=np.maximum(k-np.abs(a-b),0)/k
    return np.minimum(a,b)-h*h*k*.25
def field(space,x,z):
    value=np.full(x.shape,10000.)
    for room in space['rooms']:
        cx,cz=room['center'];rx,rz=room['radii']
        d=(np.sqrt(((x-cx)/rx)**2+((z-cz)/rz)**2)-1)*min(rx,rz)
        value=smooth_union(value,d,3)
    for corridor in space['corridors']:
        for a,b in zip(corridor['points'],corridor['points'][1:]):
            dx,dz=b[0]-a[0],b[1]-a[1];t=np.clip(((x-a[0])*dx+(z-a[1])*dz)/(dx*dx+dz*dz),0,1)
            d=np.hypot(x-a[0]-dx*t,z-a[1]-dz*t)-corridor['width']/2
            value=smooth_union(value,d,2)
    noise=(np.sin(x*.39+np.cos(z*.21))*np.sin(z*.28)+.3*np.cos(x*.85-z*.47))*space['rock_variation']
    return np.maximum(value+noise,z-10)

reports=[]
for space in layout['spaces']:
    sid=space['id'];coll=bpy.data.collections.new(sid);coll['space_id']=sid;bpy.context.scene.collection.children.link(coll)
    minx,minz,maxx,maxz=space['bounds'];cols=int(maxx-minx);rows=int(maxz-minz)
    xx,zz=np.meshgrid(np.arange(minx,maxx+1),np.arange(minz,maxz+1));signed=field(space,xx,zz)
    floor_grid=np.array([[floor_y(x,z) for x in range(minx,maxx+1)] for z in range(minz,maxz+1)],dtype='<f4')
    floor_grid.tofile(OUT/(sid+'-floor.f32'))
    verts=[];faces=[];index={};edges=[]
    def vertex(p):
        key=tuple(round(float(v),6) for v in p)
        if key not in index:index[key]=len(verts);verts.append(xyz(key[0],floor_y(*key),key[1]))
        return index[key]
    for row in range(rows):
        for col in range(cols):
            corners=[(minx+col,minz+row),(minx+col,minz+row+1),(minx+col+1,minz+row+1),(minx+col+1,minz+row)]
            values=[signed[row,col],signed[row+1,col],signed[row+1,col+1],signed[row,col+1]]
            if min(values)>0:continue
            for tri in [(0,1,2),(0,2,3)]:
                poly=[];crossings=[]
                for ai,bi in zip(tri,tri[1:]+tri[:1]):
                    a=np.array(corners[ai]);b=np.array(corners[bi]);fa,fb=values[ai],values[bi]
                    if fa<=0:poly.append(a)
                    if (fa<=0)!=(fb<=0):
                        p=a+(b-a)*fa/(fa-fb);poly.append(p);crossings.append(p)
                if len(poly)<3:continue
                ids=[vertex(p) for p in poly]
                for i in range(1,len(ids)-1):
                    if len(set([ids[0],ids[i],ids[i+1]]))==3:faces.append((ids[0],ids[i],ids[i+1]))
                if len(crossings)==2:
                    # Determine boundary direction from the clipped clockwise polygon.
                    for i,p in enumerate(poly):
                        q=poly[(i+1)%len(poly)]
                        if all(any(np.linalg.norm(t-c)<1e-5 for c in crossings) for t in [p,q]):
                            if np.linalg.norm(q-p)>1e-5:edges.append((p,q))
    floor=make_mesh(sid+'_Floor',verts,faces,ground,coll)
    ceilverts=[(x,by,ceiling_y(space,x,-by)) for x,by,y in verts]
    ceiling=make_mesh(sid+'_Ceiling',ceilverts,[tuple(reversed(f)) for f in faces],rock,coll,'wall')
    wallverts=[];wallfaces=[];obstacles=[]
    # Adjacent wall panels must share the same displaced endpoint. Per-edge
    # normals left thin gaps in C-01; average the contour normal per vertex.
    boundary_normals={}
    def boundary_key(p):return tuple(round(float(v),6) for v in p)
    for a,b in edges:
        d=b-a;n=np.array([-d[1],d[0]])/np.linalg.norm(d)
        for p in [a,b]:boundary_normals[boundary_key(p)]=boundary_normals.get(boundary_key(p),np.zeros(2))+n
    boundary_normals={k:v/np.linalg.norm(v) for k,v in boundary_normals.items()}
    active_degree={}
    for a,b in edges:
        middle=(a+b)/2
        if middle[1]>9.95 and abs(middle[0])<space['entrance_half_width']+.2:continue
        for p in [a,b]:active_degree[boundary_key(p)]=active_degree.get(boundary_key(p),0)+1
    for edge,(a,b) in enumerate(edges):
        middle=(a+b)/2
        if middle[1]>9.95 and abs(middle[0])<space['entrance_half_width']+.2:continue
        d=b-a;length=np.linalg.norm(d);outward=np.array([-d[1],d[0]])/length
        start=len(wallverts)
        for side in [0,1]:
            for band in range(6):
                t=band/5
                for point in [a,b]:
                    # Relief grows into the surrounding rock, preserving passage.
                    relief=(.25+.6*math.sin(t*math.pi)+.22*math.sin(point[0]*.3+point[1]*.23+band)) if band not in (0,5) else 0
                    p=point+boundary_normals[boundary_key(point)]*(relief+side*1.2)
                    y=floor_y(*point)*(1-t)+ceiling_y(space,*point)*t
                    wallverts.append(xyz(p[0],y,p[1]))
            for band in range(5):
                i=start+side*12+band*2
                face=(i,i+2,i+3,i+1)
                wallfaces.append(face if side==0 else tuple(reversed(face)))
        for band in [0,5]:
            i=start+band*2;wallfaces.append((i,i+1,i+13,i+12))
        # Seal the exposed cut through the rock at each entrance shoulder.
        for endpoint,point in enumerate([a,b]):
            if active_degree[boundary_key(point)]==1:
                for band in range(5):
                    i=start+band*2+endpoint
                    cap=(i,i+12,i+14,i+2)
                    wallfaces.append(cap if endpoint==0 else tuple(reversed(cap)))
        obstacles.append({'id':f'{sid}_wall_{edge}','source_mesh':sid+'_Walls','kind':'box','x':float(middle[0]),'z':float(-middle[1]),'halfX':float(length/2+.015),'halfZ':.18,'rotation':float(math.atan2(d[1],d[0])),'bottom':floor_y(*middle)-.5,'top':ceiling_y(space,*middle)+.5,'blocksMovement':True})
    walls=make_mesh(sid+'_Walls',wallverts,wallfaces,rock,coll,'wall')
    bm=bmesh.new();bm.from_mesh(walls.data)
    # Blender stores mesh positions as float32; at 350m, 0.00001m is below
    # coordinate precision. A 0.1mm weld closes coincident wall boundaries.
    bmesh.ops.remove_doubles(bm,verts=list(bm.verts),dist=.0001)
    open_wall_edges=sum(e.is_boundary for e in bm.edges)
    assert open_wall_edges==0,(sid,open_wall_edges)
    bmesh.ops.recalc_face_normals(bm,faces=list(bm.faces))
    bm.to_mesh(walls.data);bm.free();walls.data.update()
    if sid=='mine':
        # Fitted timber supports along the narrower connecting galleries.
        for corridor in space['corridors']:
            for segment,(a,b) in enumerate(zip(corridor['points'],corridor['points'][1:])):
                a=np.array(a);b=np.array(b);d=b-a;length=np.linalg.norm(d);normal=np.array([-d[1],d[0]])/length
                for station,t in enumerate(np.arange(8,length-4,11)/length):
                    center=a+d*t;half=corridor['width']/2-.7;y=floor_y(*center);h=space['tunnel_height']-.45
                    # Axis-aligned robust support set follows each local corridor.
                    for side in [-1,1]:
                        p=center+normal*half;name=f'MineProp_{corridor["id"]}_{segment}_{station}_{side}'
                        block(name,(p[0],floor_y(*p),p[1]),(.5,h,.5),timber,coll)
                        obstacles.append({'id':name,'source_mesh':name,'kind':'box','x':float(p[0]),'z':float(-p[1]),'halfX':.25,'halfZ':.25,'rotation':0,'bottom':floor_y(*p),'top':floor_y(*p)+h,'blocksMovement':True})
                    p1=center-normal*half;p2=center+normal*half
                    beam=block(f'MineBeam_{corridor["id"]}_{segment}_{station}',(center[0],y+h-.25,center[1]),(2*half+.5,.45,.5),timber,coll)
                    pivot=Vector(xyz(center[0],y+h-.25,center[1]));angle=-math.atan2(normal[1],normal[0])
                    from mathutils import Matrix
                    beam.matrix_world=Matrix.Translation(pivot)@Matrix.Rotation(angle,4,'Z')@Matrix.Translation(-pivot)
        for room in space['rooms'][2:]:
            cx,cz=room['center'];rx,rz=room['radii']
            def access_clearance(point):
                distances=[]
                for corridor in space['corridors']:
                    for a,b in zip(corridor['points'],corridor['points'][1:]):
                        a=np.array(a);b=np.array(b);d=b-a;t=np.clip(np.dot(point-a,d)/np.dot(d,d),0,1)
                        distances.append(np.linalg.norm(point-a-d*t)-corridor['width']/2)
                return min(distances)
            angles=np.arange(16)*math.tau/16
            angle=max(angles,key=lambda a:access_clearance(np.array([cx+math.cos(a)*rx*.72,cz+math.sin(a)*rz*.72])))
            for i in range(5):
                x=cx+math.cos(angle)*rx*.72-math.sin(angle)*(i-2)*1.5
                z=cz+math.sin(angle)*rz*.72+math.cos(angle)*(i-2)*1.5
                if access_clearance(np.array([x,z]))<1.2:continue
                block('OreCrate_'+room['id']+str(i),(x,floor_y(x,z),z),(1.25,.9,1.15),timber,coll)
    else:
        # Distinct local hanging formations; never a uniform grid of spikes.
        for room_index,room in enumerate(space['rooms'][1:]):
            cx,cz=room['center'];rx,rz=room['radii']
            for i in range(8):
                angle=.55*i+room_index*.9;x=cx+math.cos(angle)*rx*.72;z=cz+math.sin(angle)*rz*.65
                tall=2.5+1.1*(i%4);top=ceiling_y(space,x,z)
                bpy.ops.mesh.primitive_cone_add(vertices=9,radius1=.06,radius2=.6+.15*(i%3),depth=tall,location=xyz(x,top-tall/2,z))
                o=bpy.context.object;o.name=f'Stalactite_{room["id"]}_{i}'
                for c in list(o.users_collection):c.objects.unlink(o)
                coll.objects.link(o);o.data.materials.append(mineral)
    # Additional physical props use the same bounds as their authored meshes.
    bpy.context.view_layer.update()
    for obj in coll.objects:
        if not obj.name.startswith(('MineBeam_','OreCrate_')):continue
        points=[Vector(v) for v in obj.bound_box]
        low=Vector(tuple(min(p[i] for p in points) for i in range(3)));high=Vector(tuple(max(p[i] for p in points) for i in range(3)))
        center=obj.matrix_world@((low+high)/2);size=high-low
        obstacles.append({'id':obj.name,'source_mesh':obj.name,'kind':'box','x':center.x,'z':center.y,'halfX':size.x/2,'halfZ':size.y/2,'rotation':-obj.matrix_world.to_euler().z,'bottom':center.z-size.z/2,'top':center.z+size.z/2,'blocksMovement':obj.name.startswith('OreCrate_')})
    bpy.ops.object.select_all(action='DESELECT')
    for o in coll.objects:o.select_set(True)
    bpy.ops.export_scene.gltf(filepath=str(OUT/(sid+'.glb')),export_format='GLB',use_selection=True,export_animations=False,export_cameras=False,export_lights=False,export_yup=True)
    meta={'schema':1,'space_id':sid,'native_source':source.relative_to(ROOT).as_posix(),'layout_revision':layout['revision'],'glb_sha256':hashlib.sha256((OUT/(sid+'.glb')).read_bytes()).hexdigest(),'bounds':space['bounds'],'columns':cols,'rows':rows,'step':1,'floor':sid+'-floor.f32','floor_sha256':hashlib.sha256(floor_grid.tobytes()).hexdigest(),'obstacles':obstacles,'floor_vertices':len(verts),'floor_triangles':len(faces),'wall_segments':len(edges),'wall_endpoints_welded':True,'open_wall_edges':open_wall_edges,'shell_ceiling':True,'entrance_open':True,'main_game_integrated':False}
    (OUT/(sid+'.json')).write_text(json.dumps(meta,indent=2)+'\n',encoding='utf-8',newline='\n')
    reports.append({k:v for k,v in meta.items() if k!='obstacles'})
    print('INTERIOR_EXPORTED '+sid+' '+str(len(faces))+' floor triangles',flush=True)
    coll.hide_viewport=True
# Persist both independent authored collections in the same editable master.
for coll in bpy.data.collections:coll.hide_viewport=coll.name=='great_cave'
bpy.context.scene['source_layout']='godot-pc/world-final/interiors/spaces.json'
bpy.context.scene['review_status']='C interiors: geometry built; Godot traversal pending; no population yet'
bpy.ops.wm.save_as_mainfile(filepath=str(source),compress=True)
(ROOT/'docs/world-final/interiors-build.json').write_text(json.dumps({'source':source.relative_to(ROOT).as_posix(),'sha256':hashlib.sha256(source.read_bytes()).hexdigest(),'blender':bpy.app.version_string,'spaces':reports},indent=2)+'\n',encoding='utf-8',newline='\n')
print('INTERIORS_NATIVE_SAVED '+str(source),flush=True)
