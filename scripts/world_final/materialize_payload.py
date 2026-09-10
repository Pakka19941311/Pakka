"""Restore verified immutable payload layers, preserving unknown/manual changes."""
from pathlib import Path
import hashlib,io,json,zipfile,argparse

ROOT=Path(__file__).resolve().parents[2]

def sha(data):return hashlib.sha256(data).hexdigest()

def restore(destination=ROOT):
    manifest=json.loads((ROOT/'art/world-final/payload-manifest.json').read_text('utf-8'))
    layers=manifest['layers'] if manifest['schema']==2 else [manifest]
    final={};known={}
    # Validate all bytes before touching destination, including superseded layers.
    for layer in layers:
        chunks=[]
        for part in layer['parts']:
            b=(ROOT/part['path']).read_bytes()
            assert len(b)==part['bytes'] and sha(b)==part['sha256'],part['path']
            chunks.append(b)
        data=b''.join(chunks)
        assert sha(data)==layer['archive_sha256']
        expected={entry['path']:entry for entry in layer['files']}
        with zipfile.ZipFile(io.BytesIO(data)) as z:
            assert set(z.namelist())==set(expected)
            for name in z.namelist():
                target=(destination/name).resolve()
                assert target.is_relative_to(destination.resolve()) and not Path(name).is_absolute()
                entry=expected[name];b=z.read(name)
                assert len(b)==entry['bytes'] and sha(b)==entry['sha256'],name
                known.setdefault(name,set()).add(entry['sha256'])
                final[name]=(entry,b)
    assert {name:e for name,(e,b) in final.items()}=={e['path']:e for e in manifest['files']}
    for name,(entry,b) in final.items():
        target=destination/name
        if target.exists() and sha(target.read_bytes()) not in known[name]:
            raise RuntimeError('Manual/newer file preserved; resolve this conflict explicitly: '+str(target))
    restored=upgraded=0
    for name,(entry,b) in final.items():
        target=destination/name
        if not target.exists():
            target.parent.mkdir(parents=True,exist_ok=True);target.write_bytes(b);restored+=1
        elif sha(target.read_bytes())!=entry['sha256']:
            # Only a cryptographically recognized published predecessor is safe.
            target.write_bytes(b);upgraded+=1
    result={'verified_files':len(final),'layers':len(layers),'restored_missing_files':restored,'known_predecessors_upgraded':upgraded,'manual_files_overwritten':0}
    print(json.dumps(result));return result

if __name__=='__main__':
    parser=argparse.ArgumentParser();parser.add_argument('--destination',type=Path,default=ROOT)
    args=parser.parse_args();restore(args.destination.resolve())
