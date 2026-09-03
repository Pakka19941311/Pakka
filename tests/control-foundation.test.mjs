import assert from 'node:assert/strict';
import test from 'node:test';
import { CombatControl } from '../src/controls/combat-controller.ts';
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
