import type {SpaceId} from '../world/world-space.ts';
import type {BookEffect,BookDot} from '../server/book-system.ts';
import type { InventoryItem, ItemReference } from '../core/inventory-commands.ts';
import type { MonsterAiState } from '../world/monster-ai.ts';
import type { LocomotionState } from '../controls/character-motor.ts';
import type { EquipmentCombatStats } from '../core/equipment-stats.ts';

export const WORLD_PROTOCOL = 1;
export const DISCONNECT_GRACE_MS = 30_000;
export type Position = { x: number; z: number; spaceId?:SpaceId };
export type TradeSession = {npcId:string;token:string;spaceId:SpaceId;generation:number};
export type WorldMotion = { yOffset:number; grounded:boolean; yaw:number; action:'idle'|'walk'|'jump'|'attack'|'death'; actionStartedAt:number; actionEndsAt:number; velocityX?:number; velocityZ?:number; verticalVelocity?:number; locomotionState?:LocomotionState; combatState?:'idle'|'approach'|'face'|'windup'|'recovery'|'dead'; hitAt?:number; hitUntil?:number; bodyRadius?:number; attackRange?:number };
export type WorldCharacter = Position & WorldMotion & {
  id: string; name: string; classId: string; level: number; xp: number; gold: number;
  hp: number; mp: number; maxHp: number; maxMp: number; stats: EquipmentCombatStats;
  bookEffects?:BookEffect[]; bookCooldowns?:Record<string,number>; bookCastReadyAt?:number; bookQuests?:Record<string,'active'|'ready'|'claimed'>;
  storage?: Array<InventoryItem|null>;
  inventory: InventoryItem[]; equipment: Record<string, InventoryItem | undefined>;
  lootBuffer: InventoryItem[]; betaScrollGrant?: string; legacyScrolls?: number; quest: number; kills: number; bossKills: number;
  dead: boolean; cooldowns: number[]; attackReadyAt: number; buffs: { guard: number; vanish: number; haste?:number };
  activeUntil: number; lastInputSequence: number; lastInputAt: number;
  navigationPath?:Position[];
  direction: Position; destination: Position | null; target: string | null; skill: number | null;
  generation: number; autoAttack?:boolean; singleAttack?:boolean; bufferedSkill?:{target:string;index:number;expiresAt:number};
};
export type WorldMonster = Position & WorldMotion & {
  bookEffects?:BookEffect[];bookDots?:BookDot[];returnFromTaunt?:boolean;nextSlamAt?:number;
  uid: string; id: string; home: Position; regionId?: string; patrolIndex: number; patrolStep?:number;
  hp: number; alive: boolean; respawnAt: number; attackReadyAt: number; generation: number;
  phase: number; status: { slow: number; stun: number; dot: number; nextDot: number; dotOwner?: string };
  temporaryOwner?:string;ownerGeneration?:number;temporaryUntil?:number;
  nightIndex?:number; pairId?:string; provokedBy?:string; owner?: string; aiState?: MonsterAiState; targetId?:string|null; deathAt?:number; corpseUntil?:number;
};
export type WorldSummon = Position & WorldMotion & { bookKind?:string;ownerGeneration?:number;uid: string; owner: string; expiresAt: number; attackReadyAt: number };
export type WorldEvent = {
  spaceId?:SpaceId;
  sequence: number; at: number; kind: 'attack' | 'release' | 'cancel' | 'hit' | 'miss' | 'death' | 'respawn' | 'loot' | 'buff' | 'summon';
  bookId?:string; actor: string; target?: string; skill?: number | null; amount?: number; critical?: boolean; generation?: number; impactAt?:number; endsAt?:number; readyAt?:number; effect?:string; durationMs?:number; reason?:string;
  position?:Position & {yOffset:number;yaw:number};
  origin?: Position & {y:number}; destination?:Position & {y:number}; actorGeneration?:number; targetHp?:number; targetMaxHp?:number; targetGeneration?:number;
  gold?: number; xp?: number; items?: string[];
};
export type WorldSnapshot = {
  spaceId?:SpaceId;worldRevision?:string;populationCapacity?:number;
  groundEffects?:Array<{id:string;kind:'trap'|'area'|'slam';owner:string;point:Position;radius:number;expiresAt:number;effect:string}>;
  environment?: import("../world/world-cycle.ts").WorldCycleSnapshot; chat?: WorldChatMessage[];
  contentVersion?: string; mapVersion?: string;
  protocol: typeof WORLD_PROTOCOL; time: number; revision: number; character: WorldCharacter;
  heroes: Array<Pick<WorldCharacter, 'id' | 'name' | 'classId' | 'level' | 'x' | 'z' | 'hp' | 'maxHp' | 'dead' | 'equipment' | 'generation' | keyof WorldMotion> & Partial<Pick<WorldCharacter,'autoAttack'|'attackReadyAt'|'target'>>>;
  monsters: WorldMonster[]; summons: WorldSummon[]; events: WorldEvent[];
};
// The wire format contains intentions only. Damage, prices, dice and rewards are server-owned.
export type WorldCommand =
  | {type:'castBook';bookId:string;targetId?:string;point?:Position}
  | {type:'bookQuest';level:50|60}
  | { type: 'equip'; item: ItemReference; slot?: string }
  | { type: 'unequip'; item: ItemReference; slot: string; index?:number }
  | { type: 'reorder'; item: ItemReference; index: number }
  | { type: 'enhance'; item: ItemReference; scroll: ItemReference }
  | { type: 'use'; item: ItemReference }
  | { type: 'tradeOpen'; npcId:string }
  | { type: 'tradeClose'; token:string }
  // Legacy clients may omit trade on the wire; the server rejects such sales.
  | { type: 'sell'; item: ItemReference; quantity?:number; trade?:Pick<TradeSession,'npcId'|'token'> }
  | { type: 'buy'; itemId: string }
  | { type: 'teleport'; destination: string }
  | { type: 'portal'; destination:'mine'|'great_cave' }
  | { type: 'respawn' }
  | { type: 'quest' }
  | { type: 'collect' }
  | { type: 'storage'; direction:'deposit'|'withdraw'|'reorder'; item:ItemReference; index?:number; quantity?:number }
  | { type: 'chat'; channel:'world'|'trade'; text:string };
export type WorldIntent =
  | { type: 'direction'; x: number; z: number }
  | { type: 'destination'; x: number; z: number }
  | { type: 'attack'; entityId: string; skill: number | null; mode?:'single'|'auto' }
  | { type: 'jump' }
  | { type: 'cancel'; preserveAuto?:boolean };
export type WorldChatMessage={id:number;at:number;senderId:string;name:string;channel:'world'|'trade';text:string};
export type CommandReceipt = { id: string; ok: boolean; reason?: string; at: number; outcome?: unknown };

