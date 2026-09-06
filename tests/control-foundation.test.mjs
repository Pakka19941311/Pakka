import assert from 'node:assert/strict';
import test from 'node:test';
import { CombatControl, SKILL_BUFFER_SECONDS } from '../src/controls/combat-controller.ts';
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

function combatInput(target, overrides = {}) {
  return {
    player: { x: 0, z: 0 }, target,
    basicRange: 2.6, skillRange: () => 2.6,
    canBasicAttack: true, canUseSkill: () => true,
    ...overrides,
  };
}

test('a skill approach remains durable while a separate recovery buffer expires', () => {
  const combat = new CombatControl();
  const target = { uid: 'far-wolf', alive: true, x: 20, z: 0 };
  combat.queueSkill(target.uid, 0);
  combat.bufferSkill(target.uid, 1, 10);
  assert.equal(combat.plan(combatInput(target)).kind, 'approach');
  combat.expireBufferedSkill(13);
  assert.equal(combat.snapshot.bufferedSkill, null);
  assert.deepEqual(combat.snapshot.skillIntent, { targetId: target.uid, skillIndex: 0 });
  assert.deepEqual(combat.plan(combatInput(target, { player: { x: 18, z: 0 } })), {
    kind: 'attack', targetId: target.uid, skillIndex: 0,
  });
});

test('recovery input does not become an attack until promoted and last accepted press wins', () => {
  const combat = new CombatControl();
  const target = { uid: 'wolf', alive: true, x: 1, z: 0 };
  combat.bufferSkill(target.uid, 0, 5);
  combat.bufferSkill(target.uid, 2, 5.1);
  assert.deepEqual(combat.plan(combatInput(target)), { kind: 'idle' });
  assert.deepEqual(combat.snapshot.bufferedSkill, {
    targetId: target.uid, skillIndex: 2, expiresAt: 5.1 + SKILL_BUFFER_SECONDS,
  });
  assert.deepEqual(combat.promoteBufferedSkill(5.4), { targetId: target.uid, skillIndex: 2 });
  assert.equal(combat.snapshot.bufferedSkill, null);
  assert.deepEqual(combat.plan(combatInput(target)), { kind: 'attack', targetId: target.uid, skillIndex: 2 });
  assert.equal(combat.promoteBufferedSkill(5.41), null, 'a buffer can only be promoted once');
});

test('the skill buffer expires at its simulation deadline without creating a deferred attack', () => {
  const combat = new CombatControl();
  combat.bufferSkill('wolf', 1, 20);
  assert.equal(combat.promoteBufferedSkill(20 + SKILL_BUFFER_SECONDS), null);
  assert.equal(combat.snapshot.skillIntent, null);
  assert.equal(combat.snapshot.bufferedSkill, null);
});

test('a skill that lost its resource or target is consumed instead of waiting invisibly', () => {
  const combat = new CombatControl();
  combat.bufferSkill('wolf', 1, 2);
  let validations = 0;
  assert.equal(combat.promoteBufferedSkill(2.1, (intent) => {
    validations += 1;
    assert.equal(intent.targetId, 'wolf');
    return false;
  }), null);
  assert.equal(validations, 1);
  assert.equal(combat.snapshot.skillIntent, null);
  assert.equal(combat.promoteBufferedSkill(2.2), null);
});

test('manual cancellation removes skill approach, recovery input and automatic attack together', () => {
  const combat = new CombatControl();
  combat.engageBasic('wolf');
  combat.queueSkill('wolf', 0);
  combat.bufferSkill('wolf', 1, 0);
  combat.cancelPursuit();
  assert.deepEqual(combat.snapshot, { autoAttackTargetId: null, skillIntent: null, bufferedSkill: null });
  assert.equal(combat.isEngagedWith('wolf'), false);
  assert.equal(combat.promoteBufferedSkill(0.1), null);
});

test('removing the explicit target clears its pending commands and does not select another enemy', () => {
  const combat = new CombatControl();
  combat.engageBasic('wolf');
  combat.queueSkill('wolf', 0);
  combat.bufferSkill('wolf', 1, 0);
  combat.targetRemoved('unrelated-wolf');
  assert.equal(combat.isEngagedWith('wolf'), true);
  combat.targetRemoved('wolf');
  assert.deepEqual(combat.snapshot, { autoAttackTargetId: null, skillIntent: null, bufferedSkill: null });
  assert.deepEqual(combat.plan(combatInput({ uid: 'other-wolf', alive: true, x: 1, z: 0 })), { kind: 'idle' });
});

