import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {buildTerritory} from '../src/world/territory-layout.ts';
import {ROAD_AXES,START_POINT,SERVICES,RESIDENTS,REGION_CENTERS,LEGACY_REGION_CENTERS,isTerritorySafe} from '../src/world/territory.ts';
import {SPAWN_REGIONS,spawnPointInRegion} from '../src/world/spawn-regions.ts';
import {findNavigationPath} from '../src/world/navigation.ts';
import {mapVersion} from '../src/server/content-manifest.ts';
import {WorldStore} from '../server/world-store.mjs';
import {WorldSimulation} from '../src/server/world-simulation.ts';
const world=buildTerritory();
test('authored scene, persisted topology and server map version agree',()=>{
  assert.deepEqual(world.topology,JSON.parse(readFileSync('public/assets/world/world-topology.json')));
  assert.equal(world.territory.fort.width,70);assert.equal(world.territory.fort.depth,60);
  assert.ok(world.territory.trees.length>=230);assert.ok(world.placements.length>1500);
});
for(const route of ROAD_AXES)test('open authored road axis: '+route.id,()=>{
  for(const p of route.points)assert.equal(world.collision.isBlocked(p,.55),false,JSON.stringify(p));
});
test('both Greenfall gates pass two walking bodies and have real overhead collision',()=>{
  for(const x of [-42,28]){const z=x<0?-18:-5;
    for(const offset of [-1,1])for(let dx=-2;dx<=2;dx+=.25)assert.equal(world.collision.isBlocked({x:x+dx,z:z+offset},.46),false);
    assert.equal(world.collision.hasLineOfSight({x:x-3,z,y:1.2},{x:x+3,z,y:1.2}),true);
    assert.equal(world.collision.hasLineOfSight({x:x-3,z,y:5},{x:x+3,z,y:5}),false);
  }
});
test('all four services and six residents have free reachable positions',()=>{
  assert.equal(Object.keys(SERVICES).length,4);assert.equal(RESIDENTS.length,6);
  for(const p of [...Object.values(SERVICES),...RESIDENTS.flatMap(r=>r.route)]){
    assert.equal(world.collision.isBlocked(p,.46),false,JSON.stringify(p));
    assert.ok(findNavigationPath(world.collision,START_POINT,p).length>0,JSON.stringify(p));
  }
});
test('all 53 original monster identities and 10 types spawn outside protected zones',()=>{
  assert.equal(SPAWN_REGIONS.reduce((sum,r)=>sum+r.population,0),53);
  assert.equal(new Set(SPAWN_REGIONS.map(r=>r.monsterId)).size,10);
  for(const r of SPAWN_REGIONS)for(let i=0;i<r.population;i++){
    const p=spawnPointInRegion(r,i);assert.equal(world.collision.isBlocked(p,r.boss?1.2:.5),false,r.id);assert.equal(isTerritorySafe(p),false,r.id);
  }
  const wolves=SPAWN_REGIONS.find(r=>r.monsterId==='wolf'),first=spawnPointInRegion(wolves,0);
  for(let i=1;i<wolves.population;i++){const p=spawnPointInRegion(wolves,i);assert.ok(Math.hypot(p.x-first.x,p.z-first.z)>wolves.aggroRadius*2);}
});
test('protected southwest approach connects both settlements without extending into enemy zones',()=>{
  for(const p of ROAD_AXES[0].points)assert.equal(isTerritorySafe(p),true);
  for(const p of Object.values(REGION_CENTERS))assert.equal(isTerritorySafe(p),false);
  assert.equal(isTerritorySafe({x:40,z:-5}),false);
});
test('old map migration journals coordinates, preserves every item/character UID and survives restart once',()=>{
  const store=new WorldStore(':memory:');let serial=0;
  try{
    const sim=new WorldSimulation({store,collision:world.collision,terrain:world.terrain,now:1000,identifier:()=>`territory-${++serial}`,beta:true});
    const p=sim.createCharacter('Migration','knight');p.x=-7;p.z=-11;p.gold=777;p.quest=3;p.kills=17;
    const inventory=structuredClone(p.inventory),equipment=structuredClone(p.equipment);
    const identities=sim.state.monsters.map(m=>[m.uid,m.id,m.generation,m.hp,m.respawnAt]);
    for(const m of sim.state.monsters){const old=LEGACY_REGION_CENTERS[m.regionId];Object.assign(m,old,{home:{...old}});}
    delete sim.state.mapVersion;delete sim.state.territoryVersion;store.save(sim.state);
    const next=new WorldSimulation({store,collision:world.collision,terrain:world.terrain,now:1000,identifier:()=>`territory-${++serial}`,beta:true});
    const after=next.state.characters[p.id];assert.equal(after.gold,777);assert.equal(after.quest,3);assert.equal(after.kills,17);
    assert.deepEqual(after.inventory,inventory);assert.deepEqual(after.equipment,equipment);
    assert.deepEqual(next.state.monsters.map(m=>[m.uid,m.id,m.generation,m.hp,m.respawnAt]),identities);
    assert.equal(next.state.coordinateMigrations.length,1);
    assert.deepEqual(next.state.coordinateMigrations[0].positions.find(v=>v.id===p.id).from,{x:-7,z:-11});
    assert.equal(next.state.mapVersion,mapVersion(world.collision,world.terrain));
    assert.equal(world.collision.isBlocked(after,.46),false);
    const again=new WorldSimulation({store,collision:world.collision,terrain:world.terrain,now:1000,identifier:()=>`territory-${++serial}`});
    assert.equal(again.state.coordinateMigrations.length,1);assert.equal(again.state.characters[p.id].x,after.x);
  }finally{store.close();}
});
