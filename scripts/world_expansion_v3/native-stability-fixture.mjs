import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {findNavigationPath} from '../../src/world/navigation.ts';

const digest=world=>createHash('sha256').update(JSON.stringify(world.state.monsters)).digest('hex');
/** Soak may have one initial approach; reject accidental per-cycle resets. */
export function createNativeStabilityFixtureRunner(world,geography,hero,{soakSeconds=0}={}){
 assert.ok(soakSeconds===0||soakSeconds===180,'Only the bounded 180-second soak is supported');
 let used=false;
 return stage=>{
  if(soakSeconds){
   assert.match(stage,/^stability:teleporter:\d+$/,'Soak permits only the initial teleporter approach');
   assert.equal(used,false,'Soak forbids repeated hero placement');
  }
  const rest=soakSeconds?chooseNativeStabilityRest(world,geography):null;
  const result=prepareNativeStabilityFixture(world,geography,hero,stage);used=true;
  return rest?{...result,soakRest:rest}:result;
 };
}
/** A nearby route destination, never a relocation or a safe-zone change. */
export function chooseNativeStabilityRest(world,geography){
 const start=geography.teleports['Чёрный лес'],collision=geography.spaces.surface.collision;
 const nearby=world.state.monsters.filter(m=>(m.spaceId??'surface')==='surface'&&Math.hypot(m.home.x-start.x,m.home.z-start.z)<110);
 for(const radius of [24,30,36])for(let i=0;i<32;i++){
  const point={x:start.x+Math.cos(i*Math.PI/16)*radius,z:start.z+Math.sin(i*Math.PI/16)*radius};
  if(collision.isBlocked(point,.46))continue;
  if(nearby.some(m=>Math.hypot(m.home.x-point.x,m.home.z-point.z)<Math.max(27,(geography.slotById.get(m.uid)?.leashRadius??14)+8)))continue;
  const path=findNavigationPath(collision,start,point,{actorRadius:.46,cellSize:.85,margin:24,maxVisited:4500});
  if(path.length)return point;
 }
 throw Error('No nearby reachable soak resting point outside monster home leashes');
}
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
