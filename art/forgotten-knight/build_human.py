"""Standalone Blender builder for the prepared CC0 MakeHuman male body.
Usage: blender -b --python build_human.py -- --out /path/body
Can also be imported: body, rig, info = create_human(collection=...)
No addon installation or scene clearing when imported.
"""
from pathlib import Path
import json,sys,argparse
import bpy
ROOT=Path(__file__).parent

def create_human(collection=None, name='Varendor_Human_Male', height=None, *, data=None):
    data_path=Path(data).expanduser().resolve() if data else ROOT/'prepared/athletic_male_hm08.json'
    info=json.loads(data_path.read_text())
    collection=collection or bpy.context.scene.collection
    factor=(height or info['height_m'])/info['height_m']
    points=[tuple(c*factor for c in v) for v in info['vertices']]
    faces=[[corner[0] for corner in face] for face in info['faces']]
    mesh=bpy.data.meshes.new(name+'_Mesh');mesh.from_pydata(points,[],faces);mesh.update()
    body=bpy.data.objects.new(name+'_Body',mesh);collection.objects.link(body)
    uv=mesh.uv_layers.new(name='UVMap')
    for polygon,source in zip(mesh.polygons,info['faces']):
        polygon.use_smooth=True
        for loop,corner in zip(polygon.loop_indices,source):uv.data[loop].uv=info['uv'][corner[1]]
    mat=bpy.data.materials.new(name+'_ClayPreview');mat.diffuse_color=(0.33,0.25,0.20,1);mat.use_nodes=True
    bsdf=mat.node_tree.nodes.get('Principled BSDF');bsdf.inputs['Base Color'].default_value=(.33,.25,.20,1);bsdf.inputs['Roughness'].default_value=.6
    body.data.materials.append(mat)
    arm=bpy.data.armatures.new(name+'_Mixamo52');rig=bpy.data.objects.new(name+'_Rig',arm);collection.objects.link(rig)
    bpy.ops.object.select_all(action='DESELECT');rig.select_set(True);bpy.context.view_layer.objects.active=rig
    bpy.ops.object.mode_set(mode='EDIT')
    for bone_name,b in info['bones'].items():
        bone=arm.edit_bones.new(bone_name);bone.head=tuple(x*factor for x in b['head']);bone.tail=tuple(x*factor for x in b['tail']);bone.roll=b['roll']
    for bone_name,b in info['bones'].items():
        bone=arm.edit_bones[bone_name]
        if b['parent']:bone.parent=arm.edit_bones[b['parent']]
        bone.use_connect=b['use_connect'];bone.inherit_scale=b['inherit_scale']
    bpy.ops.object.mode_set(mode='OBJECT')
    for bone_name,rows in info['weights'].items():
        group=body.vertex_groups.new(name=bone_name)
        for i,weight in rows:group.add([i],weight,'REPLACE')
    body.parent=rig
    mod=body.modifiers.new('MPFB_Mixamo_Deform','ARMATURE');mod.object=rig;mod.use_deform_preserve_volume=True
    rig.show_in_front=True
    for pb in rig.pose.bones:pb.rotation_mode='QUATERNION'
    body['source']='MakeHuman Community / MPFB2 hm08';body['license']='CC0-1.0';body['source_commit']=info['source_commit'];body['body_height_m']=height or info['height_m'];body['helpers_removed']=True
    rig['source']='MPFB2 rig.mixamo.json and weights.mixamo.json';rig['license']='CC0-1.0';rig['rig_kind']='MPFB Mixamo 52, fitted to morphed body';rig['forward']='-Y';rig['up']='+Z'
    return body,rig,info

def main():
    ap=argparse.ArgumentParser();ap.add_argument('--out',default=str(ROOT/'prepared/Varendor_Human_Male'));ap.add_argument('--data',help='Optional path to athletic_male_hm08.json');args=ap.parse_args(sys.argv[sys.argv.index('--')+1:] if '--' in sys.argv else [])
    out=Path(args.out);out.parent.mkdir(parents=True,exist_ok=True)
    bpy.ops.wm.read_factory_settings(use_empty=True)
    body,rig,info=create_human(data=args.data)
    bpy.context.scene.unit_settings.system='METRIC';bpy.context.scene.unit_settings.scale_length=1
    bpy.context.view_layer.update()
    # Object hierarchy and identity deformation verification, restricted to this new asset.
    import math
    dg=bpy.context.evaluated_depsgraph_get();evaluated=body.evaluated_get(dg);em=evaluated.to_mesh()
    max_rest_error=max((a.co-b.co).length for a,b in zip(body.data.vertices,em.vertices));evaluated.to_mesh_clear()
    assert max_rest_error<1e-5, f'Body distorted in rest pose: {max_rest_error}'
    assert len(rig.data.bones)==52 and len(body.data.vertices)==13380
    print('NEW_BODY_VERIFIED',json.dumps({'bones':len(rig.data.bones),'vertices':len(body.data.vertices),'rest_error_m':max_rest_error}))
    bpy.ops.object.select_all(action='DESELECT');body.select_set(True);rig.select_set(True);bpy.context.view_layer.objects.active=rig
    bpy.ops.wm.save_as_mainfile(filepath=str(out.with_suffix('.blend')))
    bpy.ops.export_scene.fbx(filepath=str(out.with_suffix('.fbx')),use_selection=True,add_leaf_bones=False,bake_anim=False,axis_forward='-Z',axis_up='Y',apply_unit_scale=True,mesh_smooth_type='FACE')
    bpy.ops.export_scene.gltf(filepath=str(out.with_suffix('.glb')),export_format='GLB',use_selection=True,export_animations=False)

if __name__=='__main__':main()
