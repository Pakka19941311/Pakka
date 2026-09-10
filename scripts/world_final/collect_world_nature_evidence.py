"""Preserve original viewport frames and diagnostics for the partial D08 pass."""
from pathlib import Path
import hashlib, json, shutil, zipfile

ROOT = Path(__file__).resolve().parents[2]
QA = ROOT / 'qa-artifacts/world-final'
OUT = ROOT / 'docs/world-final/evidence'

for source, destination in [
    ('world-frames-D08', 'D08-world/routes'),
    ('overview-frames-D08-geometry', 'D08-world/geometry-overviews'),
    ('family-frames-D08A', 'D08-families/initial-rejected'),
    ('family-frames-D08B', 'D08-families/curved-leaves'),
]:
    target = OUT / destination
    target.mkdir(parents=True, exist_ok=True)
    for path in (QA / source).iterdir():
        if path.suffix in ('.png', '.json'):
            shutil.copy2(path, target / path.name)

launches = [
    'world-D08', 'overview-D08-geometry', 'main-after-D08',
    'native-world-D08', 'shrub-minimal-diagnostic', 'families-D08A-isolated',
    'families-D08A-repaired', 'curved-leaves-D08B-01',
    'import-families-D08A', 'view-families-D08A',
    'import-families-D08B', 'view-families-D08B',
    'bake-far-families-D08', 'bake-far-families-D09', 'import-world-D08',
]
for name in launches:
    target = OUT / 'launches' / name
    target.mkdir(parents=True, exist_ok=True)
    for filename in ('result.json', 'stderr.log'):
        source = QA / name / filename
        if source.exists():
            shutil.copy2(source, target / filename.replace('.log', '.txt'))

# Keep every original motion frame, without inventing an interpolated video.
source = QA / 'world-frames-D08'
archive_path = QA / 'D08-motion-frames.zip'
with zipfile.ZipFile(archive_path, 'w', zipfile.ZIP_STORED) as archive:
    for path in sorted(source.glob('frame-*.jpg')):
        archive.write(path, path.name)
    archive.write(source / 'world-nature-review.json', 'world-nature-review.json')
data = archive_path.read_bytes()
parts = []
for offset in range(0, len(data), 3145728):
    piece = data[offset:offset+3145728]
    name = 'motion-frames.part%03d' % len(parts)
    (OUT / 'D08-world' / name).write_bytes(piece)
    parts.append({'path': name, 'bytes': len(piece), 'sha256': hashlib.sha256(piece).hexdigest()})
(OUT / 'D08-world/motion-frames.json').write_text(json.dumps({
    'format': 'zip', 'restore': 'Concatenate the parts in order to recover the original ZIP.',
    'archive_bytes': len(data), 'archive_sha256': hashlib.sha256(data).hexdigest(),
    'parts': parts, 'frames': 199,
}, indent=2)+'\n', encoding='utf-8')

inspection = {
    'renderer': 'Godot 4.6.3 Compatibility, real viewport',
    'normal_speed_walks': 5, 'original_motion_frames': 199,
    'all_routes_arrived': True, 'maximum_planar_stop_drift_m': 0.0,
    'overview_geometry': 'Actual LOD1 meshes; initial route-run overviews used upright distant cards',
    'final_art_accepted': False,
    'open_visual_issues': [
        'Canopy looks brown/noisy at high viewing angles; investigate materials and alpha/mips.',
        'Near pine wood is excessively dark; inspect source vertex colours before changing materials.',
        'Forest boundaries and exposed geology need more natural composition.',
        'Full-world canopy coverage and all LOD transitions have not been accepted.',
    ],
    'main_game_integrated': False,
    'main_startup': 'headless, exit 0; known certificate-store and display-settings JSON errors remain',
}
(OUT / 'D08-world/visual-inspection.json').write_text(json.dumps(inspection, indent=2)+'\n', encoding='utf-8')
print(json.dumps({'evidence': str(OUT / 'D08-world'), 'launches': len(launches)}))
