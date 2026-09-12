import { CLASSES, ITEMS } from '../data/game-data.ts';
import { BETA_SCROLL_GRANT } from '../core/beta-scrolls.ts';
import { migrateScrollSave } from '../core/enhancement-v2.ts';
import { compatibleEquipmentSlots } from '../core/inventory-commands.ts';
import type { InventoryItem } from '../core/inventory-commands.ts';
import type {ItemStatContribution} from '../core/item-progression.ts';
import {starterQuestDefinition,starterRewardIds} from '../data/starter-progression-v3.ts';
import type {StarterQuestId,StarterEvidence} from '../data/starter-progression-v3.ts';
import type {StarterProgress,StarterQuestStatus} from '../core/starter-quests-v3.ts';
import type {LegacyProgression} from '../core/progression-migration-v3.ts';
import {parseLegacyBookQuests,parseProgressionQuestLedger} from './progression-quest-import.ts';

const invalid = (): never => { throw Error('invalid-beta-save: original data retained'); };
function record(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string,unknown> : invalid();
}
function integer(value: unknown, min: number, max = Number.MAX_SAFE_INTEGER): number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= min && value <= max ? value : invalid();
}
function finite(value: unknown, min: number, max: number): number {
  return typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max ? value : invalid();
}

/** This validates a PRIVATE beta import. It does not make a local save trustworthy
 * for a future public economy. Unknown items fail the entire import without loss. */
