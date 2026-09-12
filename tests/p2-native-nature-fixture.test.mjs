import test from 'node:test';
import assert from 'node:assert/strict';
import {prepareNativeNatureFixture} from '../scripts/world_expansion_v3/p2-native-nature-fixture.mjs';
import {makeP2Geography,makeP2Simulation,stepP2} from '../scripts/world_expansion_v3/p2-combat-smoke.mjs';

const geography=makeP2Geography();
function setup(){
 const world=makeP2Simulation({geography}),hero=world.createCharacter('Природа','knight');
 hero.level=40;world.recalculate(hero);world.heartbeat(hero.id);
 return {world,hero};
}

test('nature fixture preserves every monster, geography and clock while placing only the hero',()=>{
 const {world,hero}=setup(),monsters=structuredClone(world.state.monsters),clock=world.state.time,mapVersion=geography.mapVersion;
 const result=prepareNativeNatureFixture(world,geography,hero,'p2-nature-forest');
 assert.deepEqual(world.state.monsters,monsters);assert.equal(world.state.time,clock);assert.equal(geography.mapVersion,mapVersion);
 assert.equal(result.population,1151);assert.equal(result.populationBefore,result.populationAfter);
 assert.equal(hero.x,-284);assert.equal(hero.z,-208);assert.equal(result.goals[1].z-result.goals[0].z,44);
 assert.ok(result.goals[1].height-result.goals[0].height>2);
});

test('repeated fixture is a receipt and cannot teleport or heal during the walk',()=>{
 const {world,hero}=setup(),first=prepareNativeNatureFixture(world,geography,hero,'p2-nature-forest');
 hero.x+=1;hero.hp-=1;const before=structuredClone(hero);
 first.standing.x=999;
 const again=prepareNativeNatureFixture(world,geography,hero,'p2-nature-forest');
 assert.equal(again.standing.x,-284);assert.deepEqual(hero,before);
});

test('unknown stage fails before any world or hero mutation',()=>{
 const {world,hero}=setup(),before=structuredClone(world.state);
 assert.throws(()=>prepareNativeNatureFixture(world,geography,hero,'p2-nature-unknown'),/unsupported-native-nature-stage/);
 assert.deepEqual(world.state,before);
});

test('ordinary authoritative destinations complete forest ascent/descent and real shoreline approaches',()=>{
 const {world,hero}=setup();let sequence=0,total=0;
 for(const stage of ['p2-nature-forest','p2-nature-shore']){
  const fixture=prepareNativeNatureFixture(world,geography,hero,stage),generation=hero.generation;
  for(const goal of fixture.goals){
   world.input(hero.id,++sequence,{type:'destination',x:goal.x,z:goal.z});
   let remaining=20000,metres=0;
   while(remaining>0&&(Math.hypot(hero.x-goal.x,hero.z-goal.z)>.3||hero.destination)){
    const before={x:hero.x,z:hero.z};stepP2(world,100);remaining-=100;
    const step=Math.hypot(hero.x-before.x,hero.z-before.z);assert.ok(step<1,'no teleport step');metres+=step;
    assert.equal(hero.generation,generation);assert.equal(hero.dead,false);
    assert.equal(geography.spaces.surface.collision.isBlocked(hero,.46),false);
   }
   assert.ok(remaining>0,'actual destination reached '+goal.id);total+=metres;
   if(goal.id==='uphill')assert.ok(metres>40);
  }
 }
 assert.ok(total>110,'both forest legs and shoreline used actual movement');
});
