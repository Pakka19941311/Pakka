"""Replace broken reduced leaf scans with curved, UV-fitted leaf geometry.
Existing CC0 texture pixels and all saved tree placements stay unchanged.
"""
from pathlib import Path
import bpy,json,math,random,hashlib
from mathutils import Vector,Euler
ROOT=Path(__file__).resolve().parents[2];OUT=ROOT/'godot-pc/world-final/nature';TARGET=ROOT/'art/world-final/Varendor_Nature_D-08B.blend'
if TARGET.exists():raise RuntimeError('Preserve native revisions')
bpy.ops.wm.open_mainfile(filepath=str(ROOT/'art/world-final/Varendor_Nature_D-08A.blend'))
data=json.loads((OUT/'families-D08A.json').read_text());root=bpy.data.collections['D08A_Authored_Nature_Families'];root.hide_viewport=False;root.hide_render=False
for variant in range(2):
    key=f'alder_understorey_{variant}';coll=bpy.data.collections['Prototype_'+key]
    old=[o for o in coll.objects if '_leaf_spray_' in o.name];material=old[0].data.materials[0]
    for obj in old:bpy.data.objects.remove(obj,do_unlink=True)
    rng=random.Random(813200+variant);leaves=[]
    for branch in [o for o in coll.objects if '_branch_' in o.name]:
        tip=sum((v.co for v in list(branch.data.vertices)[-6:]),Vector())/6
        for i in range(42):
            angle=rng.uniform(0,math.tau);radius=rng.uniform(.08,.62)
            center=tip+Vector((math.cos(angle)*radius,math.sin(angle)*radius,rng.uniform(-.12,.38)))
            rotation=Euler((rng.uniform(-.85,.85),rng.uniform(-.8,.8),rng.uniform(-math.pi,math.pi))).to_matrix()
            leaves.append((center,rotation,rng.uniform(.19,.30)))
    def leaf_mesh(segments,name):
        vertices=[];uvs=[];faces=[]
        for center,rotation,length in leaves:
            start=len(vertices)
            for j in range(segments+1):
                t=j/segments;width=max(.015,math.sin(math.pi*t))
                # UV strip lies inside the actual top-left leaf island, away
                # from opaque atlas padding. The photograph is not altered.
                pixel=Vector((139+(207-139)*t,322+(90-322)*t))
                lateral=Vector((.959,.281))*22*width
                for side in [-1,0,1]:
                    local=Vector((side*length*.17*width,length*t,length*.065*math.sin(math.pi*t)*(1-abs(side))))
                    vertices.append(center+rotation@local);uv=pixel+lateral*side;uvs.append((uv.x/1024,1-uv.y/1024))
                if j:
                    for side in range(2):
                        a=start+(j-1)*3+side;b=a+1;c=start+j*3+side+1;d=c-1;faces.append((a,b,c,d))
        mesh=bpy.data.meshes.new(name);mesh.from_pydata(vertices,[],faces);mesh.materials.append(material);mesh.update();layer=mesh.uv_layers.new(name='UVMap')
        for loop in mesh.loops:layer.data[loop.index].uv=uvs[loop.vertex_index]
        assert not mesh.validate(clean_customdata=True)
        return mesh
    authored=bpy.data.objects.new(key+'_curved_photographic_leaves',leaf_mesh(6,key+'_leaf_source'));coll.objects.link(authored)
    parts=list(coll.objects)
    for lod,segments in enumerate([6,3,1]):
        export_leaf=authored.copy();export_leaf.data=authored.data if lod==0 else leaf_mesh(segments,key+'_leaves_lod'+str(lod));coll.objects.link(export_leaf)
        bpy.ops.object.select_all(action='DESELECT')
        for obj in parts:
            if obj!=authored:obj.select_set(True)
        export_leaf.select_set(True)
        target=OUT/f'assets/{key}_D08B_lod{lod}.glb'
        bpy.ops.export_scene.gltf(filepath=str(target),export_format='GLB',use_selection=True,export_yup=True,export_animations=False,export_cameras=False,export_lights=False)
        objects=[o for o in parts if o!=authored]+[export_leaf]
        points=[o.matrix_world@v.co for o in objects for v in o.data.vertices]
        low=[min(p[i] for p in points) for i in range(3)];high=[max(p[i] for p in points) for i in range(3)]
        d=data['catalog'][key]['lods'][lod]
        d.update(path=target.relative_to(OUT).as_posix(),source=target.relative_to(ROOT).as_posix(),sha256=hashlib.sha256(target.read_bytes()).hexdigest(),triangles=sum(len(p.vertices)-2 for o in objects for p in o.data.polygons),low=[low[0],low[2],-high[1]],high=[high[0],high[2],-low[1]],derived_native=TARGET.relative_to(ROOT).as_posix())
        bpy.data.objects.remove(export_leaf,do_unlink=True)
    data['catalog'][key]['leaf_count']=len(leaves)
root.hide_viewport=True;root.hide_render=True
bpy.ops.wm.save_as_mainfile(filepath=str(TARGET),compress=True)
data.update(revision='D08B',native_source=TARGET.relative_to(ROOT).as_posix(),native_sha256=hashlib.sha256(TARGET.read_bytes()).hexdigest(),visual_verified=False)
(OUT/'families-D08B.json').write_text(json.dumps(data,indent=2)+'\n',encoding='utf-8',newline='\n')
placements=json.loads((OUT/'placements-D08.json').read_text());placements['catalog'].update(data['catalog']);placements['families_source']=data['native_source']
(OUT/'placements-D08.json').write_text(json.dumps(placements,separators=(',',':'))+'\n',encoding='utf-8',newline='\n')
print('CURVED_LEAVES_SAVED '+json.dumps({k:v.get('leaf_count') for k,v in data['catalog'].items() if v.get('leaf_count')}),flush=True)
