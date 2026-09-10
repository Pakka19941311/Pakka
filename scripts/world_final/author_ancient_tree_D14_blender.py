"""Author the unique hollow tree at the approved L03 anchor as editable meshes.

The old landmark/native versions stay intact. This separate layer is reviewed
before replacing that landmark in the world. No new forest clearing is made.
"""
from pathlib import Path
import bpy,bmesh,json,math,hashlib
from mathutils import Vector
import numpy as np
ROOT=Path(__file__).resolve().parents[2];OUT=ROOT/'godot-pc/world-final/nature'
TARGET=ROOT/'art/world-final/Varendor_Ancient_Tree_D-14.blend'
if TARGET.exists():raise RuntimeError('Preserve authored native tree')
layout=json.loads((ROOT/'godot-pc/world-final/world_layout.json').read_text())
anchor=next(o for o in layout['objects'] if o['id']=='ANCIENT_TREE');x0,y0,z0=anchor['position']
bpy.ops.wm.read_factory_settings(use_empty=True)
collection=bpy.data.collections.new('D14_Unique_Hollow_Ancient_Tree');bpy.context.scene.collection.children.link(collection)
root=bpy.data.objects.new('ANCIENT_TREE_D14',None);collection.objects.link(root);root.location=(x0,-z0,y0)
root['replaces_landmark']='ANCIENT_TREE';root['approved_anchor_xyz']=json.dumps(anchor['position']);root['stage']='D14 native art candidate; review pending'
mat=bpy.data.materials.new('D14_Aged_Bark');mat.use_nodes=True
nodes,links=mat.node_tree.nodes,mat.node_tree.links;bsdf=nodes.get('Principled BSDF');bsdf.inputs['Roughness'].default_value=.94
paths={}
for key,suffix in [('diff','diff'),('normal','nor_gl')]:
    path=ROOT/f'public/assets/world/pine_tree_01/pine_tree_01_bark_{suffix}_1k.jpg';image=bpy.data.images.load(str(path));image.pack()
    if key=='normal':image.colorspace_settings.name='Non-Color'
    tex=nodes.new('ShaderNodeTexImage');tex.image=image
    if key=='diff':links.new(tex.outputs['Color'],bsdf.inputs['Base Color'])
    else:
        normal=nodes.new('ShaderNodeNormalMap');normal.inputs['Strength'].default_value=.65
        links.new(tex.outputs['Color'],normal.inputs['Color']);links.new(normal.outputs['Normal'],bsdf.inputs['Normal'])
    paths[key]=dict(path=path.relative_to(ROOT).as_posix(),sha256=hashlib.sha256(path.read_bytes()).hexdigest())
interior=mat.copy();interior.name='D14_Hollow_Weathered_Wood'
objects=[];collision=[]
def create_mesh(name,vertices,faces,uvs,material=mat):
    mesh=bpy.data.meshes.new(name);mesh.from_pydata(vertices,[],faces);mesh.materials.append(material);mesh.update()
    layer=mesh.uv_layers.new(name='Bark_Metres')
    for poly in mesh.polygons:
        poly.use_smooth=True
        for li in poly.loop_indices:layer.data[li].uv=uvs[mesh.loops[li].vertex_index]
    # Consistent outer and inner shell normals; no decimate modifier.
    bm=bmesh.new();bm.from_mesh(mesh);bmesh.ops.recalc_face_normals(bm,faces=bm.faces);bm.to_mesh(mesh);bm.free()
    obj=bpy.data.objects.new(name,mesh);collection.objects.link(obj);obj.parent=root;objects.append(obj);return obj
def catmull(control,steps=5):
    points=[Vector(p[:3]) for p in control];radii=[p[3] for p in control];result=[]
    for i in range(len(points)-1):
        a=points[max(0,i-1)];b=points[i];c=points[i+1];d=points[min(len(points)-1,i+2)]
        for j in range(steps):
            t=j/steps
            p=.5*((2*b)+(-a+c)*t+(2*a-5*b+4*c-d)*t*t+(-a+3*b-3*c+d)*t*t*t)
            result.append((p,radii[i]*(1-t)+radii[i+1]*t))
    result.append((points[-1],radii[-1]));return result
