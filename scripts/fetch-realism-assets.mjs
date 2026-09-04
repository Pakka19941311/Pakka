import { createHash } from 'node:crypto';
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';

const textureAssets = [
  'forest_ground_06',
  'cobblestone_floor_001',
  'castle_wall_slates',
  'medieval_wood',
  'roof_slates_02',
  'pine_bark',
];

const modelAssets = [
  'Barrel_01',
  'boulder_01',
  'dead_tree_trunk',
  'gothic_statue',
  'large_castle_door',
  'modular_fort_01',
  'rock_09',
  'tree_stump_01',
  'wooden_crate_01',
];

const root = process.cwd();
const apiRoot = 'https://api.polyhaven.com/files/';

async function fetchJson(asset) {
  const response = await fetch(`${apiRoot}${asset}`);
  if (!response.ok) throw new Error(`Poly Haven manifest failed for ${asset}: ${response.status}`);
  return response.json();
}

async function matches(file, expectedSize, expectedMd5) {
  try {
    if ((await stat(file)).size !== expectedSize) return false;
    const digest = createHash('md5').update(await readFile(file)).digest('hex');
    return digest === expectedMd5;
  } catch {
    return false;
  }
}

async function download(file, descriptor) {
  if (await matches(file, descriptor.size, descriptor.md5)) return;
  await mkdir(path.dirname(file), { recursive: true });
  const response = await fetch(descriptor.url);
  if (!response.ok) throw new Error(`Download failed: ${descriptor.url} (${response.status})`);
  const bytes = Buffer.from(await response.arrayBuffer());
  if (bytes.length !== descriptor.size) throw new Error(`Unexpected size for ${file}: ${bytes.length}`);
  if (createHash('md5').update(bytes).digest('hex') !== descriptor.md5) throw new Error(`Checksum mismatch for ${file}`);
  await writeFile(file, bytes);
}

for (const asset of textureAssets) {
  const manifest = await fetchJson(asset);
  const maps = {
    albedo: manifest.Diffuse?.['1k']?.jpg,
    normal: manifest.nor_gl?.['1k']?.jpg,
    roughness: manifest.Rough?.['1k']?.jpg,
  };
  for (const [kind, descriptor] of Object.entries(maps)) {
    if (!descriptor) throw new Error(`Missing ${kind} map for ${asset}`);
    await download(path.join(root, 'public/assets/textures/pbr', `${asset}_${kind}.jpg`), descriptor);
  }
}

for (const asset of modelAssets) {
  const manifest = await fetchJson(asset);
  const descriptor = manifest.gltf?.['1k']?.gltf;
  if (!descriptor) throw new Error(`Missing 1k glTF package for ${asset}`);
  const modelRoot = path.join(root, 'public/assets/models/realism', asset);
  await download(path.join(modelRoot, path.basename(new URL(descriptor.url).pathname)), descriptor);
  for (const [relative, include] of Object.entries(descriptor.include ?? {})) {
    await download(path.join(modelRoot, relative), include);
  }
}

const skyManifest = await fetchJson('dark_autumn_forest');
await download(
  path.join(root, 'public/assets/textures/pbr/dark_autumn_forest_1k.hdr'),
  skyManifest.hdri?.['1k']?.hdr,
);

console.log(`Downloaded ${textureAssets.length} PBR sets, ${modelAssets.length} CC0 models and one CC0 HDRI from Poly Haven.`);
