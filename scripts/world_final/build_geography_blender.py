"""Materialize FINAL geography as editable Blender meshes and chunked GLBs.
Run with Blender 4.2.3 --background --python. Existing .blend masters are never
overwritten: each layout revision owns a new source file. These are stage-B
spatial models; detailed architecture and vegetation are later stages.
"""
from pathlib import Path
import bpy, hashlib, json, math, sys
import numpy as np
from mathutils import Vector, Matrix

ROOT=Path(__file__).resolve().parents[2]
GEO=ROOT/'godot-pc/world-final/geography'
layout=json.loads((ROOT/'godot-pc/world-final/world_layout.json').read_text('utf-8'))
meta=json.loads((GEO/'terrain.json').read_text('utf-8'))
data=np.load(GEO/'terrain-data.npz');height=data['heights'];masks=data['colors']
source=ROOT/'art/world-final'/('Varendor_Geography_'+layout['revision']+'.blend')
if source.exists():raise RuntimeError('Native master exists; do not overwrite manual Blender work: '+str(source))
source.parent.mkdir(parents=True,exist_ok=True)
(GEO/'chunks').mkdir(parents=True,exist_ok=True)
bpy.ops.wm.read_factory_settings(use_empty=True)
scene=bpy.context.scene;scene.unit_settings.system='METRIC';scene.unit_settings.scale_length=1
def collection(name):
    c=bpy.data.collections.new(name);scene.collection.children.link(c);return c
terrain_collection=collection('01_Terrain_128m_Shared_Edges')
water_collection=collection('02_Water_Basins_And_Flow')
landmark_collection=collection('03_Editable_Spatial_Landmarks_STAGE_B')
def material(name,color):
    m=bpy.data.materials.new(name);m.use_nodes=True
    m.node_tree.nodes.get('Principled BSDF').inputs['Base Color'].default_value=(*color,1)
    m.node_tree.nodes.get('Principled BSDF').inputs['Roughness'].default_value=.86
    return m
earth=material('Geography_B_Vertex_Terrain',(1,1,1))
vcolor=earth.node_tree.nodes.new('ShaderNodeVertexColor');vcolor.layer_name='Color'
earth.node_tree.links.new(vcolor.outputs['Color'],earth.node_tree.nodes.get('Principled BSDF').inputs['Base Color'])
stone=material('B_Fieldstone',(.34,.34,.31));roof=material('B_Slate',(.14,.19,.21))
wood=material('B_Old_Timber',(.20,.14,.095));plaster=material('B_Plaster',(.50,.47,.38))
water=material('B_Water',(.05,.18,.21));water.node_tree.nodes.get('Principled BSDF').inputs['Roughness'].default_value=.23
dark=material('B_Shadowed_Entrances',(.03,.034,.031))

def mesh(name,verts,faces,mat,coll):
    m=bpy.data.meshes.new(name);m.from_pydata(verts,[],faces);m.update()
    o=bpy.data.objects.new(name,m);coll.objects.link(o);m.materials.append(mat)
    o['world_stage']='B spatial geography; not final art'
    return o

# Godot (x,y,z) -> Blender (x,-z,y), glTF's Y-up conversion restores Godot.
def xyz(p):return (p[0],-p[2],p[1])
def block(name,pos,size,mat,parent=None):
    x,y,z=pos;sx,sy,sz=size
    verts=[xyz((x+dx*sx/2,y+dy*sy,z+dz*sz/2)) for dx,dy,dz in
           [(-1,0,-1),(1,0,-1),(1,0,1),(-1,0,1),(-1,1,-1),(1,1,-1),(1,1,1),(-1,1,1)]]
    o=mesh(name,verts,[(0,1,2,3),(4,7,6,5),(0,4,5,1),(1,5,6,2),(2,6,7,3),(3,7,4,0)],mat,landmark_collection)
    o.parent=parent;return o
