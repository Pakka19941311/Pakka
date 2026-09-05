// Block E. Real production pointer/keyboard path, then narrow deterministic world
// ticks in a separate QA build. No fixture is present in the downloadable game.
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';

const directory = path.resolve(process.argv[2] ?? 'dist-qa');
const production = process.argv[3] === 'production';
const label = production ? 'E-production' : 'E';
const reportDir = path.resolve('qa-artifacts');
await mkdir(reportDir, { recursive: true });
const mime = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json',
  '.gltf': 'model/gltf+json', '.glb': 'model/gltf-binary', '.jpg': 'image/jpeg', '.png': 'image/png',
  '.svg': 'image/svg+xml', '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg' };
const server = createServer(async (request, response) => {
  try {
    const pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
    if (pathname === '/favicon.ico') { response.writeHead(204).end(); return; }
    const file = path.resolve(directory, `.${pathname === '/' ? '/index.html' : pathname}`);
    if (!file.startsWith(`${directory}${path.sep}`)) { response.writeHead(403).end(); return; }
    const bytes = await readFile(file);
    response.writeHead(200, { 'Content-Type': mime[path.extname(file)] ?? 'application/octet-stream' }).end(bytes);
  } catch { response.writeHead(404).end(); }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const browser = await chromium.launch({ executablePath: process.env.BROWSER_EXECUTABLE, headless: true,
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--disable-dev-shm-usage', '--no-sandbox'] });
const report = { block: label, sha: process.env.GITHUB_SHA ?? 'local', browser: browser.version(), passed: false,
  environment: 'Chromium software WebGL; not a hardware FPS benchmark',
  profile: '1280x720; Low / 50% render; production real time, isolated QA narrow fixed world ticks',
  checks: [], errors: [] };
let page;
const check = (name, data = {}) => { report.checks.push({ name, ...data }); console.log('PASS', name); };
const state = () => page.evaluate(() => window.__VARENDOR_QA__.getState());
const snapshot = () => page.evaluate(() => window.__VARENDOR_FIXTURE__.combatSnapshot());
const step = seconds => page.evaluate(s => window.__VARENDOR_FIXTURE__.combatStep(s), seconds);
const aim = (id, engage = true) => page.evaluate(({ id, engage }) => window.__VARENDOR_FIXTURE__.combatAim(id, engage), { id, engage });
const events = (s, kind, skillIndex) => s.events.filter(e => e.kind === kind && e.skillIndex === skillIndex);
const damageTo = (s, id) => s.events.filter(e => e.kind === 'damage' && e.target === id);
const target = (s, id) => s.targets.find(t => t.uid === id);

async function start(classId) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });
  page = await context.newPage(); page.setDefaultTimeout(60000);
  page.on('pageerror', e => report.errors.push(`${classId}: ${e.stack ?? e.message}`));
  page.on('console', m => { if (m.type() === 'error') report.errors.push(`${classId}: ${m.text()}`); });
  page.on('requestfailed', r => report.errors.push(`${classId}: ${r.url()}: ${r.failure()?.errorText}`));
  page.on('response', r => { if (r.status() >= 400 && !r.url().endsWith('/favicon.ico')) report.errors.push(`HTTP ${r.status()} ${r.url()}`); });
  await page.goto(`http://127.0.0.1:${server.address().port}`);
  await page.locator(`[data-class="${classId}"]`).click(); await page.locator('#begin').click();
  await page.waitForFunction(() => window.__VARENDOR_QA__?.getState().started, {}, { timeout: 180000 });
  assert.equal(await page.evaluate(() => typeof window.__VARENDOR_FIXTURE__), production ? 'undefined' : 'object');
  await page.keyboard.press('Escape');
  await page.locator('#quality').selectOption('low');
  await page.locator('#resolution-scale').selectOption('0.5');
  await page.locator('#save-settings').click();
  return context;
}

async function setup(distance, secondDistance) {
  return page.evaluate(options => window.__VARENDOR_FIXTURE__.combatSetup(options), { distance, secondDistance, hp: 10000 });
}

// Evaluate predicates between actual world steps, not between slow software-GPU
// screenshots. Animations/effects/AI/collision all use the same update() path.
async function until(test, maximum = 8) {
  const result = await page.evaluate(({ expression, maximum }) => {
    const f = window.__VARENDOR_FIXTURE__;
    const predicate = new Function('s', `return (${expression})(s)`);
    let s = f.combatSnapshot();
    for (let n = 0; !predicate(s) && n < Math.ceil(maximum * 60); n++) { f.combatStep(1 / 60); s = f.combatSnapshot(); }
    return { matched: Boolean(predicate(s)), state: s };
  }, { expression: test.toString(), maximum });
  assert.ok(result.matched, `simulation condition timed out: ${test}\n${JSON.stringify(result.state)}`);
  return result.state;
}

async function visibleScreenshot(name) {
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  const bytes = await page.screenshot();
  await writeFile(path.join(reportDir, `${name}.png`), bytes);
  const light = await page.evaluate(async encoded => {
    const image = new Image(); image.src = `data:image/png;base64,${encoded}`; await image.decode();
    const canvas = document.createElement('canvas'); canvas.width = 64; canvas.height = 64;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(image, image.width * .35, image.height * .2, image.width * .35, image.height * .5, 0, 0, 64, 64);
    const pixels = ctx.getImageData(0, 0, 64, 64).data;
    let sum = 0; for (let i = 0; i < pixels.length; i += 4) sum += (pixels[i] + pixels[i + 1] + pixels[i + 2]) / 3;
    return sum / (64 * 64);
  }, bytes.toString('base64'));
  assert.ok(light > 15, `rendered world is black: ${light}`);
  check(`visible real scene: ${name}`, { luminance: light });
}

async function productionScenario() {
  const context = await start('knight');
  await visibleScreenshot('E-production-greenfall');
  // Genuine input from the normal spawn through the village gate. Read-only
  // telemetry supplies coordinates; it cannot teleport or prepare a target.
  for (const [key, axis, limit, sign] of [['s', 'z', -30, -1], ['d', 'x', 20, 1], ['w', 'z', -18, 1]]) {
    await page.keyboard.down(key);
    try {
      await page.waitForFunction(({ axis, limit, sign }) => {
        const s = window.__VARENDOR_QA__.getState();
        return s.player[axis] * sign >= limit * sign;
      }, { axis, limit, sign }, { timeout: 180000 });
    } finally { await page.keyboard.up(key); }
  }
  check('production keyboard movement crosses the actual village gate');
  const before = await state();
  const actors = await page.evaluate(() => window.__VARENDOR_QA__.actorTargets());
  const click = actors.filter(t => t.kind === 'monster' && t.alive && t.id === 'wolf'
    && t.depth > 0 && t.depth < 1 && t.screenX > 240 && t.screenX < 1050 && t.screenY > 100 && t.screenY < 550)
    .sort((a, b) => Math.hypot(a.x - before.player.x, a.z - before.player.z) - Math.hypot(b.x - before.player.x, b.z - before.player.z))[0];
  assert.ok(click, `no visible wolf at production route end: ${JSON.stringify({ state: before, actors })}`);
  await page.mouse.click(click.screenX, click.screenY);
  await page.waitForFunction(id => window.__VARENDOR_QA__.getState().selectedTarget === id, click.uid);
  const pursuing = await state();
  assert.equal(pursuing.player.dead, false);
  assert.equal(pursuing.combat.intent.autoAttackTargetId, click.uid);
  // Cancel while the target is still being approached, before skill damage can
  // kill this ordinary wolf and make the cancellation assertion vacuous.
  await page.keyboard.press('s');
  await page.waitForFunction(() => {
    const c = window.__VARENDOR_QA__.getState().combat;
    return !c.attack && !c.intent.autoAttackTargetId && !c.intent.skillIntent && !c.intent.bufferedSkill;
  });
  check('production released movement tap cancels a live explicit pursuit');
  const again = await page.evaluate(id => window.__VARENDOR_QA__.actorTargets().find(t => t.uid === id), click.uid);
  assert.ok(again?.alive, 'target died before the explicit skill command');
  assert.equal((await state()).selectedTarget, click.uid);
  // The selected target survives movement cancellation. Requesting the skill
  // from this idle state avoids racing an unrelated new basic windup.
  await page.keyboard.press('1');
  await page.waitForFunction(() => window.__VARENDOR_QA__.getState().player.cooldowns[0] > 0, {}, { timeout: 120000 });
  await page.waitForFunction(({ id, hp }) => {
    const t = window.__VARENDOR_QA__.actorTargets().find(t => t.uid === id);
    return t && (t.hp < hp || !t.alive);
  }, { id: click.uid, hp: click.hp }, { timeout: 60000 });
  await visibleScreenshot('E-production-combat');
  assert.equal((await state()).player.dead, false);
  check('production real LMB selects and pursues; a single skill command releases and deals damage');
  await context.close();
}

async function classScenarios(classId) {
  const context = await start(classId);
  const first = await setup(undefined, 6);
  const initial = await snapshot();
  assert.ok(Math.hypot(target(initial, first.targetIds[0]).x - initial.player.x, target(initial, first.targetIds[0]).z - initial.player.z) > initial.range);
  // Each real class exercises the actual pick geometry once. Subsequent narrow
  // timing cases use the same selection handler in the isolated fixture.
  await page.evaluate(() => window.__VARENDOR_FIXTURE__.pause(false));
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  const click = await page.evaluate(id => window.__VARENDOR_FIXTURE__.actors().find(t => t.uid === id), first.targetIds[0]);
  assert.ok(click.depth > 0 && click.depth < 1 && click.screenY > 0 && click.screenY < 600, JSON.stringify(click));
  await page.mouse.click(click.screenX, click.screenY);
  await page.waitForFunction(id => window.__VARENDOR_QA__.getState().selectedTarget === id, click.uid);
  // Real picking is now established. Restore the controlled approach distance
  // before timing assertions: CDP latency must not decide whether basic windup
  // already started before the skill key reaches the page.
  await setup(undefined, 6);
  await aim(first.targetIds[0]);
  await page.keyboard.press('1');
  let s = await until(s => s.events.some(e => e.kind === 'release' && e.skillIndex === 0), 12);
  const released = events(s, 'release', 0)[0];
  assert.equal(events(s, 'release', 0).length, 1);
  const [cost, cooldown] = { knight: [12, 5], ranger: [18, 4], mage: [22, 3.5] }[classId];
  assert.ok(Math.abs(released.mpBefore - released.mpAfter - cost) < 1e-8, JSON.stringify(released));
  assert.equal(released.cooldownAfter, cooldown);
  if (classId === 'knight') assert.ok(damageTo(s, click.uid).some(e => e.time === released.time), 'sword damage was delayed after its real contact');
  await step(6);
  s = await snapshot();
  assert.equal(events(s, 'release', 0).length, 1, 'one command repeated the skill');
  assert.ok(events(s, 'release', null).length >= 1, 'explicit basic target did not resume after skill');
  assert.ok(target(s, click.uid).hp < target(initial, click.uid).hp);
  check(`${classId}: real click, approach, one skill release, one resource charge, explicit autoattack resumes`, { release: released });
  await writeFile(path.join(reportDir, `E-${classId}-approach-events.json`), JSON.stringify(s.events, null, 2));
  await visibleScreenshot(`E-${classId}-combat`);

  // Merely selecting a target and using a skill never invents basic autoattack.
  const noAuto = await setup(2.6);
  await aim(noAuto.targetIds[0], false); await page.keyboard.press('1'); await step(7);
  s = await snapshot();
  assert.equal(events(s, 'release', 0).length, 1);
  assert.equal(events(s, 'release', null).length, 0);
  check(`${classId}: a skill without explicit basic intent does not create autoattack`);

  // A complete down/up edge occurs while rendering is frozen, then one real
  // simulation update consumes it: catches between-frame short-press loss.
  const cancelled = await setup(2.6);
  await aim(cancelled.targetIds[0], false); await page.keyboard.press('1');
  const windup = await until(s => s.attack?.skillIndex === 0 && !s.attack.impacted);
  assert.equal(windup.player.cooldowns[0], 0);
  assert.equal(windup.player.mp, windup.player.maxMp);
  await page.keyboard.press('w'); await step(1 / 60);
  s = await snapshot();
  assert.equal(s.attack, null); assert.equal(s.intent.skillIntent, null); assert.equal(s.intent.bufferedSkill, null);
  assert.ok(s.player.attackCd >= Math.max(0, windup.player.attackCd - 1 / 60) - 1e-6, 'cancel shortened the basic attack interval');
  await step(2); s = await snapshot();
  assert.equal(events(s, 'release', 0).length, 0); assert.equal(s.player.cooldowns[0], 0); assert.equal(s.player.mp, s.player.maxMp);
  assert.equal(s.intent.autoAttackTargetId, null);
  check(`${classId}: a between-frame movement tap cancels pre-release skill without MP/CD charge or old pursuit revival`);

  const switched = await setup(2.6, 3.5);
  await aim(switched.targetIds[0], false); await page.keyboard.press('1');
  await until(s => s.attack?.skillIndex === 0 && !s.attack.impacted);
  await aim(switched.targetIds[1]); await step(2);
  s = await snapshot();
  assert.equal(events(s, 'release', 0).length, 0); assert.equal(s.player.cooldowns[0], 0);
  assert.equal(target(s, switched.targetIds[0]).hp, 10000);
  assert.equal(s.selectedTarget, switched.targetIds[1]);
  check(`${classId}: target switch cancels old unreleased skill and keeps its target unharmed`);

  // Early presses cannot become a hidden long queue. During the final 350 ms,
  // the latest valid key replaces the one slot. An invalid key cannot replace it.
  const buffered = await setup(2.6);
  await aim(buffered.targetIds[0], false); await page.keyboard.press('1');
  const early = await until(s => s.attack?.skillIndex === 0 && !s.attack.impacted);
  assert.ok(early.attack.remaining > .35, 'test requires a genuinely early action phase');
  await page.keyboard.press('2');
  assert.equal((await snapshot()).intent.bufferedSkill, null);
  const late = await until(s => s.attack?.skillIndex === 0 && s.attack.impacted && s.attack.remaining <= .30 && s.attack.remaining > .02);
  await page.keyboard.press('2'); await page.keyboard.press('3');
  const queued = await snapshot();
  assert.equal(queued.intent.bufferedSkill?.skillIndex, 2);
  await page.evaluate(() => { const f = window.__VARENDOR_FIXTURE__; const cd = f.combatSnapshot().player.cooldowns; cd[1] = 10; f.cooldowns(cd); });
  await page.keyboard.press('2'); assert.equal((await snapshot()).intent.bufferedSkill?.skillIndex, 2);
  await step(2); s = await snapshot();
  assert.equal(events(s, 'release', 1).length, 0); assert.equal(events(s, 'release', 2).length, 1);
  const bufferedBegin = events(s, 'begin', 2)[0];
  assert.ok(bufferedBegin.time - late.simulationSeconds <= .35 + 1 / 60, 'buffer outlived its 350 ms window');
  check(`${classId}: one 350 ms slot, latest valid skill wins, early/long-CD presses do not queue`, { queuedAt: late.simulationSeconds, beganAt: bufferedBegin.time });

  const expired = await setup(2.6);
  await aim(expired.targetIds[0], false); await page.keyboard.press('1');
  await until(s => s.attack?.skillIndex === 0 && s.attack.impacted && s.attack.remaining <= .30 && s.attack.remaining > .02);
  await page.keyboard.press('2');
  await page.evaluate(() => { const f = window.__VARENDOR_FIXTURE__; const cd = f.combatSnapshot().player.cooldowns; cd[1] = 10; f.cooldowns(cd); });
  await step(.6); await page.evaluate(() => window.__VARENDOR_FIXTURE__.cooldowns([0, 0, 0, 0])); await step(2);
  s = await snapshot(); assert.equal(s.intent.bufferedSkill, null); assert.equal(events(s, 'release', 1).length, 0);
  check(`${classId}: a buffered skill becoming unavailable never waits invisibly for later readiness`);

  // Resource is validated again at the release edge, not only on key down.
  const unavailable = await setup(2.6);
  await aim(unavailable.targetIds[0], false); await page.keyboard.press('1');
  await until(s => s.attack?.skillIndex === 0 && !s.attack.impacted);
  await page.evaluate(() => { const f = window.__VARENDOR_FIXTURE__; f.vitals(f.combatSnapshot().player.hp, 0); });
  s = await until(s => !s.attack, 2);
  assert.equal(events(s, 'release', 0).length, 0); assert.equal(s.player.cooldowns[0], 0);
  check(`${classId}: MP is revalidated at release`);

  if (classId === 'knight') {
    const wall = await page.evaluate(() => window.__VARENDOR_FIXTURE__.combatWallTest());
    const wallStart = await snapshot();
    assert.equal(wall.blocked, true);
    assert.ok(Math.hypot(target(wallStart, wall.targetIds[0]).x - wallStart.player.x,
      target(wallStart, wall.targetIds[0]).z - wallStart.player.z) <= wallStart.range);
    await aim(wall.targetIds[0], false); await page.keyboard.press('1'); await step(.15);
    s = await snapshot();
    assert.equal(events(s, 'begin', 0).length, 0, 'sword began through an existing wall despite its blocked contact line');
    assert.equal(events(s, 'release', 0).length, 0); assert.equal(damageTo(s, wall.targetIds[0]).length, 0);
    assert.equal(s.player.mp, s.player.maxMp); assert.equal(s.player.cooldowns[0], 0);
    check('knight: an existing village wall blocks a nearby, faced target before attack or resource debit');

    const crossing = await page.evaluate(() => {
      const f = window.__VARENDOR_FIXTURE__, wall = f.combatWallTest(), s = f.combatSnapshot();
      const t = s.targets.find(t => t.uid === wall.targetIds[0]);
      const dx = t.x - s.player.x, dz = t.z - s.player.z, length = Math.hypot(dx, dz);
      const across = { id: t.uid, x: t.x, z: t.z };
      for (const [vx, vz] of [[-dx, -dz], [-dz, dx], [dz, -dx]]) {
        const x = s.player.x + vx / length * 2.4, z = s.player.z + vz / length * 2.4;
        if (f.surface(x, z).blocked) continue;
        f.combatMoveTarget(t.uid, x, z);
        if (f.combatVisible(t.uid)) return { across, from: { x, z } };
      }
      throw Error('No clear same-side position beside the real wall');
    });
    await aim(crossing.across.id, false); await page.keyboard.press('1');
    await until(s => s.attack?.skillIndex === 0 && !s.attack.impacted);
    await page.evaluate(({ id, x, z }) => window.__VARENDOR_FIXTURE__.combatMoveTarget(id, x, z), crossing.across);
    assert.equal(await page.evaluate(id => window.__VARENDOR_FIXTURE__.combatVisible(id), crossing.across.id), false);
    s = await until(s => !s.attack, 2);
    assert.equal(events(s, 'release', 0).length, 0); assert.equal(damageTo(s, crossing.across.id).length, 0);
    assert.equal(s.player.mp, s.player.maxMp); assert.equal(s.player.cooldowns[0], 0);
    check('knight: sword contact revalidates the existing wall when a target crosses it during windup', crossing);

    const escaped = await setup(2.6);
    await aim(escaped.targetIds[0], false); await page.keyboard.press('1');
    const beforeEscape = await until(s => s.attack?.skillIndex === 0 && !s.attack.impacted);
    await page.evaluate(({ id, x, z }) => window.__VARENDOR_FIXTURE__.combatMoveTarget(id, x, z),
      { id: escaped.targetIds[0], x: beforeEscape.player.x, z: beforeEscape.player.z + 12 });
    await step(.7); s = await snapshot();
    assert.equal(damageTo(s, escaped.targetIds[0]).length, 0); assert.equal(s.player.cooldowns[0], 0);
    check('knight: a target escaping the sword reach cannot take delayed melee damage');
  } else {
    if (classId === 'mage') {
      const cluster = await page.evaluate(() => window.__VARENDOR_FIXTURE__.combatCluster(5));
      const realActors = await page.evaluate(ids => window.__VARENDOR_FIXTURE__.actors()
        .filter(a => a.kind === 'player' || ids.includes(a.uid))
        .map(a => ({ uid: a.uid, kind: a.kind, model: a.model, meshes: a.meshes, generation: a.generation })), cluster.targetIds);
      assert.equal(cluster.targetIds.length, 5);
      assert.ok(realActors.every(a => a.meshes > 0), 'chain used an actor without real model meshes');
      const heroId = realActors.find(a => a.kind === 'player').uid;
      await aim(cluster.targetIds[0], false); await page.keyboard.press('3');
      await until(s => s.events.some(e => e.kind === 'release' && e.skillIndex === 2));
      s = await until(s => s.events.filter(e => e.kind === 'damage').length >= 5, 5);
      const chainDamage = s.events.filter(e => e.kind === 'damage');
      const chainArcs = s.events.filter(e => e.kind === 'arc');
      assert.equal(chainDamage.length, 5); assert.equal(new Set(chainDamage.map(e => e.target)).size, 5);
      assert.deepEqual(new Set(chainDamage.map(e => e.target)), new Set(cluster.targetIds));
      assert.equal(chainDamage[0].target, cluster.targetIds[0], 'chain did not start at the explicit target');
      assert.equal(chainArcs.length, 5, 'visible arc count differs from actual hit count');
      for (let hop = 0; hop < chainDamage.length; hop++) {
        assert.equal(chainArcs[hop].source, hop === 0 ? heroId : chainDamage[hop - 1].target);
        assert.equal(chainArcs[hop].target, chainDamage[hop].target);
        assert.equal(chainArcs[hop].time, chainDamage[hop].time, 'damage did not match its visible arc');
        assert.equal(chainDamage[hop].damage, Math.max(1, Math.round(chainDamage[0].damage * .76 ** hop)));
        assert.equal(target(s, chainDamage[hop].target).hp, 10000 - chainDamage[hop].damage);
      }
      const chainRelease = events(s, 'release', 2);
      assert.equal(chainRelease.length, 1);
      assert.ok(Math.abs(chainRelease[0].mpBefore - chainRelease[0].mpAfter - 48) < 1e-8);
      assert.equal(chainRelease[0].cooldownAfter, 12);
      await visibleScreenshot('E-mage-chain-lightning');
      await writeFile(path.join(reportDir, 'E-mage-chain-lightning.json'), JSON.stringify({ actors: realActors, arcs: chainArcs, damage: chainDamage, release: chainRelease }, null, 2));
      await step(1); s = await snapshot();
      assert.equal(s.events.filter(e => e.kind === 'damage').length, 5);
      assert.equal(events(s, 'release', null).length, 0);
      check('mage: five distinct real chain targets, matching visible arc edges, existing 0.76 falloff and one resource debit', { actors: realActors, hits: chainDamage });
    }

    const inFlight = await setup(6, 5);
    await aim(inFlight.targetIds[0], false); await page.keyboard.press('1');
    await until(s => s.events.some(e => e.kind === 'release' && e.skillIndex === 0));
    await aim(inFlight.targetIds[1], false); await step(1.5); s = await snapshot();
    assert.equal(damageTo(s, inFlight.targetIds[0]).length, 1, 'launched projectile lost original target or dealt damage twice');
    assert.equal(damageTo(s, inFlight.targetIds[1]).length, 0, 'launched projectile retargeted');
    assert.equal(target(s, inFlight.targetIds[1]).hp, 10000);
    check(`${classId}: launched projectile keeps its original target after selection changes`);

    const newLife = await setup(6);
    await aim(newLife.targetIds[0], false); await page.keyboard.press('1');
    const launched = await until(s => s.events.some(e => e.kind === 'release' && e.skillIndex === 0));
    const originalGeneration = target(launched, newLife.targetIds[0]).generation;
    await page.evaluate(id => { const f = window.__VARENDOR_FIXTURE__; f.kill(id); f.lifecycleStep(id, 1); f.lifecycleStep(id, 1); f.lifecycleStep(id, 1e9); }, newLife.targetIds[0]);
    const revived = target(await snapshot(), newLife.targetIds[0]); assert.ok(revived.alive && revived.generation > originalGeneration);
    await step(1.5); s = await snapshot();
    assert.equal(damageTo(s, newLife.targetIds[0]).length, 0); assert.equal(target(s, newLife.targetIds[0]).hp, revived.hp);
    assert.equal(s.selectedTarget, null); assert.equal(s.intent.autoAttackTargetId, null);
    check(`${classId}: old projectile cannot damage the target's respawned life; death clears selection`);

    const afterDeath = await setup(6);
    await aim(afterDeath.targetIds[0], false); await page.keyboard.press('1');
    await until(s => s.events.some(e => e.kind === 'release' && e.skillIndex === 0));
    await page.evaluate(() => window.__VARENDOR_FIXTURE__.die()); await step(1.5); s = await snapshot();
    assert.ok(s.player.dead); assert.equal(damageTo(s, afterDeath.targetIds[0]).length, 1);
    assert.equal(s.intent.autoAttackTargetId, null); assert.equal(s.intent.skillIntent, null); assert.equal(s.intent.bufferedSkill, null);
    check(`${classId}: death clears commands while a released projectile resolves on its existing target`);
  }
  await writeFile(path.join(reportDir, `E-${classId}-final-events.json`), JSON.stringify((await snapshot()).events, null, 2));
  await context.close();
}

try {
  if (production) await productionScenario();
  else for (const classId of ['knight', 'ranger', 'mage']) await classScenarios(classId);
  assert.deepEqual(report.errors, []);
  report.passed = true;
} catch (error) {
  report.failure = error.stack ?? String(error);
  if (page && !page.isClosed()) await page.screenshot({ path: path.join(reportDir, `${label}-failure.png`) }).catch(() => {});
  throw error;
} finally {
  await writeFile(path.join(reportDir, `${label}-combat-intent.json`), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
  await browser.close(); await new Promise(resolve => server.close(resolve));
}
