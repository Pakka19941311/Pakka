import { cpSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { serverDependencyFiles, writePackageManifest } from './package-world-windows.mjs';

const hash = bytes => createHash('sha256').update(bytes).digest('hex');
export function stageNativeServer(root, destination) {
  mkdirSync(destination, { recursive: true });
  const copy = (from, to = from) => { const target = resolve(destination, to); mkdirSync(dirname(target), { recursive: true }); cpSync(resolve(root, from), target); };
  const dependencies = serverDependencyFiles(root);
  for (const file of dependencies) copy(file);
  copy('scripts/p0-backup-world.mjs');
  copy('public/assets/world/world-topology.json');
  copy('packaging/windows/launch-native.mjs', 'launch-native.mjs');
  writeFileSync(resolve(destination, 'package.json'), '{"private":true,"type":"module"}\n');
  return dependencies;
}

export async function packageNative({ root, output, binary, nodeArchive }) {
  const commit = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim();
  const name = `Varendor_Godot_PC_${commit.slice(0, 12)}`;
  const destination = resolve(output, name);
  if (existsSync(destination)) throw Error('Package directory already exists');
  const dependencies = stageNativeServer(root, destination);
  cpSync(binary, join(destination, 'Varendor.exe'));
  cpSync(join(root, 'public/assets/licenses'), join(destination, 'licenses/assets'), {recursive:true});
  cpSync(join(root, 'public/assets/models/monsters-glb/licenses'), join(destination, 'licenses/monsters'), {recursive:true});
  cpSync(join(root, 'qa-artifacts/pc-linux/godot-license.txt'), join(destination, 'licenses/Godot.txt'));
  cpSync(join(root, 'packaging/windows/RUN_VARENDOR_PC.bat'), join(destination, 'RUN_VARENDOR.bat'));
  cpSync(join(root, 'packaging/windows/TEST_FRAME_PACING.bat'), join(destination, 'TEST_FRAME_PACING.bat'));
  cpSync(join(root, 'packaging/windows/VIEW_WORLD_SAMPLES.bat'), join(destination, 'VIEW_WORLD_SAMPLES.bat'));
  cpSync(join(root, 'qa-artifacts/pc-build/p1-samples'), join(destination, 'world-sources/P1'), {recursive:true});
  cpSync(join(root, 'packaging/windows/README_GODOT_PC_RU.txt'), join(destination, 'README_RU.txt'));
  const config = JSON.parse(readFileSync(join(root, 'packaging/windows/node-runtime.json'), 'utf8'));
  let bytes;
  if (nodeArchive) bytes = readFileSync(nodeArchive);
  else {
    const response = await fetch(config.url, { signal: AbortSignal.timeout(180000) });
    if (!response.ok) throw Error(`Node download HTTP ${response.status}`);
    bytes = Buffer.from(await response.arrayBuffer());
  }
  if (hash(bytes) !== config.sha256) throw Error('Portable Node SHA-256 mismatch');
  const cached = join(output, 'node-runtime.zip');
  writeFileSync(cached, bytes);
  execFileSync(process.platform === 'win32' ? 'python' : 'python3', ['-c', `import pathlib,sys,zipfile
target=pathlib.Path(sys.argv[3]);target.mkdir()
with zipfile.ZipFile(sys.argv[1]) as z:
 for name in ('node.exe','LICENSE'): (target/name).write_bytes(z.read(sys.argv[2]+'/'+name))
`, cached, `node-v${config.version}-${config.platform}`, join(destination, 'runtime')]);
  writeFileSync(join(destination, 'BUILD_COMMIT.txt'), commit + '\n');
  const evidence = join(root, 'godot-pc/generated/blender-build.json');
  if (existsSync(evidence)) cpSync(evidence, join(destination, 'BLENDER_BUILD.json'));
  writePackageManifest(destination, { kind: 'godot-native-pc-preview', buildCommit: commit, godot: '4.6.3', blender: '4.5.9', node: config, serverFiles: dependencies });
  return { name, destination, commit };
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [binary, output, nodeArchive] = process.argv.slice(2);
  if (!binary || !output) throw Error('Usage: node scripts/package-godot-pc.mjs WINDOWS_EXE OUTPUT_DIR [NODE_ZIP]');
  console.log(JSON.stringify(await packageNative({ root: process.cwd(), output: resolve(output), binary: resolve(binary), nodeArchive })));
}

