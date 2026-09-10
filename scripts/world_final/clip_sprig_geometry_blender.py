"""Clip card mesh UV footprints to the actual sprig; keep the atlas unchanged."""
from pathlib import Path
import bpy,json,hashlib
from mathutils import Vector
ROOT=Path(__file__).resolve().parents[2];NATURE=ROOT/'godot-pc/world-final/nature'
TARGET=ROOT/'art/world-final/Varendor_Nature_D-03.blend'
if TARGET.exists():raise RuntimeError('Preserve native edits; choose a new version')
bpy.ops.wm.open_mainfile(filepath=str(ROOT/'art/world-final/Varendor_Nature_D-02.blend'))
data=json.loads((NATURE/'authored-D02.json').read_text());hull=json.loads((NATURE/'sprig-outline-D03.json').read_text())['uv_hull']
collection=bpy.data.collections['D02_Original_Wood_Prototypes'];report=[]
for obj in list(collection.objects):
    if obj.type!='MESH' or 'twig' not in obj.data.materials[0].name:continue
    mesh=obj.data;parents=list(range(len(mesh.vertices)));uvs={}
    def find(i):
        while parents[i]!=i:parents[i]=parents[parents[i]];i=parents[i]
        return i
    for polygon in mesh.polygons:
        first=polygon.vertices[0]
        for vertex in polygon.vertices[1:]:parents[find(vertex)]=find(first)
        for loop in polygon.loop_indices:uvs[mesh.loops[loop].vertex_index]=mesh.uv_layers.active.data[loop].uv.copy()
    groups={}
    for i in range(len(mesh.vertices)):groups.setdefault(find(i),[]).append(i)
    vertices=[];faces=[];texture_uvs=[]
    for group in groups.values():
        if len(group)!=4:raise RuntimeError('Unexpected source twig topology')
        minimum=Vector((min(uvs[i].x for i in group),min(uvs[i].y for i in group)))
        maximum=Vector((max(uvs[i].x for i in group),max(uvs[i].y for i in group)))
        def corner(x,y):return mesh.vertices[min(group,key=lambda i:(uvs[i]-Vector((x,y))).length_squared)].co
        a=corner(minimum.x,minimum.y);b=corner(maximum.x,minimum.y);c=corner(minimum.x,maximum.y)
        start=len(vertices)
        for u,v in hull:
            uv=Vector((u,1-v));position=a+(b-a)*((uv.x-minimum.x)/(maximum.x-minimum.x))+(c-a)*((uv.y-minimum.y)/(maximum.y-minimum.y))
            vertices.append(position);texture_uvs.append(uv)
        faces.append(tuple(range(start,start+len(hull))))
    refined=bpy.data.meshes.new(mesh.name+'_UV_Contour_D03');refined.from_pydata(vertices,[],faces);refined.update()
    refined.materials.append(mesh.materials[0]);uv_layer=refined.uv_layers.new(name='UVMap')
    for loop in refined.loops:uv_layer.data[loop.index].uv=texture_uvs[loop.vertex_index]
    # All linked visible instances must receive the same edited mesh.
    for linked in bpy.data.objects:
        if linked.type=='MESH' and linked.data==mesh:linked.data=refined
    report.append({'prototype':obj.name,'cards':len(groups),'old_triangles':sum(len(p.vertices)-2 for p in mesh.polygons),'new_triangles':sum(len(p.vertices)-2 for p in refined.polygons)})
collection.hide_viewport=False;collection.hide_render=False
for variant in range(3):
    key=f'pine_tree_01_{variant}'
    parts=[obj for obj in collection.objects if obj.type=='MESH' and obj.name.startswith('D02_'+key+'_')]
    for lod in range(2):
        copies=[]
        for source in parts:
            obj=source.copy();obj.data=source.data.copy();collection.objects.link(obj);copies.append(obj)
            if lod==1 and 'twig' not in obj.data.materials[0].name:
                bpy.context.view_layer.objects.active=obj;modifier=obj.modifiers.new('Distant wood','DECIMATE');modifier.ratio=.35;modifier.use_collapse_triangulate=True;bpy.ops.object.modifier_apply(modifier=modifier.name)
        bpy.ops.object.select_all(action='DESELECT')
        for obj in copies:obj.select_set(True)
        target=NATURE/f'assets/pine_D03_{variant}_lod{lod}.glb'
        bpy.ops.export_scene.gltf(filepath=str(target),export_format='GLB',use_selection=True,export_yup=True,export_animations=False,export_cameras=False,export_lights=False)
        entry=data['catalog'][key]['lods'][lod];entry.update(path=target.relative_to(NATURE).as_posix(),sha256=hashlib.sha256(target.read_bytes()).hexdigest(),geometry_revision='D03 original wood plus sprig silhouette geometry',derived_native=TARGET.relative_to(ROOT).as_posix(),triangles=sum(sum(len(p.vertices)-2 for p in o.data.polygons) for o in copies))
        for obj in copies:bpy.data.objects.remove(obj,do_unlink=True)
collection.hide_viewport=True;collection.hide_render=True
bpy.context.scene['status']='D03 forest sample: twig cards clipped to real alpha island; full world remains unfinished'
bpy.ops.wm.save_as_mainfile(filepath=str(TARGET),compress=True)
data.update(revision='D03',native_source=TARGET.relative_to(ROOT).as_posix(),native_sha256=hashlib.sha256(TARGET.read_bytes()).hexdigest())
(NATURE/'authored-D03.json').write_text(json.dumps(data,indent=2)+'\n',encoding='utf-8',newline='\n')
(NATURE/'collision-D03.json').write_bytes((NATURE/'collision-D02.json').read_bytes())
(ROOT/'docs/world-final/nature-D03.json').write_text(json.dumps({'native_source':data['native_source'],'sha256':data['native_sha256'],'geometry_changes':report,'texture_images_changed':False,'tree_count':920,'visual_verified':False},indent=2)+'\n',encoding='utf-8')
print('NATURE_D03 '+json.dumps(report),flush=True)
