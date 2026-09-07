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
writeFileSync(notes, `Первый тест Varendor на **Godot native + Blender для Windows x64**.\n\nРаспакуйте ZIP и запустите **RUN_VARENDOR.bat**. Движки и Node устанавливать не нужно.\n\nВнутри: текущий мир из Git, пять классов, действующий сервер боя/предметов/заточки, HUD, инвентарь 42/12 и 32 сохраняемых назначения. Это начало нативного переноса, полная визуальная приёмка P1–P6 ещё впереди.\n\nТест работает с отдельной базой. Найденная старая SQLite копируется с проверкой; исходная база не изменяется. Доступа к личным данным владельца у разработчика не было. Назначения прежнего браузера автоматически не извлечены.\n\nПроверены нативный Godot render в Linux/Mesa и запуск поставляемого Windows EXE + Node без графики. **Windows GPU/FPS проверяются на пользовательском ПК.** Mac и мобильные платформы отложены. Известен старый дефект colormap у части реквизита; в производной сцене использован цвет материала.\n\nИсходный commit: \`${commit}\`. ZIP: ${bytes.length} байт. SHA-256: \`${checksum}\`.\n`);
const linuxAsset = join(output, 'linux-native-qa.json'), windowsAsset = join(output, 'windows-native-qa.json');
writeFileSync(linuxAsset, JSON.stringify(linux, null, 2) + '\n');
writeFileSync(windowsAsset, JSON.stringify(windows, null, 2) + '\n');
const screenshot = join(directory, 'pc-linux/native-runtime.png');
const files = [archive, archive + '.sha256', linuxAsset, windowsAsset, screenshot];
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
  nativeWindowsHeadlessPassed: true, nativeGodotGraphicsLinuxPassed: true, windowsGpuVerified: false, directDownloadVerified: true };
writeFileSync(join(output, 'publish-result.json'), JSON.stringify(result, null, 2) + '\n');
console.log(JSON.stringify(result, null, 2));
