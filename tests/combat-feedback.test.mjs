import test from 'node:test';
import assert from 'node:assert/strict';
import { WorldSimulation } from '../src/server/world-simulation.ts';
import { CollisionWorld } from '../src/world/collision-world.ts';
import { TerrainSurface } from '../src/world/terrain-surface.ts';
import { classAttackRange } from '../src/core/game-rules.ts';

function fixture(classId='ranger', obstacle, random=()=>.01) {
  const collision=new CollisionWorld();obstacle?.(collision);
  const terrain=new TerrainSurface();terrain.heights.fill(0);
  let serial=0;
  const store={load:()=>null,save:()=>{}};
  const world=new WorldSimulation({store,collision,terrain,now:1000,identifier:()=>`feedback-${++serial}`,random});
  const p=world.createCharacter('Проверка',classId);
  const m=world.state.monsters.find(m=>m.id==='wolf');
  Object.assign(p,{x:30,z:18});world.heartbeat(p.id);
  Object.assign(m,{x:30,z:30,home:{x:30,z:30},regionId:undefined});
  m.status.stun=100000;world.state.monsters=[m];
  const advance=(ms,onTick=()=>{})=>{for(let left=ms;left>0;left-=50){world.heartbeat(p.id);world.advance(world.state.time+Math.min(left,50));onTick();}};
  return {world,p,m,collision,advance};
}
const gap=(a,b)=>Math.hypot(a.x-b.x,a.z-b.z);

for(const classId of ['ranger','mage','necro'])test(`${classId} circles blocked shot and releases at ranged distance`,()=>{
  const {world,p,m,collision,advance}=fixture(classId);
  // Selection requires LOS. This scenario covers a valid selected target
  // becoming occluded during pursuit, rather than selecting through a wall.
  assert.equal(collision.hasLineOfSight({...p,y:1.3},{...m,y:1.3},.04),true);
  world.input(p.id,1,{type:'attack',entityId:m.uid,skill:null});
  collision.addBox(30,24,2,.3,0,0,8);
  assert.equal(collision.hasLineOfSight({...p,y:1.3},{...m,y:1.3},.04),false);
  let releaseDistance=null,nearest=Infinity;
  advance(10000,()=>{
    nearest=Math.min(nearest,gap(p,m));
    if(releaseDistance===null&&world.events.some(e=>e.kind==='release'&&e.actor===p.id))releaseDistance=gap(p,m);
    assert.equal(collision.isBlocked(p,.46),false,'approach stays outside static collision');
  });
  assert.ok(releaseDistance!==null,'a valid firing angle must eventually produce a projectile');
  assert.ok(releaseDistance<=classAttackRange(classId)+.05);
  assert.ok(releaseDistance>=classAttackRange(classId)*.7,'LOS failure must not reduce the shot to melee range');
  assert.ok(nearest>classAttackRange(classId)*.6,'path must not pass through the target body');
  assert.ok(world.events.some(e=>e.kind==='hit'&&e.actor===p.id&&e.target===m.uid));
});

test('fully occluded target rejects new selection and cancels existing pursuit without fake attacks',()=>{
  const enclose=c=>{
    c.addBox(30,27,3.5,.4,0,0,8);c.addBox(30,33,3.5,.4,0,0,8);
    c.addBox(27,30,.4,3.5,0,0,8);c.addBox(33,30,.4,3.5,0,0,8);
  };
  const blocked=fixture('ranger',enclose);
  assert.throws(()=>blocked.world.input(blocked.p.id,1,{type:'attack',entityId:blocked.m.uid,skill:null}),/target-occluded/);
  assert.equal(blocked.p.target,null);assert.equal(blocked.world.state.pending.length,0);
  const {world,p,m,collision,advance}=fixture('ranger');
  const before={x:p.x,z:p.z};
  world.input(p.id,1,{type:'attack',entityId:m.uid,skill:null});enclose(collision);advance(1500);
  assert.equal(p.target,null);assert.equal(p.autoAttack,false);
  assert.deepEqual({x:p.x,z:p.z},before);
  assert.ok(world.events.some(e=>e.kind==='cancel'&&e.actor===p.id&&e.reason==='no-free-path'));
  assert.equal(world.events.some(e=>e.kind==='attack'&&e.actor===p.id),false);
});

