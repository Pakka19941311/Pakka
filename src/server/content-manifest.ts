import { createHash } from 'node:crypto';
import {SKILL_BOOKS} from '../data/skill-books.ts';
import {SPAWN_REGIONS} from '../world/spawn-regions.ts';
import { CLASSES, ITEMS, MONSTERS } from '../data/game-data.ts';
import { SCROLLS, ENHANCEMENT_PERCENT } from '../core/enhancement-v2.ts';
import { TERRAIN_VERSION } from '../world/terrain-surface.ts';
import type { TerrainSurface } from '../world/terrain-surface.ts';
import type { CollisionWorld } from '../world/collision-world.ts';
import { TERRITORY, REGION_CENTERS } from '../world/territory.ts';

const digest=(value:unknown)=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
export const CONTENT_VERSION='catalog-v1-'+digest({CLASSES,ITEMS,MONSTERS,SKILL_BOOKS,SPAWN_REGIONS,lootVersion:3,SCROLLS,ENHANCEMENT_PERCENT});
export function mapVersion(collision:CollisionWorld,terrain:TerrainSurface):string {
  return 'terrain-'+TERRAIN_VERSION+'-'+digest({territory:TERRITORY,spawnRegions:REGION_CENTERS,colliders:collision.manifest(),platforms:terrain.platformManifest(),heights:Array.from(terrain.heights)});
}
