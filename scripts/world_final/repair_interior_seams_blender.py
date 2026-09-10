"""Minimal C-03 -> C-04 native repair; retain every other authored mesh."""
from pathlib import Path
import bpy,bmesh,json,hashlib
ROOT=Path(__file__).resolve().parents[2];OUT=ROOT/'godot-pc/world-final/interiors'
source=ROOT/'art/world-final/Varendor_Interiors_C-04.blend'
assert not source.exists(),'Do not overwrite a saved native master'
bpy.ops.wm.open_mainfile(filepath=str(ROOT/'art/world-final/Varendor_Interiors_C-03.blend'))
reports=[]
for coll in bpy.data.collections:coll.hide_viewport=False
for sid in ['mine','great_cave']:
    obj=bpy.data.objects[sid+'_Walls'];bm=bmesh.new();bm.from_mesh(obj.data)
    before=sum(e.is_boundary for e in bm.edges)
    bmesh.ops.remove_doubles(bm,verts=list(bm.verts),dist=.0001)
    after=sum(e.is_boundary for e in bm.edges);assert after==0,(sid,after)
    bmesh.ops.recalc_face_normals(bm,faces=list(bm.faces));bm.to_mesh(obj.data);bm.free();obj.data.update()
    bpy.ops.object.select_all(action='DESELECT')
    for item in bpy.data.collections[sid].objects:item.select_set(True)
    bpy.ops.export_scene.gltf(filepath=str(OUT/(sid+'.glb')),export_format='GLB',use_selection=True,export_animations=False,export_cameras=False,export_lights=False,export_yup=True)
    p=OUT/(sid+'.json');meta=json.loads(p.read_text('utf-8'))
    meta.update(native_source=source.relative_to(ROOT).as_posix(),layout_revision='C-04',glb_sha256=hashlib.sha256((OUT/(sid+'.glb')).read_bytes()).hexdigest(),open_wall_edges=0,weld_tolerance_m=.0001)
    p.write_text(json.dumps(meta,indent=2)+'\n',encoding='utf-8',newline='\n')
    reports.append({'space':sid,'before_open_edges':before,'after_open_edges':after,'tolerance_m':.0001})
for coll in bpy.data.collections:coll.hide_viewport=coll.name=='great_cave'
bpy.ops.wm.save_as_mainfile(filepath=str(source),compress=True)
report={'source':source.relative_to(ROOT).as_posix(),'sha256':hashlib.sha256(source.read_bytes()).hexdigest(),'repair_only':'Coincident wall vertices within float32 precision; other meshes retained','spaces':reports}
(ROOT/'docs/world-final/interiors-seam-repair.json').write_text(json.dumps(report,indent=2)+'\n',encoding='utf-8',newline='\n')
print('INTERIOR_SEAMS_CLOSED '+json.dumps(report),flush=True)
