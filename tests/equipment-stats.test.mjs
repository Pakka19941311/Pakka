import assert from 'node:assert/strict';
import test from 'node:test';
import { calculateEquipmentStats, itemStatBreakdown, itemStatContribution } from '../src/core/equipment-stats.ts';
import { equipInventoryItem, itemReference, resolveEquipmentSlot } from '../src/core/inventory-commands.ts';
import { CLASSES, ITEMS } from '../src/data/game-data.ts';

const close = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-10, `expected ${expected}, received ${actual}`);
const instance = (uid, id, plus = 0) => ({ uid, id, plus, count: 1 });

test('enhancement changes only attack and defense while all other actual modifiers remain unchanged', () => {
  const definition = {
    slot: 'weapon', atk: [20, 30], matk: 40, def: 10, mdef: 5,
    hp: 100, mp: 80, crit: 7, accuracy: 6, evasion: 4, speed: 8, spirit: 50,
  };
  const { base, bonus, total } = itemStatBreakdown(definition, 7);
  close(total.atkMin, 26.8);
  close(total.atkMax, 40.2);
  close(total.matk, 53.6);
  close(total.def, 13.4);
  close(total.mdef, 6.7);
  for (const [key, value] of Object.entries({ hp: 100, mp: 80, crit: 7, accuracy: 6, evasion: 4, speed: 0.496 })) {
    close(base[key], value);
    close(total[key], value);
    assert.equal(bonus[key], 0);
  }
  assert.equal('spirit' in total, false);
  close(bonus.atkMin, 6.8);
  close(bonus.matk, 13.6);
  for (const key of Object.keys(total)) close(base[key] + bonus[key], total[key]);
});

test('armor and jewelry use the existing armor curve even when they grant attack', () => {
  const weapon = itemStatContribution({ slot: 'weapon', atk: [10, 20], def: 10 }, 15);
  const necklace = itemStatContribution({ slot: 'neck', atk: [10, 20], def: 10 }, 15);
  close(weapon.atkMin, 21.2);
  close(necklace.atkMin, 19.6);
  close(necklace.atkMax, 39.2);
  close(necklace.def, 19.6);
});

test('initial Knight equipment preserves live values and has no invented equipment base attributes', () => {
  const equipment = {
    weapon: instance('weapon', 'wardens_blade'), chest: instance('chest', 'militia_plate'),
  };
  const result = calculateEquipmentStats('knight', CLASSES.knight.stats, 1, equipment, item => ITEMS[item.id]);
  close(result.stats.atkMin, 44.7);
  close(result.stats.atkMax, 50.7);
  close(result.stats.def, 31.5);
  assert.equal(result.maxHp, 687);
  assert.equal(result.maxMp, 96);
  close(result.stats.speed, 5.89);
  assert.equal(result.stats.str, 12);
  assert.equal(result.stats.spi, 4);
});

test('second-ring comparison projects the exact validated swap, including enhancement and vitals', () => {
  const definitions = {
    oldLeft: { slot: 'ring', matk: 4, hp: 15 },
    oldRight: { slot: 'ring', matk: 8, hp: 30, mp: 12 },
    newRing: { slot: 'ring', matk: 12, hp: 40, mp: 25, crit: 3 },
  };
  const incoming = instance('new', 'newRing', 7);
  const before = {
    classId: 'mage', dead: false, inventory: [incoming],
    equipment: { ring1: instance('left', 'oldLeft', 1), ring2: instance('right', 'oldRight', 3) },
  };
  const definitionFor = item => definitions[item.id];
  const initial = calculateEquipmentStats('mage', CLASSES.mage.stats, 20, before.equipment, definitionFor);
  const slot = resolveEquipmentSlot(definitionFor(incoming).slot, before.equipment, 'ring2');
  const projectedEquipment = { ...before.equipment, [slot]: incoming };
  const preview = calculateEquipmentStats('mage', CLASSES.mage.stats, 20, projectedEquipment, definitionFor);
  const operation = equipInventoryItem(before, itemReference(incoming), definitionFor, 'ring2');
  assert.equal(operation.ok, true);
  const actual = calculateEquipmentStats('mage', CLASSES.mage.stats, 20, operation.equipment, definitionFor);
  assert.deepEqual(actual, preview);
  close(actual.stats.matk - initial.stats.matk, 6.52);
  assert.equal(actual.maxHp - initial.maxHp, 10);
  assert.equal(actual.maxMp - initial.maxMp, 13);
  close(actual.stats.crit - initial.stats.crit, 3);
  assert.equal(operation.equipment.ring1, before.equipment.ring1);
});

test('boot speed tooltip contribution matches actual movement instead of displaying eight meters per second', () => {
  const base = calculateEquipmentStats('ranger', CLASSES.ranger.stats, 1, {}, item => ITEMS[item.id]);
  const equipped = calculateEquipmentStats('ranger', CLASSES.ranger.stats, 1, {
    boots: instance('boots', 'grave_boots', 15),
  }, item => ITEMS[item.id]);
  const contribution = itemStatContribution(ITEMS.grave_boots, 15);
  close(contribution.speed, 0.496);
  close(equipped.stats.speed - base.stats.speed, contribution.speed);
  close(equipped.stats.def - base.stats.def, 9.8);
});

test('calculation leaves item properties and base stats untouched and ignores inactive spirit metadata', () => {
  const base = structuredClone(CLASSES.necro.stats);
  const equipped = { weapon: instance('grimoire', 'mourn_grimoire', 9), offhand: undefined };
  const snapshot = structuredClone({ base, equipped });
  const withInactiveSpirit = calculateEquipmentStats('necro', base, 30, equipped, item => ITEMS[item.id]);
  const withoutInactiveSpirit = calculateEquipmentStats('necro', base, 30, equipped, item => {
    const { spirit, ...definition } = ITEMS[item.id];
    return definition;
  });
  assert.deepEqual(withInactiveSpirit, withoutInactiveSpirit);
  assert.deepEqual({ base, equipped }, snapshot);
});
