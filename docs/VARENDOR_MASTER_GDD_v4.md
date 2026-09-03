# VARENDOR

# MASTER GAME DESIGN DOCUMENT + DEVELOPMENT DIRECTIVE

## Production Specification v4.0

### Hardcore Browser 3D MMORPG / Open World / Dark Fantasy / PvP

---

# 0. НАЗНАЧЕНИЕ ДОКУМЕНТА

Этот документ является главным источником истины при разработке игры **VARENDOR**.

Он одновременно является:

- Master Prompt;
- Game Design Document;
- Technical Design Document;
- Balance Specification;
- Content Specification;
- World Design Specification;
- Combat Specification;
- Economy Specification;
- UI/UX Specification;
- Backend Specification;
- QA Specification;
- Development Directive.

При конфликте между старым решением, случайным предложением разработчика и настоящим документом приоритет имеет настоящий документ.

---

# 1. РОЛИ В ПРОЕКТЕ

## Владелец проекта

Пользователь выполняет роль:

- владельца продукта;
- Game Director;
- постановщика задач;
- тестировщика;
- человека, утверждающего игровой и визуальный результат.

Пользователь НЕ обязан:

- программировать;
- выбирать библиотеки;
- выбирать архитектуру;
- разбираться в серверной инфраструктуре;
- проектировать классы данных;
- писать SQL;
- создавать shaders;
- заниматься оптимизацией;
- принимать технические решения реализации.

---

# 2. РОЛЬ ИИ

ИИ выполняет функции:

- Lead Game Developer;
- Technical Architect;
- Game Systems Designer;
- MMORPG Designer;
- Combat Designer;
- Economy Designer;
- Level Designer;
- World Designer;
- Backend Developer;
- Frontend Developer;
- 3D Developer;
- Database Architect;
- UI/UX Designer;
- QA Engineer;
- Performance Engineer;
- Balance Designer.

Если техническая задача понятна, ИИ самостоятельно принимает техническое решение.

Нельзя спрашивать владельца:

> Какую библиотеку использовать?

> Какую структуру БД выбрать?

> Как назвать класс?

> Как реализовать синхронизацию?

> Можно ли переписать модуль?

> Какой rendering engine использовать?

Это ответственность разработчика.

---

# 3. КОГДА МОЖНО ЗАДАВАТЬ ВОПРОС ВЛАДЕЛЬЦУ

Только если решение существенно меняет саму игру.

Например:

- изменить правила PvP;
- добавить потерю экипировки;
- изменить safe enhancement;
- добавить новый класс;
- полностью изменить эстетику мира;
- ввести pay-to-win;
- изменить maximum level;
- изменить принцип itemization.

---

# 4. LOCKED CORE RULES

Следующие правила считаются фундаментом проекта.

Не изменять без прямого решения Game Director.

### Жанр

Hardcore old-school dark-fantasy MMORPG.

### Клиент

Запуск непосредственно через браузер.

### Мир

Свободный связанный 3D-мир.

### Камера

3/4 сверху / isometric-inspired perspective.

### Максимальный Level

**100.**

### Классов

**5.**

1. Knight
2. Mage
3. Assassin
4. Ranger
5. Necromancer

### Open PvP

С Level 30.

### Capital

Safe Zone.

### Regions

Новая крупная территория каждые 10 уровней.

### Item Level Requirement

**Отсутствует полностью.**

### Item Rarity Colors

**Не существует.**

### Enhancement

+0 → +15.

### Safe Enhancement

До +3 включительно.

### Первый риск разрушения

Попытка +3 → +4.

### Failure

Полное уничтожение предмета.

### Mini Raid Boss Respawn

30–50 минут.

### Pit Boss Respawn

7 часов.

### Loot

Автоматически поступает в inventory.

### Main Leveling

Grind.

### World Scaling

Запрещён.

---

# 5. ОСНОВНАЯ ФАНТАЗИЯ ИГРОКА

Игрок должен чувствовать:

> Я существую в настоящем опасном мире.

Не:

> Я прохожу список контента.

Игрок должен помнить:

- первый серьёзный меч;
- первую сломанную +4 вещь;
- первый +7;
- первого Pit Boss;
- первый захваченный spot;
- первую PvP-войну;
- человека, который украл boss;
- место выпадения конкретной вещи;
- путь между территориями.

---

# 6. ПЯТЬ ОСНОВНЫХ СТОЛПОВ

## I. HARD PROGRESSION

Уровень имеет цену.

## II. MEANINGFUL ITEMS

Вещей относительно немного.

Каждая имеет смысл.

## III. DESTRUCTIVE ENHANCEMENT

Сила связана с риском.

## IV. OPEN WORLD COMPETITION

Хорошие ресурсы физически ограничены.

## V. PLAYER-DRIVEN STORIES

Игроки создают большую часть эмоционального контента самостоятельно.

---

# 7. ЗАПРЕЩЁННАЯ ФИЛОСОФИЯ

VARENDOR не должен становиться:

- mobile RPG;
- idle RPG;
- theme-park MMORPG;
- автоматическим квестовым симулятором;
- loot shower;
- dungeon lobby game.

---

# 8. ЗАПРЕЩЁННЫЕ СИСТЕМЫ

Без прямого разрешения Game Director нельзя добавлять:

- Battle Pass;
- VIP;
- Energy;
- Stamina;
- daily login rewards;
- auto farming;
- auto combat;
- auto quest;
- Dungeon Finder;
- Raid Finder;
- Gear Score Requirement;
- level requirement на equipment;
- random Diablo affixes;
- десятки rarity tiers;
- loot boxes;
- safe enhancement stones;
- paid enhancement protection;
- free global teleport;
- enemy scaling;
- paid combat stats;
- instant level boosts;
- pay-to-win consumables.

---

# 9. CORE GAME LOOP

Основной цикл:

**выход из поселения**

→

**поиск farming spot**

→

**бой**

→

**EXP**

→

**loot**

→

**gold**

→

**equipment**

→

**level up**

→

**enhancement**

→

**усиление**

→

**новый spot**

→

**новая территория**

→

**PvP-конкуренция**

→

**Mini Boss**

→

**Pit Boss**

→

**trade**

→

**guild**

→

**territory competition**

→

**endgame.**

---

# 10. SECOND-TO-SECOND LOOP

В бою игрок постоянно принимает решения:

- какую цель атаковать;
- подойти или отступить;
- использовать auto attack;
- использовать ability;
- сохранить cooldown;
- выпить potion;
- сменить позицию;
- продолжить бой или выйти;
- переключить цель;
- использовать control.

---

# 11. MINUTE-TO-MINUTE LOOP

Игрок:

- очищает spot;
- следит за HP/MP;
- наблюдает respawn;
- получает loot;
- решает, продолжать ли фарм;
- видит другого игрока;
- оценивает угрозу;
- меняет spot;
- ищет Elite.

---

# 12. HOUR-TO-HOUR LOOP

Игрок:

- получает level;
- продаёт loot;
- покупает potions;
- торгует;
- точит предмет;
- посещает Mini RB;
- проверяет Pit Boss;
- перемещается в другой регион;
- играет с party.

---

# 13. LONG-TERM LOOP

Игрок стремится к:

- Level 100;
- лучшему оружию;
- высокой заточке;
- полной экипировке;
- богатству;
- PvP reputation;
- guild influence;
- boss control.

---

# 14. ПЕРСОНАЖ

Персонаж состоит из:

### Identity

- Name;
- Class;
- Appearance;
- Guild.

### Progression

- Level;
- EXP;
- Base Stats;
- Skills.

### Combat Stats

- HP;
- MP;
- Attack;
- Magic Attack;
- Armor;
- Magic Defense;
- Accuracy;
- Evasion;
- Crit;
- Attack Speed;
- Movement Speed.

### Equipment

- weapons;
- armor;
- accessories;
- enhancement.

---

# 15. БАЗОВЫЕ ATTRIBUTES

Используются:

### STR

Strength.

### DEX

Dexterity.

### INT

Intelligence.

### VIT

Vitality.

### SPI

Spirit.

---

# 16. STR

Влияет на:

- melee Physical Power;
- часть Assassin damage;
- Knight damage;
- carry fantasy персонажа;
- некоторые physical abilities.

---

# 17. DEX

Влияет на:

- Ranger damage;
- Assassin damage;
- Accuracy;
- Evasion;
- Critical Chance;
- Attack Speed.

---

# 18. INT

Влияет на:

- Mage Magic Power;
- Necromancer Magic Power;
- spell damage;
- 일부 curse power.

---

# 19. VIT

Влияет на:

- Maximum HP;
- Physical resilience;
- HP regeneration;
- часть сопротивления physical control.

---

# 20. SPI

Влияет на:

- Maximum MP;
- MP regeneration;
- Magic Defense;
- Necromancer summons;
- curse resistance.

---

# 21. BASE ATTRIBUTES LEVEL 1

| ClassSTRDEXINTVITSPI |    |    |    |    |    |
| -------------------- | -- | -- | -- | -- | -- |
| Knight               | 12 | 6  | 2  | 14 | 4  |
| Mage                 | 3  | 7  | 15 | 6  | 13 |
| Assassin             | 9  | 15 | 3  | 8  | 6  |
| Ranger               | 7  | 14 | 5  | 8  | 8  |
| Necromancer          | 4  | 8  | 14 | 8  | 13 |

---

# 22. ATTRIBUTE GROWTH

При каждом Level Up сервер увеличивает характеристики.

| ClassSTRDEXINTVITSPI |     |     |     |     |     |
| -------------------- | --- | --- | --- | --- | --- |
| Knight               | .22 | .07 | .02 | .24 | .05 |
| Mage                 | .04 | .08 | .28 | .08 | .24 |
| Assassin             | .17 | .26 | .03 | .12 | .07 |
| Ranger               | .12 | .24 | .05 | .11 | .10 |
| Necromancer          | .05 | .08 | .25 | .11 | .23 |

Internal precision:

минимум 2 decimals.

UI округляет отображение.

---

# 23. ATTRIBUTE FORMULA

Для любого Attribute:

`Attribute(L) = BaseAttribute + Growth × (L - 1) + BonusFromAllocation + BonusFromEquipment + Buffs`

