"""Recover the closed D13 archive after interrupted disk-full part writing.

Existing mismatched partial bytes are backed up, never discarded. All archive
members must still equal their working source before publishing the layer.
"""
from pathlib import Path
import hashlib, json, shutil, subprocess, tarfile

ROOT=Path(__file__).resolve().parents[2]
def sha(b): return hashlib.sha256(b).hexdigest()
backup=ROOT.parents[1]/'outputs/world-preview-recovery'
backup.mkdir(parents=True,exist_ok=True)
paths=subprocess.check_output(['git','ls-files','--modified','--others','--exclude-standard','-z'],cwd=ROOT).decode().split('\0')
paths += ['art/world-final/Varendor_Ancient_Tree_D-14.blend','godot-pc/world-final/nature/assets/ancient_tree_D14.glb']
records=[]
for name in sorted(set(paths)):
    if not name or name.startswith('scripts/__pycache__/'):continue
    source=ROOT/name
    if not source.is_file():continue
    target=backup/name;target.parent.mkdir(parents=True,exist_ok=True)
    if target.exists():assert sha(target.read_bytes())==sha(source.read_bytes()),name
    else:shutil.copy2(source,target)
    records.append({'path':name,'sha256':sha(source.read_bytes()),'bytes':source.stat().st_size})
(backup/'manifest.json').write_text(json.dumps(records,indent=2)+'\n',encoding='utf-8')
archive=ROOT/'qa-artifacts/world-final/world-geology-D13-9.tar.xz'
manifest_path=ROOT/'art/world-final/payload-manifest.json'
manifest=json.loads(manifest_path.read_text('utf-8'))
assert len(manifest['layers'])==8
entries=[]
with tarfile.open(archive,'r:xz') as tar:
    for member in tar:
        assert member.isfile() and (ROOT/member.name).resolve().is_relative_to(ROOT)
        data=tar.extractfile(member).read()
        assert data==(ROOT/member.name).read_bytes(),member.name
        entries.append({'path':member.name,'bytes':len(data),'sha256':sha(data)})
parts=[]
with archive.open('rb') as stream:
    i=0
    while data:=stream.read(3*1024*1024):
        target=ROOT/f'art/world-final/payload/world-geology-D13-9.part{i:03}'
        if target.exists() and target.read_bytes()!=data:
            assert (backup/target.relative_to(ROOT)).read_bytes()==target.read_bytes()
        target.write_bytes(data)
        parts.append({'path':target.relative_to(ROOT).as_posix(),'bytes':len(data),'sha256':sha(data)});i+=1
manifest['layers'].append({'revision':'geology-D13','format':'tar.xz','archive_sha256':sha(archive.read_bytes()),'parts':parts,'files':entries})
known={e['path']:e for layer in manifest['layers'] for e in layer['files']}
manifest['files']=[known[k] for k in sorted(known)]
manifest_path.write_text(json.dumps(manifest,indent=2)+'\n',encoding='utf-8')
print(json.dumps({'backup':str(backup),'backed_up_files':len(records),'archive_verified':True,'files_added':len(entries),'parts':len(parts),'total_files':len(known)}))
