"""Read-only Godot 4.6 embedded PCK integrity, active resources and server parity.

Run only after export has finished. No engine, extraction, save data or downloads.
The JSON report deliberately omits machine paths and personal environment data.
"""
from pathlib import Path, PurePosixPath
import argparse,hashlib,json,posixpath,re,struct,subprocess

class Pck:
 def __init__(self,path):
  self.file=None
  try:self._load(path)
  except Exception:
   if self.file is not None:self.file.close()
   raise
 def _load(self,path):
  self.path=Path(path);self.file=self.path.open('rb');self.size=self.path.stat().st_size
  self.file.seek(-12,2);size,magic=struct.unpack('<Q4s',self.exact(12))
  if magic!=b'GDPC' or size>self.size-12:raise ValueError('invalid embedded PCK trailer')
  self.start=self.size-12-size;self.end=self.size-12;self.file.seek(self.start)
  magic,version,major,minor,patch,flags=struct.unpack('<4s5I',self.exact(24))
  if magic!=b'GDPC' or version!=3:raise ValueError('requires unencrypted Godot PCK v3')
  self.base,directory=struct.unpack('<QQ',self.exact(16))
  self.engine=[major,minor,patch];self.file.seek(self.start+directory)
  count=struct.unpack('<I',self.exact(4))[0]
  if count>1000000:raise ValueError('invalid PCK entry count')
  self.entries={}
  for _ in range(count):
   length=struct.unpack('<I',self.exact(4))[0]
   if length>16384:raise ValueError('invalid PCK path length')
   name=self.exact(length).rstrip(b'\0').decode('utf8').removeprefix('res://')
   offset,length=struct.unpack('<QQ',self.exact(16));md5=self.exact(16).hex();eflags=struct.unpack('<I',self.exact(4))[0]
   if not name or name in self.entries or '\\' in name or PurePosixPath(name).is_absolute() or '..' in PurePosixPath(name).parts:
    raise ValueError('invalid or duplicated PCK path')
   at=self.start+self.base+offset
   if eflags!=0 or at<self.start or at+length>self.end:raise ValueError('unsupported or out-of-bounds PCK entry: '+name)
   self.entries[name]={'at':at,'bytes':length,'md5':md5}
 def exact(self,n):
  b=self.file.read(n)
  if len(b)!=n:raise ValueError('truncated PCK')
  return b
 def read(self,name):
  e=self.entries[name];self.file.seek(e['at']);return self.exact(e['bytes'])
 def json(self,name):return json.loads(self.read(name))
 def hash(self,name,algorithm='md5'):
  e=self.entries[name];self.file.seek(e['at']);left=e['bytes'];h=hashlib.new(algorithm)
  while left:
   b=self.exact(min(left,4*1024*1024));h.update(b);left-=len(b)
  return h.hexdigest()
 def close(self):self.file.close()

def normalized(path):return posixpath.normpath(path.removeprefix('res://').replace('\\','/'))
def remap_targets(pck,name):
 text=pck.read(name).decode('utf8')
 return [normalized(v) for v in re.findall(r'(?m)^path(?:\.[\w.]+)?\s*=\s*"(res://[^"\r\n]+)"',text)]
def available(pck,path):
 name=normalized(path)
 if name in pck.entries:return True
 return any(name+suffix in pck.entries and all(t in pck.entries for t in remap_targets(pck,name+suffix))
            and bool(remap_targets(pck,name+suffix)) for suffix in ['.import','.remap'])

def catalog_paths(pck,project):
 rows=[]
 def add(descriptor,path,base=''):
  rows.append({'descriptor':descriptor,'path':normalized(path if path.startswith('res://') else base+path)})
 desc='world-final/geology-D13/terrain.json'
 for cell in pck.json(desc)['chunks']:add(desc,cell['glb'],'world-final/geology-D13/')
 for desc in ['world-final/nature/authored-D13.json','world-final/nature/groundcover-authored-D13.json']:
  for entry in pck.json(desc)['catalog'].values():
   for lod in entry['lods']:add(desc,lod['path'],'world-final/nature/')
 for desc in ['world-final/nature/impostors/far-trees-D07.json','world-final/nature/impostors/far-trees-D09.json']:
  for entry in pck.json(desc)['assets'].values():
   for key in ['texture','vectors']:add(desc,entry[key])
 desc='world-expansion-v3/actors/profiles.json'
 for entry in pck.json(desc).values():add(desc,entry['asset_path'])
 desc='world-final/nature/p2-sample-v3/manifest.json';nature=pck.json(desc)
 for entry in nature['chunks']:add(desc,entry['path'],'world-final/nature/p2-sample-v3/')
 for entry in nature['textures'].values():add(desc,entry['path'],'world-final/nature/p2-sample-v3/')
 # The actual cloak dictionary is maintained in runtime code, not a duplicate
 # model list. Its script and the extracted targets must all exist in the PCK.
 desc='scripts/cloak_visual.gd';source=(project/'godot-pc'/desc).read_text(encoding='utf8')
 assets=re.search(r'const ASSETS: Dictionary\s*=\s*\{(.*?)\n\}',source,re.S)
 if not assets:raise ValueError('cloak registry unavailable')
 for path in re.findall(r'"(res://[^"]+\.glb)"',assets[1]):add(desc,path)
 for path in ['world-final/castle/courtyard-p2.glb','world-final/interiors/mine.glb','world-final/interiors/great_cave.glb']:
  add('active environment',path)
 for folder in ['world-expansion-v3/city/motion/assets','world-expansion-v3/city/production']:
  for path in sorted((project/'godot-pc'/folder).glob('*.glb')):add('active NPC folders',folder+'/'+path.name)
 return [{**row,'available':available(pck,row['path'])} for row in rows]

