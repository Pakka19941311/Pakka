// Explicitly staged/rejected art stays in the checkout, outside current releases.
// Promotion requires updating this policy as well as the canonical actor profile.
export const EXCLUDED_ACTOR_PREFIXES = Object.freeze([
  'world-expansion-v3/actors/cohort-06-10/',
  'world-expansion-v3/actors/alternatives/roach/',
  'world-expansion-v3/actors/models/V3StarterBoar',
  'world-expansion-v3/actors/models/V3StarterBeetle',
  'world-expansion-v3/actors/models/V3StarterSlime',
]);

// Explicit resource exclusion happens before Godot compiles .tscn into exported .scn.
// A raw directory wildcard alone left an orphan compiled Roach review in f251.
export const EXCLUDED_REVIEW_RESOURCES = Object.freeze([
  'scenes/art_review.tscn',
  'scripts/art_review.gd',
  'world-expansion-v3/actors/alternatives/roach/roach_qa.tscn',
  'world-expansion-v3/actors/alternatives/roach/roach_qa.gd',
]);
export function isExcludedReviewPath(path) {
  return EXCLUDED_REVIEW_RESOURCES.includes(path.replaceAll('\\', '/').replace(/^res:\/\//, ''));
}

export function isExcludedActorPath(path) {
  const normalized = path.replaceAll('\\', '/').replace(/^res:\/\//, '');
  return EXCLUDED_ACTOR_PREFIXES.some(prefix => normalized.startsWith(prefix));
}

export function updateGameplayExportFilters(presets, rawFiles) {
  if (!/^include_filter="[^"]*"/m.test(presets) || !/^exclude_filter="[^"]*"/m.test(presets))
    throw Error('missing-gameplay-export-filters');
  const include = [...new Set(rawFiles.map(path => path.replaceAll('\\', '/')))]
    .filter(path => !isExcludedActorPath(path) && !isExcludedReviewPath(path)).sort().join(',');
  // Keep all gameplay resources, excluding only the explicitly isolated reviews.
  // This mode is supported by Godot 4.6 EditorExport::load_config.
  const isolated = presets.replace(/(\[preset\.\d+\]\r?\n)([\s\S]*?)(?=\r?\n\[|$)/g, (_, heading, body) => {
    if (!/^export_filter="(?:all_resources|exclude)"/m.test(body)) throw Error('unsupported-gameplay-resource-filter');
    const old = body.match(/^export_files=PackedStringArray\((.*)\)$/m);
    const names = old ? [...old[1].matchAll(/"([^"\r\n]+)"/g)].map(match=>match[1]) : [];
    const files = [...new Set([...names,...EXCLUDED_REVIEW_RESOURCES.map(path=>'res://'+path)])].sort();
    const eol=body.includes('\r\n')?'\r\n':'\n';
    body=body.replace(/^export_files=.*\r?\n?/m,'').replace(/^export_filter="[^"]*"\r?\n/m,
      'export_filter="exclude"'+eol+'export_files=PackedStringArray('+files.map(path=>JSON.stringify(path)).join(', ')+')'+eol);
    return heading+body;
  });
  return isolated
    .replace(/^include_filter="[^"]*"/gm, () => `include_filter="${include}"`)
    .replace(/^exclude_filter="([^"]*)"/gm, (_, existing) =>
      `exclude_filter="${[...new Set([...existing.split(',').filter(Boolean),
        ...EXCLUDED_ACTOR_PREFIXES.map(prefix => prefix + '*')])].join(',')}"`);
}
