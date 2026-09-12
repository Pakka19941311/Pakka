/** Preserve reviewed real-world evidence without session bootstrap/tokens/save. */
import {readFileSync,writeFileSync,copyFileSync,mkdirSync,existsSync} from 'node:fs';
import {createHash} from 'node:crypto';
const destination='art/p2-nature-sample-v3/evidence';
if(existsSync(destination))throw Error('Keep the recorded evidence; use a new explicit revision instead of overwriting it');
mkdirSync(destination,{recursive:true});
const json=p=>JSON.parse(readFileSync(p,'utf8')),runs=[];
for(const name of ['p2-nature-world-01','p2-nature-world-02','p2-nature-world-03','p2-nature-cost-01','p2-nature-cost-02']){
 const source='work/qa/'+name,folder=destination+'/'+name;mkdirSync(folder);
 const stage=json(source+'/stage.json'),engine=json(source+'/native/result.json');
 const files=['stage.json'];
 if(name.includes('-cost-'))files.push('nature-cost-diagnostic.json');
 if(name==='p2-nature-world-03')files.push('p2-nature-world-trace.json');
 if(['p2-nature-world-02','p2-nature-world-03'].includes(name))files.push('p2-nature-forest-world.png','p2-nature-shore-world.png');
 const copies=files.map(file=>{
  copyFileSync(source+'/'+file,folder+'/'+file);const bytes=readFileSync(folder+'/'+file);
  return {file,bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex')};
 });
 const record={name,source,diagnosticOnly:name.includes('-cost-'),passed:Object.values(stage.checks).filter(Boolean).length,total:Object.keys(stage.checks).length,
  failed:Object.entries(stage.checks).filter(([,pass])=>!pass).map(([key])=>key),adapter:stage.adapter,
  engine:{utcStart:engine.utc_start,seconds:engine.elapsed_s,exit:engine.exit_code,crash:engine.crash_detected,timedOut:engine.timed_out,errorLines:engine.error_lines,
   peakWorkingSet:engine.peak_process_working_set_bytes,peakPrivateBytes:engine.peak_process_private_bytes},files:copies};
 writeFileSync(folder+'/receipt.json',JSON.stringify(record,null,2)+'\n');runs.push(record);
}
writeFileSync(destination+'/index.json',JSON.stringify({scope:'Source Godot actual world, not packaged EXE; material art gate and forest presentation/performance remain OPEN',runs},null,2)+'\n');
console.log(JSON.stringify(runs.map(r=>({name:r.name,passed:r.passed,total:r.total,failed:r.failed,exit:r.engine.exit,seconds:r.engine.seconds})),null,2));
