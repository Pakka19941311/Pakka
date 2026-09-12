import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {findNavigationPath,pathSegmentIsClear} from '../../src/world/navigation.ts';
import {STARTER_ITEMS} from '../../src/data/starter-progression-v3.ts';

const prepared=new WeakMap();
const hash=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
const sites={
 'p2-nature-forest':{region:'forest',standing:{x:-284,z:-208},yaw:.5,pitch:.24,
  goals:[{id:'approach',x:-263,z:-224},{id:'uphill',x:-263,z:-180},{id:'downhill',x:-263,z:-224}],minimumContinuousMetres:40},
 'p2-nature-shore':{region:'shore',standing:{x:-40,z:72},yaw:-.695,pitch:.51,
  goals:[{id:'shore-up',x:-42,z:72},{id:'shore-return',x:-40,z:72}],minimumContinuousMetres:0},
};

/** Initial placement only, on the disposable stage server. A repeated request
 * returns the original receipt; it cannot relocate/heal the hero during a walk.
 * No spawn, monster, tree, world clock, light or terrain state is changed. */
export function prepareNativeNatureFixture(world,geography,hero,stage){
 assert.equal(geography.populationMode,'starter-v3');
 assert.equal(geography.natureSamplePath,'nature/p2-sample-v3/collision.json');
 assert.ok(Object.hasOwn(sites,stage),'unsupported-native-nature-stage');
 const key=hero.id+':'+stage,receipts=prepared.get(world)??new Map();
 if(receipts.has(key))return structuredClone(receipts.get(key));
 const site=sites[stage],surface=geography.spaces.surface;
 assert.equal(surface.collision.isBlocked(site.standing,.54),false,'nature-initial-position-blocked');
 let from=site.standing;
 const goals=site.goals.map(goal=>{
  assert.equal(surface.collision.isBlocked(goal,.54),false,'nature-goal-blocked:'+goal.id);
  const route=findNavigationPath(surface.collision,from,goal,{actorRadius:.54});
  assert.ok(route.length&&Math.hypot(route.at(-1).x-goal.x,route.at(-1).z-goal.z)<.1,'nature-unreachable:'+goal.id);
  let anchor=from;
  for(const point of route){assert.ok(pathSegmentIsClear(surface.collision,anchor,point,.54),'nature-route-obstacle:'+goal.id);anchor=point;}
  const value={...goal,height:surface.terrain.heightAt(goal.x,goal.z),route};from=goal;return value;
 });
 const populationBefore=hash(world.state.monsters),clockBefore=world.state.time;
 const equipmentIds=['starter_weapon_'+hero.classId,'starter_chest_'+hero.classId,'starter_head','starter_gloves','starter_boots','starter_belt'];
 hero.equipment=Object.fromEntries(equipmentIds.map(id=>[STARTER_ITEMS[id].slot,world.item(id)]));
 world.recalculate(hero);hero.dead=false;hero.hp=hero.maxHp;hero.mp=hero.maxMp;
 world.relocate(hero,{...site.standing,spaceId:'surface'});
 assert.equal(hash(world.state.monsters),populationBefore,'nature-fixture-mutated-monsters');
 assert.equal(world.state.time,clockBefore,'nature-fixture-mutated-clock');
 const result={stage,region:site.region,standing:{...site.standing},height:surface.terrain.heightAt(site.standing.x,site.standing.z),
  yaw:site.yaw,pitch:site.pitch,distance:10.5,goals,minimumContinuousMetres:site.minimumContinuousMetres,
  generation:hero.generation,population:world.state.monsters.length,populationBefore,populationAfter:populationBefore,
  mapVersion:geography.mapVersion,clockBefore,heroId:hero.id,heroLevel:hero.level,equipmentIds,
  method:'One initial hero-only placement per site; ordinary destination intents thereafter. Existing monsters, terrain, lighting and clock remain live.'};
 receipts.set(key,result);prepared.set(world,receipts);return structuredClone(result);
}
