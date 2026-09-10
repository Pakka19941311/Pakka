"""Store actual native/GLB outputs in verified Git-sized parts; never regenerate them.
No personal saves, engine caches or third-party data are included.
"""
from pathlib import Path
import hashlib,json,zipfile

ROOT=Path(__file__).resolve().parents[2]
PAYLOAD=ROOT/'art/world-final/payload'

def package():
    geo=ROOT/'godot-pc/world-final/geography'
    files=sorted([*geo.rglob('*.glb'),geo/'heightmap.f32',geo/'terrain-data.npz',geo/'terrain.json',geo/'collision.json',geo/'support-surfaces.json',
                  *sorted((ROOT/'art/world-final').glob('*.blend'))])
    manifest_path=ROOT/'art/world-final/payload-manifest.json'
    previous=json.loads(manifest_path.read_text('utf-8')) if manifest_path.exists() else None
    layers=(previous['layers'] if previous['schema']==2 else [{k:previous[k] for k in ('archive_sha256','parts','files')}]) if previous else []
    known={entry['path']:entry for layer in layers for entry in layer['files']}
    files=[p for p in files if hashlib.sha256(p.read_bytes()).hexdigest()!=known.get(p.relative_to(ROOT).as_posix(),{}).get('sha256')]
    if not files:print(json.dumps({'changed_files':0,'layers':len(layers)}));return
    revision=json.loads((ROOT/'godot-pc/world-final/world_layout.json').read_text('utf-8'))['revision']
    tag='geography-'+revision+'-'+str(len(layers)+1)
    archive=ROOT/'qa-artifacts/world-final'/(tag+'.zip')
    archive.parent.mkdir(parents=True,exist_ok=True)
    entries=[]
    with zipfile.ZipFile(archive,'w',compression=zipfile.ZIP_DEFLATED,compresslevel=6) as z:
        for path in files:
            rel=path.relative_to(ROOT).as_posix();data=path.read_bytes()
            info=zipfile.ZipInfo(rel,date_time=(2026,9,10,0,0,0));info.compress_type=zipfile.ZIP_DEFLATED
            z.writestr(info,data)
            entries.append({'path':rel,'bytes':len(data),'sha256':hashlib.sha256(data).hexdigest()})
    PAYLOAD.mkdir(parents=True,exist_ok=True)
    parts=[]
    with archive.open('rb') as f:
        i=0
        while data:=f.read(3*1024*1024):
            target=PAYLOAD/f'{tag}.part{i:03}'
            # Refuse to replace a previously published payload silently.
            if target.exists() and target.read_bytes()!=data:raise RuntimeError('Version the payload before replacing existing parts')
            target.write_bytes(data)
            parts.append({'path':target.relative_to(ROOT).as_posix(),'bytes':len(data),'sha256':hashlib.sha256(data).hexdigest()});i+=1
    layers.append({'revision':revision,'archive_sha256':hashlib.sha256(archive.read_bytes()).hexdigest(),'parts':parts,'files':entries})
    known.update({entry['path']:entry for entry in entries})
    manifest={'schema':2,'content':'Immutable layers of actual Blender masters and exported GLBs; latest file wins',
              'archive_format':'ZIP, concatenate each layer parts in order','layers':layers,'files':[known[k] for k in sorted(known)]}
    manifest_path.write_text(json.dumps(manifest,indent=2)+'\n',encoding='utf-8',newline='\n')
    print(json.dumps({'changed_files':len(files),'parts_added':len(parts),'archive_bytes':archive.stat().st_size,'layers':len(layers)}),flush=True)

if __name__=='__main__':package()
