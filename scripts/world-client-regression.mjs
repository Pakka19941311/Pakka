// Part 1 only: the shipped renderer, real inputs and a separate authoritative
// server process. No local game fixtures, fabricated snapshots or balance QA.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { chromium } from 'playwright';

const staticRoot=resolve(process.argv[2]??'dist');
const temporary=await mkdtemp(join(tmpdir(),'varendor-client-server-'));
const report={block:'part1-connected-client',sha:process.env.GITHUB_SHA??'local-working-tree',passed:false,
  environment:'Two Chromium clients and a dedicated Node process; software WebGL, not a hardware FPS benchmark.',checks:[],errors:[]};
let serverProcess,browser;
const check=(name,details={})=>{report.checks.push({name,...details});console.log('PASS',name);};
const state=page=>page.evaluate(()=>window.__VARENDOR_QA__.getState());
const network=page=>page.evaluate(()=>window.__VARENDOR_QA__.network());
async function startServer(){
  const entry=pathToFileURL(resolve('server/http-server.mjs')).href;
  const topology=pathToFileURL(resolve('src/world/world-topology.ts')).href;
  const map=resolve('public/assets/world/world-topology.json');
  // Only the test process chooses an ephemeral port/database; game code is unchanged.
  const code=`import {readFileSync} from 'node:fs';
    import {startWorldServer} from ${JSON.stringify(entry)};
    import {restoreWorldTopology} from ${JSON.stringify(topology)};
    const geometry=restoreWorldTopology(JSON.parse(readFileSync(${JSON.stringify(map)},'utf8')));
    const running=startWorldServer({...geometry,database:${JSON.stringify(join(temporary,'world.sqlite'))},
      port:0,beta:true,allowLocalImport:true,staticRoot:${JSON.stringify(staticRoot)}});
    running.server.once('listening',()=>console.log('READY '+running.server.address().port));
    process.once('SIGTERM',()=>void running.close().then(()=>process.exit(0)));`;
  serverProcess=spawn(process.execPath,['--experimental-strip-types','--input-type=module','-e',code],{stdio:['ignore','pipe','pipe']});
  let output='',stderr='';serverProcess.stderr.on('data',chunk=>{stderr+=chunk;});
  return new Promise((resolveReady,reject)=>{
    const timer=setTimeout(()=>reject(Error('Server start timeout: '+stderr)),10_000);
    serverProcess.stdout.on('data',chunk=>{output+=chunk;const match=output.match(/READY (\d+)/);
      if(match){clearTimeout(timer);resolveReady(`http://127.0.0.1:${match[1]}`);}});
    serverProcess.once('exit',code=>{if(!output.includes('READY')){clearTimeout(timer);reject(Error(`Server exit ${code}: ${stderr}`));}});
  });
}
async function newClient(base,name){
  const context=await browser.newContext({viewport:{width:1024,height:768},deviceScaleFactor:1});
  await context.addInitScript(()=>{
    if(!localStorage.getItem('varendor_client_settings_v1'))localStorage.setItem('varendor_client_settings_v1',JSON.stringify({quality:'low',resolutionScale:.5}));
  });
  const page=await context.newPage();page.setDefaultTimeout(60_000);
  page.on('pageerror',error=>report.errors.push(error.stack??error.message));
  page.on('response',response=>{if(response.status()>=400&&!response.url().endsWith('/favicon.ico'))report.errors.push(`HTTP ${response.status()} ${response.url()}`);});
  await page.goto(base,{waitUntil:'domcontentloaded',timeout:60_000});
  assert.equal(await page.evaluate(()=>typeof window.__VARENDOR_FIXTURE__),'undefined','Use the production build, without local simulation fixtures');
  await page.locator('#name-field').fill(name);
  await page.locator('#begin').click();
  await page.waitForFunction(()=>window.__VARENDOR_QA__?.getState().started&&window.__VARENDOR_QA__.network().connected,{}, {timeout:180_000});
  return {context,page,lifecycle:await context.newCDPSession(page)};
}
try{
  await mkdir('qa-artifacts',{recursive:true});
  const base=await startServer();
  browser=await chromium.launch({executablePath:process.env.BROWSER_EXECUTABLE,headless:true,
    args:['--use-angle=swiftshader','--enable-unsafe-swiftshader','--disable-dev-shm-usage','--no-sandbox']});
  const first=await newClient(base,'Первый клиент');
  const before=await network(first.page);
  // A real frozen page cannot run its local loop or read the stream. This is
  // stronger than merely mocking document.hidden, and saves a second GPU load.
  await first.lifecycle.send('Page.setWebLifecycleState',{state:'frozen'});
  const second=await newClient(base,'Второй клиент');
  const seen=await network(second.page);
  assert.notEqual(seen.characterId,before.characterId);
  assert.ok(seen.heroes.some(hero=>hero.id===before.characterId));
  assert.ok(seen.time>before.time+500);
  check('Second real game client joins the same advancing world while the first page is frozen');
  await second.lifecycle.send('Page.setWebLifecycleState',{state:'frozen'});
  await first.lifecycle.send('Page.setWebLifecycleState',{state:'active'});
  await first.page.waitForFunction(time=>window.__VARENDOR_QA__.network().time>=time,seen.time);
  assert.equal((await network(first.page)).characterId,before.characterId);
  check('Resuming the frozen page receives current authoritative state without creating another hero');

  const position=(await state(first.page)).player;
  await first.page.keyboard.down('KeyW');
  await first.page.waitForFunction(origin=>{const p=window.__VARENDOR_QA__.getState().player;return Math.hypot(p.x-origin.x,p.z-origin.z)>.25;},position);
  await first.page.keyboard.press('Tab');
  const opened=await state(first.page);
  assert.equal(opened.activeWindow,'inventory');
  await first.page.waitForFunction(origin=>{const p=window.__VARENDOR_QA__.getState().player;return Math.hypot(p.x-origin.x,p.z-origin.z)>.25;},opened.player);
  await first.page.keyboard.up('KeyW');
  check('Opening Tab during held movement preserves movement through the server');

  const bagBefore=(await state(first.page)).inventory;
  const items=bagBefore.inventory??bagBefore.items;
  const scroll=items.find(item=>item.id==='weapon_scroll');
  assert.equal(scroll.count,100);
  await first.page.locator(`.ci-bag-grid [data-uid="${scroll.uid}"]`).dblclick();
  await first.page.locator('.ci-equipment-grid [data-slot="weapon"]').click();
  await first.page.waitForFunction(()=>window.__VARENDOR_QA__.getState().inventory.equipment.weapon.plus===1);
  const inventory=(await state(first.page)).inventory;
  assert.equal((inventory.inventory??inventory.items).find(item=>item.id==='weapon_scroll').count,99);
  await first.page.screenshot({path:'qa-artifacts/part1-connected-inventory.png'});
  check('Actual scroll double click and equipment click perform one server-owned safe enhancement');

  await first.page.reload({waitUntil:'domcontentloaded'});
  await first.page.locator('#continue').click();
  await first.page.waitForFunction(()=>window.__VARENDOR_QA__?.getState().started&&window.__VARENDOR_QA__.network().connected,{}, {timeout:180_000});
  assert.equal((await network(first.page)).characterId,before.characterId);
  const restored=(await state(first.page)).inventory;
  assert.equal(restored.equipment.weapon.plus,1);
  assert.equal((restored.inventory??restored.items).find(item=>item.id==='weapon_scroll').count,99);
  check('Reload and Continue retain the hero, enhanced item and remaining scrolls');

  await first.context.close();await second.context.close();
  const clockBefore=await (await fetch(base+'/api/health')).json();
  await new Promise(resolveWait=>setTimeout(resolveWait,220));
  const clockAfter=await (await fetch(base+'/api/health')).json();
  assert.ok(clockAfter.time>clockBefore.time&&clockAfter.revision>clockBefore.revision);
  check('Closing both real browser clients leaves the server clock running');
  assert.deepEqual(report.errors,[]);report.passed=true;
}catch(error){report.errors.push(error.stack??String(error));throw error;}
finally{
  await browser?.close();
  if(serverProcess&&serverProcess.exitCode===null){const exit=once(serverProcess,'exit');serverProcess.kill('SIGTERM');await exit;}
  await writeFile('qa-artifacts/part1-connected-client.json',JSON.stringify(report,null,2)+'\n');
  await rm(temporary,{recursive:true,force:true});
}
