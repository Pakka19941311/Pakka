"""Reopen the completed source and verify actual native geometry and edit export."""
from pathlib import Path
import bpy,json,hashlib,sys,math,struct
import numpy as np
sys.path.insert(0,str(Path(__file__).resolve().parent))
from export_groundcover_points_blender import read_native_points
ROOT=Path(__file__).resolve().parents[2];OUT=ROOT/'godot-pc/world-final/nature'
forest=json.loads((OUT/'authored-D13.json').read_text());grass=json.loads((OUT/'groundcover-authored-D13.json').read_text())
source=ROOT/grass['native_source'];before=hashlib.sha256(source.read_bytes()).hexdigest();assert before==grass['native_sha256']
bpy.ops.wm.open_mainfile(filepath=str(source))
dependencies={lib.filepath:Path(bpy.path.abspath(lib.filepath)).exists() for lib in bpy.data.libraries};assert all(dependencies.values())
# Suspend expensive instance evaluation only for this read/edit test. It is
# never saved to the native source and does not alter Godot visibility.
for obj in bpy.data.objects:
    for modifier in obj.modifiers:
        if modifier.type=='NODES':modifier.show_viewport=False;modifier.show_render=False
forests=bpy.data.collections['D08_Editable_Forest_Placement_Cells'].objects
fobj=forests[len(forests)//2];fi=len(fobj.data.vertices)//2;forest_edit=fobj.data.attributes['placement_index'].data[fi].value
fobj.data.vertices[fi].co.x+=.375
errors=[];seen=set()
for obj in forests:
    for i,v in enumerate(obj.data.vertices):
        index=obj.data.attributes['placement_index'].data[i].value;assert index not in seen;seen.add(index)
        wanted=list(forest['placements'][index]['position'])
        if index==forest_edit:wanted[0]+=.375
        actual=obj.matrix_world@v.co
        errors.append(max(abs(actual.x-wanted[0]),abs(actual.z-wanted[1]),abs(-actual.y-wanted[2])))
assert max(errors)<.0001
sample_count=sum('stable_id' in obj for obj in bpy.data.collections['D01_Editable_Forest_Sample'].objects)
assert len(seen)+sample_count==len(forest['placements'])
objects=list(bpy.data.collections['D11_Editable_Grass_Points'].objects);obj=objects[len(objects)//2];i=len(obj.data.vertices)//2
grass_edit=obj.data.attributes['stable_index'].data[i].value;obj.data.vertices[i].co.x+=.375
flat={p[7]:p for c in read_native_points() for p in c['points']};positions=[];attributes=[]
for c in grass['grass_cells']:
    for p in c['points']:
        wanted=list(p)
        if p[7]==grass_edit:wanted[0]+=.375
        actual=flat[p[7]];positions.append(max(abs(actual[j]-wanted[j]) for j in range(3)))
        attributes.append(max(abs(math.atan2(math.sin(actual[3]-wanted[3]),math.cos(actual[3]-wanted[3]))),max(abs(actual[j]-wanted[j]) for j in range(4,7))))
assert len(flat)==grass['counts']['grass_tufts'] and max(positions)<.0001 and max(attributes)<.00002
height=np.fromfile(ROOT/'godot-pc/world-final/geology-D13/heightmap.f32',dtype='<f4').reshape(701,801)
meta=json.loads((ROOT/'godot-pc/world-final/geology-D13/terrain.json').read_text());terrain_errors=[]
for cell in meta['chunks']:
    obj=bpy.data.collections['01_Terrain_128m_Shared_Edges'].objects[cell['id']];v=np.empty(len(obj.data.vertices)*3,dtype='f4');obj.data.vertices.foreach_get('co',v)
    actual=v.reshape(-1,3)[:,2];r,c,nz,nx=cell['row'],cell['col'],cell['rows'],cell['columns']
    terrain_errors.append(float(np.max(abs(actual-height[r:r+nz+1,c:c+nx+1].ravel()))))
assert max(terrain_errors)==0
cliffs=list(bpy.data.collections['D11_Fitted_Scanned_Cliffs'].objects);assert len(cliffs)==151
# Isolate a copied cliff after its edit so mesh export cannot evaluate the
# full forest. The edited vertex remains identifiable by its exact position.
cliff=cliffs[0];vertices=[tuple(v.co) for v in cliff.data.vertices];faces=[tuple(p.vertices) for p in cliff.data.polygons]
edit_index=len(vertices)//2;value=list(vertices[edit_index]);value[2]+=.375;vertices[edit_index]=tuple(value)
cliff_id=cliff.name;bpy.ops.wm.read_factory_settings(use_empty=True)
mesh=bpy.data.meshes.new('D13_in_memory_cliff_edit');mesh.from_pydata(vertices,[],faces);obj=bpy.data.objects.new('D13_in_memory_cliff_edit',mesh);bpy.context.scene.collection.objects.link(obj)
obj.select_set(True);bpy.context.view_layer.objects.active=obj
export=ROOT/'qa-artifacts/world-final/native-roundtrip-D13/cliff-edited.glb';export.parent.mkdir(parents=True,exist_ok=True)
bpy.ops.export_scene.gltf(filepath=str(export),export_format='GLB',use_selection=True,export_animations=False,export_yup=True)
raw=export.read_bytes();length=struct.unpack_from('<I',raw,12)[0];doc=json.loads(raw[20:20+length]);binary=raw[28+length:]
found=False;target=np.array([value[0],value[2],-value[1]],dtype='f4')
for m in doc['meshes']:
    for p in m['primitives']:
        a=doc['accessors'][p['attributes']['POSITION']];view=doc['bufferViews'][a['bufferView']];offset=view.get('byteOffset',0)+a.get('byteOffset',0)
        arr=np.ndarray((a['count'],3),dtype='<f4',buffer=binary,offset=offset,strides=(view.get('byteStride',12),4))
        found|=bool(np.any(np.max(abs(arr-target),axis=1)<.0001))
assert found and hashlib.sha256(source.read_bytes()).hexdigest()==before
report=dict(native_source=source.relative_to(ROOT).as_posix(),sha256=before,reopened=True,source_saved=False,source_unchanged=True,linked_dependencies=dependencies,forest_points=len(seen),sample_roots=sample_count,grass_points=len(flat),max_forest_position_error_m=max(errors),max_grass_position_error_m=max(positions),max_grass_attribute_error=max(attributes),max_terrain_height_error_m=max(terrain_errors),in_memory_forest_edit_id=forest['placements'][forest_edit]['id'],in_memory_grass_edit_id=grass_edit,cliff_edit_id=cliff_id,edit_offset_m=.375,cliff_edit_verified_in_export=found,visual_check=False)
(ROOT/'docs/world-final/native-roundtrip-D13.json').write_text(json.dumps(report,indent=2)+'\n');print('D13_NATIVE_ROUNDTRIP '+json.dumps(report),flush=True)
