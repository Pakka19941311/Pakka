"""Package only a checked, standalone walk preview. No player databases."""
from pathlib import Path
import argparse,hashlib,json,shutil,subprocess,zipfile
p=argparse.ArgumentParser();p.add_argument('binary',type=Path);p.add_argument('output',type=Path);p.add_argument('qa',type=Path)
a=p.parse_args();root=Path(__file__).resolve().parents[2]
commit=subprocess.check_output(['git','rev-parse','HEAD'],cwd=root,text=True).strip()
name='Varendor_World_Walk_'+commit[:12];stage=a.output/name;stage.mkdir(parents=True,exist_ok=False)
for space in ['surface','mine','great_cave']:
    report=json.loads((a.qa/space/'preview-qa.json').read_text('utf-8'))
    assert report['ok'] and report['headless'] and not report['personal_saves_opened']
shutil.copy2(a.binary,stage/'Varendor.exe')
(stage/'RUN_VARENDOR.bat').write_bytes(b'@echo off\r\nsetlocal\r\ncd /d "%~dp0"\r\nset "WALK_LOG_DIR=%LOCALAPPDATA%\\VarendorWorldWalk\\logs"\r\nif not exist "%WALK_LOG_DIR%" mkdir "%WALK_LOG_DIR%"\r\n:choose_log\r\nset "WALK_LOG=%WALK_LOG_DIR%\\walk-%RANDOM%-%RANDOM%.log"\r\nif exist "%WALK_LOG%" goto choose_log\r\ntype nul > "%WALK_LOG%"\r\nif errorlevel 1 (echo Cannot create game log. & pause & exit /b 1)\r\nstart "" "%~dp0Varendor.exe" --log-file "%WALK_LOG%"\r\n')
readme='''VARENDOR — промежуточная прогулка по новому миру

Распакуйте весь ZIP и запустите RUN_VARENDOR.bat.
Установка Godot, Blender или Node не требуется.
Запускатель заранее создаёт отдельный журнал в %LOCALAPPDATA%/VarendorWorldWalk/logs.

Меню: новый мир, шахта, большая пещера. На поверхности сверху выбирается
локация для быстрого перемещения. Можно пройти дороги пешком.
WASD — бег, пробел — прыжок, ПКМ — вращение камеры, колесо — приближение.
Esc — меню и пауза, F11 — переключить окно/полный экран.
F1 — общий вид поверхности или срез интерьера, F2 — вернуться к герою.

Это промежуточный D13: 1600 × 1400 метров, рельеф, дороги, подъёмы,
архитектура, лес, трава и скалы. Шахта и пещера — отдельные пространства.
Лес и трава сохранены в полном количестве. Использован принятый рыцарь,
действующие классы управления, камеры и анимации.

Ещё не готовы: финальное качество окружения, вода и атмосфера, миникарта
и карта, население и игровые переходы нового мира. Эта прогулка без боя,
NPC и инвентаря; сервер и личные сохранения не открываются. Предыдущую
игровую сборку можно продолжать использовать отдельно.

Проверены реальные кадры и движение в локальном Godot на Windows.
Поставляемый EXE проверен GitHub Actions на Windows без графического окна:
загрузка трёх пространств, движение, остановка, меню, файлы внутри PCK.
Это не финальная приёмка мира и не замер производительности вашего GPU.
'''
(stage/'README_RU.txt').write_text(readme+'\nCommit: '+commit+'\n',encoding='utf-8-sig')
(stage/'BUILD_COMMIT.txt').write_text(commit+'\n')
for source in ['art/knight-v2/LICENSES.md','art/forgotten-knight/LICENSES.md','docs/assets/world-source-manifest.json','art/world-final/nature-source/pine-wood/source.json','art/world-final/materials/snow_02/source.json','art/world-final/materials/rock_wall_02/source.json']:
    target=stage/'licenses'/source;target.parent.mkdir(parents=True,exist_ok=True);shutil.copy2(root/source,target)
shutil.copytree(a.qa,stage/'checks')
sha=lambda path:hashlib.sha256(path.read_bytes()).hexdigest()
files=[{'path':x.relative_to(stage).as_posix(),'bytes':x.stat().st_size,'sha256':sha(x)} for x in sorted(stage.rglob('*')) if x.is_file()]
(stage/'PACKAGE_MANIFEST.json').write_text(json.dumps({'commit':commit,'kind':'world-walk-intermediate','files':files},indent=2)+'\n')
archive=a.output/(name+'.zip')
with zipfile.ZipFile(archive,'w',zipfile.ZIP_DEFLATED,compresslevel=6) as z:
    for path in sorted(stage.rglob('*')):
        if path.is_file():z.write(path,path.relative_to(stage.parent).as_posix())
with zipfile.ZipFile(archive) as z:assert z.testzip() is None
(a.output/(name+'.zip.sha256')).write_text(sha(archive)+'  '+archive.name+'\n')
notes=a.output/'release-notes.md'
notes.write_text('Промежуточная **прогулка по новому миру VARENDOR** для Windows x64.\n\nРаспакуйте ZIP и запустите **RUN_VARENDOR.bat**. Меню: поверхность, шахта и пещера; сверху — быстрый переход по локациям. WASD, ПКМ, пробел; Esc — меню, F1/F2 — обзор/герой, F11 — окно.\n\nЭто текущий D13, без населения и боя в новом мире. Финальный визуал, атмосфера и карты ещё в работе. Личные сохранения не открываются. Это не замена старой игровой сборки.\n\nИсходники, Blender и GLB сохранены в Git в проверяемых слоях art/world-final/payload. Локальные графические проверки и проверка поставляемого EXE на Windows без графики описаны в README.\n\nCommit: `'+commit+'`. SHA-256: `'+sha(archive)+'`.\n',encoding='utf-8')
print(json.dumps({'archive':str(archive),'commit':commit,'sha256':sha(archive),'bytes':archive.stat().st_size}))
