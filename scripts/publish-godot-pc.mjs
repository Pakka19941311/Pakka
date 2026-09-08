import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve, join, basename } from 'node:path';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';

const directory = resolve(process.argv[2]);
const repository = 'Pakka19941311/Pakka';
const commit = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
assert.equal(process.env.GITHUB_REPOSITORY, repository);
assert.equal(process.env.GITHUB_SHA, commit);
const read = file => JSON.parse(readFileSync(file, 'utf8'));
const linuxPath = join(directory, 'pc-linux/pc-integration.json');
const windowsPath = join(directory, 'pc-windows/pc-integration.json');
const linux = read(linuxPath), windows = read(windowsPath);
assert.equal(linux.ok, true);
assert.equal(linux.native.checks.native_render, true);
assert.equal(windows.ok, true);
assert.equal(windows.platform, 'win32');
assert.equal(windows.source, commit);
assert.equal(linux.source, commit);
assert.equal(windows.native.scope, linux.native.scope, 'Linux and packaged Windows must verify the same gameplay scope');
assert.equal(windows.node, 'v' + read('packaging/windows/node-runtime.json').version);
const output = join(directory, 'release');
const name = `Varendor_Godot_PC_${commit.slice(0, 12)}`;
const stage = join(output, name), archive = join(output, name + '.zip');
const manifest = read(join(stage, 'PACKAGE_MANIFEST.json'));
assert.equal(manifest.buildCommit, commit);
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
for (const file of manifest.files) {
  const bytes = readFileSync(join(stage, file.path));
  assert.equal(bytes.length, file.bytes);
  assert.equal(sha(bytes), file.sha256);
}
execFileSync('python', ['-c', `import pathlib,sys,zipfile
root=pathlib.Path(sys.argv[1]);target=pathlib.Path(sys.argv[2])
with zipfile.ZipFile(target,'x',zipfile.ZIP_DEFLATED,compresslevel=6) as z:
 for p in sorted(root.rglob('*')):
  if p.is_file(): z.write(p,p.relative_to(root.parent))
with zipfile.ZipFile(target) as z:
 if z.testzip() is not None: raise RuntimeError('ZIP CRC failed')
`, stage, archive]);
const bytes = readFileSync(archive), checksum = sha(bytes);
writeFileSync(archive + '.sha256', checksum + '  ' + basename(archive) + '\n');
const notes = join(output, 'release-notes.md');
const forwardStop = linux.native.scope === 'forward-stop-follow-up';
const pacing = linux.native.scope === 'p0-frame-pacing';
const polish = linux.native.scope === 'pc-polish-19';
const territory = linux.native.scope === 'territory-world-map';
const followup = linux.native.scope === 'stop-npc-stats-follow-up';
const changes = pacing?'P0: уменьшены регулярные задержки основного потока при разборе сетевых снимков и повторных загрузках иконок. Сглаживание камеры, физика, остановка, дождь, графика и мир сохранены. Сравнение BEFORE/AFTER и ограничения аппаратного стенда — в отчёте.':polish?'19 согласованных доработок: одиночная атака и фиксируемая автоатака; ответная агрессия +25%; быстрые навыки; зелье +50% бега и +15% частоты атак; K — автобег. Небо, солнце/дождь/луна, 3 часа дня и 3 часа ночи, ночные пары в полнолуние и добыча. Единые ячейки, свободная панель, три канала чата, карта на ходу, компактные окна, запуск по размеру экрана. Кладовщик с личным складом на 500 ячеек и все службы в двух городах.':territory?'Мир перестроен по утверждённой схеме ТЗ: Гринфолл 70×60 м и три сектора, отдельный Астерхолд, дороги, руины, лес, логово, лагерь и северная арена. Добавлены архитектурные детали, подлесок, ветер, облака и декоративная фауна. Полная игровая карта — M: названия, дороги, персонаж, масштабирование. Все 53 противника и четыре службы сохранены; старые позиции мигрируют с журналом, вещи и прогресс сохраняются.':forwardStop
  ? 'Убрано остаточное продвижение персонажа после остановки: горизонтальная скорость обнуляется при отпускании клавиш и достижении точки. Последовательная отправка команд работает независимо от частоты отрисовки, поэтому остановка не ждёт обработки очереди в медленных кадрах. Проверки охватывают первый кадр остановки, движение к точке и монстру, задержанные сетевые снимки и реальные анимированные модели.'
  : followup
  ? 'Исправлены запоздалые сдвиги персонажа после остановки, подход и функции городских NPC. Все девять характеристик помещаются в окне инвентаря без вертикальной прокрутки.'
  : 'Перенесены управление, камера, движение, бой, поведение монстров, HUD и инвентарь из принятой эталонной сборки Varendor в Godot.';
