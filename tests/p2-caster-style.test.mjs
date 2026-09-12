import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const report=()=>JSON.parse(readFileSync('docs/world-expansion-v3/P2_CASTER_STYLE.json'));
test('actual wounded casters receive no passive HP during two minutes at a safe city service',()=>{
 const r=report();assert.equal(r.sourcesChangedDuringRun,false);assert.equal(r.rest.length,2);
 for(const c of r.rest){assert.equal(c.population,1151);assert.equal(c.safe,true);assert.ok(c.battle.killed);assert.ok(c.battle.damageTaken>0);
  assert.ok(c.beforeRest.hp<c.beforeRest.maxHp);assert.ok(Math.abs(c.afterRest.at-c.beforeRest.at-120000)<.001);assert.equal(c.samples.length,12);
  assert.ok(c.samples.every(s=>s.hp===c.beforeRest.hp));assert.equal(c.afterRest.hp,c.beforeRest.hp);
  assert.deepEqual(c.healing,[]);assert.deepEqual(c.purchases,[]);assert.equal(c.legacySkillError,'book-required');assert.ok(c.walkedMetres>100);
 }
});
test('caster style evidence retains twenty real full-health enemies and continuous ordinary movement',()=>{
 const r=report();assert.equal(r.styles.length,2);
 for(const c of r.styles){assert.equal(c.failure,null);assert.equal(c.population,1151);assert.equal(c.battles.length,10);
  assert.equal(new Set(c.battles.map(b=>b.uid)).size,10);assert.equal(c.initial.level,c.afterHunt.level);assert.equal(c.afterHunt.dead,false);
  assert.ok(c.purchases.every(p=>p.id==='potion'&&p.cost===55));assert.equal(c.purchases.length,3);
  assert.equal(c.cashNet,c.grossGold-165);assert.ok(c.walkedMetres>400);
  c.battles.forEach((b,i)=>{assert.equal(b.initialMonsterHp,b.maxHp);assert.equal(b.killed,true);assert.ok(b.releases>=5);assert.ok(b.movement.length>=3);
   if(i)assert.ok(b.before.hp<=c.battles[i-1].after.hp);
   for(const move of b.movement){const dt=(move.to.at-move.from.at)/1000,travel=Math.hypot(move.to.x-move.from.x,move.to.z-move.from.z);
    assert.ok(dt>0);assert.ok(travel>0);assert.ok(travel/dt<=7,'ordinary movement, no teleport');}
  });
 }
});
