import { existsSync, mkdirSync, readFileSync, writeFileSync, copyFileSync, renameSync, unlinkSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomBytes } from 'node:crypto';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { WorldStore } from './server/world-store.mjs';
import { startWorldServer } from './server/http-server.mjs';
import { restoreWorldTopology } from './src/world/world-topology.ts';
import { backupWorld } from './scripts/p0-backup-world.mjs';
import { teleportProgressRecovery } from './src/core/teleport-progress-repair.ts';
import { FinalWorld } from './src/world/final-world.ts';

const root = dirname(fileURLToPath(import.meta.url));
const readJson = path => JSON.parse(readFileSync(path, 'utf8'));
function privateJson(path, value) {
  const temporary = path + '.tmp';
  writeFileSync(temporary, JSON.stringify(value, null, 2) + '\n', { mode: 0o600 });
  renameSync(temporary, path);
}

/** Makes a verified clone. Never opens the legacy database with WorldStore. */
export async function prepareNativeData({ data, legacy, backups }) {
  mkdirSync(data, { recursive: true, mode: 0o700 });
  const database = join(data, 'world.sqlite');
  const reportPath = join(data, 'migration.json');
  if (existsSync(database)) return { database, migration: existsSync(reportPath) ? readJson(reportPath) : { kind: 'existing-native-test', browserProfileBackedUp: false } };
  let migration;
  if (legacy && existsSync(legacy)) {
    const copy = await backupWorld(legacy, backups);
    const temporary = database + '.verified-copy';
    copyFileSync(copy.filename, temporary);
    renameSync(temporary, database);
    migration = { kind: 'verified-legacy-clone', source: legacy, backup: copy.filename, verification: copy.report,
      originalDatabaseModified: false, browserProfileBackedUp: false, legacyQuickbarImported: false,
      note: 'World, character/item UIDs and all SQLite tables copied. Previous browser UI storage is not available to this launcher.' };
  } else {
    migration = { kind: 'new-native-test', sourceFound: false, personalBackupPerformed: false, browserProfileBackedUp: false,
      note: 'No legacy world.sqlite at the known path. This is a separate new test world, not a restored personal game.' };
  }
  privateJson(reportPath, migration);
  return { database, migration };
}

