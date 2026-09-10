"""C09: correct closed-mesh winding exposed by the carved stone's backface culling."""
from pathlib import Path
import bpy,bmesh,hashlib,json
ROOT=Path(__file__).resolve().parents[2];GEO=ROOT/'godot-pc/world-final/geography'
SOURCE=ROOT/'art/world-final/Varendor_Architecture_C-08.blend';TARGET=ROOT/'art/world-final/Varendor_Architecture_C-09.blend'
if TARGET.exists():raise RuntimeError('Preserve native versions')
bpy.ops.wm.open_mainfile(filepath=str(SOURCE))
coll=bpy.data.collections['03_Editable_Spatial_Landmarks_STAGE_B'];water=bpy.data.collections['02_Water_Basins_And_Flow']
fixed=[];open_meshes=[]
for obj in coll.objects:
    if obj.type!='MESH':continue
    bm=bmesh.new();bm.from_mesh(obj.data)
    if any(not edge.is_manifold for edge in bm.edges):open_meshes.append(obj.name);bm.free();continue
    old=bm.calc_volume(signed=True)
    # Recalculate each closed connected shell and ensure its volume is positive.
    bmesh.ops.recalc_face_normals(bm,faces=list(bm.faces))
    new=bm.calc_volume(signed=True)
    if new<0:bmesh.ops.reverse_faces(bm,faces=list(bm.faces));new=bm.calc_volume(signed=True)
    if old<0:fixed.append({'mesh':obj.name,'signed_volume_before':old,'signed_volume_after':new})
    bm.to_mesh(obj.data);bm.free();obj.data.update()
bpy.ops.object.select_all(action='DESELECT')
for obj in [*coll.objects,*water.objects]:obj.select_set(True)
bpy.ops.export_scene.gltf(filepath=str(GEO/'landmarks.glb'),export_format='GLB',use_selection=True,export_animations=False,export_cameras=False,export_lights=False,export_yup=True)
bpy.ops.wm.save_as_mainfile(filepath=str(TARGET),compress=True)
meta=json.loads((GEO/'terrain.json').read_text('utf-8'));meta['native_source']=TARGET.relative_to(ROOT).as_posix();meta['architecture_revision']='C09'
(GEO/'terrain.json').write_text(json.dumps(meta,indent=2)+'\n',encoding='utf-8',newline='\n')
report={'revision':'C09','native_source':TARGET.relative_to(ROOT).as_posix(),'native_sha256':hashlib.sha256(TARGET.read_bytes()).hexdigest(),'corrected_closed_meshes':fixed,'open_meshes_not_changed':open_meshes,'geometry_positions_changed':False,'collision_changed':False,'visual_verified':False}
(ROOT/'docs/world-final/architecture-C09.json').write_text(json.dumps(report,indent=2)+'\n',encoding='utf-8',newline='\n')
print('ARCHITECTURE_C09_NORMALS '+json.dumps({'corrected':len(fixed),'open_skipped':open_meshes}),flush=True)
