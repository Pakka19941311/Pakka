import type {InventoryItem} from './inventory-commands.ts';
import type {Position} from '../network/world-protocol.ts';

export const LOOT_PICKUP_RADIUS = 2.5;
export const LOOT_VIEW_RADIUS = 55;
export const LOOT_VIEW_LIMIT = 64;
export type LootMode = 'ground' | 'auto';
export type GroundLoot = Position & {
  id:string; ownerId:string; sourceUid:string; sourceGeneration:number;
  createdAt:number; revision:number; items:InventoryItem[]; gold:number;
};
export type GroundLootView = Position & {
  id:string; revision:number; gold:number; itemCount:number; available:boolean;
};
type Definition = {slot?:string;maxStack?:number;[key:string]:unknown};

/** Plan first; the simulation commits the inventory, purse and remainder together.
 * An item may fill an existing stack even when all inventory slots are occupied.
 * Its original UID stays on the ground until that entire remainder is collected. */
export function planGroundPickup(inventory:InventoryItem[], purse:number, loot:GroundLoot,
  definitions:Record<string,Definition>, capacity=42) {
  if(!Number.isSafeInteger(loot.gold)||loot.gold<0||!Number.isSafeInteger(purse+loot.gold))throw Error('loot-invalid-gold');
  const next=structuredClone(inventory), remaining:InventoryItem[]=[], collected:InventoryItem[]=[];
  for(const item of loot.items){
    const def=definitions[item.id];
    if(!def||!Number.isSafeInteger(item.count)||item.count<1)throw Error('loot-invalid-item');
    const stackable=!def.slot&&def.maxStack!==1, limit=def.maxStack??Number.MAX_SAFE_INTEGER;
    if(item.count>limit||!stackable&&item.count!==1)throw Error('loot-invalid-item');
    let count=item.count;
    if(stackable)for(const stack of next){
      if(stack.id!==item.id||stack.plus!==item.plus||!Number.isSafeInteger(stack.count)||stack.count>=limit)continue;
      const take=Math.min(count,limit-stack.count);stack.count+=take;count-=take;
      if(count===0)break;
    }
    if(count>0&&next.length<capacity){next.push({...item,count});count=0;}
    if(count>0)remaining.push({...item,count});
    if(count<item.count)collected.push({...item,count:item.count-count});
  }
  return {inventory:next,gold:purse+loot.gold,remaining,collected,
    changed:loot.gold>0||collected.length>0,empty:remaining.length===0};
}

export function lootView(loot:GroundLoot,available:boolean):GroundLootView {
  return {id:loot.id,revision:loot.revision,x:loot.x,z:loot.z,spaceId:loot.spaceId,
    gold:loot.gold,itemCount:loot.items.reduce((sum,item)=>sum+item.count,0),available};
}
