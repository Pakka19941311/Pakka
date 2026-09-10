"""Preserve a native terrain-material revision with packed licensed textures."""
from pathlib import Path
import bpy,json,hashlib
ROOT=Path(__file__).resolve().parents[2]
TARGET=ROOT/'art/world-final/Varendor_Surface_D-10.blend'
if TARGET.exists():raise RuntimeError('Preserve native edits; choose a new revision')
bpy.ops.wm.open_mainfile(filepath=str(ROOT/'art/world-final/Varendor_Nature_D-08.blend'))
mat=bpy.data.materials.new('D10_Snow_Rock_Forest_Ash_Surface');mat.use_nodes=True
nodes=mat.node_tree.nodes;links=mat.node_tree.links;bsdf=nodes.get('Principled BSDF')
bsdf.inputs['Roughness'].default_value=.9
bsdf.inputs['Specular IOR Level'].default_value=.22
geometry=nodes.new('ShaderNodeNewGeometry')
def mapping(scale,offset=(0,0,0)):
    a=nodes.new('ShaderNodeVectorMath');a.operation='MULTIPLY';a.inputs[1].default_value=scale;links.new(geometry.outputs['Position'],a.inputs[0])
    b=nodes.new('ShaderNodeVectorMath');b.operation='ADD';b.inputs[1].default_value=offset;links.new(a.outputs['Vector'],b.inputs[0]);return b.outputs['Vector']
def texture(relative,coords,noncolor=False,box=False):
    image=bpy.data.images.load(str(ROOT/relative),check_existing=True)
    if noncolor:image.colorspace_settings.name='Non-Color'
    image.pack();node=nodes.new('ShaderNodeTexImage');node.image=image;links.new(coords,node.inputs['Vector'])
    if box:node.projection='BOX';node.projection_blend=.2
    return node
def tint(color,value):
    n=nodes.new('ShaderNodeMixRGB');n.blend_type='MULTIPLY';n.inputs[0].default_value=1;n.inputs[2].default_value=(*value,1);links.new(color,n.inputs[1]);return n.outputs[0]
def mix(a,b,factor):
    n=nodes.new('ShaderNodeMixRGB');links.new(a,n.inputs[1]);links.new(b,n.inputs[2])
    if isinstance(factor,(int,float)):n.inputs[0].default_value=factor
    else:links.new(factor,n.inputs[0])
    return n.outputs[0]
def math_node(operation,a,b):
    node=nodes.new('ShaderNodeMath');node.operation=operation
    for index,value in enumerate((a,b)):
        if isinstance(value,(int,float)):node.inputs[index].default_value=value
        else:links.new(value,node.inputs[index])
    return node.outputs[0]
root='godot-pc/world-final/'
mask_coords=mapping((1/1600,1/1400,0),(.5,.5,0))
biome=texture(root+'materials/biomes-D10.png',mask_coords,True)
split=nodes.new('ShaderNodeSeparateColor');links.new(biome.outputs['Color'],split.inputs['Color'])
forest_mask=texture(root+'nature/ground-world-D08.png',mask_coords,True)
forest_channels=nodes.new('ShaderNodeSeparateColor');links.new(forest_mask.outputs['Color'],forest_channels.inputs['Color'])
normal_components=nodes.new('ShaderNodeSeparateXYZ');links.new(geometry.outputs['Normal'],normal_components.inputs['Vector'])
slope=math_node('SUBTRACT',1,math_node('ABSOLUTE',normal_components.outputs['Z'],0))
def ramp(value,minimum,maximum):
    node=nodes.new('ShaderNodeMapRange');node.clamp=True;node.interpolation_type='SMOOTHSTEP'
    links.new(value,node.inputs['Value']);node.inputs['From Min'].default_value=minimum;node.inputs['From Max'].default_value=maximum
    return node.outputs['Result']
rock=math_node('MULTIPLY',ramp(slope,.14,.39),math_node('SUBTRACT',1,split.outputs['Red']))
snow=math_node('MULTIPLY',split.outputs['Green'],math_node('SUBTRACT',1,ramp(slope,.19,.48)))
woodland=texture(root+'nature/textures/forest_diff.jpg',mapping((1/3.6,1/3.6,0)))
litter=tint(woodland.outputs['Color'],(.67,.75,.59))
field=tint(litter,(.92,.98,.70))
soil=tint(texture(root+'nature/textures/trail_diff.jpg',mapping((.9/3.6,.9/3.6,0))).outputs['Color'],(.75,.72,.65))
cliff=tint(texture(root+'materials/cliff_diff.jpg',mapping((1/8,1/8,1/8)),box=True).outputs['Color'],(.69,.72,.75))
snow_color=tint(texture(root+'materials/snow_diff.jpg',mapping((.5,.5,0))).outputs['Color'],(.94,.975,1))
color=mix(field,litter,forest_channels.outputs['Green'])
wet=math_node('MAXIMUM',split.outputs['Red'],math_node('MULTIPLY',biome.outputs['Alpha'],.76))
color=mix(color,soil,wet);color=mix(color,cliff,rock)
ash=mix(tint(soil,(.43,.40,.38)),tint(cliff,(.30,.28,.27)),math_node('MAXIMUM',rock,.3))
color=mix(color,ash,split.outputs['Blue']);color=mix(color,snow_color,snow)
links.new(color,bsdf.inputs['Base Color'])
normal=texture(root+'nature/textures/forest_normal.jpg',mapping((1/3.6,1/3.6,0)),True)
snow_normal=texture(root+'materials/snow_normal.jpg',mapping((.5,.5,0)),True)
normalmap=nodes.new('ShaderNodeNormalMap');normalmap.inputs['Strength'].default_value=.5
links.new(mix(normal.outputs['Color'],snow_normal.outputs['Color'],snow),normalmap.inputs['Color']);links.new(normalmap.outputs['Normal'],bsdf.inputs['Normal'])
count=0
for obj in bpy.data.collections['01_Terrain_128m_Shared_Edges'].objects:
    if obj.type=='MESH':obj.data.materials.clear();obj.data.materials.append(mat);count+=1
bpy.context.scene['D10_material_scope']='Measured biome masks, physical-scale PBR terrain. Godot shader remains final viewport truth; native macro noise and exact blend response may differ.'
bpy.context.scene['D10_geometry_changed']=False
bpy.ops.wm.save_as_mainfile(filepath=str(TARGET),compress=True)
report={'native_source':TARGET.relative_to(ROOT).as_posix(),'sha256':hashlib.sha256(TARGET.read_bytes()).hexdigest(),'terrain_cells':count,'geometry_changed':False,'packed_images':sum(bool(i.packed_file) for i in bpy.data.images),'godot_visual_pending':True,'exact_native_shader_parity':False}
(ROOT/'docs/world-final/surfaces-D10.json').write_text(json.dumps(report,indent=2)+'\n',encoding='utf-8')
print(json.dumps(report),flush=True)
