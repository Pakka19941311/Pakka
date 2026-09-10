"""Store actual native/GLB outputs in verified Git-sized parts; never regenerate them.
No personal saves, engine caches or third-party data are included.
"""
from pathlib import Path
import hashlib,json,zipfile

ROOT=Path(__file__).resolve().parents[2]
PAYLOAD=ROOT/'art/world-final/payload'

def package():
    geo=ROOT/'godot-pc/world-final/geography'
    files=sorted([*geo.rglob('*.glb'),geo/'heightmap.f32',geo/'terrain-data.npz',geo/'terrain.json',
                  *sorted((ROOT/'art/world-final').glob('*.blend'))])
    archive=ROOT/'qa-artifacts/world-final/geography-sources.zip'
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
            target=PAYLOAD/f'geography.part{i:03}'
            # Refuse to replace a previously published payload silently.
            if target.exists() and target.read_bytes()!=data:raise RuntimeError('Version the payload before replacing existing parts')
            target.write_bytes(data)
            parts.append({'path':target.relative_to(ROOT).as_posix(),'bytes':len(data),'sha256':hashlib.sha256(data).hexdigest()});i+=1
    manifest={'schema':1,'content':'Actual Blender masters and exported GLBs, not just generation scripts',
              'archive_format':'ZIP, concatenate parts in order','archive_sha256':hashlib.sha256(archive.read_bytes()).hexdigest(),
              'parts':parts,'files':entries}
    (ROOT/'art/world-final/payload-manifest.json').write_text(json.dumps(manifest,indent=2)+'\n',encoding='utf-8')
    print(json.dumps({'files':len(files),'parts':len(parts),'archive_bytes':archive.stat().st_size}),flush=True)

if __name__=='__main__':package()
