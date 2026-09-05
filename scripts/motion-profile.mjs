// Project-owned CI probe: compare idle, held W and direction/orbit on identical builds.
// This script does not change quality, simulate input through game internals or force GC.
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';

const directory = path.resolve(process.argv[2] ?? 'dist-qa');
const label = process.argv[3] ?? 'motion-before';
assert.match(label, /^[a-zA-Z0-9_-]+$/);
const reportDir = path.resolve('qa-artifacts/motion-profile', label);
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
    response.writeHead(200, { 'Content-Type': mime[path.extname(file)] ?? 'application/octet-stream' });
    response.end(bytes);
  } catch { response.writeHead(404).end(); }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const report = { label, environment: 'Chromium / software WebGL on CI; not reference-hardware FPS',
  viewport: '1280x720 / DPR1', cpuSamplingIntervalUs: 1000, scenarios: [], errors: [] };
let browser;
try {
  browser = await chromium.launch({ executablePath: process.env.BROWSER_EXECUTABLE, headless: true,
    args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--disable-dev-shm-usage', '--no-sandbox'] });
  report.browser = browser.version();
  // Isolated contexts keep the start point, camera, enemies and quality adaptation reproducible.
  for (const scenario of ['idle', 'forward', 'direction-orbit']) {
    const context = await browser.newContext({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });
    await context.addInitScript(() => {
      let seed = 314159;
      Math.random = () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296);
      const probe = window.__MOTION_PROFILE__ = { enabled: false, frames: [], longTasks: [], snapshots: [] };
      try {
        new PerformanceObserver(list => {
          if (probe.enabled) for (const entry of list.getEntries()) probe.longTasks.push({ start: entry.startTime, duration: entry.duration });
        }).observe({ type: 'longtask', buffered: false });
      } catch { probe.longTaskUnsupported = true; }
      let last = 0, nextSnapshot = 0;
      function sample(now) {
        if (probe.enabled && now >= probe.deadline) { probe.enabled = false; probe.complete = true; probe.elapsed = now - probe.started; }
        if (probe.enabled) {
          if (last) probe.frames.push({ time: now, ms: now - last });
          if (now >= nextSnapshot) {
            nextSnapshot = now + 1000;
            probe.snapshots.push({ time: now, state: window.__VARENDOR_QA__.getState(),
              performance: window.__VARENDOR_QA__.getPerformance(),
              heapBytes: performance.memory?.usedJSHeapSize ?? null });
          }
          last = now;
        } else { last = 0; nextSnapshot = 0; }
        requestAnimationFrame(sample);
      }
      requestAnimationFrame(sample);
    });
    const page = await context.newPage();
    page.setDefaultTimeout(30000);
    page.on('pageerror', error => report.errors.push(`${scenario}: ${error.stack ?? error.message}`));
    page.on('console', message => { if (message.type() === 'error') report.errors.push(`${scenario}: ${message.text()}`); });
    page.on('response', response => { if (response.status() >= 400) report.errors.push(`${scenario}: HTTP ${response.status()} ${response.url()}`); });
    page.on('requestfailed', request => report.errors.push(`${scenario}: ${request.url()} ${request.failure()?.errorText}`));
    await page.goto(`http://127.0.0.1:${server.address().port}`);
    await page.locator('#begin').click();
    await page.waitForFunction(() => window.__VARENDOR_QA__?.getState().started, {}, { timeout: 180000 });
    assert.ok(await page.evaluate(() => Boolean(window.__VARENDOR_FIXTURE__)), 'Requires isolated QA build, never the downloadable production bundle');
    await page.evaluate(() => window.__VARENDOR_FIXTURE__.placePlayer(30, -70));
    // Fixed render-count warm-up in all scenarios, recorded separately from the 25 s input window.
    await page.evaluate(() => new Promise(resolve => {
      let count = 0;
      function warm() { if (++count >= 30) resolve(); else requestAnimationFrame(warm); }
      requestAnimationFrame(warm);
    }));
    await page.screenshot({ path: `${reportDir}/${scenario}-start.png` });
    const profiler = await context.newCDPSession(page);
    await profiler.send('Profiler.enable');
    await profiler.send('Profiler.setSamplingInterval', { interval: 1000 });
    await profiler.send('Profiler.start');
    await page.evaluate(() => { const p = window.__MOTION_PROFILE__; p.enabled = true; p.started = performance.now(); p.deadline = p.started + 25000; });
    const started = Date.now();
    if (scenario === 'forward') await page.keyboard.down('KeyW');
    if (scenario === 'direction-orbit') {
      const sequence = [['KeyW'], ['KeyA'], ['KeyD'], ['KeyS'], ['KeyW', 'KeyD']];
      for (let segment = 0; segment < sequence.length; segment++) {
        if (Date.now() - started >= 25000) break;
        const keys = sequence[segment];
        for (const key of keys) await page.keyboard.down(key);
        if (segment === 4) {
          await page.mouse.move(640, 310);
          await page.mouse.down({ button: 'right' });
          await page.mouse.move(710, 325);
          await page.mouse.move(640, 310);
          await page.mouse.up({ button: 'right' });
        }
        const remaining = started + (segment + 1) * 5000 - Date.now();
        if (remaining > 0) await page.waitForTimeout(remaining);
        for (const key of keys) await page.keyboard.up(key);
      }
    }
    const remaining = 25000 - (Date.now() - started);
    if (remaining > 0) await page.waitForTimeout(remaining);
    if (scenario === 'forward') await page.keyboard.up('KeyW');
    await page.waitForFunction(() => window.__MOTION_PROFILE__.complete, {}, { timeout: 15000 });
    const sample = await page.evaluate(() => { window.__MOTION_PROFILE__.enabled = false; return window.__MOTION_PROFILE__; });
    const { profile } = await profiler.send('Profiler.stop');
    await writeFile(`${reportDir}/${scenario}.cpuprofile`, JSON.stringify(profile));
    await page.screenshot({ path: `${reportDir}/${scenario}-finish.png` });
    assert.ok(sample.frames.length >= 5, `${scenario}: render loop stopped`);
    const ordered = sample.frames.map(frame => frame.ms).sort((a, b) => a - b);
    const averageMs = ordered.reduce((a, b) => a + b, 0) / ordered.length;
    const self = new Map();
    for (const id of profile.samples ?? []) self.set(id, (self.get(id) ?? 0) + 1);
    let distance = 0;
    for (let i = 1; i < sample.snapshots.length; i++) {
      const a = sample.snapshots[i - 1].state.player, b = sample.snapshots[i].state.player;
      distance += Math.hypot(a.x - b.x, a.z - b.z);
    }
    const budgets = sample.snapshots.map(s => [s.performance.renderWidth, s.performance.renderHeight,
      s.performance.adaptiveScale, s.performance.adaptiveDetails, s.performance.msaaSamples, s.performance.shadowSize].join(':'));
    const result = { scenario, wallSeconds: sample.elapsed / 1000, requestedSeconds: 25, samples: ordered.length,
      averageMs, maxMs: ordered.at(-1), p95Ms: ordered[Math.min(ordered.length - 1, Math.floor(ordered.length * 0.95))],
      fps: 1000 / averageMs, over33ms: ordered.filter(ms => ms > 33.34).length,
      over50ms: ordered.filter(ms => ms > 50).length, over100ms: ordered.filter(ms => ms > 100).length,
      sampledTravelUnits: distance, stableRenderBudget: new Set(budgets).size === 1,
      renderBudgets: [...new Set(budgets)],
      cpuTop: profile.nodes.map(node => ({ function: node.callFrame.functionName, url: node.callFrame.url,
        line: node.callFrame.lineNumber + 1, samples: self.get(node.id) ?? 0 }))
        .sort((a, b) => b.samples - a.samples).slice(0, 30),
      gcSamples: profile.nodes.filter(n => n.callFrame.functionName === '(garbage collector)')
        .reduce((sum, n) => sum + (self.get(n.id) ?? 0), 0), ...sample };
    report.scenarios.push(result);
    await writeFile(`${reportDir}/${scenario}.json`, JSON.stringify(result, null, 2));
    assert.ok(scenario === 'idle' || distance > 1, `${scenario}: movement did not actually occur; this is not a valid movement profile`);
    console.log(`${scenario}: avg ${averageMs.toFixed(2)} ms, max ${result.maxMs.toFixed(2)} ms, p95 ${result.p95Ms.toFixed(2)} ms, distance ${distance.toFixed(2)}, stable budget ${result.stableRenderBudget}`);
    await context.close();
  }
  assert.equal(report.errors.length, 0, report.errors.join('\n'));
} catch (error) {
  report.failure = error.stack ?? String(error);
  throw error;
} finally {
  await writeFile(`${reportDir}/report.json`, JSON.stringify(report, null, 2));
  await browser?.close();
  await new Promise(resolve => server.close(resolve));
}
