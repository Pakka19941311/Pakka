"""Export only this candidate; keep production D13/world files untouched."""
from pathlib import Path
import bpy,json,math,hashlib,shutil
from mathutils import Matrix
OUT=Path(__file__).resolve().parent;ROOT=OUT.parents[1];RUNTIME=ROOT/'godot-pc/world-final/nature/p2-sample-v3';RUNTIME.mkdir(parents=True,exist_ok=True)
master=OUT/'Varendor_P2_Nature_Candidate_01.blend';bpy.ops.wm.open_mainfile(filepath=str(master));bpy.context.view_layer.update()
manifest=json.loads((OUT/'candidate-placements.json').read_text());snapshot=json.loads((OUT/'site-snapshot.json').read_text())
exports=[]
def sha(path):return hashlib.sha256(path.read_bytes()).hexdigest()
def export_selection(objects,path):
 bpy.ops.object.select_all(action='DESELECT')
 for o in objects:o.select_set(True)
 bpy.context.view_layer.objects.active=objects[0]
 bpy.ops.export_scene.gltf(filepath=str(path),export_format='GLB',use_selection=True,export_apply=True,export_animations=False,export_extras=True,export_cameras=False,export_lights=False)
 return {'path':path.name,'bytes':path.stat().st_size,'sha256':sha(path)}
def stable_parent(obj):
 while obj.parent and not obj.get('source_asset'):obj=obj.parent
 return obj
groups={};seen=set();prototypes={}
def sample_height(region,x,z):
 v=snapshot['regions'][region];b=v['bounds'];step=v['step'];cols=v['columns'];rows=v['rows'];gx=min(cols-1e-8,max(0,(x-b[0])/step));gz=min(rows-1e-8,max(0,(z-b[1])/step));i=int(gx);j=int(gz);u=gx-i;t=gz-j;a=j*(cols+1)+i;hs=v['heights'];aa,bb,cc,dd=hs[a],hs[a+1],hs[a+cols+1],hs[a+cols+2]
 return aa+u*(bb-aa)+t*(dd-bb) if u>=t else aa+u*(dd-cc)+t*(cc-aa)
def lod_parts(key):
 if key in prototypes:return prototypes[key]
 desc=snapshot['catalog'].get(key,snapshot['grassCatalog'].get(key));lod=desc['lods'][min(1,len(desc['lods'])-1)];before=set(bpy.data.objects);bpy.ops.import_scene.gltf(filepath=str(ROOT/'godot-pc/world-final/nature'/lod['path']));new=list(set(bpy.data.objects)-before);parts=[(o.data.copy(),o.matrix_world.copy())for o in new if o.type=='MESH']
 for o in new:bpy.data.objects.remove(o,do_unlink=True)
 prototypes[key]=parts;return parts
for region in ['forest','shore']:
 for o in list(bpy.data.collections[region.title()+'_Candidate'].objects):
  if o.type!='MESH' or o.get('reference_only') or not o.parent:continue
  parent=stable_parent(o);key=str(parent.get('source_asset',''));p=parent.matrix_world.translation
  if parent.name in seen:continue
  seen.add(parent.name)
  kind='grass' if key.startswith('grass') or key=='sedge_wet' else 'nature'
  group=(region,math.floor(p.x/32),math.floor(-p.y/32),kind);groups.setdefault(group,[]).append((parent,key))
temp=bpy.data.collections.new('QA_EXPORT_TEMP');bpy.context.scene.collection.children.link(temp)
for (region,cx,cz,kind),sources in sorted(groups.items()):
 copies=[]
 for parent,key in sources:
  for data,transform in lod_parts(key):
   mesh=data.copy();o=bpy.data.objects.new(parent.name+'_export',mesh);temp.objects.link(o);o.matrix_world=parent.matrix_world@transform;copies.append(o)
   if parent.name.startswith('P2N_tree_'):
    # Reapply exactly the candidate root policy to the existing LOD1 source.
    # Lower detail must not resurrect the original scan's flat outer skirt.
    origin=parent.matrix_world.translation;scale=parent.scale.x;yaw=parent.rotation_euler.z
    for vertex in mesh.vertices:
     p=transform@vertex.co
     if p.z>=.75:continue
     wx=origin.x+scale*(p.x*math.cos(yaw)-p.y*math.sin(yaw));wz=-origin.y-scale*(p.x*math.sin(yaw)+p.y*math.cos(yaw));delta=(sample_height(region,wx,wz)-origin.z)/scale;source_height=p.z;amount=max(0,1-max(0,p.z)/.45);p.z+=delta*amount-.045/scale*amount
     if key.startswith('pine'):
      radial=min(1,max(0,(math.hypot(p.x,p.y)-.25)/.55));low=min(1,max(0,(.75-source_height)/.3));p.z=p.z*(1-radial*low)+(delta-.035/scale)*radial*low
     vertex.co=transform.inverted()@p
 bpy.ops.object.select_all(action='DESELECT')
 for o in copies:o.select_set(True)
 bpy.context.view_layer.objects.active=copies[0];bpy.ops.object.join();obj=bpy.context.object
 obj.name=f'P2N_{region}_{kind}_{cx}_{cz}';obj['candidate_render_only']=True
 # Join is spatial only. Different PBR materials survive as GLB surfaces.
 path=RUNTIME/(obj.name+'.glb');entry=export_selection([obj],path);entry.update({'kind':kind,'region':region,'cell':[cx,cz],'sourceParents':len(sources),'sourceDetail':'existing D13 LOD1; candidate root seating retained'});exports.append(entry)
 bpy.data.objects.remove(obj,do_unlink=True)
