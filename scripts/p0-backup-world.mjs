// P0 preparation only. Uses Node 24's SQLite online backup, never WorldStore on the source.
import { DatabaseSync, backup } from 'node:sqlite';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync, chmodSync, realpathSync } from 'node:fs';
import { resolve, dirname, join, relative, isAbsolute } from 'node:path';
import { fileURLToPath } from 'node:url';

const columns = {
  world: ['id', 'state'],
  receipts: ['character', 'command', 'fingerprint', 'result'],
  sessions: ['token_hash', 'character'],
  imports: ['character', 'original', 'imported_at'],
  import_requests: ['id', 'source_hash', 'character'],
};
const hash = value => createHash('sha256').update(value).digest('hex');
const inside = (parent, child) => {
  const path = relative(parent, child);
  return path === '' || (!path.startsWith('..') && !isAbsolute(path));
};

export function inspectWorld(db) {
  if (db.prepare('PRAGMA integrity_check').all().some(row => Object.values(row)[0] !== 'ok'))
    throw Error('sqlite-integrity-failed');
  const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'").all().map(row => row.name).sort();
  if (JSON.stringify(tables) !== JSON.stringify(Object.keys(columns).sort())) throw Error('unsupported-table-schema');
  const tableHashes = {}, counts = {};
  for (const [table, expected] of Object.entries(columns)) {
    if (JSON.stringify(db.prepare(`PRAGMA table_info(${table})`).all().map(row => row.name)) !== JSON.stringify(expected))
      throw Error('unsupported-column-schema');
    const rows = db.prepare(`SELECT * FROM ${table}`).all();
    counts[table] = rows.length;
    // Includes every field, receipt, import and hashed session; never returns those rows.
    tableHashes[table] = hash(JSON.stringify(rows.map(row => JSON.stringify(row)).sort()));
  }
  const row = db.prepare('SELECT state FROM world WHERE id=1').get();
  if (!row || counts.world !== 1) throw Error('missing-world-state');
  const world = JSON.parse(row.state);
  if (world.schema !== 1 || !world.characters || Array.isArray(world.characters)) throw Error('unsupported-world-schema');
  const heroes = Object.entries(world.characters);
  if (!heroes.length) throw Error('no-characters-cannot-verify-player-backup');
  const uids = new Set(); let items = 0;
  for (const [id, hero] of heroes) {
    if (hero.id !== id || !Array.isArray(hero.inventory) || !Array.isArray(hero.lootBuffer) || !hero.equipment)
      throw Error('invalid-character-shape');
    const pendingRewards = [hero.starterProgress, hero.progressionQuests]
      .flatMap(progress => Object.values(progress?.quests ?? {}))
      .flatMap(quest => quest?.pendingItems ?? []);
    for (const item of [...hero.inventory, ...Object.values(hero.equipment), ...hero.lootBuffer, ...(hero.storage??[]), ...(hero.migrationReserve??[]), ...pendingRewards].filter(Boolean)) {
      if (typeof item.uid !== 'string' || !item.uid || uids.has(item.uid)) throw Error('invalid-or-duplicate-item-uid');
      uids.add(item.uid); items++;
    }
  }
  return { schema: world.schema, characterCount: heroes.length, itemCount: items,
    uniqueItemUidCount: uids.size, counts, tableHashes,
    fullStateSha256: hash(row.state), worldRevision: world.revision };
}

export async function backupWorld(source, outputParent) {
  source = realpathSync(source); outputParent = resolve(outputParent);
  // Destination can contain bearer-related data: keep it outside every Git checkout.
  mkdirSync(outputParent, { recursive: true, mode: 0o700 });
  outputParent = realpathSync(outputParent);
  for (let dir = outputParent; ; dir = dirname(dir)) {
    if (existsSync(join(dir, '.git'))) throw Error('backup-destination-inside-git');
    if (dirname(dir) === dir) break;
  }
  if (inside(outputParent, source)) throw Error('source-inside-backup-destination');
  const db = new DatabaseSync(source, { readOnly: true });
  let backupDir;
  try {
    db.exec('PRAGMA busy_timeout=5000; BEGIN');
    const before = inspectWorld(db);
    backupDir = mkdtempSync(join(outputParent, 'varendor-backup-'));
    const filename = join(backupDir, 'world.sqlite');
    await backup(db, filename);
    chmodSync(filename, 0o600);
    const copy = new DatabaseSync(filename, { readOnly: true });
    let after;
    try { after = inspectWorld(copy); } finally { copy.close(); }
    if (JSON.stringify(before) !== JSON.stringify(after)) throw Error('backup-content-mismatch');
    const report = {
      kind: 'sqlite-backup-verification', createdAt: new Date().toISOString(), node: process.version,
      sqlite: db.prepare('SELECT sqlite_version() AS version').get().version,
      sourceOpenedReadOnly: true, consistentReadTransaction: true, onlineBackupUsed: true,
      integrity: 'ok', allTablesAndStateFieldsEqual: true,
      ...after, backupSha256: hash(readFileSync(filename)),
      browserProfileBackedUp: false, pendingBrowserOperationStatus: 'unknown',
      personalBackupClaim: 'Caller must establish source ownership and actual player profile; a fixture is not personal data.',
      restoreRuntimeTested: false,
    };
    writeFileSync(join(backupDir, 'verification.json'), JSON.stringify(report, null, 2) + '\n', { flag: 'wx', mode: 0o600 });
    return { backupDir, filename, report };
  } catch (error) {
    if (backupDir) writeFileSync(join(backupDir, 'INCOMPLETE.txt'), 'Backup verification failed. Do not use this as a verified restore point.\n', { mode: 0o600 });
    throw error;
  } finally {
    try { db.exec('ROLLBACK'); } finally { db.close(); }
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [source, outputParent] = process.argv.slice(2);
  if (!source || !outputParent) {
    console.error('Usage: node scripts/p0-backup-world.mjs SOURCE_SQLITE PRIVATE_BACKUP_PARENT');
    process.exitCode = 2;
  } else {
    try { const result = await backupWorld(source, outputParent); console.log(JSON.stringify(result, null, 2)); }
    catch (error) { console.error('Backup NOT verified:', error.message); process.exitCode = 1; }
  }
}
