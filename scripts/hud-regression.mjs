// Block C: real browser input in the downloadable game, followed by isolated
// deterministic inventory edge cases. Mutating fixtures never ship in dist.
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';

const directory = path.resolve(process.argv[2] ?? 'dist-qa');
const production = process.argv[3] === 'production';
const label = production ? 'B-production' : 'B';
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

const shot = async name => page.screenshot({path:path.join(reportDir,`${label}-${name}.png`)});
const count = async id => (await state()).inventory.inventory.filter(i=>i.id===id).reduce((sum,i)=>sum+i.count,0);
async function layout(name) {
 const result = await page.evaluate(()=>{
  const rect = selector => {const b=document.querySelector(selector).getBoundingClientRect();return {x:b.x,y:b.y,right:b.right,bottom:b.bottom,width:b.width,height:b.height};};
  const names=['.player-frame','.actions-wrap','.menu','.quick-items','.minimap-wrap','.combat-log','#target-frame'];
  const boxes=Object.fromEntries(names.map(n=>[n,rect(n)]));
  const bag=document.querySelector('[data-inventory-window]');
  if(bag) boxes.bag=rect('[data-inventory-window]');
  return {boxes,width:innerWidth,height:innerHeight,slots:[...document.querySelectorAll('[data-quick]')].filter(e=>e.getBoundingClientRect().width>0).length};
 });
 const intersects=(a,b)=>a.x<b.right-1&&a.right>b.x+1&&a.y<b.bottom-1&&a.bottom>b.y+1;
 for(const [key,b] of Object.entries(result.boxes)) {
  if(!b.width) continue;
  assert.ok(b.x>=-1 && b.y>=-1 && b.right<=result.width+1 && b.bottom<=result.height+1, `${name} ${key} offscreen ${JSON.stringify(b)}`);
 }
 const panels=['.player-frame','.actions-wrap','.menu','.quick-items'];
 for(let i=0;i<panels.length;i++) for(let j=i+1;j<panels.length;j++) assert.ok(!intersects(result.boxes[panels[i]],result.boxes[panels[j]]),`${name} overlapping ${panels[i]} ${panels[j]}`);
 if(result.boxes.bag) for(const panel of panels) assert.ok(!intersects(result.boxes.bag,result.boxes[panel]),`${name} bag covers ${panel}`);
 assert.ok([16,32].includes(result.slots));
 check(name,result);
}
async function setScale(scale) {
 if((await state()).activeWindow) await page.keyboard.press('Escape');
 await page.keyboard.press('Escape');
 await page.locator('#ui-scale').focus();await page.keyboard.press('Home');
 for(let n=80;n<scale;n+=5) await page.keyboard.press('ArrowRight');
 await page.locator('#save-settings').click();
}
async function configure(index, action, key) {
 await page.locator('#quick-edit').click();
 await page.locator(`[data-quick="${index}"]`).click();
 await page.locator('#quick-action').selectOption(action); await page.locator('#quick-key').selectOption(key);
 await page.locator('#quick-save').click(); await page.locator('#quick-edit').click();
}
try {
 await start();
 await layout('default two rows, bottom resources and separate consumables');
 assert.equal(await page.locator('[data-quick]').count(),32);
 assert.equal(await page.locator('#chat').getAttribute('placeholder'),'Enter — локальная заметка');
 await shot('default');
 await page.keyboard.press('Tab');
 for(const [width,height] of [[1280,720],[1366,768],[1920,1080],[2560,1440]]) {
  await page.setViewportSize({width,height});
  for(const scale of [80,100,125]) {
   await setScale(scale);await page.keyboard.press('Tab');
   await layout(`${width}x${height} UI${scale}, bag clears combat buttons`);
  }
 }
 await shot('large');
 await page.keyboard.press('Tab');await setScale(100);await page.setViewportSize({width:1280,height:720});
 await page.locator('#quick-rows').click();
 await configure(24,'potion','Shift+KeyR');
 await page.keyboard.press('Tab');await layout('four rows and compact bag');await shot('four-rows');
 for (const scale of [80,125,100]) {await setScale(scale);await page.keyboard.press('Tab');await layout(`four rows UI${scale}, inventory avoids dock`);}
 await page.keyboard.press('Tab');await page.locator('#quick-rows').click();
 assert.match(await page.locator('#quick-rows').textContent(),/•/);
 await page.reload();await page.locator('#continue').click();
 await page.waitForFunction(()=>window.__VARENDOR_QA__?.getState().started,{}, {timeout:180000});
 assert.equal((await state()).settings.quickbar[24].action,'potion');
 assert.equal((await state()).settings.quickbar[24].key,'Shift+KeyR');
 assert.equal((await state()).settings.quickRows,2);
 check('additional row assignment persists and remains signalled while collapsed');
 await page.locator('[data-log="loot"]').click();
 assert.equal(await page.locator('#messages>div:visible').count(),0);
 await page.locator('[data-log="system"]').click();assert.ok(await page.locator('#messages>div:visible').count()>0);
 await page.locator('[data-log="all"]').click();
 check('journal filters act on actual messages');
 const before=await state();await page.keyboard.press('Enter');await page.keyboard.type('1234 Q E');await page.keyboard.press('Enter');
 assert.deepEqual((await state()).player.cooldowns,before.player.cooldowns);
 assert.match(await page.locator('#messages').textContent(),/Локально/);
 check('local input is labelled honestly and does not fire actions');
 if(!production) {
  await page.evaluate(()=>window.__VARENDOR_FIXTURE__.hudSetup(1));
  await page.keyboard.press('q');assert.equal(await count('potion'),0);
  assert.equal(await page.locator('#potion-count').textContent(),'0');
  assert.equal(await page.locator('[data-quick="8"] .quick-count').textContent(),'0');
  assert.equal((await state()).settings.quickbar[8].action,'potion');
  await page.keyboard.press('q');assert.equal(await count('potion'),0);
  await page.evaluate(()=>window.__VARENDOR_FIXTURE__.hudRestock());
  await page.keyboard.press('Shift+r');assert.equal(await count('potion'),0);
  check('last potion consumed once, empty assignment retained, replenished stack works from hidden configured row');
  await page.evaluate(()=>window.__VARENDOR_FIXTURE__.hudSetup(4));
  await page.locator('#potion').dblclick();assert.equal(await count('potion'),3);
  await page.locator('[data-quick="9"]').dblclick();assert.equal(await count('ether'),3);
  check('native double clicks in Q/E and quick slots consume exactly one');
  await page.evaluate(()=>window.__VARENDOR_FIXTURE__.hudSetup(2));
  await page.keyboard.press('Shift+2');assert.equal(await count('ether'),1);
  await page.keyboard.press('Control+1');assert.equal(await count('ether'),1);
  check('shift row uses physical key binding without invoking row one; browser modifier not captured');
  await page.evaluate(()=>{window.__VARENDOR_FIXTURE__.hudBuff(2);window.__VARENDOR_FIXTURE__.pause(false);});
  await page.locator('[data-effect="guard"]').waitFor({state:'visible'});await shot('effect');
  await page.locator('[data-effect="guard"]').waitFor({state:'detached'});
  check('actual active buff shows countdown and disappears at expiry');
  await page.evaluate(()=>window.__VARENDOR_FIXTURE__.hudSetup(2));
  await page.evaluate(()=>window.__VARENDOR_FIXTURE__.cooldowns([5,0,0,0]));
  await page.waitForFunction(()=>document.querySelector('[data-quick="0"] .cooldown').textContent.startsWith('5'));
  assert.match(await page.locator('[data-quick="0"]').getAttribute('title'),/Недостаточно ресурса|Перезарядка/);
  await page.evaluate(()=>window.__VARENDOR_FIXTURE__.die());
  const dead=await count('potion');await page.keyboard.press('q');const deadButton=await page.locator('[data-quick="8"]').boundingBox();await page.mouse.click(deadButton.x+deadButton.width/2,deadButton.y+deadButton.height/2);assert.equal(await count('potion'),dead);
  check('cooldown/resource reasons visible; death denies both consumable paths');
 }
 assert.deepEqual(report.errors,[]);report.passed=true;
} catch(error) {report.failure=error.stack??String(error);await shot('failure').catch(()=>{});throw error;}
finally {await writeFile(path.join(reportDir,`${label}-hud.json`),JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));await browser.close();await new Promise(resolve=>server.close(resolve));}
