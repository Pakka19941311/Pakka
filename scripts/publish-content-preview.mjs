// Publish only after the actual exported clients pass the focused content gates.
import assert from 'node:assert/strict';
import {cpSync,existsSync,mkdirSync,readFileSync,rmSync,statSync,writeFileSync,createReadStream} from 'node:fs';
import {basename,join,resolve} from 'node:path';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {writePackageManifest} from './package-world-windows.mjs';

const [directoryArg,...options]=process.argv.slice(2);
assert.ok(directoryArg,'Usage: publish-content-preview.mjs QA_DIRECTORY [--stage]');
const directory=resolve(directoryArg),repository='Pakka19941311/Pakka';
const commit=execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),short=commit.slice(0,12);
const name=`Varendor_Godot_PC_${short}`,output=join(directory,'release'),stage=join(output,name);
const read=path=>JSON.parse(readFileSync(path,'utf8'));
const shaFile=async path=>{const digest=createHash('sha256');for await(const bytes of createReadStream(path))digest.update(bytes);return digest.digest('hex');};
const review=`VARENDOR — ИСПРАВЛЕНИЯ УПРАВЛЕНИЯ, РЫЦАРЯ И СКЛАДА\n\nРаспакуйте весь ZIP и запустите RUN_VARENDOR.bat. Godot и Node включены.\n\nОпыт за убийства временно x20; дроп и серебро этим множителем не увеличиваются.\nЭдрик в Астерхолде продаёт классовые книги 10/20/30/40 уровня за 2000/5000/15000/200000 серебра.\nКнигу из сумки перетащите на панель. Для применения нужны её класс и уровень.\nКниги 50/60 — награда заданий Ардена на Хозяина Гнилого Леса и Стража разлома.\nПокупные книги не расходуются. Старые бесплатные навыки заменены книгами.\nДобавлены 24 голема и босс 25 уровня, смешанный дроп и экипировка со согласованными характеристиками R2.\nАссасину чужая вещь даёт -2 защиты, -2 магзащиты, -2 уклонения за каждый предмет; рыцарская кираса только рыцарю.\nНесовместимая старая экипировка возвращается в сумку или буфер добычи.\n\nИсправлены лишние расходы на далёкие анимации и столкновения. Восстановлены принятые анимации рыцаря; книги используют удары мечом и бафы. Добыча выводится по центру над панелью. На складе можно выбрать количество в обе стороны; совместимые стопки объединяются даже при полной сумке.\n\nЭто тест исправлений. Следующий блок прыжка, стойки и плавного комбо рыцаря остаётся отдельной работой.\nСерверные значения книг для теста перечислены в BOOK_TEST_VALUES.json.\nПроверены серверные механики, интерфейс и анимации в Linux с графикой, поставляемый Windows EXE без графики.\nПроизводительность на игровом Windows GPU проверяется на вашем компьютере.\n\nCommit: ${commit}\n`;

