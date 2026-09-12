# Отдельные актёры P2

Пять новых ресурсов не включены автоматически в живой мир. Реестр — `profiles.json`; лицензии — `CREDITS.md`; отчёт — `../../../docs/world-expansion-v3/P2_ACTOR_ADAPTERS_RU.md`.

Явное создание в существующем `VarendorWorld`:

```gdscript
const P2_ADAPTER = preload("res://world-expansion-v3/actors/profile_adapter.gd")
var actor = P2_ADAPTER.create_actor(world, "instance:unique-id", "MOB-02")
```

Метод вызывает `world.make_actor` с отдельным именем модели; возвращённый актёр использует наследник штатного `VarendorAnimationController`. Позицию, серверное движение, authoritative bodyRadius и боевые события продолжает поставлять интегратор. Визуальный адаптер не создаёт урон. `body_radius(actor, snapshot)` отдаёт серверный радиус при его наличии. `event_visual_destination(actor, event)` сохраняет переданную сервером точку назначения.

Проверочная сцена: `res://world-expansion-v3/actors/starter_qa.tscn`. Запуск из каталога Godot-проекта:

```text
Godot_v4.6.3-stable_win64_console.exe --path . --rendering-method gl_compatibility --rendering-driver opengl3 --log-file <absolute-log-path> res://world-expansion-v3/actors/starter_qa.tscn -- --p2-output=<absolute-output-directory>
```

Проверка создаёт стандартный мир и отключает его живое сетевое обновление только в изолированной сцене, затем проверяет пять актёров и сохраняет JSON/15 кадров. Это не сетевой боевой тест. Перед live-интеграцией обязательна калибровка gait под движение: у кабана исходная походка медленная, у волка walk получен изменением времени run. Все пять имеют статус visual candidate.
