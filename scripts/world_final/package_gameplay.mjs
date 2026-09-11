import {cpSync,mkdirSync,readFileSync,writeFileSync,existsSync} from 'node:fs';
import {resolve,join,dirname} from 'node:path';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {stageNativeServer} from '../package-godot-pc.mjs';
import {writePackageManifest} from '../package-world-windows.mjs';
const [binary,outputArg,license,nodeArchive]=process.argv.slice(2),root=process.cwd(),output=resolve(outputArg);
const commit=execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim();
const name='Varendor_World_Gameplay_'+commit.slice(0,12),destination=join(output,name);
if(existsSync(destination))throw Error('Package destination already exists');
mkdirSync(destination,{recursive:true});
const dependencies=stageNativeServer(root,destination,{finalWorld:true});
cpSync(binary,join(destination,'Varendor.exe'));
cpSync('packaging/windows/RUN_VARENDOR_PC.bat',join(destination,'RUN_VARENDOR.bat'));
mkdirSync(join(destination,'licenses'),{recursive:true});
cpSync(license,join(destination,'licenses/Godot.txt'));
for(const [from,to] of [['public/assets/licenses','assets'],['public/assets/models/monsters-glb/licenses','monsters']])cpSync(from,join(destination,'licenses',to),{recursive:true});
for(const from of ['art/knight-v2/LICENSES.md','art/forgotten-knight/LICENSES.md','docs/assets/world-source-manifest.json','art/world-final/nature-source/pine-wood/source.json','art/world-final/materials/snow_02/source.json','art/world-final/materials/rock_wall_02/source.json']){const to=join(destination,'licenses',from);mkdirSync(dirname(to),{recursive:true});cpSync(from,to);}
const config=JSON.parse(readFileSync('packaging/windows/node-runtime.json','utf8'));
let bytes;if(nodeArchive)bytes=readFileSync(nodeArchive);else{const r=await fetch(config.url,{signal:AbortSignal.timeout(180000)});if(!r.ok)throw Error('Node download '+r.status);bytes=Buffer.from(await r.arrayBuffer());}
if(createHash('sha256').update(bytes).digest('hex')!==config.sha256)throw Error('Node runtime checksum differs');
const archive=join(output,'node-runtime.zip');writeFileSync(archive,bytes);
const python=process.env.PYTHON??(process.platform==='win32'?'python':'python3');
execFileSync(python,['-c',"import pathlib,sys,zipfile\np=pathlib.Path(sys.argv[3]);p.mkdir()\nwith zipfile.ZipFile(sys.argv[1]) as z:\n for n in ('node.exe','LICENSE'): (p/n).write_bytes(z.read(sys.argv[2]+'/'+n))",archive,`node-v${config.version}-${config.platform}`,join(destination,'runtime')]);
writeFileSync(join(destination,'BUILD_COMMIT.txt'),commit+'\n');
const notes=`VARENDOR — пещера, торговля и управление
Полностью распакуйте ZIP и запустите RUN_VARENDOR.bat. Переносимый Node входит в пакет.

Большая пещера отмечена голубым кольцом: подойдите и нажмите F или щёлкните по метке. Внутри есть обычные монстры и Хранитель глубин 40-го уровня. Выход действует до и после боя. 1001 постоянное место: прежние 1000 и один новый босс.

R — автобег по направлению персонажа, повторное R — остановка; ПКМ — поворот камеры. WASD, новая атака, команда движения, Esc, торговля и переходы отменяют автобег. Space — прыжок, Tab — сумка; они сохраняют автобег.

У торговцев выбирается количество продажи: 1 по умолчанию, −/+, ручной ввод, Все. Перенос в область продажи открывает выбор количества. Иконка переноса сохраняет размер.
Эльза продаёт большое багровое зелье (70 HP, 110 золота) и зелье скорости (100 золота). Обычное багровое восстанавливает 37 HP, цена 55 золота. При полном HP лечебное зелье не расходуется. Скорость: +50% к бегу, +15% к атаке, 10 минут; повторное применение обновляет время.
Таймеры бафов: М:СС свыше минуты, 60 с и меньше — секунды. Источники выпадения скрыты из описаний.

Хранитель глубин: 14400 HP, базовый урон 144, дальность 13 м, массовая атака радиусом 4 м с предупреждением 1,4 с. Возрождение через 30 минут открытой игры; закрытая игра этот таймер не расходует.
Награда: 100000 золота; 3 обычных и 3 улучшенных свитка со случайным типом оружие/доспехи; одно случайное оружие из пяти существующих трофейных видов; шанс 20% на одну случайную книгу 60+ любого класса.

Сохранения продолжают использовать прежний кошелёк, предметы и прогресс. Пусковая программа создаёт проверенную копию найденной прежней базы. Не закрывайте её окно во время игры.
Художественная доработка карты и согласование интерфейса с референсом остаются отдельными этапами.
`;
const updateNotes=`VARENDOR — отдельный этап оформления двора Гринфолла

Внутри прежнего замка: рынок снабжения у Эльзы и Миры, кузница Брана, разгрузка у склада Торва, колодец и скамьи, рабочее место у конюшни, грядки трав и учебный двор. 15 дополнительных жителей: караул, патруль, торговая пара, снабженец, сержант с тремя учениками, подмастерье, носильщик, писарь, садовница и прохожий. Жители ходят, останавливаются, используют имеющиеся анимации и произносят короткие реплики поблизости. Три ворона и два зайца реагируют на приближение.
Шесть действующих НПС сохранили свои места и услуги. Бытовые жители не являются боевыми целями. Основной проход от ворот свободен. Вне замка их движение приостанавливается; при возвращении они не дублируются.
Использованы существующие модели персонажей и животных. Бытовой обмен — постановочная сцена; новую экономическую симуляцию между НПС этот этап не вводит.

`;
writeFileSync(join(destination,'README_RU.txt'),updateNotes+notes);
writeFileSync(join(output,'release-notes.md'),updateNotes+notes+'\nСборка: '+commit+'\n');
writePackageManifest(destination,{kind:'world-final-gameplay-test',buildCommit:commit,permanentPopulation:1001,node:config,serverFiles:dependencies});
writeFileSync(join(output,'package-result.json'),JSON.stringify({name,destination,commit},null,2));
console.log(JSON.stringify({name,destination,commit}));
