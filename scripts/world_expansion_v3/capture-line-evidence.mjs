import {readFileSync,writeFileSync,mkdirSync,existsSync} from 'node:fs';
import {resolve,basename} from 'node:path';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';

// Explicit allowlist: no bootstrap credentials, SQLite or private profile data.
const destination=resolve(process.argv[2]??'docs/world-expansion-v3/aimed-line-evidence');
assert.ok(!existsSync(destination),'Use a fresh evidence directory');
mkdirSync(destination,{recursive:true});
const index={schema:1,status:'candidate-native-ui-pass-live-dodge-fail',codeHashes:{},files:[],runs:[]};
const digest=value=>createHash('sha256').update(value).digest('hex');
for(const source of ['godot-pc/scripts/line_effects.gd','godot-pc/scripts/book_ground_effects.gd',
 'godot-pc/scripts/line_effects_acceptance.gd','godot-pc/scripts/p2_line_acceptance.gd','godot-pc/scripts/world.gd',
 'godot-pc/scripts/stage_acceptance.gd','scripts/world_final/stage_qa.mjs',
 'scripts/world_expansion_v3/p2-native-line-fixture.mjs','scripts/world_expansion_v3/p2-native-line-fixture.test.mjs']){
 index.codeHashes[source]=digest(readFileSync(source));
}
function preserve(source,name){
 const bytes=readFileSync(source),target=resolve(destination,name);
 assert.ok(target.startsWith(destination+'/')||target.startsWith(destination+'\\'));
 writeFileSync(target,bytes,{flag:'wx'});index.files.push({source,path:name,bytes:bytes.length,sha256:digest(bytes)});
}
for(const run of ['01','02','03']){
 const base='work/qa/p2-line-live-'+run;
 const stage=JSON.parse(readFileSync(base+'/stage.json','utf8'));
 index.runs.push({id:'live-'+run,passed:Object.values(stage.checks).filter(Boolean).length,total:Object.keys(stage.checks).length,failed:Object.keys(stage.checks).filter(k=>!stage.checks[k])});
 preserve(base+'/stage.json','live-'+run+'-checks.json');
 preserve(base+'/p2-line-live.json','live-'+run+'-trace.json');
 preserve(base+'/native/result.json','live-'+run+'-receipt.json');
}
for(const run of ['01','02','03']){
 const base='work/qa/p2-line-isolated-'+run;
 const line=readFileSync(base+'/engine.log','utf8').split(/\r?\n/).find(line=>line.startsWith('LINE_EFFECTS_ACCEPTANCE '));
 assert.ok(line);const report=JSON.parse(line.slice('LINE_EFFECTS_ACCEPTANCE '.length));
 writeFileSync(resolve(destination,'isolated-'+run+'.json'),JSON.stringify(report,null,2)+'\n',{flag:'wx'});
 preserve(base+'/result.json','isolated-'+run+'-receipt.json');
}
for(const [run,image] of [['01','p2-line-fire-windup.png'],['01','p2-line-ice-dodge-windup.png'],['02','p2-line-fire-windup.png'],['02','p2-line-ice-dodge-windup.png'],['03','p2-line-ice-dodge-warm.png'],['03','p2-line-ice-dodge-after.png']]){
 preserve('work/qa/p2-line-live-'+run+'/'+image,'live-'+run+'-'+basename(image));
}
writeFileSync(resolve(destination,'index.json'),JSON.stringify(index,null,2)+'\n',{flag:'wx'});
console.log(JSON.stringify({destination,runs:index.runs,bytes:index.files.reduce((sum,f)=>sum+f.bytes,0)},null,2));
