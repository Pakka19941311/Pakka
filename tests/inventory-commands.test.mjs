import assert from 'node:assert/strict';
import test from 'node:test';
import {
  compatibleEquipmentSlots, equipInventoryItem, itemReference,
  reorderInventoryItem, resolveEquipmentSlot, unequipInventoryItem,
} from '../src/core/inventory-commands.ts';

const item = (uid, id = 'blade', plus = 0, count = 1) => ({ uid, id, plus, count });
const state = (inventory = [], equipment = {}, extra = {}) => ({ inventory, equipment, classId: 'knight', dead: false, ...extra });
const definitions = {
  blade: { slot: 'weapon' }, ring: { slot: 'ring' }, earring: { slot: 'ear' },
  mage_staff: { slot: 'weapon', classes: ['mage'] }, potion: {},
};
const definitionFor = item => definitions[item.id];
const allUids = state => [...state.inventory, ...Object.values(state.equipment).filter(Boolean)].map(item => item.uid).sort();

test('paired gear uses the same free-first and left fallback for comparison and equip', () => {
  for (const [kind, left, right] of [['ring', 'ring1', 'ring2'], ['ear', 'ear1', 'ear2']]) {
    assert.deepEqual(compatibleEquipmentSlots(kind), [left, right]);
    assert.equal(resolveEquipmentSlot(kind, {}), left);
    assert.equal(resolveEquipmentSlot(kind, { [right]: {} }), left);
    assert.equal(resolveEquipmentSlot(kind, { [left]: {} }), right);
    assert.equal(resolveEquipmentSlot(kind, { [left]: {}, [right]: {} }), left);
    assert.equal(resolveEquipmentSlot(kind, { [left]: {}, [right]: {} }, right), right);
    assert.equal(resolveEquipmentSlot(kind, {}, 'weapon'), undefined);
  }
  assert.deepEqual(compatibleEquipmentSlots('not-a-slot'), []);
});

test('a full bag swaps gear into the exact freed cell without losing any UID or item properties', () => {
  const inventory = Array.from({ length: 42 }, (_, index) => item(`bag-${index}`));
  inventory[17] = { ...item('incoming', 'blade', 7), hotbarMarker: 'retain' };
  const previous = item('previous', 'blade', 3);
  const before = state(inventory, { weapon: previous });
  const snapshot = structuredClone(before);
  const result = equipInventoryItem(before, itemReference(inventory[17]), definitionFor);
  assert.equal(result.ok, true);
  assert.equal(result.inventory.length, 42);
  assert.equal(result.inventory[17], previous);
  assert.equal(result.equipment.weapon, inventory[17]);
  assert.equal(result.equipment.weapon.hotbarMarker, 'retain');
  assert.deepEqual(allUids(result), allUids(before));
  assert.deepEqual(before, snapshot);
  assert.deepEqual(unequipInventoryItem({ ...before, ...result }, itemReference(result.equipment.weapon), 'weapon'), { ok: false, reason: 'bag-full' });
});

test('explicit second ring or earring replaces that exact item and retains the first one', () => {
  for (const [kind, left, right] of [['ring', 'ring1', 'ring2'], ['earring', 'ear1', 'ear2']]) {
    const incoming = item('incoming', kind, 5);
    const first = item('first', kind, 1);
    const second = item('second', kind, 2);
    const before = state([incoming], { [left]: first, [right]: second });
    const result = equipInventoryItem(before, itemReference(incoming), definitionFor, right);
    assert.equal(result.ok, true);
    assert.equal(result.slot, right);
    assert.equal(result.equipment[left], first);
    assert.equal(result.equipment[right], incoming);
    assert.deepEqual(result.inventory, [second]);
    const defaultResult = equipInventoryItem(before, itemReference(incoming), definitionFor);
    assert.equal(defaultResult.slot, left);
  }
});

test('an equip event can execute only once even when the same cell now contains replaced gear', () => {
  const incoming = item('new', 'blade', 7);
  const before = state([incoming], { weapon: item('old', 'blade', 1) });
  const reference = itemReference(incoming);
  const first = equipInventoryItem(before, reference, definitionFor);
  assert.equal(first.ok, true);
  const after = { ...before, ...first };
  assert.deepEqual(equipInventoryItem(after, reference, definitionFor), { ok: false, reason: 'missing-item' });
  assert.equal(after.equipment.weapon.uid, 'new');
  assert.equal(after.inventory[0].uid, 'old');
});

