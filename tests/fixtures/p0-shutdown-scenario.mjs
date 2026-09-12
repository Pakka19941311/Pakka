import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { once } from 'node:events';
import { setImmediate as nextTurn } from 'node:timers/promises';
import { startWorldServer } from '../../server/http-server.mjs';
import { WorldStore } from '../../server/world-store.mjs';
import { WorldSimulation } from '../../src/server/world-simulation.ts';
import { CollisionWorld } from '../../src/world/collision-world.ts';

const dir = mkdtempSync(join(tmpdir(), 'varendor-p0-shutdown-'));
const database = join(dir, 'synthetic.sqlite');
const running = startWorldServer({database, collision: new CollisionWorld(), port: 0, beta: true, now: () => 1000});
await once(running.server, 'listening');
const base = `http://127.0.0.1:${running.server.address().port}/api`;
const session = await fetch(base + '/session', {method: 'POST',
  headers: {'Content-Type': 'application/json'}, body: JSON.stringify({name: 'P0 fixture', classId: 'mage'})}).then(r => r.json());
const hero = Object.values(running.world.state.characters)[0];
hero.gold = 1234; hero.xp = 17; hero.quest = 2;
const command = {type: 'enhance', item: structuredClone(hero.equipment.weapon),
  scroll: structuredClone(hero.inventory.find(i => i.id === 'weapon_scroll'))};
const receipt = running.world.command(hero.id, 'shutdown-receipt', command);
hero.direction = {x: 1, z: 0}; hero.destination = {x: 2, z: 2};
const expectedHero = structuredClone({...hero, direction: {x: 0, z: 0}, destination: null});
const requests = [];
running.server.on('request', req => {if (req.url === '/api/stream') requests.push(req);});
const controllers = [new AbortController(), new AbortController()];
const readings = [];
for (const controller of controllers) {
  const response = await fetch(base + '/stream', {headers: {Authorization: `Bearer ${session.token}`}, signal: controller.signal});
  assert.equal(response.status, 200);
  readings.push(response.text().catch(error => {if (!controller.signal.aborted) throw error;}));
}
assert.equal(requests.length, 2);
const closed = requests.map(req => new Promise(resolve => req.once('close', resolve)));
if (process.argv[2] === 'client-disconnect') {
  controllers[0].abort(); await closed[0];
  assert.deepEqual(hero.direction, {x: 1, z: 0}, 'one remaining stream keeps the hero connected');
  controllers[1].abort(); await closed[1];
}
// server-stop deliberately leaves both streams open: no diagnostic workaround.
await running.close();
await Promise.all([...closed, ...readings]);
await nextTurn();
const restored = new WorldStore(database);
try {
  const state = restored.load();
  assert.deepEqual(state.characters[hero.id], expectedHero);
  assert.equal(restored.resolveSession(session.token), hero.id);
  assert.equal(restored.db.prepare('PRAGMA integrity_check').get().integrity_check, 'ok');
  const world = new WorldSimulation({store: restored, collision: new CollisionWorld(), now: state.time, beta: true,
    identifier: () => {throw Error('unexpected replacement identity');}});
  assert.deepEqual(world.command(hero.id, 'shutdown-receipt', command), receipt);
  // Existing restart logic clears transient combat controls.
  assert.deepEqual(world.state.characters[hero.id], {...expectedHero, bufferedSkill: undefined, autoAttack: false, singleAttack: false});
  console.log('synthetic shutdown verified');
} finally {
  restored.close(); rmSync(dir, {recursive: true, force: true});
}
