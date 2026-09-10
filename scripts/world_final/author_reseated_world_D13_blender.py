"""Preserve editable terrain, forest, grass and fitted cliffs in one new master."""
from pathlib import Path
import bpy,json,hashlib,sys
import numpy as np
from mathutils import Vector,Quaternion
sys.path.insert(0,str(Path(__file__).resolve().parent))
from build_geography import sample_grid
ROOT=Path(__file__).resolve().parents[2];OUT=ROOT/'godot-pc/world-final/nature'
TARGET=ROOT/'art/world-final/Varendor_Nature_D-13.blend'
if TARGET.exists():raise RuntimeError('Preserve existing native source')
forest=json.loads((OUT/'authored-D13.json').read_text());grass=json.loads((OUT/'groundcover-authored-D13.json').read_text())
old=np.fromfile(ROOT/'godot-pc/world-final/geography/heightmap.f32',dtype='<f4').reshape(701,801)
new=np.fromfile(ROOT/'godot-pc/world-final/geology-D13/heightmap.f32',dtype='<f4').reshape(701,801)
protected={p:hashlib.sha256((ROOT/p).read_bytes()).hexdigest() for p in ['art/world-final/Varendor_Surface_D-10.blend','art/world-final/Varendor_Groundcover_D-11D.blend','art/world-final/Varendor_Geology_D-13.blend']}
bpy.ops.wm.read_factory_settings(use_empty=True)
def append_collections(path,names):
    with bpy.data.libraries.load(str(ROOT/path),link=False) as (available,request):
        assert all(name in available.collections for name in names)
        request.collections=names
    for coll in request.collections:bpy.context.scene.collection.children.link(coll)
    return request.collections
# Export the few changed cliffs before loading the large geometry-node forest.
# The saved source contains the full layer; export does not evaluate that forest.
cliffs=append_collections('art/world-final/Varendor_Groundcover_D-11D.blend',['D11_Fitted_Scanned_Cliffs'])[0]
placeholder=bpy.data.materials.new('D13_Runtime_Surface_Override');placeholder.diffuse_color=(.4,.4,.4,1)
collision=[];changed_cliffs=0;meshes={entry['id']:entry for entry in grass['cliff_meshes']}
for obj in cliffs.objects:
    mesh=obj.data;v=np.empty(len(mesh.vertices)*3,dtype='f4');mesh.vertices.foreach_get('co',v);v=v.reshape(-1,3)
    delta=sample_grid(new,v[:,0],-v[:,1])-sample_grid(old,v[:,0],-v[:,1])
    if np.max(abs(delta))>1e-6:
        v[:,2]+=delta;mesh.vertices.foreach_set('co',v.ravel());mesh.update()
        # Recalculate smooth geometric normals after the terrain deformation.
        if mesh.has_custom_normals:bpy.context.view_layer.objects.active=obj;bpy.ops.mesh.customdata_custom_splitnormals_clear()
        previous=list(mesh.materials);mesh.materials.clear();mesh.materials.append(placeholder)
        bpy.ops.object.select_all(action='DESELECT');obj.select_set(True);bpy.context.view_layer.objects.active=obj
        path=OUT/'assets'/f'D13_{obj.name}_surface.glb'
        bpy.ops.export_scene.gltf(filepath=str(path),export_format='GLB',use_selection=True,export_animations=False,export_cameras=False,export_lights=False,export_yup=True)
        mesh.materials.clear()
        for mat in previous:mesh.materials.append(mat)
        meshes[obj.name].update(path=path.relative_to(OUT).as_posix(),sha256=hashlib.sha256(path.read_bytes()).hexdigest(),terrain_reseated=True)
        changed_cliffs+=1
    lo=v.min(axis=0);hi=v.max(axis=0)
    collision.append(dict(id=obj.name,kind='box',x=float((lo[0]+hi[0])/2),z=float((lo[1]+hi[1])/2),halfX=float((hi[0]-lo[0])/2),halfZ=float((hi[1]-lo[1])/2),rotation=0,bottom=float(lo[2]),top=float(hi[2]),blocksMovement=True,source_mesh=obj.name,landmark=obj.name))
