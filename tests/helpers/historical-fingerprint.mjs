import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import assert from 'node:assert/strict';
// Reports recorded on LF checkouts remain valid on Git's CRLF text checkouts.
// Content, whitespace, JSON ordering and the recorded fingerprint never change.
export function historicalFingerprintMatches(path, expected) {
  const bytes=readFileSync(path),sha=value=>createHash('sha256').update(value).digest('hex');
  return sha(bytes)===expected || sha(bytes.toString('utf8').replaceAll('\r\n','\n'))===expected;
}
export function recordUnresolvedHistoricalSource(path, expected) {
  const ledger=JSON.parse(readFileSync('docs/world-expansion-v3/audit-20260912/resources/historical-evidence-ledger.json','utf8'));
  const gap=ledger.unresolvedSources.find(row=>row.path===path&&row.recordedSha256===expected);
  if(!gap)return false;
  assert.equal(gap.provenance,'unresolved');
  assert.ok(gap.reason.length>40);
  return true; // Explicitly unresolved, never a verified current-source match.
}
