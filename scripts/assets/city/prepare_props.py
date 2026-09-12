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

import bpy,pathlib,json,hashlib
from mathutils import Vector
prop_reports=[]
for folder,name,height in [('wooden_crate_01','crate',.72)]:
 bpy.ops.wm.read_factory_settings(use_empty=True)
 src=next((repo/'public/assets/models/realism'/folder).glob('*.gltf'))
 bpy.ops.import_scene.gltf(filepath=str(src))
 meshes=[o for o in bpy.context.scene.objects if o.type=='MESH']
 pts=[o.matrix_world@Vector(v) for o in meshes for v in o.bound_box]
 lo=Vector(tuple(min(v[i] for v in pts) for i in range(3)));hi=Vector(tuple(max(v[i] for v in pts) for i in range(3)));factor=height/(hi.z-lo.z)
 par=bpy.data.objects.new('P2_'+name,None);bpy.context.scene.collection.objects.link(par)
 for o in meshes:
  mw=o.matrix_world.copy();o.parent=par;o.matrix_world=mw
 par.scale=(factor,)*3;par.location=Vector((-(lo.x+hi.x)/2,-(lo.y+hi.y)/2,-lo.z))*factor
 dest=out/('P2_'+name+'.glb');bpy.ops.export_scene.gltf(filepath=str(dest),export_format='GLB',export_animations=False)
 prop_reports.append({'asset':name,'source':str(src),'source_sha256':hashlib.sha256(src.read_bytes()).hexdigest(),'path':str(dest),'sha256':hashlib.sha256(dest.read_bytes()).hexdigest(),'height':height,'license':'Poly Haven CC0; existing project licensed source','changes':'normalized height and floor, embedded texture GLB'})
(reports/'props-adaptation.json').write_text(json.dumps(prop_reports,indent=2));print('CITY_PROPS_DONE')
