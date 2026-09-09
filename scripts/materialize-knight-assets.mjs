// Restore approved native assets from the exact binary parts tracked in Git.
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, openSync, closeSync, readSync, writeSync, readFileSync, renameSync, unlinkSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export function digestFile(file) {
  const handle = openSync(file, 'r'), digest = createHash('sha256'), block = Buffer.allocUnsafe(1024 * 1024);
  let bytes = 0;
  try { for (;;) { const count = readSync(handle, block, 0, block.length, null); if (!count) break; bytes += count; digest.update(block.subarray(0, count)); } }
  finally { closeSync(handle); }
  return { bytes, sha256: digest.digest('hex') };
}
const matches = (observed, expected) => observed.bytes === expected.bytes && observed.sha256 === expected.sha256;

export function materializeAsset(root, entry, destination = resolve(root, entry.destination)) {
  if (existsSync(destination) && matches(digestFile(destination), entry)) return { destination, ...digestFile(destination), restored: false };
  mkdirSync(dirname(destination), { recursive: true });
  const temporary = destination + '.materializing';
  const output = openSync(temporary, 'w');
  let failure;
  try {
    for (const part of entry.parts) {
      const source = resolve(root, part.path);
      const bytes = readFileSync(source);
      const observed = { bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') };
      if (!matches(observed, part)) throw Error(`Knight asset part checksum mismatch: ${part.path}`);
      let offset = 0;
      while (offset < bytes.length) offset += writeSync(output, bytes, offset, bytes.length - offset);
    }
  } catch (error) { failure = error; }
  finally { closeSync(output); }
  if (failure) { unlinkSync(temporary); throw failure; }
  const observed = digestFile(temporary);
  if (!matches(observed, entry)) { unlinkSync(temporary); throw Error(`Reassembled knight asset checksum mismatch: ${entry.destination}`); }
  renameSync(temporary, destination);
  return { destination, ...observed, restored: true };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const root = process.cwd();
  const manifest = JSON.parse(readFileSync(resolve(root, 'art/knight-v2/assets-manifest.json'), 'utf8'));
  const names = process.argv.includes('--include-source') ? ['runtime', 'source'] : ['runtime'];
  for (const name of names) {
    if (!manifest.files[name]) throw Error(`Missing approved knight ${name} entry in assets-manifest.json`);
    console.log(JSON.stringify({ asset: name, ...materializeAsset(root, manifest.files[name]) }));
  }
}