for region in ['forest','shore']:
 original=bpy.data.objects['D13_Terrain_Reference_'+region];mesh=original.data.copy();mesh.materials.clear();obj=bpy.data.objects.new('P2N_'+region+'_ground_overlay',mesh);temp.objects.link(obj)
 for v in mesh.vertices:v.co.z+=.008
 colors=mesh.color_attributes.new(name='P2N_MASK',type='FLOAT_COLOR',domain='POINT');mesh.color_attributes.active_color=colors
 a=mesh.attributes['P2N_surface_mask'];m=mesh.attributes['P2N_moss'];w=mesh.attributes['P2N_wet']
 for i in range(len(mesh.vertices)):colors.data[i].color=(a.data[i].value,m.data[i].value,w.data[i].value,1)
 material=bpy.data.materials.new('P2N_Mask_Requires_Adapter');material.use_nodes=True;nodes=material.node_tree.nodes;vertex=nodes.new('ShaderNodeVertexColor');vertex.layer_name='P2N_MASK';material.node_tree.links.new(vertex.outputs['Color'],nodes.get('Principled BSDF').inputs['Base Color']);mesh.materials.append(material)
 obj['render_only']=True;obj['terrain_offset_m']=.008;obj['collision']=False
 entry=export_selection([obj],RUNTIME/(obj.name+'.glb'));entry.update({'kind':'ground','region':region,'bounds':snapshot['regions'][region]['bounds'],'renderOnly':True,'verticalOffsetM':.008});exports.append(entry);bpy.data.objects.remove(obj,do_unlink=True)
bpy.data.collections.remove(temp)
textures={}
for key,source in [('litter','mud_forest/diff.jpg'),('soil','forest_ground_04/diff.jpg'),('mud','brown_mud/diff.jpg'),('normal','mud_forest/nor_gl.jpg')]:
 src=ROOT/'public/assets/world'/source;dst=RUNTIME/(key+'.jpg');shutil.copyfile(src,dst);textures[key]={'path':dst.name,'source':src.relative_to(ROOT).as_posix(),'sha256':sha(dst)}
collision={'schema':1,'coordinates':'server X,Z; Z=-GodotZ; height Y unchanged','source':'candidate-placements.json','obstacles':manifest['obstacles']}
(RUNTIME/'collision.json').write_text(json.dumps(collision,indent=2)+'\n')
# The actual hero is external QA input; do not commit an 85 MB duplicate in
# every environmental master. Cameras, exact terrain and all authored plants
# remain in the editable master and build_sample.py recreates the hero shots.
for o in list(bpy.data.collections['QA_Hero'].objects):bpy.data.objects.remove(o,do_unlink=True)
bpy.context.scene['qa_hero_external']='godot-pc/assets/knight/Knight_Modular.glb'
bpy.data.orphans_purge(do_recursive=True);bpy.context.preferences.filepaths.save_version=0;bpy.ops.wm.save_as_mainfile(filepath=str(master),compress=True)
manifest['masterSha256']=sha(master);manifest['masterBytes']=master.stat().st_size;manifest['qaHeroExternal']='godot-pc/assets/knight/Knight_Modular.glb';manifest['runtimeExports']=exports
(OUT/'candidate-placements.json').write_text(json.dumps(manifest,indent=2)+'\n')
runtime={'schema':1,'candidateOnly':True,'coordinates':'Godot X,Y,Z; server Z=-GodotZ','sourceMaster':master.relative_to(ROOT).as_posix(),'sourceMasterSha256':sha(master),'regions':{k:v['bounds']for k,v in snapshot['regions'].items()},'chunks':exports,'textures':textures,'collision':'collision.json','baselineGrassReplacement':True,'heightFieldChanged':False,'waterExported':False,'heroExported':False,'groundOffsetM':.008,'qaShots':manifest['shots'],'qaWaterPolygon':snapshot['water']['lake']['polygon'],'nativeAcceptance':'pending'}
runtime['materialSources']=['nature_sample.gd','leaf.gdshader','grass.gdshader','ground_overlay.gdshader','shore_water.gdshader']
runtime['actualWorldReview']={'status':'pending after re-export; earlier evidence is historical','report':'art/p2-nature-sample-v3/ACTUAL_WORLD_REVIEW_RU.md'}
(RUNTIME/'manifest.json').write_text(json.dumps(runtime,indent=2)+'\n')
print('RUNTIME_EXPORT '+json.dumps({'chunks':len(exports),'bytes':sum(e['bytes']for e in exports),'masterBytes':master.stat().st_size,'heroExported':False,'obstacles':len(collision['obstacles'])}),flush=True)
import runpy
runpy.run_path(str(OUT/'compact_glbs.py'),run_name='__main__')
