import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, cpSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { stageWorldApplication, serverDependencyFiles } from '../scripts/package-world-windows.mjs';
import { smokeWorldPackage } from '../scripts/windows-world-smoke.mjs';

test('staged server has its complete dependency closure and retains world when package folder changes',async()=>{
  const root=resolve(import.meta.dirname,'..');
  const temp=mkdtempSync(resolve(tmpdir(),'varendor-stage-'));
  try{
    const dist=resolve(temp,'dist');mkdirSync(resolve(dist,'assets/world'),{recursive:true});
    writeFileSync(resolve(dist,'index.html'),'<html><script type="module" src="/assets/test.js"></script></html>');
    writeFileSync(resolve(dist,'assets/test.js'),'console.log("package transport fixture");');
    writeFileSync(resolve(dist,'assets/probe.glb'),Buffer.from('glTF package transport fixture'));
    cpSync(resolve(root,'public/assets/world/world-topology.json'),resolve(dist,'assets/world/world-topology.json'));
    const destination=resolve(temp,'package');
    const files=stageWorldApplication({root,destination,dist,commit:'a'.repeat(40)});
    assert.ok(files.includes('src/server/world-simulation.ts'));
    assert.ok(files.includes('src/world/world-topology.ts'));
    assert.ok(!files.includes('src/main.ts'));
    assert.deepEqual(files,serverDependencyFiles(root));
    const report=await smokeWorldPackage(destination,{verifyManifest:false,portable:false});
    assert.equal(report.buildCommit,'a'.repeat(40));
    assert.equal(report.checks.length,8);
    assert.throws(()=>stageWorldApplication({root,destination,dist,commit:'a'.repeat(40)}),/must be new/);
    // The fixture proves server packaging and static transport, not rendering or real Windows execution.
    assert.equal(readFileSync(resolve(destination,'BUILD_COMMIT.txt'),'utf8'),'a'.repeat(40)+'\n');
  }finally{rmSync(temp,{recursive:true,force:true});}
});
