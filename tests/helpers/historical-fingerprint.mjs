import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import assert from 'node:assert/strict';
// Historical reports were recorded on both LF and CRLF checkouts. Accept only
// their line-ending equivalents; preserve all other whitespace and pinned SHA.
export function historicalFingerprintMatches(path, expected) {
  const bytes=readFileSync(path),sha=value=>createHash('sha256').update(value).digest('hex');
  if(sha(bytes)===expected)return true;
  const lf=bytes.toString('utf8').replaceAll('\r\n','\n');
  return sha(lf)===expected || sha(lf.replaceAll('\n','\r\n'))===expected;
}
export function recordUnresolvedHistoricalSource(path, expected) {
  const ledger=JSON.parse(readFileSync('docs/world-expansion-v3/audit-20260912/resources/historical-evidence-ledger.json','utf8'));
  const gap=ledger.unresolvedSources.find(row=>row.path===path&&row.recordedSha256===expected);
  if(!gap)return false;
  assert.equal(gap.provenance,'unresolved');
  assert.ok(gap.reason.length>40);
  return true; // Explicitly unresolved, never a verified current-source match.
}
