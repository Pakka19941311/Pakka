import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { ITEMS, CLASSES } from '../src/data/game-data.ts';
import { calculateEquipmentStats, itemStatBreakdown, itemStatContribution } from '../src/core/equipment-stats.ts';
import { itemDamageSummary, itemSpeedToWorldUnits, worldSpeedToItemUnits } from '../src/core/item-progression.ts';

const gear = Object.entries(ITEMS).filter(([, item]) => item.slot);

test('the requested illustrative sword has the exact +0…+9 damage range and accuracy anchors', () => {
  const reference = {slot: 'weapon', atk: [3, 15], accuracy: 1};
  const expected = [[3,15,1], [4,16,1], [5,17,2], [7,19,3], [9,23,4],
    [11,27,6], [13,33,8], [16,40,10], [17,50,12], [18,62,14]];
  expected.forEach(([min, max, accuracy], plus) => {
    const {base, total} = itemStatBreakdown(reference, plus);
    assert.deepEqual([total.atkMin, total.atkMax, total.accuracy], [min, max, accuracy]);
    const summary = itemDamageSummary(base, total);
    assert.equal(summary.base + summary.bonus, Math.round((min + max) / 2));
    assert.deepEqual([summary.min, summary.max], [min, max]);
  });
});

test('enhanceable gear gains integer power; ring stats ignore forbidden plus values', () => {
  for (const [id, definition] of gear) {
    const snapshot = structuredClone(definition);
    let previous;
    for (let plus = 0; plus <= 15; plus++) {
      const {base, bonus, total} = itemStatBreakdown(definition, plus);
      for (const [key, value] of Object.entries(total)) {
        assert.ok(Number.isSafeInteger(value) && value >= 0, `${id}+${plus} ${key} must be an integer`);
        assert.equal(base[key] + bonus[key], value, `${id}+${plus} ${key} breakdown`);
        if (base[key] === 0) assert.equal(value, 0, `${id} must not gain an absent ${key}`);
        if (previous) assert.ok(value >= previous[key], `${id}+${plus} ${key} must never decline`);
      }
      assert.ok(total.atkMin <= total.atkMax, `${id} damage range ordering`);
      if (previous&&definition.slot!=='ring') assert.ok(['atkMin','atkMax','matk','def','mdef'].some(key => total[key] > previous[key]), `${id}+${plus} must improve its power`);
      if(definition.slot==='ring')assert.deepEqual(total,base);
      previous = total;
    }
    assert.deepEqual(definition, snapshot);
  }
});

test('legacy weapons retain explicit accuracy while exact starter stats add no invented bonus; boss tiers remain stronger', () => {
  for (const [id, definition] of gear.filter(([, item]) => item.slot === 'weapon')) {
    if(id.startsWith('starter_'))assert.equal(definition.accuracy??0,id==='starter_weapon_ranger'?2:0);
    else assert.ok(Number.isInteger(definition.accuracy) && definition.accuracy > 0);
  }
  for (let plus = 0; plus <= 15; plus++) {
    const sword = itemStatContribution(ITEMS.wardens_blade, plus);
    const executioner = itemStatContribution(ITEMS.executioner, plus);
    const staff = itemStatContribution(ITEMS.ember_staff, plus);
    const root = itemStatContribution(ITEMS.rotten_root, plus);
    assert.ok(executioner.atkMin > sword.atkMin && executioner.atkMax > sword.atkMax && executioner.accuracy > sword.accuracy);
    assert.ok(root.matk > staff.matk && root.accuracy > staff.accuracy);
  }
});

test('whole item speed percentages convert reversibly at the movement boundary', () => {
  for (let plus = 0; plus <= 15; plus++) {
    const speed = itemStatContribution(ITEMS.grave_boots, plus).speed;
    assert.equal(worldSpeedToItemUnits(itemSpeedToWorldUnits(speed)), speed);
  }
});

test('visible attributes and defenses are actual integers for every class and level, while cadence precision remains internal', () => {
  for (const [classId, definition] of Object.entries(CLASSES)) {
    for (let level = 1; level <= 100; level++) {
      const result = calculateEquipmentStats(classId, definition.stats, level, {
        weapon: {id: definition.weapon, plus: 7}, chest: {id: definition.armor, plus: 7},
      }, item => ITEMS[item.id]);
      for (const key of ['str', 'dex', 'int', 'def', 'mdef', 'accuracy']) assert.ok(Number.isInteger(result.stats[key]), `${classId}:${level}:${key}`);
      assert.ok(Number.isInteger(result.maxHp) && Number.isInteger(result.maxMp));
    }
  }
});

test('the delivered table covers all real gear and only their permitted enhancement levels', () => {
  const table = JSON.parse(readFileSync(new URL('../docs/ITEM_PROGRESSION_V3.json', import.meta.url)));
  assert.deepEqual(table.items.map(item => item.id), gear.map(([id]) => id));
  for (const item of table.items) {
    assert.deepEqual(item.levels.map(row => row.plus), Array.from({length: ITEMS[item.id].slot==='ring'?1:16}, (_, i) => i));
    for (const row of item.levels) {
      const live = itemStatContribution(ITEMS[item.id], row.plus);
      assert.deepEqual(row.stats, Object.fromEntries(Object.entries(live).filter(([, value]) => value !== 0)));
    }
  }
});

test('enhancement inputs are clamped without producing NaN or accidentally enhancing a consumable', () => {
  const definition = ITEMS.wardens_blade;
  for (const plus of [-1, -Infinity, Infinity, NaN]) assert.deepEqual(itemStatContribution(definition, plus), itemStatContribution(definition, 0));
  assert.deepEqual(itemStatContribution(definition, 100), itemStatContribution(definition, 15));
  assert.deepEqual(itemStatContribution(definition, 1.9), itemStatContribution(definition, 1));
  assert.deepEqual(itemStatContribution({hp: 10}, 15), itemStatContribution({hp: 10}, 0));
});
