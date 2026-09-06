// Block D: real browser input in the downloadable game, followed by isolated
// deterministic enhancement edge cases. Mutating fixtures never ship in dist.
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';

const directory = path.resolve(process.argv[2] ?? 'dist-qa');
const hardcore = process.argv[3] === 'hardcore';
const production = hardcore || process.argv[3] === 'production';
const label = hardcore ? 'D-hardcore' : production ? 'D-production' : 'D';
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
  profile: 'Real production inputs; Low / 50% render; 1280x720; UI 100%',
  checks: [], errors: [] };
page.on('pageerror', e => report.errors.push(e.stack ?? e.message));
page.on('console', m => { if (m.type() === 'error') report.errors.push(m.text()); });
page.on('requestfailed', r => report.errors.push(`${r.url()}: ${r.failure()?.errorText}`));
page.on('response', r => { if (r.status() >= 400 && !r.url().endsWith('/favicon.ico')) report.errors.push(`HTTP ${r.status()} ${r.url()}`); });
const check = (name, data = {}) => { report.checks.push({ name, ...data }); console.log('PASS', name); };
const state = () => page.evaluate(() => window.__VARENDOR_QA__.getState());
const settings = () => page.evaluate(() => window.__VARENDOR_QA__.getPerformance().settings);
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

