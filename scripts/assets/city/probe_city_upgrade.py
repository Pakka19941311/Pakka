"""Read-only geometry inventory for fitting licensed city components."""
from pathlib import Path
import bpy,json
from mathutils import Vector
ROOT=Path(__file__).resolve().parents[3]
OUT=ROOT/'work/qa/city-upgrade-probe';OUT.mkdir(parents=True,exist_ok=True)
def bounds(objects):
    points=[ob.matrix_world@Vector(p) for ob in objects if ob.type=='MESH' for p in ob.bound_box]
    if not points:return None
    lo=[min(p[i] for p in points) for i in range(3)];hi=[max(p[i] for p in points) for i in range(3)]
    return {'min':lo,'max':hi,'dimensions':[hi[i]-lo[i] for i in range(3)]}
result={}
bpy.ops.wm.open_mainfile(filepath=str(ROOT/'art/world-final/Greenfall_Castle_Quarter_03.blend'),load_ui=False,use_scripts=False)
result['original']={ob.name:{'zone':ob.get('zone'),**(bounds(ob.children_recursive) or {})} for ob in bpy.context.scene.objects if ob.type=='EMPTY'}
for name in ['P2_housepack','P2_gatehouse']:
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=str(ROOT/'godot-pc/world-expansion-v3/city/assets'/f'{name}.glb'))
    bpy.context.view_layer.update()
    result[name]={ob.name:{'bounds':bounds([ob]),'vertices':len(ob.data.vertices),'materials':[m.name for m in ob.data.materials]} for ob in bpy.context.scene.objects if ob.type=='MESH'}
(OUT/'bounds.json').write_text(json.dumps(result,indent=2),encoding='utf-8')
print('CITY_PROBE_READY',OUT/'bounds.json',flush=True)
