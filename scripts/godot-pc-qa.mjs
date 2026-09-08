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
assert.ok(binaryArg && outputArg, 'Usage: godot-pc-qa.mjs BINARY OUTPUT [--graphical] [--package=DIR]');
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
  const args = ['--audio-driver', 'Dummy', ...(options.includes('--graphical') ? [] : ['--headless']), '--', `--bootstrap=${bridge.bootstrapPath}`, `--qa=${reportPath}`];
  const child = spawn(binary, args, { cwd: stage, stdio: ['ignore', 'pipe', 'pipe'] });
  let log = '';
  child.stdout.on('data', bytes => { log += bytes; });
  child.stderr.on('data', bytes => { log += bytes; });
  const timeout = setTimeout(() => child.kill(), 300000);
  let code;
  try { [code] = await once(child, 'exit'); }
  finally { clearTimeout(timeout); writeFileSync(join(output, 'native-runtime.log'), log); }
  for (const line of log.split('\n')) if (line.startsWith('VARENDOR_REVIEW_JPG ') || line.startsWith('VARENDOR_CORE_JPG ') || line.startsWith('VARENDOR_REFERENCE_UI_JPG')) console.log(line);
  assert.equal(code, 0, log.split('\n').filter(line => !line.startsWith('VARENDOR_REVIEW_JPG ') && !line.startsWith('VARENDOR_CORE_JPG ')).join('\n').slice(-16000));
  assert.doesNotMatch(log, /SCRIPT ERROR:|^ERROR:/m, 'Native client runtime errors');
  const native = JSON.parse(readFileSync(reportPath, 'utf8'));
  assert.equal(native.ok, true);
  for (const [key, value] of Object.entries({ classes: 5, item_definitions: 33, quick_slots: 32, bag_slots: 42, equipment_slots: 12 })) assert.equal(native.checks[key], value, key);
  if (options.includes('--graphical')) {
    assert.equal(native.checks.native_render, true);
    assert.ok(existsSync(reportPath.replace(/\.json$/, '.png')));
  }
  checks.push('exported native client: world, five classes, HUD 42/12/32, move, reorder, equip, UID, persisted quickbar');
  let bootstrap = JSON.parse(readFileSync(bridge.bootstrapPath, 'utf8'));
  let token = bootstrap.profiles[0].token;
  const request = async (path, body) => {
    const response = await fetch(bridge.url + path, { method: body ? 'POST' : 'GET', headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' }, ...(body ? { body: JSON.stringify(body) } : {}) });
    assert.ok(response.ok);
    return response.json();
  };
  const before = await request('/api/world');
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
} finally { await bridge.close(); }
