"""Package the knight appearance review and verify its published ZIP bytes."""

import argparse
import hashlib
import json
import os
from pathlib import Path
import time
import urllib.error
import urllib.request
import zipfile


ROOT = Path(__file__).resolve().parents[2]
OUTPUT = ROOT / 'knight-review'
SOURCE = os.environ['GITHUB_SHA']
NAME = f'Varendor_Knight_01_{SOURCE[:12]}'
ZIP_PATH = OUTPUT / f'{NAME}.zip'
TAG = f'knight-art-review-{SOURCE[:12]}'
RENDERS = ['01_three_quarter.png', '02_front.png', '03_back.png', '04_armor_detail.png']


def digest_file(path):
    with path.open('rb') as stream:
        return hashlib.file_digest(stream, 'sha256').hexdigest()


def package():
    files = [OUTPUT / name for name in [
        'Varendor_Knight_01.blend', *RENDERS, 'model-info.json', 'toolchain.json',
    ]]
    files.extend(ROOT / 'art/knight-stage1' / name for name in [
        'README_RU.md', 'create_knight.py',
    ])
    for path in files:
        if not path.is_file() or path.stat().st_size == 0:
            raise RuntimeError(f'Required knight review output missing or empty: {path.name}')
    with zipfile.ZipFile(ZIP_PATH, 'w', zipfile.ZIP_DEFLATED, compresslevel=6) as archive:
        for path in files:
            archive.write(path, f'{NAME}/{path.name}')
    with zipfile.ZipFile(ZIP_PATH) as archive:
        damaged = archive.testzip()
        if damaged:
            raise RuntimeError(f'ZIP CRC failed: {damaged}')
    digest = digest_file(ZIP_PATH)
    sha_path = OUTPUT / f'{ZIP_PATH.name}.sha256'
    sha_path.write_text(f'{digest}  {ZIP_PATH.name}\n')
    (OUTPUT / 'release-notes.md').write_text(
        'Varendor — новый рыцарь, этап 1: согласование внешности.\n\n'
        'В ZIP: редактируемая модель Blender, одежда, броня, меч и щит, '
        'четыре рендера, исходный скрипт создания и инструкция.\n\n'
        'Это отдельный арт-пакет для визуального согласования, не обновление игры. '
        'Модель пока без скелета и анимаций; интеграция в игровой клиент не выполнялась.\n\n'
        f'Исходный коммит: `{SOURCE}`. Blender 4.5.9.\n',
        encoding='utf-8',
    )
    values = {'zip_name': ZIP_PATH.name, 'sha_name': sha_path.name, 'tag': TAG}
    with open(os.environ['GITHUB_OUTPUT'], 'a') as output:
        for key, value in values.items():
            output.write(f'{key}={value}\n')
    print('KNIGHT_PACKAGE ' + json.dumps({**values, 'sha256': digest, 'bytes': ZIP_PATH.stat().st_size}))


def verify_public_download():
    repo = os.environ['GITHUB_REPOSITORY']
    url = f'https://github.com/{repo}/releases/download/{TAG}/{ZIP_PATH.name}'
    expected = digest_file(ZIP_PATH)
    # Give the public download endpoint a short opportunity to become available.
    for attempt in range(3):
        try:
            digest = hashlib.sha256()
            byte_count = 0
            request = urllib.request.Request(url, headers={'User-Agent': 'Varendor-Knight-Review'})
            with urllib.request.urlopen(request, timeout=120) as response:
                while chunk := response.read(1024 * 1024):
                    digest.update(chunk)
                    byte_count += len(chunk)
            break
        except (urllib.error.URLError, TimeoutError):
            if attempt == 2:
                raise
            time.sleep(3 * (attempt + 1))
    if digest.hexdigest() != expected or byte_count != ZIP_PATH.stat().st_size:
        raise RuntimeError('Public knight review ZIP SHA-256 or size mismatch')
    result = {
        'source_commit': SOURCE, 'tag': TAG, 'download_url': url,
        'release_url': f'https://github.com/{repo}/releases/tag/{TAG}',
        'sha256': expected, 'bytes': byte_count, 'download_verified': True,
        'stage': 'appearance review; not rigged or animated; no game update',
    }
    (OUTPUT / 'release-result.json').write_text(json.dumps(result, indent=2) + '\n')
    print('KNIGHT_RELEASE_RESULT ' + json.dumps(result))


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--verify-download', action='store_true')
    args = parser.parse_args()
    if args.verify_download:
        verify_public_download()
    else:
        package()
