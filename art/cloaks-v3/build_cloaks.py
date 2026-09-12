"""Original Varendor cloak geometry. Select --item=defense|captain|sky after --.
Run in Blender 4.2+: --background --factory-startup --python this_file.
No source character is changed or included in the editable cloak-only master.
"""
import bpy
import json
import math
import hashlib
import sys
from pathlib import Path
from mathutils import Vector
import numpy as np

ROOT = Path(__file__).resolve().parents[2]
ART = ROOT / 'art/cloaks-v3'
RUNTIME = ART / 'staging' if '--stage-only' in sys.argv else ROOT / 'godot-pc/assets/cloaks-v3'
EVIDENCE = ART / 'evidence'
KIND = next((a.split('=',1)[1] for a in sys.argv if a.startswith('--item=')), 'defense')
assert KIND in ['defense','captain','sky']
TITLE = KIND.title()
for folder in [ART, RUNTIME, EVIDENCE]: folder.mkdir(parents=True, exist_ok=True)
bpy.ops.wm.read_factory_settings(use_empty=True)


def material(name, color, roughness=.82, metallic=0):
    mat = bpy.data.materials.new(name)
    mat.diffuse_color = (*color, 1)
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes.get('Principled BSDF')
    bsdf.inputs['Base Color'].default_value = (*color, 1)
    bsdf.inputs['Roughness'].default_value = roughness
    bsdf.inputs['Metallic'].default_value = metallic
    return mat