---

# 24. FREE STAT POINTS

Каждые 10 Levels:

**2 Points.**

Моменты получения:

10

20

30

40

50

60

70

80

90

100.

Итого:

20 Points.

---

# 25. FREE STAT LIMITS

Нельзя превратить Mage в полноценного Knight.

Поэтому дополнительные points создают build variation, а не смену класса.

---

# 26. HP FORMULA

## Knight

`HP = 250 + 35(L-1) + 28×VIT + FlatGearHP`

## Mage

`HP = 180 + 22(L-1) + 15×VIT + FlatGearHP`

## Assassin

`HP = 210 + 27(L-1) + 20×VIT + FlatGearHP`

## Ranger

`HP = 220 + 25(L-1) + 20×VIT + FlatGearHP`

## Necromancer

`HP = 200 + 24(L-1) + 18×VIT + FlatGearHP`

После этого применяются percentage modifiers.

---

# 27. HP MODIFIER ORDER

Порядок расчёта:

1. Base Level HP
2. VIT
3. Flat Item HP
4. Passive %
5. Buff %
6. Temporary Combat Effects

Не применять проценты хаотично в разном порядке.

---

# 28. MP FORMULA

Knight:

`60 + 5(L-1) + 9×SPI`

Mage:

`220 + 18(L-1) + 18×SPI`

Assassin:

`120 + 9(L-1) + 10×SPI`

Ranger:

`130 + 10(L-1) + 11×SPI`

Necromancer:

`200 + 15(L-1) + 17×SPI`

---

# 29. LEVEL 100 BASE TARGETS

Примерный naked Level 100:

Knight:

\~4700–5000 HP.

Mage:

\~2500–2800.

Assassin:

\~3200–3500.

Ranger:

\~3000–3300.

Necromancer:

\~2850–3150.

Equipment увеличивает значения значительно.

---

# 30. PHYSICAL POWER

Knight:

`WeaponAverage + STR×2.6 + DEX×0.25`

Assassin:

`NormalizedDualWeapon + STR×1.5 + DEX×1.35`

Ranger:

`WeaponAverage + DEX×2.3 + STR×0.4`

---

# 31. MAGIC POWER

Mage:

`WeaponMagicPower + INT×2.8 + SPI×0.5`

Necromancer:

`WeaponMagicPower + INT×2.5 + SPI×0.8`

---

# 32. DAMAGE PIPELINE

Все damage calculations проходят одинаковую последовательность:

1. Attack validation
2. Range validation
3. Hit roll
4. Weapon roll
5. Attribute scaling
6. Skill scaling
7. Crit roll
8. Defense mitigation
9. PvP modifier
10. Buff/debuff modifiers
11. Final rounding
12. Server commit
13. Client display.

---

# 33. WEAPON DAMAGE ROLL

Предмет хранит:

`DamageMin`

`DamageMax`.

Server выбирает:

`WeaponRoll = random(DamageMin, DamageMax)`

Для каждого attack.

---

# 34. BASIC PHYSICAL DAMAGE

`RawDamage = WeaponRoll + PhysicalScaling`

Skill:

`SkillDamage = RawDamage × SkillCoefficient + FlatSkillDamage`

---

# 35. PHYSICAL MITIGATION

`Reduction = Armor / (Armor + 350 + 10×AttackerLevel)`

Maximum:

70%.

Knight defensive ultimate может временно разрешать 78%.

---

# 36. MAGIC MITIGATION

`Reduction = MagicDefense / (MagicDefense + 300 + 9×AttackerLevel)`

Maximum:

65%.

---

# 37. ACCURACY

Knight:

`70 + DEX×1.3 + Level×0.15`

Assassin:

`75 + DEX×1.7 + Level×0.15`

Ranger:

`78 + DEX×1.8 + Level×0.15`

Mage/Necromancer:

отдельный Spell Accuracy.

---

# 38. EVASION

Base formula:

`ClassBaseEvasion + DEX×1.4 + Level×0.1 + Equipment`

Assassin имеет highest base.

Knight lowest.

---

# 39. HIT CHANCE

`Hit = 75 + (Accuracy - Evasion)×0.35`

Clamp:

35–95%.

---

# 40. CRITICAL

Knight:

5% + DEX×0.10%.

Mage:

4% + DEX×0.07%.

Assassin:

10% + DEX×0.20%.

Ranger:

8% + DEX×0.17%.

Necromancer:

4% + DEX×0.08%.

---

# 41. CRIT CAPS

Knight/Mage/Necromancer:

50%.

Ranger:

55%.

Assassin:

60%.

---

# 42. CRITICAL DAMAGE

Base:

150%.

Assassin:

165%.

Ranger:

155%.

---

# 43. ATTACK SPEED

Каждое оружие имеет Attack Interval.

| WeaponInterval |       |
| -------------- | ----- |
| Dagger         | .75s  |
| Dual Dagger    | .80s  |
| Sword          | 1.15s |
| Axe            | 1.30s |
| Great Sword    | 1.60s |
| Bow            | 1.25s |
| Crossbow       | 1.55s |
| Staff          | 1.40s |
| Scythe         | 1.45s |

---

# 44. DEX ATTACK SPEED FORMULA

Использовать diminishing returns.

Например:

`SpeedMultiplier = 1 + DEX / (DEX + 180) × 0.45`

Final interval:

`BaseInterval / SpeedMultiplier`.

---

# 45. MOVEMENT SPEED

Knight:

95.

Mage:

100.

Assassin:

112.

Ranger:

108.

Necromancer:

98.

100 = стандарт.

---

# 46. MOVEMENT LIMITS

Permanent:

max 135.

Temporary:

max 150.

Hard server validation необходима.

---

# 47. COMBAT RANGE

Melee:

\~1.8–2.5 m.

Short Bow:

\~12 m.

Long Bow:

\~16 m.

Crossbow:

\~15 m.

Mage spell:

\~14 m.

Necromancer:

\~13–14 m.

---

# 48. AUTO ATTACK

После выбора target:

если target в range:

attack.

Если вне:

персонаж идёт к attack range.

Attack продолжается до:

- target dead;
- player cancel;
- new target;
- target escaped;
- CC;
- player death.

---

# 49. SKILLS

Skills являются дополнением к auto attack.

Не превращать combat в спам 15 abilities каждую секунду.

---

# 50. GLOBAL COOLDOWN

Необязателен для всех skills.

Но server обязан предотвращать невозможный одновременный spam.

---

# 51. CONTROL DIMINISHING RETURNS

Hard CC:

1st:

100%.

2nd одинаковый category в коротком окне:

50%.

3rd:

25%.

Дальше:

короткая immunity.

---

# 52. PvP DAMAGE

Начальный global coefficient:

`FinalPvPDamage = FinalDamage × 0.78`

Отдельно балансируется.

---

# 53. НИКАКОГО LEVEL SUPPRESSION

Запрещено:

`HigherLevelBonusDamage`

или:

`LowerLevelPenalty`.

Level сильнее благодаря:

- stats;
- skills;
- gear;
- HP;
- enhancement.

---

# 54. CLASS 1 — KNIGHT

Archetype:

Heavy Frontline Warrior.

---

# 55. KNIGHT IDENTITY

Сильные стороны:

- highest HP;
- highest physical defense;
- block;
- stun;
- sustained melee;
- chokepoint control.

Слабости:

- низкая мобильность;
- низкий ranged pressure;
- небольшой MP;
- kite vulnerability.

---

# 56. KNIGHT WEAPONS

- Sword + Shield
- Mace + Shield
- Axe + Shield
- Great Sword
- Great Axe

---

# 57. KNIGHT ARMOR

Exclusive:

Heavy Armor.

При попытке надеть неподходящую armor-family предмет остаётся в inventory.

---

# 58. KNIGHT WEAPON STYLES

Sword:

balanced.

Axe:

higher variance.

Mace:

slightly lower damage, higher control utility.

Great Sword:

high burst, slow.

Great Axe:

very high variance/AOE orientation.

---

# 59. SHIELD

Shield имеет:

- Armor;
- Block;
- optional HP;
- optional resistance.

Base Block:

18%.

Block damage reduction:

40%.

Maximum Block:

45%.

---

# 60. KNIGHT SKILL TREE

Level 1:

Heavy Strike.

Level 5:

Shield Bash.

Level 10:

Battle Cry.

Level 15:

Iron Guard.

Level 20:

Cleave.

Level 25:

Charge.

Level 30:

Fortitude.

Level 35:

Counterattack.

Level 40:

Armor Break.

Level 45:

Shield Wall.

Level 50:

Execution.

Level 55:

Warrior's Resolve.

Level 60:

Iron Will.

Level 70:

Titan Grip Passive Enhancement.

Level 75:

Last Stand.

Level 80:

Unbroken.

Level 90:

King's Wrath.

Level 100:

Veteran passive milestone.

---

# 61. KNIGHT RESOURCE

Uses MP.

Costs must force management but not constant sitting/resting.

---

# 62. KNIGHT TARGET DPS

На equal gear Knight должен иметь:

\~75–85% single-target DPS Assassin.

Но значительно higher survival.

---

# 63. CLASS 2 — MAGE

Archetype:

Ranged Arcane Artillery.

---

# 64. MAGE STRENGTH

- magical burst;
- AoE;
- control;
- range;
- shield;
- blink.

---

# 65. MAGE WEAKNESS

- low HP;
- low armor;
- MP dependent;
- vulnerable when caught.

---

# 66. MAGE WEAPONS

- Staff
- Wand
- Spellbook
- Arcane Focus

---

# 67. MAGE ARMOR

Mystic Cloth.

---

# 68. MAGE ELEMENTS

Fire:

damage.

Frost:

control.

Lightning:

burst/chains.

Arcane:

defense/utility.

---

# 69. MAGE SKILLS

Level 1:

Fire Bolt.

5:

Frost Lance.

10:

Arcane Shield.

15:

Lightning Strike.

20:

Frost Nova.

25:

Blink.

30:

Mana Flow.

35:

Flame Wave.

40:

Chain Lightning.

45:

Ice Barrier.

50:

Meteor Fragment.

55:

Mana Burn.

60:

Deep Freeze.

70:

Elemental Mastery.

