import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

// Publish the already-tested immutable build; no build or gameplay tests.
const repository = 'Pakka19941311/Pakka';
const sourceCommit = 'd787e58849b9aad75a94c5df2f10d0ab5915819e';
const branch = 'work/knight-integration-v2';
const runId = 34363900932;
const releaseId = 385598576;
const tag = 'godot-knight-preview-d787e58849b9';
const expectedAssets = [
  {
    "bytes": 1590350,
    "id": 552951512,
    "name": "knight-closed.png",
    "sha256": "e6da06797ade6c9cf870f5eff9735faf6fa2f2caf39386bce777bee15894de15"
  },
  {
    "bytes": 1645005,
    "id": 552951513,
    "name": "knight-equipped.png",
    "sha256": "6118e7cf16f9239ab5c52d3d131609d80c4ba4224f48c41609869a372ae3b0dc"
  },
  {
    "bytes": 12479,
    "id": 552951485,
    "name": "knight-gameplay-video.json",
    "sha256": "7ead86a6636d3a232fd8bff79b8e9ab807dbed08e928973fd78be9bfdf4d1e6f"
  },
  {
    "bytes": 1938366,
    "id": 552951518,
    "name": "knight-gameplay.png",
    "sha256": "d4f00e160e87bbb744d0250b8f1b551b25f6f5cdcb41afecff2ceed208e445bf"
  },
  {
    "bytes": 62062,
    "id": 552951484,
    "name": "knight-linux-native-qa.json",
    "sha256": "afe5f2209efe165856f30ae27fe498c4a8a5172df3581a5abbf4f56c03a3df8a"
  },
  {
    "bytes": 1591579,
    "id": 552951521,
    "name": "knight-open.png",
    "sha256": "9816ef579c5ac3e89d398d7fce6a86e967c33dd963841194c1228dccbbb55fe0"
  },
  {
    "bytes": 1586288,
    "id": 552951552,
    "name": "knight-starter.png",
    "sha256": "003c19f00c7683cd0a6ba6ba6b67fa05fc6c4dfe922433eb9bc387bc58a972a8"
  },
  {
    "bytes": 47730,
    "id": 552951490,
    "name": "knight-windows-native-qa.json",
    "sha256": "7a2a967b55126667273d4575af15e358a2ce3ed539c2ca498fd11c5e4aca3238"
  },
  {
    "bytes": 431930832,
    "id": 552951489,
    "name": "Varendor_Godot_PC_d787e58849b9.zip",
    "sha256": "3866da5a119eaf3c05d1d61d1a6de52edc207594a0123ccfa35585377ff08b66"
  },
  {
    "bytes": 101,
    "id": 552951482,
    "name": "Varendor_Godot_PC_d787e58849b9.zip.sha256",
    "sha256": "743319ef6e3370e614ead05ac78c0c479e6f520e0c496a9b1b8dfdf5de08161b"
  },
  {
    "bytes": 1121979,
    "id": 552951557,
    "name": "Varendor_Knight_Gameplay.mp4",
    "sha256": "85ce0a6e7da873ed161a07f1511601af64e9b616137c106546c39b5336dbedd1"
  },
  {
    "bytes": 307583888,
    "id": 552951558,
    "name": "Varendor_Knight_Modular_v2.zip",
    "sha256": "532fa1bd023e4e5d9e8a9dc8fecbcf5aeea42d1314df4fd7d0d009d573a699de"
  }
];

