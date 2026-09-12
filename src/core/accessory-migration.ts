import {ACCESSORY_MIGRATION_VERSION,LEGACY_RING_IDS,RING_ITEMS} from '../data/accessories-v3.ts';
import {integerItemStats} from './item-progression.ts';
import type {ItemStatDefinition,ItemStatContribution} from './item-progression.ts';
import type {InventoryItem,ItemReference} from './inventory-commands.ts';
export type AccessoryState={inventory:InventoryItem[];equipment:Record<string,InventoryItem|undefined>;storage?:Array<InventoryItem|null>;lootBuffer?:InventoryItem[];migrationReserve?:InventoryItem[];accessoryMigrationVersion?:number};
export type AccessoryBackup={inventory:InventoryItem[];equipment:Record<string,InventoryItem|undefined>;storage?:Array<InventoryItem|null>;lootBuffer?:InventoryItem[];migrationReserve?:InventoryItem[]};
/** Old ring and necklace enhancements used the same accessory curve. This explicit compatibility path freezes its delta. */
export function oldRingEnhancementBonus(definition:ItemStatDefinition,plus:number):Partial<ItemStatContribution>{
 const base=integerItemStats(definition,0),old=integerItemStats({...definition,slot:'neck'},plus),bonus:Partial<ItemStatContribution>={};
 for(const key of Object.keys(old) as Array<keyof ItemStatContribution>)if(old[key]!==base[key])bonus[key]=old[key]-base[key];
 return bonus;
}
export function migrateAccessories(state:AccessoryState,definitionFor:(item:InventoryItem)=>ItemStatDefinition|undefined):{state:AccessoryState;backup?:AccessoryBackup}{
 if((state.accessoryMigrationVersion??0)>ACCESSORY_MIGRATION_VERSION)throw Error('newer-accessory-migration');
 if(state.accessoryMigrationVersion===ACCESSORY_MIGRATION_VERSION)return {state};
 const next=structuredClone(state),backup:AccessoryBackup=structuredClone({inventory:state.inventory,equipment:state.equipment,storage:state.storage,lootBuffer:state.lootBuffer,migrationReserve:state.migrationReserve});
 next.migrationReserve??=[];
 const all=[...next.inventory,...Object.values(next.equipment),...(next.storage??[]),...(next.lootBuffer??[]),...next.migrationReserve].filter((i):i is InventoryItem=>Boolean(i));
 if(new Set(all.map(i=>i.uid)).size!==all.length)throw Error('ambiguous-migration-item');
 for(const item of all){
  const definition=definitionFor(item),ring=RING_ITEMS[item.id as keyof typeof RING_ITEMS];
  if(!ring||item.ringMigrationVersion===ACCESSORY_MIGRATION_VERSION)continue;
  if(!LEGACY_RING_IDS.includes(item.id as typeof LEGACY_RING_IDS[number])&&item.plus!==0)continue;
  if(LEGACY_RING_IDS.includes(item.id as typeof LEGACY_RING_IDS[number])){
   if(!Number.isInteger(item.plus)||item.plus<0||item.plus>15)throw Error('invalid-legacy-ring');
   const delta=oldRingEnhancementBonus(definition!,item.plus),bonus={...item.legacyRingBonus};
   for(const key of Object.keys(delta) as Array<keyof ItemStatContribution>)bonus[key]=(bonus[key]??0)+delta[key]!;
   if(Object.keys(bonus).length)item.legacyRingBonus=bonus;
   item.legacyRingLevelExempt=true;
  }
  item.plus=0;item.ringMigrationVersion=ACCESSORY_MIGRATION_VERSION;
 }
 const right=next.equipment.ear2;delete next.equipment.ear2;
 if(right){if(next.inventory.length<42)next.inventory.push(right);else next.migrationReserve.push(right);}
 // Unknown data remains intact and reclaimable once its definition is restored, never silently removed.
 const unknown=(item:InventoryItem)=>!definitionFor(item)||(['ring','ring1','ring2'].includes(definitionFor(item)?.slot??'')&&(!Object.hasOwn(RING_ITEMS,item.id)||item.plus!==0));
 next.inventory=next.inventory.filter(item=>{if(!unknown(item))return true;next.migrationReserve!.push(item);return false;});
 next.lootBuffer=(next.lootBuffer??[]).filter(item=>{if(!unknown(item))return true;next.migrationReserve!.push(item);return false;});
 for(const [slot,item] of Object.entries(next.equipment))if(item&&unknown(item)){next.migrationReserve.push(item);delete next.equipment[slot];}
 next.storage=next.storage?.map(item=>{if(!item||!unknown(item))return item;next.migrationReserve!.push(item);return null;});
 next.accessoryMigrationVersion=ACCESSORY_MIGRATION_VERSION;return {state:next,backup};
}
export function claimMigrationItem(state:AccessoryState,reference:ItemReference,known:(item:InventoryItem)=>boolean):void{
 const reserve=state.migrationReserve??[],index=reserve.findIndex(i=>reference&&i.uid===reference.uid),item=reserve[index];
 if(!item||item.id!==reference.id||item.plus!==reference.plus||item.count!==reference.count)throw Error('stale-item');
 if(!known(item))throw Error('unknown-recovery-item');
 if(state.inventory.length>=42)throw Error('bag-full');
 if([...state.inventory,...Object.values(state.equipment),...(state.storage??[]),...(state.lootBuffer??[])].some(i=>i?.uid===item.uid))throw Error('ambiguous-item');
 state.inventory.push(item);state.migrationReserve=reserve.filter((_,i)=>i!==index);
}