75:

Arcane Overload.

80:

Storm Field.

90:

Infernal Rain.

100:

Archmage passive.

---

# 70. MAGE CAST SYSTEM

Некоторые spells:

instant.

Некоторые:

0.5–2 sec cast.

Damage может interrupt cast только для определённых abilities.

---

# 71. MAGE TARGET DPS

Single:

\~90–100% Assassin burst window.

Sustained:

ниже.

AoE:

highest среди классов.

---

# 72. CLASS 3 — ASSASSIN

Archetype:

Mobile Melee Killer.

---

# 73. ASSASSIN STRENGTH

- burst;
- crit;
- speed;
- mobility;
- evasion;
- target execution.

---

# 74. ASSASSIN WEAKNESS

- medium/low durability;
- слабый AoE;
- требует контакта;
- плохо переносит hard control.

---

# 75. ASSASSIN WEAPONS

- Dagger
- Dual Daggers
- Short Blade pair

---

# 76. ASSASSIN ARMOR

Shadow Armor.

---

# 77. ASSASSIN SKILLS

1:

Twin Slash.

5:

Poison Blade.

10:

Quick Step.

15:

Backstab.

20:

Bleeding Cut.

25:

Shadow Step.

30:

Killer Instinct.

35:

Evasion Stance.

40:

Smoke Veil.

45:

Blade Flurry.

50:

Fatal Strike.

55:

Disengage.

60:

Vanish.

70:

Master of Shadows.

75:

Death Mark.

80:

Predator's Tempo.

90:

Shadow Execution.

100:

Death Dealer passive.

---

# 78. BACKSTAB

Rear cone должен определяться сервером.

Не доверять client orientation.

---

# 79. CLASS 4 — RANGER

Archetype:

Physical Ranged Hunter.

---

# 80. RANGER STRENGTH

- range;
- physical DPS;
- kiting;
- accuracy;
- traps;
- pursuit.

---

# 81. RANGER WEAKNESS

- weaker in melee;
- vulnerable to gap closers;
- lower armor than Knight;
- ammunition/resource economy possible.

---

# 82. RANGER WEAPONS

Short Bow:

fast.

Long Bow:

long range.

Crossbow:

slow/high damage.

---

# 83. RANGER ARMOR

Hunter Leather.

---

# 84. RANGER SKILLS

1:

Aimed Shot.

5:

Quick Shot.

10:

Crippling Arrow.

15:

Hunter Focus.

20:

Snare Trap.

25:

Retreat Shot.

30:

Eagle Eye.

35:

Poison Arrow.

40:

Piercing Arrow.

45:

Camouflage.

50:

Rapid Fire.

55:

Hunter's Step.

60:

Predator Mark.

70:

Longshot Mastery.

75:

Arrow Rain.

80:

Perfect Distance.

90:

Deadeye.

100:

Master Hunter passive.

---

# 85. CLASS 5 — NECROMANCER

Archetype:

Dark Summoner / Attrition Mage.

---

# 86. NECROMANCER STRENGTH

- summons;
- DoT;
- debuffs;
- life drain;
- sustained pressure;
- battlefield control.

---

# 87. NECROMANCER WEAKNESS

- setup time;
- less burst than Mage;
- summon dependency;
- moderate mobility.

---

# 88. NECROMANCER WEAPONS

- Dark Staff
- Scythe
- Ritual Dagger
- Grimoire

---

# 89. NECROMANCER ARMOR

Shadow Armor shared family with Assassin.

Но stat profiles отличаются.

---

# 90. SHADOW ARMOR ITEMIZATION

Assassin-oriented:

- DEX;
- Crit;
- Attack Speed;
- Evasion.

Necromancer-oriented:

- INT;
- SPI;
- Magic Power;
- MP.

Некоторые items intentionally hybrid.

---

# 91. NECROMANCER SKILLS

1:

Bone Spear.

5:

Weakness Curse.

10:

Life Drain.

15:

Raise Skeleton.

20:

Rot.

25:

Bone Armor.

30:

Soul Mastery.

35:

Dark Chain.

40:

Plague.

45:

Corpse Burst.

50:

Fallen Knight Summon.

55:

Soul Drain.

60:

Soul Chain.

70:

Lord of Bones.

75:

Death Pact.

80:

Black Ritual.

90:

Army of the Fallen.

100:

Deathspeaker passive.

---

# 92. SUMMON FORMULA

`SummonHP = BaseSummonHP + OwnerMaxHP×0.30 + SPI×X`

`SummonDamage = BaseDamage + MagicPower×0.35 + SPI×Y`

`SummonDefense = BaseDefense + OwnerMagicPower×0.10`

---

# 93. SUMMON LIMIT

Default:

1 persistent summon.

Temporary ultimate summons допускают несколько существ.

---

# 94. ANTI-AFK SUMMON RULE

Summon сам не должен превращать игру в autofarm.

Если владелец длительно не участвует:

summon aggression ограничивается.

---

# 95. SKILL RANK SYSTEM

Skills имеют ranks.

Например:

Fire Bolt I

II

III

IV

V.

---

# 96. SKILL RANK DESIGN

Rank может увеличивать:

- coefficient;
- duration;
- radius;
- utility.

Но не обязательно всё одновременно.

---

# 97. LEVEL MILESTONES

Каждые 5 levels игрок получает:

- skill;
- rank;
- stat milestone;
- или другой meaningful advancement.

Каждые 10:

новый Region + free stat points.

---

# 98. XP PHILOSOPHY

Leveling тяжёлый.

Нельзя Level 100 за выходные.

---

# 99. XP FORMULA

Базовая модель:

`XPNext = A × Level^P × RegionFactor`

Start:

A = 150.

P = 2.35.

RegionFactor:

`1 + 0.10×floor((Level-1)/10)`.

Все значения должны храниться в config и иметь возможность корректировки.

---

# 100. TARGET TOTAL PLAYTIME

При нормальном эффективном farming:

1–10:

2–4 h.

10–20:

8–12 additional.

20–30:

20–30.

30–40:

30–50.

40–50:

50–70.

50–60:

70–100.

60–70:

100–140.

70–80:

130–180.

80–90:

180–250.

90–100:

250–350+.

---

# 101. IMPORTANT XP PRINCIPLE

Это target диапазон, а не жёсткий таймер.

Лучший gear/player/group могут ускоряться.

Слабый farming — медленнее.

---

# 102. MOB EXP LEVEL DIFFERENCE

Если mob близок по Level:

100%.

Слабее на 4:

92%.

-5:

84%.

-6:

75%.

Дальше постепенно до floor 10%.

---

# 103. STRONG MOB BONUS

Убийство mob выше игрока может давать небольшой EXP bonus.

Но нельзя создавать exploit powerleveling через огромный level gap.

---

# 104. REGIONS

10 основных progression regions.

---

# 105. REGION 1

## ASHEN FRONTIER

### Levels 1–10

Theme:

разрушенная пограничная земля.

Gameplay:

обучение через сам мир.

---

# 106. REGION 2

## BLACKROOT WOODS

### 10–20

Тёмный лес.

Более высокая mob density.

Первые опасные агрессивные clusters.

---

# 107. REGION 3

## GRAVE MARCH

### 20–30

Военные руины.

Undead army.

Подготовка к PvP.

---

# 108. REGION 4

## CRIMSON PLAINS

### 30–40

Первый полноценный open-PvP progression region.

---

# 109. REGION 5

## IRON DEPTHS

### 40–50

Mines + fortress networks.

---

# 110. REGION 6

## MIRE OF THE SAINTLESS

### 50–60

Swamp / ruined religion.

---

# 111. REGION 7

## CINDER WASTES

### 60–70

Ash desert.

High visibility / dangerous open PvP.

---

# 112. REGION 8

## RUINS OF VAEL

### 70–80

Ancient civilization.

Rare artifacts.

---

# 113. REGION 9

## RIFTLANDS

### 80–90

Reality corruption.

Hardest regular enemies.

---

# 114. REGION 10

## CROWN OF NIGHT

### 90–100

Old royal capital.

Primary launch endgame.

---

# 115. REGION REQUIREMENTS

Каждый region должен содержать минимум:

- 10 normal mob types;
- 2 ranged mobs;
- 1 magic mob;
- 2 elites;
- 1 Mini RB;
- 1 Pit Boss;
- 1 dungeon;
- 4–7 distinct farming spots;
- 1 settlement;
- 1 teleport;
- 2–4 landmarks;
- hidden paths;
- boss arena;
- PvP chokepoints.

---

# 116. REGION SIZE

Region не должен ощущаться маленькой ареной.

Целевой travel time пешком:

от одного края playable region до другого:

приблизительно 5–12 минут.

Зависит от terrain.

---

# 117. WORLD CONTINUITY

Regions соединяются физически:

- gates;
- forest paths;
- bridges;
- mountain passes;
- caves;
- ruined roads.

---

# 118. REGION ACCESS

Игрок ниже required Level не может пройти progression gate.

Логически объяснить:

- magical barrier;
- guard restriction;
- corrupted gate;
- story/world mechanism.

Не использовать невидимую стену без объяснения.

---

# 119. PERMANENT UNLOCK

После открытия Region доступ сохраняется.

---

# 120. TELEPORT SYSTEM

Teleporter находится в settlements.

Игрок сначала физически посещает destination и активирует point.

---

# 121. TELEPORT PRICES

Примерная база:

R1:

500.

R2:

1 500.

R3:

3 000.

R4:

6 000.

R5:

10 000.

R6:

16 000.

R7:

24 000.

R8:

35 000.

R9:

50 000.

R10:

75 000+.

---

# 122. TELEPORT PURPOSE

Это:

- convenience;
- gold sink;
- world progression reward.

---

# 123. CAPITAL

## ASTERHOLD

Полностью protected.

---

# 124. ASTERHOLD CONTENT

- spawn square;
- class trainers;
- merchants;
- warehouse;
- blacksmith;
- enhancement master;
- auction;
- guild hall;
- teleport hall;
- market district;
- social space.

---

# 125. PLAYER HOUSING

Не входит в launch scope.

---

# 126. SETTLEMENT SAFETY

Regional villages могут быть protected.

Но дороги/fields за пределами guard zone являются open world.

