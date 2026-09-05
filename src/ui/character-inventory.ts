import type { ItemReference } from '../core/inventory-commands';
import '../inventory.css';

export type InventoryPosition = { x: number; y: number };
export type InventoryItemRef = ItemReference & {
  location: 'bag' | 'equipment';
  bagIndex?: number;
  slot?: string;
};
export type InventoryDropTarget =
  | { location: 'bag'; bagIndex: number }
  | { location: 'equipment'; slot: string };
export type InventoryCellItem = ItemReference & {
  name: string;
  icon?: string;
  kind?: string;
  quality?: string;
};
export type InventoryStatRow = { key?: string; label: string; value: string | number; detail?: string };
export type InventoryComparisonRow = InventoryStatRow & { delta?: number };
export type InventoryTooltip = {
  title: string;
  subtitle?: string;
  quality?: string;
  description?: string;
  rows: InventoryStatRow[];
  restrictions?: string[];
  actions?: string[];
  comparisons?: { title: string; selected?: boolean; equippedRows?: InventoryStatRow[]; rows: InventoryComparisonRow[] }[];
};
export type CharacterInventoryModel = {
  name: string;
  className: string;
  level: number;
  stats: InventoryStatRow[];
  equipment: Readonly<Record<string, InventoryCellItem | null | undefined>>;
  bag: readonly (InventoryCellItem | null | undefined)[];
  gold: string | number;
  capacity: number;
  selectedUid?: string | null;
  activeSlot?: string | null;
  readOnly?: boolean;
  status?: string;
  scale?: number;
  position?: InventoryPosition;
  actions?: { id: string; label: string; disabled?: boolean }[];
};
export type CharacterInventoryOptions = {
  read(): CharacterInventoryModel;
  tooltip(ref: InventoryItemRef): InventoryTooltip | null;
  onClose(): void;
  onSelect(ref: InventoryItemRef | null): void;
  onActivate(ref: InventoryItemRef): void;
  onMove(ref: InventoryItemRef, target: InventoryDropTarget): void;
  onSlotSelect?(slot: string): void;
  onAction?(id: string, ref: InventoryItemRef | null): void;
  onPosition?(position: InventoryPosition): void;
};

const GEAR_LAYOUT = [
  ['ear1', 'Серьга I'], ['head', 'Голова'], ['ear2', 'Серьга II'],
  ['neck', 'Ожерелье'], ['chest', 'Нагрудник'], ['offhand', 'Щит / фокус'],
  ['weapon', 'Оружие'], ['belt', 'Пояс'], ['gloves', 'Перчатки'],
  ['ring1', 'Кольцо I'], ['boots', 'Обувь'], ['ring2', 'Кольцо II'],
] as const;
const PANEL_WIDTH = 392;
const PANEL_HEIGHT = 564;
const EDGE = 8;
const DOCK_CLEARANCE = 96;

