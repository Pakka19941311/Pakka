"""Reassemble SHA-pinned approved sources from Git and build all native actors."""
import json,hashlib,zipfile,subprocess,sys,shutil,argparse
from pathlib import Path
root=Path(__file__).resolve().parents[1];parser=argparse.ArgumentParser();parser.add_argument('--blender',required=True);parser.add_argument('--sources-only',action='store_true');args=parser.parse_args()
lock=json.loads((root/'art/monsters-v3/source-lock.json').read_text(encoding='utf8'));dest=root/'art/monsters-v3/sources';dest.mkdir(parents=True,exist_ok=True);archive=dest/lock['archive']['file']
def verify(p,e):
 b=p.read_bytes();assert len(b)==e['bytes'] and hashlib.sha256(b).hexdigest()==e['sha256'],str(p)
with archive.open('wb') as out:
 for part in lock['archive']['parts']:
  p=root/part['path'];verify(p,part)
  with p.open('rb') as source:shutil.copyfileobj(source,out)
verify(archive,lock['archive'])
with zipfile.ZipFile(archive) as z:
 for model in lock['models']:
  assert Path(model['file']).name==model['file'];p=dest/model['file'];p.write_bytes(z.read(model['file']));verify(p,model)
if not args.sources_only:
 subprocess.run([args.blender,'--background','--factory-startup','--disable-autoexec','--python-exit-code','1','--python',str(root/'scripts/build-monsters-v3.py'),'--',str(dest)],check=True)
 for model in lock['models']:
  name=model['name'];shutil.copyfile(root/'art/monsters-v3/runtime'/(name+'.glb'),root/'godot-pc/generated/actors'/(name+'.glb'))
 print('Built all nine approved actor sources')
