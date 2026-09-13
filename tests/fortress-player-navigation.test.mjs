import test from 'node:test';
import assert from 'node:assert/strict';
import {makeP2Geography,makeP2Simulation,stepP2} from '../scripts/world_expansion_v3/p2-combat-smoke.mjs';
import {findPlayerNavigationPath,pathSegmentIsClear} from '../src/world/navigation.ts';
const geography=makeP2Geography(),collision=geography.spaces.surface.collision;
const points=[{x:-136,z:-116},{x:-138,z:-180},{x:-160,z:-240},{x:-100,z:-190},{x:-136,z:-116}];
test('player routes descend the citadel ramp and leave through the gate within the existing search budget',()=>{
 for(let i=1;i<points.length;i++){
  const start=points[i-1],goal=points[i];assert.equal(collision.isBlocked(start,.46),false);assert.equal(collision.isBlocked(goal,.46),false);
  const path=findPlayerNavigationPath(collision,start,goal,{actorRadius:.46,cellSize:.85,margin:24,maxVisited:4500});
  assert.ok(path.length,JSON.stringify({start,goal}));let previous=start;
  for(const next of path){assert.ok(pathSegmentIsClear(collision,previous,next,.46));previous=next;}
  assert.ok(Math.hypot(previous.x-goal.x,previous.z-goal.z)<.01);
 }
});
test('ordinary single destination commands complete upper court, tavern, outskirts and return with all 1151 monsters',()=>{
 const sim=makeP2Simulation({geography}),hero=sim.createCharacter('Fortress route','knight');
 sim.relocate(hero,{...points[0],spaceId:'surface'});let seq=0;
 for(const goal of points.slice(1)){
  sim.input(hero.id,++seq,{type:'destination',...goal});let ticks=0;
  while(Math.hypot(hero.x-goal.x,hero.z-goal.z)>.25&&ticks++<1000){
   const before={x:hero.x,z:hero.z};stepP2(sim,100);
   assert.ok(Math.hypot(hero.x-before.x,hero.z-before.z)<1,'no teleport');
  }
  assert.ok(Math.hypot(hero.x-goal.x,hero.z-goal.z)<.25,JSON.stringify({hero:{x:hero.x,z:hero.z},goal}));
  assert.equal(hero.dead,false);
 }
 assert.equal(sim.state.monsters.length,1151);
});
