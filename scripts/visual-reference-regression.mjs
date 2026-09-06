// G / B02: a bounded visual-reference pass, not a repeat of accepted gameplay blocks.
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';

const directory = path.resolve(process.argv[2] ?? 'dist-qa');
const production = process.argv[3] === 'production';
const label = production ? 'G-production' : 'G';
const reportDir = path.resolve('qa-artifacts');
await mkdir(reportDir, { recursive: true });
const mime = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json',
  '.gltf': 'model/gltf+json', '.glb': 'model/gltf-binary', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.png': 'image/png', '.webp': 'image/webp', '.svg': 'image/svg+xml', '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg' };
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
const page = await context.newPage(); page.setDefaultTimeout(45000);
const report = { block: label, sha: process.env.GITHUB_SHA ?? 'local', browser: browser.version(), passed: false,
  environment: 'Chromium software WebGL; technical rendering evidence, not a hardware FPS benchmark or art acceptance',
  profile: production ? 'One Knight new/continue production load; Low / 50%; 1280x720'
    : 'One Knight; five frozen real-world reference views at High / 100%; one native-click combat contact',
  checks: [], errors: [] };
page.on('pageerror', error => report.errors.push(error.stack ?? error.message));
page.on('console', message => { if (message.type() === 'error') report.errors.push(message.text()); });
page.on('requestfailed', request => report.errors.push(`${request.url()}: ${request.failure()?.errorText}`));
page.on('response', response => { if (response.status() >= 400 && !response.url().endsWith('/favicon.ico')) report.errors.push(`HTTP ${response.status()} ${response.url()}`); });
const check = (name, data = {}) => { report.checks.push({ name, ...data }); console.log('PASS', name); };
const state = () => page.evaluate(() => window.__VARENDOR_QA__.getState());
const actors = () => page.evaluate(() => window.__VARENDOR_FIXTURE__.actors());
const snapshot = () => page.evaluate(() => window.__VARENDOR_FIXTURE__.combatSnapshot());
const step = seconds => page.evaluate(value => window.__VARENDOR_FIXTURE__.combatStep(value), seconds);
const frames = () => page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
async function shot(name) {
  await frames();
  await page.screenshot({ path: path.join(reportDir, `${label}-${name}.png`) });
}
async function quality(profile, scale) {
  await page.keyboard.press('Escape');
  await page.locator('#quality').selectOption(profile);
  await page.locator('#resolution-scale').selectOption(scale);
  await page.locator('#save-settings').click();
}
async function start() {
  await page.goto(`http://127.0.0.1:${server.address().port}`);
  await page.locator('[data-class="knight"]').click();
  await page.locator('#name-field').fill('Проверка Гринфолла');
  await page.locator('#begin').click();
  await page.waitForFunction(() => window.__VARENDOR_QA__?.getState().started, {}, { timeout: 180000 });
  assert.equal(await page.evaluate(() => typeof window.__VARENDOR_FIXTURE__), production ? 'undefined' : 'object');
}
async function productionRun() {
  await start();
  await quality('low', '0.5');
  const first = await state();
  assert.equal(first.started, true);
  assert.equal(first.player.dead, false);
  assert.equal(first.assetsLoaded, true);
  assert.ok(first.monsters > 0);
  assert.equal(first.inventory.classId, 'knight');
  assert.ok(first.inventory.equipment.weapon?.uid);
  await shot('new-character');
  check('production starts one real Knight with game world and assets ready; QA mutation fixture absent', {
    monsters: first.monsters, position: {x: first.player.x, z: first.player.z}, weapon: first.inventory.equipment.weapon.id,
  });
  await page.reload();
  await page.locator('#continue').click();
  await page.waitForFunction(() => window.__VARENDOR_QA__?.getState().started, {}, { timeout: 180000 });
  const restored = await state();
  assert.equal(restored.assetsLoaded, true);
  assert.equal(restored.inventory.classId, first.inventory.classId);
  assert.equal(restored.inventory.equipment.weapon.uid, first.inventory.equipment.weapon.uid);
  assert.deepEqual(restored.inventory.inventory, first.inventory.inventory);
  assert.equal(restored.player.dead, false);
  check('same production character continues with its original equipment and bag');
}
async function referenceViews() {
  await start();
  await page.evaluate(() => window.__VARENDOR_FIXTURE__.pause(true));
  await quality('high', '1');
  for (const view of ['gate', 'courtyard', 'forest', 'knight', 'wolf']) {
    const scene = await page.evaluate(value => window.__VARENDOR_FIXTURE__.visualReferenceView(value), view);
    await frames();
    assert.equal(scene.view, view);
    assert.equal(scene.assetsReady, true, `${view}: reference assets unavailable`);
    assert.equal(scene.gateBlocked, false, `${view}: accepted gate route obstructed`);
    assert.ok(scene.reference && Object.keys(scene.reference).length > 0, `${view}: missing real-world diagnostics`);
    assert.ok(Array.isArray(scene.actors) && scene.actors.length > 0, `${view}: no reference actors`);
    // A High material can compile on its first rendered frame. Read live readiness
    // after that frame rather than failing on the synchronous camera-set snapshot.
    const inspectedIds = scene.actors.filter(actor => actor.kind === 'player'
      || (view === 'wolf' && actor.id === 'wolf' && actor.visible)).map(actor => actor.uid);
    await page.waitForFunction(ids => {
      const current = window.__VARENDOR_FIXTURE__.actors();
      return ids.every(id => current.find(actor => actor.uid === id)?.ready);
    }, inspectedIds);
    const current = await actors();
    scene.actors = scene.actors.map(actor => ({...actor, ready: current.find(value => value.uid === actor.uid)?.ready ?? actor.ready}));
    const hero = scene.actors.find(actor => actor.kind === 'player' || actor.id === 'player');
    assert.ok(hero, `${view}: missing real player`);
    const inspected = view === 'wolf' ? [...scene.actors.filter(actor => actor.id === 'wolf' && actor.visible), hero] : [hero];
    if (view === 'wolf') assert.ok(inspected.length > 1, 'wolf close-up has no visible real wolf');
    for (const actor of inspected) {
      assert.equal(actor.ready, true, `${view}/${actor.id}: mesh or material not ready`);
      assert.equal(actor.visible, true, `${view}/${actor.id}: hidden reference model`);
      assert.ok(actor.animations > 0, `${view}/${actor.id}: rig clips absent`);
      assert.ok(Number.isFinite(actor.height) && actor.height > .4 && actor.height < 3.8,
        `${view}/${actor.id}: invalid world bounds ${actor.height}`);
      assert.ok(Number.isFinite(actor.groundGap) && Math.abs(actor.groundGap) < .5,
        `${view}/${actor.id}: mesh floats or sinks ${actor.groundGap}`);
    }
    await writeFile(path.join(reportDir, `G-reference-${view}.json`), JSON.stringify(scene, null, 2));
    await shot(`reference-${view}`);
    const performance = await page.evaluate(() => window.__VARENDOR_QA__.getPerformance());
    check(`${view}: real reference geometry, materials and rig bounds rendered for review`, {
      actors: inspected, reference: scene.reference,
      actualRender: {width: performance.renderWidth, height: performance.renderHeight,
        quality: performance.settings.quality, requestedScale: performance.settings.resolutionScale,
        adaptiveScale: performance.adaptiveScale, adaptiveDetails: performance.adaptiveDetails},
    });
  }
  const currentActors = await actors();
  assert.ok(currentActors.some(actor => actor.alive && actor.kind === 'monster' && !actor.visible), 'distant actor visibility culling inactive');
  check('near reference actors render while distant monster visuals remain culled', {
    visible: currentActors.filter(actor => actor.visible).length,
    hiddenMonsters: currentActors.filter(actor => actor.alive && actor.kind === 'monster' && !actor.visible).length,
  });
}
async function nativeCombatContact() {
  // Return to the normal road camera before using one existing combat fixture.
  await page.evaluate(() => window.__VARENDOR_FIXTURE__.visualReferenceView('gate'));
  await quality('low', '0.5');
  const setup = await page.evaluate(() => window.__VARENDOR_FIXTURE__.combatSetup({distance: 2.6, hp: 10000, clusterView: true}));
  await page.evaluate(() => window.__VARENDOR_FIXTURE__.combatHitRoll(.5));
  await frames();
  const initial = await actors();
  const wolf = initial.find(actor => actor.uid === setup.targetIds[0]);
  assert.ok(wolf?.ready && wolf.visible && wolf.animations > 0);
  assert.ok(wolf.screenX > 60 && wolf.screenX < 1220 && wolf.screenY > 100 && wolf.screenY < 570,
    `actual wolf screen point outside exposed world: ${JSON.stringify(wolf)}`);
  await page.mouse.click(wolf.screenX, wolf.screenY);
  assert.equal((await state()).selectedTarget, wolf.uid, 'native click did not select real wolf');
  await step(1 / 60);
  const moving = await actors();
  const hero = moving.find(actor => actor.kind === 'player');
  assert.ok(hero?.motion?.clip, 'real Knight rig did not select a clip');
  const result = await page.evaluate(targetId => {
    const fixture = window.__VARENDOR_FIXTURE__;
    let current = fixture.combatSnapshot();
    for (let tick = 0; tick < 240 && !current.events.some(event => event.kind === 'damage' && event.target === targetId); tick++) {
      fixture.combatStep(1 / 60); current = fixture.combatSnapshot();
    }
    return current;
  }, wolf.uid);
  const contact = result.events.filter(event => event.kind === 'damage' && event.target === wolf.uid);
  assert.equal(contact.length, 1, 'native basic attack did not produce exactly one first contact');
  assert.equal(result.events.filter(event => event.kind === 'release' && event.skillIndex === null).length, 1);
  assert.ok(result.targets.find(target => target.uid === wolf.uid)?.hp < wolf.hp);
  const animated = (await actors()).filter(actor => actor.kind === 'player' || actor.uid === wolf.uid);
  assert.ok(animated.every(actor => actor.ready && actor.animations > 0 && actor.motion?.clip));
  await shot('native-combat-contact');
  check('one native click drives the real Knight attack and wolf hit with ready animated models', {
    target: wolf.uid, damage: contact[0].damage, models: animated.map(actor => ({id: actor.id, model: actor.model, motion: actor.motion})),
  });
}

try {
  if (production) await productionRun();
  else { await referenceViews(); await nativeCombatContact(); }
  assert.deepEqual(report.errors, []);
  report.passed = true;
} catch (error) {
  report.failure = error.stack ?? String(error);
  await shot('failure').catch(() => {});
  throw error;
} finally {
  await writeFile(path.join(reportDir, `${label}-visual.json`), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
  await browser.close();
  await new Promise(resolve => server.close(resolve));
}
