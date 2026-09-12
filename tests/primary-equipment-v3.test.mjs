import test from 'node:test';
import assert from 'node:assert/strict';
import {calculateEquipmentStats, itemStatBreakdown} from '../src/core/equipment-stats.ts';
import {CLASSES} from '../src/data/game-data.ts';

const item=(uid,id,plus=0)=>({uid,id,plus,count:1});
const definitions={captain:{slot:'cloak',str:1,dex:1,int:1,def:1,mdef:2},
  strength:{slot:'ring',str:4,hp:30,accuracy:1},mind:{slot:'ring',int:4,mp:30,mdef:1}};
const profile=(classId,equipment)=>calculateEquipmentStats(classId,CLASSES[classId].stats,30,equipment,i=>definitions[i.id]);

test('primary gear is applied before derived combat stats and removed without residue',()=>{
  for(const classId of Object.keys(CLASSES)){
    const empty=profile(classId,{}),gear={cloak:item('cloak','captain')};
    const equipped=profile(classId,gear);
    assert.equal(equipped.stats.str,empty.stats.str+1);
    assert.equal(equipped.stats.dex,empty.stats.dex+1);
    assert.equal(equipped.stats.int,empty.stats.int+1);
    assert.ok(equipped.stats.atkMin>empty.stats.atkMin);
    assert.ok(equipped.stats.matk>empty.stats.matk);
    assert.ok(equipped.stats.evasion>empty.stats.evasion);
    delete gear.cloak;
    assert.deepEqual(profile(classId,gear),empty);
  }
});
test('two same-family rings add independent primary and direct contributions once',()=>{
  const base=profile('knight',{}),one=profile('knight',{ring1:item('a','strength')});
  const both=profile('knight',{ring1:item('a','strength'),ring2:item('b','strength')});
  assert.equal(one.stats.str-base.stats.str,4);
  assert.equal(both.stats.str-base.stats.str,8);
  assert.equal(both.maxHp-base.maxHp,60);
  assert.equal(both.stats.accuracy-base.stats.accuracy,2);
  assert.notEqual(both.stats.atkMin,one.stats.atkMin);
});
test('cloak enhancement raises defense but never multiplies primary attributes',()=>{
  const {base,bonus,total}=itemStatBreakdown(definitions.captain,15);
  for(const key of ['str','dex','int']){assert.equal(base[key],1);assert.equal(total[key],1);assert.equal(bonus[key],0);}
  assert.equal(total.def,83);assert.equal(total.mdef,84);
});
test('fixed migrated ring contribution is included in tooltip and live stats exactly once',()=>{
  const ring={...item('old','mind'),legacyRingBonus:{matk:7,crit:2,mp:9}};
  const base=profile('mage',{ring1:item('new','mind')}),legacy=profile('mage',{ring1:ring});
  assert.equal(legacy.stats.matk-base.stats.matk,7);
  assert.equal(legacy.stats.crit-base.stats.crit,2);
  assert.equal(legacy.maxMp-base.maxMp,9);
  assert.equal(itemStatBreakdown(definitions.mind,0,ring.legacyRingBonus).total.matk,7);
});
