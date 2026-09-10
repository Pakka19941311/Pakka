"""Read-only reopen of the timed-out native export plus an in-memory edit check."""
from pathlib import Path
import bpy,json,hashlib,sys,math
import numpy as np
sys.path.insert(0,str(Path(__file__).resolve().parent))
from export_groundcover_points_blender import read_native_points
ROOT=Path(__file__).resolve().parents[2]
expected=json.loads((ROOT/'godot-pc/world-final/nature/groundcover-authored-D11.json').read_text())
source=ROOT/expected['native_source']
before=hashlib.sha256(source.read_bytes()).hexdigest()
bpy.ops.wm.open_mainfile(filepath=str(source))
assert before==expected['native_sha256']
dependencies={lib.filepath:Path(bpy.path.abspath(lib.filepath)).exists() for lib in bpy.data.libraries}
assert all(dependencies.values())
# One edit in memory must survive point export. The original .blend is never saved.
objects=list(bpy.data.collections['D11_Editable_Grass_Points'].objects)
obj=objects[len(objects)//2];index=len(obj.data.vertices)//2
edited_id=obj.data.attributes['stable_index'].data[index].value
obj.data.vertices[index].co.x+=.375
actual=read_native_points()
flat={p[7]:p for c in actual for p in c['points']}
positions=[];attributes=[];largest=0;count=0
for cell in expected['grass_cells']:
    for source_p in cell['points']:
        p=flat[source_p[7]];wanted=list(source_p)
        if source_p[7]==edited_id:wanted[0]+=.375
        positions.append(max(abs(p[j]-wanted[j]) for j in range(3)))
        attributes.append(max(abs(math.atan2(math.sin(p[3]-wanted[3]),math.cos(p[3]-wanted[3]))),max(abs(p[j]-wanted[j]) for j in range(4,7))))
        count+=1
assert count==expected['counts']['grass_tufts']==len(flat)
diagnostic={'max_position_error_m':max(positions),'max_attribute_error':max(attributes),'largest_attribute_index':int(np.argmax(attributes))}
if max(attributes)>=.00001:
    original=[p for c in expected['grass_cells'] for p in c['points']][diagnostic['largest_attribute_index']]
    diagnostic.update(original=original,exported=flat[original[7]])
print('D11_ROUNDTRIP_ERRORS '+json.dumps(diagnostic),flush=True)
assert max(positions)<.0001 and max(attributes)<.00001
cliffs=[o for o in bpy.data.collections['D11_Fitted_Scanned_Cliffs'].objects if o.type=='MESH']
assert len(cliffs)==len(expected['cliff_meshes'])==151
after=hashlib.sha256(source.read_bytes()).hexdigest();assert before==after
result={'native_source':source.relative_to(ROOT).as_posix(),'sha256':before,'reopened':True,'linked_dependencies':dependencies,
    'point_count':count,'cliff_mesh_count':len(cliffs),'max_position_error_m':max(positions),'max_attribute_error':max(attributes),
    'in_memory_edited_id':edited_id,'edit_x_m':.375,'edit_preserved_by_export':True,'source_saved':False,'source_unchanged':True,
    'scope':'Point position/rotation/uniform scale round-trip. Cliff edit re-export and final art remain unverified.'}
(ROOT/'docs/world-final/groundcover-native-check-D11.json').write_text(json.dumps(result,indent=2)+'\n',encoding='utf-8')
print('D11_NATIVE_REOPEN '+json.dumps(result),flush=True)
