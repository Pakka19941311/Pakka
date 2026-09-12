import {writeFileSync} from 'node:fs';
import {ITEMS} from '../src/data/game-data.ts';
import {itemStatContribution} from '../src/core/equipment-stats.ts';
const items=Object.entries(ITEMS).filter(([,d])=>d.slot).map(([id,d])=>({
  id,name:d.name,slot:d.slot,
  levels:Array.from({length:d.slot==='ring'?1:16},(_,plus)=>({plus,stats:Object.fromEntries(
    Object.entries(itemStatContribution(d,plus)).filter(([,value])=>value!==0))})),
}));
writeFileSync(new URL('../docs/ITEM_PROGRESSION_V3.json',import.meta.url),JSON.stringify({
  schema:1,source:'src/core/item-progression.ts',items,
},null,2)+'\n');
console.log(`Exported exact item contributions: ${items.length} definitions.`);