// Original code-native silhouettes: item identity is legible at a 50 px cell size.
const ICON_PATHS: Record<string, string> = {
  sword: '<path d="m7 34 4-4m-5-3 9 9m-4-9L29 7l6-2-2 7-18 19Z"/><path d="m15 27 16-17"/>',
  staff: '<path d="m11 36 14-22m-4-3 2-6 7-1 4 6-3 6-7 1Z"/><path d="m24 10 4-2 2 4-4 2Z"/>',
  bow: '<path d="M10 4c25 7 25 25 0 32l7-16Z"/><path d="M7 20h28m-4-4 4 4-4 4"/>',
  daggers: '<path d="m8 8 5 2 13 19-4 3L9 14Zm24 0-5 2-13 19 4 3 13-18ZM8 29l12 6m0-6 12 6"/>',
  book: '<path d="M9 7h24v28H9a4 4 0 0 1-4-4V11a4 4 0 0 1 4-4Zm0 0v28M9 29h24"/><path d="m18 14 6-3 5 3-5 9Z"/>',
  chest: '<path d="m14 6-7 3-4 9 7 3 1 14h18l1-14 7-3-4-9-7-3-3 5h-6Z"/><path d="m11 17 9 5 9-5M20 22v12"/>',
  robe: '<path d="m15 5-8 5-4 10 8 3-4 13h26l-4-13 8-3-4-10-8-5-5 7Z"/><path d="m15 5 5 13 5-13M13 25h14m-7-7v18"/>',
  head: '<path d="M7 24v-9a13 13 0 0 1 26 0v9l-5 10-8-5-8 5Z"/><path d="M20 4v25M8 18l8 3m8 0 8-3M7 24l7 2m12 0 7-2"/>',
  gloves: '<path d="M8 35V21L5 15l4-3 6 6V6l4-1 2 11 1-12 4 1 1 12 2-9 4 2-1 14-5 11Z"/><path d="M9 28h20"/>',
  boots: '<path d="M14 5h17l-2 21 6 5v5H5v-8l10-7Z"/><path d="m15 11 14 2m-15 5 14 2M6 31h28"/>',
  belt: '<path d="M4 14h32v13H4Z"/><rect x="15" y="11" width="13" height="19" rx="2"/><path d="M20 20h9M8 18v5"/>',
  offhand: '<path d="m20 4 14 5v12c-1 7-7 11-14 15C13 32 7 28 6 21V9Z"/><path d="m20 9 9 4v8c-1 4-4 7-9 10-5-3-8-6-9-10v-8ZM20 9v22"/>',
  ring: '<ellipse cx="20" cy="24" rx="11" ry="10"/><path d="m13 11 3-6h8l3 6-7 8Zm3-6 4 14 4-14M13 11h14"/>',
  ear: '<path d="M25 9a7 7 0 1 0-7 7v7m0-7h4"/><path d="m18 21 8 8-8 8-8-8Z"/>',
  neck: '<path d="M7 5v11a13 13 0 0 0 26 0V5"/><path d="m20 22 7 7-7 8-7-8Z"/>',
  potion: '<path d="M15 5h10v6l-2 3v3l8 11v8H9v-8l8-11v-3l-2-3Z"/><path d="M15 10h10M11 28h18"/><path class="ci-icon-liquid" d="M12 29h16v4H12Z"/>',
  scroll: '<path d="M11 7h20v25H11l-3 3-3-3V12Zm20 0 4 3v6h-4M8 28h20l3 4M14 15h12m-12 5h10"/>',
  gem: '<path d="m11 7 18 0 7 12-16 18L4 19Zm-7 12h32M11 7l9 30 9-30M11 7l9 12 9-12"/>',
  fang: '<path d="M12 5c16 1 22 9 18 18-4 8-13 12-24 13 10-7 14-13 13-20-1-4-4-7-7-11Z"/>',
  bone: '<path d="M12 7c-3-7-11-2-7 3-6 3-1 11 4 8l15 15c-3 5 5 10 8 4 6 3 10-5 4-8L21 14c3-5-4-10-7-5Z"/>',
};
function iconKind(item: Pick<InventoryCellItem, 'id' | 'icon' | 'kind'>): string {
  const id = item.id || '';
  if (/staff|root/.test(id)) return 'staff';
  if (/bow/.test(id)) return 'bow';
  if (/grimoire/.test(id)) return 'book';
  if (/fangs/.test(id)) return 'daggers';
  if (/robe|raiment/.test(id)) return 'robe';
  if (/potion|ether/.test(id)) return 'potion';
  if (/scroll/.test(id)) return 'scroll';
  if (/fang/.test(id)) return 'fang';
  if (/bone/.test(id)) return 'bone';
  const kind = item.kind || '';
  if (kind === 'weapon') return 'sword';
  if (kind.startsWith('ring')) return 'ring';
  if (kind.startsWith('ear')) return 'ear';
  if (ICON_PATHS[kind]) return kind;
  if (item.icon === '⚔' || item.icon === '†') return 'sword';
  if (item.icon === '➶') return 'bow';
  if (item.icon === 'ϟ') return 'staff';
  return 'gem';
}
function iconMarkup(kind: string): string {
  return `<svg viewBox="0 0 40 40" aria-hidden="true" focusable="false">${ICON_PATHS[kind] || ICON_PATHS.gem}</svg>`;
}
function node<K extends keyof HTMLElementTagNameMap>(tag: K, className?: string, text?: string): HTMLElementTagNameMap[K] {
  const result = document.createElement(tag);
  if (className) result.className = className;
  if (text !== undefined) result.textContent = text;
  return result;
}
function versionMatches(a: ItemReference, b: ItemReference): boolean {
  return a.uid === b.uid && a.id === b.id && a.plus === b.plus && a.count === b.count;
}
function sameRef(a: InventoryItemRef, b: InventoryItemRef): boolean {
  return versionMatches(a, b) && a.location === b.location && a.bagIndex === b.bagIndex && a.slot === b.slot;
}
function refOf(item: InventoryCellItem, target: InventoryDropTarget): InventoryItemRef {
  return { uid: item.uid, id: item.id, plus: item.plus, count: item.count, ...target };
}

