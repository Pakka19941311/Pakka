"""Run the standalone knight art script with the existing pinned Blender."""

import hashlib
import json
import os
from pathlib import Path
import shutil
import subprocess
import tarfile
import urllib.request


def main():
    root = Path(__file__).resolve().parents[2]
    pins = json.loads(
        (root / 'docs/migration/p0/evidence/toolchain-distributions.json').read_text()
    )
    pin = pins['blender']
    tools = Path(os.environ['RUNNER_TEMP']) / 'varendor-knight-blender'
    tools.mkdir(parents=True, exist_ok=True)
    archive = tools / 'blender.tar.xz'
    request = urllib.request.Request(
        pin['url'], headers={'User-Agent': 'Varendor-Knight-Art-Review'}
    )
    print('Downloading pinned Blender 4.5.9', flush=True)
    with urllib.request.urlopen(request, timeout=120) as response, archive.open('wb') as target:
        shutil.copyfileobj(response, target, length=1024 * 1024)
    with archive.open('rb') as stream:
        digest = hashlib.file_digest(stream, 'sha256').hexdigest()
    if digest != pin['sha256']:
        raise RuntimeError('Blender SHA-256 mismatch')
    with tarfile.open(archive) as package:
        package.extractall(tools, filter='data')
    blender = tools / 'blender-4.5.9-linux-x64/blender'
    output = root / 'knight-review'
    output.mkdir(parents=True, exist_ok=True)
    (output / 'toolchain.json').write_text(json.dumps({
        'blender': '4.5.9', 'sha256': digest,
        'source_commit': os.environ.get('GITHUB_SHA'),
        'scope': 'new knight stage 1 art only',
    }, indent=2) + '\n')
    subprocess.run([
        str(blender), '--background', '--factory-startup', '--threads', '4',
        '--python-exit-code', '1', '--python',
        str(root / 'art/knight-stage1/create_knight.py'),
        '--', '--output', str(output),
    ], cwd=root, check=True)


if __name__ == '__main__':
    main()