const report = pacing?'P0_FRAME_PACING.md':polish?'POLISH_19.md':territory?'WORLD_TERRITORY.md':forwardStop ? 'FORWARD_STOP_FIX.md' : followup ? 'STOP_NPC_FOLLOWUP.md' : 'REFERENCE_CONTROL_PORT.md';
writeFileSync(notes, `Тестовая сборка **Varendor на Godot для Windows x64**.\n\nРаспакуйте ZIP и запустите **RUN_VARENDOR.bat**. Движки и Node устанавливать не нужно.\n\n${changes}\n\n[Проверки и ограничения](https://github.com/${repository}/blob/work/godot-p1-recovery/docs/migration/pc/${report}). После пользовательской проверки этих исправлений — продолжение по ТЗ.\n\nПроверены нативный Godot render в Linux/Mesa и поставляемый Windows EXE + Node без графики. Проверки используют отдельную синтетическую базу; исходная SQLite не изменяется. Оценка ощущений управления и Windows GPU остаётся за тестом на игровом ПК.\n\nИсходный commit: \`${commit}\`. ZIP: ${bytes.length} байт. SHA-256: \`${checksum}\`.\n`);
const linuxAsset = join(output, 'linux-native-qa.json'), windowsAsset = join(output, 'windows-native-qa.json');
writeFileSync(linuxAsset, JSON.stringify(linux, null, 2) + '\n');
writeFileSync(windowsAsset, JSON.stringify(windows, null, 2) + '\n');
const screenshot = join(directory, 'pc-linux/native-runtime.png');
const files = [archive, archive + '.sha256', linuxAsset, windowsAsset, screenshot];
if(pacing){
  const comparison=read(join(directory,'pc-linux/pacing-comparison.json'));
  assert.equal(comparison.ok,true);
  files.push(join(directory,'pc-linux/pacing-comparison.json'),join(directory,'pc-linux/forward-stop-0.jpg'));
}else if(polish){
  for(const name of ['polish-map','polish-inventory-storage','polish-settings','polish-day','polish-rain','polish-night'])files.push(join(directory,'pc-linux',name+'.jpg'));
}else if(territory){
  files.push(join(directory,'pc-build/Varendor_World_Source.zip'));
  for(const name of ['territory-courtyard','territory-gate','territory-forest','territory-atlas'])files.push(join(directory,'pc-linux',name+'.jpg'));
}else{
  const sampleReport=read(join(directory,'pc-linux/samples/samples-qa.json'));
  assert.equal(sampleReport.ok,true);assert.equal(sampleReport.checks.graphics,true);
  files.push(join(directory,'pc-linux/samples/contact.jpg'),join(directory,'pc-linux/samples/samples-qa.json'));
}
const gh = args => execFileSync('gh', args, { encoding: 'utf8', maxBuffer: 8 * 1024 * 1024 });
const tag = `godot-pc-preview-${commit.slice(0, 12)}`;
gh(['release', 'create', tag, ...files, '--repo', repository, '--target', commit, '--prerelease', '--latest=false', '--title', 'Varendor — Godot PC test', '--notes-file', notes]);
const release = JSON.parse(gh(['api', `repos/${repository}/releases/tags/${tag}`]));
assert.equal(release.target_commitish, commit);
assert.equal(release.draft, false);
for (const file of files) {
  const asset = release.assets.find(value => value.name === basename(file));
  const content = readFileSync(file);
  assert.equal(asset?.state, 'uploaded');
  assert.equal(asset.size, content.length);
  assert.equal(asset.digest, 'sha256:' + sha(content));
}
const asset = release.assets.find(value => value.name === basename(archive));
const response = await fetch(asset.browser_download_url, { signal: AbortSignal.timeout(180000) });
assert.equal(response.ok, true);
let count = 0;
const downloaded = createHash('sha256');
for await (const chunk of response.body) { count += chunk.length; downloaded.update(chunk); }
assert.equal(count, bytes.length);
assert.equal(downloaded.digest('hex'), checksum);
const result = { sourceCommit: commit, release: release.html_url, download: asset.browser_download_url, bytes: count, sha256: checksum,
  qaScope: linux.native.scope || 'full-reference-port',
  nativeWindowsHeadlessPassed: true, nativeGodotGraphicsLinuxPassed: true, windowsGpuVerified: false, directDownloadVerified: true };
writeFileSync(join(output, 'publish-result.json'), JSON.stringify(result, null, 2) + '\n');
console.log(JSON.stringify(result, null, 2));
