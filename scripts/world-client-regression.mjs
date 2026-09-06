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
let serverProcess;
const browsers=[];
const check=(name,details={})=>{report.checks.push({name,...details});console.log('PASS',name);};
const state=page=>page.evaluate(()=>window.__VARENDOR_QA__.getState());
const network=page=>page.evaluate(()=>window.__VARENDOR_QA__.network());
const enhancementDiagnostic=page=>page.evaluate(()=>{const s=window.__VARENDOR_QA__.getState();return {
  enhancement:s.enhancement,network:window.__VARENDOR_QA__.network(),dead:s.player.dead,
  weapon:s.inventory.equipment.weapon,scrolls:s.inventory.inventory.filter(i=>i.id.includes('scroll')),
  panelReadonly:document.querySelector('[data-inventory-window]')?.classList.contains('ci-readonly'),
  status:document.querySelector('.ci-status')?.textContent,selection:document.querySelector('.ci-selection-name')?.textContent,
  toast:document.querySelector('#toast')?.textContent};});
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
  // Separate Chromium/GPU processes model two player devices. Freezing a tab
  // in a shared software-GPU process can stall another tab's shader startup.
  const browser=await chromium.launch({executablePath:process.env.BROWSER_EXECUTABLE,headless:true,
    args:['--use-angle=swiftshader','--enable-unsafe-swiftshader','--disable-dev-shm-usage','--no-sandbox']});
  browsers.push(browser);
  const context=await browser.newContext({viewport:{width:1024,height:768},deviceScaleFactor:1});
  await context.addInitScript(()=>{
    if(!localStorage.getItem('varendor_client_settings_v1'))localStorage.setItem('varendor_client_settings_v1',JSON.stringify({quality:'low',resolutionScale:.5}));
  });
  const page=await context.newPage();page.setDefaultTimeout(60_000);
  page.on('pageerror',error=>report.errors.push(error.stack??error.message));
  page.on('console',message=>{if(message.type()==='error'){report.errors.push(message.text());console.error('CLIENT CONSOLE',message.text());}
    else if(message.text().startsWith('CELL EVENT'))console.log(message.text());});
  page.on('response',response=>{if(response.status()>=400&&!response.url().endsWith('/favicon.ico'))report.errors.push(`HTTP ${response.status()} ${response.url()}`);});
  await page.goto(base,{waitUntil:'domcontentloaded',timeout:60_000});
  assert.equal(await page.evaluate(()=>typeof window.__VARENDOR_FIXTURE__),'undefined','Use the production build, without local simulation fixtures');
  await page.locator('#name-field').fill(name);
  await page.locator('#begin').click();
  try{
    await page.waitForFunction(()=>window.__VARENDOR_QA__?.getState().started&&window.__VARENDOR_QA__.network().connected
      ||Boolean(document.querySelector('#start-error')?.textContent),{}, {timeout:180_000});
    assert.ok((await state(page)).started&&(await network(page)).connected,'Client startup failed');
    console.log('CLIENT READY',name);
  }catch(error){
    const diagnostic=await page.evaluate(()=>({loading:document.querySelector('#load-text')?.textContent,
      startError:document.querySelector('#start-error')?.textContent,network:window.__VARENDOR_QA__?.network(),
      started:window.__VARENDOR_QA__?.getState().started}));
    console.error('CLIENT START DIAGNOSTIC',JSON.stringify(diagnostic));throw error;
  }
  return {context,page,lifecycle:await context.newCDPSession(page)};
}
try{
  await mkdir('qa-artifacts',{recursive:true});
  const base=await startServer();
  const first=await newClient(base,'Первый клиент');
  const before=await network(first.page);
  // A real frozen page cannot run its local loop or read the stream. This is
  // stronger than merely mocking document.hidden, and saves a second GPU load.
  await first.lifecycle.send('Page.setWebLifecycleState',{state:'frozen'});
  const second=await newClient(base,'Второй клиент');
  const seen=await network(second.page);
  assert.notEqual(seen.characterId,before.characterId);
  assert.ok(seen.time>before.time+500);
  check('Second real game client joins the same advancing world while the first page is frozen');
  await second.lifecycle.send('Page.setWebLifecycleState',{state:'frozen'});
  await first.lifecycle.send('Page.setWebLifecycleState',{state:'active'});
  await first.page.waitForFunction(time=>{const n=window.__VARENDOR_QA__.network();return n.connected&&n.time>=time;},seen.time);
  const returned=await network(first.page);
  assert.equal(returned.characterId,before.characterId);
  // A long frozen load may legitimately exhaust the 30-second disconnect
  // grace. Verify the shared active hero list after resuming, not during it.
  assert.ok(returned.heroes.some(hero=>hero.id===seen.characterId));
  check('Resuming the frozen page receives current authoritative state without creating another hero');

  const own=await network(first.page);const position=own.heroes.find(p=>p.id===own.characterId);
  assert.ok(position);
  await first.page.keyboard.down('KeyW');
  await first.page.waitForFunction(origin=>{const n=window.__VARENDOR_QA__.network();const p=n.heroes.find(p=>p.id===n.characterId);return p&&Math.hypot(p.x-origin.x,p.z-origin.z)>.25;},position);
  await first.page.keyboard.press('Tab');
  const opened=await state(first.page);
  assert.equal(opened.activeWindow,'inventory');
  const afterOpen=await network(first.page);const confirmed=afterOpen.heroes.find(p=>p.id===afterOpen.characterId);
  await first.page.waitForFunction(origin=>{const n=window.__VARENDOR_QA__.network();const p=n.heroes.find(p=>p.id===n.characterId);return p&&Math.hypot(p.x-origin.x,p.z-origin.z)>.25;},confirmed);
  await first.page.keyboard.up('KeyW');
  check('Opening Tab during held movement preserves movement through the server');

  const bagBefore=(await state(first.page)).inventory;
  const items=bagBefore.inventory??bagBefore.items;
  const scroll=items.find(item=>item.id==='weapon_scroll');
  assert.equal(scroll.count,100);
  await first.page.evaluate(()=>{
    for(const kind of ['click','dblclick'])document.addEventListener(kind,event=>{
      const cell=event.target?.closest?.('.ci-cell');if(!cell)return;
      const item=cell.dataset.itemId;
      queueMicrotask(()=>console.log('CELL EVENT',JSON.stringify({kind,detail:event.detail,item,
        active:window.__VARENDOR_QA__.getState().enhancement.active,network:window.__VARENDOR_QA__.network().connected})));
    },true);
  });
  try{
    console.log('ENHANCEMENT BEFORE',JSON.stringify(await enhancementDiagnostic(first.page)));
    await first.page.locator(`.ci-bag-grid [data-uid="${scroll.uid}"]`).dblclick();
    await first.page.waitForFunction(()=>window.__VARENDOR_QA__.getState().enhancement.active==='weapon_scroll',{}, {timeout:15000});
    console.log('ENHANCEMENT ARMED',JSON.stringify(await enhancementDiagnostic(first.page)));
    await first.page.locator('.ci-equipment-grid [data-slot="weapon"]').click();
    await first.page.waitForFunction(()=>window.__VARENDOR_QA__.getState().inventory.equipment.weapon?.plus===1,{}, {timeout:15000});
  }catch(error){console.error('ENHANCEMENT DIAGNOSTIC',JSON.stringify(await enhancementDiagnostic(first.page)));throw error;}
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
}catch(error){report.errors.push(error.stack??String(error));console.error('CLIENT REPORT',JSON.stringify(report));throw error;}
finally{
  await Promise.allSettled(browsers.map(browser=>browser.close()));
  if(serverProcess&&serverProcess.exitCode===null){const exit=once(serverProcess,'exit');serverProcess.kill('SIGTERM');await exit;}
  await writeFile('qa-artifacts/part1-connected-client.json',JSON.stringify(report,null,2)+'\n');
  await rm(temporary,{recursive:true,force:true});
}