print('D13_CLIFFS_EXPORTED '+str(changed_cliffs),flush=True)
append_collections('art/world-final/Varendor_Geology_D-13.blend',['01_Terrain_128m_Shared_Edges'])
append_collections('art/world-final/Varendor_Surface_D-10.blend',['D01_Editable_Forest_Sample','D08_Editable_Forest_Placement_Cells','02_Water_Basins_And_Flow','03_Editable_Spatial_Landmarks_STAGE_B'])
append_collections('art/world-final/Varendor_Groundcover_D-11D.blend',['D11_Editable_Grass_Points'])
forest_count=0
for obj in bpy.data.collections['D08_Editable_Forest_Placement_Cells'].objects:
    mesh=obj.data;positions=[]
    for i in range(len(mesh.vertices)):
        index=mesh.attributes['placement_index'].data[i].value;p=forest['placements'][index]
        assert p['asset']==obj['asset_key'];positions.extend((p['position'][0],-p['position'][2],p['position'][1]));forest_count+=1
    mesh.vertices.foreach_set('co',positions);obj['placement_source']='authored-D13.json'
sample_count=sum('stable_id' in obj for obj in bpy.data.collections['D01_Editable_Forest_Sample'].objects)
assert forest_count+sample_count==len(forest['placements']),(forest_count,sample_count)
points={p[7]:p for cell in grass['grass_cells'] for p in cell['points']};grass_count=0
for obj in bpy.data.collections['D11_Editable_Grass_Points'].objects:
    mesh=obj.data;positions=[];rotations=[]
    for i in range(len(mesh.vertices)):
        stable=mesh.attributes['stable_index'].data[i].value;p=points[stable]
        positions.extend((p[0],-p[2],p[1]));q=Vector((0,0,1)).rotation_difference(Vector((-p[5],p[6],1)).normalized())@Quaternion((0,0,1),p[3]);rotations.extend(q.to_euler());grass_count+=1
    mesh.vertices.foreach_set('co',positions);mesh.attributes['rotation'].data.foreach_set('vector',rotations);obj['placement_source']='groundcover-authored-D13.json'
assert grass_count==len(points)
for lib in bpy.data.libraries:lib.filepath='//'+Path(lib.filepath).name
bpy.context.scene['D13_status']='Retained point IDs/XZ/density, vertically seated on the separate D13 terrain. D12 material is a Godot-only candidate until native material parity pass.'
bpy.context.scene['D13_counts']=json.dumps(dict(forest=len(forest['placements']),grass=grass_count,cliffs=len(meshes)))
bpy.ops.wm.save_as_mainfile(filepath=str(TARGET),compress=True)
digest=hashlib.sha256(TARGET.read_bytes()).hexdigest()
for p,sha in protected.items():assert hashlib.sha256((ROOT/p).read_bytes()).hexdigest()==sha
for filename,data in [('authored-D13.json',forest),('groundcover-authored-D13.json',grass)]:
    data.update(native_source=TARGET.relative_to(ROOT).as_posix(),native_sha256=digest,native_source_pending=False)
    (OUT/filename).write_text(json.dumps(data,separators=(',',':'))+'\n',encoding='utf-8')
(OUT/'groundcover-collision-D13.json').write_text(json.dumps(dict(schema=1,obstacles=collision),separators=(',',':'))+'\n')
report_path=ROOT/'docs/world-final/nature-reseat-D13.json';report=json.loads(report_path.read_text())
report.update(native_pending=False,native_source=TARGET.relative_to(ROOT).as_posix(),native_sha256=digest,changed_cliff_meshes=changed_cliffs,forest_native_points=forest_count,retained_native_sample=sample_count,grass_native_points=grass_count,protected_sources_unchanged=True,native_roundtrip_pending=True)
report_path.write_text(json.dumps(report,indent=2)+'\n');print('D13_NATIVE_SAVED '+digest,flush=True)
