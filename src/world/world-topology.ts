import { CollisionWorld } from './collision-world.ts';
import type { Obstacle } from './collision-world.ts';
import { TerrainSurface, TERRAIN_VERSION } from './terrain-surface.ts';
import type { TerrainPlatform } from './terrain-surface.ts';

export type WorldTopology = Readonly<{
  schema: 1; terrainVersion: typeof TERRAIN_VERSION;
  colliders: Obstacle[]; platforms: TerrainPlatform[];
}>;

export function worldTopology(collision: CollisionWorld, terrain: TerrainSurface): WorldTopology {
  // GLB transform noise below a micrometre is irrelevant to a 0.46 m body.
  const rounded = JSON.parse(JSON.stringify({schema:1,terrainVersion:TERRAIN_VERSION,
    colliders:collision.manifest(),platforms:terrain.platformManifest()}, (_key, value) =>
    typeof value === 'number' ? Math.round(value * 1e6) / 1e6 : value));
  return validateWorldTopology(rounded);
}

export function validateWorldTopology(value: unknown): WorldTopology {
  const fail = (): never => { throw Error('invalid-world-topology'); };
  if (!value || typeof value !== 'object') return fail();
  const m = value as WorldTopology;
  if (m.schema !== 1 || m.terrainVersion !== TERRAIN_VERSION || !Array.isArray(m.colliders)
    || m.colliders.length < 1 || m.colliders.length > 20000 || !Array.isArray(m.platforms) || m.platforms.length > 2000) return fail();
  const coordinate = (n: unknown) => typeof n === 'number' && Number.isFinite(n) && Math.abs(n) <= 1000;
  const dimension = (n: unknown) => coordinate(n) && Number(n) > 0 && Number(n) <= 500;
  for (const p of m.colliders) {
    if (!p || !coordinate(p.x) || !coordinate(p.z) || !coordinate(p.bottom) || !coordinate(p.top) || p.top! <= p.bottom!) return fail();
    if (p.kind === 'circle') { if (!dimension(p.radius)) return fail(); }
    else if (p.kind === 'box') {
      if (!dimension(p.halfX) || !dimension(p.halfZ) || !coordinate(p.rotation)
        || (p.blocksMovement !== undefined && typeof p.blocksMovement !== 'boolean')) return fail();
    } else return fail();
  }
  for (const p of m.platforms) if (!p || !coordinate(p.x) || !coordinate(p.z) || !coordinate(p.y)
    || !dimension(p.width) || !dimension(p.depth) || p.rotation !== 0) return fail();
  return structuredClone(m);
}

/** Both server and client restore the reviewed static map, including overhangs
 * and raised platforms. The server has no endpoint for uploading this data. */
export function restoreWorldTopology(value: unknown): {collision: CollisionWorld; terrain: TerrainSurface; topology: WorldTopology} {
  const topology = validateWorldTopology(value);
  const collision = new CollisionWorld();
  const terrain = new TerrainSurface();
  for (const p of topology.colliders) {
    if (p.kind === 'circle') collision.addCircle(p.x,p.z,p.radius,p.bottom,p.top);
    else if (p.blocksMovement === false) collision.addOverhang(p.x,p.z,p.halfX,p.halfZ,p.rotation,p.bottom!,p.top!);
    else collision.addBox(p.x,p.z,p.halfX,p.halfZ,p.rotation,p.bottom,p.top);
  }
  for (const p of topology.platforms) terrain.addPlatform(p.x,p.z,p.width,p.depth,p.y);
  return {collision,terrain,topology};
}
