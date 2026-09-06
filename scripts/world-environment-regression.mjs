// Scoped project CI: new nature, ground shader and camera views only. No old A–G QA.
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';
const directory=path.resolve(process.argv[2]??'dist-qa');
const report={block:'part1-environment-checkpoint',sha:process.env.GITHUB_SHA??'local',passed:false,checks:[],errors:[],
  limitation:'Technical software WebGL images of nature only. Buildings, full client/server integration and hardware FPS are not accepted by this report.'};
await mkdir('qa-artifacts',{recursive:true});
const mime={'.html':'text/html','.js':'text/javascript','.css':'text/css','.gltf':'model/gltf+json','.glb':'model/gltf-binary','.jpg':'image/jpeg','.png':'image/png','.json':'application/json','.ogg':'audio/ogg','.mp3':'audio/mpeg'};
const server=createServer(async(req,res)=>{
  try{
    const pathname=decodeURIComponent(new URL(req.url,'http://localhost').pathname);
    if(pathname==='/favicon.ico'){res.writeHead(204).end();return;}
    const file=path.resolve(directory,'.'+(pathname==='/'?'/index.html':pathname));
    if(!file.startsWith(directory+path.sep)){res.writeHead(403).end();return;}
    res.writeHead(200,{'Content-Type':mime[path.extname(file)]??'application/octet-stream'}).end(await readFile(file));
  }catch{res.writeHead(404).end();}
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const browser=await chromium.launch({executablePath:process.env.BROWSER_EXECUTABLE,headless:true,
  args:['--use-angle=swiftshader','--enable-unsafe-swiftshader','--disable-dev-shm-usage','--no-sandbox']});
try{
  const page=await browser.newPage({viewport:{width:1280,height:720}});page.setDefaultTimeout(60000);
  page.on('pageerror',error=>report.errors.push(error.stack??error.message));
  page.on('console',message=>{if(message.type()==='error')report.errors.push(message.text());});
  page.on('response',response=>{if(response.status()>=400)report.errors.push(`HTTP ${response.status()} ${response.url()}`);});
  await page.goto(`http://127.0.0.1:${server.address().port}`);
  await page.locator('#name-field').fill('Мир — проверка природы');await page.locator('#begin').click();
  await page.waitForFunction(()=>window.__VARENDOR_QA__?.getState().started,{},{timeout:180000});
  await page.evaluate(()=>window.__VARENDOR_FIXTURE__.pause(true));
  await page.keyboard.press('Escape');await page.locator('#quality').selectOption('high');
  await page.locator('#resolution-scale').selectOption('1');await page.locator('#save-settings').click();
  for(const view of ['gate','forest','rocks']){
    await page.evaluate(value=>window.__VARENDOR_FIXTURE__.visualReferenceView(value),view);
    await page.waitForFunction(()=>{const w=window.__VARENDOR_QA__.worldEnvironment();return w.groundReady&&w.skyReady;});
    await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
    const state=await page.evaluate(()=>window.__VARENDOR_QA__.worldEnvironment());
    assert.equal(state.templates,30);assert.ok(state.instances>200);assert.ok(state.visible>0);
    assert.equal(state.groundMaterial,'approved-forest-ground');
    await page.screenshot({path:`qa-artifacts/part1-nature-${view}.png`});
    report.checks.push({view,...state});
    console.log('PASS nature view',view,state);
  }
  assert.deepEqual(report.errors,[]);report.passed=true;
}catch(error){report.errors.push(error.stack??String(error));throw error;}
finally{await browser.close();await new Promise(resolve=>server.close(resolve));await writeFile('qa-artifacts/part1-environment.json',JSON.stringify(report,null,2)+'\n');}
