"""Write the separate D12 ridge candidate as native terrain meshes and GLBs."""
from pathlib import Path
import bpy,json,hashlib
import numpy as np
ROOT=Path(__file__).resolve().parents[2]
REVISION=globals().get('GEOGRAPHY_REVISION','D12')
OUT=ROOT/f'godot-pc/world-final/geology-{REVISION}'
TARGET=ROOT/f'art/world-final/Varendor_Geology_D-{REVISION[1:]}.blend'
if TARGET.exists():raise RuntimeError('Preserve reviewed native shape edits')
data=np.load(OUT/'terrain-data.npz');height=data['heights'];hz,hx=np.gradient(height,2,2)
meta=json.loads((OUT/'terrain.json').read_text());bpy.ops.wm.read_factory_settings(use_empty=True)
with bpy.data.libraries.load(str(ROOT/'art/world-final/Varendor_Surface_D-10.blend'),link=False) as (available,request):
    request.collections=['01_Terrain_128m_Shared_Edges']
collection=request.collections[0];bpy.context.scene.collection.children.link(collection)
placeholder=bpy.data.materials.new('D12_Runtime_Surface_Override');placeholder.diffuse_color=(.4,.4,.4,1)
(OUT/'chunks').mkdir(exist_ok=True)
for number,cell in enumerate(meta['chunks']):
    obj=collection.objects[cell['id']];mesh=obj.data;col,row,nx,nz=cell['col'],cell['row'],cell['columns'],cell['rows']
    gx,gz=np.meshgrid(np.arange(col,col+nx+1),np.arange(row,row+nz+1))
    vertices=np.stack([-800+gx*2,700-gz*2,height[gz,gx]],axis=-1).astype('f4').reshape(-1,3)
    assert len(vertices)==len(mesh.vertices)
    mesh.vertices.foreach_set('co',vertices.ravel());mesh.update()
    normals=np.stack([-hx[gz,gx],hz[gz,gx],np.ones(gx.shape)],axis=-1).reshape(-1,3)
    normals/=np.linalg.norm(normals,axis=1)[:,None];mesh.normals_split_custom_set_from_vertices(normals)
    obj['D12_shape']='Explicit watershed ridges and radial gullies; road corridors remain exactly B height'
    materials=list(mesh.materials);mesh.materials.clear();mesh.materials.append(placeholder)
    bpy.ops.object.select_all(action='DESELECT');obj.select_set(True);bpy.context.view_layer.objects.active=obj
    path=OUT/'chunks'/(cell['id']+'.glb')
    bpy.ops.export_scene.gltf(filepath=str(path),export_format='GLB',use_selection=True,export_animations=False,export_cameras=False,export_lights=False,export_yup=True)
    mesh.materials.clear()
    for mat in materials:mesh.materials.append(mat)
    cell['glb']='chunks/'+path.name
    if number%32==0:print('D12_TERRAIN_EXPORT '+str(number+1),flush=True)
with bpy.data.libraries.load(str(ROOT/'art/world-final/Varendor_Surface_D-10.blend'),link=True) as (available,request):
    request.collections=['02_Water_Basins_And_Flow','03_Editable_Spatial_Landmarks_STAGE_B']
for coll in request.collections:bpy.context.scene.collection.children.link(coll)
for lib in bpy.data.libraries:lib.filepath='//'+Path(lib.filepath).name
bpy.context.scene['status']='D12 separate terrain-shape candidate. Forest/grass unchanged in D11 and not removed; their reseating is pending selection of this geography.'
bpy.ops.wm.save_as_mainfile(filepath=str(TARGET),compress=True)
meta.update(native_source=TARGET.relative_to(ROOT).as_posix(),native_sha256=hashlib.sha256(TARGET.read_bytes()).hexdigest())
(OUT/'terrain.json').write_text(json.dumps(meta,indent=2)+'\n',encoding='utf-8')
report_path=ROOT/f'docs/world-final/geology-shape-{REVISION}.json'
report=json.loads(report_path.read_text());report.update(native_source_pending=False,native_source=meta['native_source'],native_sha256=meta['native_sha256'])
report_path.write_text(json.dumps(report,indent=2)+'\n',encoding='utf-8')
print('D12_NATIVE_TERRAIN '+meta['native_sha256'],flush=True)
