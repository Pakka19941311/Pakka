import {PROGRESSION_QUESTS,progressionQuestHunt} from '../data/progression-quests-v3.ts';
import {STARTER_CLASSES} from '../data/starter-progression-v3.ts';
import {progressionHuntKey,recordProgressionQuestEvent} from '../core/progression-quests-v3.ts';
import type {ProgressionQuestState,ProgressionWorldBindings} from '../core/progression-quests-v3.ts';
import type {FinalWorld} from '../world/final-world.ts';
import {inPolygon} from '../world/final-world.ts';
import {sameSpace,spatialDistance} from '../world/world-space.ts';
import type {SpatialPoint} from '../world/world-space.ts';

/** References to existing authored roads/rooms. Coordinates stay in their source files. */
export const PROGRESSION_MARKER_SOURCES={
 'q110:outlook-a':{road:'living-forest-loop',indices:[3]},'q110:outlook-b':{road:'living-forest-loop',indices:[18]},
 'q120:shore-a':{road:'fort-lake',indices:[18]},'q120:shore-b':{road:'fort-lake',indices:[33]},
 'q125:mine-exterior':{road:'mine-cave-link',indices:[3]},
 'q130:chamber-a':{rooms:['west_working']},'q130:chamber-b':{rooms:['east_ore']},'q130:chamber-c':{rooms:['pump_chamber']},
 'q131:street-a':{road:'lake-sanctuary',indices:[6]},'q131:street-b':{road:'lake-sanctuary',indices:[11]},'q131:street-c':{road:'lake-sanctuary',indices:[17]},
 'q140:swamp-a':{road:'swamp-path',indices:[6]},'q140:swamp-b':{road:'swamp-path',indices:[15]},
 'q141:cave-route':{rooms:['central_hall','west_gallery','cistern']},
} as const;
export type BoundQuestMarker={id:string;runtimeId:string;locationId:string;spaceId:SpatialPoint['spaceId'];text:string;points:SpatialPoint[];radius:number};
export type ProgressionWorldRuntime={bindings:ProgressionWorldBindings;markers:BoundQuestMarker[];unavailable:string[]};
export function bindProgressionQuestWorld(world?:FinalWorld):ProgressionWorldRuntime{
 const result:ProgressionWorldRuntime={bindings:{revision:world?.mapVersion??'no-final-world',markers:{},huntKeys:[]},markers:[],unavailable:[]};
 if(!world)return result;
 for(const quest of PROGRESSION_QUESTS)for(const marker of quest.markers){
  const source=PROGRESSION_MARKER_SOURCES[marker.id as keyof typeof PROGRESSION_MARKER_SOURCES];
  const raw:number[][]='road' in source?source.indices.map(index=>world.layout.roads.find((r:{id:string})=>r.id===source.road)?.points_xyz[index]):
   source.rooms.map(id=>{const room=world.spaces[marker.spaceId].definition.rooms.find((r:{id:string})=>r.id===id);return room?[room.center[0],0,room.center[1]]:undefined;});
  if(raw.some(point=>!point||point.length!==3||!point.every(Number.isFinite))){result.unavailable.push(marker.id+':missing-source');continue;}
  const points=raw.map(point=>({x:point[0],z:-point[2],spaceId:marker.spaceId})),space=world.spaces[marker.spaceId];
  const location=world.layout.locations.find((l:{id:string})=>l.id===marker.locationId);
  if(points.some(point=>space.collision.isBlocked(point,.46)||!Number.isFinite(space.terrain.supportAt(point.x,point.z))||
   marker.spaceId==='surface'&&(!location||!inPolygon(point.x,-point.z,location.outline_xz)))){result.unavailable.push(marker.id+':blocked-or-outside');continue;}
  const runtimeId='progression:'+marker.id;
  result.bindings.markers[marker.id]={runtimeId,locationId:marker.locationId,spaceId:marker.spaceId};
  result.markers.push({id:marker.id,runtimeId,locationId:marker.locationId,spaceId:marker.spaceId,text:marker.text,points,radius:4});
 }
 for(const quest of PROGRESSION_QUESTS)for(const classId of STARTER_CLASSES){
  const hunt=progressionQuestHunt(quest.id,classId);if(!hunt)continue;
  // Catalogue rows alone do not create encounters. Require actual, level-tagged authored slots.
  const slots=world.slots.filter(s=>!s.boss&&s.speciesId===hunt.speciesId&&s.subzoneId===hunt.subzoneId&&s.locationId===hunt.locationId&&s.spaceId===hunt.spaceId&&
   Number.isSafeInteger(s.level)&&s.level!>=hunt.levelMin&&s.level!<=hunt.levelMax);
  if(slots.length>=hunt.count)(result.bindings.huntKeys as string[]).push(progressionHuntKey(quest.id,classId));
  else result.unavailable.push(progressionHuntKey(quest.id,classId)+':missing-encounters');
 }
 return result;
}
type Observation={generation:number;lastAt:number;point:SpatialPoint;markers:Record<string,{index:number;outside:boolean;since?:number}>};
/** Runtime-only continuity, never accepted from a client/save. Teleport/reconnect resets route entry and dwell. */
export class ProgressionQuestObserver{
 private observations=new Map<string,Observation>();
 target(heroId:string,marker:BoundQuestMarker):SpatialPoint|undefined{return marker.points[this.observations.get(heroId)?.markers[marker.id]?.index??0];}
 observe<T extends ProgressionQuestState&{generation:number;grounded:boolean;stats:{speed:number};activeUntil:number}>(state:T,now:number,runtime:ProgressionWorldRuntime,lineOfSight:(a:SpatialPoint,b:SpatialPoint)=>boolean):T{
  const active=PROGRESSION_QUESTS.filter(q=>state.progressionQuests?.quests[q.id]?.status==='active');
  if(!active.length||state.dead||state.hp<=0||!state.grounded||state.activeUntil<=now){this.observations.delete(state.id);return state;}
  const old=this.observations.get(state.id),elapsed=old?(now-old.lastAt)/1000:0;
  const continuous=Boolean(old&&old.generation===state.generation&&elapsed>0&&elapsed<=2&&sameSpace(old.point,state)&&spatialDistance(old.point,state)<=Math.max(0,state.stats.speed)*elapsed+1);
  const current:Observation={generation:state.generation,lastAt:now,point:{x:state.x,z:state.z,spaceId:state.spaceId},markers:continuous?old!.markers:{}};
  let next=state;
  for(const marker of runtime.markers){
   if(!active.some(q=>q.markers.some(m=>m.id===marker.id))||!sameSpace(state,marker.points[0]))continue;
   const progress=current.markers[marker.id]??={index:0,outside:false},point=marker.points[progress.index];
   if(!point)continue;
   const near=spatialDistance(state,point)<=marker.radius&&lineOfSight(state,point);
   if(!near){progress.outside=true;delete progress.since;continue;}
   if(!continuous||!progress.outside)continue;
   progress.since??=now;
   if(now-progress.since<1000)continue;
   progress.index++;progress.outside=false;delete progress.since;
   if(progress.index===marker.points.length)next=recordProgressionQuestEvent(next,{kind:'marker',runtimeId:marker.runtimeId,locationId:marker.locationId,spaceId:marker.spaceId!},runtime.bindings);
  }
  this.observations.set(state.id,current);return next;
 }
}
