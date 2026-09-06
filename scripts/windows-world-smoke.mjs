// One scoped package test: shipped launcher, static files, independent clock and saved world across ZIP folders.
import assert from 'node:assert/strict';
import { cpSync, mkdtempSync, readFileSync, readdirSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn, execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';

const checksum=bytes=>createHash('sha256').update(bytes).digest('hex');
const pause=milliseconds=>new Promise(done=>setTimeout(done,milliseconds));
const within=(promise,ms,label)=>new Promise((yes,no)=>{
  const timer=setTimeout(()=>no(Error(`${label} timed out`)),ms);
  promise.then(value=>{clearTimeout(timer);yes(value);},error=>{clearTimeout(timer);no(error);});
});

export async function smokeWorldPackage(root,{verifyManifest=true,portable=process.platform==='win32'}={}){
  const runtimeVersion=portable?execFileSync(resolve(root,'runtime/node.exe'),['--version'],{encoding:'utf8'}).trim():process.version;
  if(verifyManifest){
    const manifest=JSON.parse(readFileSync(resolve(root,'PACKAGE_MANIFEST.json'),'utf8'));
    assert.equal(readFileSync(resolve(root,'BUILD_COMMIT.txt'),'utf8').trim(),manifest.buildCommit);
    if(portable)assert.equal(runtimeVersion,`v${manifest.node.version}`,'The shipped Node runtime version');
    for(const file of manifest.files){
      const bytes=readFileSync(resolve(root,file.path));assert.equal(bytes.length,file.bytes,file.path);assert.equal(checksum(bytes),file.sha256,file.path);
    }
  }
  const temporary=mkdtempSync(resolve(tmpdir(),'varendor-package-'));
  const data=resolve(temporary,'local-app-data');
  const processes=[];
  const start=async(folder)=>{
    const command=portable?'powershell.exe':process.execPath;
    const args=portable
      ?['-NoProfile','-ExecutionPolicy','Bypass','-File',resolve(folder,'server.ps1'),'-NoBrowser']
      :['--experimental-strip-types',resolve(folder,'server/launch-world.mjs'),'--no-browser','--port','0'];
    const child=spawn(command,args,{cwd:tmpdir(),env:{...process.env,LOCALAPPDATA:data},stdio:['pipe','pipe','pipe']});
    processes.push(child);let output='';
    const exited=new Promise((yes,no)=>{child.once('error',no);child.once('exit',(code,signal)=>yes({code,signal}));});
    const ready=new Promise((yes,no)=>{
      child.stdout.on('data',chunk=>{output+=chunk;const match=output.match(/http:\/\/localhost:(\d+)\//);if(match)yes(`http://127.0.0.1:${match[1]}`);});
      child.stderr.on('data',chunk=>{output+=chunk;});
      child.once('exit',code=>no(Error(`Launcher exited ${code}: ${output}`)));child.once('error',no);
    });
    const base=await within(ready,20000,'Launcher readiness');
    const stop=async()=>{child.stdin.write('stop\n');const result=await within(exited,10000,'Graceful stop');assert.equal(result.code,0,output);};
    return {base,stop};
  };
  const json=async(base,path,options)=>{
    const response=await fetch(base+path,{...options,signal:AbortSignal.timeout(5000)});
    assert.equal(response.ok,true,`${path}: ${response.status}`);return response.json();
  };
  try{
    let world=await start(root);
    await assert.rejects(start(root),/already running/,'A second process must not mutate the same saved world');
    const first=await json(world.base,'/api/health');assert.equal(first.protocol,1);assert.equal(first.beta,true);assert.equal(first.localImport,true);
    const html=await fetch(world.base+'/').then(response=>response.text());
    const js=html.match(/<script[^>]+src="([^"]+\.js)"/)?.[1];assert.ok(js,'Built client module URL');
    const code=await fetch(world.base+js+'?package-smoke=1');assert.match(code.headers.get('content-type'),/javascript/);
    assert.equal(checksum(Buffer.from(await code.arrayBuffer())),checksum(readFileSync(resolve(root,'dist','.'+js))));
    const search=folder=>{for(const name of readdirSync(folder,{withFileTypes:true})){const path=resolve(folder,name.name);if(name.isDirectory()){const found=search(path);if(found)return found;}else if(name.name.endsWith('.glb'))return path;}};
    const model=search(resolve(root,'dist/assets'));assert.ok(model,'Game GLB');
    const loaded=await fetch(world.base+'/'+relative(resolve(root,'dist'),model).split(sep).join('/')).then(response=>response.arrayBuffer());
    assert.equal(checksum(Buffer.from(loaded)),checksum(readFileSync(model)),'Complete GLB response');
    await pause(250);
    assert.ok((await json(world.base,'/api/health')).time>first.time,'World clock advances with no browser or players');
    const session=await json(world.base,'/api/session',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name:'Package check',classId:'knight'})});
    await world.stop();
    const db=resolve(data,'Varendor/world-beta-v1/world.sqlite');assert.ok(existsSync(db),'Persistent world outside package');
    assert.equal(existsSync(resolve(data,'Varendor/world-beta-v1/server.lock')),false,'World lock released');
    // New release folder uses the same external database. Copy only launch/server files and built client.
    const next=resolve(temporary,'next-release');cpSync(root,next,{recursive:true});
    world=await start(next);
    const resumed=await json(world.base,'/api/world',{headers:{Authorization:`Bearer ${session.token}`}});
    assert.equal(resumed.character.id,session.snapshot.character.id,'Same saved hero after changing package folder');
    await world.stop();
    return {platform:process.platform,node:runtimeVersion,launcher:portable?'shipped portable Node through server.ps1':'local Node, staged shipped server entry',
      buildCommit:readFileSync(resolve(root,'BUILD_COMMIT.txt'),'utf8').trim(),checks:['package file integrity','launcher outside package cwd','single process per saved world','HTML and JS query MIME and bytes','complete GLB','world clock without browser','graceful stop','saved session across package folders']};
  }finally{
    for(const child of processes)if(child.exitCode===null&&!child.killed){
      try{child.stdin.write('stop\n');}catch{}
      const exited=new Promise(done=>child.once('exit',done));
      try{await within(exited,2000,'Cleanup');}
      catch{
        if(process.platform==='win32'){try{execFileSync('taskkill.exe',['/PID',String(child.pid),'/T','/F'],{stdio:'ignore'});}catch{}}
        else child.kill('SIGKILL');
        await within(exited,3000,'Cleanup after termination').catch(()=>{});
      }
    }
    rmSync(temporary,{recursive:true,force:true});
  }
}

if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  if(!process.argv[2])throw Error('Usage: node scripts/windows-world-smoke.mjs <extracted-package-directory>');
  console.log(JSON.stringify(await smokeWorldPackage(resolve(process.argv[2])),null,2));
}
