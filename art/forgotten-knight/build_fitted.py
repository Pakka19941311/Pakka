"""Fit the licensed Forgotten Knight armor to the approved MakeHuman body.

The source stays immutable. Rest-space anatomical segments guide the fit;
UVs and original PBR textures are retained. No gameplay code is involved.
"""
import argparse
import importlib.util
import json
import math
import sys
from collections import defaultdict
from pathlib import Path

import bpy
from mathutils import Matrix, Vector
from mathutils.bvhtree import BVHTree


def load_module(path, name):
    spec = importlib.util.spec_from_file_location(name, path)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


def bbox(coords):
    p = list(coords)
    return [[min(v[i] for v in p), max(v[i] for v in p)] for i in range(3)]


def mesh_components(mesh):
    parent = list(range(len(mesh.vertices)))
    def find(i):
        while parent[i] != i:
            parent[i] = parent[parent[i]]
            i = parent[i]
        return i
    for e in mesh.edges:
        a, b = [find(v) for v in e.vertices]
        parent[b] = a
    groups = defaultdict(list)
    for v in mesh.vertices:
        groups[find(v.index)].append(v.index)
    mapping = {}
    parts = list(groups.values())
    for ci, ids in enumerate(parts):
        for i in ids:
            mapping[i] = ci
    return parts, mapping


def segment_transform(a, b, c, d, width_scale=.74):
    """Map a source anatomical segment to the target, preserving its thickness."""
    a, b, c, d = map(Vector, (a, b, c, d))
    u, v = (b-a).normalized(), (d-c).normalized()
    along = (d-c).length / max((b-a).length, 1e-6)
    stretch = Matrix.Identity(3) * width_scale
    for i in range(3):
        for j in range(3):
            stretch[i][j] += (along-width_scale) * u[i] * u[j]
    linear = u.rotation_difference(v).to_matrix() @ stretch
    m = linear.to_4x4()
    m.translation = c - linear @ a
    return m


def setup_fit(source_rig, rig):
    sb = source_rig.data.bones
    tb = rig.data.bones
    sh = lambda name: source_rig.matrix_world @ sb[name].head_local
    th = lambda name: tb['mixamorig:'+name].head_local
    tt = lambda name: tb['mixamorig:'+name].tail_local
    transforms = {}
    names = {}
    def add(src, dst, a, b, c, d, width=.74):
        transforms[src] = segment_transform(a, b, c, d, width)
        names[src] = 'mixamorig:'+dst
    add('root.x', 'Hips', sh('root.x'), sh('spine_01.x'), th('Hips'), th('Spine1'), .77)
    add('spine_01.x', 'Spine2', sh('spine_01.x'), sh('neck.x'), th('Spine1'), th('Neck'), .79)
    add('neck.x', 'Neck', sh('neck.x'), sh('head.x'), th('Neck'), th('Head'), .79)
    # Helmet coverage is anatomical head size, not the artist's tiny control-bone length.
    head_matrix = Matrix.Scale(.78, 4)
    head_matrix.translation = th('Head') - sh('head.x')*.78 + Vector((0, -.022, .025))
    transforms['head.x'] = head_matrix
    names['head.x'] = 'mixamorig:Head'
    for suffix, side in [('l', 'Left'), ('r', 'Right')]:
        segs = [
            ('shoulder', 'Shoulder', 'shoulder', 'arm_stretch', .79),
            ('arm_stretch', 'Arm', 'arm_stretch', 'forearm_stretch', .76),
            ('forearm_stretch', 'ForeArm', 'forearm_stretch', 'hand', .75),
            ('thigh_stretch', 'UpLeg', 'thigh_stretch', 'leg_stretch', .76),
            ('leg_stretch', 'Leg', 'leg_stretch', 'foot', .78),
            ('foot', 'Foot', 'foot', 'toes_01', .78),
        ]
        for src, dst, a, b, width in segs:
            end = tt(side+dst)
            if dst == 'Foot':
                end = th(side+dst) + (end-th(side+dst))*1.18
            add(src+'.'+suffix, side+dst, sh(a+'.'+suffix), sh(b+'.'+suffix),
                th(side+dst), end, width)
        for src, canonical in [('arm_twist','arm_stretch'), ('forearm_twist','forearm_stretch'),
                               ('thigh_twist','thigh_stretch'), ('leg_twist','leg_stretch')]:
            transforms[src+'.'+suffix] = transforms[canonical+'.'+suffix]
            names[src+'.'+suffix] = names[canonical+'.'+suffix]
        src_hand = sb['hand.'+suffix]
        add('hand.'+suffix, side+'Hand', sh('hand.'+suffix), source_rig.matrix_world @ src_hand.tail_local,
            th(side+'Hand'), tt(side+'Hand'), .75)
        src_toe = sb['toes_01.'+suffix]
        add('toes_01.'+suffix, side+'ToeBase', sh('toes_01.'+suffix), source_rig.matrix_world @ src_toe.tail_local,
            th(side+'ToeBase'), tt(side+'ToeBase'), .78)
        # The source toe control extends far beyond the actual boot tip. Its
        # control length is not an anatomical sole dimension.
        transforms['toes_01.'+suffix] = transforms['foot.'+suffix]
        for finger in ['thumb', 'index', 'middle', 'ring', 'pinky']:
            for segment in [1,2,3]:
                sn = f'{finger}{segment}.{suffix}'
                tn = f'{side}Hand{finger.capitalize()}{segment}'
                if sn in sb and 'mixamorig:'+tn in tb:
                    add(sn, tn, sh(sn), source_rig.matrix_world @ sb[sn].tail_local, th(tn), tt(tn), .75)
            base = finger+'1_base.'+suffix
            if base in sb:
                transforms[base] = transforms['hand.'+suffix]
                names[base] = 'mixamorig:'+side+'Hand'
    return transforms, names


