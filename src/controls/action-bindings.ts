export type ConsumableAction = 'potion' | 'ether';
export type ConsumableBindings = Record<ConsumableAction, string>;

export const CONSUMABLE_KEY_OPTIONS = Object.freeze([
  { code: 'KeyQ', label: 'Q' },
  { code: 'KeyE', label: 'E' },
  { code: 'KeyR', label: 'R' },
  { code: 'KeyF', label: 'F' },
  { code: 'KeyT', label: 'T' },
  { code: 'KeyG', label: 'G' },
] as const);

export const DEFAULT_CONSUMABLE_BINDINGS: ConsumableBindings = Object.freeze({
  potion: 'KeyQ',
  ether: 'KeyE',
});

const allowedCodes = new Set<string>(CONSUMABLE_KEY_OPTIONS.map((option) => option.code));

export function normalizeConsumableBindings(value?: Partial<ConsumableBindings> | null): ConsumableBindings {
  const potion = value?.potion && allowedCodes.has(value.potion) ? value.potion : DEFAULT_CONSUMABLE_BINDINGS.potion;
  let ether = value?.ether && allowedCodes.has(value.ether) ? value.ether : DEFAULT_CONSUMABLE_BINDINGS.ether;
  if (ether === potion) ether = CONSUMABLE_KEY_OPTIONS.find((option) => option.code !== potion)?.code ?? DEFAULT_CONSUMABLE_BINDINGS.ether;
  return { potion, ether };
}

export function consumableActionForCode(bindings: ConsumableBindings, code: string): ConsumableAction | null {
  if (code === bindings.potion) return 'potion';
  if (code === bindings.ether) return 'ether';
  return null;
}

export function keyLabel(code: string): string {
  return CONSUMABLE_KEY_OPTIONS.find((option) => option.code === code)?.label ?? code.replace(/^Key/, '');
}
