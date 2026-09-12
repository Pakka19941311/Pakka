import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve,sep} from 'node:path';
import {WorldStore} from '../server/world-store.mjs';
import {FinalWorld} from '../src/world/final-world.ts';
import {MONSTERS} from '../src/data/game-data.ts';
import {p2Encounter,rollP2StarterLoot} from '../src/data/p2-encounters.ts';
import {resolveMonsterDamageV3} from '../src/core/encounter-combat-v3.ts';
import {makeP2Geography,makeP2Simulation,P2MemoryStore,equipP2Reference,stepP2,runP2Battle} from '../scripts/world_expansion_v3/p2-combat-smoke.mjs';
const geography=makeP2Geography();
function fixture(classId='knight',mobId='MOB-05'){
 const sim=makeP2Simulation({geography}),p=sim.createCharacter('Бой',classId);
 const m=sim.state.monsters.find(m=>m.canonicalMobId===mobId);sim.state.monsters=[m];
 equipP2Reference(sim,p,m.level);let point;
 for(let i=0;i<32;i++){
  const q={x:m.x+Math.cos(i*Math.PI/16)*2,z:m.z+Math.sin(i*Math.PI/16)*2,spaceId:'surface'};
  if(!geography.safe(q)&&!geography.spaces.surface.collision.isBlocked(q,.46)&&sim.lineOfSight(q,m)){point=q;break;}
 }
 assert.ok(point);Object.assign(p,point,{yaw:Math.atan2(m.x-point.x,m.z-point.z)});sim.heartbeat(p.id);
 return {sim,p,m};
}

test('runtime snapshot marks only canonical first five, using slot level/name/HP and unchanged legacy wolf',()=>{
 const sim=makeP2Simulation({geography}),p=sim.createCharacter('Мета','knight');
 assert.equal(sim.state.monsters.length,1151);assert.equal(sim.state.monsters.filter(m=>m.canonicalMobId).length,150);
 for(const m of sim.state.monsters.filter(m=>m.canonicalMobId)){
  const slot=geography.slotById.get(m.uid),def=p2Encounter(m);
  assert.equal(m.level,slot.level);assert.equal(m.maxHp,def.hp);assert.equal(m.name,slot.name);assert.equal(m.balanceVersion,def.balanceVersion);
 }
 const old=sim.state.monsters.find(m=>m.id==='wolf'&&!m.canonicalMobId);
 assert.equal(old.hp,MONSTERS.wolf.hp);assert.equal(old.maxHp,undefined);assert.equal(sim.bodyRadius(old),1.615);
 const current=sim.state.monsters.find(m=>m.canonicalMobId==='MOB-02');assert.equal(sim.bodyRadius(current),.46);
 Object.assign(p,{x:current.x,z:current.z,spaceId:'surface'});sim.heartbeat(p.id);
 const snapshot=sim.snapshot(p.id);assert.ok(snapshot.monsters.some(m=>m.canonicalMobId==='MOB-02'&&m.maxHp===p2Encounter(m).hp));
 assert.throws(()=>p2Encounter({canonicalMobId:'MOB-06',level:10}),/unsupported-p2/);
});

test('passive defenders ignore proximity and canceled attempts, then respond to one real hit without pack aggression',()=>{
 const {sim,p,m}=fixture('knight','MOB-04'),other={...structuredClone(m),uid:'test:passive-neighbor',x:m.x+3,home:{...m.home,x:m.x+3}};
 sim.state.monsters.push(other);stepP2(sim,4000);assert.equal(m.targetId,null);assert.equal(other.targetId,null);
 sim.input(p.id,1,{type:'attack',entityId:m.uid,skill:null,mode:'single'});stepP2(sim,50);
 assert.equal(m.provokedBy,undefined);sim.input(p.id,2,{type:'cancel'});stepP2(sim,1000);
 assert.equal(m.hp,p2Encounter(m).hp);assert.equal(m.provokedBy,undefined);
 sim.input(p.id,3,{type:'attack',entityId:m.uid,skill:null,mode:'single'});stepP2(sim,2000);
 assert.ok(m.hp<p2Encounter(m).hp);assert.equal(m.provokedBy,p.id);assert.equal(other.provokedBy,undefined);
});

test('normal physical/magic projectiles carry type and apply only their defense reduction once',()=>{
 for(const classId of ['necro','mage']){
  const {sim,p,m}=fixture(classId);m.status.stun=1e9;p.stats.atkMin=100;p.stats.atkMax=100;p.stats.matk=100;p.stats.crit=0;
  m.bookEffects=[{id:'test-defense',owner:p.id,appliedAt:0,expiresAt:1e9,values:{defDown:2,mdefDown:0}}];
  sim.input(p.id,1,{type:'attack',entityId:m.uid,skill:null,mode:'single'});
  while(!sim.state.projectiles.length&&sim.state.time<4000)stepP2(sim,50);
  const shot=sim.state.projectiles[0];assert.ok(shot);assert.equal(shot.damageType,classId==='mage'?'magic':'physical');
  const before=m.hp;stepP2(sim,400);
  const expected=resolveMonsterDamageV3(100,shot.damageType,p2Encounter(m),'none',classId==='mage'?0:2);
  assert.equal(before-m.hp,expected);assert.equal(sim.events.filter(e=>e.kind==='hit'&&e.target===m.uid).length,1);
 }
});

