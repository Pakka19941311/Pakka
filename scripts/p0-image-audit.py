"""Read-only image decode audit for P0; prints failures and never repairs assets."""
import hashlib
import json
import struct
import subprocess
from pathlib import Path
from PIL import Image, __version__ as pillow_version

ROOT = Path(__file__).resolve().parents[1]
failed = []
passed = 0
for path in sorted((ROOT/'public/assets').rglob('*')):
    if path.suffix.lower() not in {'.png', '.jpg', '.jpeg', '.webp'}:
        continue
    try:
        with Image.open(path) as image:
            image.load()
        passed += 1
    except Exception as error:
        failed.append({'path':str(path.relative_to(ROOT)), 'bytes':path.stat().st_size,
                       'sha256':hashlib.sha256(path.read_bytes()).hexdigest(), 'error':str(error),
                       'referenced_by':[]})
for path in sorted((ROOT/'public/assets').rglob('*')):
    if path.suffix.lower() not in {'.glb', '.gltf'}:
        continue
    if path.suffix.lower() == '.glb':
        data = path.read_bytes()
        length = struct.unpack_from('<I', data, 12)[0]
        document = json.loads(data[20:20+length])
    else:
        document = json.loads(path.read_text())
    for image in document.get('images', []):
        uri = image.get('uri', '')
        if not uri or uri.startswith('data:'):
            continue
        resolved = (path.parent/uri).resolve()
        for failure in failed:
            if resolved == ROOT/failure['path']:
                failure['referenced_by'].append(str(path.relative_to(ROOT)))
report = {'source_commit':subprocess.check_output(['git','-C',str(ROOT),'rev-parse','HEAD'],text=True).strip(),
          'pillow_version':pillow_version, 'passed':passed, 'failed':len(failed), 'failures':failed,
          'checks':'Full image decode; reference presence alone does not establish image validity.',
          'personal_data_accessed':False, 'repairs_applied':False}
(ROOT/'docs/migration/p0/evidence/image-decode-audit.json').write_text(json.dumps(report,indent=2)+'\n')
print(json.dumps(report,indent=2))
raise SystemExit(1 if failed else 0)
