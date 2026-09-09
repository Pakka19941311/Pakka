"""Restore the exact unfinished v3 .blend/GLB from the accepted Git payloads.

No network, LFS, Blender rebuild, balance change or quality conversion occurs.
The immutable v2 source archive also supplies all original textures.
"""
import hashlib
import json
import os
import shutil
import subprocess
import tempfile
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def digest(path):
    with path.open('rb') as stream:
        return hashlib.file_digest(stream, 'sha256').hexdigest()


def verify(path, size, sha):
    if path.stat().st_size != size or digest(path) != sha:
        raise RuntimeError('Size/SHA-256 mismatch: ' + str(path))


def assemble(entry, destination):
    destination.parent.mkdir(parents=True, exist_ok=True)
    with destination.open('wb') as out:
        for part in entry['parts']:
            source = ROOT / part['path']
            verify(source, part['bytes'], part['sha256'])
            with source.open('rb') as stream:
                shutil.copyfileobj(stream, out)
    verify(destination, entry['bytes'], entry['sha256'])


def main():
    base = json.loads((ROOT / 'art/knight-v2/assets-manifest.json').read_text())
    checkpoint = json.loads((ROOT / 'art/character-v3/checkpoint-assets.json').read_text())
    archive = ROOT / base['files']['source']['destination']
    entry = base['files']['source']
    if not archive.exists() or digest(archive) != entry['sha256']:
        assemble(entry, archive)
    verify(archive, entry['bytes'], entry['sha256'])
    restored = ROOT / 'art/character-v3/restored'
    restored.mkdir(parents=True, exist_ok=True)
    reports = []
    with zipfile.ZipFile(archive) as source_zip:
        for name, entry in checkpoint['files'].items():
            destination = ROOT / entry['destination']
            destination.parent.mkdir(parents=True, exist_ok=True)
            # Explicit workspace directory: never read or replace a user save.
            with tempfile.TemporaryDirectory(prefix='restore-', dir=restored) as temp:
                temp = Path(temp)
                original = temp / 'asset.bin'
                if name == 'master':
                    with source_zip.open(entry['baseSourceMember']) as stream, original.open('wb') as out:
                        shutil.copyfileobj(stream, out)
                else:
                    assemble(base['files']['runtime'], original)
                verify(original, entry['baseBytes'], entry['baseSha256'])
                patch = temp / 'forward.patch'
                assemble({'parts': entry['parts'], 'bytes': entry['patchBytes'],
                          'sha256': entry['patchSha256']}, patch)
                # Apply only to this disposable file, independently of the
                # enclosing checkout and its index/worktree configuration.
                env = dict(os.environ, GIT_CEILING_DIRECTORIES=str(restored))
                env.pop('GIT_DIR', None)
                env.pop('GIT_WORK_TREE', None)
                subprocess.run(['git', 'apply', '--binary', str(patch)], cwd=temp, env=env, check=True)
                verify(original, entry['bytes'], entry['sha256'])
                shutil.copyfile(original, destination)
                verify(destination, entry['bytes'], entry['sha256'])
            reports.append({'asset': name, 'path': str(destination.relative_to(ROOT)),
                            'bytes': entry['bytes'], 'sha256': entry['sha256']})
        # Images are already packed into the exact .blend; these are the
        # separate original texture files for subsequent editing.
        textures = restored / 'Textures'
        textures.mkdir(parents=True, exist_ok=True)
        prefix = 'knight-v2/output/Textures/'
        texture_count = 0
        for member in source_zip.infolist():
            if not member.filename.startswith(prefix) or member.is_dir():
                continue
            name = member.filename[len(prefix):]
            if '/' in name or '\\' in name or name in ('', '.', '..'):
                raise RuntimeError('Unexpected texture archive path')
            with source_zip.open(member) as stream, (textures / name).open('wb') as out:
                shutil.copyfileobj(stream, out)
            texture_count += 1
    print(json.dumps({'status': checkpoint['status'], 'files': reports,
                      'originalTextures': texture_count}, ensure_ascii=False))


if __name__ == '__main__':
    main()