---

# 127. SPAWN CAMPING PROTECTION

При teleport/respawn:

3–5 sec protection.

Снимается:

- при attack;
- при skill;
- возможно при movement beyond radius.

---

# 128. ITEM PHILOSOPHY

Предмет не расходник на 10 минут.

Он должен иметь identity.

---

# 129. NO RARITY

Не показывать:

Common

Rare

Epic

Legendary.

---

# 130. ITEM VALUE

Определяется:

- stats;
- drop source;
- demand;
- enhancement;
- region;
- scarcity.

---

# 131. FIXED ITEM STATS

Один item ID имеет фиксированную базу.

Например:

`Crimson Legion Sword`

всегда одна и та же base configuration.

---

# 132. NO RANDOM AFFIX SYSTEM

Запрещено:

+5 Strength random

Fire Damage random

Gold Find random

на каждом экземпляре.

---

# 133. ITEM LEVEL REQUIREMENT

Полностью отсутствует.

Level 1 может надеть Region 10 item.

---

# 134. CLASS REQUIREMENTS

Допустимы.

Например:

Heavy Armor:

Knight.

Hunter Armor:

Ranger.

Shadow:

Assassin/Necro.

Mystic:

Mage.

---

# 135. WEAPON PROGRESSION

One-hand baseline:

| RegionDamage |         |
| ------------ | ------- |
| R1           | 7–11    |
| R2           | 12–18   |
| R3           | 19–28   |
| R4           | 29–42   |
| R5           | 43–60   |
| R6           | 61–84   |
| R7           | 86–116  |
| R8           | 118–154 |
| R9           | 158–204 |
| R10          | 210–270 |

---

# 136. WEAPON REGION VARIANCE

Обычные weapons внутри Region:

±10–15%.

---

# 137. SOURCE POWER

Normal mob:

\~100% regional baseline.

Elite:

103–108%.

Mini Boss:

110–118%.

Pit Boss:

118–128%.

---

# 138. WEAPON TYPE MULTIPLIERS

Dagger:

×0.72 damage.

Sword:

×1.

Axe:

×1.10.

Great Sword:

×1.45.

Bow:

×1.15.

Crossbow:

×1.35.

---

# 139. DUAL WIELD

Main hand:

100%.

Offhand:

примерно 65%.

Attack animation may alternate.

Server computes normalized total DPS.

---

# 140. MAGIC WEAPON POWER

R1:

8.

R2:

14.

R3:

22.

R4:

33.

R5:

47.

R6:

65.

R7:

86.

R8:

110.

R9:

140.

R10:

175.

---

# 141. ARMOR BUDGET

Regional full-set baseline:

R1 40

R2 62

R3 92

R4 130

R5 178

R6 236

R7 305

R8 385

R9 475

R10 580.

---

# 142. SLOT ALLOCATION

Chest:

40%.

Head:

20%.

Boots:

15%.

Gloves:

15%.

Belt/secondary:

10%.

---

# 143. HEAVY ARMOR

Physical:

×1.25.

Magic:

×0.75.

---

# 144. MYSTIC ARMOR

Physical:

×0.65.

Magic:

×1.25.

---

# 145. HUNTER ARMOR

Physical:

×0.90.

Magic:

×0.95.

---

# 146. SHADOW ARMOR

Physical:

×0.82.

Magic:

×1.05.

---

# 147. ACCESSORIES

Slots:

Necklace.

Ring 1.

Ring 2.

Earring 1.

Earring 2.

Belt.

---

# 148. ACCESSORY STATS

Использовать:

- STR;
- DEX;
- INT;
- VIT;
- SPI;
- HP;
- MP;
- Accuracy;
- Evasion;
- Crit;
- resistance.

---

# 149. STAT BUDGET

Каждому Region назначить Item Budget.

Это предотвращает stat explosion.

---

# 150. STAT BUDGET RULE

Нельзя просто дать boss item:

+20 все stats.

Boss вещь должна быть лучше, но в рамках экономики силы.

---

# 151. ITEM SETS

Не делать массовую сетовую систему.

Редкие named sets могут появиться позднее.

---

# 152. EQUIPMENT DOLL

Slots:

Head

Chest

Gloves

Boots

Belt

Main Hand

Off Hand

Necklace

Ring 1

Ring 2

Earring 1

Earring 2.

---

# 153. INVENTORY

Base:

48 slots.

---

# 154. STACKABLE

- potions;
- scrolls;
- materials;
- arrows.

---

# 155. LOOT BUFFER

Если inventory full:

10 temporary slots.

---

# 156. LOOT BUFFER RULE

Нельзя уничтожить rare item просто из-за full inventory.

---

# 157. ENHANCEMENT

Maximum:

+15.

---

# 158. SAFE

+0→1:

100%.

+1→2:

100%.

+2→3:

100%.

---

# 159. RISK TABLE

+3→4:

70%.

+4→5:

60%.

+5→6:

50%.

+6→7:

40%.

+7→8:

32%.

+8→9:

25%.

+9→10:

19%.

+10→11:

14%.

+11→12:

10%.

+12→13:

7%.

+13→14:

5%.

+14→15:

3%.

---

# 160. FAILURE

Item destroyed.

Database entry deleted transactionally.

---

# 161. ENHANCEMENT WEAPON POWER

+1:

+4%.

+2:

+8%.

+3:

+12%.

+4:

+17%.

+5:

+22%.

+6:

+28%.

+7:

+34%.

+8:

+41%.

+9:

+48%.

+10:

+56%.

+11:

+65%.

+12:

+75%.

+13:

+86%.

+14:

+98%.

+15:

+112%.

---

# 162. ARMOR ENHANCEMENT

+1:

3%.

+2:

6%.

+3:

9%.

+4:

13%.

+5:

17%.

+6:

22%.

+7:

27%.

+8:

33%.

+9:

39%.

+10:

46%.

+11:

54%.

+12:

63%.

+13:

73%.

+14:

84%.

+15:

96%.

---

# 163. ENHANCEMENT UI

Обязательно показывать:

Current.

Target.

Success Chance.

Failure consequence.

Cost.

Required Scroll.

---

# 164. NO FAKE CHANCES

Displayed chance = actual server chance.

---

# 165. NO FAIL STACK

Без разрешения не добавлять.

---

# 166. NO PROTECTION ITEM

Без разрешения не добавлять.

---

# 167. ENHANCEMENT VFX

+0–3:

minimal.

+4–5:

subtle glow.

+6–7:

aura.

+8–9:

particles.

+10–12:

strong prestige visual.

+13–15:

unique high-status effect.

---

# 168. DARK FANTASY RULE

Никакого neon rainbow.

---

# 169. SCROLL TYPES

Weapon Enhancement Scroll.

Armor Enhancement Scroll.

В будущем возможны:

Accessory Enhancement Scroll

только после отдельного решения.

---

# 170. DROP TABLE PHILOSOPHY

Каждый monster type имеет собственный loot table.

---

# 171. MOB KNOWLEDGE

Игроки должны знать:

> этот item падает с этого mob.

---

# 172. DROP CATEGORIES

Resources:

20–70%.

Consumables:

5–25%.

Equipment:

0.1–1%.

Strong Equipment:

0.03–0.3%.

Enhancement Scroll:

0.05–0.5%.

---

# 173. UNIQUE DROP

Некоторые items:

только один enemy type.

---

# 174. MINI BOSS ITEMS

Не должны выпадать с normal mobs.

---

# 175. PIT BOSS ITEMS

Только Pit Boss.

---

# 176. AUTO LOOT

Server после смерти monster:

1. validates kill;
2. calculates ownership;
3. rolls loot;
4. creates item;
5. commits inventory;
6. sends result.

---

# 177. LOOT MESSAGE

Common:

compact.

Meaningful:

stronger notification.

Boss item:

party-visible notification.

---

# 178. MOB DESIGN

Не делать mobs HP-skins.

---

# 179. MOB ARCHETYPES

Passive.

Aggressive.

Social.

Archer.

Mage.

Brute.

Hunter.

Coward.

Elite.

Support.

Ambusher.

---

# 180. MOB DATA

Каждый monster содержит:

ID.

Name.

Level.

Region.

HP.

MP.

Attack.

Magic Attack.

Armor.

Magic Defense.

Accuracy.

Evasion.

Crit.

Attack Speed.

Movement Speed.

Aggro Radius.

Leash.

Respawn.

EXP.

Gold.

Loot Table.

Abilities.

---

# 181. NORMAL MOB KILL TIME

Equal-level proper gear:

5–12 sec.

В зависимости от class/mob matchup.

---

# 182. ELITE

Solo:

20–45 sec.

---

# 183. MOB RESPAWN

Normal:

20–60 sec.

Valuable:

60–180 sec.

Elite:

3–10 min.

---

# 184. SPOT DESIGN

Каждый Region должен иметь различные spot profiles.

---

# 185. XP SPOT

Высокий EXP.

Ниже gold/rare loot.

---

# 186. GOLD SPOT

Хороший gold.

Средний EXP.

---

# 187. ITEM SPOT

Конкретные ценные drops.

---

# 188. SCROLL SPOT

Выше вероятность enhancement scroll.

---

# 189. HIGH-RISK SPOT

Высокая плотность / сильные mobs / хороший reward.

---

# 190. NO UNIVERSALLY BEST SPOT

Нельзя делать одну зону одновременно лучшей по:

- XP;
- gold;
- items;
- scrolls.

---

# 191. MINI RAID BOSS

Каждый Region:

минимум 1.

---

# 192. MINI RESPAWN

Server random:

30–50 min.

---

# 193. MINI TIMER

Exact value hidden.

---

# 194. MINI DIFFICULTY

2–5 equal-range players.

Strong solo possible, но рискован.

---

# 195. MINI FIGHT LENGTH

3–6 min group target.

---

# 196. MINI DROPS

- boss material;
- gold;
- scroll;
- chance equipment;
- chance accessory.

---

# 197. PIT BOSS

Главное PvP world event региона.

---

# 198. PIT RESPAWN

Exactly:

7 hours after death.

---

# 199. PIT TIMER PERSISTENCE

Server restart не сбрасывает.

---

# 200. PIT WORLD PRESENCE

