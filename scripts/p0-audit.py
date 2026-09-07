"""Read-only inventory of the pre-migration baseline; never reads player saves."""
import hashlib
import json
import subprocess
import io
import tarfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
BASE = '88838a79c9b544a7918ac1064568d00ed4d57be4'
OUT = ROOT / 'docs/migration/p0/evidence'

def git(*args):
    return subprocess.check_output(['git', '-C', str(ROOT), *args])

def digest(data):
    return hashlib.sha256(data).hexdigest()

baseline = json.loads((ROOT / 'docs/migration/v2/BASELINE.json').read_text())
checks = []
for entry in baseline['source_fingerprints']:
    data = (ROOT / entry['path']).read_bytes()
    checks.append({**entry, 'observed_sha256': digest(data),
                   'match': len(data) == entry['bytes'] and digest(data) == entry['sha256']})
files = []
with tarfile.open(fileobj=io.BytesIO(git('archive', BASE))) as archive:
    for member in archive:
        if not member.isfile():
            continue
        data = archive.extractfile(member).read()
        files.append({'path': member.name, 'bytes': len(data), 'sha256': digest(data),
                      'lfs_pointer': data.startswith(b'version https://git-lfs.github.com/spec/v1')})
source_manifest = json.loads((ROOT / 'docs/assets/world-source-manifest.json').read_text())
sources = [{'path': 'world-source/' + f['path'], 'url': f['url'],
            'available_in_git_checkout': (ROOT / 'world-source' / f['path']).is_file()}
           for f in source_manifest['files']]
report = {
    'source_commit': BASE,
    'baseline_fingerprints': checks,
    'baseline_fingerprints_match': all(c['match'] for c in checks),
    'tracked_file_count': len(files),
    'tracked_bytes': sum(f['bytes'] for f in files),
    'asset_file_count': sum(f['path'].startswith('public/assets/') for f in files),
    'asset_bytes': sum(f['bytes'] for f in files if f['path'].startswith('public/assets/')),
    'lfs_pointers': [f['path'] for f in files if f['lfs_pointer']],
    'submodules': git('ls-tree', '-r', BASE).decode().count('160000 commit'),
    'blend_sources': [f['path'] for f in files if f['path'].endswith('.blend')],
    'source_downloads': sources,
    'files': files,
    'limitations': ['Files at world-source URLs are not claimed present or redownloaded.',
                    'Runtime derivatives are checked separately by scripts/verify-assets.mjs.',
                    'No user database, browser secret or player inventory was accessed.'],
}
OUT.mkdir(parents=True, exist_ok=True)
(OUT / 'source-inventory.json').write_text(json.dumps(report, ensure_ascii=False, indent=2) + '\n')
print(json.dumps({k: report[k] for k in ['source_commit', 'baseline_fingerprints_match',
    'tracked_file_count', 'tracked_bytes', 'asset_file_count', 'asset_bytes',
    'lfs_pointers', 'submodules', 'blend_sources']}, indent=2))
if not report['baseline_fingerprints_match']:
    raise SystemExit('Baseline mismatch; see evidence. No files reverted.')
