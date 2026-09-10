"""Version the groundcover lighting after the actual D11A Godot lineup."""
from pathlib import Path
import bpy,json,hashlib
from mathutils import Vector
ROOT=Path(__file__).resolve().parents[2];OUT=ROOT/'godot-pc/world-final/nature'
TARGET=ROOT/'art/world-final/Varendor_Groundcover_D-11B.blend'
if TARGET.exists():raise RuntimeError('Preserve native revision')
data=json.loads((OUT/'groundcover-library-D11A.json').read_text())
bpy.ops.wm.open_mainfile(filepath=str(ROOT/data['native_source']))
for key,entry in data['catalog'].items():
    if entry['kind']=='cliff':continue
    for lod,desc in enumerate(entry['lods']):
        obj=bpy.data.objects[f'{key}_LOD{lod}'];mesh=obj.data
        # Transfer a softly upward clump normal. Thin ribbons otherwise have
        # fully black reverse faces despite ambient light in the real lineup.
        normals=[Vector((v.co.x*.36,v.co.y*.36,1)).normalized() for v in mesh.vertices]
        mesh.normals_split_custom_set_from_vertices(normals)
        for c in mesh.color_attributes['BladeColor'].data:
            value=c.color
            value[0]*=1.28;value[1]*=1.32;value[2]*=1.28;c.color=value
        obj['normal_authoring']='Soft upward clump normals; source blade triangles unchanged'
        bpy.ops.object.select_all(action='DESELECT');obj.hide_set(False);obj.select_set(True);bpy.context.view_layer.objects.active=obj
        path=OUT/'assets'/f'{key}_D11B_lod{lod}.glb'
        bpy.ops.export_scene.gltf(filepath=str(path),export_format='GLB',use_selection=True,export_apply=True,export_yup=True,export_animations=False,export_cameras=False,export_lights=False)
        desc.update(path=path.relative_to(OUT).as_posix(),bytes=path.stat().st_size,sha256=hashlib.sha256(path.read_bytes()).hexdigest())
        obj.hide_set(True)
bpy.ops.wm.save_as_mainfile(filepath=str(TARGET),compress=True)
data.update(revision='D11B',native_source=TARGET.relative_to(ROOT).as_posix(),sha256=hashlib.sha256(TARGET.read_bytes()).hexdigest(),visual_verified=False,
    reason='D11A actual Godot lineup had excessively dark grass reverse faces; adjust authored normals and pigment, preserving shape')
(OUT/'groundcover-library-D11B.json').write_text(json.dumps(data,indent=2)+'\n',encoding='utf-8')
print('GROUNDCOVER_NORMALS_SAVED '+data['sha256'],flush=True)