def audit(exe,server_root,project,node,geometry_only=False):
 pck=Pck(exe)
 try:
  failures=[];integrity=[]
  for name,entry in ([] if geometry_only else pck.entries.items()):
   if pck.hash(name)!=entry['md5']:integrity.append(name)
  remaps={name:remap_targets(pck,name) for name in pck.entries if not geometry_only and name.endswith(('.import','.remap'))}
  missing_remaps=[{'file':name,'target':target} for name,targets in remaps.items() for target in targets if target not in pck.entries]
  catalog=[] if geometry_only else catalog_paths(pck,project)
  forbidden=[name for name in pck.entries if any(part in name for part in [
   'cohort-06-10/','alternatives/roach/','-art_review.scn','-roach_qa.scn',
   'scenes/art_review.tscn','scripts/art_review.gd'])]
  retained={path:available(pck,path) for path in ['scripts/stage_acceptance.gd','scripts/p2_pursuit_acceptance.gd','scripts/p2_nature_acceptance.gd']}
  game=pck.json('generated/game.json')
  result=subprocess.run([str(node),'--experimental-strip-types',str(Path(__file__).with_name('audit-packaged-world.mjs')),str(server_root)],capture_output=True,text=True,encoding='utf8',timeout=60)
  if result.returncode:raise ValueError('actual server FinalWorld construction failed; inspect local stderr (not published)')
  server=json.loads(result.stdout.strip());geometry=Path(server.pop('geometryRoot'));files=server.pop('files');comparison=[]
  for relative in files:
   name='world-final/'+relative;external=geometry/relative
   row={'path':name,'pckExists':name in pck.entries,'serverExists':external.is_file()}
   if row['pckExists'] and row['serverExists']:
    row['pckSha256']=pck.hash(name,'sha256');row['serverSha256']=hashlib.file_digest(external.open('rb'),'sha256').hexdigest();row['equal']=row['pckSha256']==row['serverSha256']
   else:row['equal']=False
   comparison.append(row)
  map_equal=game['mapVersion']==server['mapVersion'];population_equal=game.get('populationCapacity')==server['population'] and game.get('populationMode')==server['populationMode']
  if integrity:failures.append('PCK entry checksum')
  if missing_remaps:failures.append('missing import/remap targets')
  if any(not r['available'] for r in catalog):failures.append('active catalog closure')
  if forbidden:failures.append('excluded review/candidate resources present')
  if not all(retained.values()):failures.append('required acceptance resources absent')
  if not all(r['equal'] for r in comparison):failures.append('client/server geometry mismatch')
  if not map_equal or not population_equal:failures.append('client/server map or population mismatch')
  return {'schema':1,'status':'PASS' if not failures else 'FAIL','failures':failures,'exeName':Path(exe).name,
   'scope':'geometry-only' if geometry_only else 'full',
   'skippedChecks':['full EXE SHA','all entry MD5','import/remap closure','active catalog closure'] if geometry_only else [],
   'exeBytes':Path(exe).stat().st_size,'exeSha256':None if geometry_only else hashlib.file_digest(Path(exe).open('rb'),'sha256').hexdigest(),
   'serverDataScope':'packaged-directory' if (server_root/'world-runtime.json').is_file() else 'checkout-before-staging',
   'engineVersion':pck.engine,'pckEntries':len(pck.entries),'checkedEntryMd5':0 if geometry_only else len(pck.entries),'entryMd5Failures':integrity,
   'importRemaps':len(remaps),'missingImportTargets':missing_remaps,'activeCatalogReferences':len(catalog),'catalog':catalog,
   'forbiddenEntries':forbidden,'requiredAcceptance':retained,'server':server,'embeddedMapVersion':game['mapVersion'],
   'mapVersionEqual':map_equal,'populationEqual':population_equal,'sharedGeometryCount':len(comparison),'geometry':comparison,
   'limits':['Resource existence and byte parity do not assess art quality or frame pacing.','Current cloak/NPC source registries select additional resources; active native dependency check remains separate.']}
 finally:pck.close()

if __name__=='__main__':
 parser=argparse.ArgumentParser(description=__doc__)
 parser.add_argument('--exe',type=Path,required=True);parser.add_argument('--server-root',type=Path,required=True)
 parser.add_argument('--project',type=Path,default=Path(__file__).resolve().parents[1]);parser.add_argument('--node',default='node')
 parser.add_argument('--geometry-only',action='store_true',help='Small follow-up against staged server; explicitly omits full EXE/resource re-scan')
 parser.add_argument('--output',type=Path,required=True);args=parser.parse_args()
 if args.output.exists():raise SystemExit('Refusing to overwrite existing audit evidence')
 report=audit(args.exe.resolve(),args.server_root.resolve(),args.project.resolve(),args.node,args.geometry_only)
 args.output.parent.mkdir(parents=True,exist_ok=True);args.output.write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n',encoding='utf8')
 print(json.dumps({k:report[k] for k in ['status','pckEntries','checkedEntryMd5','activeCatalogReferences','sharedGeometryCount','mapVersionEqual','populationEqual','failures']}))
 raise SystemExit(0 if report['status']=='PASS' else 2)
