// Block C: real browser input in the downloadable game, followed by isolated
// deterministic inventory edge cases. Mutating fixtures never ship in dist.
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';

const directory = path.resolve(process.argv[2] ?? 'dist-qa');
const production = process.argv[3] === 'production';
const label = production ? 'C-production' : 'C';
const reportDir = path.resolve('qa-artifacts');
await mkdir(reportDir, { recursive: true });
const mime = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json',
  '.gltf': 'model/gltf+json', '.glb': 'model/gltf-binary', '.jpg': 'image/jpeg', '.png': 'image/png',
  '.svg': 'image/svg+xml', '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg' };
const server = createServer(async (request, response) => {
  try {
    const pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
    if (pathname === '/favicon.ico') { response.writeHead(204).end(); return; }
    const file = path.resolve(directory, `.${pathname === '/' ? '/index.html' : pathname}`);
    if (!file.startsWith(`${directory}${path.sep}`)) { response.writeHead(403).end(); return; }
    const bytes = await readFile(file);
    response.writeHead(200, { 'Content-Type': mime[path.extname(file)] ?? 'application/octet-stream' }).end(bytes);
  } catch { response.writeHead(404).end(); }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const browser = await chromium.launch({ executablePath: process.env.BROWSER_EXECUTABLE, headless: true,
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--disable-dev-shm-usage', '--no-sandbox'] });
const context = await browser.newContext({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });
const page = await context.newPage(); page.setDefaultTimeout(60000);
const report = { block: label, sha: process.env.GITHUB_SHA ?? 'local', browser: browser.version(), passed: false,
  environment: 'Chromium software WebGL; not a hardware FPS benchmark',
  profile: 'Real production inputs; Low / 50% render; 1280x720, 1366x768, 1920x1080, 2560x1440; UI 80/100/125%',
  checks: [], errors: [] };
page.on('pageerror', e => report.errors.push(e.stack ?? e.message));
page.on('console', m => { if (m.type() === 'error') report.errors.push(m.text()); });
page.on('requestfailed', r => report.errors.push(`${r.url()}: ${r.failure()?.errorText}`));
page.on('response', r => { if (r.status() >= 400 && !r.url().endsWith('/favicon.ico')) report.errors.push(`HTTP ${r.status()} ${r.url()}`); });
const check = (name, data = {}) => { report.checks.push({ name, ...data }); console.log('PASS', name); };
const state = () => page.evaluate(() => window.__VARENDOR_QA__.getState());
const inventory = () => page.evaluate(() => window.__VARENDOR_FIXTURE__.inventorySnapshot());
const windowLocator = () => page.locator('[data-inventory-window]');
const bag = uid => page.locator(`.ci-bag-grid [data-uid="${uid}"]`);
const slot = name => page.locator(`.ci-equipment-grid [data-slot="${name}"]`);
const tooltip = () => page.locator('[data-inventory-tooltip]');
const itemList = snapshot => snapshot.inventory ?? snapshot.items;
const carried = snapshot => [...itemList(snapshot), ...Object.values(snapshot.equipment).filter(Boolean)].map(i => i.uid).sort();
const nearly = (actual, expected, message) => assert.ok(Math.abs(actual - expected) < 1e-6, `${message}: ${actual} != ${expected}`);
const totalStat = (snapshot, key) => key === 'hp' ? snapshot.maxHp : key === 'mp' ? snapshot.maxMp : snapshot.stats[key];

async function start() {
  await page.goto(`http://127.0.0.1:${server.address().port}`);
  await page.locator('[data-class="knight"]').click(); await page.locator('#begin').click();
  await page.waitForFunction(() => window.__VARENDOR_QA__?.getState().started, {}, { timeout: 180000 });
  assert.equal(await page.evaluate(() => typeof window.__VARENDOR_FIXTURE__), production ? 'undefined' : 'object');
  await page.keyboard.press('Escape');
  await page.locator('#quality').selectOption('low');
  await page.locator('#resolution-scale').selectOption('0.5');
  await page.locator('#save-settings').click();
}

async function openBag() {
  if ((await state()).activeWindow !== 'inventory') await page.keyboard.press('Tab');
  await windowLocator().waitFor({ state: 'visible' });
}

async function twoFrames() {
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
}

async function screenshot(name) {
  await twoFrames();
  await page.screenshot({ path: path.join(reportDir, `${name}.png`) });
}

async function bounds(selector) {
  return page.locator(selector).evaluate(element => {
    const box = element.getBoundingClientRect();
    return { x: box.x, y: box.y, width: box.width, height: box.height, right: box.right, bottom: box.bottom };
  });
}

async function contained(selector, name) {
  const box = await bounds(selector), viewport = page.viewportSize();
  assert.ok(box.x >= -1 && box.y >= -1 && box.right <= viewport.width + 1 && box.bottom <= viewport.height + 1,
    `${name} outside viewport: ${JSON.stringify({ box, viewport })}`);
  return box;
}

async function geometry(name, standardRows = false) {
  await twoFrames();
  const box = await contained('[data-inventory-window]', name), viewport = page.viewportSize();
  assert.ok(box.width < viewport.width * .46, `inventory has become a wide/fullscreen menu: ${JSON.stringify(box)}`);
  assert.equal(await page.locator('.ci-bag-grid [data-bag-index]').count(), 42);
  assert.equal(await page.locator('.ci-equipment-grid [data-slot]').count(), 12);
  const layout = await page.locator('.ci-bag-grid').evaluate(grid => {
    const cells = [...grid.querySelectorAll('[data-bag-index]')].map(e => e.getBoundingClientRect());
    const scroll = document.querySelector('.ci-bag-scroll');
    return { columns: getComputedStyle(grid).gridTemplateColumns.split(' ').length,
      cellWidth: cells[0].width, cellHeight: cells[0].height,
      rowPitch: cells[6].top - cells[0].top, visibleHeight: scroll.getBoundingClientRect().height,
      scrollHeight: scroll.scrollHeight, clientHeight: scroll.clientHeight };
  });
  assert.equal(layout.columns, 6);
  assert.ok(Math.abs(layout.cellWidth - layout.cellHeight) < 2, `bag cells are not square: ${JSON.stringify(layout)}`);
  assert.ok(layout.scrollHeight > layout.clientHeight + 20, 'remaining bag rows are not scrollable');
  if (standardRows) assert.ok(layout.visibleHeight / layout.rowPitch >= 2.8 && layout.visibleHeight / layout.rowPitch <= 3.15,
    `default bag must show three rows: ${JSON.stringify(layout)}`);
  check(name, { viewport, box, layout });
}

async function changeScale(value) {
  if ((await state()).activeWindow) await page.keyboard.press('Escape');
  await page.keyboard.press('Escape');
  await page.locator('#ui-scale').focus(); await page.keyboard.press('Home');
  for (let step = 80; step < Math.round(value * 100); step += 5) await page.keyboard.press('ArrowRight');
  await page.locator('#save-settings').click();
  await openBag();
}

async function dragWindow(dx, dy) {
  const header = await page.locator('[data-inventory-drag]').boundingBox(); assert.ok(header);
  const x = header.x + Math.min(header.width * .35, 130), y = header.y + header.height / 2;
  await page.mouse.move(x, y); await page.mouse.down();
  await page.mouse.move(x + dx, y + dy, { steps: 5 }); await page.mouse.up();
  await twoFrames();
}

async function setup(scenario) {
  const fixture = await page.evaluate(s => window.__VARENDOR_FIXTURE__.inventorySetup(s), scenario);
  await openBag(); return fixture;
}

async function hover(uid) {
  await bag(uid).hover(); await tooltip().waitFor({ state: 'visible' });
  await contained('[data-inventory-tooltip]', 'item tooltip');
}

async function selectedComparison() {
  return page.locator('.ci-comparison[data-comparison-selected="true"]').evaluate(element => ({
    text: element.textContent,
    rows: [...element.querySelectorAll('.ci-tooltip-row[data-stat]')].map(row => ({ stat: row.dataset.stat, value: Number(row.dataset.value) })),
  }));
}

async function compareActualEquip(uid, expectedSlot) {
  const before = await inventory();
  await hover(uid); const comparison = await selectedComparison();
  assert.ok(comparison.rows.length, `comparison has no actual stat deltas: ${JSON.stringify(comparison)}`);
  await bag(uid).dblclick(); const after = await inventory();
  assert.equal(after.equipment[expectedSlot]?.uid, uid, `unexpected equip destination ${expectedSlot}`);
  assert.equal(itemList(after).filter(i => i.uid === uid).length, 0);
  assert.deepEqual(carried(after), carried(before), 'equipment transfer duplicated or lost an item');
  for (const row of comparison.rows) nearly(totalStat(after, row.stat) - totalStat(before, row.stat), row.value, `tooltip ${row.stat} delta`);
  return { before, after, comparison };
}

async function productionScenario() {
  await openBag(); await geometry('Tab opens a compact 6x3 floating bag with all 42 cells and 12 equipment slots', true);
  const box = await bounds('[data-inventory-window]');
  assert.ok(box.x > 1280 / 2, `default inventory covers the hero's central view: ${JSON.stringify(box)}`);
  assert.equal(await page.evaluate(() => document.elementFromPoint(innerWidth * .5, innerHeight * .45)?.id), 'game-canvas',
    'center of the live world is covered by a shade or inventory');
  const shades = await page.locator('#modal-root .modal-shade').evaluateAll(elements => elements.filter(e => {
    const s = getComputedStyle(e); return s.display !== 'none' && s.visibility !== 'hidden' && s.pointerEvents !== 'none';
  }).length);
  assert.equal(shades, 0, 'inventory created a modal backdrop');
  await screenshot('C-production-compact');
  const beforeTime = await state();
  await page.waitForFunction(t => window.__VARENDOR_QA__.getState().simulationSeconds > t + .5, beforeTime.simulationSeconds);
  check('open bag leaves the real world ticking and central scene directly reachable');

  const beforeMove = await state();
  // This point is ordinary visible terrain immediately ahead of the normal
  // spawn. Telemetry only observes the accepted command and actual movement.
  await page.mouse.click(590, 465);
  await page.waitForFunction(p => {
    const s = window.__VARENDOR_QA__.getState();
    return Math.hypot(s.player.x - p.x, s.player.z - p.z) > .25;
  }, beforeMove.player, { timeout: 30000 });
  assert.equal((await state()).activeWindow, 'inventory');
  await page.keyboard.press('s');
  const settled = await state();
  await page.locator('.ci-bag-grid [data-bag-index="10"]').click();
  await page.waitForFunction(t => window.__VARENDOR_QA__.getState().simulationSeconds > t + .4, settled.simulationSeconds);
  const afterCell = await state();
  assert.ok(Math.hypot(afterCell.player.x - settled.player.x, afterCell.player.z - settled.player.z) < .12,
    'click on bag cell leaked into world movement');
  check('real ground click moves with bag open; bag-cell input does not click through');

  await page.keyboard.down('Tab'); await page.keyboard.down('Tab'); await page.keyboard.up('Tab');
  assert.equal((await state()).activeWindow, null);
  await page.keyboard.press('Tab'); assert.equal((await state()).activeWindow, 'inventory');
  await page.locator('#chat').focus(); await page.keyboard.type('wasd123');
  assert.equal((await state()).activeWindow, 'inventory');
  const typed = await state(); assert.deepEqual(typed.player.cooldowns, [0, 0, 0, 0]);
  await page.keyboard.press('Escape');
  // Escape first releases text entry; the next Tab still toggles the bag once.
  await page.keyboard.press('Tab'); assert.equal((await state()).activeWindow, null);
  await page.keyboard.press('Tab'); assert.equal((await state()).activeWindow, 'inventory');
  check('Tab toggles once despite repeat; chat focus does not execute inventory or combat commands');

  await slot('weapon').hover(); await tooltip().waitFor({ state: 'visible' });
  const equippedText = await tooltip().innerText();
  assert.ok(equippedText.trim().length > 40, 'equipped item hover is empty');
  await contained('[data-inventory-tooltip]', 'production equipped item tooltip');
  await screenshot('C-production-tooltip');
  await page.mouse.move(500, 350);
  const initial = await bounds('[data-inventory-window]');
  await dragWindow(-95, -30);
  const dragged = await contained('[data-inventory-window]', 'dragged inventory');
  assert.ok(Math.hypot(dragged.x - initial.x, dragged.y - initial.y) > 50, 'header did not move inventory');
  await page.keyboard.press('Tab'); await page.keyboard.press('Tab');
  const reopened = await bounds('[data-inventory-window]');
  assert.ok(Math.hypot(reopened.x - dragged.x, reopened.y - dragged.y) < 2, 'reopening forgot window position');
  await page.reload(); await page.locator('#continue').click();
  await page.waitForFunction(() => window.__VARENDOR_QA__?.getState().started, {}, { timeout: 180000 });
  await openBag(); const reloaded = await bounds('[data-inventory-window]');
  assert.ok(Math.hypot(reloaded.x - dragged.x, reloaded.y - dragged.y) < 2, 'reload forgot window position');
  check('header drag is saved across closing and reloading', { dragged, reloaded });

  for (const scale of [.8, 1.25]) {
    await changeScale(scale);
    for (const [width, height] of [[1280, 720], [1366, 768], [1920, 1080], [2560, 1440]]) {
      await page.setViewportSize({ width, height });
      await geometry(`inventory remains reachable at ${width}x${height}, UI ${scale * 100}%`);
      await slot('weapon').hover(); await tooltip().waitFor({ state: 'visible' });
      await contained('[data-inventory-tooltip]', 'resized item tooltip');
      await page.mouse.move(500, 350);
      if (scale === 1.25 && width === 1280) await screenshot('C-production-scale125');
      if (scale === 1.25 && width === 2560) await screenshot('C-production-2560');
    }
  }
  // Move toward the far edge at the largest viewport, then shrink. Both the
  // header and full window must return inside the smaller usable area.
  await dragWindow(1400, 650);
  await page.setViewportSize({ width: 1280, height: 720 });
  await geometry('window moved on a large display clamps back after shrinking to 1280x720');
  await changeScale(1);
  await page.keyboard.press('Tab');
  assert.equal((await state()).activeWindow, null);
}

async function fixtureScenarios() {
  const normal = await setup('normal');
  await geometry('isolated edge cases use the same compact inventory', true);
  const initial = await inventory();
  await bag(normal.ids.weapon).click();
  assert.deepEqual((await inventory()).equipment, initial.equipment, 'a single selection click equipped an item');
  const weapon = await compareActualEquip(normal.ids.weapon, 'weapon');
  check('one click selects; one native double-click equips exactly once, with truthful character stat comparison', weapon.comparison);
  const beforeUnequip = await inventory();
  await slot('weapon').dblclick(); const unequipped = await inventory();
  assert.equal(unequipped.equipment.weapon, undefined);
  assert.equal(itemList(unequipped).filter(i => i.uid === normal.ids.weapon).length, 1);
  assert.deepEqual(carried(unequipped), carried(beforeUnequip));
  check('double-click on equipped item returns its existing unique instance to the bag');

  const full = await setup('full');
  const fullBefore = await inventory(); assert.equal(itemList(fullBefore).length, 42);
  const sourceIndex = itemList(fullBefore).findIndex(i => i.uid === full.ids.weapon);
  assert.ok(sourceIndex >= 0);
  const oldWeapon = fullBefore.equipment.weapon.uid;
  await bag(full.ids.weapon).dblclick();
  const swapped = await inventory();
  assert.equal(itemList(swapped).length, 42);
  assert.equal(swapped.equipment.weapon.uid, full.ids.weapon);
  assert.equal(itemList(swapped)[sourceIndex].uid, oldWeapon);
  assert.deepEqual(carried(swapped), carried(fullBefore));
  await slot('weapon').dblclick();
  const rejected = await inventory();
  assert.deepEqual(rejected.inventory, swapped.inventory);
  assert.deepEqual(rejected.equipment, swapped.equipment);
  assert.equal(rejected.gold, swapped.gold);
  check('full 42-slot bag permits exact 1:1 exchange; impossible unequip is rejected without loss or duplication');
  await page.locator('.ci-bag-grid [data-bag-index="41"]').scrollIntoViewIfNeeded();
  const last = await page.locator('.ci-bag-grid [data-bag-index="41"]').boundingBox();
  const scroll = await bounds('.ci-bag-scroll');
  assert.ok(last.y >= scroll.y - 1 && last.y + last.height <= scroll.bottom + 1);
  check('scroll reaches the final actual bag cell without changing item identities');

  const paired = await setup('pairs');
  await hover(paired.ids.ringCandidate);
  assert.equal(await page.locator('.ci-comparison').count(), 2, 'occupied ring pair needs both comparisons');
  assert.equal(await page.locator('.ci-comparison[data-comparison-selected="true"]').count(), 1);
  await screenshot('C-pairs');
  const defaultPair = await compareActualEquip(paired.ids.ringCandidate, 'ring1');
  assert.equal(defaultPair.after.equipment.ring2.uid, defaultPair.before.equipment.ring2.uid);
  check('both occupied ring slots are compared; hover and double-click replace the same deterministic first slot');

  const explicit = await setup('pairs');
  await slot('ring2').click();
  const explicitPair = await compareActualEquip(explicit.ids.ringCandidate, 'ring2');
  assert.equal(explicitPair.after.equipment.ring1.uid, explicitPair.before.equipment.ring1.uid);
  check('explicit second ring slot changes both comparison and actual destination');

  const free = await setup('pairs');
  await slot('ring2').dblclick();
  const freeBefore = await inventory(); assert.equal(freeBefore.equipment.ring2, undefined);
  // Clear the explicit slot selection made by clicking ring2 itself, so this
  // case genuinely exercises the first-free default rather than a preference.
  await page.keyboard.press('Tab'); await page.keyboard.press('Tab');
  const freePair = await compareActualEquip(free.ids.ringCandidate, 'ring2');
  assert.equal(freePair.after.equipment.ring1.uid, freePair.before.equipment.ring1.uid);
  check('the first free ring slot is selected before replacing an occupied one');

  const drag = await setup('pairs');
  const dragBefore = await inventory();
  const from = await bag(drag.ids.ringCandidate).boundingBox(), destination = await slot('ring2').boundingBox();
  assert.ok(from && destination);
  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2); await page.mouse.down();
  await page.mouse.move(destination.x + destination.width / 2, destination.y + destination.height / 2, { steps: 8 });
  await page.mouse.up();
  const dragAfter = await inventory();
  assert.equal(dragAfter.equipment.ring2.uid, drag.ids.ringCandidate);
  assert.equal(dragAfter.equipment.ring1.uid, dragBefore.equipment.ring1.uid);
  assert.deepEqual(carried(dragAfter), carried(dragBefore));
  check('dragging a ring to the second slot performs one transfer without a click/double-click side effect');

  const reorder = await setup('normal');
  const orderBefore = await inventory();
  const orderSource = await bag(reorder.ids.weapon).boundingBox();
  const orderTarget = await page.locator('.ci-bag-grid [data-bag-index="5"]').boundingBox();
  assert.ok(orderSource && orderTarget);
  await page.mouse.move(orderSource.x + orderSource.width / 2, orderSource.y + orderSource.height / 2);
  await page.mouse.down();
  await page.mouse.move(orderTarget.x + orderTarget.width / 2, orderTarget.y + orderTarget.height / 2, { steps: 8 });
  await page.mouse.up();
  const orderAfter = await inventory();
  assert.equal(itemList(orderAfter)[5].uid, reorder.ids.weapon);
  assert.deepEqual(carried(orderAfter), carried(orderBefore));
  assert.deepEqual(orderAfter.equipment, orderBefore.equipment);
  assert.deepEqual([...itemList(orderAfter)].sort((a, b) => a.uid.localeCompare(b.uid)),
    [...itemList(orderBefore)].sort((a, b) => a.uid.localeCompare(b.uid)));
  check('native bag drag changes order while preserving all unique item properties and equipment');
  const cancelFrom = await bag(reorder.ids.weapon).boundingBox();
  const cancelTo = await page.locator('.ci-bag-grid [data-bag-index="0"]').boundingBox();
  await page.mouse.move(cancelFrom.x + cancelFrom.width / 2, cancelFrom.y + cancelFrom.height / 2);
  await page.mouse.down();
  await page.mouse.move(cancelTo.x + cancelTo.width / 2, cancelTo.y + cancelTo.height / 2, { steps: 5 });
  await page.keyboard.press('Escape'); await page.mouse.up();
  const cancelled = await inventory();
  assert.deepEqual(cancelled.inventory, orderAfter.inventory);
  assert.deepEqual(cancelled.equipment, orderAfter.equipment);
  await openBag();
  check('Escape cancels an unfinished drag; releasing afterward cannot perform a stale transfer');

  const long = await setup('long');
  const seen = new Set();
  const labelFor = { atk: 'Атака', matk: 'Магическая атака', def: 'Защита', mdef: 'Магическая защита',
    hp: 'Здоровье', mp: 'Мана', crit: 'Критический шанс', accuracy: 'Точность', evasion: 'Уклонение', speed: 'Скорость' };
  for (const uid of long.ids.statsItems) {
    await hover(uid);
    const rows = await page.locator('.ci-tooltip-main .ci-tooltip-row[data-stat]').evaluateAll(elements => elements.map(e => e.dataset.stat));
    const definition = long.definitions[uid];
    for (const key of Object.keys(labelFor)) if (definition[key] !== undefined && definition[key] !== 0) {
      if (key === 'atk') assert.ok(rows.includes('atk') || (rows.includes('atkMin') && rows.includes('atkMax')), `missing attack range in ${definition.name}`);
      else assert.ok(rows.includes(key), `missing active ${key} in ${definition.name}: ${JSON.stringify(rows)}`);
      seen.add(key);
    }
    const text = await tooltip().innerText();
    assert.ok(text.includes(definition.name));
    if (definition.origin) assert.ok(text.includes(definition.origin), `missing existing source for ${definition.name}`);
  }
  for (const key of Object.keys(labelFor)) assert.ok(seen.has(key), `real inventory fixture did not cover ${key}`);
  await hover(long.ids.longItem);
  const tooltipBefore = await tooltip().innerText();
  assert.ok(tooltipBefore.includes('+8'), 'enhancement level absent from real +8 item tooltip');
  await screenshot('C-long-tooltip');
  const readout = await tooltip().evaluate(element => {
    const nested = [element, ...element.querySelectorAll('*')].filter(node => node instanceof HTMLElement
      && ['auto', 'scroll'].includes(getComputedStyle(node).overflowY));
    return { scrollable: nested.length, cropped: element.scrollHeight > element.clientHeight + 2,
      text: element.innerText };
  });
  assert.ok(!readout.cropped || readout.scrollable > 0, 'long tooltip content cannot be read completely');
  check('hover shows every real active item stat, source and +level; long tooltip remains readable', { coveredStats: [...seen] });

  // Exercise real HP and MP equipment, so preservation is not vacuously tested
  // with an attack-only sword whose resource maxima would never change.
  for (const resource of ['hp', 'mp']) {
    const candidate = long.ids.statsItems.find(uid => long.definitions[uid][resource] > 0);
    assert.ok(candidate, `missing actual ${resource} gear`);
    await page.evaluate(() => { const f = window.__VARENDOR_FIXTURE__; f.vitals(37, 21); f.cooldowns([2, 3, 4, 5]); });
    const changed = await compareActualEquip(candidate, long.definitions[candidate].slot);
    assert.notEqual(totalStat(changed.after, resource), totalStat(changed.before, resource), `${resource} fixture did not change a maximum`);
    nearly(changed.after.hp, Math.min(changed.before.hp, changed.after.maxHp), `${resource} gear did not refill HP`);
    nearly(changed.after.mp, Math.min(changed.before.mp, changed.after.maxMp), `${resource} gear did not refill MP`);
    assert.deepEqual(changed.after.cooldowns, changed.before.cooldowns);
    await page.evaluate(() => { const f = window.__VARENDOR_FIXTURE__, s = f.inventorySnapshot(); f.vitals(s.maxHp, s.maxMp); });
    const beforeRemoval = await inventory();
    await slot(long.definitions[candidate].slot).dblclick();
    const removed = await inventory();
    nearly(removed.hp, Math.min(beforeRemoval.hp, removed.maxHp), `${resource} removal HP clamp`);
    nearly(removed.mp, Math.min(beforeRemoval.mp, removed.maxMp), `${resource} removal MP clamp`);
    assert.deepEqual(removed.cooldowns, beforeRemoval.cooldowns);
  }
  check('real HP/MP gear changes maxima without healing; removing it clamps current resources and preserves cooldowns');

  const depleted = await setup('depleted');
  const depletedBefore = await inventory();
  assert.ok(depletedBefore.hp < depletedBefore.maxHp && depletedBefore.mp < depletedBefore.maxMp);
  const gearChange = await compareActualEquip(depleted.ids.weapon, 'weapon');
  nearly(gearChange.after.hp, Math.min(gearChange.before.hp, gearChange.after.maxHp), 'equip HP preservation');
  nearly(gearChange.after.mp, Math.min(gearChange.before.mp, gearChange.after.maxMp), 'equip MP preservation');
  assert.deepEqual(gearChange.after.cooldowns, gearChange.before.cooldowns);
  await slot('weapon').dblclick();
  const resources = await inventory();
  nearly(resources.hp, Math.min(gearChange.after.hp, resources.maxHp), 'unequip HP preservation');
  nearly(resources.mp, Math.min(gearChange.after.mp, resources.maxMp), 'unequip MP preservation');
  assert.deepEqual(resources.cooldowns, depletedBefore.cooldowns);
  check('equip and unequip preserve current HP/MP and cooldowns while recalculating real maxima');
  const potionBefore = await inventory();
  const potionCount = itemList(potionBefore).find(i => i.uid === depleted.ids.potion).count;
  await bag(depleted.ids.potion).dblclick();
  const potionAfter = await inventory();
  assert.equal(itemList(potionAfter).find(i => i.uid === depleted.ids.potion)?.count ?? 0, potionCount - 1);
  assert.ok(potionAfter.hp > potionBefore.hp && potionAfter.hp <= potionAfter.maxHp);
  assert.deepEqual(potionAfter.cooldowns, potionBefore.cooldowns);
  check('one native double-click consumes one potion from its existing stack and applies one valid heal');

  const stale = await setup('normal');
  await hover(stale.ids.weapon);
  await bag(stale.ids.weapon).click();
  await bag(stale.ids.weapon).evaluate(element => { window.__STALE_INVENTORY_BUTTON__ = element; });
  await page.evaluate(uid => window.__VARENDOR_FIXTURE__.inventoryRemove(uid), stale.ids.weapon);
  const staleBefore = await inventory();
  await page.evaluate(() => window.__STALE_INVENTORY_BUTTON__.dispatchEvent(new MouseEvent('dblclick', { bubbles: true, detail: 2 })));
  const staleAfter = await inventory();
  assert.deepEqual(staleAfter.inventory, staleBefore.inventory);
  assert.deepEqual(staleAfter.equipment, staleBefore.equipment);
  assert.ok(!(await tooltip().isVisible()) || !(await tooltip().innerText()).includes(stale.definitions[stale.ids.weapon].name),
    'tooltip retained a removed item');
  check('removing a hovered unique item clears its tooltip; a stale button cannot equip the replacement array entry');

  const saved = await setup('pairs');
  await slot('ring2').click(); await bag(saved.ids.ringCandidate).dblclick();
  const beforeReload = await inventory();
  await page.reload(); await page.locator('#continue').click();
  await page.waitForFunction(() => window.__VARENDOR_QA__?.getState().started, {}, { timeout: 180000 });
  await page.evaluate(() => window.__VARENDOR_FIXTURE__.pause(true));
  const afterReload = await inventory();
  assert.deepEqual(afterReload.inventory, beforeReload.inventory);
  assert.deepEqual(afterReload.equipment, beforeReload.equipment);
  assert.deepEqual(afterReload.stats, beforeReload.stats);
  check('save and reload retain item identities, chosen equipment slots and resulting stats');

  const death = await setup('normal');
  await page.evaluate(() => window.__VARENDOR_FIXTURE__.die());
  await openBag();
  const deadBefore = await inventory(); assert.equal(deadBefore.dead, true);
  await hover(death.ids.weapon); await contained('[data-inventory-tooltip]', 'dead character item tooltip');
  await bag(death.ids.weapon).dblclick({ force: true });
  await slot('weapon').dblclick({ force: true });
  await bag(death.ids.potion).dblclick({ force: true });
  const deadAfter = await inventory();
  assert.deepEqual(deadAfter.inventory, deadBefore.inventory);
  assert.deepEqual(deadAfter.equipment, deadBefore.equipment);
  assert.deepEqual(deadAfter.cooldowns, deadBefore.cooldowns);
  assert.equal(deadAfter.hp, 0); assert.equal(deadAfter.mp, deadBefore.mp);
  await screenshot('C-death-inventory');
  check('dead player can inspect the compact bag and tooltips, while equip, unequip and consumables remain denied');
}

try {
  await start();
  if (production) await productionScenario(); else await fixtureScenarios();
  assert.deepEqual(report.errors, []);
  report.passed = true;
} catch (error) {
  report.failure = error.stack ?? String(error);
  await page.screenshot({ path: path.join(reportDir, `${label}-failure.png`) }).catch(() => {});
  throw error;
} finally {
  await writeFile(path.join(reportDir, `${label}-inventory.json`), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
  await browser.close(); await new Promise(resolve => server.close(resolve));
}
