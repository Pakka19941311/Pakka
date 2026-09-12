import {ITEMS} from './game-data.ts';
import {MOBS_V3} from './world-expansion-v3.ts';
import {encounterV3,ENCOUNTER_BALANCE_V3,lootProfileV3} from './encounter-balance-v3.ts';
import {rollAccessoryLoot} from './accessory-loot-v3.ts';
import type {LootStack} from './loot-v3.ts';

export const P2_BALANCE_VERSION=ENCOUNTER_BALANCE_V3.revision;
/** Accepted P2 locomotion override, calibrated to the measured model cycles.
 * Damage, health, defense, legacy species and the full-map candidate stay unchanged.
 */
export const P2_MOVEMENT_V3={version:'p2-locomotion-v3-3',scope:'canonical-first-five-only',
 metresPerSecond:{'MOB-01':1.5,'MOB-03':1.9,'MOB-04':1.6,'MOB-05':1.6},
 preserved:{'MOB-02':4.7}} as const;
const models:Record<string,string>={'MOB-01':'V3StarterSlime','MOB-02':'V3StarterWolf','MOB-03':'V3StarterRat','MOB-04':'V3StarterBoar','MOB-05':'V3StarterBeetle'};
const cache=new Map<string,ReturnType<typeof build>>();
function build(canonicalMobId:string,level:number){
 if(!Object.hasOwn(models,canonicalMobId))throw Error('unsupported-p2-combat-identity');
 const e=encounterV3(canonicalMobId,level),name=MOBS_V3.find(m=>m.id===canonicalMobId)!.name;
 const speed=P2_MOVEMENT_V3.metresPerSecond[canonicalMobId as keyof typeof P2_MOVEMENT_V3.metresPerSecond]??e.movementSpeed;
 return {...e,name,model:models[canonicalMobId],movementSpeed:speed,locomotionVersion:P2_MOVEMENT_V3.version,
  locomotionOverride:Object.hasOwn(P2_MOVEMENT_V3.metresPerSecond,canonicalMobId),goldMean:e.gold,gold:[Math.floor(e.gold*.9),Math.ceil(e.gold*1.1)] as const,
  runtimeEnabled:true,balanceVersion:P2_BALANCE_VERSION};
}
/** Only the explicit canonical marker selects these definitions. Legacy wolf
 * and spider elsewhere continue resolving through the legacy MONSTERS table. */
export function p2Encounter(actor:{canonicalMobId?:string;level?:number}){
 if(!actor.canonicalMobId)return null;
 if(!Number.isInteger(actor.level))throw Error('missing-p2-slot-level');
 const key=actor.canonicalMobId+':'+actor.level;
 let value=cache.get(key);if(!value){value=build(actor.canonicalMobId,actor.level!);cache.set(key,value);}return value;
}
const families:Record<string,{weapon:string[];armor:string[];accessory:string[]}>= {
 knight:{weapon:['wardens_blade'],armor:['militia_plate'],accessory:['fang_necklace','ash_belt']},
 ranger:{weapon:['blackwood_bow'],armor:['tracker_coat'],accessory:['fang_necklace','ash_belt']},
 assassin:{weapon:['bone_fangs'],armor:['night_leather'],accessory:['fang_necklace','ash_belt']},
 mage:{weapon:['ember_staff'],armor:['oracle_robe'],accessory:['ash_belt']},
 necro:{weapon:['mourn_grimoire'],armor:['bone_raiment'],accessory:['ash_belt']},
};
/** First-band LOOT-002/003 only. No legacy ordinary roll is added afterwards. */
export function rollP2StarterLoot(actor:{canonicalMobId?:string;level?:number},random:()=>number):LootStack[]{
 const e=p2Encounter(actor);if(!e||e.level>9)throw Error('not-p2-starter-loot');
 const roll=()=>{const r=random();if(!Number.isFinite(r)||r<0||r>=1)throw Error('invalid-p2-loot-roll');return r;};
 const result:LootStack[]=[],add=(id:string,count=1)=>{const prior=result.find(d=>d.id===id);if(prior)prior.count+=count;else result.push({id,count});};
 if(roll()<.03){
  const categoryRoll=roll(),category=categoryRoll<.4?'weapon':categoryRoll<.9?'armor':'accessory';
  const profile=lootProfileV3(e.mobId),primary=roll()<.7;
  const familyPool=primary?profile.families.slice(0,2):profile.families.slice(2);
  const family=familyPool[Math.floor(roll()*familyPool.length)];
  const pool=families[family][category].filter(id=>{
   const item=ITEMS[id as keyof typeof ITEMS];return item&&(!('requiredLevel' in item)||item.requiredLevel<=e.level)&&
    !id.startsWith('starter_')&&!id.startsWith('warden_')&&(!('slot' in item)||item.slot!=='ring');
  });
  if(!pool.length)throw Error('empty-p2-equipment-category:'+family+':'+category);add(pool[Math.floor(roll()*pool.length)]);
 }
 if(roll()<.08){const r=roll();add(r<.55?'potion':r<.95?'ether':'haste');}
 if(roll()<.01)add(roll()<.5?'weapon_scroll':'armor_scroll');
 if(roll()<.55)add(e.mobId==='MOB-05'?'iron':lootProfileV3(e.mobId).material);
 for(const item of rollAccessoryLoot(e.mobId,roll))add(item.id,item.count);
 return result;
}
