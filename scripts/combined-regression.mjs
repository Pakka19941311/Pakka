// Combined F: one focused production run and one isolated deterministic run.
// Math boundaries live in unit tests; old full-block browser matrices are not repeated.
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';

const directory = path.resolve(process.argv[2] ?? 'dist-qa');
const production = process.argv[3] === 'production';
const label = production ? 'F-production' : 'F';
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
let context, page;
const report = { block: label, sha: process.env.GITHUB_SHA ?? 'local', browser: browser.version(), passed: false,
  environment: 'Chromium software WebGL; not a hardware FPS benchmark',
  profile: production ? 'Native production inputs; Low / 50% render; 1280x720; UI 100%'
    : 'Native input with isolated fixed world ticks; Low / 50% render; 1280x720; UI 100%',
  checks: [], errors: [] };
const check = (name, data = {}) => { report.checks.push({ name, ...data }); console.log('PASS', name); };
const state = () => page.evaluate(() => window.__VARENDOR_QA__.getState());
async function start(classId = 'knight') {
  if (context) await context.close();
  context = await browser.newContext({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });
  page = await context.newPage(); page.setDefaultTimeout(45000);
  page.on('pageerror', e => report.errors.push(e.stack ?? e.message));
  page.on('console', m => { if (m.type() === 'error') report.errors.push(m.text()); });
  page.on('requestfailed', r => report.errors.push(`${r.url()}: ${r.failure()?.errorText}`));
  page.on('response', r => { if (r.status() >= 400 && !r.url().endsWith('/favicon.ico')) report.errors.push(`HTTP ${r.status()} ${r.url()}`); });

  await page.goto(`http://127.0.0.1:${server.address().port}`);
  await page.locator(`[data-class="${classId}"]`).click(); await page.locator('#begin').click();
  await page.waitForFunction(() => window.__VARENDOR_QA__?.getState().started, {}, { timeout: 180000 });
  assert.equal(await page.evaluate(() => typeof window.__VARENDOR_FIXTURE__), production ? 'undefined' : 'object');
  await page.keyboard.press('Escape');
  await page.locator('#quality').selectOption('low');
  await page.locator('#resolution-scale').selectOption('0.5');
  await page.locator('#save-settings').click();
}

async function shot(name) {
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  return page.screenshot({ path: path.join(reportDir, `${label}-${name}.png`) });
}
const inv = async () => (await state()).inventory;
const snapshot = () => page.evaluate(() => window.__VARENDOR_FIXTURE__.combatSnapshot());
const step = seconds => page.evaluate(s => window.__VARENDOR_FIXTURE__.combatStep(s), seconds);
const setup = options => page.evaluate(o => window.__VARENDOR_FIXTURE__.combatSetup(o), options ?? {});
const aim = (id, engage = true) => page.evaluate(o => window.__VARENDOR_FIXTURE__.combatAim(o.id, o.engage), { id, engage });
const displacement = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
const releases = (s, index) => s.events.filter(e => e.kind === 'release' && e.skillIndex === index);
const bag = uid => page.locator(`.ci-bag-grid [data-uid="${uid}"]`);
const gear = uid => page.locator(`.ci-equipment-grid [data-uid="${uid}"]`);
async function openBag() { if ((await state()).activeWindow !== 'inventory') await page.keyboard.press('Tab'); }
async function closeBag() { if ((await state()).activeWindow === 'inventory') await page.keyboard.press('Tab'); }

// Fixed update ticks exercise the same movement/attack code without making the
// software renderer spend wall-clock seconds on every combat phase.
async function until(predicate, maximum = 6) {
  const result = await page.evaluate(({ expression, maximum }) => {
    const f = window.__VARENDOR_FIXTURE__;
    const test = new Function('s', `return (${expression})(s)`);
    let s = f.combatSnapshot();
    for (let i = 0; !test(s) && i < Math.ceil(maximum * 60); i++) { f.combatStep(1 / 60); s = f.combatSnapshot(); }
    return { matched: Boolean(test(s)), state: s };
  }, { expression: predicate.toString(), maximum });
  assert.ok(result.matched, `simulation condition timed out: ${predicate}\n${JSON.stringify(result.state)}`);
  return result.state;
}

