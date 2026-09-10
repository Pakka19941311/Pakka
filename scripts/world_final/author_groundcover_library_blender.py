"""Author real editable grass meshes and retain cropped CC0 cliff geometry.

This is an immutable library revision, not a finished-world generator. Saved
placements and a separate Godot review are required before integration.
"""
from pathlib import Path
import bpy, bmesh, json, math, random, hashlib
from mathutils import Vector

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / 'godot-pc/world-final/nature/assets'
TARGET = ROOT / 'art/world-final/Varendor_Groundcover_D-11A.blend'
if TARGET.exists():
    raise RuntimeError('Preserve native edits; choose a new library revision')
bpy.ops.wm.read_factory_settings(use_empty=True)
collection = bpy.data.collections.new('D11A_Editable_Groundcover_And_Scanned_Cliffs')
bpy.context.scene.collection.children.link(collection)
rng = random.Random(202609111)
catalog = {}


def material(name):
    mat = bpy.data.materials.new(name); mat.use_nodes = True
    mat.use_backface_culling = False
    bsdf = mat.node_tree.nodes.get('Principled BSDF')
    bsdf.inputs['Roughness'].default_value = .92
    bsdf.inputs['Specular IOR Level'].default_value = .2
    color = mat.node_tree.nodes.new('ShaderNodeVertexColor'); color.layer_name = 'BladeColor'
    mat.node_tree.links.new(color.outputs['Color'], bsdf.inputs['Base Color'])
    return mat


green = material('D11A_Grass_Authored_Vertex_Pigment')


def tuft(name, blades, steps, height, width, seed, dry=False):
    local = random.Random(seed); vertices = []; faces = []; colors = []
    for blade in range(blades):
        angle = local.uniform(0, math.tau); radius = math.sqrt(local.random()) * width * .46
        origin = Vector((math.cos(angle)*radius, math.sin(angle)*radius, -.045))
        lean_angle = angle + local.uniform(-1.1, 1.1)
        direction = Vector((math.cos(lean_angle), math.sin(lean_angle), 0))
        side = Vector((-direction.y, direction.x, 0))
        length = height * local.uniform(.45, 1.12)
        breadth = local.uniform(.011, .032) * (1.4 if height > 1 else 1)
        lean = local.uniform(.17, .55) * length
        base = len(vertices); pigment = local.uniform(.8, 1.14)
        for step in range(steps+1):
            t = step/steps; center = origin + direction*(lean*t*t)
            center.z += length*(t-.16*t*t*t)
            w = breadth * (1-t)**.65
            for sign in (-1, 1):
                vertices.append(tuple(center+side*w*sign))
                if dry:
                    col = (.13+.17*t, .135+.13*t, .047+.042*t, 1)
                else:
                    col = (.023+.041*t, .055+.077*t, .012+.023*t, 1)
                colors.append(tuple(c*pigment if i<3 else c for i,c in enumerate(col)))
        for step in range(steps):
            a=base+step*2; faces.extend([(a,a+1,a+3),(a,a+3,a+2)])
    mesh = bpy.data.meshes.new(name); mesh.from_pydata(vertices, [], faces); mesh.validate(); mesh.update()
    attribute = mesh.color_attributes.new(name='BladeColor', type='FLOAT_COLOR', domain='POINT')
    for datum,col in zip(attribute.data,colors): datum.color=col
    obj = bpy.data.objects.new(name, mesh); collection.objects.link(obj); mesh.materials.append(green)
    for polygon in mesh.polygons: polygon.use_smooth=True
    obj['source']='Original Varendor curved blade geometry; no raster cutout'
    return obj


def export_asset(key, objects, kind, lod):
    bpy.ops.object.select_all(action='DESELECT')
    for obj in objects: obj.hide_set(False); obj.select_set(True)
    bpy.context.view_layer.objects.active=objects[0]
    path=OUT/f'{key}_D11A_lod{lod}.glb'
    if path.exists(): raise RuntimeError(f'Preserve exported revision: {path}')
    bpy.ops.export_scene.gltf(filepath=str(path), export_format='GLB', use_selection=True,
        export_apply=True, export_yup=True, export_animations=False, export_cameras=False, export_lights=False)
    corners=[obj.matrix_world@Vector(v) for obj in objects for v in obj.bound_box]
    low=[min(v[i] for v in corners) for i in range(3)]; high=[max(v[i] for v in corners) for i in range(3)]
    entry={'path':path.relative_to(OUT.parent).as_posix(),'bytes':path.stat().st_size,
        'sha256':hashlib.sha256(path.read_bytes()).hexdigest(),
        'low':[low[0],low[2],-high[1]],'high':[high[0],high[2],-low[1]],
        'triangles':sum(len(p.vertices)-2 for obj in objects for p in obj.data.polygons)}
    catalog.setdefault(key,{'kind':kind,'lods':[]})['lods'].append(entry)


