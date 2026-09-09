"""Restore the unchanged approved authored world and P1 package inputs.

This does not rebuild or redesign world geometry. A cache miss re-exports the
packed accepted Blender scene with the pinned Blender toolchain.
"""
from pathlib import Path
import argparse
import hashlib
import json
import os
import shutil
import subprocess
import urllib.request
import zipfile

ROOT = Path(__file__).resolve().parents[1]
WINDOWS = {
    'filename': 'accepted-windows-6ccf.zip',
    'url': 'https://github.com/Pakka19941311/Pakka/releases/download/godot-pc-preview-6ccf00bdb3fc/Varendor_Godot_PC_6ccf00bdb3fc.zip',
    'bytes': 334375217,
    'sha256': '5bdd53a1ef2476213784ad4046cecc8a440eac590453ab623ad94e1e2cee5a15',
}
WORLD = {
    'filename': 'accepted-world-c0f4.zip',
    'url': 'https://github.com/Pakka19941311/Pakka/releases/download/godot-pc-preview-c0f4d7809af9/Varendor_World_Source.zip',
    'bytes': 200707489,
    'sha256': '5e701277d50836ee20e9db9f70a6e21e7122fcbc5bf33e3940148f34a1bc1654',
}


def download(pin, cache):
    path = cache / pin['filename']
    if not path.exists():
        request = urllib.request.Request(pin['url'], headers={'User-Agent': 'Varendor-Knight-Build'})
        temporary = path.with_suffix('.downloading')
        with urllib.request.urlopen(request, timeout=180) as source, temporary.open('wb') as target:
            shutil.copyfileobj(source, target, 4 * 1024 * 1024)
        temporary.replace(path)
    with path.open('rb') as source:
        digest = hashlib.file_digest(source, 'sha256').hexdigest()
    if path.stat().st_size != pin['bytes'] or digest != pin['sha256']:
        raise RuntimeError('Accepted build input checksum mismatch: ' + path.name)
    return path


def write_member(archive, source, destination):
    destination.parent.mkdir(parents=True, exist_ok=True)
    destination.write_bytes(archive.read(source))


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--blender', default=os.environ.get('BLENDER'))
    parser.add_argument('--cache', type=Path, default=Path(os.environ.get('RUNNER_TEMP', '/tmp')) / 'varendor-knight-inputs')
    args = parser.parse_args()
    args.cache.mkdir(parents=True, exist_ok=True)
    generated = ROOT / 'godot-pc/generated'
    generated.mkdir(parents=True, exist_ok=True)
    samples = ROOT / 'qa-artifacts/pc-build/p1-samples'
    if not all((samples / name).exists() for name in ['ASSETS.json', 'p1-samples.glb', 'Varendor_P1_Samples.blend']) or not (generated / 'blender-build.json').exists():
        windows = download(WINDOWS, args.cache)
        prefix = 'Varendor_Godot_PC_6ccf00bdb3fc/'
        with zipfile.ZipFile(windows) as archive:
            write_member(archive, prefix + 'BLENDER_BUILD.json', generated / 'blender-build.json')
            for name in ['ASSETS.json', 'p1-samples.glb', 'Varendor_P1_Samples.blend']:
                write_member(archive, prefix + 'world-sources/P1/' + name, samples / name)
    if not (generated / 'p1-samples.glb').exists():
        shutil.copy2(samples / 'p1-samples.glb', generated / 'p1-samples.glb')
    blend = ROOT / 'world-source/Varendor_PC_World.blend'
    wildlife = generated / 'wildlife'
    if not blend.exists() or not all((wildlife / (name + '.glb')).exists() for name in ['crow', 'hare']):
        world = download(WORLD, args.cache)
        with zipfile.ZipFile(world) as archive:
            for relative in ['world-source/Varendor_PC_World.blend', 'godot-pc/generated/wildlife/crow.glb', 'godot-pc/generated/wildlife/hare.glb']:
                write_member(archive, relative, ROOT / relative)
    if not (generated / 'world.glb').exists():
        if not args.blender:
            raise RuntimeError('Pinned Blender is required to export the accepted packed world; pass --blender or BLENDER')
        code = 'import bpy; bpy.ops.wm.open_mainfile(filepath=' + repr(str(blend)) + '); bpy.ops.export_scene.gltf(filepath=' + repr(str(generated / 'world.glb')) + ",export_format='GLB',export_animations=False,export_cameras=False,export_lights=True,export_yup=True,export_vertex_color='ACTIVE')"
        subprocess.run([args.blender, '--background', '--factory-startup', '--threads', '2', '--disable-autoexec', '--python-exit-code', '1', '--python-expr', code], cwd=ROOT, check=True)
    print(json.dumps({'world': str(generated / 'world.glb'), 'worldBytes': (generated / 'world.glb').stat().st_size, 'samples': str(samples), 'source': 'accepted scene restored without geometry regeneration'}))


if __name__ == '__main__':
    main()