async function statPanel() {
  await openBag();
  const rows = await page.locator('.ci-stats .ci-stat-row').evaluateAll(nodes => nodes.map(n => ({
    key: n.dataset.stat, label: n.querySelector('span').textContent, value: n.querySelector('strong').textContent,
  })));
  assert.deepEqual(rows.map(r => r.key), ['level', 'xp', 'hp', 'mp', 'str', 'dex', 'int', 'def', 'mdef']);
  assert.equal(rows.length, 9);
  assert.ok(rows.every(r => r.value.length > 0 && !/\d[.,]\d/.test(r.value)), JSON.stringify(rows));
  check('character inventory exposes exactly nine requested whole-number statistics', { rows });
}

async function productionRun() {
  await start();
  const initial = await state();
  assert.equal(initial.enhancement.betaBuild, true);
  const scrollIds = ['weapon_scroll', 'weapon_scroll_improved', 'armor_scroll', 'armor_scroll_improved'];
  for (const id of scrollIds) assert.equal(initial.inventory.inventory.find(i => i.id === id)?.count, 100);
  await statPanel();
  assert.equal(await page.locator('[id^="inventory-exchange-"]').count(), 0);
  const weapon = initial.inventory.equipment.weapon;
  await gear(weapon.uid).hover();
  const tooltip = await page.locator('[data-inventory-tooltip]').textContent();
  assert.match(tooltip, /Точность/);
  await shot('inventory-and-weapon');

  // One safe attempt is enough to protect both test stock and save integration.
  const scroll = initial.inventory.inventory.find(i => i.id === 'weapon_scroll');
  await bag(scroll.uid).dblclick();
  await gear(weapon.uid).click();
  assert.equal((await inv()).equipment.weapon.plus, weapon.plus + 1);
  assert.equal((await inv()).inventory.find(i => i.uid === scroll.uid).count, 99);
  await closeBag();

  // Native key remains physically held across both Tab edges in production.
  await page.keyboard.down('s');
  try {
    const before = await state();
    await page.waitForFunction(p => {
      const s = window.__VARENDOR_QA__.getState();
      return Math.hypot(s.player.x - p.x, s.player.z - p.z) > .15;
    }, before.player);
    await page.keyboard.press('Tab');
    assert.equal((await state()).activeWindow, 'inventory');
    const opened = await state();
    await page.waitForFunction(p => {
      const s = window.__VARENDOR_QA__.getState();
      return Math.hypot(s.player.x - p.x, s.player.z - p.z) > .15;
    }, opened.player);
    await page.keyboard.press('Tab');
    const closed = await state();
    await page.waitForFunction(p => {
      const s = window.__VARENDOR_QA__.getState();
      return Math.hypot(s.player.x - p.x, s.player.z - p.z) > .15;
    }, closed.player);
    assert.ok((await state()).simulationSeconds > before.simulationSeconds);
    check('production held S along the gate road keeps moving through inventory open and close; world continues');
  } finally { await page.keyboard.up('s'); }

  await page.reload(); await page.locator('#continue').click();
  await page.waitForFunction(() => window.__VARENDOR_QA__?.getState().started, {}, { timeout: 180000 });
  const restored = await inv();
  assert.equal(restored.equipment.weapon.uid, weapon.uid);
  assert.equal(restored.equipment.weapon.plus, weapon.plus + 1);
  for (const id of scrollIds) assert.equal(restored.inventory.find(i => i.id === id)?.count, id === 'weapon_scroll' ? 99 : 100);
  check('beta four hundred stock, one safe attempt and reload persist without replenishment or exchange');
}

