import assert from 'node:assert/strict';
import test from 'node:test';
import { LocalGameGateway } from '../src/network/game-gateway.ts';

class MemoryStorage {
  values = new Map();
  get length() { return this.values.size; }
  clear() { this.values.clear(); }
  getItem(key) { return this.values.get(key) ?? null; }
  key(index) { return [...this.values.keys()][index] ?? null; }
  removeItem(key) { this.values.delete(key); }
  setItem(key, value) { this.values.set(key, String(value)); }
}

test('local persistence can be replaced without changing game systems', async () => {
  const storage = new MemoryStorage();
  const gateway = new LocalGameGateway('current', storage);
  await gateway.save({ player: { level: 7 }, inventory: ['fang'] });
  assert.deepEqual(await gateway.load(), { player: { level: 7 }, inventory: ['fang'] });
  await gateway.send({ type: 'move', x: 3, z: 4 });
  await gateway.send({ type: 'move-intent', x: 0, z: 1, sequence: 1 });
  await gateway.send({ type: 'attack', entityId: 'wolf-1', skillIndex: 0 });
  assert.equal(gateway.commandLog.length, 3);
  await gateway.clear();
  assert.equal(await gateway.load(), null);
});

test('v0.2 local saves migrate into the v0.3 key', async () => {
  const storage = new MemoryStorage();
  storage.setItem('legacy', JSON.stringify({ player: { level: 3 } }));
  const gateway = new LocalGameGateway('current', storage, ['legacy']);
  assert.deepEqual(await gateway.load(), { player: { level: 3 } });
  assert.deepEqual(JSON.parse(storage.getItem('current')), { player: { level: 3 } });
});
