// Block A only. Deterministic mutations are available exclusively in the CI QA build.
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';
const directory=path.resolve(process.argv[2] ?? 'dist-qa'), production=process.argv[3] === 'production';
const label=production ? 'A-production' : 'A';
const reportDir=path.resolve('qa-artifacts');
await mkdir(reportDir,{recursive:true});
const mime={'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.glb':'model/gltf-binary','.jpg':'image/jpeg','.png':'image/png','.svg':'image/svg+xml','.mp3':'audio/mpeg','.ogg':'audio/ogg'};
const server=createServer(async(req,res)=>{try{
 const pathname=decodeURIComponent(new URL(req.url,'http://localhost').pathname);
 if(pathname==='/favicon.ico'){res.writeHead(204).end();return;}
 const file=path.resolve(directory,`.${pathname==='/'?'/index.html':pathname}`);
 if(!file.startsWith(directory+path.sep)){res.writeHead(403).end();return;}
 const bytes=await readFile(file);
 res.writeHead(200,{'Content-Type':mime[path.extname(file)]??'application/octet-stream'}).end(bytes);
}catch{res.writeHead(404).end();}});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const browser=await chromium.launch({executablePath:process.env.BROWSER_EXECUTABLE,headless:true,args:['--use-angle=swiftshader','--enable-unsafe-swiftshader','--disable-dev-shm-usage','--no-sandbox']});
const context=await browser.newContext({viewport:{width:1280,height:720}});
const page=await context.newPage();page.setDefaultTimeout(60000);
const report={block:label,sha:process.env.GITHUB_SHA ?? 'local',browser:browser.version(),profile:'Initial High; interactions Low / 50% render / 1280x720',passed:false,environment:'Chromium software WebGL; not a hardware FPS benchmark',checks:[],errors:[]};
page.on('pageerror',e=>report.errors.push(e.message));
page.on('console',message=>{if(message.type()==='error')report.errors.push(message.text());});
page.on('requestfailed',request=>report.errors.push(`${request.url()}: ${request.failure()?.errorText}`));
page.on('response',r=>{if(r.status()>=400&&!r.url().endsWith('/favicon.ico'))report.errors.push(`HTTP ${r.status()} ${r.url()}`);});
const state=()=>page.evaluate(()=>window.__VARENDOR_QA__.getState());
const check=(name,data={})=>{report.checks.push({name,...data});console.log('PASS',name);};
async function timeAdvances(name){
 const before=await state();
 await page.waitForFunction(t=>window.__VARENDOR_QA__.getState().simulationSeconds>t+0.5,before.simulationSeconds);
 check(name,{before:before.simulationSeconds,after:(await state()).simulationSeconds});
}
try{
 await page.goto(`http://127.0.0.1:${server.address().port}`);
 await page.locator('#begin').click();
 await page.waitForFunction(()=>window.__VARENDOR_QA__?.getState().started,{}, {timeout:180000});
 await page.screenshot({path:path.join(reportDir,`${label}-greenfall.png`)});
 check('real scene starts with production assets');
 assert.equal(await page.evaluate(()=>typeof window.__VARENDOR_FIXTURE__),production ? 'undefined' : 'object');
 await page.keyboard.press('Escape');
 await page.locator('#quality').selectOption('low');
 await page.locator('#resolution-scale').selectOption('0.5');
 await page.locator('#save-settings').click();
 assert.equal((await state()).activeWindow,null);
 await page.locator('#chat').focus();
 await page.keyboard.type('wasd1234');
 assert.deepEqual((await state()).player.cooldowns,[0,0,0,0]);
 await page.keyboard.press('Escape');
 await page.keyboard.press('4');
 const buff=await state();assert.ok(buff.player.cooldowns[3]>0);

 for(const key of ['Tab','c','k','m','Escape']){
  await page.keyboard.press(key); assert.ok((await state()).activeWindow);
  await timeAdvances(`world advances with ${key} window`);
  await page.keyboard.press('Escape');assert.equal((await state()).activeWindow,null);
 }
 assert.ok((await state()).player.cooldowns[3]<buff.player.cooldowns[3]);
 check('cooldown decreases across game windows');
 await page.keyboard.down('Tab');await page.keyboard.down('Tab');
 assert.equal((await state()).activeWindow,'inventory');await page.keyboard.up('Tab');
 await page.keyboard.press('Tab');assert.equal((await state()).activeWindow,null);
 check('Tab repeat does not toggle twice');
 await page.keyboard.down('w');await timeAdvances('movement starts');
 await page.locator('#chat').focus();await page.keyboard.up('w');
 const focus=await state();await page.keyboard.type('wasd123');await timeAdvances('chat leaves world running');
 const typed=await state();assert.ok(Math.hypot(typed.player.x-focus.player.x,typed.player.z-focus.player.z)<0.08);
 await page.keyboard.press('Escape');check('text focus clears held movement and does not execute game keys');
 await page.keyboard.press('c');await page.locator('#reset-save').click();
 await timeAdvances('confirmation leaves world running');
 assert.ok(await page.evaluate(()=>{
  const box=document.querySelector('#modal-root .window').getBoundingClientRect();
  return Boolean(document.elementFromPoint(box.left+15,box.top+15)?.closest('#confirm-root'));
 }));
 check('top confirmation blocks pointer access to underlying window');
 await page.keyboard.press('Escape');assert.equal((await state()).confirmation,null);assert.equal((await state()).activeWindow,'character');
 await page.keyboard.press('Escape');check('Escape closes only top cancellable layer');
 if (!production) {
 // A real monster continues attacking through an inventory and can kill the hero.
 const monster=await page.evaluate(()=>window.__VARENDOR_FIXTURE__.actors().find(e=>e.kind==='monster'&&e.alive&&e.id==='wolf'));
 assert.ok(monster);
 const victim=await page.evaluate(uid=>window.__VARENDOR_FIXTURE__.actors().find(e=>e.kind==='monster'&&e.alive&&e.id==='wolf'&&e.uid!==uid),monster.uid);
 assert.ok(victim);
 await page.evaluate(uid=>window.__VARENDOR_FIXTURE__.kill(uid),victim.uid);
 const beforeDeath=await state();assert.ok(beforeDeath.player.xp>=20);
 await page.keyboard.press('Tab');
 await page.evaluate(({x,z})=>{window.__VARENDOR_FIXTURE__.cooldowns([0,0,0,0]);window.__VARENDOR_FIXTURE__.placePlayer(x+1,z);window.__VARENDOR_FIXTURE__.vitals(1,90);},monster);

 await page.waitForFunction(()=>window.__VARENDOR_QA__.getState().player.dead,{}, {timeout:120000});
 assert.equal((await state()).player.hp,0);await timeAdvances('monster killed hero through open bag; world keeps running after death');
 await page.keyboard.press('Tab');assert.equal((await state()).activeWindow,'inventory');
 const dead=await state();
 assert.equal(dead.player.xp,beforeDeath.player.xp-Math.floor(beforeDeath.player.xp*.05));
 const deadItems=await page.evaluate(()=>window.__VARENDOR_FIXTURE__.playerSnapshot());
 await page.keyboard.press('q');await page.keyboard.press('4');await page.keyboard.press('w');
 await page.locator('[data-equip="weapon"]').click();
 const potion=await page.evaluate(()=>window.__VARENDOR_FIXTURE__.playerSnapshot().inventory.findIndex(i=>i.id==='potion'));
 await page.locator(`[data-item="${potion}"]`).click();await page.locator('#use-item').click();

 await timeAdvances('dead character cannot act');
 const deadAfter=await state();assert.equal(deadAfter.player.hp,0);assert.equal(deadAfter.player.inventory,dead.player.inventory);
 assert.equal(deadAfter.player.x,dead.player.x);assert.equal(deadAfter.player.z,dead.player.z);
 assert.equal(deadAfter.player.mp,dead.player.mp);assert.deepEqual(deadAfter.player.cooldowns,[0,0,0,0]);
 const afterItems=await page.evaluate(()=>window.__VARENDOR_FIXTURE__.playerSnapshot());
 assert.deepEqual(afterItems.inventory,deadItems.inventory);assert.deepEqual(afterItems.equipment,deadItems.equipment);
 await page.evaluate(uid=>{
  const f=window.__VARENDOR_FIXTURE__;
  if (f.actors().find(e=>e.uid===uid)?.alive) f.kill(uid);
  f.prepareRespawn(uid);
 },victim.uid);
 assert.equal(await page.evaluate(uid=>window.__VARENDOR_FIXTURE__.actors().find(e=>e.uid===uid)?.alive,victim.uid),false);
 await page.waitForFunction(uid=>window.__VARENDOR_FIXTURE__.actors().find(e=>e.uid===uid)?.alive,victim.uid);
 assert.ok((await state()).player.dead);check('monster respawns through genuine world ticks while player is dead');
 await page.waitForFunction(()=>window.__VARENDOR_QA__.getState().activeMonsterStates.includes('patrol'));
 check('monsters resume patrol while waiting for player respawn');

 await page.screenshot({path:path.join(reportDir,'A-death-inventory.png')});
 await page.keyboard.press('Escape');assert.ok((await state()).player.dead);assert.ok((await state()).confirmation);
 const persistedDeadXp=(await state()).player.xp;
 await page.reload();await page.locator('#continue').click();
 await page.waitForFunction(()=>window.__VARENDOR_QA__?.getState().started,{}, {timeout:180000});
 assert.ok((await state()).player.dead);assert.equal((await state()).player.hp,0);assert.equal((await state()).player.xp,persistedDeadXp);
 check('reload preserves death without a second experience penalty');
 await page.locator('#confirm-yes').click();assert.equal((await state()).player.dead,false);assert.ok((await state()).player.hp>0);
 await timeAdvances('respawn returns control to live world');
 const respawn=await state();await page.keyboard.down('w');
 await page.waitForFunction(p=>Math.hypot(window.__VARENDOR_QA__.getState().player.x-p.x,window.__VARENDOR_QA__.getState().player.z-p.z)>.3,respawn.player);
 await page.keyboard.up('w');check('movement works after respawn');
 // Stale confirmation cannot run after death or after a respawn.
 await page.keyboard.press('c');await page.locator('#reset-save').click();
 await page.evaluate(()=>{window.__STALE_YES__=document.querySelector('#confirm-yes').onclick;window.__VARENDOR_FIXTURE__.die();});
 await page.evaluate(()=>window.__STALE_YES__());assert.ok((await state()).player.dead);
 await page.locator('#confirm-yes').click();await page.evaluate(()=>window.__STALE_YES__());
 assert.ok((await state()).started);assert.equal((await state()).player.dead,false);
 check('death invalidates old confirmation callbacks across respawn');
 await page.keyboard.press('Space');
 await page.waitForFunction(()=>!window.__VARENDOR_FIXTURE__.actors().find(e=>e.kind==='player').grounded);
 await page.evaluate(()=>window.__VARENDOR_FIXTURE__.die());
 const fallen=await page.evaluate(()=>window.__VARENDOR_FIXTURE__.actors().find(e=>e.kind==='player'));
 assert.ok(Math.abs(fallen.rootY-fallen.supportY-(fallen.baseY??0))<.05);check('death during jump places body on support');
 await page.locator('#confirm-yes').click();
 }
 assert.deepEqual(report.errors,[]);
 report.passed=true;
 await page.screenshot({path:path.join(reportDir,`${label}-final.png`)});
} finally {
 await writeFile(path.join(reportDir,`${label}-live-world.json`),JSON.stringify(report,null,2));
 await browser.close();server.close();
}
