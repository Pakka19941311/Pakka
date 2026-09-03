import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('browser client uses Babylon.js and TypeScript entrypoint', async () => {
  const [html, source, pkg] = await Promise.all([
    readFile(new URL('../index.html', import.meta.url), 'utf8'),
    readFile(new URL('../src/main.ts', import.meta.url), 'utf8'),
    readFile(new URL('../package.json', import.meta.url), 'utf8').then(JSON.parse),
  ]);
  assert.match(html, /src\/main\.ts/);
  assert.match(source, /from '@babylonjs\/core'/);
  assert.match(source, /LocalGameGateway/);
  assert.equal(pkg.dependencies.three, undefined);
  assert.equal(pkg.dependencies['@babylonjs/core'], '8.26.1');
});

test('player-facing item data has no rarity classification', async () => {
  const data = await readFile(new URL('../src/data/game-data.ts', import.meta.url), 'utf8');
  assert.doesNotMatch(data, /rare\s*:/i);
  assert.doesNotMatch(data, /rarity/i);
});

test('Windows one-click launch and every production build enforce the stable pipeline', async () => {
  const [launcher, setup, pkg] = await Promise.all([
    readFile(new URL('../RUN_WINDOWS.bat', import.meta.url), 'utf8'),
    readFile(new URL('../setup-and-run.ps1', import.meta.url), 'utf8'),
    readFile(new URL('../package.json', import.meta.url), 'utf8').then(JSON.parse),
  ]);
  assert.match(launcher, /setup-and-run\.ps1/i);
  assert.match(setup, /Install-PortableNode/);
  assert.match(setup, /\$env:PATH/);
  assert.match(setup, /npmCmd\s+ci/);
  assert.match(setup, /npmCmd\s+run\s+build/);
  assert.match(setup, /npmCmd.*preview/);
  assert.match(pkg.scripts.build, /verify:assets/);
});
