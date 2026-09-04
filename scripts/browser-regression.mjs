// Project-owned CI regression suite. Fixtures exist only in dist-qa, never in the shipped build.
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';

const directory = path.resolve(process.argv[2] ?? 'dist-qa');
const label = process.argv[3] ?? 'b01';
const baseline = label === 'baseline';
const reportDir = path.resolve('qa-artifacts');
await mkdir(reportDir, { recursive: true });
const mime = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json',
  '.gltf': 'model/gltf+json', '.glb': 'model/gltf-binary', '.jpg': 'image/jpeg', '.png': 'image/png', '.svg': 'image/svg+xml', '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg' };
const server = createServer(async (request, response) => {
  try {
    const pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
    const file = path.resolve(directory, `.${pathname === '/' ? '/index.html' : pathname}`);
    if (!file.startsWith(`${directory}${path.sep}`)) { response.writeHead(403).end(); return; }
    const bytes = await readFile(file);
    response.writeHead(200, { 'Content-Type': mime[path.extname(file)] ?? 'application/octet-stream' }); response.end(bytes);
  } catch { response.writeHead(404).end(); }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const browser = await chromium.launch({ executablePath: process.env.BROWSER_EXECUTABLE, headless: true,
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--disable-dev-shm-usage', '--no-sandbox'] });
const report = { label, environment: 'GitHub Actions / Chromium / software WebGL (not a gaming GPU benchmark)',
  browser: browser.version(), viewport: '1280x720 DPR1', checks: [], errors: [], failedRequests: [] };
let page;
const check = (name, data) => { report.checks.push({ name, ...data }); console.log(`PASS ${label}: ${name}`); };
try {
  const context = await browser.newContext({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });
  await context.addInitScript(() => {
    let seed = 314159; Math.random = () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296);
    window.__FRAME_PROBE__ = { enabled: false, frames: [], draws: [] };
    let drawCount = 0;
    for (const name of ['drawArrays', 'drawElements', 'drawArraysInstanced', 'drawElementsInstanced']) {
      const original = WebGL2RenderingContext.prototype[name];
      WebGL2RenderingContext.prototype[name] = function (...args) { drawCount++; return original.apply(this, args); };
    }
    let last = 0;
    const frame = time => {
      if (window.__FRAME_PROBE__.enabled && last) {
        window.__FRAME_PROBE__.frames.push(time - last); window.__FRAME_PROBE__.draws.push(drawCount);
      }
      drawCount = 0; last = time; requestAnimationFrame(frame);
    };
    requestAnimationFrame(frame);
  });
  page = await context.newPage(); page.setDefaultTimeout(30000);
  page.on('pageerror', error => report.errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') report.errors.push(message.text()); });
  page.on('requestfailed', request => report.failedRequests.push({ url: request.url(), error: request.failure()?.errorText }));
  page.on('response', response => { if (response.status() >= 400 && !response.url().endsWith('/favicon.ico')) report.errors.push(`HTTP ${response.status()} ${response.url()}`); });
  const base = `http://127.0.0.1:${server.address().port}`;
  await page.goto(base);
  await page.locator('#begin').click();
  await page.waitForFunction(() => window.__VARENDOR_QA__?.getState().started, { }, { timeout: 180000 });
  check('production assets start the real WebGL scene', await page.evaluate(() => window.__VARENDOR_QA__.getState()));
  await page.waitForTimeout(4000);
  await page.screenshot({ path: `${reportDir}/${label}-greenfall.png` });
  await page.evaluate(() => { window.__FRAME_PROBE__.enabled = true; });
  await page.waitForFunction(() => window.__FRAME_PROBE__.frames.length >= 12, {}, { timeout: 90000 });
  const sample = await page.evaluate(() => { window.__FRAME_PROBE__.enabled = false; return window.__FRAME_PROBE__; });
  const ordered = sample.frames.sort((a, b) => a - b);
  const mean = values => values.reduce((a, b) => a + b, 0) / Math.max(1, values.length);
  report.performance = { samples: ordered.length, averageMs: mean(ordered), p95Ms: ordered[Math.floor(ordered.length * 0.95)],
    p99Ms: ordered[Math.floor(ordered.length * 0.99)], averageDrawCalls: mean(sample.draws),
    diagnostics: await page.evaluate(() => window.__VARENDOR_QA__.getPerformance?.() ?? null) };
  assert.ok(ordered.length >= 12, 'render-loop liveness failed');
  if (!baseline) {
    // The runner has no gaming GPU. Record High above, then test controls on a documented low profile.
    await page.keyboard.press('Escape');
    await page.locator('#quality').selectOption('low');
    await page.locator('#resolution-scale').selectOption('0.5');
    await page.locator('#save-settings').click();
    report.interactionProfile = 'Low / 50% scale / shadows off (software GPU)';
    await page.waitForTimeout(1200);
    const state = () => page.evaluate(() => window.__VARENDOR_QA__.getState());
    const actors = () => page.evaluate(() => window.__VARENDOR_FIXTURE__.actors());
    const heroBefore = (await actors()).find(e => e.kind === 'player');
    await page.keyboard.down('d'); await page.waitForTimeout(550); await page.keyboard.up('d');
    await page.waitForTimeout(200);
    const heroAfter = (await actors()).find(e => e.kind === 'player');
    assert.ok(Math.hypot(heroAfter.x - heroBefore.x, heroAfter.z - heroBefore.z) > 0.25, 'WASD did not move');
    check('WASD produces movement', { distance: Math.hypot(heroAfter.x - heroBefore.x, heroAfter.z - heroBefore.z) });
    await page.keyboard.down('w'); await page.keyboard.down('d'); await page.waitForTimeout(400);
    await page.keyboard.up('w'); await page.keyboard.up('d');
    check('diagonal keys accepted');
    const cameraBefore = (await state()).camera;
    await page.mouse.move(650, 330); await page.mouse.down({ button: 'right' });
    await page.mouse.move(710, 345, { steps: 8 }); await page.mouse.up({ button: 'right' });
    await page.mouse.wheel(0, 200); await page.waitForTimeout(1000);
    const cameraAfter = (await state()).camera;
    assert.notEqual(cameraAfter.yaw, cameraBefore.yaw); assert.notEqual(cameraAfter.distance, cameraBefore.distance);
    check('RMB orbit and wheel zoom');
    await page.keyboard.press('Space'); await page.waitForTimeout(180);
    const jump = (await actors()).find(e => e.kind === 'player');
    await page.waitForTimeout(1100);
    const landed = (await actors()).find(e => e.kind === 'player');
    assert.ok(jump.rootY > landed.rootY + 0.1, 'jump did not rise and land');
    check('Space jump and landing');
    await page.keyboard.press('i'); await page.locator('.close-window').waitFor();
    await page.screenshot({ path: `${reportDir}/b01-inventory.png` }); await page.locator('.close-window').click();
    await page.keyboard.press('Escape'); await page.locator('.close-window').waitFor();
    await page.screenshot({ path: `${reportDir}/b01-settings.png` }); await page.locator('.close-window').click();
    check('inventory and settings open and close');

    // Full real-asset lifecycle: the game's kill, corpse disposal and respawn paths, not substitute meshes.
    await page.evaluate(() => window.__VARENDOR_FIXTURE__.pause(true));
    const probes = [...new Map((await actors()).filter(e => e.kind === 'monster' && e.alive).map(e => [e.model, e])).values()];
    const resources = await page.evaluate(() => window.__VARENDOR_QA__.getPerformance());
    for (const probe of probes) {
      for (let cycle = 0; cycle < 5; cycle++) {
        await page.evaluate(id => window.__VARENDOR_FIXTURE__.kill(id), probe.uid);
        await page.evaluate(id => window.__VARENDOR_FIXTURE__.lifecycleStep(id, 1), probe.uid);
        await page.evaluate(id => window.__VARENDOR_FIXTURE__.lifecycleStep(id, 1), probe.uid);
        const corpse = (await actors()).find(e => e.uid === probe.uid); assert.equal(corpse.meshes, 0);
        await page.evaluate(id => window.__VARENDOR_FIXTURE__.lifecycleStep(id, 1e9), probe.uid);
        const revived = (await actors()).find(e => e.uid === probe.uid);
        assert.equal(revived.alive, true); assert.equal(revived.generation, probe.generation + cycle + 1);
        assert.equal(revived.meshes, probe.meshes); assert.ok(revived.visible && revived.animations > 0);
        assert.deepEqual(revived.baseScale, probe.baseScale);
      }
      check(`five full respawns: ${probe.model}`);
    }
    const afterResources = await page.evaluate(() => window.__VARENDOR_QA__.getPerformance());
    for (const field of ['meshes', 'skeletons', 'materials', 'textures']) assert.equal(afterResources[field], resources[field], `respawn leaked ${field}`);
    check('real respawns leave mesh/rig/material/texture counts unchanged', { before: resources, after: afterResources });
    const target = (await actors()).find(e => e.kind === 'monster' && e.alive && e.model === 'Fox') ?? probes[0];
    await page.evaluate(p => window.__VARENDOR_FIXTURE__.placePlayer(p.x, p.z - 6), target);
    await page.waitForTimeout(1000);
    const clickTarget = (await actors()).find(e => e.uid === target.uid);
    assert.ok(clickTarget.depth > 0 && clickTarget.depth < 1);
    await page.evaluate(() => window.__VARENDOR_FIXTURE__.pause(false));
    await page.mouse.click(clickTarget.screenX, clickTarget.screenY);
    await page.waitForFunction(id => window.__VARENDOR_QA__.getState().selectedTarget === id, target.uid);
    await page.waitForFunction(({ id, hp }) => window.__VARENDOR_FIXTURE__.actors().find(e => e.uid === id)?.hp < hp, { id: target.uid, hp: target.hp }, { timeout: 30000 });
    check('one LMB selects, approaches and attacks a real monster');
    await page.screenshot({ path: `${reportDir}/b01-combat.png` });
    await page.mouse.click(850, 470); await page.waitForTimeout(350);
    assert.equal((await actors()).find(e => e.uid === target.uid).engaged, false);
    check('ground click cancels pursuit');
    await page.evaluate(() => window.__VARENDOR_FIXTURE__.die());
    await page.locator('#confirm-yes').click(); await page.waitForTimeout(800);
    assert.ok((await state()).player.hp > 0); check('player death and respawn');
    const npc = (await actors()).find(e => e.kind === 'npc');
    await page.evaluate(p => window.__VARENDOR_FIXTURE__.placePlayer(p.x, p.z - 2.2), npc);
    await page.waitForTimeout(1000);
    const npcPoint = (await actors()).find(e => e.uid === npc.uid);
    await page.mouse.click(npcPoint.screenX, npcPoint.screenY);
    await page.locator('.close-window').waitFor(); await page.locator('.close-window').click();
    check('NPC click opens interaction');
    await page.waitForTimeout(9000);
    const saved = (await state()).player;
    await page.reload(); await page.locator('#continue').click();
    await page.waitForFunction(() => window.__VARENDOR_QA__?.getState().started, {}, { timeout: 180000 });
    const restored = (await state()).player;
    assert.equal(restored.level, saved.level); assert.equal(restored.inventory, saved.inventory);
    check('save and continue preserve progress');
    await page.screenshot({ path: `${reportDir}/b01-after-continue.png` });
  }
  assert.deepEqual(report.errors.filter(error => !error.includes('favicon.ico') && !error.includes('404 (Not Found)')), []);
  assert.deepEqual(report.failedRequests, []);
  report.passed = true;
} catch (error) {
  report.passed = false; report.failure = error.stack;
  if (page) await page.screenshot({ path: `${reportDir}/${label}-failure.png` }).catch(() => {});
  throw error;
} finally {
  await writeFile(`${reportDir}/${label}-report.json`, JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
  await browser.close(); await new Promise(resolve => server.close(resolve));
}
