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

test('phase-one controls are modular and Space is no longer bound to normal attack', async () => {
  const [source, camera, input, targeting, combat] = await Promise.all([
    readFile(new URL('../src/main.ts', import.meta.url), 'utf8'),
    readFile(new URL('../src/controls/third-person-camera.ts', import.meta.url), 'utf8'),
    readFile(new URL('../src/controls/input-controller.ts', import.meta.url), 'utf8'),
    readFile(new URL('../src/controls/targeting-controller.ts', import.meta.url), 'utf8'),
    readFile(new URL('../src/controls/combat-controller.ts', import.meta.url), 'utf8'),
  ]);
  assert.match(source, /new ThirdPersonCameraController/);
  assert.match(source, /new PlayerInputController/);
  assert.match(source, /targeting\.select\(entity\)/);
  assert.match(source, /combatControl\.engageBasic\(entity\.uid\)/);
  assert.match(source, /CreateCapsule\(`pick-volume-/);
  assert.match(source, /combatPickVolume: true/);
  assert.doesNotMatch(source, /event\.code\s*===\s*['"]Space['"][^\n]*basicAttack/);
  assert.match(source, /function die\(\)[\s\S]*?resetPlayerControl\(true\)[\s\S]*?cameraControl\.snap/);
  assert.match(source, /entity\.kind === 'npc'[\s\S]*?state\.interactionTarget = entity/);
  assert.match(source, /type: 'move-intent'[\s\S]*?sequence: movementSequence/);
  assert.match(camera, /cameraRelativeDirection/);
  assert.match(input, /movementAxesFromPressed/);
  assert.match(targeting, /class TargetingController/);
  assert.match(combat, /class CombatControl/);
});

test('phase 1.1 restores respawn transforms and applies lightweight world collision', async () => {
  const [source, collision] = await Promise.all([
    readFile(new URL('../src/main.ts', import.meta.url), 'utf8'),
    readFile(new URL('../src/world/collision-world.ts', import.meta.url), 'utf8'),
  ]);
  assert.match(source, /collisionWorld\.resolve/);
  assert.match(source, /registerWorldCollider/);
  assert.match(source, /restoreEntityAfterRespawn/);
  assert.match(source, /animation\.reset\(\)/);
  assert.match(source, /root\.scaling\.copyFrom\(entity\.baseScale/);
  assert.match(source, /source instanceof PBRMaterial/);
  assert.match(collision, /findNearestFree/);
});
