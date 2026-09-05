import assert from 'node:assert/strict';
import test from 'node:test';
import { NullEngine, Scene, Animation, AnimationGroup, TransformNode } from '@babylonjs/core';
import { ActorAnimation } from '../src/rendering/actor-animation.ts';
import { slidePastActor } from '../src/controls/actor-spacing.ts';
import { CollisionWorld } from '../src/world/collision-world.ts';

test('actor contact stops a swept crossing, slides and lets embedded actors escape', () => {
  const center = { x: 0, z: 0 };
  const headOn = slidePastActor({ x: -3, z: 0 }, { x: 6, z: 0 }, center, 1);
  assert.ok(headOn.x < 2.001 && headOn.x > 1.9);
  const tangent = slidePastActor({ x: -1, z: 0 }, { x: 1, z: 1 }, center, 1);
  assert.deepEqual(tangent, { x: 0, z: 1 });
  assert.deepEqual(slidePastActor({ x: -0.5, z: 0 }, { x: -1, z: 0 }, center, 1), { x: -1, z: 0 });
  assert.deepEqual(slidePastActor(center, { x: 1, z: 0 }, center, 1), { x: 1, z: 0 });
});

test('camera sweep respects wall/trunk heights and rotated boxes', () => {
  const world = new CollisionWorld();
  world.addBox(0, 5, 3, 0.5, 0, 0, 3);
  assert.ok(world.cameraDistance({ x: 0, y: 2, z: 0 }, { x: 0, y: 2, z: 10 }) < 4.5);
  assert.equal(world.cameraDistance({ x: 0, y: 4, z: 0 }, { x: 0, y: 4, z: 10 }), 10);
  world.clear(); world.addBox(0, 5, 3, 0.5, Math.PI / 2, 0, 6);
  assert.ok(world.cameraDistance({ x: 0, y: 2, z: 0 }, { x: 0, y: 2, z: 10 }) < 2);
  world.clear(); world.addCircle(0, 5, 0.4, 0, 8);
  assert.ok(world.cameraDistance({ x: 0, y: 3, z: 0 }, { x: 0, y: 3, z: 10 }) < 4.6);
  assert.equal(world.cameraDistance({ x: 2, y: 3, z: 0 }, { x: 2, y: 3, z: 10 }), 10);
});

function fixture(names, model = 'Warrior') {
  const engine = new NullEngine(); const scene = new Scene(engine);
  const bone = new TransformNode('joint', scene), pose = new TransformNode('pose', scene);
  const groups = names.map(name => {
    const a = new Animation(name, 'position.x', 60, Animation.ANIMATIONTYPE_FLOAT);
    a.setKeys([{ frame: 0, value: 0 }, { frame: 60, value: 1 }]);
    const group = new AnimationGroup(`actor-${name}`, scene); group.addTargetedAnimation(a, bone); return group;
  });
  return { actor: new ActorAnimation(model, 2.05, groups, pose, 1, true), bone, pose,
    dispose: () => { scene.dispose(); engine.dispose(); } };
}

test('foot phase follows actual travel and clip evaluation stays once per rendered frame', () => {
  const f = fixture(['Idle', 'Walk', 'Run_Weapon', 'Sword_Attack', 'Death']);
  try {
    const a = f.actor; a.request('walk'); a.advance(0.1, 0.1); a.render();
    const phase = a.phase, starts = a.starts;
    for (let i = 0; i < 30; i++) a.advance(1 / 60, 0);
    a.render(); assert.equal(a.phase, phase); assert.equal(a.starts, starts); assert.equal(a.activeGroups, 1);
    a.advance(0.1, 0.2); a.render(); assert.ok(a.phase > phase);
    a.setVisible(false); assert.equal(a.activeGroups, 0);
    a.setVisible(true); a.render(); assert.equal(a.activeGroups, 1);
    const timing = a.beginAttack(); a.advance(timing.windup); a.render();
    assert.match(a.clip, /Sword_Attack/); assert.ok(Math.abs(a.phase - 0.5) < 0.001);
    a.request('death'); a.advance(3); a.render(); a.request('walk');
    assert.equal(a.action, 'death'); assert.equal(a.phase, 1);
  } finally { f.dispose(); }
});

test('Fox uses explicit attack/death presentation without walking during a hit or resurrecting', () => {
  const f = fixture(['Survey', 'Walk', 'Run'], 'Fox');
  try {
    const a = f.actor; a.beginAttack(); a.advance(0.3); a.render();
    assert.match(a.clip, /Survey/); assert.ok(Math.abs(f.pose.rotation.x) > 0.05);
    a.request('death'); a.advance(1); a.render();
    assert.match(a.clip, /Survey/); assert.ok(f.pose.rotation.z > 1.4); assert.equal(a.phase, 1);
  } finally { f.dispose(); }
});

test('a movement tap between frames preserves the combat-cancel command edge', async () => {
  const { PlayerInputController } = await import('../src/controls/input-controller.ts');
  const previous = globalThis.HTMLElement;
  globalThis.HTMLElement = class {};
  const canvas = new EventTarget(), windowTarget = new EventTarget();
  const input = new PlayerInputController(canvas, windowTarget);
  try {
    for (const type of ['keydown', 'keyup']) {
      const event = new Event(type, { cancelable: true });
      Object.defineProperty(event, 'code', { value: 'KeyS' }); windowTarget.dispatchEvent(event);
    }
    assert.deepEqual(input.movementAxes(), { forward: 0, strafe: 0 });
    assert.equal(input.consumeMovementStart(), true);
    assert.equal(input.consumeMovementStart(), false);
  } finally { input.dispose(); if (previous) globalThis.HTMLElement = previous; else delete globalThis.HTMLElement; }
});
