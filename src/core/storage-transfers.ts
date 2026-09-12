import type {InventoryItem, ItemReference} from './inventory-commands.ts';

type StorageState = {inventory:InventoryItem[];storage?:Array<InventoryItem|null>};
export type StorageTransfer = {direction:'deposit'|'withdraw'|'reorder';item:ItemReference;index?:number;quantity?:number};

/** Validate the version and capacity before changing either container. The world
 * command transaction persists both sides and the receipt together. */
export function transferStorage(state:StorageState, command:StorageTransfer, stackable:(item:InventoryItem)=>boolean, uid:()=>string, capacity=500,maxStack:(item:InventoryItem)=>number=()=>Number.MAX_SAFE_INTEGER):void {
  const storage=state.storage??[],bag=state.inventory,reference=command.item;
  const depositing=command.direction==='deposit',withdrawing=command.direction==='withdraw';
  if(!depositing&&!withdrawing&&command.direction!=='reorder')throw Error('invalid-storage-operation');
  const source=depositing?bag:storage;
  const from=source.findIndex(i=>i&&reference&&i.uid===reference.uid&&i.id===reference.id&&i.plus===reference.plus&&i.count===reference.count);
  if(from<0)throw Error('stale-item');
  const item=source[from]!;
  const quantity=command.quantity===undefined?item.count:command.quantity;
  if(!Number.isSafeInteger(quantity)||quantity<=0||quantity>item.count)throw Error('invalid-storage-quantity');
  if(command.index!==undefined&&(!Number.isInteger(command.index)||command.index<0||command.index>=(withdrawing?42:capacity)))throw Error('invalid-storage-slot');
  if(command.direction==='reorder'){
    if(command.index===undefined)throw Error('invalid-storage-slot');
    if(quantity!==item.count)throw Error('invalid-storage-quantity');
    while(storage.length<=command.index)storage.push(null);
    [storage[from],storage[command.index]]=[storage[command.index],storage[from]];state.storage=storage;return;
  }
  if(quantity>maxStack(item))throw Error('stack-limit');
  const destination=depositing?storage:bag;
  const compatible=(candidate:InventoryItem|null|undefined)=>candidate&&candidate.id===item.id&&candidate.plus===item.plus&&stackable(item)&&candidate.count+quantity<=maxStack(item);
  let into=command.index;
  // A requested empty slot creates a separate stack. Automatic withdrawal can
  // merge without requiring a free bag cell, including a completely full bag.
  if(into===undefined){
    const merge=destination.findIndex(compatible);
    into=merge>=0?merge:depositing?Array.from({length:capacity},(_,i)=>i).find(i=>!storage[i]):bag.length;
  }
  if(into===undefined)throw Error('storage-full');
  const merged=compatible(destination[into])?destination[into]!:null;
  if(depositing&&destination[into]&&!merged)throw Error('storage-slot-occupied');
  if(!depositing&&!merged&&bag.length>=42)throw Error('bag-full');
  if(merged&&!Number.isSafeInteger(merged.count+quantity))throw Error('invalid-storage-quantity');
  const full=quantity===item.count;
  const transferred=merged?null:full?item:{...item,uid:uid(),count:quantity};
  if(merged)merged.count+=quantity;
  else if(depositing){while(storage.length<=into)storage.push(null);storage[into]=transferred;}
  else bag.splice(Math.min(into,bag.length),0,transferred!);
  if(full){if(depositing)bag.splice(from,1);else storage[from]=null;}
  else item.count-=quantity;
  state.storage=storage;
}
