import assert from 'node:assert/strict';
import test from 'node:test';
import { calculateEquipmentStats, itemStatBreakdown, itemStatContribution } from '../src/core/equipment-stats.ts';
import { equipInventoryItem, itemReference, resolveEquipmentSlot } from '../src/core/inventory-commands.ts';
import { CLASSES, ITEMS } from '../src/data/game-data.ts';
import { itemSpeedToWorldUnits } from '../src/core/item-progression.ts';

const close = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-10, `expected ${expected}, received ${actual}`);
const instance = (uid, id, plus = 0) => ({ uid, id, plus, count: 1 });

test('integer enhancement changes real contributions and exposes exact base plus bonus', () => {
  const definition = {
    slot: 'weapon', atk: [20, 30], matk: 40, def: 10, mdef: 5,
    hp: 100, mp: 80, crit: 7, accuracy: 6, evasion: 4, speed: 8, spirit: 50,
  };
  const { base, bonus, total } = itemStatBreakdown(definition, 7);
  assert.deepEqual(total, {str:0,dex:0,int:0,vit:0,spi:0,atkMin: 33, atkMax: 55, matk: 59, def: 24, mdef: 19,
    hp: 127, mp: 102, crit: 10, accuracy: 15, evasion: 7, speed: 11});
  for (const [key, value] of Object.entries({ hp: 100, mp: 80, crit: 7, accuracy: 6, evasion: 4, speed: 8 })) close(base[key], value);
  assert.equal('spirit' in total, false);
  close(bonus.atkMin, 13);
  close(bonus.matk, 19);
  for (const key of Object.keys(total)) close(base[key] + bonus[key], total[key]);
});

test('weapon damage range and accessory damage use their defined separate integer curves', () => {
  const weapon = itemStatContribution({ slot: 'weapon', atk: [10, 20], def: 10 }, 15);
  const necklace = itemStatContribution({ slot: 'neck', atk: [10, 20], def: 10 }, 15);
  assert.equal(weapon.atkMin, 58);
  assert.equal(weapon.atkMax, 181);
  assert.equal(necklace.atkMin, 59);
  assert.equal(necklace.atkMax, 69);
  assert.equal(necklace.def, 92);
});

test('initial Knight uses whole actual attack, defense and accuracy while base item values remain unchanged', () => {
  const equipment = {
    weapon: instance('weapon', 'wardens_blade'), chest: instance('chest', 'militia_plate'),
  };
  const result = calculateEquipmentStats('knight', CLASSES.knight.stats, 1, equipment, item => ITEMS[item.id]);
  assert.equal(result.stats.atkMin, 16);
  assert.equal(result.stats.atkMax, 22);
  assert.equal(result.stats.def, 32);
  assert.equal(result.stats.accuracy, 75);
  assert.equal(result.stats.physicalAccuracy, 75);
  assert.equal(result.stats.magicAccuracy, 71);
  assert.equal(result.maxHp, 807);
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
  close(actual.stats.matk - initial.stats.matk, 10);
  assert.equal(actual.maxHp - initial.maxHp, 18);
  assert.equal(actual.maxMp - initial.maxMp, 19);
  close(actual.stats.crit - initial.stats.crit, 6);
  assert.equal(operation.equipment.ring1, before.equipment.ring1);
});

test('boot speed is a whole percent contribution converted exactly once to world movement', () => {
  const base = calculateEquipmentStats('ranger', CLASSES.ranger.stats, 1, {}, item => ITEMS[item.id]);
  const equipped = calculateEquipmentStats('ranger', CLASSES.ranger.stats, 1, {
    boots: instance('boots', 'grave_boots', 15),
  }, item => ITEMS[item.id]);
  const contribution = itemStatContribution(ITEMS.grave_boots, 15);
  assert.equal(contribution.speed, 15);
  close(equipped.stats.speed - base.stats.speed, itemSpeedToWorldUnits(contribution.speed));
  close(equipped.stats.speed - base.stats.speed, 0.93);
  assert.equal(equipped.stats.def - base.stats.def, 87);
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
