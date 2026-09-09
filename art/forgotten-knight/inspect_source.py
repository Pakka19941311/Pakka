"""Read the approved source in Blender; never overwrite the artist's file."""
import argparse
import json
import sys
from pathlib import Path

import bpy
from mathutils import Vector


def vector(v):
    return [round(float(x), 7) for x in v]


def bounds(points):
    pts = list(points)
    return {
        "min": [min(v[i] for v in pts) for i in range(3)],
        "max": [max(v[i] for v in pts) for i in range(3)],
    } if pts else None


def components(obj):
    mesh = obj.data
    parent = list(range(len(mesh.vertices)))

    def find(a):
        while parent[a] != a:
            parent[a] = parent[parent[a]]
            a = parent[a]
        return a

    for edge in mesh.edges:
        a, b = (find(i) for i in edge.vertices)
        if a != b:
            parent[b] = a
    groups = {}
    for v in mesh.vertices:
        groups.setdefault(find(v.index), []).append(v.index)
    result = []
    for indices in sorted(groups.values(), key=len, reverse=True):
        if len(indices) < 8:
            continue
        weights = {}
        for vi in indices:
            for g in mesh.vertices[vi].groups:
                name = obj.vertex_groups[g.group].name
                weights[name] = weights.get(name, 0) + g.weight
        result.append({
            "vertices": len(indices), "first_vertex": indices[0],
            "bounds_world": bounds(obj.matrix_world @ mesh.vertices[i].co for i in indices),
            "weights_top": sorted(weights.items(), key=lambda p: p[1], reverse=True)[:5],
        })
    return result


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--source", required=True)
    parser.add_argument("--output", required=True)
    parser.add_argument("--render", action="store_true")
    args = parser.parse_args(sys.argv[sys.argv.index("--") + 1:])
    output = Path(args.output)
    output.mkdir(parents=True, exist_ok=True)
    bpy.ops.wm.open_mainfile(filepath=str(Path(args.source).resolve()), use_scripts=False)
    report = {"blender": bpy.app.version_string, "objects": [], "armatures": [], "images": [], "materials": []}
    for obj in bpy.data.objects:
        row = {"name": obj.name, "type": obj.type, "location": vector(obj.location),
               "scale": vector(obj.scale), "matrix_world": [vector(v) for v in obj.matrix_world],
               "parent": obj.parent.name if obj.parent else None}
        if obj.type == 'MESH':
            row.update({"vertices": len(obj.data.vertices), "polygons": len(obj.data.polygons),
                        "bounds_world": bounds(obj.matrix_world @ v.co for v in obj.data.vertices),
                        "materials": [m.name if m else None for m in obj.data.materials],
                        "components": components(obj)})
        report["objects"].append(row)
        if obj.type == 'ARMATURE':
            report["armatures"].append({"name": obj.name, "pose_position": obj.data.pose_position,
                "bones": [{"name": b.name, "parent": b.parent.name if b.parent else None,
                           "head": vector(b.head_local), "tail": vector(b.tail_local),
                           "matrix": [vector(v) for v in b.matrix_local], "deform": b.use_deform,
                           "pose_basis": [vector(v) for v in obj.pose.bones[b.name].matrix_basis]}
                          for b in obj.data.bones]})
    for im in bpy.data.images:
        report["images"].append({"name": im.name, "filepath": im.filepath,
            "packed": bool(im.packed_file), "size": list(im.size), "colorspace": im.colorspace_settings.name})
    for mat in bpy.data.materials:
        report["materials"].append({"name": mat.name, "nodes": [
            {"name": n.name, "type": n.type, "image": n.image.name if n.type == 'TEX_IMAGE' and n.image else None}
            for n in mat.node_tree.nodes] if mat.node_tree else []})
    (output / "source_blender_inspection.json").write_text(json.dumps(report, indent=2))
    print("SOURCE_INSPECTED", output / "source_blender_inspection.json", flush=True)
    if not args.render:
        return
    for obj in list(bpy.data.objects):
        if obj.type in {'LIGHT', 'CAMERA'}:
            bpy.data.objects.remove(obj, do_unlink=True)
    for obj in bpy.data.objects:
        if obj.name == 'roses':
            obj.hide_render = True
    meshes = [o for o in bpy.context.scene.objects if o.type == 'MESH' and not o.hide_render]
    bb = bounds(o.matrix_world @ v.co for o in meshes for v in o.data.vertices)
    center = Vector([(bb['min'][i] + bb['max'][i]) * .5 for i in range(3)])
    height = bb['max'][2] - bb['min'][2]
    cam_data = bpy.data.cameras.new('ReviewCamera')
    cam = bpy.data.objects.new('ReviewCamera', cam_data)
    bpy.context.scene.collection.objects.link(cam)
    cam.location = center + Vector((height * 1.2, -height * 2.6, height * .15))
    cam.rotation_euler = (center - cam.location).to_track_quat('-Z', 'Y').to_euler()
    cam_data.type = 'ORTHO'
    cam_data.ortho_scale = height * 1.2
    bpy.context.scene.camera = cam
    for name, offset, power, size in [
            ('Key', (2, -3, 4), 1400, 4), ('Fill', (-3, -1, 2), 900, 4), ('Rim', (0, 3, 3), 1800, 3)]:
        light = bpy.data.lights.new(name, 'AREA')
        light.energy = power
        light.shape = 'DISK'
        light.size = size
        ob = bpy.data.objects.new(name, light)
        bpy.context.scene.collection.objects.link(ob)
        ob.location = center + Vector(offset) * height * .7
        ob.rotation_euler = (center - ob.location).to_track_quat('-Z', 'Y').to_euler()
    scene = bpy.context.scene
    scene.render.engine = 'CYCLES'
    scene.cycles.device = 'CPU'
    scene.cycles.samples = 24
    scene.cycles.use_denoising = True
    scene.render.resolution_x = 900
    scene.render.resolution_y = 1100
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = 'PNG'
    scene.render.film_transparent = False
    if not scene.world:
        scene.world = bpy.data.worlds.new('ReviewWorld')
    scene.world.use_nodes = True
    bg = scene.world.node_tree.nodes.get('Background')
    bg.inputs['Color'].default_value = (.13, .16, .20, 1)
    bg.inputs['Strength'].default_value = .5
    scene.render.filepath = str(output / 'source_review.png')
    bpy.ops.render.render(write_still=True)


if __name__ == '__main__':
    main()
