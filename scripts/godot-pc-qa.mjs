// One end-to-end check for the native port and its isolated save adapter.
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { DatabaseSync } from 'node:sqlite';
import { startWorldServer } from '../server/http-server.mjs';
import { restoreWorldTopology } from '../src/world/world-topology.ts';
import { inspectWorld } from './p0-backup-world.mjs';
import { stageNativeServer } from './package-godot-pc.mjs';

const root = process.cwd();
const [binaryArg, outputArg, ...options] = process.argv.slice(2);
assert.ok(binaryArg && outputArg, 'Usage: godot-pc-qa.mjs BINARY OUTPUT [--graphical] [--package=DIR] [--qa-scope=full|stop-npc|stop-only]');
const qaScope = options.find(arg => arg.startsWith('--qa-scope='))?.slice('--qa-scope='.length) || 'full';
assert.ok(['full', 'stop-npc', 'stop-only', 'world', 'polish', 'pacing'].includes(qaScope), `Unknown native QA scope: ${qaScope}`);
const binary = resolve(binaryArg), output = resolve(outputArg);
mkdirSync(output, { recursive: true });
const privateRoot = mkdtempSync(join(tmpdir(), 'varendor-native-qa-'));
const stage = options.find(arg => arg.startsWith('--package='))?.slice(10) || join(privateRoot, 'application');
if (!existsSync(join(stage, 'launch-native.mjs'))) stageNativeServer(root, stage);
const { startNativeBridge, prepareNativeData } = await import(pathToFileURL(join(resolve(stage), 'launch-native.mjs')));
const sha = file => createHash('sha256').update(readFileSync(file)).digest('hex');
const inspect = file => { const db = new DatabaseSync(file, { readOnly: true }); try { return inspectWorld(db); } finally { db.close(); } };
const topology = restoreWorldTopology(JSON.parse(readFileSync('public/assets/world/world-topology.json', 'utf8')));
const legacy = join(privateRoot, 'legacy/world.sqlite');
const seed = startWorldServer({ database: legacy, ...topology, port: 0, beta: true });
await once(seed.server, 'listening');
for (const [index, id] of ['knight', 'mage', 'ranger', 'assassin', 'necro'].entries()) seed.world.createCharacter('PC Fixture ' + index, id);
await seed.close();
const originalHash = sha(legacy), original = inspect(legacy);
const data = join(privateRoot, 'native'), backups = join(privateRoot, 'backups');
const prepared = await prepareNativeData({ data, legacy, backups });
assert.deepEqual(inspect(prepared.database), original, 'Every legacy SQLite table, state field and UID must survive the clone');
const checks = ['verified clone: all five tables, full state and UIDs'];
let bridge = await startNativeBridge({ data, legacy, backups });
try {
  await assert.rejects(startNativeBridge({ data, legacy, backups }), /уже запущена/);
  checks.push('one process per native saved world');
  const reportPath = join(output, 'native-runtime.json');
  const args = ['--audio-driver', 'Dummy', ...(options.includes('--graphical') ? [] : ['--headless']), '--', `--bootstrap=${bridge.bootstrapPath}`, `--qa=${reportPath}`, `--qa-scope=${qaScope}`];
  const child = spawn(binary, args, { cwd: stage, stdio: ['ignore', 'pipe', 'pipe'] });
  let log = '';
  const outputChunk=bytes=>{log+=bytes;if(/SCRIPT ERROR:|^ERROR:/m.test(log))child.kill();};
  child.stdout.on('data', outputChunk);
  child.stderr.on('data', outputChunk);
  const timeout = setTimeout(() => child.kill(), ['world','polish'].includes(qaScope)?420000:300000);
  let code;
  try { [code] = await once(child, 'exit'); }
  finally { clearTimeout(timeout); writeFileSync(join(output, 'native-runtime.log'), log); }
  // Print the small diagnosis before image chunks/long traces so failed CI
  // remains reviewable even when GitHub truncates a large assertion message.
  if (existsSync(reportPath)) {
    const observed = JSON.parse(readFileSync(reportPath, 'utf8'));
    console.log('VARENDOR_STOP_SUMMARY ' + JSON.stringify({ ok: observed.ok, scope: observed.scope,
      failed: Object.entries(observed.checks).filter(([key, value]) => value === false && key !== 'native_render').map(([key]) => key),
      stops: observed.checks.live_stop_observations?.map(({ samples, ...summary }) => summary) }));
  }
  for (const line of log.split('\n')) if (line.startsWith('VARENDOR_WORLD_IMAGE ') || line.startsWith('VARENDOR_REVIEW_JPG ') || line.startsWith('VARENDOR_CORE_JPG ') || line.startsWith('VARENDOR_REFERENCE_UI_JPG')) console.log(line);
  assert.equal(code, 0, log.split('\n').filter(line => !line.startsWith('VARENDOR_WORLD_IMAGE ') && !line.startsWith('VARENDOR_REVIEW_JPG ') && !line.startsWith('VARENDOR_CORE_JPG ')).join('\n').slice(-16000));
  assert.doesNotMatch(log, /SCRIPT ERROR:|^ERROR:/m, 'Native client runtime errors');
  const native = JSON.parse(readFileSync(reportPath, 'utf8'));
  assert.equal(native.ok, true);
  if (qaScope !== 'full') assert.equal(native.scope, qaScope==='pacing'?'p0-frame-pacing':qaScope==='polish'?'pc-polish-19':qaScope==='world'?'territory-world-map':qaScope === 'stop-only' ? 'forward-stop-follow-up' : 'stop-npc-stats-follow-up', 'The native client must execute the requested regression scope');
  for (const [key, value] of Object.entries({ classes: 5, item_definitions: 34, quick_slots: 32, bag_slots: 42, equipment_slots: 12 })) assert.equal(native.checks[key], value, key);
  if (options.includes('--graphical')) {
    assert.equal(native.checks.native_render, true);
    assert.ok(existsSync(reportPath.replace(/\.json$/, '.png')));
  }
  checks.push(native.scope==='p0-frame-pacing'?'native snapshot framing and event order, stable icon resources, live WASD/RMB/destination stopping, Tab, targeting, HUD and rain':native.scope==='pc-polish-19'?'exported native client: 19-point follow-up input, map movement, uniform cells, storage transfer, chat, settings, sky/rain/moon, fox gait and corpse fade':native.scope==='territory-world-map'?'exported native client: authored territory, moved service anchors, gates, forest encounter, danger shortcut, M atlas and runtime views':native.scope === 'forward-stop-follow-up'
    ? 'exported native client: zero neutral coast, first-frame stopping, frame-independent sequential input delivery, delayed reconciliation and real rig pose checks'
    : native.scope === 'stop-npc-stats-follow-up'
    ? 'exported native client: stopping and delayed reconciliation, city service interactions, compact stats, persisted quickbar'
    : 'exported native client: world, five classes, HUD 42/12/32, move, reorder, equip, UID, persisted quickbar');
  let bootstrap = JSON.parse(readFileSync(bridge.bootstrapPath, 'utf8'));
  let token = bootstrap.profiles[0].token;
  const request = async (path, body) => {
    const response = await fetch(bridge.url + path, { method: body ? 'POST' : 'GET', headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' }, ...(body ? { body: JSON.stringify(body) } : {}) });
    assert.ok(response.ok);
    return response.json();
  };
  const before = await request('/api/world');
  if(['world','polish','pacing'].includes(qaScope)){
    const identity={id:before.character.id,equipment:before.character.equipment,gold:before.character.gold,inventory:before.character.inventory,storage:before.character.storage};
    await request('/api/disconnect',{});await bridge.close();
    bridge=await startNativeBridge({data,legacy,backups});
    bootstrap=JSON.parse(readFileSync(bridge.bootstrapPath,'utf8'));token=bootstrap.profiles.find(p=>p.id===identity.id).token;
    const after=await request('/api/world');
    assert.deepEqual({id:after.character.id,equipment:after.character.equipment,gold:after.character.gold,inventory:after.character.inventory,storage:after.character.storage},identity);
    assert.equal(after.mapVersion,before.mapVersion);
    if(qaScope==='polish'){
      assert.equal(after.character.storage.length,500);assert.ok(after.character.storage[499]?.uid);
      assert.equal(after.environment.epoch,before.environment.epoch);
      const other=bootstrap.profiles.find(p=>p.id!==identity.id);
      const second=await fetch(bridge.url+'/api/world',{headers:{Authorization:'Bearer '+other.token}}).then(r=>r.json());
      assert.ok(second.chat.some(m=>m.senderId===identity.id&&m.text==='Проверка мирового чата'));
      const receipt=await request('/api/command',{id:'polish-trade-001',command:{type:'chat',channel:'trade',text:'Торговое сообщение'}});assert.equal(receipt.receipt.ok,true);
      const traded=await fetch(bridge.url+'/api/world',{headers:{Authorization:'Bearer '+other.token}}).then(r=>r.json());
      assert.ok(traded.chat.some(m=>m.channel==='trade'&&m.senderId===identity.id));
      checks.push('500th warehouse cell and shared world/trade chat survive package restart; second authenticated character receives both channels');
    }
    assert.equal(sha(legacy),originalHash);
    checks.push('territory package restart: identical mapVersion, character identity, equipment and inventory; original database unchanged');
    const report={ok:true,platform:process.platform,node:process.version,native,checks,scope:qaScope==='pacing'?'isolated synthetic pacing fixture only':qaScope==='polish'?'isolated synthetic polish fixture only':'isolated synthetic territory fixture only',source:process.env.GITHUB_SHA||'local-uncommitted',windowsGraphics:false,graphicalEnvironment:options.includes('--graphical')?'native Godot under Xvfb/Mesa; software rendering':'headless'};
    writeFileSync(join(output,'pc-integration.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2));
  }else{
  const weapon = before.character.equipment.weapon;
  const scroll = before.character.inventory.find(item => item.id === 'weapon_scroll');
  assert.ok(weapon && scroll);
  const command = { id: 'native-qa-lost-response', command: { type: 'enhance', item: weapon, scroll } };
  const first = await request('/api/command', command);
  assert.equal(first.receipt.ok, true);
  const repeated = await request('/api/command', command);
  assert.deepEqual(repeated.receipt, first.receipt);
  assert.equal(repeated.snapshot.character.inventory.find(item => item.uid === scroll.uid)?.count ?? 0, scroll.count - 1);
  assert.equal(repeated.snapshot.character.equipment.weapon.uid, weapon.uid);
  await request('/api/disconnect', {});
  await bridge.close();
  // New application folder, same data. No package-relative save paths.
  const replacement = join(privateRoot, 'updated-application');
  stageNativeServer(root, replacement);
  const next = await import(pathToFileURL(join(replacement, 'launch-native.mjs')));
  bridge = await next.startNativeBridge({ data, legacy, backups });
  bootstrap = JSON.parse(readFileSync(bridge.bootstrapPath, 'utf8'));
  token = bootstrap.profiles.find(profile => profile.id === before.character.id).token;
  const afterRestart = await request('/api/command', command);
  assert.deepEqual(afterRestart.receipt, first.receipt);
  assert.equal(afterRestart.snapshot.character.id, before.character.id);
  assert.equal(afterRestart.snapshot.character.equipment.weapon.uid, weapon.uid);
  const preferences = JSON.parse(readFileSync(join(data, `native-ui-${before.character.id}.json`), 'utf8'));
  assert.equal(preferences.quickbar.length, 32);
  assert.deepEqual(preferences.quickbar[31], { action: 'potion', key: 'Shift+KeyG' });
  checks.push('enhancement receipt: identical retry after process/package restart, one scroll, same item UID');
  assert.equal(sha(legacy), originalHash);
  assert.deepEqual(inspect(legacy), original);
  checks.push('original database unchanged; new native quickbar survives restart');
  await bridge.close();
  const report = { ok: true, platform: process.platform, node: process.version, native, checks,
    scope: 'synthetic fixture only; no access to player database or old browser profile', source: process.env.GITHUB_SHA || 'local-uncommitted',
    windowsGraphics: false, graphicalEnvironment: options.includes('--graphical') ? 'native Godot under Xvfb/Mesa; software rendering' : 'headless' };
  writeFileSync(join(output, 'pc-integration.json'), JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify(report, null, 2));
  }
} finally { await bridge.close(); }
