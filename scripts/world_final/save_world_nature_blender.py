"""Save persisted forest placement cells as editable Blender geometry nodes.

Every point is real saved source data: stable index, transform and asset key.
No distribution node, random input or runtime generation is used. Moving a
point edits placement; deleting it excludes that exact instance.
"""
from pathlib import Path
import bpy,json,math,hashlib,collections
from mathutils import Matrix
ROOT=Path(__file__).resolve().parents[2];OUT=ROOT/'godot-pc/world-final/nature'
SOURCE=ROOT/'art/world-final/Varendor_Nature_D-08B.blend';TARGET=ROOT/'art/world-final/Varendor_Nature_D-08.blend'
if TARGET.exists():raise RuntimeError('Preserve authored native edits; use a new version')
data=json.loads((OUT/'placements-D08.json').read_text())
bpy.ops.wm.open_mainfile(filepath=str(ROOT/'art/world-final/Varendor_Nature_D-03.blend'))
with bpy.data.libraries.load(str(SOURCE),link=False) as (available,requested):
    requested.collections=['D08A_Authored_Nature_Families']
for coll in requested.collections:bpy.context.scene.collection.children.link(coll)
cells=bpy.data.collections.new('D08_Editable_Forest_Placement_Cells');bpy.context.scene.collection.children.link(cells)
prototypes={};node_groups={}
for key,desc in data['catalog'].items():
    # Unlinked source collections are visible through their node instances,
    # and do not put a second forest at the world origin.
    coll=bpy.data.collections.new('D08_Instance_Source_'+key);prototypes[key]=coll
    before=set(bpy.data.objects);bpy.ops.import_scene.gltf(filepath=str(OUT/desc['lods'][0]['path']))
    imported=list(set(bpy.data.objects)-before)
    for obj in imported:
        if obj.type!='MESH':continue
        transform=obj.matrix_world.copy();obj.parent=None;obj.matrix_world=transform
        for old in list(obj.users_collection):old.objects.unlink(obj)
        coll.objects.link(obj)
    for obj in imported:
        if obj.type!='MESH':bpy.data.objects.remove(obj,do_unlink=True)
    group=bpy.data.node_groups.new('D08_Persisted_Instances_'+key,'GeometryNodeTree')
    group.interface.new_socket(name='Geometry',in_out='INPUT',socket_type='NodeSocketGeometry')
    group.interface.new_socket(name='Geometry',in_out='OUTPUT',socket_type='NodeSocketGeometry')
    nodes=group.nodes;links=group.links
    input_node=nodes.new('NodeGroupInput');output_node=nodes.new('NodeGroupOutput')
    source=nodes.new('GeometryNodeCollectionInfo');source.inputs['Collection'].default_value=coll
    source.inputs['Separate Children'].default_value=False;source.inputs['Reset Children'].default_value=False
    instance=nodes.new('GeometryNodeInstanceOnPoints')
    links.new(input_node.outputs['Geometry'],instance.inputs['Points']);links.new(source.outputs['Instances'],instance.inputs['Instance'])
    for attr in ['rotation','scale']:
        field=nodes.new('GeometryNodeInputNamedAttribute');field.data_type='FLOAT_VECTOR';field.inputs['Name'].default_value=attr
        links.new(field.outputs['Attribute'],instance.inputs[attr.capitalize()])
    links.new(instance.outputs['Instances'],output_node.inputs['Geometry']);node_groups[key]=group

groups=collections.defaultdict(list)
for index,p in enumerate(data['placements']):
    if p['id'].startswith('D01_'):continue
    x,y,z=p['position'];groups[(p['asset'],math.floor(x/64),math.floor(z/64))].append((index,p))
native_count=0
for (asset,cx,cz),points in groups.items():
    name=f'D08_{cx}_{cz}_{asset}';mesh=bpy.data.meshes.new(name)
    mesh.from_pydata([(p['position'][0],-p['position'][2],p['position'][1]) for index,p in points],[],[])
    for key in ['rotation','scale']:mesh.attributes.new(name=key,type='FLOAT_VECTOR',domain='POINT')
    mesh.attributes.new(name='placement_index',type='INT',domain='POINT')
    for i,(index,p) in enumerate(points):
        mesh.attributes['rotation'].data[i].vector=(0,0,p['yaw']);mesh.attributes['scale'].data[i].vector=(p['scale'],)*3
        mesh.attributes['placement_index'].data[i].value=index
    obj=bpy.data.objects.new(name,mesh);cells.objects.link(obj);obj['asset_key']=asset;obj['placement_source']='placements-D08.json';obj['manual_edit']='Edit mode: move/delete points. Keep placement_index attributes. Export using the matching round-trip tool.'
    modifier=obj.modifiers.new('Persisted editable instances','NODES');modifier.node_group=node_groups[asset];native_count+=len(points)
