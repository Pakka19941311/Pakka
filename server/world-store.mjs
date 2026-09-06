import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { createHash } from 'node:crypto';

/** A receipt and its item mutation are one durable transaction. A lost HTTP response
 * can be retried after a process restart without rerolling or consuming another item. */
export class WorldStore {
  constructor(filename) {
    if (filename !== ':memory:') mkdirSync(dirname(filename), { recursive: true });
    this.db = new DatabaseSync(filename);
    this.db.exec(`PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL;
      CREATE TABLE IF NOT EXISTS world (id INTEGER PRIMARY KEY CHECK(id=1), state TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS receipts (
        character TEXT NOT NULL, command TEXT NOT NULL, fingerprint TEXT NOT NULL, result TEXT NOT NULL,
        PRIMARY KEY(character, command));
      CREATE TABLE IF NOT EXISTS sessions (token_hash TEXT PRIMARY KEY, character TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS imports (character TEXT PRIMARY KEY, original TEXT NOT NULL, imported_at INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS import_requests (
        id TEXT PRIMARY KEY, source_hash TEXT NOT NULL UNIQUE, character TEXT NOT NULL UNIQUE);`);
  }
  load() {
    const row = this.db.prepare('SELECT state FROM world WHERE id=1').get();
    return row ? JSON.parse(row.state) : null;
  }
  save(state) {
    this.db.prepare('INSERT INTO world VALUES (1, ?) ON CONFLICT(id) DO UPDATE SET state=excluded.state').run(JSON.stringify(state));
  }
  receipt(character, id, payload) {
    const row = this.db.prepare('SELECT fingerprint, result FROM receipts WHERE character=? AND command=?').get(character, id);
    if (!row) return null;
    if (row.fingerprint !== fingerprint(payload)) throw Error('command-id-conflict');
    return JSON.parse(row.result);
  }
  commit(state, character, id, payload, result) {
    this.db.exec('BEGIN IMMEDIATE');
    try {
      this.save(state);
      this.db.prepare('INSERT INTO receipts VALUES (?, ?, ?, ?)').run(character, id, fingerprint(payload), JSON.stringify(result));
      this.db.exec('COMMIT');
    } catch (error) { this.db.exec('ROLLBACK'); throw error; }
  }
  session(token, character) {
    this.db.prepare('INSERT INTO sessions VALUES (?, ?)').run(fingerprint(token), character);
  }
  resolveSession(token) {
    return this.db.prepare('SELECT character FROM sessions WHERE token_hash=?').get(fingerprint(token))?.character ?? null;
  }
  importBackup(character, original, now) {
    this.db.prepare('INSERT INTO imports VALUES (?, ?, ?)').run(character, JSON.stringify(original), now);
  }
  hasImport(character) { return Boolean(this.db.prepare('SELECT character FROM imports WHERE character=?').get(character)); }
  imported(id, original) {
    const sourceHash=fingerprint(original);
    const row=this.db.prepare('SELECT source_hash,character FROM import_requests WHERE id=?').get(id);
    if(row){if(row.source_hash!==sourceHash)throw Error('import-id-conflict');return row.character;}
    if(this.db.prepare('SELECT id FROM import_requests WHERE source_hash=?').get(sourceHash))throw Error('save-already-imported');
    return null;
  }
  commitImport(state, character, id, original, at) {
    this.db.exec('BEGIN IMMEDIATE');
    try {
      this.save(state);
      this.importBackup(character,original,at);
      this.db.prepare('INSERT INTO import_requests VALUES (?, ?, ?)').run(id,fingerprint(original),character);
      this.db.exec('COMMIT');
    } catch(error) { this.db.exec('ROLLBACK');throw error; }
  }
  close() { this.db.close(); }
}
function fingerprint(value) { return createHash('sha256').update(JSON.stringify(value)).digest('hex'); }