test('a fresh explicit basic command replaces both prior skill commands', () => {
  const combat = new CombatControl();
  combat.queueSkill('wolf-a', 0);
  combat.bufferSkill('wolf-a', 1, 1);
  combat.engageBasic('wolf-b');
  assert.deepEqual(combat.snapshot, { autoAttackTargetId: 'wolf-b', skillIntent: null, bufferedSkill: null });
  assert.equal(combat.isEngagedWith('wolf-a'), false);
});

test('a completed single skill resumes only previously explicit basic combat', () => {
  const target = { uid: 'wolf', alive: true, x: 1, z: 0 };
  for (const automatic of [false, true]) {
    const combat = new CombatControl();
    if (automatic) combat.engageBasic(target.uid);
    combat.queueSkill(target.uid, 2);
    assert.equal(combat.plan(combatInput(target)).skillIndex, 2);
    combat.completeAttack(2);
    assert.equal(combat.snapshot.skillIntent, null);
    assert.deepEqual(combat.plan(combatInput(target)), automatic
      ? { kind: 'attack', targetId: target.uid, skillIndex: null }
      : { kind: 'idle' });
  }
});

test('cancel and repeated clicks do not bypass the attack interval owned by the actor', () => {
  const combat = new CombatControl();
  const target = { uid: 'wolf', alive: true, x: 1, z: 0 };
  const cooling = combatInput(target, { canBasicAttack: false });
  for (let click = 0; click < 20; click += 1) {
    combat.cancelPursuit();
    combat.engageBasic(target.uid);
    assert.deepEqual(combat.plan(cooling), { kind: 'wait', targetId: target.uid });
  }
  assert.deepEqual(combat.plan({ ...cooling, canBasicAttack: true }), {
    kind: 'attack', targetId: target.uid, skillIndex: null,
  });
});

test('self skills can share the recovery buffer without inventing a hostile autoattack target', () => {
  const combat = new CombatControl();
  combat.bufferSkill('@self', 1, 0);
  assert.deepEqual(combat.promoteBufferedSkill(0.1), { targetId: '@self', skillIndex: 1 });
  combat.discardQueuedSkill();
  assert.deepEqual(combat.snapshot, { autoAttackTargetId: null, skillIntent: null, bufferedSkill: null });
});

test('the public combat snapshot cannot mutate the stored command or deadline', () => {
  const combat = new CombatControl();
  combat.queueSkill('wolf', 0);
  combat.bufferSkill('wolf', 1, 1);
  const snapshot = combat.snapshot;
  snapshot.skillIntent.skillIndex = 99;
  snapshot.bufferedSkill.expiresAt = Infinity;
  assert.equal(combat.snapshot.skillIntent.skillIndex, 0);
  assert.equal(combat.promoteBufferedSkill(2), null);
});

test('pursuit settles inside range and tolerates boundary motion without extending hit distance', () => {
  for (const skill of [false, true]) {
    const combat = new CombatControl();
    const target = { uid: 'wolf', alive: true, x: 2.61, z: 0 };
    if (skill) combat.queueSkill(target.uid, 0); else combat.engageBasic(target.uid);
    const input = combatInput(target);
    assert.equal(combat.plan(input).kind, 'approach');
    target.x = 2.4;
    assert.equal(combat.plan(input).kind, 'approach', 'pursuit must continue to the inner threshold');
    target.x = 2.3;
    assert.equal(combat.plan(input).kind, 'attack');
    for (const distance of [2.4, 2.55, 2.35, 2.6]) {
      target.x = distance;
      assert.equal(combat.plan(input).kind, 'attack', 'small motion inside range must not restart pursuit');
    }
    target.x = 2.61;
    assert.equal(combat.plan(input).kind, 'approach', 'hysteresis must never permit attacks beyond the actual range');
  }
});

test('a fresh command does not inherit the preceding pursuit settling threshold', () => {
  const combat = new CombatControl();
  const target = { uid: 'wolf', alive: true, x: 2.61, z: 0 };
  const input = combatInput(target);
  for (const command of [
    () => combat.engageBasic(target.uid),
    () => combat.queueSkill(target.uid, 0),
    () => { combat.cancelPursuit(); combat.engageBasic(target.uid); },
    () => { combat.targetRemoved(target.uid); combat.queueSkill(target.uid, 0); },
  ]) {
    target.x = 2.61;
    combat.engageBasic(target.uid);
    assert.equal(combat.plan(input).kind, 'approach');
    target.x = 2.4;
    command();
    assert.equal(combat.plan(input).kind, 'attack');
  }
});
