# Воспроизведение городских ассетов P2

Скрипты сохраняют наши изменения материалов, размеров и рига в исходном виде. Они не загружают неизвестные файлы и не запускают исходные Blender Text blocks. Требуется Blender 4.2.3 с комплектным NumPy, локальный intake и исходники, указанные в sources.json. MPFB2 привязан к коммиту из комментария исходного ZIP; его GPL-код исполняется как инструмент и не встраивается в модели. Выбраны только перечисленные CC0-материалы MakeHuman/одежда.

Сначала выполните `python scripts/assets/city/verify_sources.py --intake <cache>` обычным Python. Каждый архив должен совпасть по SHA-256. Извлеките его в `extract_to`; для MPFB ожидается каталог `mpfb2-master/src`. Для дома и ворот подходят исходные каталоги из архивов. Скачивание или импорт обновлённого master без проверки не считается воспроизведением принятого источника.

Для каждой части запустите Blender, явно указав отдельный каталог результата:

```text
blender --background --factory-startup --disable-autoexec --python scripts/assets/city/prepare_arch.py -- --intake <cache> --output <new-glb-dir> --reports <new-report-dir> --repo <repo>
blender --background --factory-startup --disable-autoexec --python scripts/assets/city/prepare_npc.py -- --intake <cache> --output <new-glb-dir> --reports <new-report-dir> --repo <repo>
blender --background --factory-startup --disable-autoexec --python scripts/assets/city/prepare_props.py -- --intake <cache> --output <new-glb-dir> --reports <new-report-dir> --repo <repo>
```

arch создаёт только P2_housepack и P2_gatehouse. npc собирает двух полных людей с игровым ригом, удаляет закрытую одеждой кожу и shape keys, фиксирует прозрачность материалов и добавляет авторскую idle. Это промежуточные тела горожан; ни патруль, ни вооружённый страж не заявлены. props нормализует существующий лицензированный деревянный ящик. Камни мостовой и размещение объектов воспроизводятся скриптом city_sample.gd в городском каталоге.

Результат формируется в заданных output/reports. Экспорт GLTF разных версий может отличаться байтами; сравнивайте существующие опубликованные SHA и фактический состав/размеры. Старые принятые модели не перезаписывайте для одной лишь проверки воспроизводимости.

Все новые Godot процессы запускаются исключительно через `scripts/godot_run_checked.py`. Для импорта используйте его режим project с аргументами `--headless --editor --import`; для сцен — `--rendering-method gl_compatibility --rendering-driver opengl3 res://world-expansion-v3/city/city_sample.tscn -- --city-output=<new-output>`. Выходной каталог wrapper всегда новый: он заранее создаёт logfile и сохраняет ошибки. Прямой вызов Godot и прямой check-only недопустимы в этом checkout после диагностированного сбоя логгера.

Фактическая проверка12сентября2026: все пять GLB повторно экспортированы в отдельный каталог и побайтно совпали с принятыми файлами. Результат и SHA скриптов — `docs/world-expansion-v3/city-p2-evidence/CITY_REPRODUCTION_QA.json`.

Фактическая проверка12сентября2026: все пять GLB повторно экспортированы в отдельный каталог и побайтно совпали с принятыми файлами. Результат и SHA скриптов — `docs/world-expansion-v3/city-p2-evidence/CITY_REPRODUCTION_QA.json`.
