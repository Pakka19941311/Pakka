"""Restore verified native/GLB payload from Git without overwriting manual work."""
from pathlib import Path
import hashlib,io,json,zipfile

ROOT=Path(__file__).resolve().parents[2]

def restore():
    manifest=json.loads((ROOT/'art/world-final/payload-manifest.json').read_text('utf-8'))
    chunks=[]
    for part in manifest['parts']:
        b=(ROOT/part['path']).read_bytes()
        assert len(b)==part['bytes'] and hashlib.sha256(b).hexdigest()==part['sha256'],part['path']
        chunks.append(b)
    data=b''.join(chunks)
    assert hashlib.sha256(data).hexdigest()==manifest['archive_sha256']
    expected={entry['path']:entry for entry in manifest['files']}
    with zipfile.ZipFile(io.BytesIO(data)) as z:
        assert set(z.namelist())==set(expected)
        # Preflight every member and existing file before writing anything.
        for name in z.namelist():
            target=(ROOT/name).resolve()
            assert target.is_relative_to(ROOT) and not Path(name).is_absolute()
            entry=expected[name];b=z.read(name)
            assert len(b)==entry['bytes'] and hashlib.sha256(b).hexdigest()==entry['sha256'],name
            if target.exists() and hashlib.sha256(target.read_bytes()).hexdigest()!=entry['sha256']:
                raise RuntimeError('Manual/newer file preserved; resolve this conflict explicitly: '+str(target))
        restored=0
        for name in z.namelist():
            target=ROOT/name
            if not target.exists():
                target.parent.mkdir(parents=True,exist_ok=True);target.write_bytes(z.read(name));restored+=1
    print(json.dumps({'verified_files':len(expected),'restored_missing_files':restored,'manual_files_overwritten':0}))

if __name__=='__main__':restore()