def add_cape_bones(source_rig, rig, transforms, names):
    bpy.ops.object.select_all(action='DESELECT')
    rig.select_set(True)
    bpy.context.view_layer.objects.active = rig
    bpy.ops.object.mode_set(mode='EDIT')
    previous = rig.data.edit_bones['mixamorig:Spine2']
    fit = transforms['spine_01.x']
    for i in range(4):
        source_name = f'c_tail_{i:02d}.x'
        source = source_rig.data.bones[source_name]
        bone = rig.data.edit_bones.new(f'cape_{i+1:02d}')
        bone.head = fit @ (source_rig.matrix_world @ source.head_local)
        bone.tail = fit @ (source_rig.matrix_world @ source.tail_local)
        bone.parent = previous
        bone.use_connect = i>0
        previous = bone
        transforms[source_name] = fit
        names[source_name] = bone.name
    bpy.ops.object.mode_set(mode='OBJECT')


def source_weights(obj, vertex):
    return {obj.vertex_groups[g.group].name: g.weight for g in vertex.groups if g.weight > .00001}


def classify(obj, parts, comp_index):
    labels = {}
    for ci, ids in enumerate(parts):
        b = bbox(obj.matrix_world @ obj.data.vertices[i].co for i in ids)
        if obj.name == 'main_body':
            if b[2][0] > 2.18 and max(abs(b[0][0]), abs(b[0][1])) < .21:
                kind = 'head_helmet'
            elif max(abs(b[0][0]), abs(b[0][1])) > .65 and b[2][1] < 2.06:
                kind = 'gloves_gauntlets'
            elif b[2][0] > 1.49 and b[2][1] < 1.615 and b[0][1]-b[0][0] > .30:
                kind = 'belt_main'
            else:
                kind = 'chest_body'
        elif obj.name == 'legs':
            kind = 'chest_trousers' if len(ids)>1000 else 'boots_greaves'
        elif obj.name == 'eye_plug':
            kind = 'head_eye_shade'
        elif obj.name.startswith('hand_top_armor'):
            kind = 'chest_pauldrons_'+('left' if 'left' in obj.name else 'right')
        elif obj.name == 'cloak':
            kind = 'chest_cape'
        elif obj.name == 'legs_cloak':
            kind = 'chest_tassets'
        else:
            kind = 'chest_'+obj.name
        labels[ci] = kind
    return {poly.index:labels[comp_index[poly.vertices[0]]] for poly in obj.data.polygons}


