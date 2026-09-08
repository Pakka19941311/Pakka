"""Assemble the existing Git world in Blender, then export the native scene."""
import bpy
import json
import math
import sys
from pathlib import Path
from mathutils import Vector, Matrix

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/'scripts'))
from territory_art import build_prop, build_wildlife
OUT = ROOT/'godot-pc/generated'
layout = json.loads((OUT/'layout.json').read_text())
terrain_data=json.loads((OUT/'terrain.json').read_text())
def surface_height(x,z):
    cols,rows=terrain_data['columns'],terrain_data['rows'];heights=terrain_data['heights']
    gx=max(0,min(cols,(x+terrain_data['width']/2)*cols/terrain_data['width']))
    gz=max(0,min(rows,(terrain_data['depth']/2-z)*rows/terrain_data['depth']))
    col,row=min(cols-1,math.floor(gx)),min(rows-1,math.floor(gz));u,v=gx-col,gz-row
    a,b,c,d=[heights[index] for index in [row*(cols+1)+col,row*(cols+1)+col+1,(row+1)*(cols+1)+col,(row+1)*(cols+1)+col+1]]
    return a+u*(b-a)+v*(d-b) if u>=v else a+u*(d-c)+v*(c-a)
bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene
scene.unit_settings.system = 'METRIC'
scene.unit_settings.scale_length = 1
templates, materials, fallback = {}, {}, []

def pbr(name, folder, base, normal=None, rough=None, color=(1,1,1,1)):
    if name in materials: return materials[name]
    mat = bpy.data.materials.new(name);mat.use_nodes=True
    nodes=mat.node_tree.nodes;links=mat.node_tree.links;bsdf=nodes.get('Principled BSDF')
    bsdf.inputs['Base Color'].default_value=color;bsdf.inputs['Roughness'].default_value=.86
    for filename,kind in [(base,'base'),(normal,'normal'),(rough,'rough')]:
        if not filename or not (folder/filename).exists():continue
        tex=nodes.new('ShaderNodeTexImage');tex.image=bpy.data.images.load(str(folder/filename),check_existing=True)
        if kind!='base':tex.image.colorspace_settings.name='Non-Color'
        if kind=='base':links.new(tex.outputs['Color'],bsdf.inputs['Base Color'])
        elif kind=='rough':links.new(tex.outputs['Color'],bsdf.inputs['Roughness'])
        else:
            n=nodes.new('ShaderNodeNormalMap');links.new(tex.outputs['Color'],n.inputs['Color']);links.new(n.outputs['Normal'],bsdf.inputs['Normal'])
    materials[name]=mat;return mat

pbrroot=ROOT/'public/assets/textures/pbr'
stone=pbr('Existing castle stone',pbrroot,'castle_wall_slates_albedo.jpg','castle_wall_slates_normal.jpg','castle_wall_slates_roughness.jpg')
wood=pbr('Existing medieval wood',pbrroot,'medieval_wood_albedo.jpg','medieval_wood_normal.jpg','medieval_wood_roughness.jpg')
roofmat=pbr('Existing slate roof',pbrroot,'roof_slates_02_albedo.jpg','roof_slates_02_normal.jpg','roof_slates_02_roughness.jpg')
ground=pbr('Existing forest ground',ROOT/'public/assets/world/forest_ground_04','diff.jpg')
road=pbr('Existing paved roads',pbrroot,'cobblestone_floor_001_albedo.jpg','cobblestone_floor_001_normal.jpg','cobblestone_floor_001_roughness.jpg')

def color_material(name,color):
    m=bpy.data.materials.new(name);m.use_nodes=True
    b=m.node_tree.nodes.get('Principled BSDF');b.inputs['Base Color'].default_value=(*color,1);b.inputs['Roughness'].default_value=.83
    return m
prop_materials={'stone':stone,'wood':wood,'roof':roofmat,
    'plaster':pbr('Limewashed fieldstone',pbrroot,'castle_wall_slates_albedo.jpg','castle_wall_slates_normal.jpg','castle_wall_slates_roughness.jpg'),
    'iron':color_material('Forged iron',(.08,.095,.1)), 'dark':color_material('Recessed dark openings',(.018,.026,.025)),
    'canvas':color_material('Weathered ochre canvas',(.4,.32,.21)), 'tent':color_material('Exile waxed canvas',(.29,.22,.17)),
    'banner':color_material('Territory_Wind_Banner',(.27,.035,.055)), 'gold':color_material('Pale brass heraldry',(.64,.52,.28)),
    'paper':color_material('Weathered parchment',(.67,.62,.46)), 'straw':color_material('Bound training straw',(.35,.31,.16)),
    'ember':color_material('Warm coals and lanterns',(.9,.23,.035)),
    'grass':color_material('Territory_Wind_Grass',(.22,.29,.12)),
    'crow':color_material('Raven feather charcoal',(.022,.031,.037)), 'hare':color_material('Hare brindled umber',(.33,.27,.18))}
