"""Package only approved source payloads and attribution for GitHub storage."""
import json,zipfile,hashlib,sys
from pathlib import Path
root=Path(__file__).resolve().parents[1]; source=Path(sys.argv[1]).resolve();out=Path(sys.argv[2]).resolve();out.parent.mkdir(parents=True,exist_ok=True)
mapping={'ICE':'IceGolem','G1':'FireGolem','G2':'RiftWarden','G3':'HellforgedWarden','U1':'Zombie','S1':'SkeletonV3','L2':'Werewolf','B1':'GiantBat','P1':'WraithV3'}
approved=json.loads((root/'docs/content-expansion-v3/ASSETS_MANIFEST.json').read_text(encoding='utf8'));entries=[]
with zipfile.ZipFile(out,'w',zipfile.ZIP_DEFLATED,compresslevel=6,allowZip64=True) as z:
 for a in approved['assets']:
  if a['id']not in mapping:continue
  name=mapping[a['id']];p=source/(name+'.glb');b=p.read_bytes();z.writestr(name+'.glb',b)
  entries.append({'name':name,'id':a['id'],'author':a['author'],'title':a['title'],'url':a['url'],'license':'CC BY 4.0','licenseUrl':'https://creativecommons.org/licenses/by/4.0/','noGenerativeProcessing':a['id']=='P1','file':p.name,'bytes':len(b),'sha256':hashlib.sha256(b).hexdigest()})
 z.writestr('SOURCE_MANIFEST.json',json.dumps({'schema':1,'models':entries},ensure_ascii=False,indent=2))
 z.writestr('ATTRIBUTION.txt','VARENDOR approved monster sources\n\n'+'\n\n'.join(f"{a['title']} — {a['author']}\n{a['url']}\n{a['license']} — {a['licenseUrl']}\nUnmodified official Sketchfab glTF download." for a in entries))
with zipfile.ZipFile(out) as z:assert z.testzip()is None
b=out.read_bytes();lock={'schema':1,'archive':{'file':out.name,'bytes':len(b),'sha256':hashlib.sha256(b).hexdigest()},'models':entries}
(root/'art/monsters-v3/source-lock.json').write_text(json.dumps(lock,ensure_ascii=False,indent=2),encoding='utf8');print(json.dumps(lock['archive']))
