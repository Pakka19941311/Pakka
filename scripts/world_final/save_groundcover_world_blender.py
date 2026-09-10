"""Save editable point cells and fitted real cliff meshes in a new native layer."""
from pathlib import Path
import bpy,json,hashlib,math,sys
import numpy as np
from mathutils import Vector,Quaternion,Matrix
sys.path.insert(0,str(Path(__file__).resolve().parent))
from build_geography import sample_grid
ROOT=Path(__file__).resolve().parents[2];OUT=ROOT/'godot-pc/world-final/nature'
TARGET=ROOT/'art/world-final/Varendor_Groundcover_D-11.blend'
if TARGET.exists():raise RuntimeError('Preserve saved native world edits')
data=json.loads((OUT/'groundcover-placements-D11.json').read_text())
library=json.loads((OUT/'groundcover-library-D11B.json').read_text());data['catalog']=library['catalog']
height=np.fromfile(ROOT/'godot-pc/world-final/geography/heightmap.f32',dtype='<f4').reshape(701,801)
bpy.ops.wm.read_factory_settings(use_empty=True)
reference=ROOT/'art/world-final/Varendor_Surface_D-10.blend'
with bpy.data.libraries.load(str(reference),link=True) as (available,request):
    request.collections=[name for name in ['01_Terrain_128m_Shared_Edges','02_Water_Basins_And_Flow','03_Editable_Spatial_Landmarks_STAGE_B','D01_Editable_Forest_Sample','D08_Editable_Forest_Placement_Cells'] if name in available.collections]
    request.materials=['D10_Snow_Rock_Forest_Ash_Surface']
for coll in request.collections:bpy.context.scene.collection.children.link(coll)
native_surface=request.materials[0]
with bpy.data.libraries.load(str(ROOT/library['native_source']),link=False) as (available,request):
    request.objects=[f'{key}_LOD0' for key in data['catalog']]
prototypes={obj.name.removesuffix('_LOD0'):obj for obj in request.objects}
cells=bpy.data.collections.new('D11_Editable_Grass_Points');bpy.context.scene.collection.children.link(cells)
cliff_collection=bpy.data.collections.new('D11_Fitted_Scanned_Cliffs');bpy.context.scene.collection.children.link(cliff_collection)
node_groups={}
for key,prototype in prototypes.items():
    if data['catalog'][key]['kind']=='cliff':continue
    prototype.hide_set(False);prototype.hide_render=False
    group=bpy.data.node_groups.new('D11_Saved_Instances_'+key,'GeometryNodeTree')
    group.interface.new_socket(name='Geometry',in_out='INPUT',socket_type='NodeSocketGeometry')
    group.interface.new_socket(name='Geometry',in_out='OUTPUT',socket_type='NodeSocketGeometry')
    nodes,links=group.nodes,group.links
    source=nodes.new('GeometryNodeObjectInfo');source.inputs['Object'].default_value=prototype;source.inputs['As Instance'].default_value=True
    inp=nodes.new('NodeGroupInput');out=nodes.new('NodeGroupOutput');inst=nodes.new('GeometryNodeInstanceOnPoints')
    links.new(inp.outputs['Geometry'],inst.inputs['Points']);links.new(source.outputs['Geometry'],inst.inputs['Instance'])
    for name in ['rotation','scale']:
        field=nodes.new('GeometryNodeInputNamedAttribute');field.data_type='FLOAT_VECTOR';field.inputs['Name'].default_value=name
        links.new(field.outputs['Attribute'],inst.inputs[name.capitalize()])
    links.new(inst.outputs['Instances'],out.inputs['Geometry']);node_groups[key]=group

for cell in data['grass_cells']:
    key=cell['asset'];name=f'D11_{cell["cell"][0]}_{cell["cell"][1]}_{key}';mesh=bpy.data.meshes.new(name)
    mesh.from_pydata([(p[0],-p[2],p[1]) for p in cell['points']],[],[])
    rotation=mesh.attributes.new(name='rotation',type='FLOAT_VECTOR',domain='POINT')
    scale=mesh.attributes.new(name='scale',type='FLOAT_VECTOR',domain='POINT')
    indices=mesh.attributes.new(name='stable_index',type='INT',domain='POINT')
    for index,p in enumerate(cell['points']):
        normal=Vector((-p[5],p[6],1)).normalized()
        q=Vector((0,0,1)).rotation_difference(normal) @ Quaternion((0,0,1),p[3])
        # Adding attributes may invalidate previous RNA references. Resolve
        # each attribute by name after all three arrays have been created.
        mesh.attributes['rotation'].data[index].vector=q.to_euler()
        mesh.attributes['scale'].data[index].vector=(p[4],)*3
        mesh.attributes['stable_index'].data[index].value=p[7]
    obj=bpy.data.objects.new(name,mesh);cells.objects.link(obj);obj['asset_key']=key;obj['stable_cell']=json.dumps(cell['cell'])
    obj['placement_source']='groundcover-authored-D11.json';obj['manual_edit']='Move points in Edit Mode; rotation, scale and stable_index are saved mesh attributes.'
    modifier=obj.modifiers.new('Saved grass instances','NODES');modifier.node_group=node_groups[key]