for variant,(height,width,dry) in enumerate([(.34,.9,False),(.49,1.1,False),(.68,1.3,False),(.6,1.2,True),(1.28,1.5,False)]):
    key=['grass_short','grass_shade','grass_meadow','grass_dry','sedge_wet'][variant]
    for lod,blades,steps in [(0,48,4),(1,24,2)]:
        obj=tuft(f'{key}_LOD{lod}',blades,steps,height,width,4300+variant,dry)
        export_asset(key,[obj],'sedge' if variant==4 else 'grass',lod)
        obj.hide_set(True)

# Scan is 86.5 m wide. Keep four separate rock faces at their real scale,
# retaining scan UVs/materials. Open crop edges are embedded into the terrain.
source=ROOT/'public/assets/world/coastal_cliff_04/coastal_cliff_04_0_lod0.glb'
bpy.ops.import_scene.gltf(filepath=str(source))
imported=[obj for obj in bpy.context.selected_objects if obj.type=='MESH']
assert len(imported)==1
original=imported[0]
for variant,(start,end) in enumerate([(-46,-20),(-24,2),(-1,24),(17,38)]):
    mesh=original.data.copy(); obj=bpy.data.objects.new(f'cliff_face_{variant}_LOD0',mesh);collection.objects.link(obj)
    obj.matrix_world=original.matrix_world.copy()
    bm=bmesh.new();bm.from_mesh(mesh)
    outside=[v for v in bm.verts if v.co.x<start or v.co.x>end]
    bmesh.ops.delete(bm,geom=outside,context='VERTS');bm.to_mesh(mesh);bm.free();mesh.validate();mesh.update()
    center=(start+end)*.5
    for v in mesh.vertices: v.co.x-=center
    obj['source']='Poly Haven coastal_cliff_04 CC0; original triangles and UVs, cropped in native Blender'
    key=f'cliff_face_{variant}'
    export_asset(key,[obj],'cliff',0)
    # Preserve a second authored mesh from the supplied source LOD1 rather
    # than re-running the modifier implicated in the earlier Blender crash.
    before=set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=str(source.with_name('coastal_cliff_04_0_lod1.glb')))
    lowobj=next(o for o in set(bpy.data.objects)-before if o.type=='MESH')
    lowobj.name=f'cliff_face_{variant}_LOD1'
    bm=bmesh.new();bm.from_mesh(lowobj.data)
    bmesh.ops.delete(bm,geom=[v for v in bm.verts if v.co.x<start or v.co.x>end],context='VERTS')
    bm.to_mesh(lowobj.data);bm.free();lowobj.data.validate();lowobj.data.update()
    for v in lowobj.data.vertices: v.co.x-=center
    for old in list(lowobj.users_collection):old.objects.unlink(lowobj)
    collection.objects.link(lowobj)
    export_asset(key,[lowobj],'cliff',1)
    obj.hide_set(True);lowobj.hide_set(True)
original.hide_set(True); original.hide_render=True
for img in bpy.data.images:
    if img.source=='FILE' and img.has_data and not img.packed_file:img.pack()
bpy.context.scene['status']='D11A original groundcover and cropped scanned cliff library; placements require separate review'
bpy.ops.wm.save_as_mainfile(filepath=str(TARGET),compress=True)
report={'revision':'D11A','native_source':TARGET.relative_to(ROOT).as_posix(),
    'sha256':hashlib.sha256(TARGET.read_bytes()).hexdigest(),'catalog':catalog,
    'license':{'grass':'Original authored Varendor geometry','cliff':'CC0 Poly Haven coastal_cliff_04',
        'source_manifest':'docs/assets/world-source-manifest.json'},'visual_verified':False}
(OUT.parent/'groundcover-library-D11A.json').write_text(json.dumps(report,indent=2)+'\n',encoding='utf-8')
print('GROUNDCOVER_LIBRARY '+json.dumps({k:v for k,v in report.items() if k!='catalog'}),flush=True)
