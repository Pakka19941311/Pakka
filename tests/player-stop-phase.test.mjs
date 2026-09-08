import test from 'node:test';
import assert from 'node:assert/strict';
import { CharacterMotor } from '../src/controls/character-motor.ts';

const TICK = 1 / 60;
const SPEED = 5.89;
const EPSILON = 1e-10;
const PRESS_AT = 0.219;
const DURATIONS = [0.171, 0.733, 1.237];

// Both motors receive the same held/released state at the same wall times.
// Only the phase of their independent fixed 60 Hz simulation lattices differs.
// There is no network latency, injected position error or render smoothing in
// this derivation. Non-integral pulse durations expose receipt quantization.
function runLattice(phase, direction, duration) {
  const motor = new CharacterMotor();
  const releaseAt = PRESS_AT + duration;
  const endAt = releaseAt + 0.3;
  const position = { x: 0, z: 0 };
  let movingTicks = 0;
  let stoppedTicks = 0;
  let lastMovingStep = { x: 0, z: 0 };
  for (let tick = 0; phase + tick * TICK <= endAt + EPSILON; tick++) {
    const wallTime = phase + tick * TICK;
    const held = wallTime >= PRESS_AT && wallTime < releaseAt;
    const step = motor.step(held ? direction : { x: 0, z: 0 }, SPEED, TICK);
    position.x += step.dx;
    position.z += step.dz;
    if (held) {
      movingTicks++;
      lastMovingStep = { x: step.dx, z: step.dz };
    } else {
      assert.equal(step.dx, 0, 'neutral ticks do not advance x, including first release tick');
      assert.equal(step.dz, 0, 'neutral ticks do not advance z, including first release tick');
      assert.equal(step.moving, false);
      if (wallTime >= releaseAt) stoppedTicks++;
    }
  }
  assert.ok(movingTicks > 0, 'the pulse actually drives the production motor');
  assert.ok(stoppedTicks >= 17, 'measure a settled endpoint, not an in-flight phase');
  return { position, movingTicks, lastMovingStep };
}

for (const [name, direction] of Object.entries({
  x_axis: { x: 1, z: 0 },
  z_axis: { x: 0, z: 1 },
  diagonal: { x: 1, z: 1 },
})) {
  test(`${name}: equal wall-time pulses on phase-shifted 60 Hz motors differ by at most one physical step`, t => {
    let maximumEndpointDifference = 0;
    let unequalEndpoints = 0;
    let cases = 0;
    const samples = [];
    for (const duration of DURATIONS) {
      let pulseMaximum = 0;
      for (let phaseIndex = 0; phaseIndex < 16; phaseIndex++) {
        const phase = TICK * phaseIndex / 16;
        // Construct TWO real motors for every case. No baseline position is
        // supplied as expected output and no synthetic offset is applied.
        const first = runLattice(0, direction, duration);
        const second = runLattice(phase, direction, duration);
        const difference = Math.hypot(
          first.position.x - second.position.x,
          first.position.z - second.position.z,
        );
        const tickDifference = Math.abs(first.movingTicks - second.movingTicks);
        assert.ok(tickDifference <= 1, `phase ${phaseIndex}: input windows differ by at most one sample`);
        assert.ok(difference <= SPEED * TICK + EPSILON, `phase ${phaseIndex}: ${difference} exceeds ${SPEED * TICK}`);
        if (tickDifference === 0) assert.ok(difference <= EPSILON);
        else {
          unequalEndpoints++;
          const longer = first.movingTicks > second.movingTicks ? first : second;
          const actualExtraStep = Math.hypot(longer.lastMovingStep.x, longer.lastMovingStep.z);
          assert.ok(Math.abs(difference - actualExtraStep) <= EPSILON,
            'endpoint difference is exactly the extra production motor step, not a guessed correction');
        }
        maximumEndpointDifference = Math.max(maximumEndpointDifference, difference);
        pulseMaximum = Math.max(pulseMaximum, difference);
        cases++;
      }
      samples.push({ pulse_seconds: duration, maximum_endpoint_difference_m: pulseMaximum });
    }
    assert.equal(cases, 48);
    assert.ok(unequalEndpoints > 0, 'phase sweep must reproduce a real quantization discrepancy');
    assert.ok(maximumEndpointDifference > SPEED * TICK * 0.99, 'include an almost-full-speed release discrepancy');
    t.diagnostic('VARENDOR_STOP_PHASE ' + JSON.stringify({
      direction: name, cases, unequal_endpoints: unequalEndpoints,
      phase_steps: 16, tick_hz: 60, speed_mps: SPEED, network_delay_ms: 0,
      maximum_endpoint_difference_m: maximumEndpointDifference,
      one_tick_budget_m: SPEED * TICK, samples,
    }));
  });
}

