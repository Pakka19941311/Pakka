import { EQUIP_SLOTS } from '../data/game-data.ts';
import { INVENTORY_CAPACITY } from './game-rules.ts';

export type InventoryItem = { uid: string; id: string; plus: number; count: number };
export type ItemReference = Readonly<InventoryItem>;
export type EquipmentDefinition = { slot?: string; classes?: readonly string[] };
export type InventoryState<T extends InventoryItem> = {
  inventory: readonly T[];
  equipment: Readonly<Record<string, T | undefined>>;
  classId: string;
  dead: boolean;
};
export type InventoryFailureReason =
  | 'dead' | 'missing-item' | 'stale-item' | 'ambiguous-item' | 'invalid-item'
  | 'unknown-item' | 'not-equippable' | 'invalid-slot' | 'class-restricted'
  | 'stacked-equipment' | 'bag-full' | 'invalid-position';
export type InventoryFailure = { ok: false; reason: InventoryFailureReason };
export type InventoryChange<T extends InventoryItem> = {
  ok: true;
  inventory: T[];
  equipment: Record<string, T | undefined>;
};
export type EquipmentChange<T extends InventoryItem> = InventoryChange<T> & {
  item: T;
  slot: string;
  replaced?: T;
};

/** Capture the exact version the user saw, independently of the live item object. */
export function itemReference(item: InventoryItem): ItemReference {
  return { uid: item.uid, id: item.id, plus: item.plus, count: item.count };
}

export function compatibleEquipmentSlots(itemSlot: string | undefined): string[] {
  if (itemSlot === 'ring') return ['ring1', 'ring2'];
  if (itemSlot === 'ear' || itemSlot === 'earring') return ['ear1', 'ear2'];
  return itemSlot && EQUIP_SLOTS.includes(itemSlot) ? [itemSlot] : [];
}

/** Tooltip, double click and drag must all resolve the same replacement slot. */
export function resolveEquipmentSlot(
  itemSlot: string | undefined,
  equipment: Readonly<Record<string, unknown>>,
  preferredSlot?: string,
): string | undefined {
  const slots = compatibleEquipmentSlots(itemSlot);
  if (preferredSlot !== undefined) return slots.includes(preferredSlot) ? preferredSlot : undefined;
  return slots.find(slot => !equipment[slot]) ?? slots[0];
}

function validItem(item: InventoryItem): boolean {
  return Boolean(item.uid && item.id) && Number.isInteger(item.plus) && item.plus >= 0
    && Number.isInteger(item.count) && item.count > 0;
}

function validateState<T extends InventoryItem>(state: InventoryState<T>): InventoryFailure | undefined {
  if (state.dead) return { ok: false, reason: 'dead' };
  const seen = new Set<string>();
  for (const item of [...state.inventory, ...Object.values(state.equipment)]) {
    if (!item) continue;
    if (!validItem(item)) return { ok: false, reason: 'invalid-item' };
    if (seen.has(item.uid)) return { ok: false, reason: 'ambiguous-item' };
    seen.add(item.uid);
  }
  return undefined;
}

function validateReference(item: InventoryItem | undefined, reference: ItemReference): InventoryFailure | undefined {
  if (!item || item.uid !== reference.uid) return { ok: false, reason: 'missing-item' };
  if (item.id !== reference.id || item.plus !== reference.plus || item.count !== reference.count) {
    return { ok: false, reason: 'stale-item' };
  }
  return undefined;
}

/** Atomic 1:1 replacement: the removed gear occupies the incoming item's bag cell. */
export function equipInventoryItem<T extends InventoryItem>(
  state: InventoryState<T>,
  reference: ItemReference,
  definitionFor: (item: T) => EquipmentDefinition | undefined,
  preferredSlot?: string,
  capacity = INVENTORY_CAPACITY,
): EquipmentChange<T> | InventoryFailure {
  const stateFailure = validateState(state);
  if (stateFailure) return stateFailure;
  const index = state.inventory.findIndex(item => item.uid === reference.uid);
  const item = state.inventory[index];
  const referenceFailure = validateReference(item, reference);
  if (referenceFailure) return referenceFailure;
  const definition = definitionFor(item);
  if (!definition) return { ok: false, reason: 'unknown-item' };
  if (!definition.slot) return { ok: false, reason: 'not-equippable' };
  const slot = resolveEquipmentSlot(definition.slot, state.equipment, preferredSlot);
  if (!slot) return { ok: false, reason: 'invalid-slot' };
  if (definition.classes?.length && !definition.classes.includes(state.classId)) {
    return { ok: false, reason: 'class-restricted' };
  }
  if (item.count !== 1) return { ok: false, reason: 'stacked-equipment' };
  const replaced = state.equipment[slot];
  const inventory = [...state.inventory];
  if (replaced) inventory[index] = replaced;
  else inventory.splice(index, 1);
  if (inventory.length > capacity) return { ok: false, reason: 'bag-full' };
  return { ok: true, inventory, equipment: { ...state.equipment, [slot]: item }, item, slot, replaced };
}

export function unequipInventoryItem<T extends InventoryItem>(
  state: InventoryState<T>,
  reference: ItemReference,
  slot: string,
  capacity = INVENTORY_CAPACITY,
): EquipmentChange<T> | InventoryFailure {
  const stateFailure = validateState(state);
  if (stateFailure) return stateFailure;
  if (!EQUIP_SLOTS.includes(slot)) return { ok: false, reason: 'invalid-slot' };
  const item = state.equipment[slot];
  const referenceFailure = validateReference(item, reference);
  if (referenceFailure || !item) return referenceFailure ?? { ok: false, reason: 'missing-item' };
  if (state.inventory.length >= capacity) return { ok: false, reason: 'bag-full' };
  const equipment = { ...state.equipment };
  delete equipment[slot];
  return { ok: true, inventory: [...state.inventory, item], equipment, item, slot };
}

/** Move an item in the compact bag order; dropping on an empty cell appends it. */
export function reorderInventoryItem<T extends InventoryItem>(
  state: InventoryState<T>,
  reference: ItemReference,
  targetIndex: number,
  capacity = INVENTORY_CAPACITY,
): InventoryChange<T> | InventoryFailure {
  const stateFailure = validateState(state);
  if (stateFailure) return stateFailure;
  if (!Number.isInteger(targetIndex) || targetIndex < 0 || targetIndex >= capacity) {
    return { ok: false, reason: 'invalid-position' };
  }
  const index = state.inventory.findIndex(item => item.uid === reference.uid);
  const item = state.inventory[index];
  const referenceFailure = validateReference(item, reference);
  if (referenceFailure) return referenceFailure;
  const inventory = [...state.inventory];
  inventory.splice(index, 1);
  inventory.splice(Math.min(targetIndex, inventory.length), 0, item);
  return { ok: true, inventory, equipment: { ...state.equipment } };
}
