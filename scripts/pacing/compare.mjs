import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {join,resolve} from 'node:path';
const directory=resolve(process.argv[2]);
const read=p=>JSON.parse(readFileSync(join(directory,p),'utf8'));
const before=read('before-headless/report.json'),after=read('after-headless/report.json');
assert.equal(before.cpu,after.cpu);assert.equal(before.godot,after.godot);
const comparison={baseline:'629cdef571c81473725acc88afe59385e2fcd518',probeSource:after.source,cpu:after.cpu,godot:after.godot,environment:'same CI runner; real client and local server, rendering disabled to isolate main-thread pacing',windowsGpuMeasured:false,scenarios:[],checks:{}};
for(const old of before.scenarios){
  const next=after.scenarios.find(s=>s.name===old.name);assert.ok(next);
  comparison.scenarios.push({name:old.name,before:{fps:old.fps,frame_ms:old.frame_ms,network:old.phases.network,quickbar:old.phases.quickbar,moving:old.moving_frames,holds:old.held_moving_frames},after:{fps:next.fps,frame_ms:next.frame_ms,network:next.phases.network,quickbar:next.phases.quickbar,moving:next.moving_frames,holds:next.held_moving_frames}});
}
for(const name of ['run_60hz','run_120hz']){
  const c=comparison.scenarios.find(s=>s.name===name);
  comparison.checks[name+'_frame_p95_improved']=c.after.frame_ms.p95<c.before.frame_ms.p95*.95;
  comparison.checks[name+'_network_p95_improved']=c.after.network.p95<c.before.network.p95*.8;
  comparison.checks[name+'_quickbar_p95_improved']=c.after.quickbar.p95<c.before.quickbar.p95*.75;
  comparison.checks[name+'_no_held_motion']=c.after.moving>(name==='run_60hz'?1200:1000) && c.after.holds/c.after.moving<.01;
}
comparison.ok=Object.values(comparison.checks).every(Boolean);
writeFileSync(join(directory,'comparison.json'),JSON.stringify(comparison,null,2)+'\n');
console.log(JSON.stringify(comparison,null,2));
assert.equal(comparison.ok,true,'The measured change must improve tail frame times and its identified CPU phases');