export async function startNativeBridge({ data, legacy, backups, port = 0 }) {
  mkdirSync(data, { recursive: true, mode: 0o700 });
  const lock = join(data, 'running.json');
  if (existsSync(lock)) {
    const previous = readJson(lock);
    let running = true;
    try { process.kill(previous.pid, 0); } catch (error) { if (error.code === 'ESRCH') running = false; else throw error; }
    if (running) throw Error('Игра с этими сохранениями уже запущена. Закройте предыдущее окно.');
    unlinkSync(lock);
  }
  writeFileSync(lock, JSON.stringify({ pid: process.pid }), { flag: 'wx', mode: 0o600 });
  let service;
  try {
    const { database, migration } = await prepareNativeData({ data, legacy, backups });
    // The old launcher profile predates this process. Capture it before writing
    // a new bootstrap, and only repair the specific leaked teleport metadata.
    const oldBootstrap=join(data,'bootstrap.json');
    let previousProfiles=[];
    if(existsSync(oldBootstrap))try{const old=readJson(oldBootstrap);if(Array.isArray(old.profiles))previousProfiles=old.profiles;}catch{}
    const recoveryStore=new WorldStore(database);
    let repairs=[];
    try{
      const state=recoveryStore.load();
      for(const hero of Object.values(state?.characters??{})){
        const recovery=teleportProgressRecovery(hero,previousProfiles.find(p=>p.id===hero.id));
        if(recovery)repairs.push({id:hero.id,...recovery});
      }
      if(repairs.length){
        const verified=await backupWorld(database,backups);
        for(const repair of repairs){const hero=state.characters[repair.id];Object.assign(hero,repair.to);delete hero.cost;}
        state.teleportProgressRepairs??=[];
        state.teleportProgressRepairs.push({at:Date.now(),backup:verified.filename,repairs});
        recoveryStore.save(state);
        console.log('Восстановлен подтверждённый прогресс после ошибки телепорта. Персонажей:',repairs.length,'Резервная копия:',verified.filename);
      }
    }finally{recoveryStore.close();}
    const store = new WorldStore(database);
    const profiles = [];
    try {
      const state = store.load();
      for (const hero of Object.values(state?.characters ?? {})) {
        const token = randomBytes(32).toString('base64url');
        store.session(token, hero.id);
        profiles.push({ id: hero.id, name: hero.name, classId: hero.classId, level: hero.level, token });
      }
    } finally { store.close(); }
    const finalWorld=existsSync(join(root,'world-final/gameplay/spawn-manifest.json'))?new FinalWorld(join(root,'world-final')):undefined;
    const { collision, terrain } = finalWorld?finalWorld.spaces.surface:restoreWorldTopology(readJson(join(root, 'public/assets/world/world-topology.json')));
    service = startWorldServer({ database, collision, terrain, finalWorld, port, host: '127.0.0.1', beta: true });
    await once(service.server, 'listening');
    const url = `http://127.0.0.1:${service.server.address().port}`;
    const bootstrapPath = join(data, 'bootstrap.json');
    const saveMessage = repairs.length ? 'Восстановлен подтверждённый уровень после ошибки телепорта. Предметы сохранены; исходная база скопирована в резерв.' : migration.kind === 'verified-legacy-clone'
      ? 'Найдена и проверена копия прежнего мира. Оригинал сохранён отдельно. Назначения прежнего браузера не импортированы.'
      : migration.kind === 'new-native-test'
        ? 'Отдельный тестовый мир. Прежняя база по стандартному пути не найдена; личные сохранения не восстановлены.'
        : 'Продолжение сохранённого тестового мира Godot.';
    privateJson(bootstrapPath, { schema: 1, server_url: url, profiles, save_message: saveMessage });
    let closing = false;
    return { service, url, bootstrapPath, database, migration, async close() {
      if (closing) return;
      closing = true;
      try { await service.close(); } finally { if (existsSync(lock)) unlinkSync(lock); }
    } };
  } catch (error) {
    if (service) await service.close();
    if (existsSync(lock)) unlinkSync(lock);
    throw error;
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const base = join(process.env.LOCALAPPDATA || process.env.XDG_DATA_HOME || join(process.env.HOME || root, '.local/share'), 'Varendor');
  const data = resolve(process.env.VARENDOR_PC_DATA || join(base, 'godot-pc-test-v1'));
  const legacy = process.env.VARENDOR_LEGACY_DATABASE || join(base, 'world-beta-v1', 'world.sqlite');
  const backups = join(base, 'godot-pc-backups');
  let bridge;
  try {
    bridge = await startNativeBridge({ data, legacy, backups });
    console.log('Varendor — Godot PC. Сохранения:', data);
    console.log('Исходная база не изменяется. Не закрывайте это окно во время игры.');
    const args = process.argv.slice(2);
    const executable = process.env.VARENDOR_GODOT_BINARY || join(root, 'Varendor.exe');
    const child = spawn(executable, [...(args.includes('--headless') ? ['--headless'] : []), '--', `--bootstrap=${bridge.bootstrapPath}`, ...args.filter(value => value !== '--headless')], { cwd: root, stdio: 'inherit' });
    child.once('error', error => { console.error('Не удалось запустить игру:', error.message); });
    const stop = async () => { if (!child.killed) child.kill(); await bridge.close(); };
    process.once('SIGINT', stop);
    process.once('SIGTERM', stop);
    const [code] = await once(child, 'exit');
    await bridge.close();
    process.exitCode = code ?? 1;
  } catch (error) {
    console.error('Запуск остановлен:', error.message);
    console.error('Существующие сохранения не удалены. Сохраните текст ошибки.');
    if (bridge) await bridge.close();
    process.exitCode = 1;
  }
}
