# Technical Bible

## Основной стек
- TypeScript
- Babylon.js
- Vite
- GLB/glTF assets
- WebGL/WebGPU-capable rendering path

## Архитектурные принципы
- Игровая логика отделяется от представления и UI.
- Состояние персонажа, инвентаря, мира и боя не должно быть жёстко привязано к localStorage.
- Для локального прототипа используется локальное хранилище/адаптер, но через интерфейсы, которые позже можно заменить на API/backend.
- Сетевой слой проектируется как заменяемый адаптер.
- Ассеты и игровые данные должны иметь централизованные манифесты/конфигурации.

## Будущий backend
Архитектура должна позволять без переписывания ядра подключить:
- auth service;
- character service;
- inventory/equipment service;
- combat authority;
- world/zone server;
- persistence DB;
- multiplayer transport;
- anti-cheat/server validation.

## Структура проекта — целевая
- `src/core` — bootstrap, lifecycle, services
- `src/game` — gameplay systems
- `src/entities` — player, mobs, bosses, NPC
- `src/combat` — damage, targeting, skills
- `src/items` — items, inventory, equipment, enhancement
- `src/world` — zones, spawning, navigation
- `src/ui` — HUD and windows
- `src/data` — balance/config manifests
- `src/network` — network abstractions and local adapters
- `public/assets` — models, textures, audio

## Качество
Каждый этап должен проходить:
- TypeScript/build validation;
- runtime smoke test;
- asset loading check;
- regression of movement/camera/combat/inventory as applicable;
- performance sanity check in browser.

## Ассеты
Предпочтение отдаётся легально пригодным ассетам с понятной лицензией. Источник и лицензия значимых внешних ассетов должны быть документированы.

## Производительность
Цель — стабильный браузерный игровой клиент. Нужно контролировать draw calls, размеры текстур, количество активных скелетов/анимаций, LOD и стоимость эффектов. Архитектура должна учитывать дальнейшее отображение нескольких игроков в одной зоне.
