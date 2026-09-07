"""Install exact previously recorded desktop build tools in CI."""
import hashlib
import json
import os
from pathlib import Path
import tarfile
import urllib.request
import zipfile

root = Path(__file__).resolve().parents[1]
pins = json.loads((root/'docs/migration/p0/evidence/toolchain-distributions.json').read_text())
destination = Path(os.environ.get('RUNNER_TEMP', '/tmp'))/'varendor-pc-tools'
destination.mkdir(parents=True, exist_ok=True)
paths = {}
for kind, extension in [('godot', 'zip'), ('export_templates', 'tpz'), ('blender', 'tar.xz')]:
    pin = pins[kind]
    archive = destination/(kind+'.'+extension)
    if not archive.exists():
        with urllib.request.urlopen(pin['url'], timeout=120) as response, archive.open('wb') as target:
            while chunk := response.read(1024*1024): target.write(chunk)
    with archive.open('rb') as stream: digest = hashlib.file_digest(stream, 'sha256').hexdigest()
    if digest != pin['sha256']: raise RuntimeError(kind+' SHA-256 mismatch')
    if kind == 'blender':
        with tarfile.open(archive) as package: package.extractall(destination, filter='data')
        paths['BLENDER'] = str(destination/'blender-4.5.9-linux-x64/blender')
    elif kind == 'godot':
        with zipfile.ZipFile(archive) as package: package.extractall(destination)
        executable = destination/'Godot_v4.6.3-stable_linux.x86_64'
        executable.chmod(0o755)
        paths['GODOT'] = str(executable)
    else:
        templates = Path.home()/'.local/share/godot/export_templates/4.6.3.stable'
        templates.mkdir(parents=True, exist_ok=True)
        with zipfile.ZipFile(archive) as package:
            for name in ['linux_release.x86_64', 'linux_debug.x86_64', 'windows_release_x86_64.exe', 'windows_debug_x86_64.exe', 'version.txt']:
                (templates/name).write_bytes(package.read('templates/'+name))
for key, value in paths.items(): print(key+'='+value)
if os.environ.get('GITHUB_ENV'):
    with open(os.environ['GITHUB_ENV'], 'a') as file:
        for key, value in paths.items(): file.write(key+'='+value+'\n')
