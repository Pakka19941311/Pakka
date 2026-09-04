export type SpawnRegion = Readonly<{
  id: string;
  label: string;
  monsterId: string;
  center: Readonly<{ x: number; z: number }>;
  population: number;
  radius: number;
  patrolRadius: number;
  aggroRadius: number;
  leashRadius: number;
  boss?: 'mini' | 'big';
}>;

export const SPAWN_REGIONS: readonly SpawnRegion[] = [
  { id: 'greyfang-meadow', label: 'Луга Серой стаи', monsterId: 'wolf', center: { x: 22, z: -6 }, population: 7, radius: 8, patrolRadius: 5, aggroRadius: 8.5, leashRadius: 13 },
  { id: 'exile-camp', label: 'Лагерь изгнанников', monsterId: 'exile', center: { x: 39, z: 20 }, population: 6, radius: 8, patrolRadius: 5, aggroRadius: 9, leashRadius: 14 },
  { id: 'blight-pool', label: 'Омут порчи', monsterId: 'spider', center: { x: 59, z: -8 }, population: 6, radius: 9, patrolRadius: 4.5, aggroRadius: 8, leashRadius: 13 },
  { id: 'nameless-graves', label: 'Могилы Безымянных', monsterId: 'undead', center: { x: 69, z: 50 }, population: 7, radius: 10, patrolRadius: 5.5, aggroRadius: 9, leashRadius: 15 },
  { id: 'bloodwing-ridge', label: 'Гребень кровопийц', monsterId: 'bat', center: { x: 93, z: 18 }, population: 6, radius: 9, patrolRadius: 6, aggroRadius: 10, leashRadius: 16 },
  { id: 'ember-coven', label: 'Круг Пепельного культа', monsterId: 'cultist', center: { x: 101, z: 49 }, population: 6, radius: 9, patrolRadius: 5, aggroRadius: 10, leashRadius: 16 },
  { id: 'broken-mine', label: 'Разломанная выработка', monsterId: 'miner', center: { x: 123, z: 77 }, population: 7, radius: 10, patrolRadius: 5, aggroRadius: 9, leashRadius: 15 },
  { id: 'drowned-fen', label: 'Затонувшая топь', monsterId: 'wraith', center: { x: 111, z: 12 }, population: 6, radius: 10, patrolRadius: 7, aggroRadius: 10, leashRadius: 17 },
  { id: 'blood-alpha-den', label: 'Логово Кровавого Оборотня', monsterId: 'mini', center: { x: 109, z: 2 }, population: 1, radius: 0, patrolRadius: 4, aggroRadius: 11, leashRadius: 18, boss: 'mini' },
  { id: 'rotten-lord-pit', label: 'Чертог Хозяина леса', monsterId: 'big', center: { x: 136, z: 101 }, population: 1, radius: 0, patrolRadius: 3, aggroRadius: 13, leashRadius: 21, boss: 'big' },
] as const;

function fractional(value: number): number {
  return value - Math.floor(value);
}

export function spawnPointInRegion(region: SpawnRegion, index: number): Readonly<{ x: number; z: number }> {
  if (region.population <= 1 || region.radius <= 0) return region.center;
  const normalizedIndex = Math.max(0, Math.floor(index));
  const radial = Math.sqrt((normalizedIndex + 0.7) / (region.population + 0.7));
  const jitter = 0.82 + fractional((normalizedIndex + 1) * 0.754877666) * 0.18;
  const angle = normalizedIndex * 2.399963229728653 + fractional(region.center.x * 0.173 + region.center.z * 0.127) * Math.PI * 2;
  return {
    x: region.center.x + Math.cos(angle) * region.radius * radial * jitter,
    z: region.center.z + Math.sin(angle) * region.radius * radial * jitter,
  };
}

export function patrolRouteInRegion(region: SpawnRegion, spawn: Readonly<{ x: number; z: number }>, index: number): Array<{ x: number; z: number }> {
  const points: Array<{ x: number; z: number }> = [];
  for (let waypoint = 0; waypoint < 3; waypoint += 1) {
    const angle = index * 1.37 + waypoint * (Math.PI * 2 / 3) + region.center.x * 0.013;
    const distance = region.patrolRadius * (0.48 + ((index + waypoint * 2) % 5) * 0.085);
    const desired = {
      x: spawn.x + Math.cos(angle) * distance,
      z: spawn.z + Math.sin(angle) * distance,
    };
    const fromCenterX = desired.x - region.center.x;
    const fromCenterZ = desired.z - region.center.z;
    const centerDistance = Math.max(0.001, Math.hypot(fromCenterX, fromCenterZ));
    const territoryLimit = Math.max(region.radius + region.patrolRadius * 0.45, region.patrolRadius);
    points.push(centerDistance <= territoryLimit ? desired : {
      x: region.center.x + fromCenterX / centerDistance * territoryLimit,
      z: region.center.z + fromCenterZ / centerDistance * territoryLimit,
    });
  }
  return points;
}
