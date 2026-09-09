// Narrow release gate for the integrated Forgotten Knight. Never runs old full QA.
import assert from 'node:assert/strict';
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync, createReadStream } from 'node:fs';
import { basename, join, resolve } from 'node:path';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { writePackageManifest } from './package-world-windows.mjs';

const [directoryArg, ...options] = process.argv.slice(2);
assert.ok(directoryArg, 'Usage: publish-knight-preview.mjs QA_DIRECTORY [--stage]');
const directory = resolve(directoryArg);
const repository = 'Pakka19941311/Pakka';
const commit = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
const short = commit.slice(0, 12);
const name = `Varendor_Godot_PC_${short}`;
const output = join(directory, 'release');
const stage = join(output, name);
const read = path => JSON.parse(readFileSync(path, 'utf8'));
const shaFile = async path => {
  const digest = createHash('sha256');
  for await (const bytes of createReadStream(path)) digest.update(bytes);
  return digest.digest('hex');
};

if (options.includes('--stage')) {
  // Extend the already existing portable package, retaining its launch/server code.
  const prior = read(join(stage, 'PACKAGE_MANIFEST.json'));
  assert.equal(prior.buildCommit, commit);
  mkdirSync(join(stage, 'licenses/knight'), { recursive: true });
  mkdirSync(join(stage, 'licenses/knight-base'), { recursive: true });
  cpSync('art/knight-v2/LICENSES.md', join(stage, 'licenses/knight/LICENSES.md'));
  cpSync('art/forgotten-knight/LICENSES.md', join(stage, 'licenses/knight-base/LICENSES.md'));
  cpSync('godot-pc/data/knight_manifest.json', join(stage, 'licenses/knight/ASSET_MANIFEST.json'));
  cpSync('art/knight-v2/INTEGRATION.md', join(stage, 'KNIGHT_INTEGRATION_RU.md'));
  writeFileSync(join(stage, 'KNIGHT_REVIEW_RU.txt'), `VARENDOR — ИНТЕГРАЦИЯ РЫЦАРЯ\n\nРаспакуйте весь ZIP и запустите RUN_VARENDOR.bat.\nNode и Godot устанавливать не требуется.\n\nДля проверки создайте НОВОГО рыцаря: он появляется в штанах.\nНачальные меч и броня лежат в сумке. В beta/preview новый рыцарь\nтакже получает оба шлема, перчатки, сапоги и пояс для тестирования.\nСуществующие сохранения и экипировка автоматически не меняются.\nTab — инвентарь, двойной щелчок по вещи — надеть или снять.\nЗакрытый и открытый шлемы имеют разную геометрию.\nАвтоатака продолжает связку; визуальные удары не добавляют урон\nи не меняют серверную скорость атаки.\n\nПроверьте бег, остановку, прыжок, атаку, каст навыков и смену вещей.\nПроверки CI: Linux/Mesa в диагностическом профиле для механик;\nотдельные скриншоты сделаны при полном качестве. Windows EXE проверен\nбез графики. Настройки качества поставляемой игры не изменены.\nДиагностическое видео не является замером FPS.\nОщущения управления и работа Windows GPU проверяются на вашем ПК.\nПодробности и ограничения ассета: KNIGHT_INTEGRATION_RU.md.\n\nИсходный commit: ${commit}\nИсходники и лицензии: https://github.com/${repository}/tree/${commit}/art/knight-v2\n`);
  // Do not hash the previous manifest into its own replacement.
  const { files: _oldFiles, schema: _oldSchema, ...metadata } = prior;
  rmSync(join(stage, 'PACKAGE_MANIFEST.json'));
  writePackageManifest(stage, { ...metadata, kind: 'godot-knight-integration-preview', knightAsset: 'Forgotten Knight modular v2', qaScope: 'knight-integration' });
  console.log(JSON.stringify({ staged: stage, commit, knightLicensesIncluded: true }));
} else {
  assert.equal(process.env.GITHUB_REPOSITORY, repository);
  assert.equal(process.env.GITHUB_SHA, commit);
  const linux = read(join(directory, 'pc-linux/knight-integration.json'));
  const windows = read(join(directory, 'pc-windows/knight-integration.json'));
  for (const [platform, report] of [['linux', linux], ['win32', windows]]) {
    assert.equal(report.ok, true, `${platform} integration failed`);
    assert.equal(report.source, commit, `${platform} tested another source commit`);
    assert.equal(report.platform, platform);
    assert.equal(report.native.ok, true);
    assert.equal(report.native.scope, 'knight-integration');
    assert.ok(Object.keys(report.native.checks).length > 0, 'Native checks missing');
    for (const [key, value] of Object.entries(report.native.checks)) {
      if (key !== 'native_render') assert.notEqual(value, false, `${platform} failed check: ${key}`);
    }
  }
  assert.equal(linux.native.checks.native_render, true, 'Linux must exercise the renderer');
  assert.equal(windows.node, `v${read('packaging/windows/node-runtime.json').version}`, 'Test must use the shipped Node runtime');
  const manifest = read(join(stage, 'PACKAGE_MANIFEST.json'));
  assert.equal(manifest.buildCommit, commit);
  assert.equal(manifest.qaScope, 'knight-integration');
  for (const file of manifest.files) {
    const path = join(stage, file.path);
    assert.equal(statSync(path).size, file.bytes, `Package file changed: ${file.path}`);
    assert.equal(await shaFile(path), file.sha256, `Package hash changed: ${file.path}`);
  }
  assert.ok(manifest.files.some(file => file.path === 'licenses/knight/LICENSES.md'));
  assert.equal(readFileSync(join(stage, 'BUILD_COMMIT.txt'), 'utf8').trim(), commit);

  const archive = join(output, `${name}.zip`);
  // Stable ZIP member timestamps keep the downloadable binary package reproducible.
  const epoch = execFileSync('git', ['show', '-s', '--format=%ct', commit], { encoding: 'utf8' }).trim();
  execFileSync(process.platform === 'win32' ? 'python' : 'python3', ['-c', `import datetime,pathlib,sys,zipfile
root=pathlib.Path(sys.argv[1]); target=pathlib.Path(sys.argv[2])
stamp=datetime.datetime.fromtimestamp(int(sys.argv[3]),datetime.timezone.utc)
date=(max(1980,stamp.year),stamp.month,stamp.day,stamp.hour,stamp.minute,stamp.second)
with zipfile.ZipFile(target,'w',zipfile.ZIP_DEFLATED,compresslevel=6,allowZip64=True) as archive:
 for path in sorted(root.rglob('*')):
  if path.is_file():
   entry=zipfile.ZipInfo(path.relative_to(root.parent).as_posix(),date_time=date)
   entry.compress_type=zipfile.ZIP_DEFLATED; entry.create_system=3; entry.external_attr=0o100644<<16
   with path.open('rb') as source,archive.open(entry,'w',force_zip64=True) as destination:
    while chunk:=source.read(1024*1024): destination.write(chunk)
with zipfile.ZipFile(target) as archive:
 if archive.testzip() is not None: raise RuntimeError('ZIP CRC failed')
`, stage, archive, epoch]);
  const checksum = await shaFile(archive);
  const bytes = statSync(archive).size;
  writeFileSync(`${archive}.sha256`, `${checksum}  ${basename(archive)}\n`);
  const sourceArchive = join(directory, 'pc-build/Varendor_Knight_Modular_v2.zip');
  const sourceManifest = read('art/knight-v2/assets-manifest.json').files.source;
  assert.ok(existsSync(sourceArchive), 'Approved Blender/source package must be attached to the release');
  assert.equal(statSync(sourceArchive).size, sourceManifest.bytes);
  assert.equal(await shaFile(sourceArchive), sourceManifest.sha256, 'Original knight source package changed');
  const files = [archive, `${archive}.sha256`, join(directory, 'pc-linux/knight-integration.json')];
  // Unique release asset names distinguish the two native platforms.
  const linuxReport = join(output, 'knight-linux-native-qa.json');
  const windowsReport = join(output, 'knight-windows-native-qa.json');
  cpSync(join(directory, 'pc-linux/knight-integration.json'), linuxReport);
  cpSync(join(directory, 'pc-windows/knight-integration.json'), windowsReport);
  files.splice(2, 1, linuxReport, windowsReport);
  files.push(join(directory, 'pc-linux/knight-gameplay-video.json'));
  for (const entry of readdirSync(join(directory, 'pc-linux'), { withFileTypes: true })) {
    if (entry.isFile() && !entry.name.startsWith('knight-frame-') && /\.(png|jpg|mp4)$/i.test(entry.name)) files.push(join(directory, 'pc-linux', entry.name));
  }
  assert.ok(files.some(path => /\.(png|jpg)$/i.test(path)), 'Rendered knight screenshots missing');
  assert.ok(files.some(path => path.endsWith('.mp4')), 'Actual gameplay recording missing');
  files.push(sourceArchive);
  const notes = join(output, 'knight-release-notes.md');
  writeFileSync(notes, `Тестовая сборка **Varendor — модульный рыцарь** для Windows x64.\n\nРаспакуйте ZIP игры и запустите **RUN_VARENDOR.bat**. Устанавливать Godot или Node не нужно.\n\nПодключены принятый рыцарь, стартовый вид в штанах, сменные доспехи, открытый и закрытый шлемы, бег, прыжок, реакция на урон, каст и комбо автоатаки. Серверные сроки ударов, урон и баланс сохранены.\n\nПроверены импорт и анимации, механики в Linux/Mesa с диагностическим профилем графики, поставляемый Windows EXE и portable Node без графики. Отдельные скриншоты получены при полном качестве; настройки качества самой игры сохранены. Видео содержит реальные диагностические кадры с исходными временными интервалами и не служит замером FPS. Проверки используют отдельные тестовые данные. Оценка управления и Windows GPU остаётся за тестом на игровом ПК.\n\n[Код и исходники ассета](https://github.com/${repository}/tree/${commit}/art/knight-v2). ${existsSync(sourceArchive) ? 'Отдельный архив Varendor_Knight_Modular_v2.zip содержит исходники Blender, текстуры и экспорты.' : 'GLB восстанавливается из зафиксированных в Git частей; полный исходный пакет хранится по описанию в art/knight-v2.'}\n\nCommit: \`${commit}\`. Windows ZIP: ${bytes} байт. SHA-256: \`${checksum}\`.\n`);
  const gh = args => execFileSync('gh', args, { encoding: 'utf8', maxBuffer: 8 * 1024 * 1024 });
  const tag = `godot-knight-preview-${short}`;
  let release;
  try { release = JSON.parse(gh(['api', `repos/${repository}/releases/tags/${tag}`])); } catch { /* First publication. */ }
  if (release) {
    assert.equal(release.target_commitish, commit, 'Existing release targets different code');
    if (release.draft) gh(['release', 'upload', tag, ...files, '--clobber', '--repo', repository]);
  } else {
    gh(['release', 'create', tag, ...files, '--repo', repository, '--target', commit, '--draft', '--prerelease', '--latest=false', '--title', 'Varendor — Knight integration Windows test', '--notes-file', notes]);
  }
  release = JSON.parse(gh(['api', `repos/${repository}/releases/tags/${tag}`]));
  for (const file of files) {
    const asset = release.assets.find(value => value.name === basename(file));
    assert.equal(asset?.state, 'uploaded', basename(file));
    assert.equal(asset.size, statSync(file).size);
    assert.equal(asset.digest, `sha256:${await shaFile(file)}`);
  }
  if (release.draft) gh(['release', 'edit', tag, '--repo', repository, '--draft=false', '--latest=false']);
  release = JSON.parse(gh(['api', `repos/${repository}/releases/tags/${tag}`]));
  assert.equal(release.draft, false);
  const download = release.assets.find(asset => asset.name === basename(archive)).browser_download_url;
  const response = await fetch(download, { signal: AbortSignal.timeout(240000) });
  assert.equal(response.ok, true, 'Public direct ZIP download failed');
  let downloadedBytes = 0;
  const downloadedDigest = createHash('sha256');
  for await (const chunk of response.body) { downloadedBytes += chunk.length; downloadedDigest.update(chunk); }
  assert.equal(downloadedBytes, bytes);
  assert.equal(downloadedDigest.digest('hex'), checksum);
  const result = { sourceCommit: commit, release: release.html_url, download, bytes, sha256: checksum, qaScope: 'knight-integration', nativeGodotGraphicsLinuxPassed: true, linuxGraphicsScope: 'functional diagnostic profile; full-quality still screenshots', videoIsPerformanceBenchmark: false, diagnosticRenderProfile: linux.native.diagnostic_render_profile, nativeCaptureNote: linux.native.measurements?.frame_capture_note, nativeWindowsHeadlessPassed: true, windowsGpuVerified: false, directDownloadVerified: true, nativeSourceArchiveIncluded: existsSync(sourceArchive) };
  writeFileSync(join(output, 'publish-result.json'), JSON.stringify(result, null, 2) + '\n');
  if (process.env.GITHUB_STEP_SUMMARY) writeFileSync(process.env.GITHUB_STEP_SUMMARY, `### Tested knight build\n\n[Download Windows ZIP](${download})\n\nSource: \`${commit}\`\n`, { flag: 'a' });
  console.log(JSON.stringify(result, null, 2));
}
