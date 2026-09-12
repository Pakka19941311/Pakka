import {RING_RECIPES,ACCESSORY_MIGRATION_VERSION} from '../data/accessories-v3.ts';
import type {InventoryItem,ItemReference} from './inventory-commands.ts';
export type RingCraftCommand={recipeId:string;target:ItemReference;materials:ItemReference[]};
type CraftState={dead:boolean;gold:number;inventory:InventoryItem[];equipment:Record<string,InventoryItem|undefined>;storage?:Array<InventoryItem|null>;migrationReserve?:InventoryItem[];lootBuffer?:InventoryItem[]};
const same=(a:InventoryItem|undefined,b:ItemReference)=>a&&b&&a.uid===b.uid&&a.id===b.id&&a.plus===b.plus&&a.count===b.count;
/** Validate all four references before the single RNG draw. No client fee, chance or quantities are trusted. */
export function craftRing(state:CraftState,command:RingCraftCommand,random:()=>number,uid:()=>string){
 if(state.dead)throw Error('dead');
 const recipe=RING_RECIPES.find(r=>r.id===command.recipeId);if(!recipe)throw Error('unknown-recipe');
 if(!Array.isArray(command.materials)||command.materials.length!==3||!command.target)throw Error('craft-four-inputs-required');
 const refs=[command.target,...command.materials];
 if(refs.some(r=>!r||typeof r.uid!=='string')||new Set(refs.map(r=>r.uid)).size!==4)throw Error('craft-duplicate-input');
 const all=[...state.inventory,...Object.values(state.equipment),...(state.storage??[]),...(state.migrationReserve??[]),...(state.lootBuffer??[])].filter((i):i is InventoryItem=>Boolean(i));
 if(new Set(all.map(i=>i.uid)).size!==all.length)throw Error('ambiguous-item');
 const inputs=refs.map(r=>state.inventory.find(i=>i.uid===r.uid));
 if(inputs.some((i,n)=>!same(i,refs[n])))throw Error('stale-item');
 const target=inputs[0]!;
 if(target.id!==recipe.targetId||target.count!==1||target.plus!==0)throw Error('craft-invalid-target');
 for(let i=0;i<3;i++){
  const item=inputs[i+1]!,needed=recipe.materials[i];
  if(item.id!==needed.id||item.plus!==0)throw Error('craft-wrong-material');
  if(!Number.isSafeInteger(item.count)||item.count<needed.count)throw Error('craft-insufficient-material');
 }
 if(!Number.isSafeInteger(state.gold)||state.gold<recipe.fee)throw Error('insufficient-gold');
 if(state.inventory.length>42)throw Error('bag-full');
 const roll=random();if(!Number.isFinite(roll)||roll<0||roll>=1)throw Error('invalid-craft-roll');
 const success=roll<recipe.chance;
 const result:InventoryItem|null=success?{uid:uid(),id:recipe.resultId,plus:0,count:1,ringMigrationVersion:ACCESSORY_MIGRATION_VERSION,
  ...(target.legacyRingBonus?{legacyRingBonus:structuredClone(target.legacyRingBonus)}:{})}:null;
 if(result&&(!result.uid||all.some(i=>i.uid===result.uid)))throw Error('duplicate-result-uid');
 const inventory=state.inventory.flatMap(item=>{
  if(item.uid===target.uid)return result?[result]:[];
  const n=command.materials.findIndex(r=>r.uid===item.uid);if(n<0)return [item];
  const count=item.count-recipe.materials[n].count;return count?[{...item,count}]:[];
 });
 return {inventory,gold:state.gold-recipe.fee,outcome:{recipeId:recipe.id,success,chance:recipe.chance,fee:recipe.fee,consumedTargetUid:target.uid,result}};
}
