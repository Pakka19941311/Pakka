"""Publish compact, honest D14 render diagnostics; never claim final art quality."""
from pathlib import Path
import hashlib
import json
import os
import subprocess
import zipfile

root = Path(__file__).resolve().parents[2]
output = root / 'qa-artifacts/world-final'
source = subprocess.check_output(['git', 'rev-parse', 'HEAD'], cwd=root, text=True).strip()
files = sorted(path for directory in ['d14-import', 'd14-launch', 'd14-images', 'd15-launch', 'd15-images', 'd14-native']
               for path in (output / directory).rglob('*') if path.is_file())
record = {
    'source_commit': source,
    'workflow_outcome': os.environ.get('REVIEW_OUTCOME', 'unknown'),
    'surface_outcome': os.environ.get('SURFACE_OUTCOME', 'not-run'),
    'native_outcome': os.environ.get('NATIVE_OUTCOME', 'not-run'),
    'renderer_profile': 'Godot 4.6.3, GL compatibility, Linux Xvfb, Mesa software rendering',
    'owner_windows_gpu_test': False,
    'final_art_acceptance': False,
    'files': [{'path': p.relative_to(output).as_posix(), 'bytes': p.stat().st_size,
               'sha256': hashlib.sha256(p.read_bytes()).hexdigest()} for p in files],
}
with zipfile.ZipFile(output / 'nature-review.zip', 'w', zipfile.ZIP_DEFLATED) as archive:
    for path in files: archive.write(path, path.relative_to(output))
    archive.writestr('provenance.json', json.dumps(record, indent=2) + '\n')
(output / 'nature-review-notes.md').write_text(
    'D14 native render diagnostics. **Not a game build or final-world acceptance.**\n\n'
    f'Source: `{source}`. Motion check outcome: **{record["workflow_outcome"]}**.\n\n'
    'Includes actual captured frames and bounded launch logs, including failures. '
    'Linux Mesa software rendering is not a performance measurement of the owner\'s Windows GPU.\n',
    encoding='utf-8')
print(json.dumps({'source_commit': source, 'files': len(files), 'outcome': record['workflow_outcome']}))