async function movementAndCombat() {
  await start();
  await setup({ distance: 14 });
  await page.keyboard.down('w');
  try {
    await step(.2); const running = await state();
    await page.keyboard.press('Tab'); await step(.2);
    const opened = await state();
    assert.ok(displacement(running.player, opened.player) > .1);
    await page.keyboard.press('Tab'); await step(.2);
    assert.ok(displacement(opened.player, (await state()).player) > .1);
  } finally { await page.keyboard.up('w'); }
  check('held W survives both Tab edges in controlled real movement ticks');

  await setup({ distance: 14 });
  const startPosition = (await state()).player;
  await page.evaluate(p => window.__VARENDOR_FIXTURE__.moveTo(p.x, p.z + 7), startPosition);
  const destination = (await state()).moveTarget;
  assert.ok(destination);
  await page.keyboard.press('Tab');
  assert.deepEqual((await state()).moveTarget, destination);
  await step(.3); const walking = await state();
  assert.ok(displacement(startPosition, walking.player) > .2);
  await page.keyboard.press('Tab');
  assert.deepEqual((await state()).moveTarget, destination);
  await step(.3); assert.ok(displacement(walking.player, (await state()).player) > .2);
  check('click-to-move destination and travel survive inventory open and close');

  const chase = await setup({ distance: 14 });
  await aim(chase.targetIds[0]); await step(.1);
  const pursuing = await snapshot();
  assert.equal(pursuing.intent.autoAttackTargetId, chase.targetIds[0]);
  await page.keyboard.press('Tab');
  assert.deepEqual((await snapshot()).intent, pursuing.intent);
  await step(.4); const approached = await snapshot();
  assert.ok(displacement(pursuing.player, approached.player) > .2);
  await page.keyboard.press('Tab');
  assert.equal((await snapshot()).intent.autoAttackTargetId, chase.targetIds[0]);
  check('Tab preserves selected target and active basic pursuit');

  const melee = await setup({ distance: 2.6 });
  await aim(melee.targetIds[0]);
  const windup = await until(s => s.attack && !s.attack.impacted);
  await page.keyboard.press('Tab');
  assert.equal((await snapshot()).attack?.token, windup.attack.token);
  await step(2);
  const contact = await snapshot();
  assert.ok(releases(contact, null).length > 0);
  assert.equal(contact.intent.autoAttackTargetId, melee.targetIds[0]);
  await page.keyboard.press('Tab');
  assert.equal((await snapshot()).intent.autoAttackTargetId, melee.targetIds[0]);
  check('Tab during melee windup preserves action token and subsequent autoattack');

  const skill = await setup({ distance: 2.6 });
  await aim(skill.targetIds[0], false); await openBag(); await page.keyboard.press('1');
  const casting = await until(s => s.attack?.skillIndex === 0 && !s.attack.impacted);
  await closeBag(); assert.equal((await snapshot()).attack?.token, casting.attack.token);
  await step(2);
  const released = await snapshot();
  assert.equal(releases(released, 0).length, 1);
  assert.ok(released.player.cooldowns[0] > 0);
  check('skill can start while inventory is open; closing it does not cancel or double-charge');
}