test('ranged impact precedes death and loot, dead actor stops immediately and cannot attack again',()=>{
  const {world,p,m,advance}=fixture();m.hp=1;
  world.input(p.id,1,{type:'attack',entityId:m.uid,skill:null});
  let released=false;
  for(let i=0;i<80&&m.alive;i++)advance(50,()=>{
    released ||= world.events.some(e=>e.kind==='release'&&e.actor===p.id);
    if(!released)assert.equal(m.hp,1,'windup must not apply ranged damage');
  });
  const events=world.events.filter(e=>e.actor===p.id||e.actor===m.uid);
  const index=kind=>events.findIndex(e=>e.kind===kind);
  assert.ok(index('attack')>=0&&index('attack')<index('release'));
  assert.ok(index('release')<index('hit')&&index('hit')<index('death')&&index('death')<index('loot'));
  assert.equal(m.alive,false);assert.equal(m.action,'death');assert.equal(m.hp,0);
  assert.equal(world.snapshot(p.id).monsters[0].aiState,'dead','lethal impact enters Dead immediately');
  assert.equal(world.state.pending.some(a=>a.actor===m.uid||a.target===m.uid),false);
  const deathPosition={x:m.x,z:m.z},sequence=world.state.sequence;
  m.status.stun=0;advance(650);
  assert.deepEqual({x:m.x,z:m.z},deathPosition);
  assert.equal(world.snapshot(p.id).monsters[0].aiState,'corpse','after death animation only the noncombat corpse remains');
  // The server's corpse deadline is the contract; 1100 ms was an obsolete fixture delay.
  const corpseUntil=m.corpseUntil;assert.ok(corpseUntil>world.state.time);
  world.heartbeat(p.id);world.advance(corpseUntil-.01);
  assert.ok(world.state.time<corpseUntil);assert.equal(world.snapshot(p.id).monsters[0].aiState,'corpse');
  world.advance(corpseUntil+50);assert.ok(world.state.time>=corpseUntil);
  assert.equal(world.snapshot(p.id).monsters[0].aiState,'despawn');assert.equal(m.alive,false);assert.equal(m.hp,0);
  assert.deepEqual({x:m.x,z:m.z},deathPosition);
  assert.equal(world.events.some(e=>e.sequence>sequence&&e.actor===m.uid&&e.kind==='attack'),false);
  assert.equal(world.events.filter(e=>e.kind==='loot').length,1);
});

test('world AI approaches an active player, attacks and returns home after losing the player',()=>{
  const {world,p,m,advance}=fixture('knight',undefined,()=>.5);
  Object.assign(p,{x:30,z:24,hp:10000,maxHp:10000});m.status.stun=0;
  const states=new Set();const initial=gap(p,m);
  advance(5000,()=>states.add(world.snapshot(p.id).monsters[0].aiState));
  assert.ok(states.has('aggro')||states.has('chase'));
  assert.ok(states.has('attack'));assert.ok(gap(p,m)<initial);
  assert.ok(world.events.some(e=>e.kind==='attack'&&e.actor===m.uid&&e.target===p.id));
  assert.ok(world.events.some(e=>e.kind==='hit'&&e.actor===m.uid&&e.target===p.id));
  const sequence=world.state.sequence;
  Object.assign(p,{x:-7,z:-11}); // Existing protected spawn: no eligible target.
  advance(5500,()=>states.add(world.snapshot(p.id).monsters[0].aiState));
  assert.ok(states.has('leash')||states.has('return'));
  assert.ok(gap(m,m.home)<=.55,'monster returns to its own home');
  assert.equal(world.events.some(e=>e.sequence>sequence&&e.kind==='hit'&&e.actor===m.uid),false);
});

test('world AI reaches actual contact but RNG .01 produces evasion misses without HP loss',()=>{
  const {world,p,m,advance}=fixture('knight',undefined,()=>.01);
  Object.assign(p,{x:30,z:24});m.status.stun=0;const before=p.hp;
  assert.ok(p.stats.evasion/100>.01,'fixture roll is explicitly inside the live evasion interval');
  advance(5000);
  const attacks=world.events.filter(e=>e.kind==='attack'&&e.actor===m.uid&&e.target===p.id);
  const misses=world.events.filter(e=>e.kind==='miss'&&e.actor===m.uid&&e.target===p.id);
  assert.ok(attacks.length>=2);assert.equal(misses.length,attacks.length);
  for(const miss of misses)assert.ok(attacks.some(a=>a.impactAt<=miss.at+1e-6&&a.endsAt>=miss.at),'miss occurs at an actual attack contact');
  assert.equal(world.events.some(e=>e.kind==='hit'&&e.actor===m.uid&&e.target===p.id),false);
  assert.equal(p.hp,before);
});

test('ordinary world monsters patrol with no eligible players, and heroes expose integer level',()=>{
  const {world,p,m,advance}=fixture('knight');
  // Use the actual region and home generated by a clean authoritative world.
  let serial=0;
  const original=new WorldSimulation({store:{load:()=>null,save:()=>{}},collision:new CollisionWorld(),now:1000,identifier:()=>`patrol-${++serial}`,random:()=>.01});
  const regionMonster=original.state.monsters.find(actor=>actor.id==='wolf');
  Object.assign(m,regionMonster);m.status.stun=0;Object.assign(p,{x:-7,z:-11,level:7});
  const start={x:m.x,z:m.z};let moved=0;const states=new Set();
  advance(6000,()=>{moved=Math.max(moved,gap(m,start));states.add(world.snapshot(p.id).monsters[0].aiState);});
  assert.ok(states.has('patrol'));assert.ok(moved>.5,'ordinary NPC-free world must still visibly patrol');
  assert.equal(world.snapshot(p.id).heroes[0].level,7);
});
