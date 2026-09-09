import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { CLASSES, ITEMS } from '../src/data/game-data.ts';
import { WorldSimulation } from '../src/server/world-simulation.ts';
import { WorldStore } from '../server/world-store.mjs';
import { startWorldServer } from '../server/http-server.mjs';
import { CollisionWorld } from '../src/world/collision-world.ts';
import { calculateEquipmentStats, itemStatContribution } from '../src/core/equipment-stats.ts';

const definition = item => ITEMS[item.id];
let serial = 0;
const item = id => ({uid:`knight-item-${++serial}`, id, plus:0, count:1});
const setup = (store = new WorldStore(':memory:')) => ({store, world:new WorldSimulation({store, collision:new CollisionWorld(), now:100000, identifier:()=>`knight-entity-${++serial}`, random:()=>.5})});
const command = (world, hero, value) => world.command(hero.id, `knight-command-${++serial}`, value);

// Fresh fixtures only. No launcher defaults, user database or original save paths.
test('new knight starts without armor and retains both original starter item UIDs in the bag', () => {
  const {world, store} = setup();
  try {
    const knight = world.createCharacter('Новый рыцарь', 'knight');
    assert.deepEqual(knight.equipment, {});
    assert.deepEqual(knight.inventory.map(i=>i.id), ['potion','ether','teleport','wardens_blade','militia_plate']);
    assert.equal(new Set(knight.inventory.map(i=>i.uid)).size, knight.inventory.length);
    const unarmed = calculateEquipmentStats('knight', CLASSES.knight.stats, 1, {}, definition);
    assert.deepEqual(knight.stats, unarmed.stats);
    assert.equal(knight.maxHp, unarmed.maxHp);
    assert.equal(knight.hp, knight.maxHp);
    const starter = knight.inventory.filter(i=>'slot' in definition(i)).map(i=>({...i}));
    for (const piece of starter) assert.equal(command(world, knight, {type:'equip', item:piece, slot:definition(piece).slot}).ok, true);
    const equipped = calculateEquipmentStats('knight', CLASSES.knight.stats, 1, knight.equipment, definition);
    assert.deepEqual(knight.stats, equipped.stats);
    assert.deepEqual(Object.values(knight.equipment).map(i=>i.uid), starter.map(i=>i.uid));
    assert.deepEqual(knight.inventory.map(i=>i.id), ['potion','ether','teleport']);
    for (const classId of ['mage','ranger','assassin','necro']) {
      const hero = world.createCharacter(classId, classId);
      assert.equal(hero.equipment.weapon.id, CLASSES[classId].weapon);
      assert.equal(hero.equipment.chest.id, CLASSES[classId].armor);
      assert.deepEqual(hero.inventory.map(i=>i.id), ['potion','ether','teleport']);
    }
  } finally { store.close(); }
});

test('only a fresh beta knight receives the unequipped modular preview kit', () => {
  const store = new WorldStore(':memory:');
  try {
    const world = new WorldSimulation({store, collision:new CollisionWorld(), now:100000, identifier:()=>`knight-entity-${++serial}`, beta:true});
    const knight = world.createCharacter('Бета рыцарь', 'knight');
    assert.deepEqual(knight.equipment, {});
    const kit = ['fallen_helm','fallen_helm_open','wolf_gloves','grave_boots','ash_belt'];
    for (const id of kit) assert.equal(knight.inventory.filter(i=>i.id===id).length, 1);
    for (const classId of ['mage','ranger','assassin','necro']) {
      const hero = world.createCharacter(classId, classId);
      assert.ok(hero.inventory.every(i=>!kit.includes(i.id)));
      assert.equal(hero.equipment.weapon.id, CLASSES[classId].weapon);
    }
    const before = structuredClone(knight.inventory);
    world.checkpoint();
    const restored = new WorldSimulation({store, collision:new CollisionWorld(), now:100001, identifier:()=>`knight-entity-${++serial}`, beta:true});
    assert.deepEqual(restored.state.characters[knight.id].inventory, before);
  } finally { store.close(); }
});

test('beta import preserves owned equipment and does not grant the new-character preview kit', () => {
  const store = new WorldStore(':memory:');
  try {
    const world = new WorldSimulation({store, collision:new CollisionWorld(), now:100000, identifier:()=>`knight-entity-${++serial}`, beta:true});
    const saved = {schema:2, player:{name:'Прежний рыцарь',classId:'knight',level:1,xp:0,gold:320,x:0,z:0,hp:100,mp:90,
      inventory:[item('potion')],equipment:{weapon:item('wardens_blade'),chest:item('militia_plate')}}};
    const imported = world.importCharacter('knight-original-import-001', saved);
    assert.equal(imported.equipment.weapon.id, 'wardens_blade');
    assert.equal(imported.equipment.chest.id, 'militia_plate');
    assert.ok(imported.inventory.every(i=>!['fallen_helm','fallen_helm_open','wolf_gloves','grave_boots','ash_belt'].includes(i.id)));
  } finally { store.close(); }
});

