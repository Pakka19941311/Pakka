export type QuickAction = '' | 'attack' | 'potion' | 'ether' | 'teleport' | `skill:${number}`;
export type QuickSlot = { action: QuickAction; key: string };
export const QUICK_KEYS = ['', ...Array.from({length: 8}, (_, i) => `Digit${i+1}`), ...Array.from({length: 8}, (_, i) => `Shift+Digit${i+1}`), ...['Q','E','R','F','T','G'].map(k => `Shift+Key${k}`)];
export function quickDefaults(): QuickSlot[] {
  return Array.from({length: 32}, (_, i) => ({action: i < 4 ? `skill:${i}` : i === 4 ? 'attack' : i === 8 ? 'potion' : i === 9 ? 'ether' : i === 10 ? 'teleport' : '', key: i < 16 ? `${i >= 8 ? 'Shift+' : ''}Digit${i % 8 + 1}` : ''}));
}
export function normalizeQuickbar(value: unknown): QuickSlot[] {
  const defaults = quickDefaults(), used = new Set<string>();
  return defaults.map((fallback, i) => {
    const entry = Array.isArray(value) ? value[i] : fallback;
    const action = ['', 'attack', 'potion', 'ether', 'teleport', 'skill:0', 'skill:1', 'skill:2', 'skill:3'].includes(entry?.action) ? entry.action : fallback.action;
    const requested = QUICK_KEYS.includes(entry?.key) ? entry.key : fallback.key;
    const key = used.has(requested) ? '' : requested;
    if (key) used.add(key);
    return {action, key};
  });
}
export function quickKey(event: {code: string; shiftKey: boolean; ctrlKey: boolean; altKey: boolean; metaKey: boolean}): string {
  return event.ctrlKey || event.altKey || event.metaKey ? '' : `${event.shiftKey ? 'Shift+' : ''}${event.code}`;
}
export function quickLabel(key: string): string { return key.replace('Shift+', '⇧').replace('Digit', '').replace('Key', ''); }
