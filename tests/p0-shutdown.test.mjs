import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';

// A separate process catches late uncaught request-close errors after close() resolves.
for (const mode of ['server-stop', 'client-disconnect']) {
  test(`P0 shutdown: ${mode} preserves hero, item UID, progress and receipt`, () => {
    const result = spawnSync(process.execPath, ['--experimental-strip-types',
      'tests/fixtures/p0-shutdown-scenario.mjs', mode], {
      cwd: new URL('..', import.meta.url), encoding: 'utf8', timeout: 15_000,
    });
    assert.ifError(result.error);
    assert.equal(result.status, 0, result.stderr + result.stdout);
    assert.match(result.stdout, /synthetic shutdown verified/);
  });
}
