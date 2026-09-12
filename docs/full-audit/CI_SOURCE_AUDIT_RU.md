# CI исходников после аудита стабильности

В существующем `.github/workflows/world-gameplay.yml` добавлен отдельный job
`source-audit`. Он запускается при push в `work/character-art-v3`, когда сообщение
последнего коммита содержит `[source-audit]`. Job имеет только `contents: read`.
Для этого запуска не нужен маркер `[world-gameplay]`: последний по-прежнему
включает прежнюю цепочку Blender → Godot → Windows → публикация.

Проверка исходников не создаёт EXE, ZIP или релиз. Проверенный локальный пакет
публикуется отдельно с собственным SHA. Не следует добавлять оба маркера в один
публикуемый commit, если повторная нативная сборка не нужна.

## Порядок проверки

1. Чистый checkout; закреплённые Node 24.20.0 и Python 3.12; `npm ci`.
2. `python scripts/world_final/materialize_payload.py` восстанавливает входы
   из версионируемых payload-слоёв с проверкой SHA частей, архивов и каждого файла.
   Неизвестное локальное содержимое не перезаписывается.
3. `node --experimental-strip-types scripts/godot-pc-data.mjs` создаёт
   `godot-pc/generated` из действующих каталогов, топологии и tracked-ассетов.
4. `node --experimental-strip-types scripts/world_final/prepare_gameplay.mjs --starter-v3`
   формирует mapVersion и данные клиента из настоящего `FinalWorld`.
5. `npm audit --audit-level=high --json`, полный `npm test`, затем `npm run build`.
   Последний уже включает `tsc --noEmit`, `verify:assets` и Vite. Ошибка любого
   шага завершает job неуспехом; bash использует `pipefail`, поэтому `tee` не
   скрывает ошибку тестов или сборки.
6. Логи и JSON сохраняются как `stability-source-audit`, включая неуспешный запуск.

`npm audit` проверяет текущий ответ реестра, поэтому прежний локальный результат
не гарантирует будущий PASS. Его ошибка или сетевая недоступность не замалчиваются.

## Доступность входов на холодном runner

| Вход | Источник | Нужен импорт движком |
|---|---|---|
| Heightmap, collision, supports, world layout и остальные данные FinalWorld | `art/world-final/payload-manifest.json` и tracked-части `art/world-final/payload/` | Нет |
| `generated/game.json`, карты, иконки, аудио и базовые модели клиента | `godot-pc-data.mjs`, tracked TS/JSON, `art/item-icons-v3`, `art/skill-books-v1`, `public/assets` | Нет |
| Пять активных MOB, включая новый авторский slime, boar и roach-six | Канонический `actors/profiles.json`, tracked GLB и license/credit файлы | Нет |
| Плащи, городские motion/production NPC и проверяемые материалы | Tracked GLB, manifest и `.glb.import` | Нет |
| Архитектура, P2 nature, озеро, документированные геометрические проверки | Tracked исходники/метаданные и проверенный payload | Нет |
| Browser-модели, текстуры, звуки и prepared assets для `verify:assets`/Vite | Tracked `public/assets` | Нет |

В ранее выполненной материализации clean audit проверены 929 конечных файлов
из 12 слоёв; подробная история восстановления находится в
`docs/world-expansion-v3/audit-20260912/resources/REPRO_RU.md`.
Этот CI-проход заново проверяет manifest, а не доверяет тем историческим цифрам.

Особый случай: `production-actor-assets.test.mjs` читает `.glb.import` двух NPC.
В Git оба файла присутствуют с `materials/extract=0` и без внешних PNG-ссылок;
GLB содержит изображения. Локальные изменения этих файлов после editor import
и извлечённые PNG не являются входами холодного source job. Motion-тесты читают
исходные GLB и сохранённые измерения, не `.godot/imported`.

`native-package-geography.test.mjs` проверяет настоящий staged `FinalWorld` в
обоих режимах населения. Он использует восстановленные JSON/F32, без EXE или
редакторских моделей. `stage-art-packs.test.mjs` использует tracked производные
boar/roach-six и тексты лицензий; приватные исходные архивы ему не нужны.

В source job не восстанавливаются `generated/world.glb`, девять старых runtime
моделей из `art/monsters-v3/runtime`, `ForestLord.glb` и Blender-файлы. Эти входы
нужны отдельной нативной сборке; текущая полная Node suite и Vite их не читают.
`godot-pc-data.mjs` явно допускает отсутствие этих optional runtime-моделей.
Это не исключает канонический P2 slime: его профиль ссылается на tracked GLB,
который проверяется `production-actor-assets.test.mjs` и export-policy тестами.

## Кеши и границы подтверждения

Source job использует только кеш загрузок npm; `npm ci` всё равно устанавливает
lockfile. Кеши Blender/монстров/`.godot` не участвуют, поэтому cache hit или miss
не меняет источник геометрии и не требует ручных локальных восстановлений.

Нативный `[world-gameplay]` job сохранён. При cache miss его прежние генераторы
создают legacy-модели; при cache hit используются сохранённые outputs. В этом job
также заменён выборочный список Node-тестов на `npm test`. Нативная CI-сборка не
объявляется побайтовой копией локального EXE. Название Windows-проверки теперь
прямо указывает headless: это не графическая приёмка.

Для изменения workflow выполнены статическая проверка цепочки чтения входов,
проверка tracked NPC import-файлов и bash-синтаксиса новых команд. Движок,
материализация, полная suite и Vite повторно локально не запускались: изменение
не меняет игровой код, а локальная suite уже отдельно прошла 731 тест. Фактический
результат нового Ubuntu job станет известен после push с `[source-audit]`.
