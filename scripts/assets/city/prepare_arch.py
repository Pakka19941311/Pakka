# Reproduces the staged P2 city art from locally cached, hash-checked sources.
# Run with Blender4.2.3 --background --factory-startup --disable-autoexec.
import argparse
import sys
from pathlib import Path
_parser=argparse.ArgumentParser()
_parser.add_argument('--intake',required=True,help='Asset intake root containing city-p2 and A03')
_parser.add_argument('--output',required=True,help='Explicit destination for reproduced GLBs')
_parser.add_argument('--reports',required=True,help='Explicit destination for review images and JSON')
_parser.add_argument('--repo',default=str(Path(__file__).resolve().parents[3]))
_args=_parser.parse_args(sys.argv[sys.argv.index('--')+1:] if '--' in sys.argv else [])
intake=Path(_args.intake).resolve()
root=intake/'city-p2'
repo=Path(_args.repo).resolve()
out=Path(_args.output).resolve();out.mkdir(parents=True,exist_ok=True)
reports=Path(_args.reports).resolve();reports.mkdir(parents=True,exist_ok=True)

import bpy,pathlib,json,math,hashlib,numpy as np
from mathutils import Vector
mapping={'GreyBrick2':'GreyBricks2','GreyStone2':'GreyStone2','LogEdgeWeathered':'TreeLogEdgeWeathered','Plaster':'PlasterLarge','RoofTiles':'RoofTiles','RustedMetal':'Rusted Metal','Stone':'Stone','WindowBlue1':'WindowBlue1','WindowBlue2':'WindowsBlue2','Wood':'Wood','Black':'Black','DoorType1_1':'DoorType1_1','DoorType1_2':'DoorType1_2','Flag':'Flag','StoneWall':'StoneWall1'}
results=[]
for name,factor in [('housepack',1.0),('gatehouse',1.0)]:
 source=next((root/name).rglob('*.blend'))
 bpy.ops.wm.open_mainfile(filepath=str(source),load_ui=False,use_scripts=False)
 for ob in list(bpy.context.scene.objects):
  if ob.type!='MESH':bpy.data.objects.remove(ob,do_unlink=True)
 meshes=list(bpy.context.scene.objects)
 material_reports=[]
 converted_windows={}
 for ob in meshes:
  ob.hide_set(False);ob.hide_render=False
  for slot in ob.material_slots:
   old=slot.material
   if not old:continue
   mat=bpy.data.materials.new('P2_'+old.name);mat.use_nodes=True
   bsdf=mat.node_tree.nodes.get('Principled BSDF');bsdf.inputs['Roughness'].default_value=.86
   image=None
   if name=='house':image=bpy.data.images.load(str(next((root/name).rglob('medieval_house_1_001_d.png'))),check_existing=True)
   else:
    key=mapping.get(old.name.split('.')[0],old.name.split('.')[0])
    image=next((i for i in bpy.data.images if i.name.split('.')[0]==key and i.size[0]>0),None)
   if image:
    if 'Window' in image.name:
     if image.name not in converted_windows:
      a=np.array(image.pixels[:],dtype=np.float32).reshape(-1,4);l=np.max(a[:,:3],axis=1)
      a[:,:3]=l[:,None]*np.array([.34,.25,.13])
      new=bpy.data.images.new('P2_warm_'+image.name,width=image.size[0],height=image.size[1]);new.pixels[:]=a.ravel();new.pack();converted_windows[image.name]=new
     image=converted_windows[image.name]
    if image.packed_file:
     texdir=root/name/'unpacked';texdir.mkdir(exist_ok=True)
     texpath=texdir/image.name
     texpath.write_bytes(image.packed_file.data);image.filepath=str(texpath)
    if max(image.size)>1024:image.scale(int(image.size[0]*1024/max(image.size)),int(image.size[1]*1024/max(image.size)))
    image.pack();node=mat.node_tree.nodes.new('ShaderNodeTexImage');node.image=image;mat.node_tree.links.new(node.outputs['Color'],bsdf.inputs['Base Color'])
   else:bsdf.inputs['Base Color'].default_value=(.26,.2,.14,1)
   if 'Metal' in old.name:bsdf.inputs['Metallic'].default_value=.5;bsdf.inputs['Roughness'].default_value=.65
   slot.material=mat;material_reports.append({'original':old.name,'image':image.name if image else None,'reconstruction':'source diffuse image and constant roughness; no invented source PBR maps'})
 pts=[ob.matrix_world@Vector(v) for ob in meshes for v in ob.bound_box]
 lo=Vector(tuple(min(v[i] for v in pts) for i in range(3)));hi=Vector(tuple(max(v[i] for v in pts) for i in range(3)))
 parent=bpy.data.objects.new('P2_'+name,None);bpy.context.scene.collection.objects.link(parent)
 for ob in meshes:
  mw=ob.matrix_world.copy();ob.parent=parent;ob.matrix_world=mw
 parent.scale=(factor,)*3;parent.location=Vector((-(lo.x+hi.x)*.5,-(lo.y+hi.y)*.5,-lo.z))*factor
 bpy.context.view_layer.update()
 for ob in bpy.context.scene.objects:ob.select_set(True)
 path=out/('P2_'+name+'.glb')
 bpy.ops.export_scene.gltf(filepath=str(path),export_format='GLB',use_selection=True,export_animations=False,export_apply=True)
 center=Vector((0,0,(hi.z-lo.z)*factor*.45));size=max(hi-lo)*factor
 camdata=bpy.data.cameras.new('review');cam=bpy.data.objects.new('review',camdata);bpy.context.scene.collection.objects.link(cam)
 cam.location=center+Vector((size*.9,-size*1.25,size*.62));cam.rotation_euler=(center-cam.location).to_track_quat('-Z','Y').to_euler();camdata.type='ORTHO';camdata.ortho_scale=size*1.35
 scene=bpy.context.scene;scene.camera=cam
 scene.world=bpy.data.worlds.new('review');scene.world.use_nodes=True;scene.world.node_tree.nodes['Background'].inputs['Color'].default_value=(.38,.43,.48,1);scene.world.node_tree.nodes['Background'].inputs['Strength'].default_value=.55
 ldata=bpy.data.lights.new('sun','SUN');light=bpy.data.objects.new('sun',ldata);scene.collection.objects.link(light);ldata.energy=2.1;light.rotation_euler=(math.radians(25),math.radians(-30),math.radians(-25))
 scene.render.engine='CYCLES';scene.cycles.samples=12;scene.render.resolution_x=1200;scene.render.resolution_y=900;scene.render.resolution_percentage=100;scene.view_settings.view_transform='AgX';scene.render.image_settings.file_format='PNG';scene.render.filepath=str(reports/(name+'-review.png'))
 bpy.ops.render.render(write_still=True)
 report={'name':name,'source':str(source),'source_sha256':hashlib.sha256(source.read_bytes()).hexdigest(),'path':str(path),'sha256':hashlib.sha256(path.read_bytes()).hexdigest(),'source_scale_factor':factor,'dimensions':list((hi-lo)*factor),'materials':material_reports,'source_meshes':len(meshes),'status':'import candidate; review pending'}
 (reports/(name+'-adaptation.json')).write_text(json.dumps(report,indent=2));results.append(report)
 print('ARCH_DONE',name,flush=True)