export function parseBetaSave(raw: unknown) {
  const save = record(raw), player = record(save.player);
  const classId = player.classId;
  if (typeof classId !== 'string' || !Object.hasOwn(CLASSES,classId)
    || typeof player.name !== 'string' || !player.name.trim() || player.name.length > 24) return invalid();
  const seen = new Set<string>();
  const item = (rawItem: unknown): InventoryItem => {
    const i = record(rawItem);
    if (typeof i.uid !== 'string' || !i.uid || i.uid.length > 200 || seen.has(i.uid)
      || typeof i.id !== 'string' || (!Object.hasOwn(ITEMS,i.id) && i.id !== 'scroll')) return invalid();
    seen.add(i.uid);
    const plus = integer(i.plus,0,15), count = integer(i.count,1);
    const definition = ITEMS[i.id as keyof typeof ITEMS];
    if (definition && 'slot' in definition ? count !== 1 : plus !== 0) return invalid();
    const result:InventoryItem={uid:i.uid,id:i.id,plus,count};
    if(i.ringMigrationVersion!==undefined)result.ringMigrationVersion=integer(i.ringMigrationVersion,1,1);
    if(i.legacyRingLevelExempt!==undefined){if(typeof i.legacyRingLevelExempt!=='boolean')return invalid();result.legacyRingLevelExempt=i.legacyRingLevelExempt;}
    if(i.legacyRingBonus!==undefined){
      const bonus=record(i.legacyRingBonus),allowed=['str','dex','int','vit','spi','atkMin','atkMax','matk','def','mdef','hp','mp','crit','accuracy','evasion','speed'];
      result.legacyRingBonus={};for(const [key,value] of Object.entries(bonus)){if(!allowed.includes(key))return invalid();result.legacyRingBonus[key as keyof ItemStatContribution]=integer(value,0);}
    }
    return result;
  };
  const items = (value: unknown, maximum: number): InventoryItem[] => {
    if (!Array.isArray(value) || value.length > maximum) return invalid();
    return value.map(item);
  };
  const inventory = items(player.inventory,42), lootBuffer = items(save.lootBuffer ?? [],1024);
  const rawStorage=player.storage??save.storage??[];if(!Array.isArray(rawStorage)||rawStorage.length>500)return invalid();
  const storage=rawStorage.map(value=>value===null?null:item(value));
  const migrationReserve=items(player.migrationReserve??save.migrationReserve??[],2048);
  const equipment: Record<string,InventoryItem|undefined> = {};
  for (const [slot,value] of Object.entries(record(player.equipment))) {
    if (value === null || value === undefined) continue;
    const i = item(value), definition = ITEMS[i.id as keyof typeof ITEMS];
    if (!definition || !('slot' in definition) || !(compatibleEquipmentSlots(definition.slot).includes(slot)||slot==='ear2'&&['ear','earring'].includes(definition.slot))) return invalid();
    if ('classes' in definition && Array.isArray(definition.classes) && !definition.classes.includes(classId)) return invalid();
    equipment[slot] = i;
  }
  let starterProgress:StarterProgress|undefined;
  if(player.starterProgress!==undefined){
    const progress=record(player.starterProgress);integer(progress.version,1,1);starterProgress={version:1,quests:{}};
    for(const [id,value] of Object.entries(record(progress.quests))){
      let definition;try{definition=starterQuestDefinition(id);}catch{return invalid();}
      const q=record(value),kills=integer(q.kills,0,definition.killCount),keys=q.killKeys,flags=q.evidence;
      if(!Array.isArray(keys)||keys.length!==kills||keys.some(k=>typeof k!=='string'||!k||k.length>500)||new Set(keys).size!==keys.length||
        !Array.isArray(flags)||flags.some(f=>!definition.evidence.includes(f))||new Set(flags).size!==flags.length||typeof q.xpGranted!=='boolean'||
        !['active','ready','reward-pending','claimed'].includes(String(q.status)))return invalid();
      const pendingItems=items(q.pendingItems,2),rewardIds=starterRewardIds(id,classId);
      if(pendingItems.some(i=>i.plus!==0||i.count!==1||!rewardIds.includes(i.id as typeof rewardIds[number]))||new Set(pendingItems.map(i=>i.id)).size!==pendingItems.length)return invalid();
      const completed=kills===definition.killCount&&definition.evidence.every(f=>flags.includes(f));
      if((q.status==='active'||q.status==='ready')&&(q.xpGranted||pendingItems.length)||q.status==='ready'&&!completed||
        (q.status==='claimed'||q.status==='reward-pending')&&(!q.xpGranted||!completed)||q.status==='claimed'&&pendingItems.length||q.status==='reward-pending'&&!pendingItems.length)return invalid();
      starterProgress.quests[id as StarterQuestId]={status:q.status as StarterQuestStatus,kills,killKeys:keys as string[],evidence:flags as StarterEvidence[],acceptedAt:finite(q.acceptedAt,0,Number.MAX_SAFE_INTEGER),xpGranted:q.xpGranted,pendingItems};
    }
    if(progress.legacy!==undefined)starterProgress.legacy=structuredClone(record(progress.legacy));
  }
  const migrated = migrateScrollSave({schema:integer(save.schema??1,1,2),player:{inventory},lootBuffer,
    legacyScrolls:integer(save.legacyScrolls??0,0)});
  if (save.betaScrollGrant !== undefined && save.betaScrollGrant !== BETA_SCROLL_GRANT) return invalid();
  if (player.dead !== undefined && typeof player.dead !== 'boolean') return invalid();
  let legacyProgression:LegacyProgression|undefined;
  if(player.legacyProgression!==undefined){
    const old=record(player.legacyProgression);
    if(old.version!==3||old.reason!=='level-cap-90')return invalid();
    legacyProgression={version:3,reason:'level-cap-90',originalLevel:integer(old.originalLevel,90,100),originalXp:integer(old.originalXp,0)};
  }
  const hp = finite(player.hp,0,Number.MAX_SAFE_INTEGER);
  const bookQuests=parseLegacyBookQuests(player.bookQuests??save.bookQuests),progressionQuests=parseProgressionQuestLedger(player.progressionQuests,classId,item);
  return {
    name:player.name.trim(),classId,legacyProgression,level:integer(player.level,1,100),xp:integer(player.xp,0),gold:integer(player.gold,0),
    x:finite(player.x,-158,158),z:finite(player.z,-138,138),hp,mp:finite(player.mp,0,Number.MAX_SAFE_INTEGER),
    dead:Boolean(player.dead || hp <= 0),inventory:migrated.player.inventory,equipment,lootBuffer:migrated.lootBuffer,storage,migrationReserve,starterProgress,bookQuests,progressionQuests,
    quest:integer(save.quest??0,0,4),kills:integer(save.kills??0,0),bossKills:integer(save.bossKills??0,0),
    legacyScrolls:migrated.legacyScrolls,betaScrollGrant:save.betaScrollGrant as string|undefined,
  };
}
