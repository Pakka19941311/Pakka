"""Collision footprints measured from the actual authored Blender meshes.

Godot geometry uses +Z south; the accepted collision API uses +z north.
Overhead meshes and bridge piers remain camera occluders, not floor obstacles.
"""
import math, json
from mathutils import Vector

def export_collision(collection, path):
    obstacles=[]
    for obj in collection.objects:
        if obj.type!='MESH':continue
        name=obj.name
        points=[Vector(v) for v in obj.bound_box]
        low=Vector(tuple(min(p[i] for p in points) for i in range(3)))
        high=Vector(tuple(max(p[i] for p in points) for i in range(3)))
        center=obj.matrix_world@((low+high)/2)
        corners=[obj.matrix_world@p for p in points]
        bottom=min(p.z for p in corners);top=max(p.z for p in corners)
        parent=obj.parent
        while parent and not parent.get('landmark_id'):parent=parent.parent
        if not parent:continue
        base=float(parent.get('ground_level',bottom))
        overhead=any(s in name for s in ('_roof','_lintel','_entablature','_limb','_crown'))
        support=any(s in name for s in ('_deck','_pier','_platform','_plinth','_access_ramp'))
        blocks=not overhead and not support and top>base+.05 and bottom<base+2.1
        if '_column' in name:blocks=True
        entry={'id':name,'source_mesh':name,'landmark':parent['landmark_id'],
               'x':round(center.x,5),'z':round(center.y,5),'bottom':round(bottom,5),
               'top':round(top,5),'blocksMovement':blocks}
        round_mesh=any(s in name for s in ('_shaft','_corner','_gate_tower','_trunk','_column','_figure','_post','_crown'))
        if round_mesh:
            # Circumradius, never a bounding-box diagonal (which inflates circles).
            radius=max(math.hypot((obj.matrix_world@v.co).x-center.x,(obj.matrix_world@v.co).y-center.y) for v in obj.data.vertices)
            entry.update(kind='circle',radius=round(radius,5))
        else:
            angle=obj.matrix_world.to_euler().z
            size=high-low;scale=obj.matrix_world.to_scale()
            entry.update(kind='box',halfX=round(size.x*abs(scale.x)/2,5),halfZ=round(size.y*abs(scale.y)/2,5),rotation=round(-angle,8))
        # Explicit semantic tags are stored in the .blend as well as runtime data.
        obj['blocks_movement']=blocks;obj['collision_source']='measured authored mesh'
        obstacles.append(entry)
        if '_plinth' in name:
            # The elevated floor is supported above; its actual vertical faces
            # stop entry from the sides. Only the 16m south access ramp is open.
            hx,hz=entry['halfX'],entry['halfZ']
            for suffix,dx,dz,ex,ez in [('west',-hx,0,.04,hz),('east',hx,0,.04,hz),('north',0,hz,hx,.04),
                                       ('south_w',-(hx+8)/2,-hz,(hx-8)/2,.04),('south_e',(hx+8)/2,-hz,(hx-8)/2,.04)]:
                obstacles.append(dict(entry,id=name+'_'+suffix,x=entry['x']+dx,z=entry['z']+dz,halfX=ex,halfZ=ez,blocksMovement=True))
    path.write_text(json.dumps({'schema':1,'coordinate_system':'server x,z; +z north','source':'actual Blender landmark meshes','obstacles':obstacles},indent=2)+'\n',encoding='utf-8',newline='\n')
    return obstacles

if __name__=='__main__':
    import bpy,sys
    from pathlib import Path
    root=Path(__file__).resolve().parents[2]
    bpy.ops.wm.open_mainfile(filepath=str(root/'art/world-final/Varendor_Geography_final-1.0-layout-04.blend'))
    layout=json.loads((root/'godot-pc/world-final/world_layout.json').read_text('utf-8'))
    coll=bpy.data.collections['03_Editable_Spatial_Landmarks_STAGE_B']
    for item in layout['objects']:
        if item['id'] in coll.objects:coll.objects[item['id']]['ground_level']=item['position'][1]
    out=root/'qa-artifacts/world-final/collision-baseline.json';out.parent.mkdir(parents=True,exist_ok=True)
    obstacles=export_collision(coll,out)
    print('LANDMARK_COLLISION_EXPORTED',len(obstacles))
