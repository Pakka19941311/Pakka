"""Assemble the fitted armor, licensed motions, rigid sword socket and palettes."""
import argparse
import json
import math
import sys
from pathlib import Path

import bpy
from mathutils import Matrix, Vector

PALETTES = {
    'scarlet': {'title':'Алый орден','tints':{}},
    'northwatch': {'title':'Северная стража','tints':{
        'top_armor_mat':(.62,.76,1.0), 'center_armor_mat':(.66,.78,.96),
        'bottom_armor_mat':(.7,.78,.9), 'details_mat':(.7,.79,.92), 'cloak_mat':(.055,.17,.42)}},
    'ashwarden': {'title':'Пепельный дозор','tints':{
        'top_armor_mat':(.33,.35,.4), 'center_armor_mat':(.3,.32,.37),
        'bottom_armor_mat':(.4,.38,.37), 'details_mat':(.78,.57,.31), 'cloak_mat':(.11,.075,.055)}},
}


def bind_sword(sword, rig, evidence):
    hand=rig.data.bones[evidence['target_bone']]
    blade=Vector(evidence['blade_direction_local']).normalized()
    normal=Vector(evidence['palm_normal_local'])
    normal=(normal-blade*normal.dot(blade)).normalized()
    z=-blade; y=normal; x=y.cross(z).normalized()
    local=Matrix((x,y,z)).transposed().to_4x4()
    local.translation=Vector(evidence['grip_center_local_m'])
    bind=hand.matrix_local @ local
    normal_matrix=bind.to_3x3().inverted().transposed()
    normals=[(normal_matrix @ n.vector).normalized() for n in sword.data.corner_normals]
    for v in sword.data.vertices:v.co=bind@v.co
    sword.data.update();sword.data.normals_split_custom_set(normals)
    sword.parent=rig;sword.parent_type='OBJECT';sword.parent_bone=''
    sword.matrix_parent_inverse=Matrix.Identity(4);sword.matrix_basis=Matrix.Identity(4)
    sword.vertex_groups.clear()
    group=sword.vertex_groups.new(name=hand.name);group.add(list(range(len(sword.data.vertices))),1,'REPLACE')
    for mod in list(sword.modifiers):sword.modifiers.remove(mod)
    mod=sword.modifiers.new('Rigid_Weapon_Socket','ARMATURE');mod.object=rig
    sword['socket_bone']=hand.name
    sword['socket_matrix_bone_head']=[list(row) for row in local]
    sword['attachment']='Rigid skin to RightHand; no bone-parent tail offset'
    return local


def append_actions(path):
    with bpy.data.libraries.load(str(path),link=False) as (src,dst):dst.actions=list(src.actions)
    actions=[a for a in dst.actions if a]
    for a in actions:a.use_fake_user=True
    return actions


def add_cape_motion(rig, actions):
    cape=[rig.pose.bones[f'cape_{i:02d}'] for i in range(1,5)]
    for b in cape:b.rotation_mode='XYZ'
    for action in actions:
        rig.animation_data.action=action
        end=round(action.frame_range[1]);name=action.name
        running=name in {'run','run_weapon','sprint'}
        loop=bool(action.get('loop',False))
        for frame in range(end+1):
            t=frame/max(end,1)
            envelope=1 if loop else math.sin(math.pi*t)**2
            for i,b in enumerate(cape):
                amplitude=.035 if running else .012
                trail=.06 if running else .006
                b.rotation_euler=(trail+amplitude*math.sin(2*math.pi*t-i*.55)*envelope,
                                  .006*math.sin(2*math.pi*t-i*.4)*envelope,
                                  .004*math.sin(2*math.pi*t+.5*i)*envelope)
                b.keyframe_insert('rotation_euler',frame=frame,group=b.name)
        for fc in action.fcurves:
            if 'cape_' in fc.data_path:
                for k in fc.keyframe_points:k.interpolation='LINEAR'


def tinted_material(source, key, tint):
    mat=source.copy();mat.name=f'{key}__{source.name}';mat.use_fake_user=True;mat['palette']=key;mat['source_material']=source.name
    mat['gltf_base_color_factor']=list(tint)+[1.0]
    bsdf=next((n for n in mat.node_tree.nodes if n.type=='BSDF_PRINCIPLED'),None)
    if bsdf:
        color=bsdf.inputs['Base Color']
        if color.is_linked:
            upstream=color.links[0].from_socket
            node=mat.node_tree.nodes.new('ShaderNodeMixRGB');node.name='Palette_Multiply';node.blend_type='MULTIPLY'
            node.inputs[0].default_value=1;node.inputs[2].default_value=(*tint,1)
            mat.node_tree.links.new(upstream,node.inputs[1]);mat.node_tree.links.new(node.outputs[0],color)
        else:color.default_value=tuple(color.default_value[i]*tint[i] for i in range(3))+(1,)
    return mat


