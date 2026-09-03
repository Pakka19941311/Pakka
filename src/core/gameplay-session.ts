import { INVENTORY_CAPACITY, MAX_LEVEL, enhancementCanDestroy, enhancementChance, xpNeeded } from './game-rules.ts';

export type StackableItem = { id: string; count: number };
export type EnhancementOutcome =
  | { kind: 'capped'; level: number }
  | { kind: 'success'; level: number }
  | { kind: 'destroyed'; level: number };

export function applyExperience(level: number, xp: number, gained: number): { level: number; xp: number; levelsGained: number } {
  let nextLevel = level;
  let nextXp = Math.max(0, xp + gained);
  let levelsGained = 0;
  while (nextLevel < MAX_LEVEL && nextXp >= xpNeeded(nextLevel)) {
    nextXp -= xpNeeded(nextLevel);
    nextLevel += 1;
    levelsGained += 1;
  }
  if (nextLevel === MAX_LEVEL) nextXp = Math.min(nextXp, xpNeeded(MAX_LEVEL) - 1);
  return { level: nextLevel, xp: nextXp, levelsGained };
}

export function resolveEnhancement(currentLevel: number, roll = Math.random()): EnhancementOutcome {
  if (currentLevel >= 15) return { kind: 'capped', level: 15 };
  if (roll < enhancementChance(currentLevel)) return { kind: 'success', level: currentLevel + 1 };
  if (enhancementCanDestroy(currentLevel)) return { kind: 'destroyed', level: currentLevel };
  return { kind: 'success', level: currentLevel + 1 };
}

export function addOrStackItem<T extends StackableItem>(inventory: T[], item: T, stackable: boolean, capacity = INVENTORY_CAPACITY): 'stacked' | 'added' | 'full' {
  if (stackable) {
    const stack = inventory.find((candidate) => candidate.id === item.id);
    if (stack) {
      stack.count += item.count;
      return 'stacked';
    }
  }
  if (inventory.length >= capacity) return 'full';
  inventory.push(item);
  return 'added';
}

export function equipmentSlot(itemSlot: string, equipment: Record<string, unknown>): string {
  if (itemSlot !== 'ring') return itemSlot;
  return equipment.ring1 ? 'ring2' : 'ring1';
}