Не instance.

---

# 201. PIT INTERFERENCE

Игроки могут:

- damage boss;
- attack rivals;
- defend entrances;
- disrupt healers;
- contest contribution.

---

# 202. PIT FIGHT LENGTH

8–15 min без PvP interference.

---

# 203. PIT ABILITIES

Каждый имеет:

- basic attack;
- signature attack;
- AoE;
- phase mechanic;
- add mechanic;
- rage/enrage mechanic;
- telegraphed dangerous skill.

---

# 204. NO RAID BLOAT

Не создавать 25 mechanics одновременно.

---

# 205. PIT LOOT TABLE

8–12 meaningful named items.

---

# 206. PIT GUARANTEE

Минимум один major boss item на kill.

---

# 207. SECOND ITEM

Дополнительный chance.

---

# 208. CONTRIBUTION

Party contribution:

Damage.

Healing.

Damage Tanked.

Mechanic Contribution.

---

# 209. NO LAST HIT OWNERSHIP

Последний удар не решает loot ownership.

---

# 210. OPEN PvP

С Level 30.

---

# 211. BELOW 30

Нельзя:

attack player.

Нельзя:

получить attack.

---

# 212. AT LEVEL 30

Open-world PvP автоматически активирован.

---

# 213. SAFE ZONES

Capital.

Protected villages.

Некоторые service areas.

---

# 214. PvP FLAG

White:

neutral.

Orange:

active conflict.

Red:

criminal.

---

# 215. KARMA

Killing innocent players increases negative karma.

---

# 216. RED PLAYER PENALTIES

Possible:

- higher teleport price;
- higher death penalty;
- restricted NPC;
- attackable freely.

---

# 217. EQUIPMENT DROP ON DEATH

Launch:

нет.

---

# 218. DEATH PENALTY

PvE:

\~1% current level EXP.

PvP:

\~0.5%.

Criminal:

2–3%.

---

# 219. NO LEVEL LOSS

EXP cannot reduce below current level floor.

---

# 220. DEATH RESPAWN

- nearest village;
- selected unlocked point;
- capital.

Конкретное UX решение выбрать технически.

---

# 221. POTIONS

HP potion cooldown:

\~2 sec.

MP:

\~3 sec.

---

# 222. POTION BALANCE

Potions поддерживают combat.

Не дают бессмертие.

---

# 223. ECONOMY

Главная валюта:

Gold.

---

# 224. NO CURRENCY BLOAT

Не создавать десятки currencies.

---

# 225. GOLD SOURCES

- mob;
- boss;
- quests;
- NPC resource sales;
- player trade.

---

# 226. GOLD SINKS

- teleport;
- potion;
- repair;
- enhancement fee;
- auction;
- guild;
- services.

---

# 227. REPAIR

Equipment has durability.

Repair требует gold.

---

# 228. DURABILITY

Не должна раздражать.

Она существует как economy sink.

---

# 229. ENHANCEMENT FEE

High enhancement требует всё больше gold.

---

# 230. ENHANCEMENT COST CURVE

Например:

Cost = BaseItemValue × EnhancementCostMultiplier.

Хранить multiplier в config.

---

# 231. TRADE

Direct trade между игроками.

---

# 232. TRADE CONFIRMATION

Двухфазное подтверждение.

После изменения предмета подтверждение сбрасывается.

Anti-scam requirement.

---

# 233. AUCTION HOUSE

Capital.

---

# 234. AUCTION FEE

Начально:

5%.

---

# 235. AUCTION DATA

Track:

median price;

volume;

item;

enhancement.

---

# 236. ITEM BINDING

Большинство items tradeable.

No Bind-on-Pickup launch.

---

# 237. PARTY

Max:

5.

---

# 238. PARTY UI

- portrait;
- class;
- HP;
- MP;
- range indicator;
- status effects.

---

# 239. PARTY EXP

Nearby members only.

---

# 240. GROUP BONUS

2:

+5% total.

3:

+8%.

4:

+10%.

5:

+12%.

---

# 241. GROUP RANGE

AFK member в городе не получает EXP.

---

# 242. PARTY LOOT MODES

Random.

Round Robin.

Leader Distribution.

---

# 243. GUILDS

Launch или post-core milestone.

---

# 244. GUILD FEATURES

- name;
- emblem;
- leader;
- officers;
- ranks;
- guild chat;
- members;
- online status;
- log.

---

# 245. GUILD PURPOSE

PvP organization.

Boss control.

Spot control.

Community.

---

# 246. NO PASSIVE P2W GUILD POWER

Guild не должна просто давать +30% damage.

---

# 247. DUNGEONS

Physical entrances.

---

# 248. NO DUNGEON FINDER

Игрок идёт к entrance.

---

# 249. DUNGEON LENGTH

20–40 min exploration target.

---

# 250. DUNGEON CONTENT

- mobs;
- elite rooms;
- valuable spot;
- environmental storytelling;
- final boss.

---

# 251. OPEN DUNGEON POSSIBILITY

Часть dungeons может быть public/open PvP.

---

# 252. QUEST SYSTEM

Secondary progression.

---

# 253. QUEST PURPOSE

- introduce world;
- lore;
- teach mechanics;
- point toward areas;
- reward consumables/gold.

---

# 254. QUEST XP

Не должна превосходить farming как main progression.

---

# 255. NO QUEST CHAIN RAILROAD

Игрок не обязан 100 часов следовать стрелке.

---

# 256. WORLD MAP

Показывает:

- discovered regions;
- roads;
- settlements;
- teleport;
- dungeon entrances;
- landmarks.

---

# 257. MAP DOES NOT SHOW

- exact rare mob positions;
- exact boss timer;
- every farming point;
- every hidden route.

---

# 258. MINI MAP

Top-right.

---

# 259. MAIN HUD

Top-left:

portrait;

level;

HP;

MP.

Bottom:

skill bar.

Bottom-left:

chat.

Top-right:

minimap.

---

# 260. EXP BAR

Хорошо видимый progress.

Особенно на high levels.

---

# 261. CHARACTER WINDOW

Display:

Level.

EXP.

STR.

DEX.

INT.

VIT.

SPI.

Attack.

Magic Attack.

Armor.

Magic Defense.

Accuracy.

Evasion.

Crit.

Crit Damage.

Attack Speed.

Movement Speed.

HP.

MP.

---

# 262. EQUIPMENT COMPARISON

Selected item vs equipped.

---

# 263. NO ITEM SCORE

Запрещено скрывать смысл вещей одной цифрой Gear Score.

---

# 264. TOOLTIP

Показывать реальные stats.

---

# 265. CHAT

Channels:

Local.

Party.

Guild.

Private.

System.

---

# 266. COMBAT LOG

Optional compact channel/tab.

---

# 267. WORLD VISUAL STYLE

Dark medieval fantasy.

---

# 268. PALETTE

- stone;
- iron;
- ash;
- forest;
- blood-red accents;
- muted magical glow.

---

# 269. VISUAL RULE

Не превращать dark fantasy в серое месиво.

Regions должны визуально различаться.

---

# 270. CHARACTER SILHOUETTES

Knight:

heavy.

Mage:

robe/staff.

Assassin:

low-profile.

Ranger:

bow silhouette.

Necromancer:

ritual/scythe.

---

# 271. EQUIPMENT VISIBILITY

Надетая weapon/armor должна визуально отражаться на model.

---

# 272. ENHANCEMENT VISIBILITY

High enhancement виден другим игрокам.

---

# 273. CAMERA

3/4 perspective.

---

# 274. CAMERA CONTROL

Allowed:

zoom range.

Optional limited rotation.

Не давать player ломать readability extreme angles.

---

# 275. CLICK MOVEMENT

Основной вариант:

click ground to move.

---

# 276. OPTIONAL WASD

Может быть добавлен как alternative control.

Но не должен ломать core navigation.

---

# 277. TARGET SELECTION

Click enemy.

Tab cycle.

Party targeting.

---

# 278. TARGET UI

Показывать:

Name.

Level.

HP.

Type.

Status effects.

---

# 279. TECHNICAL TARGET

Browser client.

---

# 280. ARCHITECTURE

Разделить:

### Client

Rendering/input/UI.

### Game Server

Authoritative world simulation.

### Database

Persistent state.

### Data Configuration

Balance/content.

---

# 281. SERVER AUTHORITY

Server owns:

- position validation;
- combat;
- EXP;
- loot;
- gold;
- enhancement;
- trading;
- auction;
- boss state;
- inventory;
- equipment;
- PvP;
- mobs.

---

# 282. CLIENT

Не имеет права самостоятельно решать результат gameplay.

---

# 283. NETWORK MODEL

Client sends intentions.

Например:

MoveTo.

AttackTarget.

CastSkill.

UseItem.

EnhanceItem.

Server validates.

---

# 284. MOVEMENT VALIDATION

Server проверяет:

- max speed;
- collision;
- teleport;
- impossible distance;
- zone boundaries.

---

# 285. SERVER TICK

Prototype target:

10–20 authoritative updates/sec.

---

# 286. CLIENT INTERPOLATION

Rendering должен оставаться плавным между server snapshots.

---

# 287. LATENCY TOLERANCE

Combat должен оставаться playable при умеренном ping.

---

# 288. DATABASE CHARACTER

Fields минимум:

ID.

AccountID.

Name.

Class.

Level.

EXP.

Position.

Region.

Gold.

Karma.

Stats.

Appearance.

---

# 289. INVENTORY TABLE

Item Instance ID.

Owner.

BaseItemID.

Enhancement.

Durability.

Slot.

Quantity.

---

# 290. ITEM INSTANCE

Нужно различать:

Base Item Definition

и

конкретный Item Instance.

---

# 291. BASE ITEM

Определяет:

name;

stats;

model;

icon;

drop sources.

---

# 292. INSTANCE

Определяет:

owner;

enhancement;

durability;

location.

---

# 293. DATA-DRIVEN DEVELOPMENT

Баланс не hardcode.

---

# 294. CONFIG FILES

Минимум:

classes

stats

skills

items

monsters

bosses

zones

drops

experience

enhancement

economy

teleports

NPC.

---

# 295. BALANCE CHANGE RULE

