# Входы чистой сборки и исторические проверки

Аудит выполнен в чистом рабочем дереве от `6279a54`. Геометрия, модели, популяция и игровые характеристики этим блоком не изменяются. Единственное исправление изображения — точное восстановление повреждённой текстуры Kenney из исходного авторского ZIP.

## Восстановленные входы

`scripts/world_final/materialize_payload.py` успешно проверил все части, архивы и записи 12 версионируемых слоёв. Итог: 929 файлов, 877 восстановленных отсутствующих файлов, 0 замен неизвестных файлов. Независимая проверка всех конечных SHA дала 0 расхождений (`materialize-verify.json`). Четыре ранее вручную скопированных файла — оба interior floor `.f32`, `collision-D13.json` и `groundcover-collision-D13.json` — уже входят в этот payload. Причиной их отсутствия был пропущенный шаг материализации, а не потеря файлов из Git.

Дополнительные входы перечислены с SHA в `restored-build-inputs.json`:

- Knight получен штатным `materialize-knight-assets.mjs`; GLB 84 678 496 байт, SHA `9efe4d883ca8c73c0ed7ef43b03833a5d0cd245271bf7c947a14716cd37ceb81`.
- Девять GLB монстров восстановлены из локального исходного кэша. Каждый SHA GLB и содержимое профильного JSON совпали с `generated/monster-profiles.json` внутри точного f251 PCK.
- P1 samples и два wildlife GLB восстановлены из архивов `accepted-windows-6ccf.zip` и `accepted-world-c0f4.zip`; их полные SHA совпали с пинами `restore-knight-build-inputs.py`.
- `generated/world.glb`, 245 600 236 байт, восстановлен из кэша с SHA `4f532c1335829be340e3b4e29f0faf81540d552bdc0f704a16b2887ab172b042`. MD5 исходника совпал с Godot import metadata; связанный импортированный SCN имеет SHA `1e633d092085e697a25b1ef59039e01ea28ec29b89dd85e2272e9a3ad35b7544`, в точности совпавший с записью f251 PCK. Активная final-world ветка эту старую карту не загружает; восстановление сохраняет полноту старых ресурсов.
- ForestLord взят из локального `Varendor_Monsters_v3.zip`: GLB совпал с его `build.json`, автор и source URL — с отслеживаемым CC0 source-lock. SHA архива `4e91dac6cb5c994e51098aeecef4946bb463dd0de93c3dcd95606e10b7724594`. Этот локальный архив отличается от более раннего release-evidence pin; он не объявляется тем же опубликованным архивом. SHA самого ForestLord — `41aeb4e013b70fcb394ebaf5d0a72731de2a6700fd6d877bd636cd2aca2f4e22`.

Восстановленные сырые кэши остаются игнорируемыми. Штатная cloud-цепочка существует в `.github/workflows/world-gameplay.yml`: pinned toolchain → materialize Knight → restore accepted world/P1 → materialize monster/ForestLord → world payload → data → prepare → editor import → dependency verification → export. Восстановление этого дерева проверено по указанным источникам; побайтовая идентичность будущего повторного Blender-экспорта на другой платформе этим аудитом не доказана.

## Повреждённая текстура и экспорт

