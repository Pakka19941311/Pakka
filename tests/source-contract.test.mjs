import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('browser client uses Babylon.js and TypeScript entrypoint', async () => {
  const [html, bootstrap, source, pkg] = await Promise.all([
    readFile(new URL('../index.html', import.meta.url), 'utf8'),
    readFile(new URL('../src/bootstrap.ts', import.meta.url), 'utf8'),
    readFile(new URL('../src/main.ts', import.meta.url), 'utf8'),
    readFile(new URL('../package.json', import.meta.url), 'utf8').then(JSON.parse),
  ]);
  assert.match(html, /src\/bootstrap\.ts/);
  assert.match(bootstrap, /presentation\/visual-guardrails/);
  assert.match(bootstrap, /\.\/main/);
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
  assert.match(source, /combatPickVolume: entity\.kind === 'monster'/);
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

test('Greenfall is an authored settlement with oriented and ambient residents', async () => {
  const [source, ambient] = await Promise.all([
    readFile(new URL('../src/main.ts', import.meta.url), 'utf8'),
    readFile(new URL('../src/world/ambient-npc.ts', import.meta.url), 'utf8'),
  ]);
  assert.match(source, /function buildStarterSettlement/);
  assert.match(source, /function createBonfire/);
  assert.match(source, /spawnAmbientResidents\(\)/);
  assert.match(source, /rotateTowards\(entity, lookX, lookZ\)/);
  assert.match(source, /entity\.kind === 'ambient'/);
  assert.match(ambient, /'idle' \| 'walk' \| 'activity'/);
});

test('consumable hotbar is stack-aware and uses persisted configurable bindings', async () => {
  const [source, bindings, hotbarStyles] = await Promise.all([
    readFile(new URL('../src/main.ts', import.meta.url), 'utf8'),
    readFile(new URL('../src/controls/action-bindings.ts', import.meta.url), 'utf8'),
    readFile(new URL('../src/hotbar.css', import.meta.url), 'utf8'),
  ]);
  assert.match(source, /keybinds: ConsumableBindings/);
  assert.match(source, /consumableActionForCode\(state\.settings\.keybinds, event\.code\)/);
  assert.match(source, /potionButton\.disabled = potionCount <= 0/);
  assert.match(source, /s\.keybinds = normalizeConsumableBindings\(requestedBindings\)/);
  assert.match(source, /player\.inventory\.splice\(index, 1\)/);
  assert.match(bindings, /DEFAULT_CONSUMABLE_BINDINGS/);
  assert.match(hotbarStyles, /\.skill-button:disabled/);
});

test('presentation guardrails suppress the prototype combat glow without touching combat logic', async () => {
  const guardrails = await readFile(new URL('../src/presentation/visual-guardrails.ts', import.meta.url), 'utf8');
  assert.match(guardrails, /selected-target/);
  assert.match(guardrails, /impact-/);
  assert.match(guardrails, /mesh\.setEnabled\(false\)/);
  assert.match(guardrails, /material\.alpha = 0\.48/);
});
