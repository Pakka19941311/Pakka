import {SPAWN_REGIONS} from './spawn-regions.ts';
import type {WorldMonster} from '../network/world-protocol.ts';
import type {SpawnSlot} from './final-world.ts';

export const LEGACY_FINAL_POPULATION_REPAIR_VERSION=1;
const obsoleteSlots=new Map<string,{speciesId:string;boss:boolean}>(SPAWN_REGIONS.flatMap(region=>Array.from({length:region.population},(_,i)=>[
  `${region.id}:${i}`,{speciesId:region.monsterId,boss:Boolean(region.boss)},
] as const)));

/** Only the exact old small-map slots are recognized. Unknown records and
 * authored wf/v3 slots are never retired by a prefix or coordinate heuristic. */
export function obsoleteFinalPopulation(monsters:readonly WorldMonster[],slots:readonly SpawnSlot[]):WorldMonster[]{
 const active=new Set(slots.map(s=>s.uid)),species=new Set(slots.map(s=>s.speciesId));
 return monsters.filter(m=>!m.canonicalMobId&&!m.temporaryOwner&&m.nightIndex===undefined&&!m.pairId
  &&!active.has(m.uid)&&obsoleteSlots.get(m.uid)?.speciesId===m.id&&species.has(m.id));
}

export type LegacyPopulationArchive={monster:WorldMonster;replacementUid?:string};
/** An older launcher could append small-map spawns to an already migrated
 * final-world save. Keep the authoritative records, including dead bosses and
 * their deadlines. Preserve every retired record in the same save transaction.
 * A missing boss counterpart is ambiguous and must not be replaced by a fresh
 * full-health spawn. Leave the original save intact for explicit recovery.
 */
export function repairLegacyFinalPopulation(current:readonly WorldMonster[],slots:readonly SpawnSlot[]):{
 monsters:WorldMonster[];archived:LegacyPopulationArchive[];retiredUids:string[];
}{
 const candidates=obsoleteFinalPopulation(current,slots),active=new Set(slots.map(s=>s.uid));
 const present=new Map(current.filter(m=>active.has(m.uid)).map(m=>[m.uid,m]));
 const retired=new Set<string>(),archived:LegacyPopulationArchive[]=[];
 for(const m of candidates){
  const old=obsoleteSlots.get(m.uid)!;
  const counterparts=slots.filter(s=>s.speciesId===m.id&&Boolean(s.boss)===old.boss);
  if(!counterparts.length)continue;
  for(const s of counterparts){const existing=present.get(s.uid);if(existing&&existing.id!==s.speciesId)throw Error('legacy-population-species-mismatch:'+s.uid);}
  let replacementUid:string|undefined;
  if(old.boss){
   if(counterparts.length!==1)throw Error('legacy-population-boss-ambiguous:'+m.uid);
   const slot=counterparts[0];replacementUid=slot.uid;
   if(!present.has(slot.uid))throw Error('legacy-population-boss-counterpart-missing:'+m.uid);
  }else if(!counterparts.some(s=>present.has(s.uid))){
   // No proof of an accidentally duplicated cohort: do not discard it.
   continue;
  }
  retired.add(m.uid);archived.push({monster:structuredClone(m),...(replacementUid?{replacementUid}:{})});
 }
 // A retired boss's temporary children cannot survive as ownerless attackers.
 let added=true;
 while(added){added=false;for(const m of current)if(m.temporaryOwner&&retired.has(m.temporaryOwner)&&!retired.has(m.uid)){
  retired.add(m.uid);archived.push({monster:structuredClone(m)});added=true;
 }}
 return {monsters:current.filter(m=>!retired.has(m.uid)),archived,retiredUids:[...retired]};
}
