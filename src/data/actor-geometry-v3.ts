/** Measured production rigs (metres), approved 2026-09-12. Geometry only:
 * no HP, damage, rewards, attack cadence or ranged-distance changes. */
export const ACTOR_GEOMETRY_VERSION='production-torso-20260912-v1';
export type ActorGeometryV3=Readonly<{height:number;bodyRadius:number;sourceHeight:number;impactHeight:number}>;
const GEOMETRY:Readonly<Record<string,ActorGeometryV3>>={
  fire_golem:{height:6.2,bodyRadius:1.5,sourceHeight:4.9,impactHeight:3.84},
  ice_golem:{height:6.2,bodyRadius:1.3,sourceHeight:4.34,impactHeight:3.89},
  rift_boss:{height:10.2,bodyRadius:2.4,sourceHeight:8.05,impactHeight:6.42},
  cave_boss:{height:10.2,bodyRadius:2.4,sourceHeight:8.05,impactHeight:6.42},
  'MOB-05':{height:2.05,bodyRadius:1,sourceHeight:1.16,impactHeight:1.1275},
};
export function actorGeometryV3(actor:{id?:string;canonicalMobId?:string},mode?:string):ActorGeometryV3|null {
  if(mode!=='starter-v3')return null;
  // Canonical identity wins: unactivated cohorts must never inherit a model by alias.
  return GEOMETRY[actor.canonicalMobId??actor.id??'']??null;
}
export function bodyContactReach(base:number,actorRadius:number,targetRadius:number):number {
  return Math.max(base,actorRadius+targetRadius+.35);
}