print('D11_NATIVE_GRASS_POINTS '+str(data['counts']['grass_tufts']),flush=True)

collision=[];exported=[]
for place in data['cliffs']:
    prototype=prototypes[place['asset']];mesh=prototype.data.copy()
    obj=bpy.data.objects.new(place['id'],mesh);cliff_collection.objects.link(obj)
    x,y,z=place['position'];scale=place['scale'];yaw=place['yaw']
    local=np.array([v.co for v in mesh.vertices],dtype=float)
    desc=data['catalog'][place['asset']]['lods'][0]
    c,s=math.cos(yaw),math.sin(yaw)
    wx=x+scale*(local[:,0]*c-local[:,1]*s)
    wz=z-scale*(local[:,0]*s+local[:,1]*c)
    ground=sample_grid(height,wx,wz)
    raw=y-desc['high'][1]*scale*.55+local[:,2]*scale
    border=np.minimum.reduce([local[:,0]-desc['low'][0],desc['high'][0]-local[:,0],-local[:,1]-desc['low'][2],desc['high'][2]+local[:,1]])
    blend=np.clip(border/2.8,0,1);blend=blend*blend*(3-2*blend)
    # Positive relief tapers into the terrain at crop edges. Negative scan
    # surfaces remain buried; no paper-thin boundary floats above the ground.
    delta=raw-ground
    wy=ground-.16+np.minimum(delta,0)+np.maximum(delta,0)*blend
    # Actual world coordinates are saved in the mesh: editable without a
    # procedural modifier, and exported directly as the final fitted shape.
    mesh.vertices.foreach_set('co',np.column_stack([wx,-wz,wy]).astype('f4').ravel());mesh.update()
    obj['stable_id']=place['id'];obj['source_asset']=place['asset'];obj['zone']=place['zone'];obj['edge_fit']='Original scan; cropped outer vertices below sampled ground; no terrain changes'
    bpy.ops.object.select_all(action='DESELECT');obj.select_set(True);bpy.context.view_layer.objects.active=obj
    path=OUT/'assets'/f'{place["id"]}.glb'
    bpy.ops.export_scene.gltf(filepath=str(path),export_format='GLB',use_selection=True,export_apply=True,export_yup=True,export_animations=False,export_cameras=False,export_lights=False)
    mesh.materials.clear();mesh.materials.append(native_surface)
    minx,maxx=float(wx.min()),float(wx.max());minz,maxz=float(wz.min()),float(wz.max())
    collision.append({'id':place['id'],'kind':'box','x':(minx+maxx)/2,'z':-(minz+maxz)/2,'halfX':(maxx-minx)/2,'halfZ':(maxz-minz)/2,'rotation':0,
        'bottom':float(wy.min()),'top':float(wy.max()),'blocksMovement':True,'source_mesh':place['id'],'landmark':place['id']})
    edge=border<.001
    exported.append({'id':place['id'],'zone':place['zone'],'path':path.relative_to(OUT).as_posix(),'sha256':hashlib.sha256(path.read_bytes()).hexdigest(),
        'triangles':sum(len(p.vertices)-2 for p in mesh.polygons),'max_crop_edge_above_ground_m':float((wy-ground)[edge].max()) if edge.any() else None,
        'road_margin_m':place['minimum_road_margin_m']})
    if len(exported)%25==0:print('D11_FITTED_CLIFFS '+str(len(exported)),flush=True)

for lib in bpy.data.libraries:lib.filepath='//'+Path(lib.filepath).name
bpy.context.scene['status']='D11 native groundcover layer; linked D10 geography/architecture/forest are preserved. Godot review required.'
bpy.context.scene['D11_placement_file']='godot-pc/world-final/nature/groundcover-authored-D11.json'
bpy.ops.wm.save_as_mainfile(filepath=str(TARGET),compress=True)
data.update(native_source=TARGET.relative_to(ROOT).as_posix(),native_sha256=hashlib.sha256(TARGET.read_bytes()).hexdigest(),cliff_meshes=exported,
    native_link_dependencies=[reference.relative_to(ROOT).as_posix()],native_roundtrip_verified=False)
(OUT/'groundcover-authored-D11.json').write_text(json.dumps(data,separators=(',',':'))+'\n',encoding='utf-8')
(OUT/'groundcover-collision-D11.json').write_text(json.dumps({'schema':1,'obstacles':collision},separators=(',',':'))+'\n',encoding='utf-8')
report={k:v for k,v in data.items() if k not in ('catalog','grass_cells','cliffs')}
(ROOT/'docs/world-final/groundcover-D11.json').write_text(json.dumps(report,indent=2)+'\n',encoding='utf-8')
print('D11_NATIVE_SAVED '+data['native_sha256'],flush=True)