if(options.includes('--stage')){
 const prior=read(join(stage,'PACKAGE_MANIFEST.json'));assert.equal(prior.buildCommit,commit);
 for(const folder of ['knight','knight-base'])mkdirSync(join(stage,'licenses',folder),{recursive:true});
 cpSync('art/knight-v2/LICENSES.md',join(stage,'licenses/knight/LICENSES.md'));
 cpSync('art/forgotten-knight/LICENSES.md',join(stage,'licenses/knight-base/LICENSES.md'));
 for(const file of ['IMPLEMENTATION_RU.md','BOOK_TEST_VALUES.json'])cpSync('docs/content-expansion-v3/'+file,join(stage,file));
 cpSync('art/monsters-v3/source-lock.json',join(stage,'licenses/APPROVED_MONSTERS.json'));
 writeFileSync(join(stage,'README_RU.txt'),review);writeFileSync(join(stage,'CONTENT_TEST_RU.txt'),review);
 const {files:_files,schema:_schema,...metadata}=prior;rmSync(join(stage,'PACKAGE_MANIFEST.json'));
 writePackageManifest(stage,{...metadata,kind:'godot-content-v3-hotfix',qaScope:'content-v3-hotfix',skillBooks:30,approvedMonsterModels:10});
 console.log(JSON.stringify({staged:stage,commit}));
}else{
 assert.equal(process.env.GITHUB_REPOSITORY,repository);assert.equal(process.env.GITHUB_SHA,commit);
 const reports=[];
 for(const [platform,folder]of [['linux','linux'],['win32','windows']]){
  for(const [prefix,file,scope]of [['pc','content-integration.json','content-v3'],['monsters','monster-integration.json','approved-monster-models']]){
   const path=join(directory,`${prefix}-${folder}`,file),report=read(path);
   assert.equal(report.ok,true,`${platform} ${scope}`);assert.equal(report.source,commit);assert.equal(report.platform,platform);assert.equal(report.native.ok,true);assert.equal(report.native.scope,scope);
   if(prefix==='pc'){
    assert.ok(Object.keys(report.native.checks).length>=10);
    for(const [key,value]of Object.entries(report.native.checks))if(key!=='native_render')assert.equal(value,true,key);
    if(platform==='linux')assert.equal(report.native.checks.native_render,true);
   }else{
    assert.equal(Object.keys(report.native.models).length,10);
    for(const model of Object.values(report.native.models)){assert.equal(model.ok,true);assert.ok(model.triangles>100);for(const motion of Object.values(model.pose_motion_metres))assert.ok(motion>.0005);}
    if(platform==='linux')assert.equal(report.native.native_render,true);
   }
   if(platform==='win32')assert.equal(report.node,`v${read('packaging/windows/node-runtime.json').version}`);
   const target=join(output,`${prefix}-${folder}-native-qa.json`);cpSync(path,target);reports.push(target);
  }
 }
 for(const [platform,folder]of [['linux','linux'],['win32','windows']]){
  const path=join(directory,`hotfix-${folder}`,'hotfix-integration.json'),report=read(path);
  assert.equal(report.ok,true);assert.equal(report.source,commit);assert.equal(report.platform,platform);assert.equal(report.playerSavesOpened,false);
  assert.equal(report.native.ok,true);assert.equal(report.native.scope,'owner-seven-hotfixes');
  assert.ok(Object.keys(report.native.checks).length>=18);
  for(const [key,value]of Object.entries(report.native.checks))if(key!=='native_render')assert.equal(value,true,key);
  if(platform==='linux')assert.equal(report.native.checks.native_render,true);
  if(platform==='win32')assert.equal(report.node,`v${read('packaging/windows/node-runtime.json').version}`);
  const target=join(output,`hotfix-${folder}-native-qa.json`);cpSync(path,target);reports.push(target);
 }
 const manifest=read(join(stage,'PACKAGE_MANIFEST.json'));assert.equal(manifest.buildCommit,commit);assert.equal(manifest.qaScope,'content-v3-hotfix');
 for(const file of manifest.files){const path=join(stage,file.path);assert.equal(statSync(path).size,file.bytes,file.path);assert.equal(await shaFile(path),file.sha256,file.path);}
 assert.equal(readFileSync(join(stage,'BUILD_COMMIT.txt'),'utf8').trim(),commit);
 const source=join(directory,'pc-build/Varendor_Monsters_v3.zip'),art=read(join(directory,'pc-build/monster-art.json'));
 assert.equal(art.sourceCommit,commit);assert.equal(art.editableModels,10);assert.equal(art.originalSketchfabSourceArchiveIncluded,true);assert.equal(statSync(source).size,art.bytes);assert.equal(await shaFile(source),art.sha256);
 const archive=join(output,name+'.zip'),epoch=execFileSync('git',['show','-s','--format=%ct',commit],{encoding:'utf8'}).trim();
 execFileSync(process.platform==='win32'?'python':'python3',['-c',`import datetime,pathlib,sys,zipfile
root=pathlib.Path(sys.argv[1]);target=pathlib.Path(sys.argv[2]);stamp=datetime.datetime.fromtimestamp(int(sys.argv[3]),datetime.timezone.utc)
date=(max(1980,stamp.year),stamp.month,stamp.day,stamp.hour,stamp.minute,stamp.second)
with zipfile.ZipFile(target,'w',zipfile.ZIP_DEFLATED,compresslevel=6,allowZip64=True) as archive:
 for path in sorted(root.rglob('*')):
  if path.is_file():
   entry=zipfile.ZipInfo(path.relative_to(root.parent).as_posix(),date_time=date);entry.compress_type=zipfile.ZIP_DEFLATED;entry.create_system=3;entry.external_attr=0o100644<<16
   with path.open('rb') as source,archive.open(entry,'w',force_zip64=True) as destination:
    while chunk:=source.read(1024*1024):destination.write(chunk)
with zipfile.ZipFile(target) as archive:
 if archive.testzip() is not None:raise RuntimeError('ZIP CRC failed')
`,stage,archive,epoch]);
 const checksum=await shaFile(archive),bytes=statSync(archive).size;writeFileSync(archive+'.sha256',`${checksum}  ${basename(archive)}\n`);
 const files=[archive,archive+'.sha256',source,join(directory,'pc-build/monster-art.json'),...reports];
 const notes=join(output,'content-release-notes.md');
 writeFileSync(notes,`Тестовая сборка **VARENDOR — исправления рыцаря, движения и склада** для Windows x64.\n\nРаспакуйте игровой ZIP и запустите **RUN_VARENDOR.bat**.\n\nВосстановлена принятая анимация рыцаря и исправлена привязка книг; уменьшены затраты на далёкие скелеты и столкновения. Проверены длинный бег и остановки. Добыча расположена по центру над панелью. Склад поддерживает выбор количества и объединение стопок при полной сумке.\n\nСохранены 30 книг, задания 50/60, бафы и опыт ×20. Големы, босс 25 уровня, обновлённые одобренные модели, смешанный дроп, предметы R2 и классовая экипировка.\n\nLinux проверен с графикой; поставляемый Windows EXE и portable Node — без графики. В отчётах приведены фактические проверки. Это не замер Windows GPU.\n\n**Varendor_Monsters_v3.zip** содержит 10 редактируемых Blender-моделей, текстуры, игровые GLB, оригиналы и лицензии. [Исходники игры и точные тестовые значения](https://github.com/${repository}/tree/${commit}/docs/content-expansion-v3). Прыжок, стойка и плавное комбо рыцаря остаются отдельным следующим блоком.\n\nCommit: \`${commit}\`. Windows ZIP: ${bytes} байт. SHA-256: \`${checksum}\`.\n`);
 const gh=args=>execFileSync('gh',args,{encoding:'utf8',maxBuffer:8*1024*1024}),tag=`godot-content-preview-${short}`;
 const findRelease=()=>{for(let page=1;;page++){const releases=JSON.parse(gh(['api',`repos/${repository}/releases?per_page=100&page=${page}`]));const found=releases.find(r=>r.tag_name===tag);if(found){assert.equal(found.target_commitish,commit);return found;}if(releases.length<100)return undefined;}};
 let release=findRelease();
 if(release){if(release.draft)gh(['release','upload',tag,...files,'--clobber','--repo',repository]);}
 else{gh(['release','create',tag,...files,'--repo',repository,'--target',commit,'--draft','--prerelease','--latest=false','--title','Varendor — Knight, movement and storage hotfix','--notes-file',notes]);release=findRelease();}
 assert.ok(release?.id);const releaseId=release.id;
 release=JSON.parse(gh(['api',`repos/${repository}/releases/${releaseId}`]));assert.equal(release.target_commitish,commit);
 for(const file of files){const asset=release.assets.find(a=>a.name===basename(file));assert.equal(asset?.state,'uploaded');assert.equal(asset.size,statSync(file).size);assert.equal(asset.digest,`sha256:${await shaFile(file)}`);}
 if(release.draft)gh(['api','--method','PATCH',`repos/${repository}/releases/${releaseId}`,'-F','draft=false','-f','make_latest=false']);
 release=JSON.parse(gh(['api',`repos/${repository}/releases/tags/${tag}`]));assert.equal(release.id,releaseId);assert.equal(release.draft,false);
 const download=release.assets.find(a=>a.name===basename(archive)).browser_download_url;
 const response=await fetch(download,{signal:AbortSignal.timeout(300000)});assert.equal(response.ok,true,'Public direct ZIP download');
 let downloadedBytes=0;const digest=createHash('sha256');for await(const chunk of response.body){downloadedBytes+=chunk.length;digest.update(chunk);}assert.equal(downloadedBytes,bytes);assert.equal(digest.digest('hex'),checksum);
 const result={sourceCommit:commit,release:release.html_url,download,bytes,sha256:checksum,qaScope:'content-v3-hotfix',hotfixNativeChecksPassed:true,linuxNativeGraphicsPassed:true,windowsNativeHeadlessPassed:true,windowsGpuVerified:false,directDownloadVerified:true,editableMonsterModels:10,sourceArchive:release.assets.find(a=>a.name===basename(source)).browser_download_url};
 writeFileSync(join(output,'publish-result.json'),JSON.stringify(result,null,2)+'\n');
 if(process.env.GITHUB_STEP_SUMMARY)writeFileSync(process.env.GITHUB_STEP_SUMMARY,`### VARENDOR content V3\n\n[Windows ZIP](${download})\n\nCommit: \`${commit}\`\n`,{flag:'a'});
 console.log(JSON.stringify(result,null,2));
}
