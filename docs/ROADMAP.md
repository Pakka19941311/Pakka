# Roadmap

## Текущий статус — 2026-09-03

- Milestone 1 собран и стабилизирован в версии v0.3.
- В прототип также интегрированы части Milestone 2–3: пять классов, 20 навыков, несколько типов мобов, NPC, магазин, кузница, заточка и два босса.
- Следующий этап продолжает Milestone 2: полировка боевого ощущения Region 1, визуальный QA и оптимизация до расширения мира.

## Milestone 1 — Играбельное локальное ядро
- bootstrap Babylon/Vite/TypeScript;
- игровая сцена;
- персонаж и камера;
- движение;
- базовые анимации;
- target selection;
- базовая атака;
- один полноценный противник;
- XP/level;
- дроп;
- инвентарь;
- экипировка;
- локальное сохранение через заменяемый persistence adapter;
- первый визуально оформленный HUD.

## Milestone 2 — Вертикальный срез
- класс Knight как полноценно играемый baseline;
- несколько типов мобов;
- мини-босс;
- боевые навыки;
- полноценные UI окна персонажа/инвентаря/скиллов;
- первая завершённая dark-fantasy локация;
- звук/VFX;
- оптимизация.

## Milestone 3 — RPG-системы
- остальные классы;
- статовая система;
- item generation/data;
- enhancement +0…;
- расширенная прогрессия;
- боссы;
- зоны 1–100 по этапам;
- NPC/shops/quests по принятому дизайну.

## Milestone 4 — Multiplayer-ready refactor validation
- проверка всех систем на отсутствие жёсткой зависимости от локального режима;
- network contracts;
- server-authoritative boundaries;
- подготовка persistence migration.

## Milestone 5 — Backend и онлайн
- accounts/auth;
- database;
- character persistence;
- multiplayer zones;
- other players visibility;
- PvP;
- server-side combat/drop/economy validation;
- anti-cheat boundaries.

## Правило этапов
Каждый Milestone считается завершённым только после сборки, runtime QA и проверки основных пользовательских сценариев.
