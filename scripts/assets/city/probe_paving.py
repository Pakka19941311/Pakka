from pathlib import Path
import bpy,math,json
from mathutils import Vector
ROOT=Path(__file__).resolve().parents[3]
bpy.ops.wm.open_mainfile(filepath=str(ROOT/'art/world-final/Greenfall_Courtyard_P2.blend'),load_ui=False,use_scripts=False)
cam=bpy.data.objects.new('ProbeCamera',bpy.data.cameras.new('ProbeCamera'));bpy.context.scene.collection.objects.link(cam);cam.location=(-40,-240,134);cam.rotation_euler=(Vector((-104,-155,77))-cam.location).to_track_quat('-Z','Y').to_euler();cam.data.lens=42
scene=bpy.context.scene;scene.render.resolution_x=1200;scene.render.resolution_y=800;scene.render.resolution_percentage=100
bpy.context.view_layer.update();frame=cam.data.view_frame(scene=scene);left=min(p.x for p in frame);right=max(p.x for p in frame);bottom=min(p.y for p in frame);top=max(p.y for p in frame);zz=frame[0].z
rows=[]
for px,py in [(190,744),(558,619),(535,586),(625,458),(745,380),(860,360)]:
 v=Vector((left+(right-left)*px/1200,top-(top-bottom)*py/800,zz));direction=(cam.matrix_world.to_3x3()@v).normalized();hit,point,normal,index,obj,matrix=scene.ray_cast(bpy.context.evaluated_depsgraph_get(),cam.location,direction)
 rows.append({'pixel':[px,py],'hit':hit,'point':list(point),'normal':list(normal),'object':obj.name if obj else None,'material':obj.data.materials[obj.data.polygons[index].material_index].name if obj and index>=0 else None})
print('PAVING_PROBE',json.dumps(rows),flush=True)

for name in ["yard_cobbles","road_cobbles"]:
 m=bpy.data.materials[name];print("MATERIAL",name,[(n.name,[(i.name,list(i.default_value) if hasattr(i.default_value,"__len__") else i.default_value) for i in n.inputs if not i.is_linked and hasattr(i,"default_value")]) for n in m.node_tree.nodes if n.type in ["NORMAL_MAP","BUMP","BSDF_PRINCIPLED"]],flush=True)
