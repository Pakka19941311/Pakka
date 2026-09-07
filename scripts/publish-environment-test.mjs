// Publish only the user-requested intermediate world test, after native Windows QA.
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {resolve,basename} from 'node:path';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';

const output=resolve(process.argv[2]);
const repository='Pakka19941311/Pakka';
const commit=execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim();
assert.equal(process.env.GITHUB_REPOSITORY,repository);
assert.equal(process.env.GITHUB_SHA,commit);
assert.match(commit,/^[a-f0-9]{40}$/);
execFileSync('git',['diff','--exit-code','4be06872864a332af65577466a49551ee03d2155','HEAD','--',
  'src','server','public','package.json','package-lock.json','vite.config.ts','tsconfig.json']);
const checksum=bytes=>createHash('sha256').update(bytes).digest('hex');
const json=file=>JSON.parse(readFileSync(file,'utf8').replace(/^\uFEFF/,''));
const evidence=json('docs/qa/part1-environment-305edd4/part1-visual-review.json');
assert.equal(evidence.passed,true);
assert.equal(evidence.sha,'305edd4b3eb02252a77322dfec776bc67b104ad4');
assert.equal(evidence.checks.length,5);
assert.equal(evidence.errors.length,0);
// Windows Git checkout may use CRLF. Pin canonical Git bytes, then compare data.
const committedMap=execFileSync('git',['show',`${commit}:public/assets/world/world-topology.json`]);
assert.equal(checksum(committedMap),
  '5c94270c590ae38e5be3a388a6dc404517dc4557e5eb51c45fc7c251ccb3b894');
assert.deepEqual(json('public/assets/world/world-topology.json'),JSON.parse(committedMap.toString('utf8')));
const smokePath=resolve(output,'windows-smoke.json'),smoke=json(smokePath);
assert.equal(smoke.platform,'win32');
assert.equal(smoke.buildCommit,commit);
assert.equal(smoke.node,'v'+json('packaging/windows/node-runtime.json').version);
for(const check of ['package file integrity','launcher outside package cwd','single process per saved world',
  'HTML and JS query MIME and bytes','complete GLB','world clock without browser','graceful stop',
  'saved session across package folders'])assert.ok(smoke.checks.includes(check),check);

const archive=resolve(output,`Varendor_Part1_Windows_Test_${commit.slice(0,12)}.zip`);
const archiveBytes=readFileSync(archive),sha256=checksum(archiveBytes);
assert.ok(archiveBytes.length>0);
assert.equal(readFileSync(archive+'.sha256','utf8').trim(),`${sha256}  ${basename(archive)}`);
const notesPath=resolve(output,'release-notes.md');
writeFileSync(notesPath,readFileSync('docs/releases/PART1_ENVIRONMENT_TEST_RU.md','utf8')+
  `\nИсходный коммит: \`${commit}\`.\n\nZIP: ${archiveBytes.length} байт; SHA-256: \`${sha256}\`.\n`);
const tag=`part1-environment-test-${commit.slice(0,12)}`;
const gh=args=>execFileSync('gh',args,{encoding:'utf8',maxBuffer:8*1024*1024});
// No --clobber: previous test releases and their assets are never overwritten.
gh(['release','create',tag,archive,archive+'.sha256',smokePath,'--repo',repository,
  '--target',commit,'--prerelease','--latest=false','--title','Varendor — тест текущего мира без новых зданий',
  '--notes-file',notesPath]);
const release=JSON.parse(gh(['api',`repos/${repository}/releases/tags/${tag}`]));
assert.equal(release.draft,false);assert.equal(release.prerelease,true);
assert.equal(release.target_commitish,commit);
const ref=JSON.parse(gh(['api',`repos/${repository}/git/ref/tags/${tag}`]));
assert.equal(ref.object.sha,commit);
for(const file of [archive,archive+'.sha256',smokePath]){
  const asset=release.assets.find(item=>item.name===basename(file)),bytes=readFileSync(file);
  assert.ok(asset,'Missing release asset: '+basename(file));
  assert.equal(asset.state,'uploaded');assert.equal(asset.size,bytes.length);
  assert.equal(asset.digest,'sha256:'+checksum(bytes));
}
const asset=release.assets.find(item=>item.name===basename(archive));
// Download the same public URL the user receives, without an authorization header.
const response=await fetch(asset.browser_download_url,{signal:AbortSignal.timeout(180000)});
assert.equal(response.ok,true,`Direct download: HTTP ${response.status}`);
const downloaded=createHash('sha256');let downloadBytes=0;
for await(const chunk of response.body){downloaded.update(chunk);downloadBytes+=chunk.length;}
assert.equal(downloadBytes,archiveBytes.length);assert.equal(downloaded.digest('hex'),sha256);
const result={sourceCommit:commit,tag,release:release.html_url,download:asset.browser_download_url,
  bytes:archiveBytes.length,sha256,nativeWindowsPassed:true,directDownloadVerified:true,
  scope:'Intermediate environment test; four approved buildings and cliff UV remain unfinished.'};
writeFileSync(resolve(output,'publish-result.json'),JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify(result,null,2));
