// Golden input traces from the USER-SUPPLIED browser build, never from native code.
// Node 24: node scripts/reference-gameplay-contract.mjs [--write] [--archive=FILE]
// CI needs the pinned Git object (actions/checkout fetch-depth: 0).
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve, posix } from 'node:path';
import { fileURLToPath } from 'node:url';
import { stripTypeScriptTypes } from 'node:module';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const referenceCommit = '1e94a0d1ad08a4df8959527e40058f5c89b07e9a';
const archiveSha256 = '315e1acd9bf264c6bad2aee34ef100d7726117a128cb192172dde9288b84e254';
const output = resolve(root, 'godot-pc/tests/reference-control-traces.json');
const args = process.argv.slice(2);
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const archive = args.find(arg => arg.startsWith('--archive='))?.slice(10);
if (archive) assert.equal(sha(readFileSync(resolve(archive))), archiveSha256, 'Uploaded archive identity');

const sources = new Map();
function readReference(path) {
  if (!sources.has(path)) sources.set(path, execFileSync('git', ['show', `${referenceCommit}:${path}`], { cwd: root, maxBuffer: 32 * 1024 * 1024 }));
  return sources.get(path).toString('utf8');
}
// Camera/animation algorithms execute unchanged. These small engine ports only
// store vectors and clip samples; they do not render, animate bones or assert GUI QA.
const engineStub = `
export class Vector3 {
  constructor(x=0,y=0,z=0){this.set(x,y,z)}
  set(x,y,z){this.x=x;this.y=y;this.z=z;return this}
  copyFrom(v){return this.set(v.x,v.y,v.z)}
}
export class ArcRotateCamera {}
export class AnimationGroup {}
export class TransformNode {}
`;
const dataUrl = text => `data:text/javascript;base64,${Buffer.from(text).toString('base64')}`;
const compiled = new Map();
function compileReference(path) {
  if (compiled.has(path)) return compiled.get(path);
  let code = stripTypeScriptTypes(readReference(path), { mode: 'strip' });
  code = code.replace(/\bfrom\s+(['"])([^'"]+)\1/g, (whole, quote, specifier) => {
    if (specifier === '@babylonjs/core') return `from '${dataUrl(engineStub)}'`;
    assert.ok(specifier.startsWith('.'), `Unexpected external dependency: ${specifier}`);
    let next = posix.normalize(posix.join(posix.dirname(path), specifier));
    if (!next.endsWith('.ts')) next += '.ts';
    return `from '${compileReference(next)}'`;
  });
  const result = dataUrl(code);
  compiled.set(path, result);
  return result;
}
const load = path => import(compileReference(path));
const { CharacterMotor, smoothAngle } = await load('src/controls/character-motor.ts');
const { SimulationClock } = await load('src/core/simulation-clock.ts');
const { CombatControl } = await load('src/controls/combat-controller.ts');
const { PlayerInputController, movementAxesFromPressed } = await load('src/controls/input-controller.ts');
const { ThirdPersonCameraController, THIRD_PERSON_CAMERA_LIMITS, cameraRelativeDirection } = await load('src/controls/third-person-camera.ts');
const { ActorAnimation } = await load('src/rendering/actor-animation.ts');
const { AttackTimeline } = await load('src/combat/attack-timeline.ts');
const { MonsterAiBrain } = await load('src/world/monster-ai.ts');
const rules = await load('src/core/game-rules.ts');
const { CLASSES } = await load('src/data/game-data.ts');
const { Vector3 } = await import(dataUrl(engineStub));
const main = readReference('src/main.ts');

function round(value) { return typeof value === 'number' ? Math.round(value * 1e10) / 1e10 : value; }
const row = values => values.map(round);
const classes = Object.entries(CLASSES).map(([id, definition]) => ({ id, model: definition.model,
  speed: rules.classCombatProfile(id, 1, definition.stats).movementSpeed,
  interval: rules.classCombatProfile(id, 1, definition.stats).attackInterval,
  range: rules.classAttackRange(id), ranged: definition.ranged }));
const dt = new SimulationClock().step;

// Input order remains observable even when down/up both arrive before a frame.
globalThis.HTMLElement = class {};
const listeners = new Map();
const canvas = { addEventListener() {}, removeEventListener() {}, setPointerCapture() {}, hasPointerCapture() { return false; } };
const windowTarget = { addEventListener(name, fn) { listeners.set(name, fn); }, removeEventListener() {} };
const input = new PlayerInputController(canvas, windowTarget);
const key = (code, repeat = false) => ({ code, repeat, target: null, preventDefault() {} });
listeners.get('keydown')(key('KeyW'));
listeners.get('keyup')(key('KeyW'));
const tapBeforeTick = { axes: input.movementAxes(), movementStart: input.consumeMovementStart(), repeatedRead: input.consumeMovementStart() };
listeners.get('keydown')(key('KeyW'));
listeners.get('blur')();
listeners.get('keydown')(key('KeyW', true));
const repeatAfterBlur = input.movementAxes();
input.dispose();
assert.equal(tapBeforeTick.movementStart, true);
assert.equal(tapBeforeTick.repeatedRead, false);
assert.deepEqual(repeatAfterBlur, { forward: 0, strafe: 0 });

function motorTrace(name, segments, jumpTicks = [], airJumpTicks = []) {
  const motor = new CharacterMotor();
  let x = 0, z = 0, yaw = 0, tick = 0;
  const rows = [], requests = [];
  for (const segment of segments) for (let index = 0; index < segment.ticks; index++, tick++) {
    if (jumpTicks.includes(tick) || airJumpTicks.includes(tick)) requests.push({ tick, accepted: motor.requestJump() });
    const result = motor.step(segment.direction, segment.speed ?? classes[0].speed, dt);
    x += result.dx; z += result.dz;
    if (Math.hypot(result.dx, result.dz) > .001) yaw = smoothAngle(yaw, Math.atan2(result.facingX, result.facingZ), 16, dt);
    rows.push(row([tick + 1, x, z, result.height, result.dx, result.dz, result.grounded, result.moving, yaw]));
  }
  return { name, segments, jump_ticks: jumpTicks, air_jump_attempt_ticks: airJumpTicks, requests, rows };
}
const movement = [
  motorTrace('forward_acceleration_then_natural_release', [{ ticks: 60, direction: { x: 0, z: 1 } }, { ticks: 30, direction: { x: 0, z: 0 } }]),
  motorTrace('reverse_then_strafe_then_diagonal', [{ ticks: 30, direction: { x: 0, z: 1 } }, { ticks: 30, direction: { x: 0, z: -1 } },
    { ticks: 30, direction: { x: 1, z: 0 } }, { ticks: 30, direction: { x: 1, z: 1 } }]),
  motorTrace('stationary_jump_and_rejected_air_presses', [{ ticks: 60, direction: { x: 0, z: 0 } }], [0], [1, 5, 10, 20, 30, 40]),
  motorTrace('running_jump', [{ ticks: 20, direction: { x: 0, z: 1 } }, { ticks: 60, direction: { x: 0, z: 1 } }], [20]),
];
const movementByClass = classes.map(profile => ({ class_id: profile.id, traces: movement.map(trace =>
  motorTrace(trace.name, trace.segments.map(segment => ({ ...segment, speed: profile.speed })), trace.jump_ticks, trace.air_jump_attempt_ticks)) }));
const repeatedJumps = [];
const consecutiveJumpMotor = new CharacterMotor();
for (let jump = 0; jump < 20; jump++) {
  const motor = consecutiveJumpMotor;
  assert.equal(motor.requestJump(), true);
  let peak = 0, ticks = 0, midairRejected = true;
  do {
    midairRejected &&= !motor.requestJump();
    const pose = motor.step({ x: 0, z: 0 }, classes[0].speed, dt);
    peak = Math.max(peak, pose.height); ticks++;
    assert.ok(ticks < 120, 'Reference jump must land');
  } while (!motor.grounded);
  repeatedJumps.push({ jump: jump + 1, ticks, peak: round(peak), all_air_presses_rejected: midairRejected });
}

// Reproduce old main's fixed-step previous/current presentation, not a new formula.
const fpsTracesFor = profile => [30, 60, 144].map(fps => {
  const clock = new SimulationClock(), motor = new CharacterMotor();
  let x = 0, z = 0, previousX = 0, previousZ = 0, ticks = 0;
  const rows = [];
  for (let frame = 1; frame <= fps; frame++) {
    const steps = clock.advance(1 / fps, step => {
      previousX = x; previousZ = z; ticks++;
      const movement = motor.step({ x: 1, z: 1 }, profile.speed, step);
      x += movement.dx; z += movement.dz;
    });
    rows.push(row([frame, steps, ticks, clock.alpha, previousX + (x - previousX) * clock.alpha, previousZ + (z - previousZ) * clock.alpha]));
  }
  return { fps, authoritative_final: row([x, z]), rows };
});
const fpsByClass = classes.map(profile => ({ class_id: profile.id, traces: fpsTracesFor(profile) }));
const fpsTraces = fpsByClass[0].traces;
for (const trace of fpsTraces) assert.deepEqual(trace.authoritative_final, fpsTraces[0].authoritative_final);
for (const profile of fpsByClass) for (const trace of profile.traces) assert.deepEqual(trace.authoritative_final, profile.traces[0].authoritative_final);

function makeCamera() {
  const camera = { target: new Vector3() };
  const control = new ThirdPersonCameraController(camera);
  control.snap({ x: 0, y: 0, z: 0 });
  return { camera, control };
}
const cameraCases = [];
for (const operation of [ 'right_drag', 'down_drag', 'wheel_out', 'follow_running_player', 'stationary_jump_ground_pivot' ]) {
  const { camera, control } = makeCamera();
  if (operation === 'right_drag') control.orbit({ x: 100, y: 0 });
  if (operation === 'down_drag') control.orbit({ x: 0, y: 100 });
  if (operation === 'wheel_out') control.zoom(100);
  const rows = [];
  for (let tick = 1; tick <= 30; tick++) {
    const player = { x: 0, y: 0, z: operation === 'follow_running_player' ? tick * classes[0].speed * dt : 0 };
    control.update(dt, player);
    const forward = control.movementDirection({ forward: 1, strafe: 0 });
    rows.push(row([tick, camera.alpha, camera.beta, camera.radius, camera.target.x, camera.target.y, camera.target.z, forward.x, forward.z]));
  }
  cameraCases.push({ operation, desired: control.state, rows });
}
const directions = [0, Math.PI / 2, Math.PI, -Math.PI / 2].map(yaw => ({ godot_yaw: yaw,
  forward: cameraRelativeDirection({ forward: 1, strafe: 0 }, yaw - Math.PI / 2),
  right: cameraRelativeDirection({ forward: 0, strafe: 1 }, yaw - Math.PI / 2) }));

const approach = classes.map(profile => {
  const control = new CombatControl(); control.engageBasic('reference-monster');
  const plan = distance => control.plan({ player: { x: 0, z: 0 }, target: { uid: 'reference-monster', alive: true, x: 0, z: distance },
    basicRange: profile.range, skillRange: () => profile.range, canBasicAttack: true, canUseSkill: () => true });
  const cases = [profile.range + 1, profile.range * .95, profile.range * .89, profile.range * .95, profile.range + .01]
    .map(distance => ({ distance: round(distance), decision: plan(distance) }));
  control.cancelPursuit();
  return { class_id: profile.id, cases, after_cancel: plan(profile.range * .8) };
});

const aiDefaults = { dt, alive: true, playerSafe: false, targetAvailable: true,
  playerDistance: 30, homeDistance: 0, atPatrolPoint: false, aggroRadius: 9, leashRadius: 14, attackRange: 1.65 };
function patrolTrace(brain, name, seed, reset = false) {
  if (reset) brain.reset(seed);
  const rows = [];
  for (let tick = 1; tick <= 600; tick++) {
    const atPatrolPoint = tick % 120 === 0;
    const decision = brain.update({ ...aiDefaults, atPatrolPoint });
    rows.push([tick, atPatrolPoint, decision.state, decision.intent, decision.changed]);
  }
  return { name, seed, uses_reset: reset, defaults: aiDefaults, rows };
}
const patrolBrain = new MonsterAiBrain(4);
const monsterAiTraces = [patrolTrace(patrolBrain, 'seed4_idle_patrol_600_ticks', 4),
  patrolTrace(patrolBrain, 'reset_seed7_idle_patrol_600_ticks', 7, true)];
const engagedBrain = new MonsterAiBrain(4);
const engagedSamples = [[30, 0], [7, 0], [5, 2], [1.65, 3], [1.7, 3], [14, 15], [30, 7], [30, .2]];
const engagedAi = engagedSamples.map(([playerDistance, homeDistance]) => ({ input: { ...aiDefaults, playerDistance, homeDistance },
  expected: engagedBrain.update({ ...aiDefaults, playerDistance, homeDistance }) }));

function clipGroups(model) {
  const path = model === 'Warrior' ? 'public/assets/models/reference/Knight_Reference.gltf'
    : model === 'Fox' ? 'public/assets/models/reference/Grey_Wolf_Reference.gltf' : `public/assets/models/characters/${model}.gltf`;
  const gltf = JSON.parse(readReference(path));
  return gltf.animations.map(animation => {
    const inputs = animation.samplers.map(sampler => gltf.accessors[sampler.input]);
    assert.ok(inputs.every(accessor => accessor.min && accessor.max), 'Shipped glTF time accessor bounds are required');
    const from = Math.min(...inputs.map(accessor => accessor.min[0])) * 60;
    const to = Math.max(...inputs.map(accessor => accessor.max[0])) * 60;
    return { name: animation.name, from, to, targetedAnimations: [{ animation: { framePerSecond: 60 } }],
      isStarted: false, stop() { this.isStarted = false; }, start() { this.isStarted = true; }, pause() {}, goToFrame(frame) { this.sample = frame; } };
  });
}
const attacks = [...classes, { id: 'wolf', model: 'Fox', ranged: false, interval: Infinity }].map(profile => {
  const groups = clipGroups(profile.model);
  const pose = { position: new Vector3(), rotation: new Vector3(), setPivotPoint() {} };
  const animation = new ActorAnimation(profile.model, profile.id === 'wolf' ? 1.9 : 2.05, groups, pose, 1, profile.id !== 'wolf');
  const timings = animation.beginAttack(profile.interval * .92);
  const timeline = new AttackTimeline(timings), rows = [];
  let releaseTick = null;
  for (let tick = 1; tick < 120; tick++) {
    animation.advance(dt, 0); animation.render();
    const events = timeline.tick(dt);
    if (events.includes('impact')) releaseTick = tick;
    rows.push({ tick, phase: round(animation.phase), clip: animation.clip, events });
    if (events.includes('complete')) break;
  }
  const flightDuration = Number(main.match(/const duration = type === 'slash' \? 0\.18 : ([0-9.]+);/)?.[1]);
  assert.ok(Number.isFinite(flightDuration));
  return { class_id: profile.id, timings, release_tick: releaseTick,
    projectile_duration: profile.ranged ? flightDuration : 0, rows };
});

const fov = Number(main.match(/fog: 1, fov: ([0-9.]+)/)?.[1]);
assert.equal(fov, .82);
const fixture = {
  schema: 1,
  reference: { commit: referenceCommit, archive_name: 'Varendor_Visual_G_Windows_Test_1e94a0d1(1).zip', archive_sha256: archiveSha256,
    source_sha256: Object.fromEntries([...sources].sort(([a], [b]) => a.localeCompare(b)).map(([path, bytes]) => [path, sha(bytes)])),
    method: 'Execute pinned browser TypeScript. Engine vector/clip storage is stubbed; timings come from pinned shipped glTF. No native controller is imported.',
    scope: 'Numerical behavior only. Not evidence for OS mouse capture, collisions in the current world, real bone poses, GUI rendering or target-PC FPS.',
    intentional_safety_exceptions: ['Do not restore full motor reset on ordinary cancel while airborne.', 'Do not collapse blocked ranged attack distance to 0.1.',
      'Keep authoritative server, saved data and current Godot world/assets. The old gateway only logged local commands.'] },
  simulation: { step_seconds: dt, rate_hz: 1 / dt, source: 'src/core/simulation-clock.ts',
    presentation: 'previous + (current - previous) * clock.alpha; one physics tick of interpolation, no network buffer in the browser reference' },
  classes,
  input: { tap_before_tick: tapBeforeTick, repeat_after_blur: repeatAfterBlur,
    diagonal_axes: movementAxesFromPressed(new Set(['KeyW', 'KeyD'])),
    browser_rmb: 'Pointer capture; movementX/Y accumulated per render. No Pointer Lock, hidden cursor or OS warp.' },
  movement: { columns: ['tick', 'x', 'z', 'height', 'dx', 'dz', 'grounded', 'moving', 'yaw'], traces: movement, class_traces: movementByClass, repeated_jumps: repeatedJumps },
  render_fps: { columns: ['frame', 'physics_steps', 'total_ticks', 'alpha', 'render_x', 'render_z'], traces: fpsTraces, class_traces: fpsByClass },
  camera: { browser_limits: THIRD_PERSON_CAMERA_LIMITS, browser_default: makeCamera().control.state, vertical_fov_radians: fov,
    godot_mapping: { yaw: 'browser.alpha + PI/2', pitch: 'PI/2 - browser.beta', position_z: '-browser.z' },
    columns: ['tick', 'alpha', 'beta', 'radius', 'focus_x', 'focus_y', 'focus_z', 'movement_forward_x', 'movement_forward_z'],
    traces: cameraCases, movement_directions: directions },
  combat_approach: approach,
  monster_ai: { columns: ['tick', 'at_patrol_point', 'state', 'intent', 'changed'], traces: monsterAiTraces,
    engagement_and_return: engagedAi, safety_exception: 'Native lifecycle and target identity guards intentionally remain; the old !alive branch regressed corpse state to dead.' },
  attacks,
};
// Keep each numerical table row on one line: readable traces without nearly a
// megabyte of indentation in the exported test fixture and Git history.
const pretty = JSON.stringify(fixture, (_, value) => typeof value === 'number' ? round(value) : value, 2);
const bytes = pretty.replace(/\[\n([^\[\]{}]*?)\n\s*\]/g, match => {
  try {
    const values = JSON.parse(match);
    if (values.every(value => value === null || typeof value !== 'object')) return JSON.stringify(values);
  } catch {}
  return match;
}) + '\n';
if (args.includes('--write')) { mkdirSync(dirname(output), { recursive: true }); writeFileSync(output, bytes); }
else assert.deepEqual(JSON.parse(readFileSync(output, 'utf8')), JSON.parse(bytes), 'Committed fixture must reproduce from exact user reference Git source');
console.log(JSON.stringify({ ok: true, source_commit: referenceCommit, archive_verified: Boolean(archive),
  source_files: sources.size, movement_scenarios: movement.length, repeated_jumps: repeatedJumps.length,
  fps_scenarios: fpsTraces.length, camera_scenarios: cameraCases.length, class_approach_scenarios: approach.length,
  real_clip_timing_scenarios: attacks.length, fixture_sha256: sha(bytes), output: 'godot-pc/tests/reference-control-traces.json' }, null, 2));