def tube(name,control,sides=12,steps=5,flatten=1.0,collide=False):
    points=catmull(control,steps);vertices=[];uvs=[];faces=[];length=0.0
    for i,(center,radius) in enumerate(points):
        if i:length+=(center-points[i-1][0]).length
        tangent=(points[min(i+1,len(points)-1)][0]-points[max(0,i-1)][0]).normalized()
        axis=tangent.cross(Vector((0,0,1)))
        if axis.length<.05:axis=tangent.cross(Vector((0,1,0)))
        axis.normalize();cross=tangent.cross(axis).normalized()
        for j in range(sides+1):
            angle=j/sides*math.tau
            rib=1+.065*math.sin(angle*5+length*.14)+.035*math.cos(angle*9-length*.19)
            offset=(axis*math.cos(angle)+cross*math.sin(angle))*radius*rib;offset.z*=flatten
            vertices.append(tuple(center+offset));uvs.append((j/sides*math.tau*max(radius,.3)/2.6,length/2.6))
    for i in range(len(points)-1):
        for j in range(sides):
            a=i*(sides+1)+j;b=a+sides+1;faces.append((a,a+1,b+1,b))
    faces.append(tuple(reversed(tuple(range(sides)))))
    faces.append(tuple((len(points)-1)*(sides+1)+j for j in range(sides)))
    obj=create_mesh(name,vertices,faces,uvs);obj['authored_controls']=json.dumps(control)
    if collide:
        for i in range(0,len(points)-1,max(1,steps//2)):
            center,radius=points[i]
            if center.z-radius*flatten>2.5 or radius<.32:continue
            collision.append(dict(id=f'{name}_support_{i}',kind='circle',x=x0+center.x,z=-z0+center.y,radius=max(.3,radius*.90),bottom=y0+center.z-radius*flatten,top=y0+center.z+radius*flatten,blocksMovement=True,source_mesh=name,landmark='ANCIENT_TREE'))
    return obj
# Hollow shell with a real front opening, thick jambs and an irregular crown.
levels=[(-.65,6.3),(0,6.4),(1.5,6.15),(3.2,5.85),(5.3,5.5),(7.4,5.13),(9.5,4.85),(12,4.55),(15.3,4.12),(19,3.68),(23,3.0),(27.5,2.18)]
sides=80;vertices=[];uvs=[];faces=[]
for inner in [False,True]:
    for i,(h,radius) in enumerate(levels):
        cx=.14*h+math.sin(h*.16)*.6;cy=.06*h+math.sin(h*.2+.5)*.5
        for j in range(sides+1):
            angle=j/sides*math.tau
            radial=radius*(1+.095*math.sin(angle*7+h*.10)+.055*math.sin(angle*3-h*.11))-(.75 if inner else 0)
            top_jag=(.9*math.sin(angle*7)+.5*math.cos(angle*11)) if i==len(levels)-1 else 0
            vertices.append((cx+radial*math.cos(angle),cy+radial*math.sin(angle),h+top_jag));uvs.append((j/sides*math.tau*5/2.6,h/2.6))
layer=(sides+1)*len(levels)
def opening(i,j):
    h=(levels[i][0]+levels[i+1][0])*.5;angle=(j+.5)/sides*math.tau
    distance=abs(math.atan2(math.sin(angle+math.pi*.5),math.cos(angle+math.pi*.5)))
    half=.61*max(0,1-(max(h-4,0)/6.8)**2)**.5 if h<10.8 else 0
    return distance<half and h>=-.4
for i in range(len(levels)-1):
    for j in range(sides):
        a=i*(sides+1)+j;b=a+sides+1
        if opening(i,j):continue
        faces.extend([(a,a+1,b+1,b),(a+layer,b+layer,b+1+layer,a+1+layer)])
        # Close the cut sides and head of the opening with actual thickness.
        if j>0 and opening(i,j-1):faces.append((a,b,b+layer,a+layer))
        if j<sides-1 and opening(i,j+1):faces.append((a+1,a+1+layer,b+1+layer,b+1))
        if i>0 and opening(i-1,j):faces.append((a,a+layer,a+1+layer,a+1))
        if i<len(levels)-2 and opening(i+1,j):faces.append((b,b+1,b+1+layer,b+layer))
for j in range(sides):
    a=(len(levels)-1)*(sides+1)+j;faces.append((a,a+1,a+1+layer,a+layer))
    faces.append((j+layer,j+1+layer,j+1,j))
shell=create_mesh('D14_Ancient_Hollow_Trunk',vertices,faces,uvs)
shell['real_hollow']=True;shell['opening_faces_removed_and_jambs_closed']=True
for i in range(16):
    angle=i/16*math.tau
    if abs(math.atan2(math.sin(angle+math.pi/2),math.cos(angle+math.pi/2)))<.69:continue
    collision.append(dict(id=f'D14_trunk_wall_{i}',kind='circle',x=x0+5.5*math.cos(angle),z=-z0+5.5*math.sin(angle),radius=1.27,bottom=y0-.7,top=y0+12,blocksMovement=True,source_mesh=shell.name,landmark='ANCIENT_TREE'))
# Asymmetric principal limbs are individually directed; no radial spoke crown.
limbs=[
('west_crook',[(1,0,18,2.7),(-5,-1,24,2.0),(-12,1,25,1.35),(-18,3,30,.78),(-20,2,33,.19)]),
('east_bow',[(2,1,22,2.35),(8,3,28,1.7),(15,2,29,1.1),(19,-2,33,.56),(18,-5,37,.13)]),
('north_split',[(2,1,23,2.2),(0,7,30,1.6),(-6,12,34,1.1),(-9,14,39,.45),(-7,15,43,.10)]),
('crown_spine',[(3,2,25,2.3),(5,2,32,1.75),(2,3,37,1.14),(5,3,43,.68),(3,4,48,.12)]),
('south_hook',[(1,-1,15,2.3),(5,-7,20,1.5),(10,-12,22,.95),(13,-15,26,.47),(11,-18,30,.1)]),
('west_low',[(0,1,12,2.15),(-6,4,16,1.5),(-11,7,17,1.0),(-17,10,16,.6),(-21,12,18,.12)]),
('north_east',[(3,2,20,2),(8,8,23,1.4),(12,12,29,.9),(10,16,33,.35),(13,18,35,.1)]),
]
for index,(name,controls) in enumerate(limbs):
    tube('D14_Limb_'+name,controls,18,6)
    for fork in [2,3]:
        p=controls[fork];direction=-1 if (index+fork)%2 else 1
        q=[(p[0],p[1],p[2],p[3]*.62),(p[0]+direction*2.8,p[1]-3.4,p[2]+2.7,p[3]*.42),(p[0]+direction*4.2,p[1]-4.5,p[2]+5.8,.08)]
        tube(f'D14_Fork_{index}_{fork}',q,10,5)
# Heavy buttress roots leave the southern hollow approach and west road clear.
root_angles=[.05,.62,1.16,1.68,2.17,2.69,3.23,3.80,5.45,5.96]
for i,angle in enumerate(root_angles):
    reach=17+(i*7%9);c,s=math.cos(angle),math.sin(angle);bend=.32*math.sin(i*1.8)
    points=[(c*3.3,s*3.3,6.2,2.5),(c*6.4,s*6.4,2.3,2.2),(math.cos(angle+bend)*11,math.sin(angle+bend)*11,1.0,1.65),(c*reach,s*reach,.10,.72),(c*(reach+3),s*(reach+3),-.65,.10)]
    tube(f'D14_Buttress_Root_{i}',points,16,7,flatten=.62,collide=True)
    p=points[2]
    tube(f'D14_Root_Tendril_{i}',[(p[0],p[1],.55,.8),(p[0]+s*4+c*3,p[1]-c*4+s*3,.1,.47),(p[0]+s*5+c*7,p[1]-c*5+s*7,-.45,.08)],10,5,flatten=.6,collide=True)
# Bark ridges and broken stubs give the silhouette age without leaf crowns.
for i in range(14):
    angle=i/14*math.tau
    if abs(math.atan2(math.sin(angle+math.pi/2),math.cos(angle+math.pi/2)))<.6:continue
    points=[]
    for h,r in [(1,6.2),(6,5.5),(12,4.55),(19,3.68),(26,2.6)]:
        a=angle+h*.014;points.append((.14*h+math.cos(a)*r,math.sin(a)*r+.06*h,h,.24+.10*math.sin(i+h*.1)))
    tube(f'D14_Bark_Strand_{i}',points,8,4)
bpy.context.view_layer.update()
all_vertices=[root.matrix_world@(obj.matrix_local@v.co) for obj in objects for v in obj.data.vertices]
lo=np.min(np.array(all_vertices),axis=0);hi=np.max(np.array(all_vertices),axis=0)
bpy.ops.object.select_all(action='DESELECT')
for obj in [root,*objects]:obj.select_set(True)
bpy.context.view_layer.objects.active=root
path=OUT/'assets/ancient_tree_D14.glb'
bpy.ops.export_scene.gltf(filepath=str(path),export_format='GLB',use_selection=True,export_animations=False,export_yup=True)
bpy.context.scene['status']='Unique hollow tree at approved anchor; Godot silhouette, roots and approach collision review pending.'
bpy.ops.wm.save_as_mainfile(filepath=str(TARGET),compress=True)
report=dict(revision='D14',replaces='ANCIENT_TREE',anchor_xyz=anchor['position'],native_source=TARGET.relative_to(ROOT).as_posix(),native_sha256=hashlib.sha256(TARGET.read_bytes()).hexdigest(),glb=path.relative_to(ROOT).as_posix(),glb_sha256=hashlib.sha256(path.read_bytes()).hexdigest(),editable_meshes=len(objects),triangles=sum(len(p.vertices)-2 for obj in objects for p in obj.data.polygons),world_dimensions_xyz=[float(hi[0]-lo[0]),float(hi[2]-lo[2]),float(hi[1]-lo[1])],real_hollow=True,forest_placements_removed=0,visual_verified=False,collision_verified=False,bark_sources=paths,license_evidence='docs/assets/world-source-manifest.json')
(OUT/'ancient-tree-D14.json').write_text(json.dumps(report,indent=2)+'\n')
(OUT/'ancient-tree-collision-D14.json').write_text(json.dumps(dict(schema=1,obstacles=collision),indent=2)+'\n')
(ROOT/'docs/world-final/ancient-tree-D14.json').write_text(json.dumps(report,indent=2)+'\n')
print('D14_ANCIENT_TREE '+json.dumps(report),flush=True)