const shot=async name=>page.screenshot({path:path.join(reportDir,`${label}-${name}.png`)});
const bag=uid=>page.locator(`.ci-bag-grid [data-uid="${uid}"]`);
const gear=uid=>page.locator(`.ci-equipment-grid [data-uid="${uid}"]`);
const inv=async()=> (await state()).inventory;
const getItem=(snapshot,uid)=>[...snapshot.inventory,...Object.values(snapshot.equipment).filter(Boolean)].find(i=>i.uid===uid);
async function openBag(){if((await state()).activeWindow!=='inventory')await page.keyboard.press('Tab');}
async function setup(options={}){const f=await page.evaluate(options=>window.__VARENDOR_FIXTURE__.enhancementSetup(options),options);await openBag();return f;}
async function activate(uid){await bag(uid).dblclick();assert.ok((await state()).enhancement.active);}
async function reload(){await page.reload();await page.locator('#continue').click();await page.waitForFunction(()=>window.__VARENDOR_QA__?.getState().started,{}, {timeout:180000});}
try {
 await start();await openBag();
 if(hardcore){
  assert.equal((await state()).enhancement.betaBuild,false);
  assert.equal((await inv()).inventory.some(i=>/scroll/.test(i.id)),false);
  assert.equal(await page.locator('[id^="inventory-exchange-"]').count(),0);
  await reload();assert.equal((await inv()).inventory.some(i=>/scroll/.test(i.id)),false);
  check('hardcore build starts without free scrolls; reload does not grant beta stock; no exchange UI');
 }else{
 assert.equal((await state()).enhancement.betaBuild,true);
 for(const id of ['weapon_scroll','weapon_scroll_improved','armor_scroll','armor_scroll_improved'])assert.equal((await inv()).inventory.find(i=>i.id===id)?.count,100);
 assert.equal(await page.locator('[id^="inventory-exchange-"]').count(),0);
 await shot('beta-stock');check('beta new hero receives exactly 100 of each scroll, no exchange UI');
 const before=await inv();const scroll=before.inventory.find(i=>i.id==='weapon_scroll');const weapon=before.equipment.weapon;
 assert.ok(scroll&&weapon);await activate(scroll.uid);assert.equal((await inv()).inventory.find(i=>i.uid===scroll.uid).count,scroll.count);
 await gear(weapon.uid).hover();assert.match(await page.locator('[data-inventory-tooltip]').textContent(),/100%/);
 const hint=await page.locator('[data-inventory-tooltip]').textContent();assert.match(hint,/Один клик — одна попытка заточки/);assert.doesNotMatch(hint,/Двойной клик — снять/);
 const time=(await state()).simulationSeconds;
 await page.waitForFunction(t=>window.__VARENDOR_QA__.getState().simulationSeconds>t+.4,time);
 await shot('selection');await gear(weapon.uid).dblclick();
 const after=await inv();assert.equal(after.equipment.weapon.uid,weapon.uid);assert.equal(after.equipment.weapon.plus,weapon.plus+1);assert.equal(getItem(after,scroll.uid).count,scroll.count-1);assert.equal((await state()).enhancement.active,null);
 check('production double click scroll then target performs exactly one safe attempt; world stays live and equipment stays equipped');
 await reload();assert.equal((await inv()).equipment.weapon.plus,weapon.plus+1);assert.equal(getItem(await inv(),scroll.uid).count,99);check('production result survives reload with spent scroll and no repeated beta grant');
 if(!production){
  for(const id of ['weapon_scroll','weapon_scroll_improved','armor_scroll','armor_scroll_improved']) {
   const f=await setup({scroll:id,plus:id.startsWith('weapon')?3:2,roll:0});const original=await inv();
   await activate(f.scroll);await bag(f.wrong).click();assert.equal(getItem(await inv(),f.scroll).count,5);assert.ok((await state()).enhancement.active);
   await page.waitForTimeout(550);await bag(f.target).hover();assert.match(await page.locator('[data-inventory-tooltip]').textContent(),/При неудаче предмет уничтожается/);
   await bag(f.target).dblclick();const next=await inv();assert.equal(getItem(next,f.target).plus,getItem(original,f.target).plus+1);assert.equal(getItem(next,f.scroll).count,4);assert.equal(next.hp,original.hp);assert.equal(next.mp,original.mp);assert.deepEqual(next.cooldowns,original.cooldowns);assert.equal((await state()).enhancement.active,null);
   check(`${id}: correct quality consumed once, incompatible target free, no equip/heal/cooldown reset`);
  }
  for(const equipped of [false,true]) {
   const f=await setup({scroll:'weapon_scroll_improved',plus:3,roll:.75,equipped});const before=await inv();await activate(f.scroll);
   await (equipped?gear(f.target):bag(f.target)).dblclick();const after=await inv();assert.equal(getItem(after,f.target),undefined);assert.equal(getItem(after,f.scroll).count,4);
   if(equipped)assert.ok(after.stats.atkMax<before.stats.atkMax);
   await shot(equipped?'equipped-destroyed':'bag-destroyed');
   await reload();assert.equal(getItem(await inv(),f.target),undefined);check(`failure destroys ${equipped?'equipped':'bag'} item completely and persists`);
  }
  const improved=await setup({scroll:'armor_scroll_improved',plus:1,roll:.999});await activate(improved.scroll);await bag(improved.target).click();assert.equal(getItem(await inv(),improved.target).plus,2);check('improved armor +2 is guaranteed even at high roll');
  const normal=await setup({scroll:'armor_scroll',plus:1,roll:.65});await activate(normal.scroll);await bag(normal.target).click();assert.equal(getItem(await inv(),normal.target),undefined);check('ordinary armor +2 is destructive at the exact boundary');
  for(const cancel of ['Escape','right','Tab']) {
   const f=await setup();await activate(f.scroll);const before=await inv();
   if(cancel==='right')await page.locator('.ci-enhance-banner').click({button:'right'});else await page.keyboard.press(cancel);
   assert.equal((await state()).enhancement.active,null);assert.deepEqual((await inv()).inventory,before.inventory);check(`${cancel} cancels without spending`);
  }
  const capped=await setup({plus:15});await activate(capped.scroll);await bag(capped.target).click();assert.equal(getItem(await inv(),capped.scroll).count,5);assert.equal(getItem(await inv(),capped.target).plus,15);check('+15 cap rejects without spending');
  const stale=await setup();await activate(stale.scroll);await page.evaluate(uid=>window.__VARENDOR_FIXTURE__.enhancementMutateTarget(uid),stale.target);await bag(stale.target).click();assert.equal(getItem(await inv(),stale.scroll).count,5);check('changed target version rejects without spending');
  const missing=await setup();await activate(missing.scroll);await page.evaluate(uid=>window.__VARENDOR_FIXTURE__.inventoryRemove(uid),missing.scroll);await bag(missing.target).click();assert.equal(getItem(await inv(),missing.target).plus,0);assert.equal((await state()).enhancement.active,null);check('removed scroll cancels selection');
  const failure=await setup();await activate(failure.scroll);const frozen=await inv();await page.evaluate(()=>window.__VARENDOR_FIXTURE__.enhancementStorageFailure());await bag(failure.target).click();assert.deepEqual((await inv()).inventory,frozen.inventory);check('storage failure leaves scroll and target untouched');
  const death=await setup();await activate(death.scroll);await page.evaluate(()=>window.__VARENDOR_FIXTURE__.die());assert.equal((await state()).enhancement.active,null);assert.equal(getItem(await inv(),death.scroll).count,5);check('death cancels pending enhancement without spending');
  await setup();const old=await page.evaluate(()=>window.__VARENDOR_FIXTURE__.enhancementLegacySave());await reload();
  assert.equal((await state()).enhancement.legacyScrolls,7);assert.equal(getItem(await inv(),old.weapon)?.uid,old.weapon);assert.equal((await inv()).inventory.some(i=>i.id==='scroll'),false);
  await openBag();assert.equal(await page.locator('[id^="inventory-exchange-"]').count(),0);
  const stock=await inv();
  for(const id of ['weapon_scroll','weapon_scroll_improved','armor_scroll','armor_scroll_improved'])assert.equal(stock.inventory.find(i=>i.id===id)?.count,id==='weapon_scroll'?105:100);
  await shot('returning-beta-stock');await reload();assert.deepEqual((await inv()).inventory,stock.inventory);assert.equal((await state()).enhancement.legacyScrolls,7);
  check('returning hero gets +100 of each once, preserves items and stock, no legacy exchange or conversion');
 }
 }
 assert.deepEqual(report.errors,[]);report.passed=true;
} catch(error){report.failure=error.stack??String(error);await shot('failure').catch(()=>{});throw error;}
finally{await writeFile(path.join(reportDir,`${label}-enhancement.json`),JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));await browser.close();await new Promise(resolve=>server.close(resolve));}
