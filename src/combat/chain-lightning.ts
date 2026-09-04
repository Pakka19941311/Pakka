export type ChainCandidate = Readonly<{ uid: string; x: number; z: number; alive: boolean }>;
export type ChainConfig = Readonly<{ maxTargets: number; radius: number; falloff: number }>;
export type ChainHit<T extends ChainCandidate> = Readonly<{
  target: T;
  source: T | null;
  multiplier: number;
  jump: number;
}>;

export function resolveChainLightning<T extends ChainCandidate>(
  primary: T,
  candidates: readonly T[],
  config: ChainConfig,
): Array<ChainHit<T>> {
  if (!primary.alive || config.maxTargets <= 0) return [];
  const radius = Math.max(0, config.radius);
  const falloff = Math.max(0, Math.min(1, config.falloff));
  const hits: Array<ChainHit<T>> = [{ target: primary, source: null, multiplier: 1, jump: 0 }];
  const visited = new Set([primary.uid]);
  let current = primary;
  while (hits.length < Math.floor(config.maxTargets)) {
    const next = candidates
      .filter((candidate) => candidate.alive && !visited.has(candidate.uid))
      .map((candidate) => ({ candidate, distance: Math.hypot(candidate.x - current.x, candidate.z - current.z) }))
      .filter(({ distance }) => distance <= radius)
      .sort((a, b) => a.distance - b.distance || a.candidate.uid.localeCompare(b.candidate.uid))[0]?.candidate;
    if (!next) break;
    const jump = hits.length;
    hits.push({ target: next, source: current, multiplier: Math.pow(falloff, jump), jump });
    visited.add(next.uid);
    current = next;
  }
  return hits;
}
