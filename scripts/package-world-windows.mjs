import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { resolve, relative, dirname, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import ts from 'typescript';

const sha256=bytes=>createHash('sha256').update(bytes).digest('hex');
const python=process.platform==='win32'?'python':'python3';

/** Use the parser's static dependency list, including type-only imports. No npm on the player's PC. */
export function serverDependencyFiles(root){
  const files=new Set();
  const visit=file=>{
    const absolute=resolve(root,file);
    if(!absolute.startsWith(resolve(root)+sep))throw Error('Server dependency outside the repository');
    const name=relative(root,absolute).split(sep).join('/');
    if(files.has(name))return;
    const source=readFileSync(absolute,'utf8');files.add(name);
    for(const imported of ts.preProcessFile(source,true,true).importedFiles){
      if(imported.fileName.startsWith('node:'))continue;
      if(!imported.fileName.startsWith('.'))throw Error(`Unpackaged server dependency: ${imported.fileName}`);
      visit(resolve(dirname(absolute),imported.fileName));
    }
  };
  visit('server/http-server.mjs');return [...files].sort();
}

export function stageWorldApplication({root,destination,dist=resolve(root,'dist'),commit}){
  if(!/^[a-f0-9]{40}$/.test(commit))throw Error('The exact 40-character source commit is required');
  if(existsSync(destination))throw Error('Package destination must be new; existing saved data will not be overwritten');
  if(!existsSync(resolve(dist,'index.html')))throw Error('Build the production client before packaging');
  const builtTopology=readFileSync(resolve(dist,'assets/world/world-topology.json'));
  if(!builtTopology.equals(readFileSync(resolve(root,'public/assets/world/world-topology.json'))))throw Error('Built client topology differs from the reviewed server map');
  mkdirSync(destination,{recursive:true});
  cpSync(dist,resolve(destination,'dist'),{recursive:true});
  const copy=(from,to=from)=>{mkdirSync(dirname(resolve(destination,to)),{recursive:true});cpSync(resolve(root,from),resolve(destination,to));};
  const dependencies=serverDependencyFiles(root);
  for(const file of dependencies)copy(file);
  copy('packaging/windows/launch-world.mjs','server/launch-world.mjs');
  copy('packaging/windows/RUN_VARENDOR.bat','RUN_VARENDOR.bat');
  copy('packaging/windows/README_PART1_RU.txt','README_TEST_RU.txt');
  copy('server.ps1');
  writeFileSync(resolve(destination,'package.json'),JSON.stringify({private:true,type:'module'})+'\n');
  writeFileSync(resolve(destination,'BUILD_COMMIT.txt'),commit+'\n');
  return dependencies;
}

export function writePackageManifest(destination,metadata){
  const files=[];
  const walk=directory=>{
    for(const entry of readdirSync(directory,{withFileTypes:true}).sort((a,b)=>a.name.localeCompare(b.name))){
      const path=resolve(directory,entry.name);
      if(entry.isSymbolicLink())throw Error('Links are not allowed in the portable package');
      if(entry.isDirectory())walk(path);
      else{const bytes=readFileSync(path);files.push({path:relative(destination,path).split(sep).join('/'),bytes:bytes.length,sha256:sha256(bytes)});}
    }
  };
  walk(destination);
  writeFileSync(resolve(destination,'PACKAGE_MANIFEST.json'),JSON.stringify({schema:1,...metadata,files},null,2)+'\n');
}

export async function packageWorldWindows({root,output,commit,nodeArchive}){
  const sourceCommit=execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim();
  if(commit!==sourceCommit)throw Error('Requested BUILD_COMMIT differs from the checked-out source');
  if(execFileSync('git',['status','--porcelain','--untracked-files=normal'],{cwd:root,encoding:'utf8'}).trim())throw Error('Save and verify the source commit before creating the release package');
  const config=JSON.parse(readFileSync(resolve(root,'packaging/windows/node-runtime.json'),'utf8'));
  const name=`Varendor_Part1_Windows_Test_${commit.slice(0,12)}`;
  mkdirSync(output,{recursive:true});
  const stage=resolve(output,name),archive=resolve(output,`${name}.zip`);
  if(existsSync(archive))throw Error('A package with this source SHA already exists');
  let bytes;
  if(nodeArchive)bytes=readFileSync(nodeArchive);
  else{
    const response=await fetch(config.url,{signal:AbortSignal.timeout(180000)});
    if(!response.ok)throw Error(`Official Node download failed: HTTP ${response.status}`);
    bytes=Buffer.from(await response.arrayBuffer());
  }
  if(sha256(bytes)!==config.sha256)throw Error('Portable Node checksum mismatch');
  const cached=resolve(output,`node-v${config.version}-${config.platform}.zip`);
  writeFileSync(cached,bytes);
  const dependencies=stageWorldApplication({root,destination:stage,commit});
  execFileSync(python,['-c',`import pathlib,sys,zipfile
source,prefix,target=sys.argv[1:]
target=pathlib.Path(target);target.mkdir()
with zipfile.ZipFile(source) as package:
 for name in ('node.exe','LICENSE'):
  (target/name).write_bytes(package.read(prefix+'/'+name))
`,cached,`node-v${config.version}-${config.platform}`,resolve(stage,'runtime')]);
  writePackageManifest(stage,{buildCommit:commit,node:config,serverFiles:dependencies});
  execFileSync(python,['-c',`import pathlib,sys,zipfile
root=pathlib.Path(sys.argv[1]);archive=pathlib.Path(sys.argv[2])
with zipfile.ZipFile(archive,'x',compression=zipfile.ZIP_DEFLATED,compresslevel=9) as package:
 for file in sorted(root.rglob('*')):
  if file.is_file(): package.write(file,file.relative_to(root.parent))
with zipfile.ZipFile(archive) as package:
 bad=package.testzip()
 if bad: raise RuntimeError('ZIP integrity failure: '+bad)
`,stage,archive]);
  const checksum=sha256(readFileSync(archive));
  writeFileSync(archive+'.sha256',`${checksum}  ${name}.zip\n`);
  return {archive,bytes:statSync(archive).size,sha256:checksum,buildCommit:commit};
}

if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
  const args=process.argv.slice(2);
  const option=name=>{const i=args.indexOf(name);return i<0?undefined:args[i+1];};
  const commit=option('--commit')??execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim();
  console.log(JSON.stringify(await packageWorldWindows({root,output:resolve(option('--output')??resolve(root,'..','varendor-release-output')),commit,nodeArchive:option('--node-archive')}),null,2));
}
