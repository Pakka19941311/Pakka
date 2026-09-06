import assert from 'node:assert/strict';
import test from 'node:test';
import { SimulationClock } from '../src/core/simulation-clock.ts';
import { CharacterMotor } from '../src/controls/character-motor.ts';
import { FrameTelemetry, renderScaling, ResolutionGovernor, effectiveRenderBudget } from '../src/rendering/frame-budget.ts';
import { CollisionWorld } from '../src/world/collision-world.ts';

test('movement covers equal distance at 60 FPS, 20 FPS and 4 FPS instead of slow motion', () => {
  const distance = fps => {
    const clock = new SimulationClock(); const motor = new CharacterMotor(); let x = 0;
    for (let i = 0; i < fps * 3; i++) clock.advance(1 / fps, dt => { x += motor.step({ x: 1, z: 0 }, 6, dt).dx; });
    return x;
  };
  assert.ok(Math.abs(distance(60) - distance(4)) < 1e-8);
  assert.ok(Math.abs(distance(60) - distance(20)) < 1e-8);
});

test('clock bounds pathological stalls, clears fractional debt and stops when gameplay pauses', () => {
  const clock = new SimulationClock(); let ticks = 0;
  assert.equal(clock.advance(300, () => { ticks++; }), 30);
  assert.equal(clock.droppedSeconds, 299.5);
  clock.advance(0.01, () => {}); clock.reset();
  assert.equal(clock.advance(0.01, () => {}), 0);
  assert.equal(clock.advance(0.5, () => false), 1);
  assert.equal(clock.advance(NaN, () => {}), 0);
});

test('high resolution displays respect pixel budgets; requested scaling remains effective', () => {
  for (const [quality, budget] of Object.entries({ low: 921600, medium: 1440000, high: 2073600, ultra: 3686400 })) {
    const scaling = renderScaling(3294, 1862, 2, quality, 1);
    assert.ok(3294 * 1862 / scaling ** 2 <= budget + 1);
  }
  assert.ok(renderScaling(1920, 1080, 1, 'high', 0.75) > renderScaling(1920, 1080, 1, 'high', 1));
  assert.ok(Number.isFinite(renderScaling(0, 0, 0, 'missing', NaN)));
});

test('resolution governor adapts slowly, stays bounded and recovers with hysteresis', () => {
  const governor = new ResolutionGovernor();
  for (let i = 0; i < 1000; i++) governor.sample(0.05);
  assert.equal(governor.scale, 0.65);
  for (let i = 0; i < 400; i++) governor.sample(1 / 60);
  assert.ok(governor.scale > 0.65 && governor.scale < 0.8);
  governor.reset(); assert.equal(governor.scale, 1);
});

test('sustained overload also sheds MSAA, large shadows and bloom, with slow recovery', () => {
  const governor = new ResolutionGovernor();
  assert.deepEqual(effectiveRenderBudget('ultra', 'ultra', true, true, governor.detailStep), { shadowSize: 4096, samples: 4, bloom: true });
  for (let i = 0; i < 42; i++) governor.sample(0.1);
  assert.equal(governor.detailStep, 2);
  assert.deepEqual(effectiveRenderBudget('ultra', 'ultra', true, true, governor.detailStep), { shadowSize: 1024, samples: 1, bloom: false });
  for (let i = 0; i < 120; i++) governor.sample(1 / 60);
  assert.equal(governor.detailStep, 2, 'brief recovery must not oscillate render-target allocations');
  governor.reset(); assert.equal(governor.detailStep, 0);
});

test('severe overload uses one resize instead of repeatedly reallocating the drawing buffer', () => {
  const governor = new ResolutionGovernor(); let changes = 0;
  for (let i = 0; i < 200; i++) if (governor.sample(0.1)) changes++;
  assert.equal(changes, 1);
  assert.equal(governor.scale, 0.65); assert.equal(governor.detailStep, 2);
});

test('telemetry ring stays bounded and includes tail stalls, not only average FPS', () => {
  const telemetry = new FrameTelemetry();
  for (let i = 0; i < 1000; i++) telemetry.record(i % 10 ? 16 : 250, 2, 5);
  const result = telemetry.snapshot();
  assert.equal(result.samples, 600); assert.equal(result.p95Ms, 250);
  assert.equal(result.longFrames, 60); assert.equal(result.simulationMs, 2);
  assert.equal(result.renderSubmissionMs, 5);
});

test('spatial collision agrees with brute force for rotated boxes, circles and negative cell boundaries', () => {
  const world = new CollisionWorld(); const obstacles = [];
  let seed = 4; const random = () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 2 ** 32);
  for (let i = 0; i < 250; i++) {
    const x = random() * 300 - 150; const z = random() * 300 - 150;
    const r = 0.1 + random() * 7; const h = 0.1 + random() * 4; const angle = random() * 6.28;
    if (i % 2) { world.addCircle(x, z, r); obstacles.push(p => Math.hypot(p.x - x, p.z - z) < r + p.radius); }
    else {
      world.addBox(x, z, r, h, angle);
      obstacles.push(p => {
        const dx = p.x - x; const dz = p.z - z;
        const lx = dx * Math.cos(angle) - dz * Math.sin(angle);
        const lz = dx * Math.sin(angle) + dz * Math.cos(angle);
        return Math.hypot(lx - Math.max(-r, Math.min(r, lx)), lz - Math.max(-h, Math.min(h, lz))) < p.radius;
      });
    }
  }
  for (let i = 0; i < 3000; i++) {
    const point = { x: random() * 340 - 170, z: random() * 340 - 170, radius: 0.1 + random() * 2 };
    assert.equal(world.isBlocked(point, point.radius), obstacles.some(overlap => overlap(point)));
  }
  assert.ok(world.candidateChecks < 3000 * 250 / 10, `unexpected collision work: ${world.candidateChecks}`);
  world.clear(); assert.equal(world.size, 0); assert.equal(world.isBlocked({ x: 0, z: 0 }, 1), false);
});