`public/assets/models/world/Textures/colormap.png` был усечён до 1492 байт; декодер PNG завершался `Truncated File Read`. Восстановлен оригинал 512×512, 11 143 байта, из [Kenney Fantasy Town Kit 2.0](https://kenney.nl/assets/fantasy-town-kit). Все 21 ссылающиеся GLB побайтово совпали с тем же авторским архивом, поэтому палитра соответствует моделям. Полное декодирование PNG прошло; подробные SHA и ZIP entry сохранены в `kenney-colormap-restore.json`.

В f251 обнаружены две отсутствующие ссылки только в отдельных QA: `art_review.gd` → `generated/p1-samples.json`, и Roach review `.tscn` → исключённый `.gd`. Сырой wildcard не гарантировал удаления скомпилированной review-сцены. Генератор `gameplay-export-policy.mjs` теперь применяет Godot `export_filter="exclude"` и явный список четырёх review-сцен/скриптов. Прежние опции и исключения ассетов сохраняются. Активный `V3FacelessSlime`, canonical profiles, stage acceptance, pursuit и nature QA остаются доступны. Реальное содержимое нового PCK следует проверить после экспорта; unit-проверка не выдаётся за проверку готового PCK.

`verify_gameplay_import.gd` расширен: активные модели берутся из canonical profiles, плащи — из runtime ASSETS, природные GLB и текстуры — из manifest. Проверяются также `courtyard-p2`, обе папки активных NPC, runtime shaders и collision JSON природы. Загрузка проверяет настоящие импортированные зависимости, а не только существование исходного GLB. Native-результат этого расширенного helper фиксирует основной агент после завершения editor import.

## Команды для восстановленного дерева

В PowerShell из корня clean audit; `python` и `node` должны указывать на согласованные runtimes. Ни один Godot не запускается параллельно другому.

```powershell
python scripts/world_final/materialize_payload.py
node scripts/materialize-knight-assets.mjs
node --experimental-strip-types scripts/godot-pc-data.mjs
node --experimental-strip-types scripts/world_final/prepare_gameplay.mjs --starter-v3
$qaGodot = 'C:/Users/ttonn/Documents/Codex/2026-09-11/varendor-world-gameplay/work/tools/Godot_v4.6.3-stable_win64_console.exe'
python scripts/godot_run_checked.py --exe $qaGodot --project godot-pc --output work/qa/audit-clean-import-01 --qa-user-root work/qa/audit-user-root --timeout 900 -- --headless --editor --import
python scripts/godot_run_checked.py --exe $qaGodot --project godot-pc --output work/qa/audit-active-dependencies-01 --qa-user-root work/qa/audit-user-root --timeout 180 -- --headless --script "$PWD/scripts/world_final/verify_gameplay_import.gd"
New-Item -ItemType Directory -Force work/audit-build | Out-Null
python scripts/godot_run_checked.py --exe $qaGodot --project godot-pc --output work/qa/audit-export-01 --qa-user-root work/qa/audit-user-root --timeout 900 -- --headless --export-release 'Windows PC' "$PWD/work/audit-build/Varendor.exe"
```

Каталоги evidence должны быть новыми: wrapper намеренно не перезаписывает прежние прогоны. Полностью пустая машина дополнительно выполняет описанные выше штатные restore/materialize шаги accepted world и monsters до `godot-pc-data`; одних Git файлов без материализации недостаточно.

## Разбор старых FAIL

58 связанных тестов прошли (`resource-fixtures-tests.txt`): экспортная политика; encounter balance; quest routes; legacy spawn/territory; nature integration; endurance/plus3; все текущие пространственные проверки предложения 2416.

`encounter-balance` и неизменные objective inputs quest routes расходились только из-за Git CRLF. Проверка разрешает исключительно исходные байты или нормализацию CRLF→LF; текст, пробелы, порядок JSON и записанный SHA не меняются.

Legacy fixtures отставали от уже авторизованных данных: 12 услуг вместо 4, 102 существа/13 типов вместо 53/10, 12 обычных регионов с повторными регионами fire/ice golems. Отдельный первый волк в `(-99,-5)` намеренно патрулирует в радиусе 3,2 м от своей точки. Исправлены ожидания тестов, игра не менялась. Nature baseline предшествовал принятому озеру; теперь тест сохраняет проверку популяций/услуг и равенство текущей географии legacy/P2, а исходные interior SHA продолжают проверяться.

`historical-evidence-ledger.json` явно содержит пять `provenance=unresolved`: старые core game-rules/equipment-stats и три source pin предложения (final-world/collision/navigation). Ни текущие файлы, ни доступные git-версии в LF/CRLF не воспроизвели эти точные SHA. Это незакрытые пробелы происхождения. Проверки исторических endurance/plus3 подтверждают неизменность отчётов и внутреннюю арифметику; они больше не заявляют равенство старого отчёта нынешнему typed-damage коду. Новые runtime-прогоны нужны отдельно.

Для предложения 2416 четыре старых географических SHA действительно найдены в исходном ZIP озера; остальные неизменные входы проверяются непосредственно. Сам `population.json` не переписан, `runtimeEnabled=false`. Все его текущие collision/height/route/spacing/safe-zone проверки сохранены и прошли. PASS этих проверок не закрывает художественные, runtime и исторические source gaps.
