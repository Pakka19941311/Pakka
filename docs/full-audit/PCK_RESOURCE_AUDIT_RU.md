# Проверка готового EXE: ресурсы и версия проверки стабильности

Проверен завершённый `work/qa/audit-build-01/Varendor.exe`, 1 826 279 064 байта, Godot 4.6.3. Чтение началось после сигнала READY основного агента. Полный проход по EXE завершился до начала графического измерения стабильности; затем читались только индекс и 11 КБ нужного скомпилированного скрипта. Godot, Blender, сервер и сохранения этой проверкой не запускались.

`PCK_RESOURCE_AUDIT.json`: **PASS**. Проверены MD5 всех **3974 записей** непосредственно в embedded PCK; повреждений нет. Все import/remap указывают на присутствующие цели. **278 активных ссылок** из D13 terrain/nature/groundcover, impostor, canonical P2 profiles, P2 nature manifest, плащей, NPC и интерьеров доступны через ресурс или его действительный remap.

В PCK отсутствуют отложенная `cohort-06-10`, прежняя `alternatives/roach`, обе review-сцены `art_review`/`roach_qa`, включая скомпилированные `.scn`. `stage_acceptance`, `p2_pursuit_acceptance`, `p2_nature_acceptance` сохранены. Активный новый слизень определяется самим embedded canonical profile и не попадает под исключения старой модели.

Все **16 общих файлов геометрии** в EXE совпали по SHA256 сначала с восстановленными входами, затем с **окончательным staged server** `Varendor_World_Gameplay_32bb3320f9ec`. `mapVersion`, режим `starter-v3` и вместимость 1151 совпали с реально созданным `FinalWorld` из собственного `src/world/final-world.ts` этого пакета. Финальный результат — `PCK_STAGED_GEOMETRY_AUDIT.json`, `serverDataScope=packaged-directory`, **PASS**. Первый полный проход честно сохраняет пометку `checkout-before-staging`; поздняя проверка не перечитывала весь EXE во время графического теста, что отмечено как `geometry-only`. SHA EXE в package manifest совпадает с полным вычисленным SHA первого прохода: `8075f789f0829f60c0946ead64613fb2a4a560d70e00a12a795e5fc00c8cddb7`.

Отдельный обязательный native helper основного агента уже загрузил **571 ресурс, 563 сцены**, `missing=[]`, ошибок движка 0, за 18,406 с (`audit-active-dependencies-01`). Наличие файлов и успешная загрузка не доказывают художественное качество или плавность игрового кадра.

## Актуальность native_stability_acceptance

Одной даты изменения исходника недостаточно. Из EXE прочитан настоящий `scripts/native_stability_acceptance.gdc`: Godot tokenizer **101**, Zstandard. Декодер сверяет структуру по [официальному формату Godot](https://github.com/godotengine/godot/blob/4.6-stable/modules/gdscript/gdscript_tokenizer_buffer.cpp), а распаковку выполняет встроенный Node zlib.

`STABILITY_COMPILED_SOURCE.json`: все **3474 токена**, включая имена, типизированные строковые/числовые константы, ключевые слова и операторы, совпали с текущим исходником; совпали номера строк и все **210 записей колонок/отступов**. Комментарии и пробельное оформление, которые Godot не сохраняет в токенах, не сравниваются как байткод.

- GDC SHA256: `5aed81bc56cefa44c9ad71243fdddb2be6e7452bf95cf6bed586ae93cf6709b0`.
- Исходник LF SHA256: `5710bc55eccd68c7a7afbe21b5d94a6c8d74f85eacbca49040b79e278b01abdc`.
- Три отрицательных контроля — изменение числа, имени переменной и отступа — каждый дали несовпадение. Поэтому свежие дополнения этой QA действительно находятся в EXE.

## Повторение

```powershell
python scripts/audit-pck.py --exe <готовый-EXE> --server-root <каталог-пакета-или-checkout> --node <Node24.exe> --output <новый-report.json>
python scripts/audit-pck.py --exe <тот-же-готовый-EXE> --server-root <окончательный-каталог-пакета> --node <Node24.exe> --geometry-only --output <новый-parity-report.json>
python scripts/audit-gdc-source.py --exe <готовый-EXE> --source godot-pc/scripts/native_stability_acceptance.gd --resource res://scripts/native_stability_acceptance.gd --node <Node24.exe> --output <новый-source-report.json>
python tests/audit-artifact.test.py
```

Три небольших теста checker прошли: существующая/пропавшая цель remap, обнаружение испорченных байтов и усечённого footer, чувствительность к числам/отступам. Декодер GDC намеренно ограничен проверенным подмножеством синтаксиса; неподдерживаемый тип константы или оператор завершается ошибкой, а не считается совпадением. Чекеры отказываются перезаписывать прежние отчёты.
