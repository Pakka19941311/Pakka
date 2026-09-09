"""Package the approved character art, editable inputs, and rendered review."""
import argparse
import hashlib
import json
from pathlib import Path
import shutil
import zipfile


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--workspace', required=True)
    parser.add_argument('--output', required=True)
    args = parser.parse_args()
    work = Path(args.workspace).resolve()
    out = Path(args.output).resolve()
    out.mkdir(parents=True, exist_ok=True)
    package = out / 'Varendor_Forgotten_Knight_Art_v1'
    package.mkdir(exist_ok=True)
    art = work / 'Pakka/art/forgotten-knight'
    assets = work / 'forgotten-knight-work'
    files = {}

    def add(source, relative):
        source = Path(source)
        if not source.is_file():
            raise FileNotFoundError(source)
        files[relative] = source

    add(assets / 'assembled/Varendor_Forgotten_Knight_Master.blend', 'Blend/Varendor_Forgotten_Knight_Master.blend')
    for name in ('Varendor_Forgotten_Knight_Scarlet.glb', 'Varendor_Forgotten_Knight_Northwatch.glb',
                 'Varendor_Forgotten_Knight_Ashwarden.glb', 'BaseBody.glb'):
        add(assets / 'exports' / name, 'GLB/' + name)
    add(assets / 'previews/Varendor_Knight_Variants.png', 'Previews/Varendor_Knight_Variants.png')
    add(assets / 'animation-review/Varendor_Forgotten_Knight_Animation_Review.mp4', 'Previews/Varendor_Forgotten_Knight_Animation_Review.mp4')
    for source, name in [('Review_run_weapon_15.png', 'Pose_Run.png'), ('Review_sword_attack_50.png', 'Pose_Attack.png'),
                         ('Review_cast_release_50.png', 'Pose_Cast.png')]:
        add(assets / 'assembled' / source, 'Previews/' + name)
    add(work / 'human-base-source/prepared/Body_Male_Front.png', 'Previews/Body_Prototype.png')
    add(work / 'knight-candidates/forgotten-knight/knight(b3_6).blend', 'Source/Armor/knight.blend')
    add(art / 'build_human.py', 'Source/Human/build_human.py')
    add(work / 'human-base-source/prepared/athletic_male_hm08.json', 'Source/Human/prepared/athletic_male_hm08.json')
    add(work / 'human-base-source/provenance.json', 'Source/Human/provenance.json')
    for source in art.glob('*.py'):
        add(source, 'Source/Scripts/' + source.name)
    for name in ('retargeted_actions.blend', 'sword_socket_evidence.json', 'retarget_metadata.json', 'animation_selection.json'):
        add(work / 'animation-sources' / name, 'Source/Animations/' + name)
    for number, folder in [(1, 'quaternius_ual_standard/Universal Animation Library[Standard]'),
                           (2, 'quaternius_ual2_standard/Universal Animation Library 2[Standard]')]:
        source = work / 'animation-sources' / folder
        add(source / f'Unreal-Godot/UAL{number}_Standard.glb', f'Source/Animations/UAL{number}_Standard.glb')
        add(source / 'License.txt', f'LICENSES/Quaternius_UAL{number}_CC0.txt')
    add(work / 'human-base-source/upstream/LICENSE.ASSETS.md', 'LICENSES/MakeHuman_Assets_CC0.md')
    for name, relative in [('fit_manifest.json', 'fitted'), ('character_manifest.json', 'assembled'),
                           ('export_manifest.json', 'exports'), ('render_manifest.json', 'animation-review')]:
        add(assets / relative / name, 'Source/Manifests/' + name)
    add(assets / 'run-carry/run_carry_report.json', 'Source/Manifests/run_carry_report.json')
    add(art / 'source_provenance.json', 'Source/Manifests/source_provenance.json')
    for name in ('README_RU.md', 'LICENSES.md'):
        add(art / name, name)
    records = []
    for relative, source in sorted(files.items()):
        destination = package / relative
        destination.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(source, destination)
        records.append({'file': relative, 'bytes': source.stat().st_size,
                        'sha256': hashlib.sha256(source.read_bytes()).hexdigest()})
    manifest = {'package': package.name, 'scope': 'Character art for review; no game integration',
                'model': 'The Forgotten Knight', 'paladin_used': False, 'files': records}
    (package / 'PACKAGE_MANIFEST.json').write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + '\n')
    archive = out / (package.name + '.zip')
    with zipfile.ZipFile(archive, 'w', zipfile.ZIP_DEFLATED, compresslevel=6) as zipped:
        for relative in sorted(files):
            zipped.write(package / relative, package.name + '/' + relative)
        zipped.write(package / 'PACKAGE_MANIFEST.json', package.name + '/PACKAGE_MANIFEST.json')
    with zipfile.ZipFile(archive) as zipped:
        corrupt = zipped.testzip()
        if corrupt:
            raise RuntimeError('Corrupt archive member: ' + corrupt)
    summary = {'archive': str(archive), 'bytes': archive.stat().st_size,
               'sha256': hashlib.sha256(archive.read_bytes()).hexdigest(), 'entries': len(files) + 1}
    (out / 'package_summary.json').write_text(json.dumps(summary, indent=2) + '\n')
    print(json.dumps(summary))


if __name__ == '__main__':
    main()
