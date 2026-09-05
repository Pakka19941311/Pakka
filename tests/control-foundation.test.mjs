import assert from 'node:assert/strict';
import test from 'node:test';
import { CombatControl } from '../src/controls/combat-controller.ts';
import { CharacterMotor, smoothAngle } from '../src/controls/character-motor.ts';
import { movementAxesFromPressed } from '../src/controls/input-controller.ts';
import {
  cameraRelativeDirection,
  clampThirdPersonCameraState,
  THIRD_PERSON_CAMERA_LIMITS,
} from '../src/controls/third-person-camera.ts';
import { TargetingController } from '../src/controls/targeting-controller.ts';

test('WASD axes normalize diagonal motion and cancel opposing keys', () => {
  const diagonal = movementAxesFromPressed(new Set(['KeyW', 'KeyD']));
  assert.ok(Math.abs(Math.hypot(diagonal.forward, diagonal.strafe) - 1) < 0.000001);
  assert.deepEqual(movementAxesFromPressed(new Set(['KeyW', 'KeyS'])), { forward: 0, strafe: 0 });
});

test('movement follows camera yaw', () => {
  const forward = cameraRelativeDirection({ forward: 1, strafe: 0 }, -Math.PI / 2);
  const right = cameraRelativeDirection({ forward: 0, strafe: 1 }, -Math.PI / 2);
  assert.ok(Math.abs(forward.x) < 0.000001);
  assert.ok(Math.abs(forward.z - 1) < 0.000001);
  assert.ok(Math.abs(right.x - 1) < 0.000001);
  assert.ok(Math.abs(right.z) < 0.000001);
});

test('camera distance and pitch stay inside gameplay limits', () => {
  const clamped = clampThirdPersonCameraState({ yaw: 12, pitch: -10, distance: 100 });
  assert.equal(clamped.yaw, 12);
  assert.equal(clamped.pitch, THIRD_PERSON_CAMERA_LIMITS.minPitch);
  assert.equal(clamped.distance, THIRD_PERSON_CAMERA_LIMITS.maxDistance);
});

test('targeting only contains the most recently selected explicit target', () => {
  const first = { uid: 'wolf-a', alive: true, x: 1, z: 2 };
  const second = { uid: 'wolf-b', alive: true, x: 4, z: 5 };
  const targeting = new TargetingController();
  assert.equal(targeting.selected, null);
  targeting.select(first);
  targeting.select(second);
  assert.equal(targeting.selected?.uid, 'wolf-b');
  second.alive = false;
  assert.equal(targeting.validate(), null);
});

test('combat approaches and attacks only its explicit target', () => {
  const combat = new CombatControl();
  const target = { uid: 'wolf-a', alive: true, x: 10, z: 0 };
  const common = {
    player: { x: 0, z: 0 },
    target,
    basicRange: 2.6,
    skillRange: () => 2.6,
    canBasicAttack: true,
    canUseSkill: () => true,
  };
  assert.deepEqual(combat.plan(common), { kind: 'idle' });
  combat.engageBasic(target.uid);
  const approach = combat.plan(common);
  assert.equal(approach.kind, 'approach');
  assert.equal(approach.targetId, target.uid);
  const attack = combat.plan({ ...common, player: { x: 8, z: 0 } });
  assert.deepEqual(attack, { kind: 'attack', targetId: target.uid, skillIndex: null });
});

test('ground movement cancellation stops pursuit without inventing a new target', () => {
  const combat = new CombatControl();
  const target = { uid: 'wolf-a', alive: true, x: 10, z: 0 };
  combat.engageBasic(target.uid);
  combat.cancelPursuit();
  assert.deepEqual(combat.plan({
    player: { x: 0, z: 0 },
    target,
    basicRange: 2.6,
    skillRange: () => 2.6,
    canBasicAttack: true,
    canUseSkill: () => true,
  }), { kind: 'idle' });
});

test('clicking another monster replaces the combat target immediately', () => {
  const combat = new CombatControl();
  const targeting = new TargetingController();
  const first = { uid: 'wolf-a', alive: true, x: 1, z: 0 };
  const second = { uid: 'wolf-b', alive: true, x: 2, z: 0 };
  targeting.select(first);
  combat.engageBasic(first.uid);
  targeting.select(second);
  combat.engageBasic(second.uid);
  assert.deepEqual(combat.plan({
    player: { x: 0, z: 0 },
    target: targeting.selected,
    basicRange: 2.6,
    skillRange: () => 2.6,
    canBasicAttack: true,
    canUseSkill: () => true,
  }), { kind: 'attack', targetId: second.uid, skillIndex: null });
});

test('character motor softens direction changes without delaying first movement', () => {
  const motor = new CharacterMotor();
  const first = motor.step({ x: 0, z: 1 }, 6, 1 / 60);
  assert.ok(first.dz > 0);
  const turn = motor.step({ x: 1, z: 0 }, 6, 1 / 60);
  assert.ok(turn.dx > 0);
  assert.ok(turn.dz > 0);
  assert.ok(smoothAngle(Math.PI - 0.1, -Math.PI + 0.1, 12, 1 / 60) > Math.PI - 0.1);
});

test('jump is grounded, uses gravity and rejects double jump', () => {
  const motor = new CharacterMotor();
  assert.equal(motor.requestJump(), true);
  assert.equal(motor.requestJump(), false);
  let peak = 0;
  let step;
  for (let frame = 0; frame < 180; frame += 1) {
    step = motor.step({ x: 0, z: 0 }, 6, 1 / 60);
    peak = Math.max(peak, step.height);
  }
  assert.ok(peak > 1);
  assert.equal(step.grounded, true);
  assert.equal(step.height, 0);
  assert.equal(motor.requestJump(), true);
});

test('a full reversal changes facing and completes the visual turn instead of locking to the old heading', () => {
  const motor = new CharacterMotor();
  for (let frame = 0; frame < 60; frame++) motor.step({ x: 0, z: 1 }, 6, 1 / 60);
  let yaw = 0;
  let step;
  for (let frame = 0; frame < 12; frame++) {
    step = motor.step({ x: 0, z: -1 }, 6, 1 / 60);
    yaw = smoothAngle(yaw, Math.atan2(step.facingX, step.facingZ), 16, 1 / 60);
  }
  assert.ok(step.dz < 0, 'the body must move in the requested direction');
  assert.ok(Math.cos(yaw) < -0.95, 'the visual heading must follow the reversal within 200 ms');
  assert.ok(Math.abs(Math.sin(yaw)) < 0.2, 'the turn must settle without oscillation');
});

test('the same explicit click attacks at ranged distance but approaches in melee', () => {
  const target = { uid: 'wolf-range', alive: true, x: 8, z: 0 };
  const input = {
    player: { x: 0, z: 0 }, target,
    skillRange: () => 2.6,
    canBasicAttack: true,
    canUseSkill: () => true,
  };
  const melee = new CombatControl();
  melee.engageBasic(target.uid);
  assert.equal(melee.plan({ ...input, basicRange: 2.6 }).kind, 'approach');
  const ranged = new CombatControl();
  ranged.engageBasic(target.uid);
  assert.equal(ranged.plan({ ...input, basicRange: 12 }).kind, 'attack');
});
