import {P2_STAGED_SLOTS_V3,P2_STAGED_POPULATION_META} from '../data/p2-starter-population-v3.ts';
import type {SpawnSlot} from './final-world.ts';

export type P2PopulationMode='legacy'|'starter-v3';
export type P2PopulationPlan={mode:P2PopulationMode;version:string;digest:string;slots:SpawnSlot[];retiredLegacyUids:string[]};
const p2Uids=new Set<string>(P2_STAGED_SLOTS_V3.map(s=>s.uid));

/** Selects a small explicit population overlay. The broad administrative L02
 * contour is intentionally absent: it must never turn into a combat safe zone.
 * There is no registration of the remaining 43 species or 12 new minibosses.
 */
export function selectP2Population(legacy:readonly SpawnSlot[],mode:P2PopulationMode='legacy'):P2PopulationPlan{
 if(mode!=='legacy'&&mode!=='starter-v3')throw Error('unknown-population-mode');
 if(new Set(legacy.map(s=>s.uid)).size!==legacy.length)throw Error('duplicate-legacy-spawn-uid');
 if(mode==='legacy')return {mode,version:'legacy',digest:'legacy',slots:structuredClone([...legacy]),retiredLegacyUids:[]};
 const retired=legacy.filter(s=>s.locationId==='L02'&&!s.boss&&!p2Uids.has(s.uid));
 const removed=new Set(retired.map(s=>s.uid));
 const preserved=legacy.filter(s=>!removed.has(s.uid)&&!p2Uids.has(s.uid));
 // structuredClone makes mutable patrol arrays for the existing server contract.
 const additions=P2_STAGED_SLOTS_V3.map(s=>({...structuredClone(s),patrol:[]}));
 const slots:SpawnSlot[]=[...structuredClone(preserved),...additions];
 if(new Set(slots.map(s=>s.uid)).size!==slots.length)throw Error('duplicate-p2-spawn-uid');
 if(additions.length!==150||additions.some(s=>s.boss||s.locationId!=='L02'))throw Error('invalid-p2-starter-scope');
 return {mode,version:P2_STAGED_POPULATION_META.version,digest:P2_STAGED_POPULATION_META.digest,
  slots,retiredLegacyUids:retired.map(s=>s.uid).sort()};
}

export type P2ArchivedMonster<T>={uid:string;reason:'replaced-l02-slot'|'population-mode-disabled';populationVersion:string;monster:T};
/** Pure, idempotent persistence plan. The caller persists this together with
 * the world state and initializes missing slots once using the normal spawn
 * constructor. A restored record retains HP/death/generation/reward/respawn
 * fields verbatim. Nothing regenerates a boss or rolls a timer here.
 */
export function remapP2SavedMonsters<T extends {uid:string;id:string}>(current:readonly T[],plan:P2PopulationPlan,
 previousArchive:readonly P2ArchivedMonster<T>[]=[]):{monsters:T[];archive:P2ArchivedMonster<T>[];missingSlotUids:string[];restoredUids:string[];retiredUids:string[];relocatedUids:string[]}{
 if(new Set(current.map(m=>m.uid)).size!==current.length)throw Error('duplicate-saved-monster-uid');
 const retired=new Set(plan.retiredLegacyUids),active=new Set(plan.slots.map(s=>s.uid));
 const archive=new Map(previousArchive.map(entry=>[entry.uid,structuredClone(entry)]));
 const monsters:T[]=[],retiredUids:string[]=[],restoredUids:string[]=[];
 for(const original of current){
  const m=structuredClone(original);
  const reason=retired.has(m.uid)?'replaced-l02-slot':plan.mode==='legacy'&&p2Uids.has(m.uid)?'population-mode-disabled':null;
  if(reason){archive.set(m.uid,{uid:m.uid,reason,populationVersion:plan.version,monster:m});retiredUids.push(m.uid);}
  else monsters.push(m);
 }
 const present=new Set(monsters.map(m=>m.uid));
 for(const [uid,entry]of archive){
  if(active.has(uid)&&!present.has(uid)){
   monsters.push(structuredClone(entry.monster));present.add(uid);archive.delete(uid);restoredUids.push(uid);
  }
 }
 const relocatedUids:string[]=[];
 if(plan.mode==='starter-v3')for(const original of monsters){
  const slot=plan.slots.find(s=>s.uid===original.uid&&s.canonicalMobId);if(!slot)continue;
  const m=original as T&{home?:{x:number;z:number;spaceId?:string};x?:number;z?:number;spaceId?:string;
   alive?:boolean;action?:string;combatState?:string;targetId?:string|null;provokedBy?:string};
  if(!m.home||!Number.isFinite(m.home.x)||!Number.isFinite(m.home.z)||Math.hypot(m.home.x-slot.x,m.home.z-slot.z)<.001)continue;
  // A layout revision never heals, revives, rerolls a clock or teleports an
  // active combatant. Engaged bodies receive only their eventual return home.
  m.home={x:slot.x,z:slot.z,spaceId:slot.spaceId};
  if(m.alive&&(m.action??'idle')==='idle'&&(m.combatState??'idle')==='idle'&&!m.targetId&&!m.provokedBy){
   Object.assign(m,{x:slot.x,z:slot.z,spaceId:slot.spaceId});relocatedUids.push(m.uid);
  }
 }
 return {monsters,archive:[...archive.values()].sort((a,b)=>a.uid.localeCompare(b.uid)),
  missingSlotUids:plan.slots.filter(s=>!present.has(s.uid)).map(s=>s.uid),restoredUids,retiredUids,relocatedUids};
}