prop_materials['ember'].node_tree.nodes.get('Principled BSDF').inputs['Emission Color'].default_value=(1,.16,.015,1)
prop_materials['ember'].node_tree.nodes.get('Principled BSDF').inputs['Emission Strength'].default_value=.9

def mesh(name,vertices,faces,material):
    data=bpy.data.meshes.new(name);data.from_pydata(vertices,[],faces);data.update()
    obj=bpy.data.objects.new(name,data);scene.collection.objects.link(obj)
    data.materials.append(material)
    uv=data.uv_layers.new(name='UVMap')
    for poly in data.polygons:
        normal=poly.normal;axes=(0,1) if abs(normal.z)>.5 else ((0,2) if abs(normal.y)>.5 else (1,2))
        for index in poly.loop_indices:
            p=data.vertices[data.loops[index].vertex_index].co
            uv.data[index].uv=(p[axes[0]]/3.2,p[axes[1]]/3.2)
    return obj

# Coordinate adapter: server x,z -> Godot x,-z; Blender world is x,z,height.
g=layout['geometry'];vertices=[(g['positions'][i],g['positions'][i+2],g['positions'][i+1]) for i in range(0,len(g['positions']),3)]
for key,mat in [('groundIndices',ground),('roadIndices',road)]:
    ix=g[key];obj=mesh('Terrain' if key=='groundIndices' else 'Roads',vertices,[tuple(ix[i:i+3]) for i in range(0,len(ix),3)],mat)
    for poly in obj.data.polygons:poly.use_smooth=True
    colors=obj.data.color_attributes.new(name='Color',type='FLOAT_COLOR',domain='POINT')
    for vertex in obj.data.vertices:
        x,z=vertex.co.x,vertex.co.y
        density=max(0,max(1-math.hypot((x-f['x'])/f['rx'],(z-f['z'])/f['rz']) for f in layout['territory']['forests']))
        shade=.91+.09*math.sin(x*.16+z*.21)*math.sin(z*.31)
        if key=='groundIndices':color=((.76-.22*density)*shade,(.76-.1*density)*shade,(.62-.19*density)*shade,1)
        else:color=(1,1,1,1) if (abs(x+7)<35 and abs(z+5)<30) or (abs(x+108)<22 and abs(z+82)<19) else (.9,.79,.62,1)
        colors.data[vertex.index].color=color
    if key=='roadIndices':
        # One terrain mesh, two material regions: paving inside settlements,
        # packed earth outside. No overlays, fighting faces or painted straight strip.
        earth=pbr('Packed woodland track',ROOT/'public/assets/world/forest_ground_04','diff.jpg')
        obj.data.materials.append(earth)
        for poly in obj.data.polygons:
            x,y=poly.center.x,poly.center.y
            paved=(abs(x+7)<35 and abs(y+5)<30) or (abs(x+108)<22 and abs(y+82)<19)
            poly.material_index=0 if paved else 1

def template(name):
    if name in templates:return templates[name]
    group,variant=name.split('/',1)
    if group=='castle':path=ROOT/f'public/assets/world/castle_pack/{variant}_lod0.glb'
    elif group=='realism':path=ROOT/f'public/assets/models/realism/{variant}/{variant}_1k.gltf'
    elif group=='world':path=ROOT/f'public/assets/models/world/{variant}.glb'
    else:path=ROOT/f'public/assets/world/{group}/{group}_{variant}_lod0.glb'
    before=set(bpy.data.objects);bpy.ops.import_scene.gltf(filepath=str(path))
    new=set(bpy.data.objects)-before
    meshes=[o for o in new if o.type=='MESH'];assert meshes, name
    # Realism source packs may contain several LOD alternatives. The old client
    # used their hierarchy; preserve it here except the named prepared variants.
    # Same axis normalization as createStaticPart in the established map.
    points=[o.matrix_world@Vector(c) for o in meshes for c in o.bound_box]
    axis=Matrix.Identity(4)
    if group=='castle' and ('wall_thin_straight' in variant or 'wall_thin_gate' in variant):
        if max(p.y for p in points)-min(p.y for p in points)>max(p.x for p in points)-min(p.x for p in points):
            axis=Matrix.Rotation(-math.pi/2,4,'Z')
            points=[axis@p for p in points]
    low=Vector(tuple(min(p[i] for p in points) for i in range(3)))
    high=Vector(tuple(max(p[i] for p in points) for i in range(3)))
    parts=[]
    for o in meshes:
        if group in ['pine_tree_01','fern_02','shrub_04']:
            # Per-instance roots remain fixed after offline spatial batching.
            # Only leaf/needle materials receive the native wind shader.
            colors=o.data.color_attributes.get('Color') or o.data.color_attributes.new(name='Color',type='FLOAT_COLOR',domain='POINT')
            for v in o.data.vertices:
                height=(axis@o.matrix_world@v.co).z-low.z
                colors.data[v.index].color=(1,1,1,max(0,min(1,height/max(.001,(high.z-low.z)*.8))))
            for mat in o.data.materials:
                if mat and (group!='pine_tree_01' or any(word in mat.name.lower() for word in ['needle','leav','branch','trunk_a'])):
                    if not mat.name.startswith('Territory_Wind_'):mat.name='Territory_Wind_Foliage_'+mat.name
        parts.append((o.data,axis@o.matrix_world))
        # The original Git colormap is truncated. Keep geometry and original
        # material factors; never rewrite that source or claim its repair.
        for slot in o.material_slots:
            mat=slot.material
            if mat and mat.use_nodes:
                for node in list(mat.node_tree.nodes):
                    if node.type=='TEX_IMAGE' and node.image and 'colormap.png' in node.image.filepath:
                        mat.node_tree.nodes.remove(node);fallback.append(name)
    for o in new:bpy.data.objects.remove(o,do_unlink=True)
    templates[name]=(parts,low,high);return templates[name]

