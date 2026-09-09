"""Restore the approved CC0 source by SHA-256 and build real Blender/GLB outputs."""
import argparse,hashlib,json,os,shutil,subprocess,urllib.request
from pathlib import Path
import py7zr
ROOT=Path(__file__).resolve().parents[1]
def main():
 parser=argparse.ArgumentParser(description=__doc__)
 parser.add_argument('--blender',default=os.environ.get('BLENDER'),required=not os.environ.get('BLENDER'))
 parser.add_argument('--cache',type=Path,default=ROOT/'qa-artifacts/monster-sources')
 args=parser.parse_args();cache=args.cache.resolve();cache.mkdir(parents=True,exist_ok=True)
 pin=json.loads((ROOT/'art/monsters-v3/forest/source-lock.json').read_text(encoding='utf8'))
 archive=cache/'forest-monster.7z'
 if not archive.exists():
  request=urllib.request.Request(pin['archive'],headers={'User-Agent':'Varendor-Approved-Asset-Build'})
  with urllib.request.urlopen(request,timeout=180) as response,archive.open('wb') as out:shutil.copyfileobj(response,out)
 with archive.open('rb') as stream:digest=hashlib.file_digest(stream,'sha256').hexdigest()
 if archive.stat().st_size!=pin['bytes'] or digest!=pin['sha256']:raise RuntimeError('Forest source checksum mismatch')
 extracted=cache/'forest';extracted.mkdir(exist_ok=True)
 with py7zr.SevenZipFile(archive) as source:
  for name in source.getnames():
   target=(extracted/name.replace('\\','/')).resolve()
   if not target.is_relative_to(extracted):raise RuntimeError('Unexpected archive path')
  source.extractall(extracted)
 subprocess.run([args.blender,'--background','--disable-autoexec','--python-exit-code','1','--python',str(ROOT/'scripts/build-forest-monster.py'),'--',str(extracted/pin['original'])],check=True,cwd=ROOT)
 target=ROOT/'godot-pc/generated/actors/ForestLord.glb';target.parent.mkdir(parents=True,exist_ok=True)
 shutil.copyfile(ROOT/'art/monsters-v3/forest/ForestLord.glb',target)
 print(json.dumps({'source':str(archive),'runtime':str(target),'sha256':digest}))
if __name__=='__main__':main()
