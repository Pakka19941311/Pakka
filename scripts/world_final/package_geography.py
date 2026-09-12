"""Store actual native/GLB outputs in verified Git-sized parts; never regenerate them.
No personal saves, engine caches or third-party data are included.
"""
from pathlib import Path
import argparse,hashlib,json,zipfile,tarfile,lzma

ROOT=Path(__file__).resolve().parents[2]
PAYLOAD=ROOT/'art/world-final/payload'

def package(label=None,solid=False,only_paths=None):
    geo=ROOT/'godot-pc/world-final/geography'
    interiors=ROOT/'godot-pc/world-final/interiors'
    nature=ROOT/'godot-pc/world-final/nature'
    nature_source=ROOT/'art/world-final/nature-source'
    candidates=[]
    for directory in (ROOT/'godot-pc/world-final').glob('geology-D*'):
        candidates.extend([*directory.rglob('*.glb'),*directory.glob('*.f32'),*directory.glob('*.npz'),*directory.glob('*.json')])
    files=sorted([*geo.rglob('*.glb'),geo/'heightmap.f32',geo/'terrain-data.npz',geo/'terrain.json',geo/'collision.json',geo/'support-surfaces.json',
                  *interiors.glob('*.glb'),*interiors.glob('*.f32'),*interiors.glob('*.json'),*interiors.glob('*.tres'),
                  *nature.rglob('*.glb'),*nature.glob('*.json'),
                  *nature_source.rglob('*.bin'),*nature_source.rglob('*.glb'),*candidates,
                  *sorted((ROOT/'art/world-final').glob('*.blend'))])
    if only_paths is not None:
        # A bounded release delta can be recorded without rescanning every
        # historical Blender master. Explicit paths still stay inside the repo.
        assert isinstance(only_paths,list) and only_paths, 'Nonempty JSON path list required'
        assert all(isinstance(name,str) and not Path(name).is_absolute() for name in only_paths)
        files=sorted({(ROOT/name).resolve() for name in only_paths})
        assert all(path.is_relative_to(ROOT.resolve()) and path.is_file() for path in files), 'Payload source outside repository or missing'
        assert all(path.suffix.lower() in ('.glb','.f32','.npz','.json','.blend','.tres') for path in files), 'Unexpected payload file type'
    manifest_path=ROOT/'art/world-final/payload-manifest.json'
    previous=json.loads(manifest_path.read_text('utf-8')) if manifest_path.exists() else None
    layers=(previous['layers'] if previous['schema']==2 else [{k:previous[k] for k in ('archive_sha256','parts','files')}]) if previous else []
    known={entry['path']:entry for layer in layers for entry in layer['files']}
    files=[p for p in files if hashlib.sha256(p.read_bytes()).hexdigest()!=known.get(p.relative_to(ROOT).as_posix(),{}).get('sha256')]
    if not files:print(json.dumps({'changed_files':0,'layers':len(layers)}));return
    revision=json.loads((ROOT/'godot-pc/world-final/world_layout.json').read_text('utf-8'))['revision']
    if label:
        assert all(c.isalnum() or c in '-_' for c in label), 'Use a plain version label'
        revision=label
    tag='world-'+revision+'-'+str(len(layers)+1)
    archive=ROOT/'qa-artifacts/world-final'/(tag+('.tar.xz' if solid else '.zip'))
    archive.parent.mkdir(parents=True,exist_ok=True)
    entries=[]
    for path in files:
        data=path.read_bytes();entries.append({'path':path.relative_to(ROOT).as_posix(),'bytes':len(data),'sha256':hashlib.sha256(data).hexdigest()})
    if solid:
        # A shared dictionary avoids duplicating unchanged packed images across
        # preserved native versions. No source file is transformed or removed.
        with lzma.open(archive,'wb',preset=9) as stream:
            with tarfile.open(fileobj=stream,mode='w|',format=tarfile.USTAR_FORMAT) as tar:
                for path,entry in zip(files,entries):
                    info=tarfile.TarInfo(entry['path']);info.size=entry['bytes'];info.mtime=1788998400;info.mode=0o644
                    with path.open('rb') as source:tar.addfile(info,source)
    else:
        with zipfile.ZipFile(archive,'w',compression=zipfile.ZIP_DEFLATED,compresslevel=6) as z:
            for path,entry in zip(files,entries):
                info=zipfile.ZipInfo(entry['path'],date_time=(2026,9,10,0,0,0));info.compress_type=zipfile.ZIP_DEFLATED
                z.writestr(info,path.read_bytes())
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
    layers.append({'revision':revision,'format':'tar.xz' if solid else 'zip','archive_sha256':hashlib.sha256(archive.read_bytes()).hexdigest(),'parts':parts,'files':entries})
    known.update({entry['path']:entry for entry in entries})
    manifest={'schema':2,'content':'Immutable layers of actual Blender masters and exported GLBs; latest file wins',
              'archive_format':'Concatenate each layer parts in order; format defaults to zip for legacy layers','layers':layers,'files':[known[k] for k in sorted(known)]}
    manifest_path.write_text(json.dumps(manifest,indent=2)+'\n',encoding='utf-8',newline='\n')
    print(json.dumps({'changed_files':len(files),'parts_added':len(parts),'archive_bytes':archive.stat().st_size,'layers':len(layers)}),flush=True)

if __name__=='__main__':
    parser=argparse.ArgumentParser();parser.add_argument('--label');parser.add_argument('--solid',action='store_true');parser.add_argument('--paths-file',type=Path)
    args=parser.parse_args();package(args.label,args.solid,json.loads(args.paths_file.read_text('utf-8')) if args.paths_file else None)
