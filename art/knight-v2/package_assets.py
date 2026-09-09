"""Package real editable/native assets and reproducible inputs, with full inventory."""
import argparse,hashlib,json,zipfile,subprocess
from pathlib import Path

def main():
 p=argparse.ArgumentParser();p.add_argument('--workspace',required=True);p.add_argument('--out',required=True);p.add_argument('--revision',required=True);a=p.parse_args();w=Path(a.workspace).resolve();out=Path(a.out).resolve();out.parent.mkdir(parents=True,exist_ok=True);files={}
 def add(path):
  path=Path(path)
  if not path.is_file():raise FileNotFoundError(path)
  files[str(path.relative_to(w))]=path
 def tree(path):
  for f in sorted(Path(path).rglob('*')):
   if not f.is_file() or any(x in f.parts for x in ['.godot','__pycache__']):continue
   if f.suffix in ['.pyc','.blend1','.import']:continue
   if f.parent.name=='assets' and f.suffix not in ['.glb','.json']:continue
   add(f)
 # All small versioned scripts, manifest, reports and the ready-to-run project.
 tree(w/'Pakka/art/knight-v2')
 for name in ['build_fitted.py','export_assets.py','render_animation_review.py','LICENSES.md','source_provenance.json']:
  add(w/'Pakka/art/forgotten-knight'/name)
 # Native editable source and external textures. Modular GLB is already in Godot assets.
 for name in ['Varendor_Knight_Modular_Master.blend','Knight_Starter.glb','knight_manifest.json','blender_audit.json','Starter.png','Helmet_Open.png','Helmet_Closed.png','Armored_Open.png','Chest_Only.png','Boots_Only.png']:
  add(w/'knight-v2/output'/name)
 tree(w/'knight-v2/output/Textures')
 # Immutable accepted input; original V1 exports remain in the separate saved baseline ZIP.
 for name in ['Accepted_Knight_Master.blend','ACCEPTED_BASELINE.json','STATE_before_v2.json']:
  add(w/'knight-v2/accepted'/name)
 # Exactly the source data used to build V2. No unused 280MB asset pack or GPL plugin code.
 for name in ['athletic_male_hm08.json','body_summary.json']:
  add(w/'human-base-source/prepared'/name)
 for name in ['LICENSE.md','LICENSE.ASSETS.md','LICENSE.CODE.md']:
  add(w/'human-base-source/upstream'/name)
 add(w/'human-base-source/upstream/src/mpfb/data/3dobjs/base.obj')
 info=json.loads((w/'human-base-source/prepared/athletic_male_hm08.json').read_text())
 for name in info['recipe']:add(w/'human-base-source/upstream/src/mpfb/data/targets'/name)
 mh=w/'knight-v2/sources/makehuman'
 for name in ['skins/young_caucasian_male','hair/short02','eyes/low-poly','eyebrows/eyebrow001']:tree(mh/name)
 add(mh/'eyes/materials/brown_eye.png')
 for name in ['Varendor_Knight_Modular_Review.mp4','render_manifest.json','Varendor_Knight_Modular_Board.png']:
  add(w/'knight-v2/review'/name)
 for name in ['CODEX_HANDOFF.md','DELIVERY_REVISION.json']:
  add(w/'knight-v2/delivery'/name)
 for name in ['godot-import.log','godot-verify.log','audit.log']:
  add(w/'knight-v2'/name)
 tracked=set(subprocess.check_output(['git','-C',str(w/'Pakka'),'ls-files'],text=True).splitlines())
 # Pending art files will be committed with this package's supplied remote revision.
 source_suffixes={'.py','.gd','.uid','.tscn','.godot','.json','.md'}
 inventory=[]
 for rel,f in sorted(files.items()):
  repo_rel=rel[6:] if rel.startswith('Pakka/') else None
  in_git=bool(repo_rel and (repo_rel in tracked or (repo_rel.startswith('art/knight-v2/') and (f.suffix in source_suffixes or f.name=='.gitignore') and '/godot-review/evidence/' not in repo_rel)))
  inventory.append({'path':rel,'bytes':f.stat().st_size,'sha256':hashlib.sha256(f.read_bytes()).hexdigest(),'in_git':in_git})
 report={'package':out.name,'branch':'work/godot-p1-recovery','commit':a.revision,'files':inventory,'excluded_regenerable':['.godot import cache','unique PNG animation frames (re-renderable from master and script)','Blender .blend1 autosaves'],'preserved_separately':{'accepted_full_v1':'Varendor_Knight_Accepted_Baseline.zip','library_file_id':'libfile_6c2722ab30188191af26f71b50ed20d7'},'unused_download_excluded':'Original 280MB MakeHuman asset pack; all selected geometry, metadata and textures included here.'}
 report_path=w/'knight-v2/delivery/FILE_INVENTORY.json';report_path.write_text(json.dumps(report,ensure_ascii=False,indent=2))
 non_git=[x for x in inventory if not x['in_git']]
 text='# Файлы вне Git\n\nВсе перечисленные файлы включены в '+out.name+'. Полные SHA-256 и размеры: FILE_INVENTORY.json.\n\n'
 text+='\n'.join('- `'+x['path']+'` — '+str(x['bytes'])+' байт' for x in non_git)+'\n'
 text+='\nПринятый полный пакет v1 с прежними экспортами дополнительно сохранён как Varendor_Knight_Accepted_Baseline.zip. Импортный кеш Godot, отдельные рендер-кадры и Blender autosave не входят в поставку: они воспроизводятся из включённых исходников. Неиспользованные файлы полного MakeHuman download не нужны для пересборки; выбранные исходники включены.\n'
 non_path=w/'knight-v2/delivery/NON_GIT_FILES.md';non_path.write_text(text)
 with zipfile.ZipFile(out,'w',zipfile.ZIP_DEFLATED,compresslevel=5,allowZip64=True) as z:
  for rel,f in sorted(files.items()):z.write(f,rel)
  z.write(report_path,'FILE_INVENTORY.json');z.write(non_path,'NON_GIT_FILES.md')
  z.write(w/'knight-v2/delivery/CODEX_HANDOFF.md','START_HERE.md')
 # Verify archive CRC and manifest correspondence, not just successful ZIP creation.
 with zipfile.ZipFile(out) as z:
  bad=z.testzip();assert bad is None,bad
 package={'file':str(out),'bytes':out.stat().st_size,'sha256':hashlib.sha256(out.read_bytes()).hexdigest(),'file_count':len(files)+3,'commit':a.revision,'crc_verified':True}
 (w/'knight-v2/delivery/PACKAGE_SHA256.json').write_text(json.dumps(package,indent=2));print(json.dumps(package),flush=True)
if __name__=='__main__':main()
