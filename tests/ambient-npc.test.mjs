import assert from 'node:assert/strict';
import test from 'node:test';
import { AmbientNpcBrain } from '../src/world/ambient-npc.ts';

test('ambient resident cycles idle to walk to activity and back to idle', () => {
  const brain = new AmbientNpcBrain([{ x: 2, z: 0, activity: 'work' }]);
  let decision = brain.update(4, { x: 0, z: 0 });
  assert.equal(decision.state, 'walk');
  decision = brain.update(0.1, { x: 2, z: 0 });
  assert.equal(decision.state, 'activity');
  decision = brain.update(5, { x: 2, z: 0 });
  assert.equal(decision.state, 'idle');
});

test('ambient routes advance through authored settlement activities', () => {
  const brain = new AmbientNpcBrain([
    { x: 0, z: 0, activity: 'warm' },
    { x: 4, z: 0, activity: 'trade' },
  ]);
  brain.update(4, { x: 0, z: 0 });
  brain.update(0.1, { x: 0, z: 0 });
  const idle = brain.update(5, { x: 0, z: 0 });
  assert.equal(idle.state, 'idle');
  const walking = brain.update(3, { x: 0, z: 0 });
  assert.equal(walking.state, 'walk');
  assert.equal(walking.waypoint.activity, 'trade');
});
