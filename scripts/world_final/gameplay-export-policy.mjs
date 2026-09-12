// Explicitly staged/rejected art stays in the checkout, outside current releases.
// Promotion requires updating this policy as well as the canonical actor profile.
export const EXCLUDED_ACTOR_PREFIXES = Object.freeze([
  'world-expansion-v3/actors/cohort-06-10/',
  'world-expansion-v3/actors/alternatives/roach/',
  'world-expansion-v3/actors/models/V3StarterBoar',
  'world-expansion-v3/actors/models/V3StarterBeetle',
]);

export function isExcludedActorPath(path) {
  const normalized = path.replaceAll('\\', '/').replace(/^res:\/\//, '');
  return EXCLUDED_ACTOR_PREFIXES.some(prefix => normalized.startsWith(prefix));
}

export function updateGameplayExportFilters(presets, rawFiles) {
  if (!/^include_filter="[^"]*"/m.test(presets) || !/^exclude_filter="[^"]*"/m.test(presets))
    throw Error('missing-gameplay-export-filters');
  const include = [...new Set(rawFiles.map(path => path.replaceAll('\\', '/')))]
    .filter(path => !isExcludedActorPath(path)).sort().join(',');
  return presets
    .replace(/^include_filter="[^"]*"/gm, () => `include_filter="${include}"`)
    .replace(/^exclude_filter="([^"]*)"/gm, (_, existing) =>
      `exclude_filter="${[...new Set([...existing.split(',').filter(Boolean),
        ...EXCLUDED_ACTOR_PREFIXES.map(prefix => prefix + '*')])].join(',')}"`);
}
