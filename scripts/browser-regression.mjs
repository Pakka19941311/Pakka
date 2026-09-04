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
async function visibleWorldScreenshot(name) {
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  const screenshot = await page.screenshot();
  await writeFile(`${reportDir}/${name}.png`, screenshot);
  const luminance = await page.evaluate(async encoded => {
    const image = new Image(); image.src = `data:image/png;base64,${encoded}`; await image.decode();
    const canvas = document.createElement('canvas'); canvas.width = 64; canvas.height = 64;
    const ctx = canvas.getContext('2d');
    // Center of the world, excluding HP/MP, side panels and bottom hotbar.
    ctx.drawImage(image, image.width * 0.35, image.height * 0.2, image.width * 0.35, image.height * 0.5, 0, 0, 64, 64);
    const pixels = ctx.getImageData(0, 0, 64, 64).data; let sum = 0;
    for (let i = 0; i < pixels.length; i += 4) sum += (pixels[i] + pixels[i + 1] + pixels[i + 2]) / 3;
    return sum / (64 * 64);
  }, screenshot.toString('base64'));
  // No retry-until-pass: even a single captured black world is a regression.
  assert.ok(luminance > 15, `${name}: rendered world is black (${luminance})`);
  check(`visible world: ${name}`, { centerLuminance: luminance });
}
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
  await visibleWorldScreenshot(`${label}-greenfall`);
  const profiler = await context.newCDPSession(page);
  await profiler.send('Profiler.enable'); await profiler.send('Profiler.start');
  await page.evaluate(() => { window.__FRAME_PROBE__.enabled = true; });
  await page.waitForFunction(() => window.__FRAME_PROBE__.frames.length >= 12, {}, { timeout: 90000 });
  const sample = await page.evaluate(() => { window.__FRAME_PROBE__.enabled = false; return window.__FRAME_PROBE__; });
  const { profile } = await profiler.send('Profiler.stop');
  await writeFile(`${reportDir}/${label}.cpuprofile`, JSON.stringify(profile));
  const self = new Map();
  for (const id of profile.samples ?? []) self.set(id, (self.get(id) ?? 0) + 1);
  report.cpuTop = profile.nodes.map(node => ({ function: node.callFrame.functionName, url: node.callFrame.url,
    samples: self.get(node.id) ?? 0 })).sort((a, b) => b.samples - a.samples).slice(0, 20);
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
    const world = await page.evaluate(() => window.__VARENDOR_FIXTURE__.world());
    assert.ok(world.fortParts >= 20, 'fortress blockers must have imported visible walls');
    for (const route of world.paths) assert.ok(route.path.length > 0, `blocked settlement route ${JSON.stringify(route)}`);
    check('real fortress modules and routes to gate, NPCs and hunting area', world);

    // Reproduce the reported panel overlap, including the recorded 3266px viewport.
    for (const width of [1280, 1920, 3266]) {
      await page.setViewportSize({ width, height: width === 3266 ? 1878 : 900 });
      for (const scale of [0.8, 1, 1.25]) {
        await page.evaluate(scale => window.__VARENDOR_FIXTURE__.uiScale(scale), scale);
        const boxes = await page.evaluate(() => ['#hotbar', '.menu', '.quick-items'].map(selector => {
          const node = document.querySelector(selector), r = node.getBoundingClientRect();
          return { selector, left: r.left, right: r.right, top: r.top, bottom: r.bottom, width: r.width, height: r.height };
        }));
        for (const box of boxes) assert.ok(box.width > 0 && box.left >= 0 && box.right <= width + 1, `clipped dock ${width}/${scale} ${JSON.stringify(box)}`);
        for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) {
          const a = boxes[i], b = boxes[j];
          assert.ok(a.right <= b.left || b.right <= a.left || a.bottom <= b.top || b.bottom <= a.top, `overlapping panels ${width}/${scale}`);
        }
      }
    }
    await page.setViewportSize({ width: 1280, height: 720 });
    await page.evaluate(() => window.__VARENDOR_FIXTURE__.uiScale(1));
    check('skills, menu and consumables never overlap at 1280/1920/3266 and 80/100/125% UI');

    // Actual locomotion through the city, not a 30 cm displacement test.
    for (const [x, z] of [[-7, -28], [-7, -11], [-12, -3], [-7, -11]]) {
      await page.evaluate(([x, z]) => window.__VARENDOR_FIXTURE__.moveTo(x, z), [x, z]);
      await page.waitForFunction(([x, z]) => {
        const p = window.__VARENDOR_QA__.getState().player;
        return Math.hypot(p.x - x, p.z - z) < 0.25;
      }, [x, z], { timeout: 45000 });
    }
    await visibleWorldScreenshot('b01-gate-and-streets');
    check('walk out of gate, return and navigate around the central obstacles');

    const heroId = (await actors()).find(e => e.kind === 'player').uid;
    const groundSamples = [];
    for (const [x, z] of [[-7, -11], [26, 7], [38, 12], [48, -18]]) {
      await page.evaluate(([x, z]) => window.__VARENDOR_FIXTURE__.placePlayer(x, z), [x, z]);
      await page.waitForTimeout(400);
      const bounds = await page.evaluate(id => window.__VARENDOR_FIXTURE__.bounds(id), heroId);
      assert.ok(bounds.minY >= bounds.supportY - 0.2, `hero buried ${JSON.stringify({x,z,...bounds})}`);
      assert.ok(bounds.minY <= bounds.supportY + 0.3, `hero floats ${JSON.stringify({x,z,...bounds})}`);
      groundSamples.push({ x, z, ...bounds });
    }
    await visibleWorldScreenshot('b01-hills-grounding');
    await page.evaluate(() => window.__VARENDOR_FIXTURE__.placePlayer(-7, -11));
    check('rendered skinned feet follow hills, not world height zero', { groundSamples });

    const potionCount = Number(await page.locator('#potion-count').textContent());
    for (let index = 0; index < potionCount; index++) {
      await page.evaluate(() => window.__VARENDOR_FIXTURE__.vitals(10, 5));
      await page.keyboard.press('q');
      await page.waitForFunction(expected => Number(document.querySelector('#potion-count').textContent) === expected, potionCount - index - 1);
    }
    assert.equal(await page.locator('#potion').isDisabled(), true);
    const etherCount = Number(await page.locator('#ether-count').textContent());
    await page.evaluate(() => window.__VARENDOR_FIXTURE__.vitals(10, 5));
    await page.locator('#ether').click();
    await page.waitForFunction(expected => Number(document.querySelector('#ether-count').textContent) === expected, etherCount - 1);
    await page.evaluate(() => window.__VARENDOR_FIXTURE__.vitals(600, 80));
    check('consumables work by key/click, decrement stacks and disable at zero');
    const heroBefore = (await actors()).find(e => e.kind === 'player');
    await page.keyboard.down('d');
    try {
      await page.waitForFunction(({ x, z }) => {
        const player = window.__VARENDOR_QA__.getState().player;
        return Math.hypot(player.x - x, player.z - z) > 0.3;
      }, heroBefore, { timeout: 15000 });
    } finally { await page.keyboard.up('d'); }
    await page.waitForTimeout(200);
    const heroAfter = (await actors()).find(e => e.kind === 'player');
    assert.ok(Math.hypot(heroAfter.x - heroBefore.x, heroAfter.z - heroBefore.z) > 0.25, 'WASD did not move');
    check('WASD produces movement', { distance: Math.hypot(heroAfter.x - heroBefore.x, heroAfter.z - heroBefore.z) });
    const diagonalStart = (await state()).player;
    await page.keyboard.down('w'); await page.keyboard.down('d');
    try {
      await page.waitForFunction(({ x, z }) => {
        const player = window.__VARENDOR_QA__.getState().player;
        return Math.hypot(player.x - x, player.z - z) > 0.3;
      }, diagonalStart, { timeout: 15000 });
    } finally { await page.keyboard.up('w'); await page.keyboard.up('d'); }
    check('diagonal keys produce movement');
    const cameraBefore = (await state()).camera;
    await page.mouse.move(650, 330); await page.mouse.down({ button: 'right' });
    await page.mouse.move(710, 345, { steps: 8 }); await page.mouse.up({ button: 'right' });
    await page.mouse.wheel(0, 200); await page.waitForTimeout(1000);
    const cameraAfter = (await state()).camera;
    assert.notEqual(cameraAfter.yaw, cameraBefore.yaw); assert.notEqual(cameraAfter.distance, cameraBefore.distance);
    check('RMB orbit and wheel zoom');
    // Observe before key-down: wall-clock sleeps can miss the entire jump on a slow software GPU.
    await page.evaluate(() => {
      const baseY = window.__VARENDOR_FIXTURE__.actors().find(e => e.kind === 'player').rootY;
      window.__JUMP_PROBE__ = { baseY, peakY: baseY, landed: false };
      const deadline = performance.now() + 20000;
      const observe = () => {
        const y = window.__VARENDOR_FIXTURE__.actors().find(e => e.kind === 'player').rootY;
        const probe = window.__JUMP_PROBE__; probe.peakY = Math.max(probe.peakY, y);
        probe.landed = probe.peakY > baseY + 0.1 && Math.abs(y - baseY) < 0.05;
        if (!probe.landed && performance.now() < deadline) requestAnimationFrame(observe);
      };
      requestAnimationFrame(observe);
    });
    await page.keyboard.press('Space');
    await page.waitForFunction(() => window.__JUMP_PROBE__.landed, {}, { timeout: 20000 });
    check('Space jump and landing', await page.evaluate(() => window.__JUMP_PROBE__));
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
        assert.equal(revived.meshes, probe.meshes); assert.ok(revived.animations > 0);
        assert.deepEqual(revived.baseScale, probe.baseScale);
        assert.ok(Math.abs(revived.rootY - revived.baseY - revived.supportY) < 0.00001, 'respawn must restore ground support');
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
    await visibleWorldScreenshot('b01-combat');
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
    check('save and continue preserve progress', { saved, restored });
    await visibleWorldScreenshot('b01-after-continue');
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
