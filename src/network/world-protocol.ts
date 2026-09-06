import type { InventoryItem, ItemReference } from '../core/inventory-commands.ts';
import type { EquipmentCombatStats } from '../core/equipment-stats.ts';

export const WORLD_PROTOCOL = 1;
export const DISCONNECT_GRACE_MS = 30_000;
export type Position = { x: number; z: number };
export type WorldCharacter = Position & {
  id: string; name: string; classId: string; level: number; xp: number; gold: number;
  hp: number; mp: number; maxHp: number; maxMp: number; stats: EquipmentCombatStats;
  inventory: InventoryItem[]; equipment: Record<string, InventoryItem | undefined>;
  lootBuffer: InventoryItem[]; betaScrollGrant?: string; quest: number; kills: number; bossKills: number;
  dead: boolean; cooldowns: number[]; attackReadyAt: number; buffs: { guard: number; vanish: number };
  activeUntil: number; lastInputSequence: number; lastInputAt: number;
  direction: Position; destination: Position | null; target: string | null; skill: number | null;
  generation: number;
};
export type WorldMonster = Position & {
  uid: string; id: string; home: Position; regionId?: string; patrolIndex: number;
  hp: number; alive: boolean; respawnAt: number; attackReadyAt: number; generation: number;
  phase: number; status: { slow: number; stun: number; dot: number; nextDot: number; dotOwner?: string };
  owner?: string;
};
export type WorldSummon = Position & { uid: string; owner: string; expiresAt: number; attackReadyAt: number };
export type WorldEvent = {
  sequence: number; at: number; kind: 'attack' | 'hit' | 'miss' | 'death' | 'respawn' | 'loot' | 'buff' | 'summon';
  actor: string; target?: string; skill?: number | null; amount?: number; critical?: boolean; generation?: number;
};
export type WorldSnapshot = {
  protocol: typeof WORLD_PROTOCOL; time: number; revision: number; character: WorldCharacter;
  heroes: Array<Pick<WorldCharacter, 'id' | 'name' | 'classId' | 'x' | 'z' | 'hp' | 'maxHp' | 'dead' | 'equipment' | 'generation'>>;
  monsters: WorldMonster[]; summons: WorldSummon[]; events: WorldEvent[];
};
// The wire format contains intentions only. Damage, prices, dice and rewards are server-owned.
export type WorldCommand =
  | { type: 'equip'; item: ItemReference; slot?: string }
  | { type: 'unequip'; item: ItemReference; slot: string }
  | { type: 'reorder'; item: ItemReference; index: number }
  | { type: 'enhance'; item: ItemReference; scroll: ItemReference }
  | { type: 'use'; item: ItemReference }
  | { type: 'buy'; itemId: string }
  | { type: 'teleport'; destination: string }
  | { type: 'respawn' }
  | { type: 'quest' }
  | { type: 'collect' };
export type WorldIntent =
  | { type: 'direction'; x: number; z: number }
  | { type: 'destination'; x: number; z: number }
  | { type: 'attack'; entityId: string; skill: number | null }
  | { type: 'cancel' };
export type CommandReceipt = { id: string; ok: boolean; reason?: string; at: number; outcome?: unknown };