assert.equal(process.env.GITHUB_REPOSITORY, repository);
assert.equal(process.env.GITHUB_REF, 'refs/heads/' + branch);
const publicationCommit = process.env.GITHUB_SHA;
assert.match(publicationCommit || '', /^[a-f0-9]{40}$/);
const token = process.env.GH_TOKEN || process.env.GITHUB_TOKEN;
assert.ok(token, 'GitHub Actions token is required');
const output = resolve(process.argv[2] || 'qa-artifacts/knight-publish-recovery');
mkdirSync(output, { recursive: true });
const headers = { Authorization: 'Bearer ' + token, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' };
const apiBase = 'https://api.github.com/repos/' + repository + '/';
async function api(path, options = {}) {
  const response = await fetch(apiBase + path, {
    method: options.method || 'GET',
    headers: { ...headers, ...(options.body ? { 'Content-Type': 'application/json' } : {}) },
    ...(options.body ? { body: JSON.stringify(options.body) } : {}),
    signal: AbortSignal.timeout(60000),
  });
  assert.equal(response.ok, true, 'GitHub API failed: ' + path + ' HTTP ' + response.status);
  return response.json();
}
function verifyAssets(release) {
  assert.equal(release.id, releaseId);
  assert.equal(release.tag_name, tag);
  assert.equal(release.target_commitish, sourceCommit);
  assert.equal(release.prerelease, true);
  assert.equal(release.assets.length, expectedAssets.length, 'Unexpected release asset count');
  for (const expected of expectedAssets) {
    const actual = release.assets.find(asset => asset.id === expected.id && asset.name === expected.name);
    assert.ok(actual, 'Missing tested release asset: ' + expected.name);
    assert.equal(actual.state, 'uploaded', expected.name);
    assert.equal(actual.size, expected.bytes, expected.name);
    assert.equal(actual.digest, 'sha256:' + expected.sha256, expected.name);
  }
}
async function readVerifiedReport(name) {
  const expected = expectedAssets.find(asset => asset.name === name);
  assert.ok(expected);
  const response = await fetch(apiBase + 'releases/assets/' + expected.id, {
    headers: { ...headers, Accept: 'application/octet-stream' },
    signal: AbortSignal.timeout(60000),
  });
  assert.equal(response.ok, true, 'Cannot download tested QA report: ' + name);
  const bytes = Buffer.from(await response.arrayBuffer());
  assert.equal(bytes.length, expected.bytes, 'QA report byte count: ' + name);
  assert.equal(createHash('sha256').update(bytes).digest('hex'), expected.sha256, 'QA report digest: ' + name);
  writeFileSync(resolve(output, name), bytes);
  return JSON.parse(bytes.toString('utf8'));
}
const run = await api('actions/runs/' + runId);
assert.equal(run.head_sha, sourceCommit);
assert.equal(run.head_branch, branch);
assert.equal(run.status, 'completed');
const jobs = (await api('actions/runs/' + runId + '/jobs?per_page=100')).jobs;
const nativeJob = jobs.find(job => job.name === 'native-build');
const windowsJob = jobs.find(job => job.name === 'windows-package');
assert.ok(nativeJob && windowsJob, 'Required native jobs are missing');
assert.equal(nativeJob.conclusion, 'success', 'Original Linux/native job did not pass');
for (const name of ['Package the current Windows executable and portable server', 'Test the shipped Windows executable, equipment and portable Node']) {
  assert.equal(windowsJob.steps.find(step => step.name === name)?.conclusion, 'success', name);
}
const failures = jobs.flatMap(job => job.steps.filter(step => step.conclusion === 'failure').map(step => ({ job: job.name, step: step.name })));
assert.deepEqual(failures, [{ job: 'windows-package', step: 'Publish tested Windows ZIP and verify its direct download' }], 'Only publication may have failed');
let release = await api('releases/' + releaseId);
verifyAssets(release);
const linux = await readVerifiedReport('knight-linux-native-qa.json');
const windows = await readVerifiedReport('knight-windows-native-qa.json');
for (const [platform, report] of [['linux', linux], ['win32', windows]]) {
  assert.equal(report.ok, true, platform);
  assert.equal(report.platform, platform);
  assert.equal(report.source, sourceCommit);
  assert.equal(report.native.ok, true);
  assert.equal(report.native.scope, 'knight-integration');
  assert.ok(Object.keys(report.native.checks).length >= 50, 'Incomplete native knight checks');
  for (const [key, value] of Object.entries(report.native.checks)) {
    if (key !== 'native_render') assert.notEqual(value, false, platform + ' failed check: ' + key);
  }
}
assert.equal(linux.native.checks.native_render, true);
assert.equal(windows.native.checks.native_render, false, 'Windows proof must identify headless rendering');
assert.equal(windows.node, 'v24.20.0', 'The test must use the packaged Node runtime');
for (let skill = 0; skill < 4; skill++) {
  assert.equal(windows.native.checks['skill_' + skill + '_real_animation'], true, 'Windows did not observe actual skill animation ' + skill);
}
console.log('Verified original Linux graphics and shipped Windows QA, plus all 12 uploaded asset digests.');
if (release.draft) release = await api('releases/' + releaseId, { method: 'PATCH', body: { draft: false, prerelease: true, make_latest: 'false' } });
release = await api('releases/' + releaseId);
assert.equal(release.draft, false);
assert.ok(release.published_at);
verifyAssets(release);
const game = expectedAssets.find(asset => asset.name === 'Varendor_Godot_PC_d787e58849b9.zip');
const publicAsset = release.assets.find(asset => asset.id === game.id);
const response = await fetch(publicAsset.browser_download_url, { signal: AbortSignal.timeout(240000) });
assert.equal(response.ok, true, 'Public direct ZIP download failed: HTTP ' + response.status);
const digest = createHash('sha256');
let bytes = 0;
for await (const chunk of response.body) { bytes += chunk.length; digest.update(chunk); }
const checksum = digest.digest('hex');
assert.equal(bytes, game.bytes);
assert.equal(checksum, game.sha256);
const result = {
  ok: true, sourceCommit, publicationCommit, verifiedBuildRun: runId,
  publicationRun: process.env.GITHUB_RUN_ID, releaseId, release: release.html_url,
  download: publicAsset.browser_download_url, bytes, sha256: checksum,
  sourceDownload: release.assets.find(asset => asset.name === 'Varendor_Knight_Modular_v2.zip').browser_download_url,
  gameplayVideo: release.assets.find(asset => asset.name === 'Varendor_Knight_Gameplay.mp4').browser_download_url,
  nativeGodotGraphicsLinuxPassed: true,
  linuxGraphicsScope: 'functional diagnostic profile; full-quality still screenshots',
  nativeWindowsHeadlessPassed: true, allFourWindowsSkillClipsObserved: true,
  windowsGpuVerified: false, directDownloadVerified: true,
  gameRebuiltDuringPublicationRecovery: false, linuxLimitations: linux.native.limitations || [],
};
writeFileSync(resolve(output, 'publish-result.json'), JSON.stringify(result, null, 2) + '\n');
if (process.env.GITHUB_STEP_SUMMARY) {
  writeFileSync(process.env.GITHUB_STEP_SUMMARY, '### Verified knight Windows build\n\n[Download Windows ZIP](' + result.download + ')\n\nBuild source: ' + sourceCommit + '. Publication workflow: ' + publicationCommit + '.\n', { flag: 'a' });
}
console.log(JSON.stringify(result, null, 2));

