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
const publicAssetsRoot = path.resolve(root, 'public/assets');
let externalReferences = 0;

function parseGlbDocument(bytes, label) {
  let offset = 12;
  while (offset + 8 <= bytes.length) {
    const chunkLength = bytes.readUInt32LE(offset);
    const chunkType = bytes.readUInt32LE(offset + 4);
    const chunkStart = offset + 8;
    const chunkEnd = chunkStart + chunkLength;
    assert.ok(chunkEnd <= bytes.length, `${label} contains an invalid GLB chunk`);
    if (chunkType === 0x4e4f534a) {
      const json = bytes.toString('utf8', chunkStart, chunkEnd).replace(/\0+$/u, '').trim();
      return JSON.parse(json);
    }
    offset = chunkEnd;
  }
  assert.fail(`${label} does not contain a JSON chunk`);
}

async function verifyExternalUris(document, modelFilename) {
  const uris = [
    ...(document.buffers ?? []).map((entry) => entry.uri),
    ...(document.images ?? []).map((entry) => entry.uri),
  ].filter(Boolean);

  for (const uri of uris) {
    if (uri.startsWith('data:')) continue;
    assert.doesNotMatch(uri, /^[a-z][a-z\d+.-]*:/iu, `${modelFilename} must not depend on a remote URI: ${uri}`);
    const cleanUri = decodeURIComponent(uri.split(/[?#]/u, 1)[0]);
    const referenced = path.resolve(path.dirname(modelFilename), cleanUri);
    assert.ok(
      referenced === publicAssetsRoot || referenced.startsWith(`${publicAssetsRoot}${path.sep}`),
      `${modelFilename} references a file outside public/assets: ${uri}`,
    );
    const referencedStat = await stat(referenced).catch(() => null);
    assert.ok(referencedStat?.isFile(), `${modelFilename} references a missing file: ${uri}`);
    assert.ok(referencedStat.size > 0, `${modelFilename} references an empty file: ${uri}`);
    externalReferences += 1;
  }
}

for (const name of characters) {
  const filename = path.join(root, 'public/assets/models/characters', `${name}.gltf`);
  const source = JSON.parse(await readFile(filename, 'utf8'));
  assert.equal(source.asset?.version, '2.0', `${name} must be glTF 2.0`);
  assert.ok(source.meshes?.length, `${name} must contain meshes`);
  assert.ok(source.animations?.length, `${name} must contain animations`);
  await verifyExternalUris(source, filename);
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
    await verifyExternalUris(parseGlbDocument(bytes, `${kind} ${name}`), filename);
  }
}

assert.ok(externalReferences > 0, 'Asset scan must discover referenced external files');
console.log(`Verified ${characters.length} characters, ${monsters.length} monsters, ${world.length} world models and ${externalReferences} external asset references.`);
