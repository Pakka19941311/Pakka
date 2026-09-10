"""Export native grass point edits, retaining stable IDs. Never overwrite inputs.

Open the D11 native layer in Blender, then run with -- --output <new.json>.
Nonuniform scale and downward-pointing tuft normals are rejected explicitly.
Cliff mesh edits require the mesh exporter, not this point-only operation.
"""
from pathlib import Path
import bpy,json,math,collections,sys
from mathutils import Vector,Euler

def read_native_points():
    cells=collections.defaultdict(list);seen=set()
    for obj in bpy.data.collections['D11_Editable_Grass_Points'].objects:
        if obj.type!='MESH':continue
        mesh=obj.data;asset=obj['asset_key'];rotation=obj.matrix_world.to_quaternion();world_scale=obj.matrix_world.to_scale()
        if max(world_scale)-min(world_scale)>1e-5:raise ValueError('Nonuniform object scale: '+obj.name)
        for i,v in enumerate(mesh.vertices):
            stable=mesh.attributes['stable_index'].data[i].value
            if stable in seen:raise ValueError('Duplicated stable point ID: '+str(stable))
            seen.add(stable)
            scale=mesh.attributes['scale'].data[i].vector
            if max(scale)-min(scale)>1e-5:raise ValueError('Nonuniform tuft scale: '+str(stable))
            q=rotation @ Euler(mesh.attributes['rotation'].data[i].vector).to_quaternion()
            up=q @ Vector((0,0,1))
            if up.z<.5:raise ValueError('Tuft normal is beyond the supported ground slope: '+str({'id':stable,'rotation':list(mesh.attributes['rotation'].data[i].vector),'up':list(up),'object_quaternion':list(rotation)}))
            swing=Vector((0,0,1)).rotation_difference(up);yaw=(swing.inverted()@q).to_euler().z
            p=obj.matrix_world@v.co
            row=[float(p.x),float(p.z),float(-p.y),yaw,float(scale.x*world_scale.x),float(-up.x/up.z),float(up.y/up.z),stable]
            cells[(asset,math.floor(p.x/32),math.floor(-p.y/32))].append(row)
    return [{'asset':key,'cell':[cx,cz],'points':pts} for (key,cx,cz),pts in cells.items()]

if __name__=='__main__':
    args=sys.argv[sys.argv.index('--')+1:] if '--' in sys.argv else []
    if len(args)!=2 or args[0]!='--output':raise RuntimeError('Specify -- --output <new.json>; input is the currently open native layer')
    out=Path(args[1]).resolve()
    if out.exists():raise RuntimeError('Refusing to replace an existing placement revision')
    rows=read_native_points()
    out.parent.mkdir(parents=True,exist_ok=True)
    out.write_text(json.dumps({'source_native':bpy.data.filepath,'grass_cells':rows,'scope':'Point edits only; retain the catalog and fitted cliff layer when integrating'},separators=(',',':'))+'\n',encoding='utf-8')
    print('NATIVE_POINT_EXPORT '+str(out),flush=True)