print('NATIVE_PERSISTED_POINTS '+str(native_count)+' cells '+str(len(groups)),flush=True)

# Match the forest floor in the native master; source terrain vertex colours
# continue outside forest masks. The final Godot frame remains acceptance truth.
old=bpy.data.materials['Geography_B_Vertex_Terrain'];mat=old.copy();mat.name='D08_World_Forest_Surface'
nodes=mat.node_tree.nodes;links=mat.node_tree.links;bsdf=nodes.get('Principled BSDF');vertex=next(n for n in nodes if n.type=='VERTEX_COLOR')
position=nodes.new('ShaderNodeNewGeometry')
def mapping(scale,offset=(0,0,0)):
    a=nodes.new('ShaderNodeVectorMath');a.operation='MULTIPLY';a.inputs[1].default_value=scale;links.new(position.outputs['Position'],a.inputs[0])
    b=nodes.new('ShaderNodeVectorMath');b.operation='ADD';b.inputs[1].default_value=offset;links.new(a.outputs['Vector'],b.inputs[0]);return b.outputs['Vector']
def texture(path,coords,noncolor=False):
    image=bpy.data.images.load(str(OUT/path),check_existing=True)
    if noncolor:image.colorspace_settings.name='Non-Color'
    image.pack();node=nodes.new('ShaderNodeTexImage');node.image=image;links.new(coords,node.inputs['Vector']);return node.outputs['Color']
mask=texture('ground-world-D08.png',mapping((1/1600,1/1400,0),(.5,.5,0)),True)
split=nodes.new('ShaderNodeSeparateColor');links.new(mask,split.inputs['Color'])
def tint(color,value):
    n=nodes.new('ShaderNodeMixRGB');n.blend_type='MULTIPLY';n.inputs[0].default_value=1;n.inputs[2].default_value=(*value,1);links.new(color,n.inputs[1]);return n.outputs[0]
def mix(a,b,factor):
    n=nodes.new('ShaderNodeMixRGB');links.new(a,n.inputs[1]);links.new(b,n.inputs[2]);links.new(factor,n.inputs[0]);return n.outputs[0]
woodland=tint(texture('textures/forest_diff.jpg',mapping((1/3.6,1/3.6,0))),(.64,.68,.59))
trail=tint(texture('textures/trail_diff.jpg',mapping((.9/3.6,.9/3.6,0))),(.75,.72,.66))
color=mix(woodland,trail,split.outputs['Red']);color=mix(vertex.outputs['Color'],color,split.outputs['Green']);links.new(color,bsdf.inputs['Base Color']);bsdf.inputs['Roughness'].default_value=.93
for obj in bpy.data.collections['01_Terrain_128m_Shared_Edges'].objects:
    if obj.type=='MESH':
        for i,material in enumerate(obj.data.materials):
            if material==old:obj.data.materials[i]=mat
bpy.context.scene['status']='D08 real persisted forest masses. Full nature art and main-game migration remain unfinished.'
bpy.context.scene['D08_placement_source']='godot-pc/world-final/nature/placements-D08.json'
bpy.context.scene['D08_point_count']=native_count
bpy.ops.wm.save_as_mainfile(filepath=str(TARGET),compress=True)
data['native_source']=TARGET.relative_to(ROOT).as_posix();data['native_sha256']=hashlib.sha256(TARGET.read_bytes()).hexdigest()
data['native_editing']={'point_cells':len(groups),'new_saved_points':native_count,'retained_sample_placements':data['sample_preserved_ids'],'round_trip_verified':False}
(OUT/'authored-D08.json').write_text(json.dumps(data,separators=(',',':'))+'\n',encoding='utf-8',newline='\n')
(ROOT/'docs/world-final/nature-D08.json').write_text(json.dumps({k:v for k,v in data.items() if k not in ('catalog','placements')},indent=2)+'\n',encoding='utf-8',newline='\n')
print('NATIVE_WORLD_FORESTS_SAVED '+str(TARGET),flush=True)