for i,p in enumerate(layout['placements']):
    kind=p['kind'];name=p['name'];x=p.get('x',0);z=p.get('z',0);y=p.get('y',0)
    if kind=='asset':
        parts,low,high=template(name);size=high-low
        factor=p['height']/max(.001,size.z) if p.get('height') is not None else p.get('scale',1)
        if name=='realism/dead_tree_trunk':factor*=min(1,p['height']*2/max(.001,max(size.x,size.y)*factor))
        scale=Vector((p.get('width',size.x*factor)/max(.001,size.x),p.get('depth',size.y*factor)/max(.001,size.y),factor))
        pivot=bpy.data.objects.new(f'{name}-{i}',None);scene.collection.objects.link(pivot)
        pivot.location=(x,z,y);pivot.rotation_euler.z=-p.get('rotation',0)
        # Babylon's glTF handedness transform followed by the native adapter.
        for data,matrix in parts:
            obj=bpy.data.objects.new(f'{name}-{i}-mesh',data);scene.collection.objects.link(obj)
            obj.parent=pivot
            center=Vector(((low.x+high.x)/2,(low.y+high.y)/2,low.z)) if name.startswith('castle/') or p.get('centered') else Vector((0,0,low.z if p.get('height') is not None else 0))
            obj.matrix_local=Matrix.Diagonal((*scale,1))@Matrix.Translation(-center)@matrix
    elif kind=='fire':
        light=bpy.data.lights.new(name,'POINT');light.energy=180*p.get('scale',1);light.color=(1,.35,.08)
        o=bpy.data.objects.new(name,light);scene.collection.objects.link(o);o.location=(x,z,y+.5)
    else:build_prop(p,prop_materials,mesh,surface_height)
build_wildlife(OUT/'wildlife',prop_materials)
# Native profile showed 1295 draw calls in the starter view. Batch immutable
# geometry by material and 16 m sector, retaining spatial culling and all lights.
# Copy the active mesh before joining so templates shared by another sector are
# never mutated. This is an offline operation, not work in a gameplay frame.
original_objects=len(scene.objects)
batches={}
for obj in list(scene.objects):
    if obj.type!='MESH' or not obj.data.polygons:continue
    center=obj.matrix_world@(sum((Vector(c) for c in obj.bound_box),Vector())/8)
    kind='decor' if any(n in obj.name.lower() for n in ['fern','shrub','grass']) else 'solid'
    key=(math.floor(center.x/16),math.floor(center.y/16),kind,tuple(m.name if m else '' for m in obj.data.materials))
    batches.setdefault(key,[]).append(obj)
for index,(key,objects) in enumerate(batches.items()):
    if len(objects)<2:continue
    bpy.ops.object.select_all(action='DESELECT')
    for obj in objects:obj.select_set(True)
    active=objects[0];active.data=active.data.copy();bpy.context.view_layer.objects.active=active
    bpy.ops.object.join();active.name=f"{'grass' if key[2]=='decor' else 'World'}_sector_{key[0]}_{key[1]}_{index}"
for image in bpy.data.images:
    if image.source=='FILE':
        try:image.pack()
        except RuntimeError:pass
blend_path=ROOT/'world-source'/'Varendor_PC_World.blend'
blend_path.parent.mkdir(parents=True,exist_ok=True)
bpy.ops.wm.save_as_mainfile(filepath=str(blend_path))
bpy.ops.export_scene.gltf(filepath=str(OUT/'world.glb'),export_format='GLB',export_animations=False,export_cameras=False,export_lights=True,export_yup=True,export_vertex_color='ACTIVE')
report={'placements':len(layout['placements']),'source':'TZ v2.0 approved territory; src/world/territory-layout.ts + scripts/territory_art.py + licensed Git PBR foliage','territoryVersion':layout['territory']['version'],'trees':len(layout['territory']['trees']),'wildlife':['crow','hare'],'material_fallbacks_for_known_P0_ASSET_001':sorted(set(fallback)),'objects':len(scene.objects),'objects_before_batching':original_objects,'static_batches':len(batches),'blend_bytes':blend_path.stat().st_size,'glb_bytes':(OUT/'world.glb').stat().st_size}
(OUT/'blender-build.json').write_text(json.dumps(report,indent=2)+'\n');print('VARENDOR_BLENDER_WORLD_READY '+json.dumps(report))