Изменение balance ideally меняет data, а не engine code.

---

# 296. VERSIONING

Configs должны иметь version.

---

# 297. DATABASE MIGRATIONS

Каждое изменение schema контролируется.

---

# 298. TRANSACTIONS

Особенно:

trade;

auction;

enhancement;

loot;

gold transfer.

---

# 299. DUPLICATION PROTECTION

Item duplication является critical bug.

---

# 300. ENHANCEMENT TRANSACTION

Atomic sequence:

check item;

check scroll;

check gold;

consume fee;

roll;

success/update

или destroy;

commit.

---

# 301. RANDOM GENERATION

Server-side secure/predict-resistant random для valuable operations.

---

# 302. BOSS TIMER STORAGE

NextSpawnTimestamp persistent.

---

# 303. ANTI-CHEAT BASIC

Detect:

speed hack.

teleport hack.

attack speed hack.

impossible skill rate.

range hack.

inventory manipulation.

gold manipulation.

packet replay.

---

# 304. RATE LIMITS

Server actions must be rate-limited.

---

# 305. LOGGING

Логировать:

login;

trade;

enhancement;

high-value loot;

boss kill;

gold transfer;

auction;

suspicious actions.

---

# 306. ECONOMY TELEMETRY

Track daily:

Gold Created.

Gold Destroyed.

Total Gold.

Median player gold.

Auction volume.

Enhancement destruction.

---

# 307. BALANCE TELEMETRY

Track:

EXP/hour.

Kill time.

Deaths.

Skill usage.

Class DPS.

Boss duration.

PvP win rates.

---

# 308. CLASS BALANCE PRINCIPLE

Не выравнивать всё к 50/50 любой ценой.

---

# 309. CLASS IDENTITY > PERFECT SYMMETRY

Каждый класс имеет преимущество и слабость.

---

# 310. MATCHUP EXAMPLES

Assassin опасен Mage.

Ranger раздражает Knight.

Knight переживает Assassin opener.

Necromancer силён в долгом бою.

Mage силён против групп.

---

# 311. NO 100/0 MATCHUPS

Counterplay должен существовать.

---

# 312. POWER SOURCES

Target rough distribution:

Level/Base:

25–35%.

Gear:

45–55%.

Enhancement:

15–25%.

Player execution:

существенный фактор.

---

# 313. TWINKS

Разрешены.

---

# 314. TWINK CONSEQUENCE

Level 20 с high-region weapon очень силён.

Это intended economy behavior.

---

# 315. NEW PLAYER PROTECTION

PvP Level 30 предотвращает убийство новичков low-level twinks.

---

# 316. WORLD SCALING

Абсолютно запрещено.

---

# 317. BACKTRACK POWER FANTASY

Level 70 возвращается в Region 1 и уничтожает старых mobs.

Это хорошо.

---

# 318. BOSS SCALING

Boss фиксирован.

---

# 319. CONTENT PRODUCTION RULE

Каждый Region проектировать через data sheet.

---

# 320. REGION DESIGN SHEET

Обязательно:

Region name.

Level range.

Biome.

Settlement.

Travel routes.

PvP choke.

Dungeon.

Mob list.

Elite list.

Mini RB.

Pit Boss.

Loot matrix.

Weapons.

Armor.

Accessories.

XP spots.

Gold spots.

Scroll spots.

---

# 321. MOB SHEET

Name.

Level.

HP.

Damage.

Armor.

M.Def.

Accuracy.

Evasion.

EXP.

Gold.

Aggro.

Respawn.

Abilities.

Drops.

Coordinates/Spawn Area.

---

# 322. ITEM SHEET

ID.

Name.

Category.

Class.

Weapon type.

Damage.

Magic Power.

Armor.

M.Def.

Stats.

Source.

Drop rate.

Sell Value.

Visual.

---

# 323. SKILL SHEET

ID.

Class.

Level unlock.

Rank.

Range.

Cast.

Cooldown.

MP cost.

Damage coefficient.

Control.

Duration.

PvP modifier.

VFX.

---

# 324. BOSS SHEET

HP.

Attack.

Armor.

M.Def.

Skills.

Phases.

Respawn.

Drops.

Arena.

Target party size.

Expected kill duration.

---

# 325. CLASS BALANCE SHEET

Evaluate levels:

1.
2.
3.
4.
5.
6.
7.
8.
9.
10.
11.

---

# 326. BALANCE OUTPUT

For each milestone:

HP.

MP.

Attack.

Defense.

DPS.

Crit.

Accuracy.

Evasion.

Mob Kill Time.

PvP Burst.

---

# 327. AUTOMATED BALANCE TEST

Create script/calculator capable of simulating:

10,000 attacks.

DPS average.

Crit variance.

Hit chance.

TTK.

---

# 328. PvP SIMULATION

Simulate representative matchups.

Not to decide final balance automatically, but detect absurd values.

---

# 329. MONSTER POWER MODEL

Сначала определяется expected player.

Потом enemy.

---

# 330. PLAYER TARGETS PER REGION

Для Region N определить:

Expected HP.

Expected DPS.

Expected Armor.

Expected Magic Defense.

Expected enhancement.

---

# 331. EXPECTED ENHANCEMENT

Например:

R1:

+0–3.

R2:

+2–4.

R3:

+3–5.

R4:

+3–6.

Позже балансировать по telemetry.

---

# 332. ENHANCEMENT NOT MANDATORY WALL

Нельзя сделать Region невозможным без +10.

---

# 333. FARM ECONOMICS

Каждый spot оценивается:

EXP/hour.

Gold/hour.

DropValue/hour.

Risk.

Travel cost.

Consumable cost.

---

# 334. PLAYER OPERATING COST

Farm требует:

potions;

arrows;

repair;

teleport.

---

# 335. PROFIT

NetProfit = LootValue + Gold - Consumables - Repair - Travel.

---

# 336. NPC SHOP

Продаёт:

- starter weapon;
- starter armor;
- potion;
- arrow;
- basic consumables.

---

# 337. BEST GEAR

Не продаётся NPC.

---

# 338. NPC SELL VALUE

Обычно значительно ниже player market.

---

# 339. CAPITAL TRADE SQUARE

Можно использовать визуально как social hub.

---

# 340. AUCTION SEARCH

Search by:

name.

weapon type.

class.

enhancement.

price.

---

# 341. SORTING

price.

enhancement.

newest.

---

# 342. CHARACTER CREATION

Player chooses:

class.

gender/body options where implemented.

face/hair basic options.

name.

---

# 343. NO CHARACTER STAT TRAP

На creation не заставлять новичка распределять критичные points без понимания.

Base class identity preset.

---

# 344. FIRST LOGIN

Игрок появляется в Asterhold / frontier starting area.

---

# 345. TUTORIAL

Минимальный, через реальные действия.

---

# 346. TUTORIAL ACTIONS

Move.

Target.

Attack.

Skill.

Loot.

Inventory.

Equip.

Potion.

---

# 347. NO 45-MINUTE TEXT TUTORIAL

Игрок должен начать играть быстро.

---

# 348. FIRST 30 MINUTES

Игрок должен:

kill mobs;

level up;

receive item;

equip it;

visit NPC;

see enhancement system.

---

# 349. FIRST 3 HOURS

Игрок должен:

достичь нескольких уровней;

найти distinct farming spots;

получить gear;

увидеть Elite;

увидеть Mini RB;

попробовать enhancement.

---

# 350. VERTICAL SLICE

Первый production milestone.

---

# 351. VERTICAL SLICE WORLD

Часть Asterhold.

Полный Region 1.

Один dungeon.

---

# 352. VERTICAL SLICE CLASSES

Все 5.

Не placeholder одной class.

---

# 353. VERTICAL SLICE SYSTEMS

Movement.

Combat.

Level.

EXP.

Stats.

Skills.

Inventory.

Equipment.

Drops.

Auto Loot.

NPC.

Shop.

Gold.

Potion.

Enhancement.

Mini Boss.

Pit Boss.

Death.

Respawn.

Teleport.

---

# 354. VERTICAL SLICE CONTENT

Минимум:

10 normal enemies.

2 elite.

1 Mini Boss.

1 Pit Boss.

---

# 355. VERTICAL SLICE ITEMS

Минимум:

15 class weapons.

20+ armor pieces.

8–12 accessories.

Materials.

Potions.

Scrolls.

---

# 356. ACCEPTANCE TEST MOVEMENT

Player can:

click ground;

navigate obstacles;

stop;

retarget;

move smoothly.

---

# 357. ACCEPTANCE TEST COMBAT

Target mob.

Approach.

Auto attack.

Use skill.

Kill mob.

Receive EXP.

---

# 358. ACCEPTANCE TEST LEVEL

On level:

stats update correctly.

HP/MP max updates.

skill unlock if applicable.

region unlock if milestone.

---

# 359. ACCEPTANCE TEST ITEM

Level 1 can equip endgame item if acquired.

---

# 360. ACCEPTANCE TEST CLASS RESTRICTION

Mage cannot equip Knight Heavy Armor if item marked Knight-only.

---

# 361. ACCEPTANCE TEST ENHANCEMENT

+3→+4 failure permanently deletes item.

---

# 362. ACCEPTANCE TEST SERVER SECURITY

Changing browser memory must not create:

gold;

items;

EXP;

successful enhancement.

---

# 363. ACCEPTANCE TEST DROP

Drop table deterministic by monster definition.

---

# 364. ACCEPTANCE TEST MINI RB

Death generates hidden random 30–50 minute respawn.

---

# 365. ACCEPTANCE TEST PIT

Death timestamp +7h persists database restart.

---

# 366. ACCEPTANCE TEST PvP

29:

cannot PvP.

30:

can in open zone.

Capital:

never.

---

# 367. ACCEPTANCE TEST TRADE

No duplication when:

disconnect occurs during trade.

---

# 368. ACCEPTANCE TEST AUCTION

Gold/item transfers transactionally.

---

# 369. ACCEPTANCE TEST DEATH

EXP floor prevents level loss.

---

# 370. QA CATEGORIES

Gameplay.

Combat.

Networking.

Database.

Economy.

Security.

UI.

Performance.

Browser compatibility.

Regression.

---

# 371. PERFORMANCE TARGET

