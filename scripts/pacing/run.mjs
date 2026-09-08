import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { randomBytes } from 'node:crypto';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { startWorldServer } from '../../server/http-server.mjs';
import { restoreWorldTopology } from '../../src/world/world-topology.ts';
import { stageNativeServer } from '../package-godot-pc.mjs';

const [binary, projectArg, outputArg, ...options] = process.argv.slice(2);
assert.ok(binary && projectArg && outputArg);
const project = resolve(projectArg), output = resolve(outputArg), root = process.cwd();
const privateRoot = mkdtempSync(join(tmpdir(), 'varendor-pacing-'));
const legacy = join(privateRoot, 'legacy/world.sqlite');
const topology = restoreWorldTopology(JSON.parse(readFileSync('public/assets/world/world-topology.json', 'utf8')));
const seed = startWorldServer({ database: legacy, ...topology, port: 0, beta: true });
await once(seed.server, 'listening');
const hero = seed.world.createCharacter('Pacing Fixture', 'ranger');
hero.level = 4;
await seed.close();
const stage = join(privateRoot, 'application');
stageNativeServer(root, stage);
const { startNativeBridge } = await import(pathToFileURL(join(stage, 'launch-native.mjs')));
const bridge = await startNativeBridge({ data: join(privateRoot, 'data'), legacy, backups: join(privateRoot, 'backups') });
const secret = randomBytes(20).toString('hex');
const control = createServer((req, res) => {
  const url = new URL(req.url, 'http://127.0.0.1');
  if (url.searchParams.get('token') !== secret) { res.writeHead(403); res.end(); return; }
  const sim = bridge.service.world, p = sim.state.characters[hero.id];
  const point = { x: Number(url.searchParams.get('x')), z: Number(url.searchParams.get('z')) };
  if (![point.x, point.z].every(Number.isFinite)) { res.writeHead(400); res.end(); return; }
  sim.relocate(p, point);
  p.buffs.haste = sim.state.time + 600000;
  sim.recalculate(p); p.hp = p.maxHp; p.mp = p.maxMp; p.dead = false;
  p.activeUntil = sim.state.time + 600000;
  const target = sim.state.monsters.filter(m => m.alive && m.regionId === 'bloodwing-ridge')
    .sort((a,b) => Math.hypot(a.x-p.x,a.z-p.z)-Math.hypot(b.x-p.x,b.z-p.z))[0]
    ?? sim.state.monsters.filter(m=>m.alive).sort((a,b)=>Math.hypot(a.x-p.x,a.z-p.z)-Math.hypot(b.x-p.x,b.z-p.z))[0];
  res.writeHead(200, {'Content-Type':'application/json'});
  res.end(JSON.stringify({snapshot:sim.snapshot(p.id),target:target.uid}));
});
await new Promise(r => control.listen(0, '127.0.0.1', r));
mkdirSync(output, { recursive: true });
const args = ['--path', project, '--audio-driver', 'Dummy', ...(options.includes('--headless') ? ['--headless'] : []), '--', '--pacing', `--bootstrap=${bridge.bootstrapPath}`, `--pacing-output=${output}`, `--pacing-control=http://127.0.0.1:${control.address().port}/reset?token=${secret}`, `--pacing-source=${process.env.GITHUB_SHA || 'local'}`];
let log = '';
try {
  const child = spawn(binary, args, {cwd:root,stdio:['ignore','pipe','pipe']});
  const consume = bytes => {
    const part = bytes.toString(); log += part;
    for (const line of part.split('\n')) if (line.startsWith('PACING_BEGIN ')) console.log(line);
    if (/SCRIPT ERROR:|^ERROR:/m.test(log)) child.kill();
  };
  child.stdout.on('data', consume); child.stderr.on('data', consume);
  const timeout = setTimeout(()=>child.kill(),600000);
  let code;
  try { [code] = await once(child, 'exit'); } finally { clearTimeout(timeout); writeFileSync(join(output,'runtime.log'),log); }
  if(code!==0) { for(const line of log.split('\n')) if(line.startsWith('PACING_RESULT ')) console.log(line); }
  assert.equal(code,0,log.slice(-8000));
  assert.doesNotMatch(log,/SCRIPT ERROR:|^ERROR:/m);
  assert.ok(existsSync(join(output,'report.json')));
  const report = JSON.parse(readFileSync(join(output,'report.json'),'utf8'));
  const compact = {...report, scenarios:report.scenarios.map(s=>({
    name:s.name,frames:s.frames,seconds:s.actual_seconds,fps:s.fps,resolution:s.resolution,viewport_pixels:s.viewport_pixels,render_scale:s.render_scale,msaa:s.msaa,
    frame_ms:s.frame_ms,render_cpu_ms:s.render_cpu_ms,gpu_ms:s.gpu_ms,engine_process_ms:s.engine_process_ms,
    moving:s.moving_frames,held:s.held_moving_frames,camera_held:s.camera_held_while_hero_moving,
    draw_calls:s.draw_calls.mean,resources:s.resource_count,physics_steps:s.physics_steps,
    phases:Object.fromEntries(Object.entries(s.phases).map(([k,v])=>[k,{mean:v.mean,p95:v.p95,max:v.max}]))
  }))};
  writeFileSync(join(output,'summary.json'),JSON.stringify(compact,null,2)+'\n');
  console.log('PACING_SUMMARY '+JSON.stringify(compact));
} finally {
  await new Promise(r=>control.close(r));
  await bridge.close();
}