type Cell = { button: HTMLButtonElement; icon: HTMLElement; plus: HTMLElement; count: HTMLElement; label: HTMLElement; target: InventoryDropTarget; ref: InventoryItemRef | null; signature: string };
type PointerOperation =
  | { kind: 'window'; pointerId: number; startX: number; startY: number; origin: InventoryPosition }
  | { kind: 'item'; pointerId: number; startX: number; startY: number; ref: InventoryItemRef; source: Cell; dragging: boolean };

/** Presentation-only inventory. Commands always carry the exact item version shown at gesture start. */
export function createCharacterInventory(host: HTMLElement, options: CharacterInventoryOptions) {
  const abort = new AbortController();
  const listen = (target: EventTarget, type: string, callback: EventListener) => target.addEventListener(type, callback, { signal: abort.signal });
  const element = node('section', 'window character-window');
  element.dataset.inventoryWindow = '';
  element.setAttribute('role', 'dialog');
  element.setAttribute('aria-modal', 'false');
  element.setAttribute('aria-labelledby', 'character-inventory-title');
  const header = node('header', 'ci-header');
  header.dataset.inventoryDrag = '';
  const title = node('h2', 'ci-title', 'Персонаж');
  title.id = 'character-inventory-title';
  const headerHint = node('span', 'ci-header-hint', 'Tab');
  const close = node('button', 'ci-close', '×');
  close.type = 'button'; close.dataset.close = ''; close.setAttribute('aria-label', 'Закрыть инвентарь');
  header.append(title, headerHint, close);
  const identity = node('div', 'ci-identity');
  const characterName = node('strong');
  const characterClass = node('span');
  identity.append(characterName, characterClass);
  const overview = node('div', 'ci-overview');
  const statsPanel = node('div', 'ci-stats-panel');
  const statsHeading = node('div', 'ci-section-label', 'Характеристики');
  const stats = node('div', 'ci-stats');
  stats.dataset.inventoryStats = ''; stats.tabIndex = 0; stats.setAttribute('aria-label', 'Характеристики персонажа');
  statsPanel.append(statsHeading, stats);
  const equipment = node('div', 'ci-equipment-grid');
  equipment.setAttribute('aria-label', 'Экипировка');
  overview.append(statsPanel, equipment);
  const bagHeading = node('div', 'ci-bag-heading');
  bagHeading.append(node('span', '', 'Сумка'), node('span', 'ci-bag-hint', 'Двойной клик — действие'));
  const bagScroll = node('div', 'ci-bag-scroll');
  bagScroll.setAttribute('aria-label', 'Сумка, 42 ячейки');
  const bagGrid = node('div', 'ci-bag-grid');
  bagScroll.append(bagGrid);
  const footer = node('footer', 'ci-footer');
  const moneyRow = node('div', 'ci-money-row');
  const gold = node('span', 'ci-gold');
  const capacity = node('span', 'ci-capacity');
  moneyRow.append(gold, capacity);
  const selectionName = node('div', 'ci-selection-name', 'Выберите предмет');
  const actions = node('div', 'ci-actions');
  const status = node('div', 'ci-status');
  status.setAttribute('role', 'status');
  footer.append(moneyRow, selectionName, actions, status);
  element.append(header, identity, overview, bagHeading, bagScroll, footer);
  const tooltip = node('aside', 'ci-tooltip');
  tooltip.dataset.inventoryTooltip = ''; tooltip.id = 'character-inventory-tooltip';
  tooltip.setAttribute('role', 'tooltip'); tooltip.tabIndex = 0; tooltip.hidden = true;
  const ghost = node('div', 'ci-drag-ghost'); ghost.hidden = true; ghost.setAttribute('aria-hidden', 'true');
  host.append(element);
  document.body.append(tooltip, ghost);

  let model = options.read();
  let position: InventoryPosition = model.position ? { ...model.position } : { x: window.innerWidth - PANEL_WIDTH - 18, y: 58 };
  let scale = 1;
  let destroyed = false;
  let pointer: PointerOperation | null = null;
  let hovered: Cell | null = null;
  let tooltipSignature = '';
  let hideTimer: ReturnType<typeof setTimeout> | undefined;
  let suppressClickUntil = 0;
  let clickStart: { cell: Cell; ref: InventoryItemRef } | null = null;
  let pressed: { cell: Cell; ref: InventoryItemRef } | null = null;
  let highlightedDrop: HTMLElement | null = null;
  let previousReadOnly = !!model.readOnly;
  let statsSignature = '';
  let actionSignature = '';
  const cells: Cell[] = [];
  const actionButtons = new Map<string, HTMLButtonElement>();

  function hideTooltip() {
    clearTimeout(hideTimer); hideTimer = undefined;
    hovered?.button.removeAttribute('aria-describedby');
    hovered = null; tooltip.hidden = true; tooltipSignature = '';
  }
  function postponeHide() {
    clearTimeout(hideTimer);
    hideTimer = setTimeout(hideTooltip, 190);
  }
  function validRef(ref: InventoryItemRef): boolean {
    const item = ref.location === 'bag' ? model.bag[ref.bagIndex ?? -1] : model.equipment[ref.slot ?? ''];
    return !!item && versionMatches(item, ref);
  }
  function selectedRef(): InventoryItemRef | null {
    return cells.find(cell => cell.ref?.uid === model.selectedUid)?.ref ?? null;
  }
  function positionTooltip() {
    if (tooltip.hidden || !hovered) return;
    const anchor = hovered.button.getBoundingClientRect();
    const panel = element.getBoundingClientRect();
    const rect = tooltip.getBoundingClientRect();
    let x = panel.left - rect.width - 7;
    if (x < EDGE && panel.right + rect.width + 7 <= window.innerWidth - EDGE) x = panel.right + 7;
    if (x < EDGE) x = anchor.left - rect.width - 7;
    x = Math.max(EDGE, Math.min(x, window.innerWidth - rect.width - EDGE));
    const y = Math.max(EDGE, Math.min(anchor.top - 4, window.innerHeight - rect.height - EDGE));
    tooltip.style.left = `${x}px`; tooltip.style.top = `${y}px`;
  }
  function appendRows(parent: HTMLElement, rows: InventoryComparisonRow[]) {
    for (const row of rows) {
      const line = node('div', 'ci-tooltip-row');
      line.dataset.statLabel = row.label;
      if (row.key) line.dataset.stat = row.key;
      const label = node('span', 'ci-tooltip-label', row.label);
      const value = node('strong', 'ci-tooltip-value', String(row.value));
      if (row.delta !== undefined) {
        line.dataset.value = String(row.delta); value.dataset.delta = String(row.delta);
        line.classList.toggle('ci-positive', row.delta > 0); line.classList.toggle('ci-negative', row.delta < 0);
      }
      line.append(label, value);
      if (row.detail) line.append(node('small', 'ci-tooltip-detail', row.detail));
      parent.append(line);
    }
  }
  function updateTooltip() {
    if (!hovered?.ref || !validRef(hovered.ref)) { hideTooltip(); return; }
    const content = options.tooltip({ ...hovered.ref });
    if (!content) { hideTooltip(); return; }
    const signature = JSON.stringify(content);
    if (signature !== tooltipSignature) {
      const oldScroll = tooltip.scrollTop;
      tooltip.replaceChildren();
      const main = node('section', 'ci-tooltip-main');
      main.append(node('strong', 'ci-tooltip-title', content.title));
      if (content.subtitle) main.append(node('div', 'ci-tooltip-subtitle', content.subtitle));
      if (content.quality) main.append(node('div', 'ci-tooltip-quality', content.quality));
      if (content.description) main.append(node('p', 'ci-tooltip-description', content.description));
      appendRows(main, content.rows);
      for (const restriction of content.restrictions ?? []) main.append(node('p', 'ci-tooltip-restriction', restriction));
      for (const action of content.actions ?? []) main.append(node('p', 'ci-tooltip-action', action));
      tooltip.append(main);
      for (const comparison of content.comparisons ?? []) {
        const comparisonPanel = node('section', 'ci-comparison');
        comparisonPanel.dataset.comparisonSelected = String(!!comparison.selected);
        comparisonPanel.append(node('div', 'ci-comparison-caption', comparison.selected ? 'Будет заменено' : 'Другой слот'));
        comparisonPanel.append(node('strong', 'ci-tooltip-title', comparison.title));
        if (comparison.equippedRows?.length) {
          const equippedRows = node('div', 'ci-equipped-stats');
          for (const row of comparison.equippedRows) {
            const line = node('div', 'ci-equipped-row');
            line.append(node('span', 'ci-tooltip-label', row.label), node('strong', 'ci-tooltip-value', String(row.value)));
            if (row.detail) line.append(node('small', 'ci-tooltip-detail', row.detail));
            equippedRows.append(line);
          }
          comparisonPanel.append(equippedRows);
        }
        comparisonPanel.append(node('div', 'ci-comparison-summary', 'Характеристики героя после замены'));
        appendRows(comparisonPanel, comparison.rows);
        tooltip.append(comparisonPanel);
      }
      tooltip.dataset.comparisons = String(content.comparisons?.length ?? 0);
      tooltipSignature = signature;
      tooltip.scrollTop = oldScroll;
    }
    tooltip.hidden = false;
    hovered.button.setAttribute('aria-describedby', tooltip.id);
    positionTooltip();
  }
  function showTooltip(cell: Cell) {
    clearTimeout(hideTimer); hideTimer = undefined;
    if (pointer?.kind === 'item' && pointer.dragging) return;
    if (hovered !== cell) { hideTooltip(); hovered = cell; }
    if (cell.ref) updateTooltip();
  }
  function setDropHighlight(target: HTMLElement | null) {
    highlightedDrop?.classList.remove('ci-drop-target');
    highlightedDrop = target; highlightedDrop?.classList.add('ci-drop-target');
  }
  function stopPointer(suppressClick = false) {
    if (suppressClick) suppressClickUntil = performance.now() + 350;
    pointer = null; pressed = null;
    ghost.hidden = true; element.classList.remove('ci-dragging');
    setDropHighlight(null);
  }
  function cancelInteraction(): boolean {
    const hadInteraction = !!pointer;
    if (pointer?.kind === 'window') options.onPosition?.({ ...position });
    if (pointer) stopPointer(true);
    clickStart = null; hideTooltip();
    return hadInteraction;
  }
  function cellAt(x: number, y: number): Cell | undefined {
    const target = document.elementFromPoint(x, y)?.closest<HTMLElement>('.ci-cell');
    return cells.find(cell => cell.button === target);
  }
  function createCell(target: InventoryDropTarget, emptyLabel: string): Cell {
    const button = node('button', 'ci-cell');
    button.type = 'button'; button.draggable = false;
    if (target.location === 'bag') button.dataset.bagIndex = String(target.bagIndex);
    else button.dataset.slot = target.slot;
    const icon = node('span', 'ci-cell-icon');
    const plus = node('span', 'ci-cell-plus');
    const count = node('span', 'ci-cell-count');
    const label = node('span', 'ci-cell-label', emptyLabel);
    button.append(icon, plus, count, label);
    const cell: Cell = { button, icon, plus, count, label, target, ref: null, signature: '' };
    cells.push(cell);
    listen(button, 'pointerenter', () => showTooltip(cell));
    listen(button, 'pointerleave', postponeHide);
    listen(button, 'focus', () => showTooltip(cell));
    listen(button, 'blur', postponeHide);
    listen(button, 'pointerdown', event => {
      const e = event as PointerEvent;
      if (e.button !== 0 || !cell.ref) return;
      // The reference is copied before a live refresh can change the cell underneath the pointer.
      pressed = { cell, ref: { ...cell.ref } };
      if (!model.readOnly) pointer = { kind: 'item', pointerId: e.pointerId, startX: e.clientX, startY: e.clientY, ref: { ...cell.ref }, source: cell, dragging: false };
    });
    listen(button, 'click', event => {
      const e = event as MouseEvent;
      if (performance.now() < suppressClickUntil) { e.preventDefault(); e.stopPropagation(); return; }
      if (e.detail > 1) return;
      const original = pressed?.cell === cell ? pressed.ref : cell.ref;
      pressed = null;
      if (original && cell.ref && !sameRef(original, cell.ref)) return;
      clickStart = original ? { cell, ref: { ...original } } : null;
      if (cell.target.location === 'equipment') options.onSlotSelect?.(cell.target.slot);
      options.onSelect(original ? { ...original } : null);
      refresh();
    });
    listen(button, 'dblclick', event => {
      event.preventDefault(); event.stopPropagation();
      if (performance.now() < suppressClickUntil) return;
      const original = clickStart?.cell === cell ? clickStart.ref : null;
      clickStart = null;
      if (!original || !cell.ref || !sameRef(original, cell.ref) || !validRef(original)) return;
      options.onActivate({ ...original });
      refresh();
    });
    listen(button, 'keydown', event => {
      const e = event as KeyboardEvent;
      if (e.key !== 'Enter' || e.repeat || !cell.ref) return;
      e.preventDefault(); e.stopPropagation();
      options.onActivate({ ...cell.ref }); refresh();
    });
    return cell;
  }
  GEAR_LAYOUT.forEach(([slot, label]) => equipment.append(createCell({ location: 'equipment', slot }, label).button));
  for (let index = 0; index < 42; index++) bagGrid.append(createCell({ location: 'bag', bagIndex: index }, '').button);

  function clampPosition() {
    const maxX = Math.max(EDGE, window.innerWidth - PANEL_WIDTH * scale - EDGE);
    const maxY = Math.max(EDGE, window.innerHeight - PANEL_HEIGHT * scale - DOCK_CLEARANCE);
    position.x = Math.max(EDGE, Math.min(position.x, maxX));
    position.y = Math.max(EDGE, Math.min(position.y, maxY));
    element.style.left = `${position.x}px`; element.style.top = `${position.y}px`;
  }
  function resize() {
    if (destroyed) return;
    const requestedScale = Math.max(.8, Math.min(1.25, options.read().scale ?? 1));
    scale = Math.min(requestedScale, (window.innerWidth - EDGE * 2) / PANEL_WIDTH, (window.innerHeight - DOCK_CLEARANCE - EDGE) / PANEL_HEIGHT);
    scale = Math.max(.35, scale);
    element.style.transform = `scale(${scale})`;
    element.dataset.scale = String(scale);
    const before = { ...position };
    clampPosition(); positionTooltip();
    if (before.x !== position.x || before.y !== position.y) options.onPosition?.({ ...position });
  }
  function refresh() {
    if (destroyed) return;
    const oldScale = model.scale;
    model = options.read();
    if (model.readOnly && !previousReadOnly) cancelInteraction();
    previousReadOnly = !!model.readOnly;
    element.classList.toggle('ci-readonly', !!model.readOnly);
    characterName.textContent = model.name;
    characterClass.textContent = `${model.className} · ${model.level} ур.`;
    const nextStats = JSON.stringify(model.stats);
    if (statsSignature !== nextStats) {
      const oldScroll = stats.scrollTop;
      const fragment = document.createDocumentFragment();
      for (const stat of model.stats) {
        const row = node('div', 'ci-stat-row');
        if (stat.key) row.dataset.stat = stat.key;
        row.append(node('span', '', stat.label), node('strong', '', String(stat.value)));
        fragment.append(row);
      }
      stats.replaceChildren(fragment); stats.scrollTop = oldScroll; statsSignature = nextStats;
    }
    for (const cell of cells) {
      const item = cell.target.location === 'bag' ? model.bag[cell.target.bagIndex] : model.equipment[cell.target.slot];
      const previousRef = cell.ref;
      cell.ref = item ? refOf(item, cell.target) : null;
      if (hovered === cell && previousRef && (!cell.ref || previousRef.uid !== cell.ref.uid)) hideTooltip();
      const signature = JSON.stringify(item ?? null);
      if (signature !== cell.signature) {
        cell.signature = signature;
        cell.button.classList.toggle('ci-filled', !!item);
        if (item) {
          cell.button.dataset.uid = item.uid;
          cell.button.dataset.itemId = item.id;
          cell.button.dataset.plus = String(item.plus);
          cell.button.dataset.count = String(item.count);
          cell.icon.innerHTML = iconMarkup(iconKind(item));
          cell.icon.dataset.itemKind = item.id === 'ether' ? 'ether' : iconKind(item);
          cell.plus.textContent = item.plus ? `+${item.plus}` : '';
          cell.count.textContent = item.count > 1 ? String(item.count) : '';
          cell.button.setAttribute('aria-label', `${item.name}${item.plus ? ` +${item.plus}` : ''}${item.count > 1 ? `, ${item.count} шт.` : ''}${cell.target.location === 'equipment' ? ', надето' : ''}`);
          if (item.quality) cell.button.dataset.quality = item.quality; else delete cell.button.dataset.quality;
        } else {
          delete cell.button.dataset.uid; delete cell.button.dataset.itemId; delete cell.button.dataset.plus; delete cell.button.dataset.count; delete cell.button.dataset.quality;
          const slot = cell.target.location === 'equipment' ? cell.target.slot.replace(/[12]$/, '') : '';
          cell.icon.innerHTML = slot ? iconMarkup(slot === 'weapon' ? 'sword' : slot) : '';
          delete cell.icon.dataset.itemKind;
          cell.plus.textContent = ''; cell.count.textContent = '';
          cell.button.setAttribute('aria-label', cell.target.location === 'equipment' ? `${cell.label.textContent}, пусто` : `Ячейка ${cell.target.bagIndex + 1}, пусто`);
        }
      }
      const selected = !!item && model.selectedUid === item.uid;
      cell.button.classList.toggle('ci-selected', selected);
      cell.button.setAttribute('aria-pressed', String(selected));
      cell.button.classList.toggle('ci-preferred-slot', cell.target.location === 'equipment' && cell.target.slot === model.activeSlot);
    }
    gold.textContent = `◈ ${typeof model.gold === 'number' ? model.gold.toLocaleString('ru-RU') : model.gold}`;
    gold.setAttribute('aria-label', `Золото: ${model.gold}`);
    capacity.textContent = `${model.bag.filter(Boolean).length} / ${model.capacity}`;
    const selected = cells.find(cell => cell.ref?.uid === model.selectedUid);
    const selectedItem = selected?.target.location === 'bag' ? model.bag[selected.target.bagIndex] : selected?.target.location === 'equipment' ? model.equipment[selected.target.slot] : null;
    selectionName.textContent = selectedItem ? `${selectedItem.name}${selectedItem.plus ? ` +${selectedItem.plus}` : ''}` : 'Выберите предмет';
    status.textContent = model.status || (model.readOnly ? 'Персонаж погиб · доступен просмотр' : 'Наведите на предмет для сравнения');
    const nextActions = JSON.stringify((model.actions ?? []).map(action => ({ id: action.id, label: action.label })));
    if (actionSignature !== nextActions) {
      actions.replaceChildren(); actionButtons.clear();
      for (const action of model.actions ?? []) {
        const button = node('button', 'ci-action', action.label); button.type = 'button'; button.dataset.action = action.id;
        button.id = ({ equip: 'equip-item', use: 'use-item', sell: 'sell-item', 'collect-buffer': 'collect-buffer' } as Record<string, string>)[action.id] || `inventory-${action.id}`;
        let actionRef: InventoryItemRef | null | undefined;
        listen(button, 'pointerdown', () => { const ref = selectedRef(); actionRef = ref ? { ...ref } : null; });
        listen(button, 'click', () => { const ref = actionRef === undefined ? selectedRef() : actionRef; actionRef = undefined; options.onAction?.(action.id, ref); refresh(); });
        actions.append(button); actionButtons.set(action.id, button);
      }
      actionSignature = nextActions;
    }
    for (const action of model.actions ?? []) {
      const button = actionButtons.get(action.id);
      if (button) button.disabled = !!action.disabled || !!model.readOnly;
    }
    if (hovered && !tooltip.hidden) updateTooltip();
    if (oldScale !== model.scale) resize();
  }

  listen(close, 'click', () => options.onClose());
  listen(header, 'pointerdown', event => {
    const e = event as PointerEvent;
    if (e.button !== 0 || (e.target as HTMLElement).closest('button')) return;
    e.preventDefault(); hideTooltip();
    pointer = { kind: 'window', pointerId: e.pointerId, startX: e.clientX, startY: e.clientY, origin: { ...position } };
    element.classList.add('ci-dragging');
  });
  listen(document, 'pointermove', event => {
    const e = event as PointerEvent;
    if (!pointer || e.pointerId !== pointer.pointerId) return;
    if (pointer.kind === 'window') {
      position = { x: pointer.origin.x + e.clientX - pointer.startX, y: pointer.origin.y + e.clientY - pointer.startY };
      clampPosition();
      return;
    }
    if (!pointer.dragging && Math.hypot(e.clientX - pointer.startX, e.clientY - pointer.startY) < 6) return;
    if (!pointer.dragging) {
      pointer.dragging = true; hideTooltip();
      ghost.replaceChildren(pointer.source.icon.cloneNode(true));
      ghost.hidden = false; element.classList.add('ci-dragging');
    }
    ghost.style.left = `${e.clientX + 10}px`; ghost.style.top = `${e.clientY + 10}px`;
    setDropHighlight(cellAt(e.clientX, e.clientY)?.button ?? null);
  });
  listen(document, 'pointerup', event => {
    const e = event as PointerEvent;
    if (!pointer || e.pointerId !== pointer.pointerId) return;
    const completed = pointer;
    if (completed.kind === 'window') {
      stopPointer(true); options.onPosition?.({ ...position }); return;
    }
    if (!completed.dragging) { pointer = null; return; }
    const target = cellAt(e.clientX, e.clientY);
    stopPointer(true); clickStart = null;
    if (target && validRef(completed.ref) && !model.readOnly) options.onMove({ ...completed.ref }, { ...target.target });
    refresh();
  });
  listen(document, 'pointercancel', () => { if (pointer) stopPointer(true); });
  listen(window, 'blur', () => { if (pointer) stopPointer(true); hideTooltip(); });
  listen(window, 'resize', resize);
  listen(tooltip, 'pointerenter', () => { clearTimeout(hideTimer); hideTimer = undefined; });
  listen(tooltip, 'pointerleave', postponeHide);
  listen(tooltip, 'focus', () => { clearTimeout(hideTimer); hideTimer = undefined; });
  listen(tooltip, 'blur', postponeHide);
  listen(bagScroll, 'scroll', () => { if (!tooltip.matches(':hover') && document.activeElement !== tooltip) hideTooltip(); });
  // Root owns Escape/Tab and world input. This window consumes only its pointer interactions.
  listen(element, 'contextmenu', event => event.preventDefault());
  listen(element, 'wheel', event => event.stopPropagation());
  listen(tooltip, 'wheel', event => event.stopPropagation());
  refresh(); resize();
  return {
    element, refresh, resize, cancelInteraction,
    destroy() {
      if (destroyed) return;
      cancelInteraction(); destroyed = true; abort.abort();
      element.remove(); tooltip.remove(); ghost.remove();
    },
  };
}