def cylinder(name,pos,radius,tall,mat,parent=None,vertices=12):
    bpy.ops.mesh.primitive_cylinder_add(vertices=vertices,radius=radius,depth=tall,location=xyz((pos[0],pos[1]+tall/2,pos[2])))
    o=bpy.context.object;o.name=name
    for c in list(o.users_collection):c.objects.unlink(o)
    landmark_collection.objects.link(o);o.data.materials.append(mat);o.parent=parent;return o
def house(name,pos,size,parent=None):
    x,y,z=pos;sx,sy,sz=size;wall=sy*.62
    block(name+'_walls',(x,y,z),(sx,wall,sz),plaster,parent)
    block(name+'_foundation',(x,y-.35,z),(sx+1,.65,sz+1),stone,parent)
    verts=[xyz(p) for p in [(x-sx/2-.65,y+wall,z-sz/2-.7),(x+sx/2+.65,y+wall,z-sz/2-.7),(x,y+sy,z-sz/2-.7),
                          (x-sx/2-.65,y+wall,z+sz/2+.7),(x+sx/2+.65,y+wall,z+sz/2+.7),(x,y+sy,z+sz/2+.7)]]
    o=mesh(name+'_roof',verts,[(0,1,2),(3,5,4),(0,2,5,3),(2,1,4,5),(0,3,4,1)],roof,landmark_collection);o.parent=parent
    block(name+'_door',(x,y,z+sz/2+.025),(1.45,2.65,.08),dark,parent)
def beam_between(name,start,end,radius,mat,parent):
    a,b=Vector(xyz(start)),Vector(xyz(end));d=b-a
    o=cylinder(name,(0,0,0),radius,d.length,mat,parent,8)
    o.location=(a+b)/2;o.rotation_euler=d.to_track_quat('Z','Y').to_euler();return o

print('BLENDER_GEOGRAPHY: constructing 143 shared-edge terrain cells',flush=True)
dz,dx=np.gradient(height,2)
rock=np.clip((np.hypot(dx,dz)-.28)/.6,0,1)
base=np.zeros((*height.shape,3))+[.22,.285,.165]
base=base*(1-rock[...,None])+np.array([.35,.36,.325])*rock[...,None]
for index,color in [(3,[.15,.195,.145]),(2,[.18,.17,.16]),(1,[.77,.83,.84]),(0,[.45,.37,.25])]:
    w=masks[...,index,None];base=base*(1-w)+np.array(color)*w
for chunk in meta['chunks']:
    c,r,nx,nz=chunk['col'],chunk['row'],chunk['columns'],chunk['rows']
    gx,gz=np.meshgrid(np.arange(c,c+nx+1),np.arange(r,r+nz+1))
    verts=np.stack([-800+gx*2,700-gz*2,height[gz,gx]],axis=-1).reshape(-1,3)
    ii,jj=np.meshgrid(np.arange(nx),np.arange(nz));a=(jj*(nx+1)+ii).reshape(-1);b=a+1;d=a+nx+2;cc=a+nx+1
    faces=np.vstack([np.stack([a,d,b],axis=-1),np.stack([a,cc,d],axis=-1)])
    o=mesh(chunk['id'],verts.tolist(),faces.tolist(),earth,terrain_collection)
    o['cell_id']=chunk['id'];o['support_grid_metres']=2
    for poly in o.data.polygons:poly.use_smooth=True
    normals=np.stack([-dx[gz,gx],dz[gz,gx],np.ones(gx.shape)],axis=-1).reshape(-1,3)
    normals/=np.linalg.norm(normals,axis=1)[:,None]
    o.data.normals_split_custom_set_from_vertices(normals.tolist())
    attr=o.data.color_attributes.new(name='Color',type='FLOAT_COLOR',domain='POINT')
    rgba=np.concatenate([base[gz,gx].reshape(-1,3),np.ones((verts.shape[0],1))],axis=1)
    attr.data.foreach_set('color',rgba.reshape(-1))
    uv=o.data.uv_layers.new(name='UVMap')
    vertex_uv=np.stack([verts[:,0]/4,verts[:,1]/4],axis=-1)
    loops=np.zeros(len(o.data.loops),dtype=np.int32);o.data.loops.foreach_get('vertex_index',loops)
    uv.data.foreach_set('uv',vertex_uv[loops].reshape(-1))
    bpy.ops.object.select_all(action='DESELECT');o.select_set(True);bpy.context.view_layer.objects.active=o
    bpy.ops.export_scene.gltf(filepath=str(GEO/'chunks'/(chunk['id']+'.glb')),export_format='GLB',use_selection=True,export_animations=False,export_cameras=False,export_lights=False,export_yup=True)
    chunk['glb']='chunks/'+chunk['id']+'.glb'