def create_piece(source, poly_ids, coordinates, weights, normal_matrices, kind, rig, collection):
    ids = sorted({i for pi in poly_ids for i in source.data.polygons[pi].vertices})
    remap = {v:i for i,v in enumerate(ids)}
    polys = [source.data.polygons[i] for i in poly_ids]
    data = bpy.data.meshes.new('FK_'+kind+'_Mesh')
    data.from_pydata([coordinates[i] for i in ids], [], [[remap[v] for v in p.vertices] for p in polys])
    data.update()
    obj = bpy.data.objects.new('FK_'+kind, data)
    collection.objects.link(obj)
    for mat in source.data.materials:
        data.materials.append(mat)
    for p, original in zip(data.polygons, polys):
        p.material_index = original.material_index
        p.use_smooth = original.use_smooth
    for layer in source.data.uv_layers:
        uv = data.uv_layers.new(name=layer.name)
        for p, original in zip(data.polygons, polys):
            for li, sli in zip(p.loop_indices, original.loop_indices):
                uv.data[li].uv = layer.data[sli].uv
    # Preserve the artist's hard edges and authored corner normals after splitting.
    # Smooth flags alone turn machined metal plates into visibly rounded surfaces.
    sharp = {tuple(sorted(e.vertices)) for e in source.data.edges if e.use_edge_sharp}
    for edge in data.edges:
        edge.use_edge_sharp = tuple(sorted(ids[i] for i in edge.vertices)) in sharp
    source_normal_matrix = source.matrix_world.to_3x3().inverted().transposed()
    normals = [None]*len(data.loops)
    for p, original in zip(data.polygons, polys):
        for li, sli in zip(p.loop_indices, original.loop_indices):
            old_vertex = source.data.loops[sli].vertex_index
            n = source_normal_matrix @ source.data.corner_normals[sli].vector
            normals[li] = (normal_matrices[old_vertex] @ n).normalized()
    data.normals_split_custom_set(normals)
    groups = {name:obj.vertex_groups.new(name=name) for name in rig.data.bones.keys()}
    for old, new in remap.items():
        row = dict(weights[old])
        if kind.startswith('head_'):
            row = {'mixamorig:Head':1.0}
        for name, weight in row.items():
            groups[name].add([new], weight, 'REPLACE')
    obj.parent = rig
    mod = obj.modifiers.new('CanonicalBodyRig', 'ARMATURE')
    mod.object = rig
    # Linear skinning matches the standard glTF playback path.
    mod.use_deform_preserve_volume = False
    obj['equipment_slot'] = kind.split('_')[0]
    obj['source_object'] = source.name
    obj['source_model'] = 'The Forgotten Knight / dark_igorek'
    obj['license'] = 'CC-BY-4.0'
    return obj


def fit_source(source, transforms, names, target_rig, body_bvh, labels):
    coords, weights, normal_matrices = [], [], []
    vertex_kind = {}
    for p in source.data.polygons:
        for vi in p.vertices:
            vertex_kind[vi] = labels[p.index]
    corrections = 0
    for v in source.data.vertices:
        p = source.matrix_world @ v.co
        original = source_weights(source, v)
        original = {n:w for n,w in original.items() if n in transforms}
        kind = vertex_kind.get(v.index, '')
        if kind.startswith('head_'):
            original = {'head.x':1}
        elif source.name=='legs' and p.z<.35:
            original = {'foot.'+('l' if p.x>0 else 'r'):1}
        if not original:
            original = {'head.x':1} if source.name=='eye_plug' else {'spine_01.x':1}
        total = sum(original.values())
        q = Vector((0,0,0))
        linear = Matrix(((0,0,0),(0,0,0),(0,0,0)))
        row = defaultdict(float)
        for n,w in original.items():
            q += (transforms[n] @ p) * (w/total)
            linear += transforms[n].to_3x3() * (w/total)
            row[names[n]] += w/total
        # Preserve a small physical margin where source cloth/plates entered the base skin.
        if source.name not in {'cloak','legs_cloak','eye_plug','legs'} and not kind.startswith(('head_','gloves_')):
            hit, normal, _, distance = body_bvh.find_nearest(q)
            if hit is not None and (q-hit).dot(normal)<.006 and distance<.055:
                q = hit + normal*.009
                corrections += 1
        ordered = sorted(row.items(), key=lambda p:p[1], reverse=True)[:4]
        s = sum(w for _,w in ordered)
        weights.append({n:w/s for n,w in ordered})
        coords.append(q)
        normal_matrices.append(linear.inverted_safe().transposed())
    return coords, weights, normal_matrices, corrections


