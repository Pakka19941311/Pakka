// Capture the approved browser reference through ordinary UI actions.
// node scripts/reference-browser-capture.mjs --root DIST --output OUTPUT [--source-mode uploaded|rebuilt]
// Requires playwright (CI uses the existing pinned 1.55.0) and its Chromium.
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { createHash } from 'node:crypto';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
import { chromium } from 'playwright';

const argv = process.argv.slice(2);
function option(name, fallback) {
  const index = argv.indexOf(`--${name}`);
  return (index >= 0 ? argv[index + 1] : argv.find(arg => arg.startsWith(`--${name}=`))?.slice(name.length + 3)) ?? fallback;
}
assert.ok(option('root') && option('output'), 'Usage: --root DIST --output OUTPUT [--source-mode uploaded|rebuilt]');
const root = resolve(option('root')), output = resolve(option('output'));
const sourceMode = option('source-mode', 'uploaded');
assert.ok(['uploaded', 'rebuilt'].includes(sourceMode));
const referenceCommit = '1e94a0d1ad08a4df8959527e40058f5c89b07e9a';
await mkdir(output, { recursive: true });
const html = await readFile(resolve(root, 'index.html'), 'utf8');
const assets = [...html.matchAll(/(?:src|href)="(\/assets\/[^"?#]+\.(?:js|css))"/g)].map(match => match[1]);
assert.ok(assets.some(path => path.endsWith('.js')), 'Reference must contain its production JS bundle');
const sourceFiles = Object.fromEntries(await Promise.all(['/index.html', ...assets].map(async path =>
  [path, createHash('sha256').update(await readFile(resolve(root, `.${path}`))).digest('hex')])));
const mime = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json',
  '.gltf': 'model/gltf+json', '.glb': 'model/gltf-binary', '.jpg': 'image/jpeg', '.png': 'image/png', '.svg': 'image/svg+xml',
  '.webp': 'image/webp', '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg', '.wav': 'audio/wav' };
const server = createServer(async (request, response) => {
  try {
    const pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
    if (pathname === '/favicon.ico') { response.writeHead(204).end(); return; }
    const file = resolve(root, `.${pathname === '/' ? '/index.html' : pathname}`);
    if (!file.startsWith(root + sep)) { response.writeHead(403).end(); return; }
    const bytes = await readFile(file);
    response.writeHead(200, { 'Content-Type': mime[extname(file)] ?? 'application/octet-stream', 'Cache-Control': 'no-store' });
    response.end(bytes);
  } catch { response.writeHead(404).end(); }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const report = { ok: false, source_commit: referenceCommit, source_mode: sourceMode, source_files_sha256: sourceFiles,
  source_description: sourceMode === 'uploaded' ? 'Unchanged user-uploaded production dist.' : 'Production rebuild from the pinned reference commit; not byte-identical to the uploaded ZIP.',
  environment: 'Chromium / SwiftShader software WebGL, fresh private profile; not target-PC FPS or subjective feel evidence.',
  interaction: 'Normal create-character/settings/Tab inputs. Only read-only production QA getters. No hidden state mutation, fake UI, frozen world or forced save.',
  checks: {}, observations: {}, captures: [], errors: [], console_errors: [], failed_requests: [] };
let browser, page;
const read = () => page.evaluate(() => ({ state: window.__VARENDOR_QA__?.getState(), performance: window.__VARENDOR_QA__?.getPerformance() }));
async function capture(name) {
  // Let the actual engine present after the preceding layout or input event.
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  const bytes = await page.screenshot({ path: resolve(output, name + '.png'), timeout: 60000 });
  report.captures.push({ name, sha256: createHash('sha256').update(bytes).digest('hex'), viewport: page.viewportSize() });
  const jpeg = await page.screenshot({ type: 'jpeg', quality: 82, timeout: 60000 });
  const encoded = jpeg.toString('base64'), count = Math.ceil(encoded.length / 40000);
  for (let index = 0; index < count; index++) console.log(`VARENDOR_REFERENCE_JPG_PART ${name} ${index + 1}/${count} ${encoded.slice(index * 40000, (index + 1) * 40000)}`);
}
try {
  browser = await chromium.launch({ executablePath: process.env.BROWSER_EXECUTABLE || undefined, headless: true,
    args: ['--no-sandbox', '--disable-dev-shm-usage', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  report.browser_version = browser.version();
  const context = await browser.newContext({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });
  page = await context.newPage();
  page.setDefaultTimeout(60000);
  page.on('pageerror', error => report.errors.push(error.stack || error.message));
  page.on('console', message => { if (message.type() === 'error') report.console_errors.push(message.text()); });
  page.on('requestfailed', request => report.failed_requests.push({ url: request.url(), error: request.failure()?.errorText }));
  page.on('response', response => { if (response.status() >= 400) report.errors.push(`HTTP ${response.status()} ${response.url()}`); });
  await page.goto(`http://127.0.0.1:${server.address().port}`, { waitUntil: 'domcontentloaded' });
  await page.locator('#name-field').fill('Эталон');
  await page.locator('#begin').click();
  await page.waitForFunction(() => window.__VARENDOR_QA__?.getState().started
    || document.querySelector('#load-text')?.textContent.startsWith('Не удалось'), null, { timeout: 180000 });
  report.observations.start = await read();
  assert.equal(report.observations.start.state.started, true, 'Reference starts through normal UI');
  assert.equal(report.observations.start.state.assetsLoaded, true, 'Reference assets loaded');
  report.checks.production_started = true;
  await page.keyboard.press('Escape');
  await page.locator('#quality').selectOption('low');
  await page.locator('#modal-root .close-window').click();
  report.observations.capture_profile = await read();
  assert.equal(report.observations.capture_profile.state.activeWindow, null);
  await capture('reference-hud-1280');
  await page.keyboard.press('Tab');
  await page.waitForFunction(() => window.__VARENDOR_QA__?.getState().activeWindow === 'inventory');
  report.observations.inventory = await read();
  report.observations.inventory_dom = await page.evaluate(() => ({ text: document.querySelector('#modal-root')?.textContent,
    elements: [...document.querySelectorAll('#modal-root [class]')].map(element => ({ class: element.className,
      text: element.textContent?.slice(0, 100), box: element.getBoundingClientRect().toJSON() })) }));
  await capture('reference-inventory-1280');
  await page.setViewportSize({ width: 1920, height: 1080 });
  await capture('reference-inventory-1920');
  await page.keyboard.press('Tab');
  await page.waitForFunction(() => window.__VARENDOR_QA__?.getState().activeWindow === null);
  await capture('reference-hud-1920');
  report.checks.tab_opens_and_closes_inventory = true;
  report.checks.real_hud_and_inventory_captured_at_two_sizes = report.captures.length === 4;
  report.observations.final = await read();
  assert.deepEqual(report.errors, [], 'No reference runtime or asset response errors');
  assert.deepEqual(report.failed_requests, [], 'No failed reference asset requests');
  report.ok = true;
} catch (error) {
  report.errors.push(error.stack || String(error));
  if (page) {
    try { report.observations.failure = await read(); await page.screenshot({ path: resolve(output, 'reference-failure.png'), timeout: 30000 }); } catch {}
  }
} finally {
  await browser?.close();
  await new Promise(resolve => server.close(resolve));
  await writeFile(resolve(output, 'reference-runtime.json'), JSON.stringify(report, null, 2) + '\n');
}
console.log(JSON.stringify({ ok: report.ok, source_commit: referenceCommit, source_mode: sourceMode,
  checks: report.checks, captures: report.captures, errors: report.errors, report: resolve(output, 'reference-runtime.json') }, null, 2));
if (!report.ok) process.exitCode = 1;
