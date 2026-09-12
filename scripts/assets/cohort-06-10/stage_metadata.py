"""Stage provenance and inspection evidence for the five inactive candidates."""
import argparse, hashlib, json, shutil
from pathlib import Path

p = argparse.ArgumentParser()
p.add_argument('--repo', required=True)
p.add_argument('--intake', required=True)
a = p.parse_args()
repo, intake = Path(a.repo).resolve(), Path(a.intake).resolve()
cohort = intake / 'cohort-06-10'
models = repo / 'godot-pc/world-expansion-v3/actors/cohort-06-10'
evidence = repo / 'docs/world-expansion-v3/cohort-06-10-evidence'
evidence.mkdir(parents=True, exist_ok=True)
rows = json.loads((cohort / 'export-audit-02/EXPORTED_GLB_AUDIT.json').read_text(encoding='utf-8'))
sources = json.loads((cohort / 'SOURCES.json').read_text(encoding='utf-8'))
city = json.loads((repo / 'scripts/assets/city/sources.json').read_text(encoding='utf-8'))
shared = [r for r in city['sources'] if r['id'] in ['A03', 'city-p2/mpfb', 'city-p2/suits02']]
# Select by known cache suffix too, so this does not silently omit the core.
shared = [r for r in city['sources'] if any(s in r['cache_file'] for s in ['makehuman_system_assets_cc0.zip', 'mpfb2-master.zip', 'suits02.zip'])]
assert len(shared) == 3
for source in shared:
    assert hashlib.sha256((intake / source['cache_file']).read_bytes()).hexdigest() == source['sha256']

def write(path, value):
    path.write_bytes((json.dumps(value, indent=2, ensure_ascii=False) + '\n').encode())

for row in rows:
    mob = row['mob_id']
    folder = models / mob
    report_file = next((cohort / mob / 'candidate').glob('Cohort*.json'))
    report = json.loads(report_file.read_text(encoding='utf-8'))
    source = next((s for s in sources if s['mob_id'] == mob), None)
    if source:
        source = dict(source)
        if mob == 'MOB-06':
            texture = cohort / mob / 'spider.png'
            source['texture'] = {'url': 'https://opengameart.org/sites/default/files/spider_7.png', 'sha256': hashlib.sha256(texture.read_bytes()).hexdigest(), 'bytes': texture.stat().st_size}
        upstream = source['license']
        credit = {'MOB-06': 'br-n518 — Spider.',
                  'MOB-07': 'Konstantin Maystrenko — concept; Anthony Myers — original model; Danimal — retopology, rigging and animation. Animated Defender AKA Brigand.',
                  'MOB-08': 'Drummyfish — Simple Cat; cat_free.png is the author-drawn replacement texture.'}[mob]
        provenance = [source]
        links = [source['page']]
    else:
        upstream = 'CC0-1.0'
        credit = 'MakeHuman Community — body, game_engine rig, eyes, skin and optional hair; Donitz — monk robe/hood (MOB-09); Rehman Polanski — Viking tunic/pants/boots (selected per manifest).'
        provenance = shared
        links = ['https://static.makehumancommunity.org/about/license.html', 'https://static.makehumancommunity.org/assets/assetpacks/suits02.html']
    legal = cohort / ('CC-BY-3.0.html' if mob == 'MOB-07' else 'CC0-1.0.html')
    shutil.copyfile(legal, folder / 'UPSTREAM_LICENSE.html')
    candidate = {'mob_id': mob, 'model': row['file'], 'sha256': row['sha256'],
                 'status': 'reference_only_gap' if mob == 'MOB-08' else 'source_basis' if mob in ['MOB-06', 'MOB-07'] else 'authored_adaptation_basis',
                 'upstream_license': upstream, 'credit': credit,
                 'source_urls': links, 'sources': provenance,
                 'measurements': row, 'adaptation': report,
                 'gates': {'card': 'source_verified', 'import': 'blender_export_readback_only_godot_pending',
                           'art': 'not_accepted', 'runtime': 'not_tested'},
                 'active_in_population': False, 'canonical_profile_added': False}
    if mob in ['MOB-09', 'MOB-10']:
        candidate['authored_work'] = 'Local project work: independent body parameters, props, pose/idle/walk. Source CC0 does not impose a license on project code or automatically license new additions.'
    if mob == 'MOB-07':
        candidate['blocking_findings'] = ['walk has a large seam including source transition; recut or replace before runtime', 'weapon/body floor intersections in attacks and death; retarget/rebase required', 'halberd silhouette does not match accepted short-blade bandit', 'no hit clip', 'no measured gait or damage-event contract']
    write(folder / 'CANDIDATE.json', candidate)
    details = ('Sources and their licenses are recorded below. This is an inactive candidate, not an accepted game actor.\n\n' + credit + '\n\n' + '\n'.join(links) + '\n\nUpstream license: ' + upstream + '. Full upstream legal text: UPSTREAM_LICENSE.html.\n\n'
               'Changes: remove unrelated source objects; preserve and bake the documented animation windows; normalize units and origin; pack source textures. No generated replacement textures. For MPFB: independently parameterized bodies, selected clothes, authored props and idle/walk. See CANDIDATE.json and reproducible generators.\n\n'
               'MPFB and Blender program licenses are separate from CC0 exported content. No code relicensing is implied. Existing project rights apply to newly authored project additions.\n')
    (folder / 'CREDITS.md').write_bytes(details.encode())
    shutil.copyfile(report_file, evidence / (mob + '-adaptation.json'))
    shutil.copyfile(cohort / 'export-audit-02' / (mob + '.json'), evidence / (mob + '-export-audit.json'))
    for image in (cohort / mob / 'candidate').glob('*.png'):
        shutil.copyfile(image, evidence / (mob + '-' + image.name))
write(evidence / 'EXPORTED_GLB_AUDIT.json', rows)
write(evidence / 'SOURCE_ARCHIVES.json', sources + shared)
shutil.copyfile(cohort / 'MOB-08/LYNX_ACCESS.json', evidence / 'LYNX_ACCESS.json')
shutil.copyfile(cohort / 'MOB-08/lynx-model-api.json', evidence / 'lynx-model-api.json')
reproduction = []
for row in rows:
    original = models / row['mob_id'] / row['file']
    reproduced = cohort / 'repro' / row['mob_id'] / row['file']
    digest = hashlib.sha256(reproduced.read_bytes()).hexdigest()
    reproduction.append({'mob_id': row['mob_id'], 'original_sha256': row['sha256'], 'reproduced_sha256': digest, 'byte_identical': digest == row['sha256']})
write(evidence / 'REPRODUCTION.json', reproduction)
print(json.dumps(reproduction, indent=2))
assert all(r['byte_identical'] for r in reproduction), 'Reproduction differs; preserve evidence and investigate before claiming byte identity'
