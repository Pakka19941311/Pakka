import assert from 'node:assert/strict';
import { readdir, readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

const root = process.cwd();
const characters = ['Warrior', 'Wizard', 'Rogue', 'Ranger', 'Monk'];
const monsters = ['Skeleton', 'Slime', 'Bat', 'Dragon'];
const worldDirectory = path.join(root, 'public/assets/models/world');
const world = (await readdir(worldDirectory))
  .filter((filename) => filename.toLowerCase().endsWith('.glb'))
  .map((filename) => path.parse(filename).name)
  .sort();

for (const name of characters) {
  const filename = path.join(root, 'public/assets/models/characters', `${name}.gltf`);
  const source = JSON.parse(await readFile(filename, 'utf8'));
  assert.equal(source.asset?.version, '2.0', `${name} must be glTF 2.0`);
  assert.ok(source.meshes?.length, `${name} must contain meshes`);
  assert.ok(source.animations?.length, `${name} must contain animations`);
}

for (const [kind, names, directory] of [
  ['monster', monsters, 'public/assets/models/monsters-glb'],
  ['world', world, 'public/assets/models/world'],
]) {
  for (const name of names) {
    const filename = path.join(root, directory, `${name}.glb`);
    const bytes = await readFile(filename);
    assert.equal(bytes.toString('ascii', 0, 4), 'glTF', `${kind} ${name} must be a valid GLB`);
    assert.equal(bytes.readUInt32LE(4), 2, `${kind} ${name} must use GLB v2`);
    assert.equal(bytes.readUInt32LE(8), bytes.length, `${kind} ${name} length header must match`);
    assert.ok((await stat(filename)).size > 4_000, `${kind} ${name} is unexpectedly small`);
  }
}

console.log(`Verified ${characters.length} characters, ${monsters.length} monsters and ${world.length} world models.`);