test('stale equip and unequip commands reject changed enhancement, count or item identity', () => {
  for (const update of [{ plus: 8 }, { count: 2 }, { id: 'mage_staff' }]) {
    const incoming = item('stable-id', 'blade', 7);
    const reference = itemReference(incoming);
    Object.assign(incoming, update);
    assert.deepEqual(equipInventoryItem(state([incoming]), reference, definitionFor), { ok: false, reason: 'stale-item' });
    assert.deepEqual(unequipInventoryItem(state([], { weapon: incoming }), reference, 'weapon'), { ok: false, reason: 'stale-item' });
  }
});

test('equip rejects invalid slots, restricted classes and stacked gear without partial replacement', () => {
  const old = item('old');
  const incoming = item('new', 'mage_staff');
  const before = state([incoming], { weapon: old });
  const snapshot = structuredClone(before);
  assert.deepEqual(equipInventoryItem(before, itemReference(incoming), definitionFor), { ok: false, reason: 'class-restricted' });
  assert.deepEqual(before, snapshot);
  const mage = { ...before, classId: 'mage' };
  assert.equal(equipInventoryItem(mage, itemReference(incoming), definitionFor).ok, true);
  assert.deepEqual(equipInventoryItem(mage, itemReference(incoming), definitionFor, 'chest'), { ok: false, reason: 'invalid-slot' });
  const stack = item('stack', 'blade', 0, 2);
  assert.deepEqual(equipInventoryItem(state([stack]), itemReference(stack), definitionFor), { ok: false, reason: 'stacked-equipment' });
  const potion = item('potion', 'potion');
  assert.deepEqual(equipInventoryItem(state([potion]), itemReference(potion), definitionFor), { ok: false, reason: 'not-equippable' });
});

test('dead players and duplicated identities cannot mutate bag or equipment', () => {
  const incoming = item('same');
  const duplicate = state([incoming], { weapon: { ...incoming } });
  assert.deepEqual(equipInventoryItem(duplicate, itemReference(incoming), definitionFor), { ok: false, reason: 'ambiguous-item' });
  assert.deepEqual(unequipInventoryItem(duplicate, itemReference(incoming), 'weapon'), { ok: false, reason: 'ambiguous-item' });
  const dead = state([incoming], { weapon: item('old') }, { dead: true });
  assert.deepEqual(equipInventoryItem(dead, itemReference(incoming), definitionFor), { ok: false, reason: 'dead' });
  assert.deepEqual(unequipInventoryItem(dead, itemReference(dead.equipment.weapon), 'weapon'), { ok: false, reason: 'dead' });
  assert.deepEqual(reorderInventoryItem(dead, itemReference(incoming), 0), { ok: false, reason: 'dead' });
});

test('unequip round trip preserves all identities and a repeated event cannot add a duplicate', () => {
  const incoming = item('new', 'blade', 7);
  const before = state([incoming, item('other', 'potion', 0, 12)]);
  const equipped = equipInventoryItem(before, itemReference(incoming), definitionFor);
  assert.equal(equipped.ok, true);
  const active = { ...before, ...equipped };
  const reference = itemReference(active.equipment.weapon);
  const result = unequipInventoryItem(active, reference, 'weapon');
  assert.equal(result.ok, true);
  assert.deepEqual(allUids(result), allUids(before));
  assert.equal(result.equipment.weapon, undefined);
  assert.deepEqual(unequipInventoryItem({ ...active, ...result }, reference, 'weapon'), { ok: false, reason: 'missing-item' });
});

test('drag ordering uses UID after other moves and preserves saved properties and hotbar references', () => {
  const inventory = [item('a', 'potion', 0, 5), item('b', 'blade', 9), item('c', 'ring', 7)];
  const before = state(inventory);
  const reference = itemReference(inventory[1]);
  const first = reorderInventoryItem(before, itemReference(inventory[0]), 2);
  const result = reorderInventoryItem({ ...before, ...first }, reference, 41);
  assert.equal(result.ok, true);
  assert.deepEqual(result.inventory.map(item => item.uid), ['c', 'a', 'b']);
  assert.deepEqual(allUids(result), allUids(before));
  assert.equal(result.inventory.find(item => item.uid === reference.uid), inventory[1]);
  const reloaded = JSON.parse(JSON.stringify(result));
  assert.deepEqual(reloaded.inventory.find(item => item.uid === 'b'), inventory[1]);
  assert.deepEqual(before.inventory.map(item => item.uid), ['a', 'b', 'c']);
  assert.deepEqual(reorderInventoryItem(before, reference, 42), { ok: false, reason: 'invalid-position' });
});