test('P2 safe firing is rejected at input and after release; monster movement cannot enter protected safe space',()=>{
 const {sim,p,m}=fixture('mage');m.status.stun=1e9;const outside={x:p.x,z:p.z};
 Object.assign(p,geography.start);assert.throws(()=>sim.input(p.id,1,{type:'attack',entityId:m.uid,skill:null}),/safe-zone/);
 Object.assign(p,outside);sim.input(p.id,2,{type:'attack',entityId:m.uid,skill:null,mode:'single'});
 while(!sim.state.projectiles.length&&sim.state.time<4000)stepP2(sim,50);
 assert.equal(sim.state.projectiles.length,1);const before=m.hp;
 Object.assign(p,geography.start);stepP2(sim,400);assert.equal(m.hp,before);
 assert.equal(sim.collisionFor(m).isBlocked(geography.start,.46),true);
 assert.equal(geography.spaces.surface.collision.isBlocked(geography.start,.46),false);
 sim.damage(m,9999,p,false);assert.equal(m.hp,before);
});

test('SQLite P2 activation and off/on preserve four boss clocks plus a dead ordinary reward/generation',t=>{
 const directory=mkdtempSync(join(tmpdir(),'varendor-p2-save-')),file=join(directory,'world.sqlite');let store=new WorldStore(file);
 t.after(()=>{store.close();assert.ok(resolve(directory).startsWith(resolve(tmpdir())+sep));rmSync(directory,{recursive:true,force:true});});
 const legacy=new FinalWorld();let sim=makeP2Simulation({geography:legacy,store});
 for(const [i,m]of sim.state.monsters.filter(m=>legacy.slotById.get(m.uid)?.boss).entries())Object.assign(m,{hp:0,alive:false,generation:7+i,respawnAt:999999+i,deathAt:900,corpseUntil:950,owner:'prior-owner'});
 const bosses=structuredClone(sim.state.monsters.filter(m=>legacy.slotById.get(m.uid)?.boss));sim.checkpoint();
 const restart=map=>{store.close();store=new WorldStore(file);sim=makeP2Simulation({geography:map,store,now:1000});};
 restart(geography);assert.equal(sim.state.monsters.length,1151);assert.deepEqual(sim.state.monsters.filter(m=>geography.slotById.get(m.uid)?.boss),bosses);
 assert.equal(sim.state.starterPopulationVersion,geography.populationPlan.version);assert.equal(sim.state.starterPopulationDigest,geography.populationPlan.digest);
 const dead=sim.state.monsters.find(m=>m.canonicalMobId);Object.assign(dead,{hp:0,alive:false,generation:9,respawnAt:888888,owner:'old-winner',deathAt:950,corpseUntil:975});
 const saved=structuredClone(dead);sim.checkpoint();restart(geography);
 assert.deepEqual(sim.state.monsters.find(m=>m.uid===saved.uid),saved);
 restart(legacy);assert.equal(sim.state.monsters.length,1001);assert.equal(sim.state.starterPopulationArchive.length,150);
 restart(geography);assert.equal(sim.state.monsters.length,1151);assert.deepEqual(sim.state.monsters.find(m=>m.uid===saved.uid),saved);
 assert.deepEqual(sim.state.monsters.filter(m=>geography.slotById.get(m.uid)?.boss),bosses);
});

test('P2 loot has one ordinary profile with no rings, starter/boss items or second legacy grant',()=>{
 const actor={canonicalMobId:'MOB-01',level:1};
 assert.deepEqual(rollP2StarterLoot(actor,()=>.99),[]);
 const drops=rollP2StarterLoot(actor,()=>0);
 assert.equal(drops.filter(d=>d.id==='ember_staff').length,1);
 assert.ok(drops.some(d=>d.id==='potion'));assert.ok(drops.some(d=>d.id==='weapon_scroll'));assert.ok(drops.some(d=>d.id==='venom'));
 for(const d of drops)assert.ok(!d.id.includes('ring')&&!d.id.startsWith('starter_')&&!d.id.startsWith('warden_')&&!d.id.startsWith('book_'));
 assert.throws(()=>rollP2StarterLoot(actor,()=>1),/invalid-p2-loot/);
});

test('five classes complete all five real server attack cycles on actual terrain using starter+0 without books or forced damage',()=>{
 for(const classId of ['knight','mage','ranger','assassin','necro'])for(const mobId of ['MOB-01','MOB-02','MOB-03','MOB-04','MOB-05']){
  const result=runP2Battle({geography,classId,mobId});assert.equal(result.killed,true,classId+'/'+mobId);assert.equal(result.heroDead,false);
  assert.ok(result.playerHits>=5);assert.ok(result.playerReleaseCount>=result.playerHits);assert.ok(result.damageDealt>=result.monsterHp);
  assert.equal(result.lootEvents,1);assert.equal(result.mpSpent,0);assert.ok(result.ttk>5&&result.ttk<30);
  assert.equal(result.serverPhysics,true);assert.equal(result.nativeAnimationValidated,false);
 }
});