async function pickingItemsAndCastle() {
  const picking = {};
  for (const which of ['near', 'blocked']) {
    const scene = await page.evaluate(() => window.__VARENDOR_FIXTURE__.combinedPickScene());
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    const point = picking[which] = scene[which];
    assert.ok(Number.isFinite(point.x) && Number.isFinite(point.y) && point.x > 0 && point.x < 1280 && point.y > 0 && point.y < 600,
      `${which}: fixture point not in exposed canvas: ${JSON.stringify(point)}`);
    await page.mouse.click(point.x, point.y);
    const selected = (await state()).selectedTarget;
    if (which === 'near') assert.equal(selected, point.uid, 'one near-silhouette click did not choose the intended monster');
    else assert.notEqual(selected, point.uid, 'forgiving pick selected a monster through a real wall');
    await page.evaluate(() => window.__VARENDOR_FIXTURE__.pause(true));
  }
  await shot('forgiving-pick');
  check('one real near-silhouette click selects; the same picker rejects an occluded monster', { picking });

  const audit = await page.evaluate(() => window.__VARENDOR_FIXTURE__.combinedItemAudit());
  assert.ok(Array.isArray(audit.items) && audit.items.length > 16);
  const levels = new Map();
  for (const item of audit.items) {
    if (!levels.has(item.id)) levels.set(item.id, []);
    levels.get(item.id).push(item.plus);
    for (const [key, value] of Object.entries(item.total)) {
      assert.ok(Number.isInteger(value), `${item.id}+${item.plus}: noninteger ${key}=${value}`);
      assert.ok(Number.isInteger(item.base[key]) && Number.isInteger(item.bonus[key]));
      assert.equal(value, item.base[key] + item.bonus[key], `${item.id}+${item.plus}: breakdown mismatch for ${key}`);
    }
  }
  for (const [id, plus] of levels) assert.deepEqual(plus.sort((a,b) => a-b), Array.from({length:16}, (_,i) => i), `${id}: missing enhancement step`);
  await writeFile(path.join(reportDir, 'F-item-audit.json'), JSON.stringify(audit, null, 2));
  check('actual item calculation and tooltip breakdown share whole numbers for every item +0 through +15', { definitions: levels.size, rows: audit.items.length });

  const missScene = await setup({ distance: 2.6 });
  await page.evaluate(() => window.__VARENDOR_FIXTURE__.combatHitRoll(0));
  await aim(missScene.targetIds[0], false); await page.keyboard.press('1');
  const missed = await until(s => s.events.some(e => e.kind === 'miss'));
  const target = missed.targets.find(t => t.uid === missScene.targetIds[0]);
  assert.equal(target.hp, 10000);
  assert.equal(missed.events.filter(e => e.kind === 'damage' && e.target === target.uid).length, 0);
  assert.equal(releases(missed, 0).length, 1);
  assert.ok(missed.player.mp < missed.player.maxMp && missed.player.cooldowns[0] > 0);
  await shot('rare-miss');
  check('forced rare MISS uses the real attack edge: no damage, one release and normal resource cost');

  for (const view of ['approach', 'courtyard', 'smith']) {
    const geometry = await page.evaluate(v => window.__VARENDOR_FIXTURE__.combinedCastleView(v), view);
    assert.equal(geometry.view, view);
    assert.ok(geometry.parts > 0);
    assert.equal(geometry.gateBlocked, false);
    assert.equal(geometry.gatePath, true);
    assert.equal(geometry.smithBlocked, false);
    assert.ok(geometry.npcs.length > 0 && geometry.npcs.every(npc => npc.blocked === false));
    await writeFile(path.join(reportDir, `F-castle-${view}.json`), JSON.stringify(geometry, null, 2));
    await shot(`castle-${view}`);
    check(`real castle ${view} rendered for geometry review`, { geometry });
  }
}

async function magicCast() {
  await start('mage');
  const scene = await setup({ distance: 6 });
  await aim(scene.targetIds[0], false); await page.keyboard.press('1');
  const casting = await until(s => s.attack?.skillIndex === 0 && !s.attack.impacted);
  await page.keyboard.press('Tab');
  assert.equal((await snapshot()).attack?.token, casting.attack.token);
  await step(4);
  const result = await snapshot();
  assert.equal(releases(result, 0).length, 1);
  assert.ok(result.events.some(e => e.kind === 'damage' && e.target === scene.targetIds[0]));
  check('Tab during mage cast preserves spell release and projectile hit');
}

try {
  if (production) await productionRun();
  else {
    await movementAndCombat();
    await pickingItemsAndCastle();
    await magicCast();
  }
  assert.deepEqual(report.errors, []); report.passed = true;
} catch (error) {
  report.failure = error.stack ?? String(error); await shot('failure').catch(() => {}); throw error;
} finally {
  await writeFile(path.join(reportDir, `${label}-combined.json`), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2)); await browser.close(); await new Promise(resolve => server.close(resolve));
}