def weave_texture():
    size = 1024
    y, x = np.mgrid[0:size, 0:size].astype(np.float32)
    rng = np.random.default_rng(20260912)
    grain = rng.normal(0, .007, (size, size))
    warp = np.sin(x * math.pi / 2) * .018 + np.sin(y * math.pi / 2) * .012
    twill = np.sin((x + np.where((y // 32) % 2 == 0, y, -y)) * math.pi / 8) * .015
    value = np.clip(.53 + grain + warp + twill, .38, .66)
    pixels = np.ones((size, size, 4), dtype=np.float32)
    tint={'defense':[.38,.45,.46],'captain':[.33,.085,.075],'sky':[.47,.59,.66]}[KIND]
    pixels[:, :, :3] = value[:, :, None] * np.array(tint)[None, None, :]
    image = bpy.data.images.new('Varendor_Original_'+TITLE+'_Weave', width=size, height=size)
    image.pixels.foreach_set(pixels.ravel())
    image.filepath_raw = str(RUNTIME / (KIND+'_weave.png'))
    image.file_format = 'PNG'
    image.save()
    image.pack()
    return image


CLOTH = material('V_Cloak_'+TITLE+'_Wool', (.20, .24, .25), .96)
LEATHER = material('V_Cloak_Leather_Edge', (.032, .018, .010), .86)
LINING = material('V_Cloak_Dark_Lining', {'defense':(.035,.045,.046),'captain':(.045,.014,.012),'sky':(.085,.12,.15)}[KIND], .96)
METAL = material('V_Cloak_Aged_Iron', (.21, .24, .25), .4, .72)
STITCH = material('V_Cloak_Waxed_Thread', (.30, .26, .18), .85)
GOLD = material('V_Cloak_Aged_Brass', (.32,.20,.065), .58, .45)
FEATHER = material('V_Cloak_Sky_Feather_Edge', (.61,.64,.62), .96)
tex = CLOTH.node_tree.nodes.new('ShaderNodeTexImage'); tex.image = weave_texture()
CLOTH.node_tree.links.new(tex.outputs['Color'], CLOTH.node_tree.nodes.get('Principled BSDF').inputs['Base Color'])
bump = CLOTH.node_tree.nodes.new('ShaderNodeBump'); bump.inputs['Strength'].default_value=.15; bump.inputs['Distance'].default_value=.008
CLOTH.node_tree.links.new(tex.outputs['Color'], bump.inputs['Height'])
CLOTH.node_tree.links.new(bump.outputs['Normal'], CLOTH.node_tree.nodes.get('Principled BSDF').inputs['Normal'])


def mesh_object(name, verts, faces, mat, uvs=None):
    mesh = bpy.data.meshes.new(name + '_Mesh'); mesh.from_pydata(verts, [], faces); mesh.materials.append(mat); mesh.update()
    obj = bpy.data.objects.new(name, mesh); bpy.context.collection.objects.link(obj)
    if uvs:
        layer=mesh.uv_layers.new(name='UVMap')
        for polygon in mesh.polygons:
            for loop in polygon.loop_indices: layer.data[loop].uv=uvs[mesh.loops[loop].vertex_index]
    for polygon in mesh.polygons: polygon.use_smooth=True
    return obj


def cape_point(s, t):
    width=(.30+.16*t) if KIND=='captain' else (.285+.145*math.sin(t*math.pi/2))
    x=s*width
    y=.012+.075*math.sin(t*math.pi)+.050*t-.10*abs(s)**2*(1-t)**3
    # Unequal folds descend from two tension points. Broad drape hugs the back;
    # the irregular smaller creases are geometry rather than a flat normal map.
    fold=math.sin(s*math.pi*3.6+.44+.7*t)+.36*math.sin(s*math.pi*7.3-.5*t)
    y+=(.010+.030*math.sin(t*math.pi*.82))*fold*(.5+.5*(1-abs(s)))
    z=-(1.23 if KIND=='captain' else .91)*t+(.105*abs(s)**1.6-.04)*(1-t)-.045*(1-s*s)*t+.012*s*t
    return (x,y,z)


def cloth_surface():
    columns, rows=40, 24
    vertices=[]; uv=[]; faces=[]
    for row in range(rows+1):
        for col in range(columns+1):
            s=col/columns*2-1;t=row/rows
            vertices.append(cape_point(s,t));uv.append((col/columns,row/rows))
    for row in range(rows):
        for col in range(columns):
            a=row*(columns+1)+col;faces.append((a,a+1,a+columns+2,a+columns+1))
    obj=mesh_object(TITLE+'_Wool_Body',vertices,faces,CLOTH,uv)
    obj.data.materials.append(LINING)
    solid=obj.modifiers.new('Dense cloth thickness 4mm','SOLIDIFY');solid.thickness=.004;solid.offset=0;solid.material_offset=1
    return obj


def ribbon(name, points, width, mat, offset=.004):
    verts=[]; faces=[]
    for i,p in enumerate(points):
        a=Vector(points[max(0,i-1)]);b=Vector(points[min(len(points)-1,i+1)])
        tangent=(b-a).normalized();normal=Vector((0,1,0));across=tangent.cross(normal).normalized()*width/2
        center=Vector(p)+normal*offset;verts.extend([center-across,center+across])
        if i: faces.append((2*i-2,2*i-1,2*i+1,2*i))
    obj=mesh_object(name,verts,faces,mat)
    solid=obj.modifiers.new('Leather thickness','SOLIDIFY');solid.thickness=.002
    return obj


def cylinder(name, location, radius, depth, mat, rotation=(math.pi/2,0,0), vertices=16):
    bpy.ops.mesh.primitive_cylinder_add(vertices=vertices,radius=radius,depth=depth,location=location,rotation=rotation)
    obj=bpy.context.object;obj.name=name;obj.data.materials.append(mat)
    bevel=obj.modifiers.new('Rounded edge','BEVEL');bevel.width=.002;bevel.segments=2
    return obj


def make_defense():
    objects=[cloth_surface()]
    border=[cape_point(-1,i/24) for i in range(25)]+[cape_point(-1+2*i/40,1) for i in range(1,41)]+[cape_point(1,1-i/24) for i in range(1,25)]
    objects.append(ribbon('Defense_Leather_Hem',border,.014,LEATHER))
    # A thin bound neckline follows the sag between two shoulder fastenings.
    top=[cape_point(-1+2*i/40,0) for i in range(41)]
    objects.append(ribbon('Defense_Bound_Neckline',top,.012,LEATHER,.002))
    # Original shoulder straps and front fastening are separate pieces, not a painted trim.
    for sign in [-1,1]:
        strap=[]
        for i in range(17):
            t=i/16
            strap.append((sign*(.285*(1-t)+.028*t),-.088-.26*t,.065-.055*math.sin(t*math.pi)))
        objects.append(ribbon('Defense_Shoulder_Strap_'+str(sign),strap,.026,LEATHER))
    objects.append(cylinder('Defense_Iron_Clasp',(0,-.350,.060),.027,.010,METAL))
    objects.append(cylinder('Defense_Clasp_Pin',(0,-.358,.060),.007,.004,STITCH,vertices=12))
    # Repeated stitch marks follow the hem, with explicit geometry retained in the master.
    for i in range(3,38,2):
        s=-1+2*i/40;p=cape_point(s,.976)
        objects.append(ribbon('Defense_Hem_Stitch_%02d'%i,[(p[0]-.004,p[1],p[2]),(p[0]+.004,p[1],p[2]+.015)],.003,STITCH,.009))
    return rigify(objects)


def rigify(objects):
    arm=bpy.data.armatures.new('V_Cloak_'+TITLE+'_Rig');rig=bpy.data.objects.new('CloakRig',arm);bpy.context.collection.objects.link(rig)
    bpy.context.view_layer.objects.active=rig;rig.select_set(True);bpy.ops.object.mode_set(mode='EDIT')
    root=arm.edit_bones.new('cloak_root');root.head=(0,0,.03);root.tail=(0,0,-.20)
    for i in range(1,4):
        bone=arm.edit_bones.new('cloak_%02d'%i);bone.head=(0,.055*i,-.23*i);bone.tail=(0,.055*(i+1),-.23*(i+1));bone.parent=root if i==1 else arm.edit_bones['cloak_%02d'%(i-1)]
    bpy.ops.object.mode_set(mode='OBJECT')
    for obj in objects:
        groups=[obj.vertex_groups.new(name=name) for name in ['cloak_root','cloak_01','cloak_02','cloak_03']]
        for v in obj.data.vertices:
            world=obj.matrix_world@v.co;t=max(0,min(3,(-world.z-.12)/.25));first=int(math.floor(t));last=min(3,first+1);weight=t-first
            groups[first].add([v.index],1-weight,'REPLACE')
            if last!=first and weight: groups[last].add([v.index],weight,'REPLACE')
        mod=obj.modifiers.new('Independent cloth bones','ARMATURE');mod.object=rig;obj.parent=rig
    rig['item_id']='cloak_'+KIND;rig['unit']='metres';rig['attachment']='upper back; +Z forward in glTF; own lower bone chain independent of legs'
    return rig,objects


def make_captain():
    objects=[cloth_surface()]
    border=[cape_point(-1,i/24) for i in range(25)]+[cape_point(-1+2*i/40,1) for i in range(1,41)]+[cape_point(1,1-i/24) for i in range(1,25)]
    objects.append(ribbon('Captain_Leather_Binding',border,.016,LEATHER))
    objects.append(ribbon('Captain_Gold_Hem_Thread',[cape_point(-.97+1.94*i/40,.976) for i in range(41)],.007,STITCH,.009))
    # Two independent front brooches carry the longer cloak; no horizontal bar.
    for sign in [-1,1]:
        points=[(sign*(.30-.065*i/16),-.09-.27*i/16,.065-.14*i/16-.035*math.sin(math.pi*i/16)) for i in range(17)]
        objects.append(ribbon('Captain_Shoulder_Facing_'+str(sign),points,.046,LEATHER))
        objects.append(cylinder('Captain_Double_Brooch_'+str(sign),(sign*.235,-.365,-.076),.031,.010,GOLD))
        objects.append(cylinder('Captain_Brooch_Inset_'+str(sign),(sign*.235,-.373,-.076),.016,.003,LEATHER))
    # A small original shield of three towers, fitted along the cloth folds.
    coords=[];faces=[]
    for row in range(19):
        v=row/18;t=.30+.22*v;width=.27 if v<.55 else max(.002,.27*(1-(v-.55)/.45))
        for col in range(21):
            x,y,z=cape_point((-1+col/10)*width,t);coords.append((x,y+.008,z))
    for row in range(18):
        for col in range(20):
            a=row*21+col;faces.append((a,a+1,a+22,a+21))
    objects.append(mesh_object('Captain_Heraldic_Shield',coords,faces,LEATHER))
    # Embroidery follows samples on the underlying surface instead of floating flat.
    for center,height in [(-.13,.10),(0,.15),(.13,.10)]:
        top=.455-height;bottom=.455;w=.047
        silhouette=[(center-w,bottom),(center-w,top),(center-.018,top),(center-.018,top+.014),(center+.018,top+.014),(center+.018,top),(center+w,top),(center+w,bottom)]
        verts=[]
        for s,t in silhouette:
            x,y,z=cape_point(s,t);verts.append((x,y+.015,z))
        objects.append(mesh_object('Captain_Embroidered_Tower_'+str(center),verts,[tuple(range(len(verts)))],STITCH))
        gate=[(center-.012,bottom-.003),(center-.012,bottom-.033),(center,bottom-.041),(center+.012,bottom-.033),(center+.012,bottom-.003)]
        verts=[]
        for s,t in gate:
            x,y,z=cape_point(s,t);verts.append((x,y+.017,z))
        objects.append(mesh_object('Captain_Tower_Arch_'+str(center),verts,[tuple(range(len(verts)))],LEATHER))
    return rigify(objects)


def sky_point(s,t,sign):
    center=.185+.075*t;half=.105+.07*math.sin(t*math.pi/2)
    x=sign*(center+s*half)
    y=.01+.07*math.sin(t*math.pi)+.065*t-.065*(1-t)**3
    y+=.026*math.sin((s+1)*math.pi*2.2+.35+t)*math.sin(t*math.pi*.9)
    z=-1.095*t+.075*s*(1-t)-.022*math.sin(s*math.pi*3)*t**8
    return (x,y,z)


def make_sky():
    objects=[]
    for sign in [-1,1]:
        vertices=[];uv=[];faces=[];cols=24;rows=28
        for row in range(rows+1):
            for col in range(cols+1):
                vertices.append(sky_point(-1+2*col/cols,row/rows,sign));uv.append((col/cols,row/rows))
        for row in range(rows):
            for col in range(cols):
                a=row*(cols+1)+col;face=(a,a+1,a+cols+2,a+cols+1)
                faces.append(face if sign==1 else tuple(reversed(face)))
        obj=mesh_object('Sky_Separate_Panel_'+str(sign),vertices,faces,CLOTH,uv);obj.data.materials.append(LINING)
        solid=obj.modifiers.new('Light lined cloth','SOLIDIFY');solid.thickness=.0025;solid.material_offset=1
        objects.append(obj)
        objects.append(ribbon('Sky_Inner_Binding_'+str(sign),[sky_point(-1,i/28,sign) for i in range(29)],.009,LEATHER))
        # Sewn feather-shaped tabs form the garment edge; they are not wings.
        for i in range(10):
            t=.24+i*.065;base=Vector(sky_point(1,t,sign))
            verts=[];faces=[]
            for row in range(7):
                v=row/6;cx=.006+.064*v;cz=.035-(.145+.007*(i%3))*v;width=.024*math.sin(math.pi*v)**.72
                for edge in [-1,0,1]:
                    verts.append(base+Vector((sign*(cx+edge*width),.012+.007*math.sin(math.pi*v)+(.004 if edge==0 else 0),cz+edge*width*.28)))
            for row in range(6):
                for side in range(2):
                    a=row*3+side;face=(a,a+1,a+4,a+3)
                    faces.append(face if sign==1 else tuple(reversed(face)))
            feather=mesh_object('Sky_Feather_%s_%02d'%(sign,i),verts,faces,FEATHER)
            solid=feather.modifiers.new('Feather thickness','SOLIDIFY');solid.thickness=.002
            objects.append(feather)
            objects.append(ribbon('Sky_Feather_Quill_%s_%02d'%(sign,i),[base+Vector((sign*.007,.017,.032)),base+Vector((sign*.067,.026,-.073))],.003,STITCH,0))
        strap=[(sign*(.25-.095*i/16),-.05-.31*i/16,.07-.11*i/16-.04*math.sin(i/16*math.pi)) for i in range(17)]
        objects.append(ribbon('Sky_Shoulder_Strap_'+str(sign),strap,.025,LEATHER))
        objects.append(cylinder('Sky_Silver_Brooch_'+str(sign),(sign*.155,-.365,-.04),.025,.009,METAL))
    return rigify(objects)


rig,objects={'defense':make_defense,'captain':make_captain,'sky':make_sky}[KIND]()
for obj in bpy.context.scene.objects:obj.select_set(False)
rig.select_set(True)
for obj in objects:obj.select_set(True)
bpy.context.view_layer.objects.active=rig
master=ART/('Varendor_Cloak_'+TITLE+'_Master.blend')
bpy.ops.wm.save_as_mainfile(filepath=str(master))
# Keep the master pieces editable, but join the delivered accessory into one
# skinned MeshInstance with material surfaces, rather than 25 tiny draw objects.
for obj in objects:
    bpy.context.view_layer.objects.active=obj
    for mod in list(obj.modifiers):
        if mod.type!='ARMATURE': bpy.ops.object.modifier_apply(modifier=mod.name)
for obj in bpy.context.scene.objects:obj.select_set(False)
for obj in objects:obj.select_set(True)
bpy.context.view_layer.objects.active=objects[0];bpy.ops.object.join()
joined=bpy.context.object;joined.name=TITLE+'_Cloak_Surface'
rig.select_set(True)
output=RUNTIME/('cloak_'+KIND+'.glb')
bpy.ops.export_scene.gltf(filepath=str(output),export_format='GLB',use_selection=True,export_apply=True,export_animations=False,export_extras=True)
joined.data.calc_loop_triangles()
report={'scope':'original geometry; host fit/animation acceptance pending','author':'Varendor project / Codex-assisted original geometry',
 'asset':str(output.relative_to(ROOT)),'sha256':hashlib.sha256(output.read_bytes()).hexdigest(),'bytes':output.stat().st_size,
 'master':str(master.relative_to(ROOT)),'pieces':len(objects),'bones':len(rig.data.bones),'triangles':len(joined.data.loop_triangles),
 'runtime_meshes':1,'materials':len(joined.data.materials),'original_sources':['build_cloaks.py','procedural weave seed20260912']}
(ART/('manifest-'+KIND+'.json')).write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
if '--no-preview' in sys.argv:
    print('VARENDOR_CLOAK_EXPORT '+json.dumps(report,ensure_ascii=False))
    raise SystemExit(0)

# Preview on the actual current knight, without saving it into the cloak master.
for obj in bpy.context.scene.objects:obj.select_set(False)
bpy.ops.import_scene.gltf(filepath=str(ROOT/'godot-pc/assets/knight/Knight_Modular.glb'))
host=list(bpy.context.selected_objects)
hidden=['FK_body_torso','FK_body_upperarms','FK_body_hands','FK_body_forearms','FK_body_calves','FK_body_feet','FK_human_hair','FK_human_eyes','FK_human_brows','FK_body_head','FK_starter_pants','FK_head_open_helmet','FK_chest_cape','FK_chest_cloak_conector_left','FK_chest_cloak_conector_right','FK_chest_top_belt_cloak']
for obj in host:
    if obj.type=='MESH' and any(obj.name==name or obj.name.startswith(name+'.') for name in hidden):obj.hide_render=True
roots=[obj for obj in host if obj.parent not in host]
for obj in roots:obj.scale*=2.05/1.84
rig.location=(0,.16,1.665)
# Camera behind and slightly left: enough view of silhouette, leather edge and shoulder hardware.
bpy.ops.object.camera_add(location=(-3.25,4.6,2.55));camera=bpy.context.object
camera.rotation_euler=(Vector((0,0,1.08))-camera.location).to_track_quat('-Z','Y').to_euler();camera.data.type='ORTHO';camera.data.ortho_scale=2.65;bpy.context.scene.camera=camera
for name,location,power,size,color in [('Key',(-3,2.2,5),700,3,(.84,.91,1)),('Fill',(3,1,3),450,3,(1,.88,.70)),('Rim',(0,-3,4),850,2,(.86,.92,1))]:
    bpy.ops.object.light_add(type='AREA',location=location);lamp=bpy.context.object;lamp.name=name;lamp.data.energy=power;lamp.data.shape='DISK';lamp.data.size=size;lamp.data.color=color;lamp.rotation_euler=(Vector((0,0,1))-lamp.location).to_track_quat('-Z','Y').to_euler()
floor=material('Preview_Floor',(.09,.10,.11),.8)
bpy.ops.mesh.primitive_plane_add(size=200,location=(0,0,-.005));bpy.context.object.data.materials.append(floor)
scene=bpy.context.scene;scene.render.engine='CYCLES';scene.cycles.device='CPU';scene.cycles.samples=32;scene.cycles.use_denoising=True
scene.render.threads_mode='FIXED';scene.render.threads=2
if scene.world is None: scene.world=bpy.data.worlds.new('Cloak Preview World')
scene.world.color=(.14,.14,.14);scene.render.resolution_x=1000;scene.render.resolution_y=1000;scene.render.resolution_percentage=100
scene.view_settings.view_transform='AgX';scene.render.image_settings.file_format='PNG';scene.render.filepath=str(EVIDENCE/(KIND+'-knight-drape-candidate.png'))
bpy.ops.render.render(write_still=True)
print('VARENDOR_CLOAK_FIRST_CANDIDATE '+json.dumps(report,ensure_ascii=False))