// A scalar one-step bound is NOT universal for a sequence with turns. Moving
// input can be sampled once more on one axis and once less on another axis.
// Derive the counterexamples instead of widening the presentation allowance.
function runTurnedLattice(phase, forwardSeconds, strafeSeconds) {
  const motor = new CharacterMotor();
  const turnAt = PRESS_AT + forwardSeconds;
  const releaseAt = turnAt + strafeSeconds;
  const position = { x: 0, z: 0 };
  const movingTicks = [0, 0];
  let stoppedTicks = 0;
  for (let tick = 0; phase + tick * TICK <= releaseAt + 0.3 + EPSILON; tick++) {
    const wallTime = phase + tick * TICK;
    const segment = wallTime >= PRESS_AT && wallTime < turnAt ? 0
      : wallTime >= turnAt && wallTime < releaseAt ? 1 : -1;
    const direction = segment === 0 ? { x: 0, z: 1 }
      : segment === 1 ? { x: 1, z: 0 } : { x: 0, z: 0 };
    const step = motor.step(direction, SPEED, TICK);
    assert.ok(Math.hypot(step.dx, step.dz) <= SPEED * TICK + EPSILON,
      'turn acceleration never exceeds the actual motor speed budget');
    position.x += step.dx;
    position.z += step.dz;
    if (segment >= 0) movingTicks[segment]++;
    else {
      assert.equal(step.dx, 0);
      assert.equal(step.dz, 0);
      assert.equal(step.moving, false);
      if (wallTime >= releaseAt) stoppedTicks++;
    }
  }
  assert.ok(movingTicks.every(count => count > 0) && stoppedTicks >= 17);
  return { position, movingTicks };
}

test('forward → strafe → stop derives multidirectional phase discrepancies without assuming a scalar one-tick endpoint bound', t => {
  let maximum = { error_m: 0 };
  let cases = 0;
  let largerThanOneTick = 0;
  for (const forwardSeconds of DURATIONS) {
    for (const strafeSeconds of DURATIONS) {
      for (let phaseIndex = 0; phaseIndex < 16; phaseIndex++) {
        const first = runTurnedLattice(0, forwardSeconds, strafeSeconds);
        const second = runTurnedLattice(TICK * phaseIndex / 16, forwardSeconds, strafeSeconds);
        for (let segment = 0; segment < 2; segment++) {
          assert.ok(Math.abs(first.movingTicks[segment] - second.movingTicks[segment]) <= 1,
            'each wall-time direction interval differs by no more than one sampled tick');
        }
        const dx = first.position.x - second.position.x;
        const dz = first.position.z - second.position.z;
        const error = Math.hypot(dx, dz);
        if (phaseIndex === 0) assert.ok(error <= EPSILON, 'identical lattices have identical endpoints');
        if (error > SPEED * TICK + EPSILON) largerThanOneTick++;
        if (error > maximum.error_m) maximum = {
          error_m: error, dx_m: dx, dz_m: dz,
          phase_index: phaseIndex, phase_seconds: TICK * phaseIndex / 16,
          press_at_seconds: PRESS_AT, forward_seconds: forwardSeconds, strafe_seconds: strafeSeconds,
          first_moving_ticks: first.movingTicks, second_moving_ticks: second.movingTicks,
        };
        cases++;
      }
    }
  }
  assert.equal(cases, 144);
  assert.ok(maximum.error_m > 0, 'the phase sweep must actually expose differing sampled input histories');
  t.diagnostic('VARENDOR_STOP_TURN_PHASE ' + JSON.stringify({
    cases, tick_hz: 60, phase_steps: 16, network_delay_ms: 0,
    one_tick_budget_m: SPEED * TICK, cases_exceeding_scalar_one_tick_budget: largerThanOneTick,
    maximum, interpretation: 'Raw endpoints before reconciliation; earlier moving corrections are not included. This does not justify widening the rest-anchor budget.',
  }));
});
