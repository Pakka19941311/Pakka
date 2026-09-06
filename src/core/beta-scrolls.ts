import { SCROLLS, type EnhancementItem } from './enhancement-v2.ts';

// Fixed per-character receipt, independent of releases and reloads.
export const BETA_SCROLL_GRANT = 'beta-scrolls-100-v1';
export function grantBetaScrolls<T extends EnhancementItem, S extends {
  player: {inventory: T[]}; lootBuffer?: T[]; betaScrollGrant?: string;
}>(save: S, make: (id: string) => T): S {
  if (save.betaScrollGrant === BETA_SCROLL_GRANT) return save;
  const next = structuredClone(save);
  next.lootBuffer ??= [];
  for (const id of Object.keys(SCROLLS)) {
    const stack = next.player.inventory.find(item => item.id === id)
      ?? next.lootBuffer.find(item => item.id === id);
    if (stack) {
      if (!Number.isSafeInteger(stack.count) || stack.count < 1 || !Number.isSafeInteger(stack.count + 100)) {
        throw Error('Повреждённый запас свитков. Исходное сохранение сохранено.');
      }
      stack.count += 100;
    } else {
      const item = {...make(id), count: 100};
      (next.player.inventory.length < 42 ? next.player.inventory : next.lootBuffer).push(item);
    }
  }
  next.betaScrollGrant = BETA_SCROLL_GRANT;
  return next;
}
