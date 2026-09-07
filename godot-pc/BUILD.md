# Varendor native PC preview

Продолжение прежнего репозитория, а не новая игра. Godot отвечает за представление и ввод. `server/` и `src/server/` продолжают рассчитывать бой, предметы, заточку, баланс и прогресс.

Инструменты: Godot **4.6.3 stable** с соответствующими desktop templates, Blender **4.5.9 LTS**, Node **24.20.0** в Windows-пакете, npm lock из корня. Точные скачивания и SHA — `docs/migration/p0/evidence/toolchain-distributions.json` и `packaging/windows/node-runtime.json`. Renderer: Compatibility/OpenGL; Windows x64. Mac/мобильные платформы отложены решением владельца.

Из чистого checkout:

```sh
npm ci
node --experimental-strip-types scripts/godot-pc-data.mjs
blender --background --factory-startup --threads 2 --python-exit-code 1 --python scripts/godot-pc-world.py
godot --headless --path godot-pc --editor --import
godot --headless --path godot-pc --export-release 'Windows PC' /absolute/path/Varendor.exe
godot --headless --path godot-pc --export-release 'Linux QA' /absolute/path/Varendor.x86_64
```

Полная упаковка и публикация: `.github/workflows/godot-pc-preview.yml`. Push с `[pc-preview]` в разрешённую рабочую ветку создаёт отдельный prerelease после проверки Linux native render и Windows EXE/portable Node. `main` не изменяется. QA использует отдельные синтетические SQLite в системной временной папке. Лицензии Godot извлекаются из поставляемого движка и включаются вместе с исходными лицензиями ассетов.

`scripts/godot-pc-data.mjs` извлекает размещение мира из настоящих функций `src/main.ts` через TypeScript AST; реальные `TerrainSurface`, seeded layout, игровые определения, параметры +0…+15 и 60 вероятностей берутся из прежних модулей. `generated/` воспроизводим и не коммитится. `scripts/godot-pc-world.py` сохраняет собранную Blender-сцену в `world-source/Varendor_PC_World.blend`, экспортирует `generated/world.glb`. Это новая сборочная сцена из существующих Git-деривативов, не восстановленные авторские исходники моделей.

Метр: 1 единица. Координатный адаптер: server `(x,z)` → Godot `(x,height,-z)`. Земля и 471 collider происходят из прежней topology; сервер остаётся окончательным источником позиции. Ввод и камера описаны в `main.gd`/`world.gd`; применяется физический код клавиши, с приоритетом модального окна/поля текста. HUD/миникарта — Control, 42 ячейки: шесть колонок и три видимых ряда с прокруткой; экипировка 12; quickbar хранит 32 назначения, 16/32 видимых.

HTTP v1: session, постоянный SSE stream, последовательная очередь input, command и disconnect. SSE собирает полные UTF-8 пакеты с ограничением буфера, восстанавливается с event cursor. Additive contentVersion/mapVersion проверяются перед принятием состояния; generation в input отсекает задержанное движение до телепорта. Серверный epoch и промышленная авторизация остаются открытыми. Старый snapshot не откатывает новый revision. Предметная команда записывается перед отправкой; retry использует тот же commandId и payload, результат показывает серверная receipt. Сравнение и equip используют одинаковый порядок ring1/ring2, ear1/ear2.

Запускатель хранит данные отдельно от пакета. Перед использованием прежней базы создаёт проверенную read-only online backup и играет в её копию. Не найденная база означает новый тест, а не восстановленные личные данные. Личные SQLite и browser localStorage здесь недоступны. Прежний браузерный профиль, старые назначения и production credential store не заявлены перенесёнными. Новые native назначения сохраняются в частной папке рядом с тестовой базой; никакие токены/БД в Git или Release не включаются.

Это первый интеграционный тест P1, не приёмка всей миграции. Старые модели героев/монстров сохранены; финальная визуальная работа, парные UI-эталоны, полноценные VFX, целевая Windows GPU-производительность, постоянный общий сервер и P2–P6 впереди. Для 11 типов старого реквизита повреждённая `colormap.png` не используется в производных материалах; исходный дефект P0-ASSET-001 остаётся открыт.


Исправления PC recovery: native-клиент разрешает столкновения тем же алгоритмом и радиусом .46 м; `collision-qa.json` содержит реальные векторы карты с независимыми ожидаемыми результатами TypeScript. Дистанция камеры проверяется по высоте препятствия. Направление вращения Blender-модулей согласовано с серверной осью Z; иерархические матрицы сохраняются при нормализации.

Настройки: сохраняемые чувствительность/инверсия, MSAA, тени/дальность, туман, декоративная растительность, render-scale и UI-scale, VSync/FPS, окно/без рамки/полный экран. Видеорежим подтверждается за 15 секунд либо возвращается. Размеры окна ограничены текущим монитором; полный экран использует его фактический режим. TAA/FSR2 не предлагаются в Compatibility.

Регрессия: `node --experimental-strip-types --test tests/native-recovery.test.mjs` проверяет 5 классов × 2 размера противника, 20 навыков, точку Астерхолда на реальной карте, отмену подхода и точные награды. `scripts/godot-pc-qa.mjs` дополнительно запускает настоящий Godot и проверяет мышь, подбор по модели, мёртвые цели, две оси камеры, self-cast, Esc, настройки, SSE reconnect, неизменность UID и общую коллизию. Linux/Mesa и Windows без GPU имеют отдельные результаты; они не обещают FPS на пользовательском ПК.
