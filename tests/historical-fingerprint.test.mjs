import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {mkdtempSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve,sep} from 'node:path';
import {historicalFingerprintMatches} from './helpers/historical-fingerprint.mjs';

const sha=text=>createHash('sha256').update(text).digest('hex');
function fixture(t){
  const directory=mkdtempSync(join(tmpdir(),'varendor-historical-eol-'));
  t.after(()=>{
    assert.ok(resolve(directory).startsWith(resolve(tmpdir())+sep));
    rmSync(directory,{recursive:true,force:true});
  });
  return join(directory,'evidence.json');
}

test('historical fingerprints match LF and CRLF checkouts in both directions',t=>{
  const path=fixture(t),lf='{\n  "height": 70.14,\n  "id": "courtyard"\n}\n';
  const versions=[lf,lf.replaceAll('\n','\r\n')];
  assert.notEqual(sha(versions[0]),sha(versions[1]),'different physical representations');
  for(const recorded of versions)for(const checkout of versions){
    writeFileSync(path,checkout);
    assert.equal(historicalFingerprintMatches(path,sha(recorded)),true);
  }
});

test('EOL compatibility does not accept content, spacing, ordering or missing-newline changes',t=>{
  const path=fixture(t),original='{\n  "height": 70.14,\n  "id": "courtyard"\n}\n';
  const expected=[sha(original),sha(original.replaceAll('\n','\r\n'))];
  for(const changed of [
    original.replace('70.14','70.15'),
    original.replace('  "height"',' "height"'),
    '{\n  "id": "courtyard",\n  "height": 70.14\n}\n',
    original.slice(0,-1),
  ])for(const checkout of [changed,changed.replaceAll('\n','\r\n')]){
    writeFileSync(path,checkout);
    for(const fingerprint of expected)assert.equal(historicalFingerprintMatches(path,fingerprint),false);
  }
});