# Lake polygon is concave; Blender triangulates its actual boundary, not a fan.
lake=layout['water']['lake'];verts=[xyz((x,lake['level'],z)) for x,z in lake['polygon']]
o=mesh('Lake_Level_40m',verts,[tuple(reversed(range(len(verts))))],water,water_collection)
mod=o.modifiers.new('Concave_Shore_Triangulation','TRIANGULATE')
# River strip bends with the common geographic centerline, at descending levels.
river=layout['water']['river'];verts=[]
for i,p in enumerate(river['centerline_xyz']):
    prev=river['centerline_xyz'][max(0,i-1)];nxt=river['centerline_xyz'][min(len(river['centerline_xyz'])-1,i+1)]
    tx,tz=nxt[0]-prev[0],nxt[2]-prev[2];mag=math.hypot(tx,tz);nx,nz=-tz/mag,tx/mag
    for sign in [-1,1]:verts.append(xyz((p[0]+nx*river['width']/2*sign,p[1],p[2]+nz*river['width']/2*sign)))
mesh('River_Outlet_To_South',verts,[(i*2,i*2+2,i*2+3,i*2+1) for i in range(len(river['centerline_xyz'])-1)],water,water_collection)

print('BLENDER_GEOGRAPHY: materializing named architectural masses',flush=True)
for item in layout['objects']:
    name=item['id'];kind=item['kind'];x,y,z=item['position'];sx,sy,sz=item['size']
    if kind in ('peak','arena','crater'):continue # These are shaped in continuous terrain.
    parent=bpy.data.objects.new(name,None);landmark_collection.objects.link(parent)
    parent['landmark_id']=name;parent['location_id']=item['location_id'];parent['stage']='B massing, C detail pending'
    if kind in ('house','shed','civic_house','ruined_house','crypt'):
        house(name,(x,y,z),(sx,sy,sz),parent)
    elif kind in ('tower','ruined_tower'):
        cylinder(name+'_shaft',(x,y,z),sx*.5,sy,stone,parent)
        cylinder(name+'_crown',(x,y+sy-1,z),sx*.6,2,stone,parent)
    elif kind=='fortress':
        # Gate remains truly open: two south wall wings, no invisible closure.
        for sign in [-1,1]:
            block(name+'_eastwest'+str(sign),(x+sign*sx/2,y,z),(5,sy,sz),stone,parent)
            block(name+'_south_wing'+str(sign),(x+sign*(sx/4+5),y,z+sz/2),(sx/2-10,sy,5),stone,parent)
            for side in [-1,1]:cylinder(name+'_corner',(x+sign*sx/2,y,z+side*sz/2),8,sy+7,stone,parent,16)
        block(name+'_north_wall',(x,y,z-sz/2),(sx,sy,5),stone,parent)
        for sign in [-1,1]:cylinder(name+'_gate_tower',(x+sign*14,y,z+sz/2),7,sy+5,stone,parent,16)
    elif kind in ('mine_portal','cave_mouth','ruined_gate'):
        block(name+'_left',(x-sx*.44,y,z),(sx*.12,sy,sz),stone,parent)
        block(name+'_right',(x+sx*.44,y,z),(sx*.12,sy,sz),stone,parent)
        block(name+'_lintel',(x,y+sy*.78,z),(sx,sy*.22,sz),wood if kind=='mine_portal' else stone,parent)
    elif kind=='bridge':
        block(name+'_deck',(x,y-.7,z),(sx,.7,sz),stone,parent)
        for side in [-1,1]:block(name+'_parapet',(x,y,z+side*(sz/2-.3)),(sx,1.15,.55),stone,parent)
        for offset in [-sx*.35,sx*.35]:block(name+'_pier',(x+offset,y-sy,z),(4,sy-.7,sz-1),stone,parent)
    elif kind=='pier':
        block(name+'_deck',(x,y-.35,z),(sz,.35,sx),wood,parent)
        for offset in [-sz*.4,0,sz*.4]:
            for side in [-1,1]:cylinder(name+'_post',(x+offset,y-5,z+side*sx*.35),.3,5.5,wood,parent,8)
    elif kind=='church':
        house(name+'_nave',(x,y,z),(sx,sy*.45,sz),parent)
        block(name+'_bell_tower',(x,y,z-sz*.33),(sx*.38,sy,sz*.23),stone,parent)
        block(name+'_transept',(x,y,z),(sx*1.35,sy*.25,sz*.23),stone,parent)
    elif kind=='sanctuary':
        block(name+'_plinth',(x,y,z),(sx,3,sz),stone,parent)
        for ix in [-.4,-.2,0,.2,.4]:
            for iz in [-.4,.4]:cylinder(name+'_column',(x+sx*ix,y+3,z+sz*iz),1.8,sy*.7,stone,parent)
        block(name+'_entablature',(x,y+sy*.7+3,z),(sx,3,sz),stone,parent)
    elif kind=='ancient_tree':
        cylinder(name+'_trunk',(x,y,z),5.2,sy*.6,wood,parent,14)
        for i in range(9):
            ang=i*math.tau/9;tip=(x+math.cos(ang)*sx*.48,y+sy*(.65+.2*math.sin(i*1.4)),z+math.sin(ang)*sz*.48)
            beam_between(name+'_limb',(x,y+sy*.43,z),tip,1.0,wood,parent)
    elif kind=='scaffold':
        for ix in [-.42,.42]:
            for iz in [-.4,.4]:block(name+'_upright',(x+sx*ix,y,z+sz*iz),(.6,sy,.6),wood,parent)
        for level in [.3,.65,1]:block(name+'_platform',(x,y+sy*level,z),(sx,.35,sz),wood,parent)
    elif kind=='statue':
        block(name+'_base',(x,y,z),(sx,4,sz),stone,parent)
        cylinder(name+'_figure',(x,y+4,z),2,sy-4,stone,parent)
    pivot=Vector(xyz((x,y,z)))
    parent.matrix_world=Matrix.Translation(pivot) @ Matrix.Rotation(math.radians(item.get('rotation_y_deg',0)),4,'Z') @ Matrix.Translation(-pivot)

