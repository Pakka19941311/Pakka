"""Correct RNA attribute-array aliasing in a new native revision only."""
from pathlib import Path
import bpy,json,hashlib
from mathutils import Vector,Quaternion
ROOT=Path(__file__).resolve().parents[2];OUT=ROOT/'godot-pc/world-final/nature'
TARGET=ROOT/'art/world-final/Varendor_Groundcover_D-11D.blend'
if TARGET.exists():raise RuntimeError('Preserve native revision')
data=json.loads((OUT/'groundcover-authored-D11.json').read_text())
source=ROOT/data['native_source'];oldsha=hashlib.sha256(source.read_bytes()).hexdigest()
bpy.ops.wm.open_mainfile(filepath=str(source))
points={p[7]:p for c in data['grass_cells'] for p in c['points']}
count=0
for obj in bpy.data.collections['D11_Editable_Grass_Points'].objects:
    mesh=obj.data;rotations=[];scales=[];positions=[]
    for index in range(len(mesh.vertices)):
        stable=mesh.attributes['stable_index'].data[index].value;p=points[stable]
        q=Vector((0,0,1)).rotation_difference(Vector((-p[5],p[6],1)).normalized())@Quaternion((0,0,1),p[3])
        rotations.extend(q.to_euler());scales.extend((p[4],)*3);positions.extend((p[0],-p[2],p[1]));count+=1
    mesh.vertices.foreach_set('co',positions)
    mesh.attributes['rotation'].data.foreach_set('vector',rotations)
    mesh.attributes['scale'].data.foreach_set('vector',scales)
assert count==data['counts']['grass_tufts']
bpy.context.scene['D11D_fix']='Restore position, rotation and scale from the intact saved placement table. Reacquire arrays by name; keep stable IDs and fitted cliffs.'
bpy.ops.wm.save_as_mainfile(filepath=str(TARGET),compress=True)
assert hashlib.sha256(source.read_bytes()).hexdigest()==oldsha
data.update(native_source=TARGET.relative_to(ROOT).as_posix(),native_sha256=hashlib.sha256(TARGET.read_bytes()).hexdigest(),native_roundtrip_verified=False)
(OUT/'groundcover-authored-D11.json').write_text(json.dumps(data,separators=(',',':'))+'\n',encoding='utf-8')
(ROOT/'docs/world-final/groundcover-D11.json').write_text(json.dumps({k:v for k,v in data.items() if k not in ('catalog','grass_cells','cliffs')},indent=2)+'\n',encoding='utf-8')
print('D11D_ATTRIBUTE_REPAIR '+json.dumps({'points':count,'native':data['native_source'],'sha256':data['native_sha256'],'original_unchanged':True}),flush=True)