def prepare_palettes(objects):
    originals={m.name:m for obj in objects if obj.type=='MESH' for m in obj.data.materials if m}
    for key,palette in PALETTES.items():
        for name,source in originals.items():
            if key=='scarlet':
                source['source_material']=name;source['gltf_base_color_factor']=[1,1,1,1]
                continue
            tinted_material(source,key,palette['tints'].get(name,(1,1,1)))


def apply_palette(objects,key):
    for obj in objects:
        if obj.type!='MESH' or obj.name=='FK_Base_Body':continue
        for i,mat in enumerate(obj.data.materials):
            if not mat:continue
            original=mat.get('source_material',mat.name)
            name=original if key=='scarlet' else f'{key}__{original}'
            obj.data.materials[i]=bpy.data.materials[name]


def select_pose(scene,rig,sword,action,phase):
    rig.animation_data.action=bpy.data.actions[action]
    a=rig.animation_data.action
    scene.frame_set(round(float(a.frame_range[1])*phase))
    sword.hide_render=action.startswith('cast') or action in {'spell1','idle'}
    bpy.context.view_layer.update()


def main():
    ap=argparse.ArgumentParser();ap.add_argument('--base',required=True);ap.add_argument('--actions',required=True)
    ap.add_argument('--socket',required=True);ap.add_argument('--output',required=True);ap.add_argument('--review',action='store_true')
    args=ap.parse_args(sys.argv[sys.argv.index('--')+1:]);out=Path(args.output);out.mkdir(parents=True,exist_ok=True)
    bpy.ops.wm.open_mainfile(filepath=str(Path(args.base).resolve()),use_scripts=False)
    scene=bpy.context.scene;scene.render.fps=30
    rig=bpy.data.objects['FK_Humanoid_Rig'];sword=bpy.data.objects['FK_weapon_sword']
    assets=list(bpy.data.collections['Forgotten_Knight_Fitted'].objects)
    actions=append_actions(args.actions);rig.animation_data_create()
    sys.path.insert(0,str(Path(__file__).parent))
    from fix_run_carry import apply_run_carry
    run_carry=apply_run_carry(rig)
    add_cape_motion(rig,actions)
    socket=bind_sword(sword,rig,json.loads(Path(args.socket).read_text()))
    prepare_palettes(assets)
    rig.location.z=.02
    rig['preview_floor_clearance_m']=.02
    select_pose(scene,rig,sword,'idle_weapon',.2)
    scene.frame_start=0;scene.frame_end=50
    scene.camera.data.ortho_scale=2.55
    scene.camera.location=(3.4,-6.5,2.3)
    scene.camera.rotation_euler=(Vector((0,-.08,1.02))-scene.camera.location).to_track_quat('-Z','Y').to_euler()
    manifest={'palettes':PALETTES,'source_armor':'The Forgotten Knight / Igor Oskolskiy (dark_igorek), CC BY 4.0',
              'body':'MakeHuman / MPFB2 hm08, CC0','animations':'Quaternius UAL1/UAL2 Standard, CC0',
              'scope':'Editable character art and animation assets; not integrated into gameplay',
              'fps':30,'body_height_m':1.84,'bones':len(rig.data.bones),
              'actions':[{'name':a.name,'frames':list(a.frame_range),'loop':bool(a.get('loop',False)),
                          'source_clip':a.get('source_clip','')} for a in actions],
              'weapon_socket':{'bone':'mixamorig:RightHand','local_matrix':[list(v) for v in socket]},
              'skin_visibility':'Full anatomical base retained hidden in Blender; equipped GLB excludes covered body',
              'preview_floor_clearance_m':.02,'run_carry':run_carry}
    (out/'character_manifest.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2))
    bpy.ops.wm.save_as_mainfile(filepath=str(out/'Varendor_Forgotten_Knight_Master.blend'))
    if args.review:
        scene.cycles.samples=12;scene.render.resolution_x=720;scene.render.resolution_y=900
        for action,phase in [('idle_weapon',.2),('run_weapon',.15),('sword_attack',.25),('sword_attack',.5),('cast_release',.5)]:
            select_pose(scene,rig,sword,action,phase)
            scene.render.filepath=str(out/f'Review_{action}_{round(phase*100):02d}.png')
            bpy.ops.render.render(write_still=True)
    print('CHARACTER_ASSEMBLED',str(out/'Varendor_Forgotten_Knight_Master.blend'),flush=True)


if __name__=='__main__':main()
