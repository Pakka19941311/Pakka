import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import XMLHttpRequest from 'xhr2';
import '@babylonjs/loaders/glTF/index.js';
import { NullEngine, Scene, SceneLoader } from '@babylonjs/core';
import { ModelInstances } from '../src/rendering/model-instances.ts';

globalThis.XMLHttpRequest = XMLHttpRequest;

const host = '127.0.0.1';
const port = 4397;
const base = `http://${host}:${port}`;
const vite = path.join(process.cwd(), 'node_modules', '.bin', process.platform === 'win32' ? 'vite.cmd' : 'vite');
const server = spawn(vite, ['preview', '--host', host, '--port', String(port), '--strictPort'], { stdio: ['ignore', 'pipe', 'pipe'] });
let serverOutput = '';
server.stdout.on('data', (chunk) => { serverOutput += chunk; });
server.stderr.on('data', (chunk) => { serverOutput += chunk; });

async function listFiles(directory, relative = '') {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const childRelative = path.join(relative, entry.name);
    if (entry.isDirectory()) files.push(...await listFiles(path.join(directory, entry.name), childRelative));
    else files.push(childRelative);
  }
  return files;
}

try {
  let response;
  for (let attempt = 0; attempt < 40; attempt += 1) {
    try { response = await fetch(base); if (response.ok) break; } catch { /* startup */ }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  assert.ok(response?.ok, `preview failed to start\n${serverOutput}`);
  const html = await response.text();
  assert.match(html, /Varendor/i);
  const references = [...html.matchAll(/(?:src|href)="([^"]+)"/g)].map((match) => match[1]).filter((value) => value.startsWith('/'));
  assert.ok(references.some((value) => value.endsWith('.js')));
  assert.ok(references.some((value) => value.endsWith('.css')));
  for (const reference of references) {
    const asset = await fetch(`${base}${reference}`);
    assert.ok(asset.ok, `HTTP asset failed: ${reference}`);
  }
  const modelRoot = path.join(process.cwd(), 'dist/assets/models');
  for (const entry of await listFiles(modelRoot)) {
    const browserPath = entry.split(path.sep).map(encodeURIComponent).join('/');
    const asset = await fetch(`${base}/assets/models/${browserPath}`);
    assert.ok(asset.ok, `Runtime asset failed over HTTP: ${entry}`);
    const bytes = (await asset.arrayBuffer()).byteLength;
    assert.ok(bytes > 0, `Runtime asset is empty: ${entry}`);
    if (/\.glb$/iu.test(entry)) assert.ok(bytes > 4_000, `Model response is unexpectedly small: ${entry}`);
    if (/\.gltf$/iu.test(entry)) assert.ok(bytes > 100, `Model response is unexpectedly small: ${entry}`);
  }
  const bundle = await readFile(path.join(process.cwd(), 'dist', references.find((value) => value.endsWith('.js')).slice(1)), 'utf8');
  assert.match(bundle, /__VARENDOR_QA__/);
  const nullEngine = new NullEngine({ renderWidth: 800, renderHeight: 600 });
  const scene = new Scene(nullEngine);
  const factory = new ModelInstances();
  const worldModels = (await readdir(path.join(process.cwd(), 'dist/assets/models/world')))
    .filter((file) => file.toLowerCase().endsWith('.glb'))
    .sort()
    .map((file) => ({ directory: 'world', file, animated: false }));
  const realismModels = (await readdir(path.join(process.cwd(), 'dist/assets/models/realism'), { withFileTypes: true }))
    .filter((entry) => entry.isDirectory())
    .map((entry) => ({ directory: `realism/${entry.name}`, file: `${entry.name}_1k.gltf`, animated: false }));
  const runtimeModels = [
    ...['Warrior', 'Wizard', 'Rogue', 'Ranger', 'Monk'].map((name) => ({ directory: 'characters', file: `${name}.gltf`, animated: true })),
    ...['Skeleton', 'Slime', 'Bat', 'Dragon', 'Fox'].map((name) => ({ directory: 'monsters-glb', file: `${name}.glb`, animated: true, respawnCycles: 5 })),
    ...worldModels,
    ...realismModels,
  ];
  for (const model of runtimeModels) {
    const container = await SceneLoader.LoadAssetContainerAsync(`${base}/assets/models/${model.directory}/`, model.file, scene);
    assert.ok(container.meshes.length > 0, `Babylon produced no meshes for ${model.file}`);
    if (model.animated) assert.ok(container.animationGroups.length > 0, `Babylon produced no animations for ${model.file}`);
    const cycles = model.respawnCycles ?? 1;
    for (let cycle = 0; cycle < cycles; cycle += 1) {
      const instance = factory.create(container, `qa-${cycle}-${model.file}`);
      const meshes = instance.root.getChildMeshes();
      assert.ok(meshes.length > 0, `Babylon could not instantiate ${model.file} on cycle ${cycle + 1}`);
      for (const mesh of meshes) {
        mesh.setEnabled(true);
        mesh.isVisible = true;
        mesh.visibility = 1;
        mesh.computeWorldMatrix(true);
        const bounds = mesh.getBoundingInfo().boundingBox;
        assert.ok(Number.isFinite(bounds.minimumWorld.x) && Number.isFinite(bounds.maximumWorld.y), `Invalid bounds in ${model.file}`);
        if (mesh.material && !mesh.material.getClassName?.().includes('Multi')) assert.equal(mesh.material.getScene?.(), scene, `Detached material reused in ${model.file}`);
      }
      instance.animations.forEach((group) => { group.speedRatio = 1; group.start(true); group.stop(); group.reset(); });
      instance.dispose();
    }
    container.dispose();
  }
  scene.dispose();
  nullEngine.dispose();
  console.log('Runtime smoke passed: production HTTP, Babylon loaders, animations and all gameplay models are healthy.');
} finally {
  server.kill('SIGTERM');
}
