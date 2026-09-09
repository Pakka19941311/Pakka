"""Render the three actual PBR equipment palettes together in Blender."""
import argparse
import math
import sys
from pathlib import Path

import bpy
from mathutils import Vector

sys.path.insert(0, str(Path(__file__).parent))
from assemble_character import apply_palette, PALETTES


def text_label(camera, text, xy, size, material, font):
    data = bpy.data.curves.new('Review_Label', 'FONT')
    data.body = text
    data.align_x = 'CENTER'
    data.align_y = 'CENTER'
    data.size = size
    data.font = font
    obj = bpy.data.objects.new('Review_Label', data)
    bpy.context.scene.collection.objects.link(obj)
    obj.parent = camera
    obj.location = (xy[0], xy[1], -1)
    obj.data.materials.append(material)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--master', required=True)
    parser.add_argument('--output', required=True)
    args = parser.parse_args(sys.argv[sys.argv.index('--') + 1:])
    out = Path(args.output).resolve()
    out.mkdir(parents=True, exist_ok=True)
    bpy.ops.wm.open_mainfile(filepath=str(Path(args.master).resolve()), use_scripts=False)
    scene = bpy.context.scene
    source = list(bpy.data.collections['Forgotten_Knight_Fitted'].objects)
    original_rig = bpy.data.objects['FK_Humanoid_Rig']
    positions = (-1.35, 0, 1.35)
    for key, position in zip(PALETTES, positions):
        coll = bpy.data.collections.new('Review_' + key)
        scene.collection.children.link(coll)
        copies = {}
        for original in source:
            obj = original.copy()
            if original.data:
                obj.data = original.data.copy()
            obj.name = key + '__' + original.name
            coll.objects.link(obj)
            copies[original] = obj
        rig = copies[original_rig]
        for original, obj in copies.items():
            if original.parent in copies:
                obj.parent = copies[original.parent]
            for modifier in obj.modifiers:
                if modifier.type == 'ARMATURE':
                    modifier.object = rig
            obj.hide_render = original.name in {'FK_Base_Body', 'FK_weapon_sword'}
        rig.location.x = position
        rig.rotation_euler.z = math.radians(-12)
        rig.animation_data.action = bpy.data.actions['idle']
        apply_palette(list(copies.values()), key)
    for original in source:
        original.hide_render = True
    scene.frame_set(22)
    cam = scene.camera
    cam.location = (0, -9, 2.15)
    cam.rotation_euler = (Vector((0, 0, 1.04)) - cam.location).to_track_quat('-Z', 'Y').to_euler()
    cam.data.ortho_scale = 4.8
    scene.render.engine = 'CYCLES'
    scene.cycles.samples = 24
    scene.cycles.use_denoising = True
    scene.render.resolution_x = 1800
    scene.render.resolution_y = 1100
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = 'PNG'
    font_path = '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf'
    font = bpy.data.fonts.load(font_path) if Path(font_path).exists() else bpy.data.fonts[0]
    text_mat = bpy.data.materials.new('Review_Type')
    text_mat.use_nodes = True
    nodes = text_mat.node_tree.nodes
    nodes.clear()
    emission = nodes.new('ShaderNodeEmission')
    emission.inputs['Color'].default_value = (.8, .84, .9, 1)
    output = nodes.new('ShaderNodeOutputMaterial')
    text_mat.node_tree.links.new(emission.outputs[0], output.inputs[0])
    dark_type = text_mat.copy()
    dark_type.name = 'Review_Type_Dark'
    next(n for n in dark_type.node_tree.nodes if n.type == 'EMISSION').inputs['Color'].default_value = (.035, .045, .06, 1)
    text_label(cam, 'VARENDOR  /  FORGOTTEN KNIGHT', (0, 1.27), .11, text_mat, font)
    text_label(cam, 'Подогнанные доспехи · три варианта материалов', (0, 1.09), .065, text_mat, font)
    for key, position in zip(PALETTES, positions):
        text_label(cam, PALETTES[key]['title'], (position, -1.12), .09, dark_type, font)
    text_label(cam, 'Одна модель · единый скелет · сменные части экипировки', (0, -1.32), .061, dark_type, font)
    scene.render.filepath = str(out / 'Varendor_Knight_Variants.png')
    bpy.ops.render.render(write_still=True)
    print('VARIANT_BOARD_COMPLETE', scene.render.filepath, flush=True)


if __name__ == '__main__':
    main()