# Export nonterrain models separately so the runtime can stream cells later.
bpy.ops.object.select_all(action='DESELECT')
for o in [*water_collection.objects,*landmark_collection.objects]:o.select_set(True)
bpy.ops.export_scene.gltf(filepath=str(GEO/'landmarks.glb'),export_format='GLB',use_selection=True,export_animations=False,export_cameras=False,export_lights=False,export_yup=True)
scene['world_layout']='godot-pc/world-final/world_layout.json';scene['status']='STAGE B GEOGRAPHY, NOT FINAL ART'
bpy.ops.wm.save_as_mainfile(filepath=str(source),compress=True)
meta['native_source']=source.relative_to(ROOT).as_posix();meta['landmarks']='landmarks.glb'
(GEO/'terrain.json').write_text(json.dumps(meta,indent=2)+'\n',encoding='utf-8')
report={'blender_version':bpy.app.version_string,'native_source':meta['native_source'],'source_bytes':source.stat().st_size,
        'source_sha256':hashlib.sha256(source.read_bytes()).hexdigest(),'chunks':len(meta['chunks']),
        'landmark_meshes':len(landmark_collection.objects),'terrain_triangles':800*700*2,
        'stage':'B spatial models only','world_layout_revision':layout['revision']}
(ROOT/'docs/world-final/blender-geography.json').write_text(json.dumps(report,indent=2)+'\n',encoding='utf-8')
print('BLENDER_GEOGRAPHY_OK '+json.dumps(report),flush=True)