def make_sword(source, rig, collection):
    # Blade length is kept practical for a one-handed MMO sword; socket can be tuned
    # against the authored attack without changing this geometry.
    grip = Vector((0, -.394, 1.70))
    scale = .66
    mesh = source.data.copy()
    for v in mesh.vertices:
        p = source.matrix_world @ v.co
        v.co = (p-grip)*scale
    obj = bpy.data.objects.new('FK_weapon_sword',mesh)
    collection.objects.link(obj)
    hand = rig.data.bones['mixamorig:RightHand']
    # Initial explicit palm socket; final source-motion socket is applied in assembly.
    obj.parent = rig
    obj.parent_type = 'BONE'
    obj.parent_bone = hand.name
    obj.matrix_world = hand.matrix_local @ Matrix.Translation((0,.055,0))
    obj['equipment_slot'] = 'weapon'
    obj['blade_axis'] = '-Z'
    obj['grip_origin'] = 'local origin'
    obj['license'] = 'CC-BY-4.0'
    return obj


def studio(scene):
    for obj in list(bpy.data.objects):
        if obj.type in {'CAMERA','LIGHT'}:
            bpy.data.objects.remove(obj,do_unlink=True)
    coll = bpy.data.collections.new('Review_Studio')
    scene.collection.children.link(coll)
    camera = bpy.data.objects.new('ReviewCamera',bpy.data.cameras.new('ReviewCamera'))
    coll.objects.link(camera)
    target = Vector((0,0,1.00))
    camera.location = Vector((3.1,-6,2.1))
    camera.rotation_euler = (target-camera.location).to_track_quat('-Z','Y').to_euler()
    camera.data.type='ORTHO'; camera.data.ortho_scale=2.35
    scene.camera=camera
    for name, pos, color, energy, size in [
        ('Key',(3,-4,5),(1,.91,.8),850,4),('Fill',(-3,-2,3),(.65,.8,1),650,3),('Rim',(1,3,4),(.9,.95,1),1100,3)]:
        light=bpy.data.lights.new(name,'AREA');light.energy=energy;light.color=color;light.shape='DISK';light.size=size
        obj=bpy.data.objects.new(name,light);coll.objects.link(obj);obj.location=pos
        obj.rotation_euler=(target-obj.location).to_track_quat('-Z','Y').to_euler()
    bpy.ops.mesh.primitive_plane_add(size=200, location=(0,0,-.015))
    floor=bpy.context.object;floor.name='Review_Floor'
    for c in list(floor.users_collection):c.objects.unlink(floor)
    coll.objects.link(floor)
    mat=bpy.data.materials.new('Review_Floor_Material');mat.use_nodes=True
    bs=mat.node_tree.nodes.get('Principled BSDF');bs.inputs['Base Color'].default_value=(.038,.048,.062,1);bs.inputs['Roughness'].default_value=.85
    floor.data.materials.append(mat)
    scene.world=bpy.data.worlds.new('Review_World');scene.world.use_nodes=True
    scene.world.node_tree.nodes['Background'].inputs['Color'].default_value=(.2,.23,.28,1)
    scene.world.node_tree.nodes['Background'].inputs['Strength'].default_value=.6
    scene.render.engine='CYCLES';scene.cycles.device='CPU';scene.cycles.samples=24;scene.cycles.use_denoising=True
    scene.render.resolution_x=900;scene.render.resolution_y=1100;scene.render.resolution_percentage=100
    scene.view_settings.view_transform='AgX'
    return coll