test('two helmet geometries retain identical item contributions at every enhancement level', () => {
  assert.equal(ITEMS.fallen_helm.visualModel, 'helmet_closed');
  assert.equal(ITEMS.fallen_helm_open.visualModel, 'helmet_open');
  assert.equal(ITEMS.fallen_helm_open.value, ITEMS.fallen_helm.value);
  assert.equal(ITEMS.fallen_helm_open.slot, ITEMS.fallen_helm.slot);
  for (let plus=0; plus<=15; plus++) assert.deepEqual(itemStatContribution(ITEMS.fallen_helm_open, plus), itemStatContribution(ITEMS.fallen_helm, plus));
  // Visual presentation must never replace the server model used for attack timing.
  assert.equal(CLASSES.knight.model, 'Warrior');
});

test('persisted knight gear survives restart without migration or stripping', () => {
  const directory = mkdtempSync(join(tmpdir(), 'varendor-knight-save-'));
  const database = join(directory, 'world.sqlite');
  let store;
  try {
    store = new WorldStore(database);
    const first = new WorldSimulation({store, collision:new CollisionWorld(), now:100000, identifier:()=>`knight-entity-${++serial}`});
    const hero = first.createCharacter('Сохранённый рыцарь', 'knight');
    for (const piece of hero.inventory.filter(i=>'slot' in definition(i))) assert.equal(command(first, hero, {type:'equip', item:{...piece}, slot:definition(piece).slot}).ok, true);
    const helmet = item('fallen_helm'); helmet.plus = 3; hero.inventory.push(helmet);
    assert.equal(command(first, hero, {type:'equip',item:{...helmet},slot:'head'}).ok, true);
    const original = structuredClone({inventory:hero.inventory,equipment:hero.equipment,stats:hero.stats,gold:hero.gold});
    first.checkpoint(); store.close();
    store = new WorldStore(database);
    const next = new WorldSimulation({store, collision:new CollisionWorld(), now:100001, identifier:()=>`knight-entity-${++serial}`});
    const restored = next.state.characters[hero.id];
    assert.deepEqual({inventory:restored.inventory,equipment:restored.equipment,stats:restored.stats,gold:restored.gold}, original);
  } finally { store?.close(); rmSync(directory, {recursive:true, force:true}); }
});

test('real HTTP equipment commands replace armor and expose identical self/observer loadouts', async () => {
  const service = startWorldServer({database:':memory:', collision:new CollisionWorld(), port:0});
  await once(service.server, 'listening');
  const url = `http://127.0.0.1:${service.server.address().port}`;
  const request = async (path, body, token) => {
    const response = await fetch(url+path, {method:body?'POST':'GET', headers:{'Content-Type':'application/json', ...(token?{Authorization:`Bearer ${token}`}:{})}, ...(body?{body:JSON.stringify(body)}:{})});
    assert.equal(response.ok, true);
    return response.json();
  };
  try {
    const self = await request('/api/session', {name:'Проверка рыцаря',classId:'knight'});
    const observer = await request('/api/session', {name:'Наблюдатель',classId:'mage'});
    assert.deepEqual(self.snapshot.character.equipment, {});
    const hero = service.world.state.characters[self.snapshot.character.id];
    // Extra review items exist only in this in-memory server fixture.
    hero.inventory.push(...['fallen_helm','fallen_helm_open','wolf_gloves','grave_boots','ash_belt'].map(item));
    const owned = [...hero.inventory.map(i=>i.uid)].sort();
    const equip = async id => {
      const current = (await request('/api/world', undefined, self.token)).character;
      const piece = current.inventory.find(i=>i.id===id); assert.ok(piece, id);
      const result = await request('/api/command', {id:`knight-http-${++serial}`, command:{type:'equip',item:piece,slot:definition(piece).slot}}, self.token);
      assert.equal(result.receipt.ok, true);
      assert.equal(result.snapshot.character.equipment[definition(piece).slot].uid, piece.uid);
      return result.snapshot.character;
    };
    for (const id of ['wardens_blade','militia_plate','wolf_gloves','grave_boots','ash_belt']) await equip(id);
    const closed = await equip('fallen_helm');
    const closedUid = closed.equipment.head.uid;
    const open = await equip('fallen_helm_open');
    assert.deepEqual(open.stats, closed.stats);
    assert.equal(open.maxHp, closed.maxHp);
    assert.ok(open.inventory.some(i=>i.uid===closedUid));
    const remote = await request('/api/world', undefined, observer.token);
    assert.deepEqual(remote.heroes.find(p=>p.id===hero.id).equipment, open.equipment);
    await equip('fallen_helm');
    let current = (await request('/api/world', undefined, self.token)).character;
    for (const [slot,piece] of Object.entries(current.equipment)) {
      const result = await request('/api/command', {id:`knight-http-${++serial}`,command:{type:'unequip',item:piece,slot}}, self.token);
      assert.equal(result.receipt.ok, true);
      current = result.snapshot.character;
    }
    assert.deepEqual(current.equipment, {});
    assert.deepEqual(current.inventory.map(i=>i.uid).sort(), owned);
    const remoteBare = await request('/api/world', undefined, observer.token);
    assert.deepEqual(remoteBare.heroes.find(p=>p.id===hero.id).equipment, {});
  } finally { await service.close(); }
});
