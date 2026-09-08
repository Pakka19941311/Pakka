import { START_POINT, LEGACY_REGION_CENTERS, REGION_CENTERS, TERRITORY_VERSION } from './territory.ts';
import { SPAWN_REGIONS, spawnPointInRegion } from './spawn-regions.ts';
import type { Position } from '../network/world-protocol.ts';
import type { CollisionWorld } from './collision-world.ts';
import type { PersistedWorld } from '../server/world-simulation.ts';

export function legacyTerritoryPosition(p:Position):Position{
  if(Math.abs(p.x+108)<27&&Math.abs(p.z+82)<26)return {...p};
  if(Math.hypot(p.x+7,p.z+8.5)<31)return {x:START_POINT.x+(p.x+7)*.7,z:START_POINT.z+(p.z+11)*.7};
  const entry=Object.entries(LEGACY_REGION_CENTERS).sort((a,b)=>Math.hypot(p.x-a[1].x,p.z-a[1].z)-Math.hypot(p.x-b[1].x,p.z-b[1].z))[0];
  if(Math.hypot(p.x-entry[1].x,p.z-entry[1].z)>48)return {...START_POINT};
  return {x:REGION_CENTERS[entry[0]].x+p.x-entry[1].x,z:REGION_CENTERS[entry[0]].z+p.z-entry[1].z};
}
/** One durable world-state write contains both old coordinates and new ones.
 * Character/item identities, economy, quest, drops and monster timers survive.
 * In-flight attacks belong to the old geometry and are cancelled at the seam. */
export function migrateTerritory(state:PersistedWorld,collision:CollisionWorld,mapVersion:string):void{
  if(state.mapVersion===mapVersion)return;
  const fromVersion=state.territoryVersion??2;
  const journal:{id:string;kind:string;from:Position;to:Position;oldHome?:Position}[]=[];
  for(const p of Object.values(state.characters)){
    const from={x:p.x,z:p.z},desired=fromVersion<3?legacyTerritoryPosition(from):from;
    const to=collision.findNearestFree({x:Math.max(-146,Math.min(146,desired.x)),z:Math.max(-125,Math.min(123,desired.z))},.46);
    journal.push({id:p.id,kind:'character',from,to});Object.assign(p,to);
    p.destination=null;p.direction={x:0,z:0};p.target=null;p.autoAttack=false;
  }
  for(const m of state.monsters){
    const region=SPAWN_REGIONS.find(r=>r.id===m.regionId);
    const oldHome={...m.home},from={x:m.x,z:m.z};
    const wanted=region?spawnPointInRegion(region,m.patrolIndex):fromVersion<3?legacyTerritoryPosition(m.home):m.home;
    const home=collision.findNearestFree(wanted,m.id==='big'?1.2:m.id==='mini'?.9:.42);
    journal.push({id:m.uid,kind:'monster',from,to:home,oldHome});Object.assign(m,home,{home});
    m.owner=undefined;
  }
  for(const s of state.summons){
    const from={x:s.x,z:s.z};const owner=state.characters[s.owner];
    const to=collision.findNearestFree(owner??(fromVersion<3?legacyTerritoryPosition(from):from),.4);
    journal.push({id:s.uid,kind:'summon',from,to});Object.assign(s,to);
  }
  state.coordinateMigrations??=[];
  state.coordinateMigrations.push({at:state.time,from:state.mapVersion??'legacy-terrain-2',to:mapVersion,positions:journal});
  state.pending=[];state.projectiles=[];state.mapVersion=mapVersion;state.territoryVersion=TERRITORY_VERSION;state.revision++;
}