def main():
    ap=argparse.ArgumentParser()
    ap.add_argument('--source',required=True);ap.add_argument('--body-builder',required=True);ap.add_argument('--output',required=True)
    ap.add_argument('--render',action='store_true')
    args=ap.parse_args(sys.argv[sys.argv.index('--')+1:])
    out=Path(args.output);out.mkdir(parents=True,exist_ok=True)
    bpy.ops.wm.open_mainfile(filepath=str(Path(args.source).resolve()),use_scripts=False)
    originals=list(bpy.data.objects)
    source_rig=next(o for o in originals if o.type=='ARMATURE')
    source_rig.data.pose_position='REST'
    for p in source_rig.pose.bones:p.matrix_basis=Matrix.Identity(4)
    asset=bpy.data.collections.new('Forgotten_Knight_Fitted')
    bpy.context.scene.collection.children.link(asset)
    builder=load_module(args.body_builder,'approved_human_builder')
    body,rig,info=builder.create_human(collection=asset,height=1.84)
    rig.name='FK_Humanoid_Rig'
    body.name='FK_Base_Body'
    body.modifiers[0].use_deform_preserve_volume=False
    transforms,names=setup_fit(source_rig,rig)
    add_cape_bones(source_rig,rig,transforms,names)
    bvh=BVHTree.FromPolygons([v.co for v in body.data.vertices],[list(p.vertices) for p in body.data.polygons],all_triangles=False)
    pieces=[];report={'body_height_m':1.84,'source':'The Forgotten Knight / dark_igorek','body':'MakeHuman / MPFB2',
                      'fit_method':'weighted anatomical rest-segment mapping, skin clearance, original UV/PBR retained','meshes':[]}
    for source in originals:
        if source.type!='MESH' or source.name in {'sword','roses'}:continue
        parts,ci=mesh_components(source.data)
        labels=classify(source,parts,ci)
        coordinates,weights,normal_matrices,corrections=fit_source(source,transforms,names,rig,bvh,labels)
        bykind=defaultdict(list)
        for pi,kind in labels.items():bykind[kind].append(pi)
        for kind,poly_ids in bykind.items():
            obj=create_piece(source,poly_ids,coordinates,weights,normal_matrices,kind,rig,asset);pieces.append(obj)
            report['meshes'].append({'name':obj.name,'slot':obj['equipment_slot'],'vertices':len(obj.data.vertices),
                                    'triangles':sum(len(p.vertices)-2 for p in obj.data.polygons),'source':source.name})
        print('FITTED',source.name,'clearance_adjustments',corrections,flush=True)
    sword=make_sword(next(o for o in originals if o.name=='sword'),rig,asset)
    pieces.append(sword)
    report['meshes'].append({'name':sword.name,'slot':'weapon','vertices':len(sword.data.vertices),
                            'triangles':sum(len(p.vertices)-2 for p in sword.data.polygons),'source':'sword'})
    # The complete body remains available for equipment editing; hiding covered skin
    # is intentional and does not remove anatomy from the editable source.
    body.hide_render=True
    body.hide_set(True)
    body['visibility_note']='Full anatomy retained. Enable when fitting/removing equipped armor.'
    for obj in originals:bpy.data.objects.remove(obj,do_unlink=True)
    for coll in list(bpy.data.collections):
        if coll!=asset and not coll.objects and not coll.children:bpy.data.collections.remove(coll)
    scene=bpy.context.scene
    scene.unit_settings.system='METRIC';scene.unit_settings.scale_length=1
    scene.render.fps=30
    studio(scene)
    rig['source_model']='The Forgotten Knight + MakeHuman hm08'
    rig['body_height_m']=1.84
    rig['gameplay_translation']='in-place; gameplay controller owns movement'
    report['bones']=len(rig.data.bones)
    report['slots']=sorted(set(o['equipment_slot'] for o in pieces))
    (out/'fit_manifest.json').write_text(json.dumps(report,ensure_ascii=False,indent=2))
    bpy.ops.wm.save_as_mainfile(filepath=str(out/'Forgotten_Knight_Fitted_Base.blend'))
    if args.render:
        sword.hide_render=True
        scene.render.filepath=str(out/'Fitted_Rest_Armor.png');bpy.ops.render.render(write_still=True)
    print('FIT_READY',str(out/'Forgotten_Knight_Fitted_Base.blend'),flush=True)


if __name__=='__main__':main()