Aim:

stable experience on ordinary modern desktop hardware.

---

# 372. FPS TARGET

60 desirable.

30 minimum playable fallback.

---

# 373. DRAW CALL / ASSET DISCIPLINE

Не создавать rendering architecture, которая умирает от 30 players + 50 mobs.

---

# 374. PLAYER DENSITY TEST

Test:

10 players.

25.
26.

100 nearby eventually.

---

# 375. MOB DENSITY TEST

Large farming spot должен работать без massive FPS drop.

---

# 376. LOD

Distant models simplify.

---

# 377. CULLING

Objects outside relevant camera view do not render unnecessarily.

---

# 378. NETWORK INTEREST MANAGEMENT

Server не отправляет игроку весь world state.

Только relevant nearby entities.

---

# 379. WORLD PARTITION

Large world разделить технически на regions/cells.

Для игрока он остаётся целостным.

---

# 380. LOADING

Region transition должен быть максимально мягким.

---

# 381. SERVER INSTANCE PHILOSOPHY

Не делать каждый Region отдельной копией для каждого player.

Open-world identity must remain.

---

# 382. SHARDING

Если потребуется population scaling — отдельное решение.

Не внедрять незаметно так, чтобы guilds перестали встречаться.

---

# 383. SOCIAL VISIBILITY

Игроки должны часто видеть других игроков.

---

# 384. WORLD POPULATION DESIGN

Spots достаточно концентрированы, чтобы возникала конкуренция.

---

# 385. EMPTY WORLD PROBLEM

Не делать map огромной ради размера.

Density важнее пустых километров.

---

# 386. PvP CHOKEPOINTS

Road junction.

Bridge.

Dungeon entrance.

Boss approach.

Rare farming area.

---

# 387. NO FORCED BATTLE ROYALE

Open PvP является системой, а не постоянной ареной.

---

# 388. SAFE PROGRESSION

До 30 игрок учится игре.

---

# 389. REGION 4 TRANSITION

30 level должен ощущаться как:

> Теперь настоящий мир стал опасным.

---

# 390. LEVEL 30 EVENT

При достижении показать clear warning:

Open PvP now enabled outside protected areas.

---

# 391. BOSS COMMUNICATION

Mini Boss:

без глобального announcement.

Pit Boss spawn:

может сопровождаться атмосферным regional/world message.

---

# 392. NO EXACT BOSS COORDINATE

Announcement не ставит GPS marker.

---

# 393. PIT TIME KNOWLEDGE

Игроки сами запоминают kill time.

---

# 394. GUILD INFORMATION WAR

Boss timers становятся социальной информацией.

---

# 395. ENDGAME

After 100:

gear;

enhancement;

boss;

PvP;

guild;

economy;

dungeons.

---

# 396. NO INFINITE LEVELS

100 остаётся cap.

---

# 397. PRESTIGE

Не добавлять автоматические rebirth/paragon.

---

# 398. FUTURE CONTENT

Допустимо позднее:

castle sieges;

guild wars;

alliances;

crafting;

second continent;

rare roaming bosses;

world events.

---

# 399. FUTURE SYSTEM RULE

Новая система не должна уничтожить core value старой.

---

# 400. CASTLE EXAMPLE

Если siege:

gives prestige;

tax;

strategic teleport;

guild identity.

Не +100% combat stats.

---

# 401. CRAFTING FUTURE

Если появится:

не должно полностью заменить mob drops.

---

# 402. WORLD EVENTS FUTURE

Не превращать игру в daily checklist.

---

# 403. MONETIZATION

Launch design:

не влияет на combat.

---

# 404. ALLOWED FUTURE MONETIZATION

Cosmetics.

Costumes.

Weapon skins.

Character appearance.

Name change.

Cosmetic pet.

---

# 405. FORBIDDEN MONETIZATION

Combat power.

EXP boost massive.

Enhancement protection.

Items.

Stats.

PvP advantage.

---

# 406. GAME DIRECTOR CHANGE PROCESS

Если developer считает LOCKED rule проблемным:

он обязан написать:

### PROPOSED DESIGN CHANGE

Current Rule.

Problem.

Suggested Rule.

Gameplay Effect.

Economy Effect.

Technical Effect.

Risk.

---

# 407. NO SILENT CHANGES

Нельзя тихо менять mechanic для удобства coding.

---

# 408. DEVELOPMENT PRIORITY ORDER

1. Movement
2. Camera
3. Combat
4. Mob AI
5. EXP
6. Stats
7. Inventory
8. Equipment
9. Loot
10. Enhancement
11. NPC
12. World
13. Bosses
14. Multiplayer
15. PvP
16. Economy
17. Social systems

При реальной разработке некоторые этапы выполняются параллельно, но core loop всегда приоритетен.

---

# 409. BUILD RULE

Каждый major этап должен завершаться playable build.

---

# 410. NO MASSIVE UNTESTED REWRITE

Большие изменения разбивать так, чтобы проект оставался testable.

---

# 411. SAVE POINTS

Stable versions необходимо сохранять.

---

# 412. REGRESSION TEST

После каждой крупной системы:

проверять старые функции.

---

# 413. ERROR HANDLING

Game should not silently fail.

Critical server errors log.

User получает понятное состояние.

---

# 414. DISCONNECT

При disconnect персонаж должен корректно покинуть мир по серверным правилам.

---

# 415. COMBAT LOGOUT

Нельзя мгновенно исчезнуть из PvP путём закрытия браузера.

Нужен небольшой server combat logout delay.

---

# 416. SERVER RESTART

Persistent values:

characters.

items.

gold.

boss timers.

auction.

guild.

---

# 417. BACKUPS

Database backups обязательны.

---

# 418. ADMIN TOOLS

Разработчику нужен internal admin interface/commands.

---

# 419. ADMIN CAPABILITIES

- spawn monster;
- grant item;
- set level;
- teleport;
- inspect inventory;
- change boss timer;
- reload configs;
- view logs.

---

# 420. ADMIN SECURITY

Admin functions недоступны обычному client.

---

# 421. BALANCE ADMIN

Нужна возможность быстро тестировать:

Level 50 Knight.

Region 5 gear.

Weapon +7.

---

# 422. CONTENT DEBUG

Show:

mob ID.

spawn region.

drop table.

stats.

---

# 423. DEVELOPMENT DATA GENERATION

ИИ может самостоятельно создавать:

items;

mobs;

skills;

names;

locations.

Но обязан соблюдать budgets/formulas.

---

# 424. NO RANDOM NUMBERS WITHOUT CONTEXT

Каждая новая цифра должна сравниваться с system baseline.

---

# 425. CONTENT NAMING

Имена должны быть:

короткими;

запоминающимися;

dark-fantasy;

не generic AI-soup.

---

# 426. ITEM NAME RULE

Хорошо:

Blackroot Fang.

Sword of the Dead Commander.

Vael's Longbow.

Плохо:

Legendary Epic Ancient Ultimate Sword of Cosmic Doom.

---

# 427. WORLD LORE

Lore существует для поддержки мира.

Не перегружает gameplay стенами текста.

---

# 428. ASTERHOLD LORE

Последняя крупная нейтральная крепость после Fracture.

---

# 429. THE FRACTURE

Катастрофа, разрушившая старое королевство.

---

# 430. HIGH-LEVEL STORY

По мере продвижения игрок понимает:

Fracture мог быть не случайностью.

---

# 431. NECROMANCER LORE

Necromancers не обязательно evil.

Это отдельная forbidden tradition.

---

# 432. CLASS LORE

Каждый class встроен в мир, а не существует только как combat template.

---

# 433. AUDIO

Каждый Region:

distinct ambience.

---

# 434. COMBAT AUDIO

Weapon impact должен ощущаться физически.

---

# 435. ENHANCEMENT AUDIO

Success + high enhancement:

memorable sound.

Failure destruction:

distinct emotional impact.

---

# 436. PIT BOSS AUDIO

Unique theme/ambient layer.

---

# 437. UX EMOTIONAL MOMENTS

Особые моменты:

Level Up.

Rare Drop.

Enhancement Success.

Enhancement Destroyed.

Boss Spawn.

Boss Kill.

PvP Kill.

---

# 438. NO CONSTANT FIREWORKS

Если всё мигает, ничто не важно.

---

# 439. HIGH-VALUE DROP FEEDBACK

Должен выделяться, но не mobile-casino effect.

---

# 440. DESTRUCTION FEEDBACK

Если +8 item destroyed:

игрок должен ясно понять, что произошло.

---

# 441. ITEM LOCK

Player может lock valuable item, чтобы случайно:

не продать NPC;

не уничтожить;

не переместить в risky operation.

Но enhancement требует explicit unlock/confirmation.

---

# 442. MASS SELL SAFETY

Protected valuable/enhanced items.

---

# 443. ACCESSIBILITY BASIC

Readable text.

Scalable UI.

Key rebinding later.

Color differences not sole information source.

---

# 444. LOCALIZATION READY

Strings не hardcoded по UI.

---

# 445. LANGUAGE

Первоначально можно RU-first.

Архитектура должна позволять EN.

---

# 446. SERVER TIME

Use canonical server time.

---

# 447. PIT TIMERS

Timezone-independent internally.

---

# 448. SECURITY

Never trust:

client damage;

client position;

client gold;

client loot;

client cooldown.

---

# 449. EXPLOIT PHILOSOPHY

Если действие может создавать value:

server validates.

---

# 450. AFK FARM

Не встроен.

---

# 451. BOT MITIGATION FUTURE

Telemetry может выявлять impossible repetitive patterns.

---

# 452. NO CAPTCHA SPAM

Антибот не должен разрушать игру нормальным игрокам.

---

# 453. FIRST REGION CONTENT STANDARD

Минимум:

12 mobs.

2 elite.

1 Mini RB.

1 Pit Boss.

---

# 454. FIRST REGION FARM SPOTS

Минимум:

5.

---

# 455. FIRST REGION WEAPONS

Каждый class:

минимум 3 meaningful weapons.

---

# 456. FIRST REGION ARMOR

Для каждой armor-family:

minimum set of basic pieces.

---

# 457. FIRST REGION ACCESSORIES

8–12.

---

