import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';

const digest=world=>createHash('sha256').update(JSON.stringify(world.state.monsters)).digest('hex');
/** Disposable hero placement only. The following TP/portal is a normal command. */
export function prepareNativeStabilityFixture(world,geography,hero,stage){
 assert.match(stage,/^stability:(teleporter|portal-mine|portal-great_cave):\d+$/);
 const kind=stage.split(':')[1],before=digest(world),clock=world.state.time;
 const id=kind.startsWith('portal-')?kind.slice(7):null;
 const definition=id?geography.spaces[id].definition:null;
 const center=id?{x:definition.surface_portal[0],z:-definition.surface_portal[2],spaceId:'surface'}:{...geography.services['npc:teleport'],spaceId:'surface'};
 const collision=geography.spaces.surface.collision;
 let point;
 for(const radius of [1.8,2.2,1.3]){
  for(let index=0;index<24;index++){
   const candidate={x:center.x+Math.cos(index*Math.PI/12)*radius,z:center.z+Math.sin(index*Math.PI/12)*radius,spaceId:'surface'};
   if(collision.isBlocked(candidate,.46)||!world.lineOfSight(candidate,center))continue;
   point=candidate;break;
  }if(point)break;
 }
 assert.ok(point,'No valid approach to '+kind);
 world.relocate(hero,point);
 assert.equal(world.state.time,clock,'fixture must not advance clock');
 assert.equal(digest(world),before,'fixture must not rewrite monster identity/HP/AI/timers');
 return {stage,generation:hero.generation,approach:{x:point.x,z:point.z},population:world.state.monsters.length,
  ...(id?{exit:{x:definition.entry[0],z:-definition.entry[2]},surfaceReturn:{x:definition.surface_portal[0],z:-definition.surface_portal[2]-8}}:
   {npcId:'npc:teleport',destinations:Object.fromEntries(Object.entries(geography.teleports).map(([name,p])=>[name,{x:p.x,z:p.z}]))})};
}
