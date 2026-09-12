// Runs the shipped launcher bridge against a disposable copy, never the source DB.
import assert from 'node:assert/strict';
import {copyFileSync,existsSync,mkdirSync,readFileSync,writeFileSync,statSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
const [packageArg,sourceArg,outputArg]=process.argv.slice(2);
assert.ok(packageArg&&sourceArg&&outputArg,'Usage: package verified-closed-copy new-output');
const pkg=resolve(packageArg),source=resolve(sourceArg),output=resolve(outputArg);
assert.ok(!existsSync(output),'Use a fresh output');
assert.ok(!existsSync(source+'-wal')||statSync(source+'-wal').size===0,'Use a closed backup');
const hash=p=>createHash('sha256').update(readFileSync(p)).digest('hex'),sourceHash=hash(source);
const data=join(output,'private-save');mkdirSync(data,{recursive:true});
const database=join(data,'world.sqlite');assert.notEqual(source,database);copyFileSync(source,database);
const {WorldStore}=await import(pathToFileURL(join(pkg,'server/world-store.mjs')));
const {startNativeBridge}=await import(pathToFileURL(join(pkg,'launch-native.mjs')));
const load=()=>{const store=new WorldStore(database);try{return store.load();}finally{store.close();}};
const before=load(),progress=s=>Object.fromEntries(Object.entries(s.characters).map(([id,h])=>[id,Object.fromEntries(
 ['id','name','classId','gold','level','xp','inventory','equipment','storage','lootBuffer',
  'migrationReserve','accessoryMigrationVersion','legacyProgression','starterProgress',
  'progressionQuests','bookQuests','betaScrollGrant','legacyScrolls','quest','kills','bossKills']
  .filter(k=>k in h).map(k=>[k,h[k]]))]));
const originalProgress=progress(before),originalPopulation=before.monsters.map(m=>m.uid).sort();
assert.ok(new Set(originalPopulation).size===originalPopulation.length,'Source population must be unique');
const checks={},runs=[];
for(let attempt=1;attempt<=2;attempt++){
 let bridge;
 try{
  bridge=await startNativeBridge({data,legacy:join(output,'no-legacy.sqlite'),backups:join(output,'private-backups')});
  const bootstrap=JSON.parse(readFileSync(bridge.bootstrapPath,'utf8'));
  assert.equal(bootstrap.profiles.length,Object.keys(before.characters).length);
  for(const profile of bootstrap.profiles){
   const response=await fetch(bridge.url+'/api/world',{headers:{Authorization:'Bearer '+profile.token}});
   assert.equal(response.status,200);assert.equal((await response.json()).character.id,profile.id);
  }
  checks['run'+attempt+'_all_profiles_load']=true;
 }finally{if(bridge)await bridge.close();}
 const after=load();
 assert.deepEqual(progress(after),originalProgress,'Progress changed during launcher restart');
 assert.deepEqual(after.monsters.map(m=>m.uid).sort(),originalPopulation,'Population changed during restart');
 assert.ok(!existsSync(join(data,'running.json')),'Launcher lock must be released');
 checks['run'+attempt+'_progress_preserved']=true;checks['run'+attempt+'_population_preserved']=true;
 checks['run'+attempt+'_lock_released']=true;runs.push({attempt,profiles:Object.keys(after.characters).length,population:after.monsters.length});
}
assert.equal(hash(source),sourceHash,'Original verified backup changed');checks.source_copy_unchanged=true;
const report={ok:true,packaged_server:true,checks,runs,note:'No source save is opened by WorldStore. Raw copies and bootstrap tokens remain private. This checks progress/population preservation, not native graphics.'};
writeFileSync(join(output,'restart-summary.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report));