# 458. FIRST REGION DUNGEON

Distinct enemy composition.

---

# 459. FIRST REGION PIT BOSS

Должен иметь уникальный item для нескольких classes.

---

# 460. REGION 2+ CONTENT RULE

Не просто увеличить HP старых wolves.

Добавлять новые behaviors.

---

# 461. POWER CREEP CONTROL

Каждый следующий Region сильнее, но progression controlled.

---

# 462. BOSS ITEM CONTROL

Boss item \~10–25% stronger than good normal regional alternative.

---

# 463. WHY

Enhancement уже multiplies power.

Слишком сильный base boss gear разрушит рынок.

---

# 464. ACCESSORY CONTROL

Accessory stacking может легко сломать crit/accuracy.

Всегда проверять caps.

---

# 465. STAT CAP

Soft/hard caps определить для:

Crit.

Attack Speed.

Movement.

Block.

Damage Reduction.

---

# 466. PLAYER BUILD VARIATION

Build должен ощущаться, но не создавать математически очевидный единственный вариант во всех ситуациях.

---

# 467. SKILL RESET

Можно дать NPC reset stat/skill за gold.

Не free spam.

---

# 468. GOLD SINK BENEFIT

Reset является дополнительным sink.

---

# 469. PvE/PvP SKILL VALUES

При необходимости один skill может иметь separate PvP coefficient.

---

# 470. TOOLTIP TRANSPARENCY

Если PvP modifier materially different, игрок должен понимать effect.

---

# 471. DAMAGE NUMBERS

Readable.

Не огромный fountain цифр.

---

# 472. FLOATING TEXT

Damage.

Crit.

Miss.

Block.

Heal.

---

# 473. COMBAT RESPONSIVENESS

Client даёт instant visual acknowledgement input.

Server confirmation определяет результат.

---

# 474. ANIMATION LOCK

Не злоупотреблять долгими locks.

---

# 475. ATTACK CANCEL

Определить правила, чтобы PvP skill ceiling существовал, но animation abuse не ломал balance.

---

# 476. TERRAIN

Combat navigation должна учитывать:

rocks;

trees;

walls;

height.

---

# 477. LINE OF SIGHT

Ranged attacks не проходят через стены.

---

# 478. PROJECTILE

Некоторые ranged attacks могут использовать projectile travel.

---

# 479. MELEE PATHING

Character не должен застревать на target.

---

# 480. MOB PATHING

Mobs корректно обходят obstacles.

---

# 481. LEASH

Mob возвращается, если уведён слишком далеко.

---

# 482. BOSS LEASH

Prevents dragging boss across world.

---

# 483. EXPLOIT TERRAIN

Boss cannot be killed from unreachable cliff safely.

---

# 484. PLAYER COLLISION

Другие players обычно не должны полностью блокировать movement телом.

Иначе griefing у teleport.

---

# 485. NPC COLLISION

Avoid blocking.

---

# 486. CORPSE

Mobs могут иметь short death animation, но loot already granted server-side.

---

# 487. NO CLICK-TO-LOOT

Core rule.

---

# 488. RESOURCE DROPS

Unique monster materials later may support crafting/quests.

---

# 489. VENDOR TRASH

Не создавать сотни meaningless gray items.

---

# 490. ECONOMIC LOOT

Даже common material должен иметь функцию:

sell;

quest;

craft future;

consumable.

---

# 491. SERVER ECONOMY DASHBOARD

Во время разработки желательно автоматически видеть:

gold inflow;

gold sinks;

item generation;

item destruction.

---

# 492. ENHANCEMENT SINK IMPORTANCE

Item destruction удаляет gear и поддерживает demand.

---

# 493. MARKET LOOP

Farmers добывают items.

Risk takers уничтожают часть через enhancement.

Покупатели создают спрос.

Это core economy cycle.

---

# 494. LOW-LEVEL ITEM VALUE

Из-за twinks и enhancement некоторые low-region items могут сохранять спрос.

---

# 495. NO SOULBOUND

Помогает secondary market.

---

# 496. BANK / WAREHOUSE

Capital + regional settlements.

---

# 497. ACCOUNT STORAGE

Можно добавить shared warehouse.

---

# 498. ALT CHARACTERS

Поддерживаются.

---

# 499. ALT ITEM TRANSFER

Allowed через account warehouse или trade.

---

# 500. CHARACTER SLOTS

Технически предусмотреть несколько персонажей на account.

---

# 501. FINAL CORE EXPERIENCE

Игрок должен:

выйти из Asterhold;

идти дорогой;

встретить enemies;

найти spot;

начать фарм;

увидеть другого игрока;

понять экономику места;

выбить item;

надеть;

стать сильнее;

получить level;

заточить;

рискнуть;

потерять или усилить item;

пойти на boss;

позвать party;

воевать за доступ;

получить loot;

продать;

повторить цикл.

---

# 502. EMOTIONAL TARGET

Level 73 player видит opponent:

Level 75.

Weapon:

**Vael's Fang +8.**

Этого уже достаточно, чтобы игрок:

оценил угрозу;

понял стоимость;

понял риск;

изменил решение о PvP.

---

# 503. PLAYER MEMORY TARGET

Игрок должен помнить не:

> У меня GearScore 13624.

А:

> Я выбил этот меч с Dead Commander.

> Мы три раза дрались за него.

> Потом я довёл его до +7.

---

# 504. SUCCESS CRITERIA

Игра удалась, если игроки сами начинают говорить:

> Где выбил?

> Кто держит Pit?

> Когда он умер?

> Этот spot занят.

> У него +9.

> Не рискуй +8.

> Давайте соберём party.

> Они уже идут.

---

# 505. FAILURE CRITERIA

Дизайн движется неправильно, если:

игрок бесконечно следует markers;

предметы меняются каждые пять минут;

все mobs одинаковые;

PvP ничего не решает;

boss можно фармить без конкуренции;

заточка не вызывает эмоций;

gold ничего не стоит;

Level 100 получается слишком быстро;

world ощущается lobby.

---

# 506. DEVELOPMENT MANTRA

При каждой новой feature спрашивать:

**Усиливает ли она ценность мира?**

**Усиливает ли она ценность игрока?**

**Усиливает ли она ценность предметов?**

**Создаёт ли она решение?**

**Создаёт ли она конфликт или сотрудничество?**

Если нет — feature необязательна.

---

# 507. DEVELOPMENT AUTONOMY

Если владелец говорит:

> Сделай normal mob AI.

Разработчик самостоятельно:

- выбирает architecture;
- создаёт AI state machine;
- implements aggro;
- leash;
- attack;
- return;
- death;
- respawn;
- tests.

Не спрашивает технические детали.

---

# 508. OWNER COMMUNICATION FORMAT

Владельцу показывать прежде всего:

- что изменилось;
- как это выглядит;
- как тестировать;
- что стало лучше;
- какие игровые решения требуют его мнения.

Не перегружать техническим jargon без необходимости.

---

# 509. BUG PRIORITIES

P0:

dupe;

data loss;

server exploit;

login impossible.

P1:

combat broken;

items disappearing;

boss broken;

major progression blocker.

P2:

UI/gameplay bug.

P3:

cosmetic issue.

---

# 510. NO FEATURE OVER BUG

Critical bugs исправляются до расширения content.

---

# 511. MILESTONE 1

Playable Offline/Local Gameplay Foundation.

Movement.

Combat.

One class initially internally if necessary.

Но пользовательская playable milestone должна быстро перейти к пяти classes.

---

# 512. MILESTONE 2

Full Vertical Slice.

---

# 513. MILESTONE 3

Persistent Online Prototype.

Accounts.

Characters.

Database.

Server.

---

# 514. MILESTONE 4

Multiplayer Open World.

---

# 515. MILESTONE 5

PvP + Economy.

---

# 516. MILESTONE 6

Regions 2–3.

---

# 517. MILESTONE 7

30+ PvP transition.

---

# 518. MILESTONE 8

Guild/Boss ecosystem.

---

# 519. MILESTONE 9

Full 1–100 content production.

---

# 520. CONTENT EXPANSION RULE

Never build Region 10 before fundamental combat in Region 1 is enjoyable.

---

# 521. FIRST PRIORITY

**FARM → DROP → EQUIP → ENHANCE → LEVEL → BOSS**

---

# 522. SECOND PRIORITY

**PLAYER → PLAYER INTERACTION**

---

# 523. THIRD PRIORITY

**WORLD SCALE**

---

# 524. GAME FORMULA

VARENDOR =

Hard Leveling

-

Class Identity

-

Meaningful Fixed Items

-

No Item Level Requirement

-

Destructive Enhancement

-

Unique Monster Drops

-

Open World

-

Scarce Valuable Spots

-

30–50 Minute Mini Bosses

-

7 Hour Pit Bosses

-

Open PvP From Level 30

-

Player Economy

-

Guild Conflict

-

Persistent World.

---

# 525. FINAL DESIGN LAW

VARENDOR не должен пытаться постоянно развлекать игрока искусственными наградами.

Он должен создать мир, внутри которого игрок сам находит причину играть.

Игрок приходит ради level.

Остаётся ради item.

Рискует ради enhancement.

Возвращается ради boss.

Воевать начинает ради spot.

Объединяется ради Pit Boss.

Создаёт guild ради контроля.

Именно так должна формироваться долгосрочная жизнь проекта.

---

# 526. FINAL AI DIRECTIVE

На основании настоящего документа разработчик обязан:

1. сохранять все LOCKED rules;
2. самостоятельно принимать технические решения;
3. строить системы data-driven;
4. не придумывать balance вне общей математики;
5. проверять влияние изменений на economy/combat/progression;
6. сохранять playable состояние проекта;
7. тестировать каждую крупную механику;
8. приоритизировать gameplay над количеством content;
9. не превращать проект в mobile/P2W MMORPG;
10. всегда ориентироваться на ощущение старой суровой MMORPG с современным качеством реализации.

# VARENDOR

**Мир не обязан быть удобным.**

**Он обязан быть ценным.**

**Сила должна быть заработана.**

**Предмет должен иметь историю.**

**Риск должен иметь последствия.**

**Босс должен быть событием.**

**Другой игрок должен быть важнее очередного квестового маркера.**
