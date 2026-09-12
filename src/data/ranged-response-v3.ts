import type {EncounterDamageTypeV3,EncounterElementV3} from '../core/encounter-combat-v3.ts';
/** Explicit candidate action only. Never supplies creature stats, levels or loot. */
export const RANGED_RESPONSE_V3={version:'legacy-aimed-line-v3-1',populationMode:'starter-v3',
  range:16,cooldown:7,windup:1.2,recovery:1.6,halfWidth:.9,multiplier:1.2,
  mode:'aimed-line',type:'magic' as EncounterDamageTypeV3} as const;
const ELEMENTS:Record<string,EncounterElementV3>={fire_golem:'fire',ice_golem:'ice',rift_boss:'fire'};
export function rangedResponseV3(speciesId:string,canonicalMobId?:string){
  const element=ELEMENTS[speciesId];
  return !canonicalMobId&&element?{...RANGED_RESPONSE_V3,element}:null;
}
export const CAVE_RANGED_TIMING_V3={range:13,radius:4,windup:1.4,recovery:.5,cooldown:9,multiplier:1.4} as const;
