import {CAVE_BOSS_DEFINITION} from './cave-boss.ts';
import { BOOK_ITEMS } from './skill-books.ts';
import {RING_ITEMS,CLOAK_ITEMS,CRAFT_MATERIAL_ITEMS} from './accessories-v3.ts';
import {LATE_HEALING_POTIONS} from './healing-potions-v3.ts';
import {STARTER_ITEMS} from './starter-progression-v3.ts';
// Centralized gameplay manifest. Presentation code must not invent balance values.
export const CLASSES = {
  knight: { name:'Рыцарь', title:'Несокрушимый авангард', model:'Warrior', color:0xcda15d, resource:'Ярость', ranged:false, hp:642, mp:96, stats:{str:12,dex:6,int:2,vit:14,spi:4}, weapon:'wardens_blade', armor:'militia_plate', skills:[
    {name:'Сокрушающий удар',icon:'⚔',cost:12,cd:5,mul:1.8,fx:'slash'}, {name:'Удар щитом',icon:'⬢',cost:18,cd:9,mul:1.2,stun:2,fx:'impact'}, {name:'Рассекающий удар',icon:'◒',cost:28,cd:12,mul:1.45,aoe:4,fx:'slash'}, {name:'Последний рубеж',icon:'◆',cost:40,cd:28,buff:'guard',fx:'guard'}]},
  mage: { name:'Маг', title:'Повелитель стихий', model:'Wizard', color:0x649dff, resource:'Мана', ranged:true, hp:270, mp:454, stats:{str:3,dex:7,int:15,vit:6,spi:13}, weapon:'ember_staff', armor:'oracle_robe', skills:[
    {name:'Огненная стрела',icon:'✦',cost:22,cd:3.5,mul:1.75,fx:'fire'}, {name:'Ледяное копьё',icon:'❄',cost:32,cd:7,mul:1.5,slow:3,fx:'ice'}, {name:'Цепная молния',icon:'ϟ',cost:48,cd:12,mul:1.35,chain:5,chainRadius:6.5,chainFalloff:.76,fx:'lightning'}, {name:'Морозное кольцо',icon:'◉',cost:60,cd:22,mul:1.1,aoe:5,fx:'ice'}]},
  assassin: { name:'Ассасин', title:'Клинок из сумрака', model:'Rogue', color:0xbe70e8, resource:'Энергия', ranged:false, hp:370, mp:180, stats:{str:9,dex:15,int:3,vit:8,spi:6}, weapon:'bone_fangs', armor:'night_leather', skills:[
    {name:'Удар из тени',icon:'◈',cost:24,cd:5,mul:2.0,fx:'shadow'}, {name:'Отравленный клинок',icon:'♠',cost:30,cd:9,mul:1.35,dot:5,fx:'poison'}, {name:'Удар в спину',icon:'⟡',cost:45,cd:13,mul:2.65,fx:'shadow'}, {name:'Исчезновение',icon:'◌',cost:55,cd:25,buff:'vanish',fx:'shadow'}]},
  ranger: { name:'Рейнджер', title:'Охотник дальних земель', model:'Ranger', color:0x71c77c, resource:'Концентрация', ranged:true, hp:380, mp:218, stats:{str:7,dex:14,int:5,vit:8,spi:8}, weapon:'blackwood_bow', armor:'tracker_coat', skills:[
    {name:'Точный выстрел',icon:'➶',cost:18,cd:4,mul:1.8,fx:'arrow'}, {name:'Ядовитая стрела',icon:'⌁',cost:28,cd:8,mul:1.25,dot:5,fx:'poison'}, {name:'Отбрасывающая стрела',icon:'»',cost:34,cd:11,mul:1.5,knock:3,fx:'arrow'}, {name:'Град стрел',icon:'⫷',cost:55,cd:21,mul:1.15,aoe:6,fx:'arrow'}]},
  necro: { name:'Некромант', title:'Владыка запретного ритуала', model:'Monk', color:0x5bd6b1, resource:'Эссенция', ranged:true, hp:344, mp:421, stats:{str:4,dex:8,int:14,vit:8,spi:13}, weapon:'mourn_grimoire', armor:'bone_raiment', skills:[
    {name:'Костяное копьё',icon:'†',cost:20,cd:4,mul:1.7,fx:'bone'}, {name:'Похищение жизни',icon:'☾',cost:34,cd:9,mul:1.35,leech:.55,fx:'drain'}, {name:'Проклятие слабости',icon:'⌘',cost:45,cd:14,mul:.9,dot:7,fx:'curse'}, {name:'Призыв скелета',icon:'☠',cost:70,cd:30,summon:true,fx:'summon'}]}
};

export const ITEMS = {
...BOOK_ITEMS,
  wardens_blade:{"visualModel":"sword","name":"Меч северного дозора","slot":"weapon","icon":"⚔","atk":[12,18],"accuracy":1,"value":140,"origin":"Оружейная Астерхолда","classes":["knight"],"assassinForeign":false},
  ember_staff:{"name":"Посох тлеющего камня","slot":"weapon","icon":"ϟ","matk":22,"atk":[7,11],"accuracy":1,"value":140,"origin":"Архив Серого круга","classes":["mage"],"assassinForeign":false},
  bone_fangs:{"name":"Парные костяные клинки","slot":"weapon","icon":"†","atk":[10,16],"crit":5,"accuracy":2,"value":140,"origin":"Катакомбы границы","classes":["assassin"],"assassinForeign":false},
  blackwood_bow:{"name":"Лук Чёрного леса","slot":"weapon","icon":"➶","atk":[11,18],"accuracy":7,"value":140,"origin":"Лесная застава","classes":["ranger"],"assassinForeign":false},
  mourn_grimoire:{"name":"Гримуар Последнего вздоха","slot":"weapon","icon":"▣","matk":24,"atk":[11,18],"spirit":3,"accuracy":2,"value":140,"origin":"Склеп Безымянных","classes":["necro"],"assassinForeign":false},
  militia_plate:{"visualModel":"armor_chest","name":"Латы пограничной стражи","slot":"chest","icon":"▥","def":14,"hp":45,"value":115,"origin":"Астерхолд","classes":["knight"],"assassinForeign":false},
  oracle_robe:{"name":"Мантия пепельного оракула","slot":"chest","icon":"♜","mdef":16,"mp":60,"value":115,"origin":"Серый круг","classes":["mage","ranger","necro","assassin"],"assassinForeign":true},
  night_leather:{"name":"Теневой панцирь","slot":"chest","icon":"◩","def":10,"evasion":5,"value":115,"origin":"Теневой рынок","classes":["assassin"],"assassinForeign":false},
  tracker_coat:{"name":"Куртка чёрного следопыта","slot":"chest","icon":"▧","def":11,"accuracy":5,"value":115,"origin":"Гринфолл","classes":["mage","ranger","necro","assassin"],"assassinForeign":true},
  bone_raiment:{"name":"Облачение костяного хора","slot":"chest","icon":"☷","mdef":15,"mp":45,"value":115,"origin":"Склеп Безымянных","classes":["mage","ranger","necro","assassin"],"assassinForeign":true},
  wolf_gloves:{"visualModel":"armor_gloves","name":"Перчатки Серой стаи","slot":"gloves","icon":"♢","def":5,"crit":3,"value":190,"origin":"Серые волки","classes":["knight","mage","ranger","necro","assassin"],"assassinForeign":true},
  grave_boots:{"visualModel":"armor_boots","name":"Сапоги могильщика","slot":"boots","icon":"♞","def":5,"speed":8,"value":220,"origin":"Безымянные мертвецы","classes":["knight","mage","ranger","necro","assassin"],"assassinForeign":true},
  fallen_helm:{"visualModel":"helmet_closed","name":"Шлем павшего командира","slot":"head","icon":"♛","def":13,"hp":70,"value":480,"origin":"Падший командир","classes":["knight","mage","ranger","necro","assassin"],"assassinForeign":true},
  fang_necklace:{"name":"Ожерелье волчьих клыков","slot":"neck","icon":"◇","atk":[4,6],"value":360,"origin":"Кровавый Оборотень","classes":["knight","mage","ranger","necro","assassin"],"assassinForeign":false},
  ash_belt:{"visualModel":"armor_belt","name":"Пояс Пепельной клятвы","slot":"belt","icon":"═","def":7,"hp":35,"value":390,"origin":"Изгнанники","classes":["knight","mage","ranger","necro","assassin"],"assassinForeign":false},
  fallen_helm_open:{"name":"Открытый шлем павшего командира","slot":"head","visualModel":"helmet_open","icon":"♛","def":13,"hp":70,"value":480,"origin":"Падший командир","desc":"Открытый вариант шлема павшего командира. Характеристики совпадают с закрытым шлемом.","classes":["knight","mage","ranger","necro","assassin"],"assassinForeign":true},
  executioner:{"visualModel":"sword","name":"Клинок Палача","slot":"weapon","icon":"⚔","atk":[16,22],"crit":3,"accuracy":2,"value":2100,"origin":"Кровавый Оборотень","classes":["knight"],"assassinForeign":false},
  rotten_root:{"name":"Посох Гнилого Корня","slot":"weapon","icon":"♠","matk":28,"mp":30,"accuracy":2,"value":2600,"origin":"Хозяин Гнилого Леса","classes":["mage"],"assassinForeign":false},
  dead_king_plate:{"visualModel":"armor_chest","name":"Панцирь Мёртвого Короля","slot":"chest","icon":"▦","def":18,"mdef":4,"hp":60,"value":2900,"origin":"Хозяин Гнилого Леса","classes":["knight"],"assassinForeign":false},
  sovereign_seal:{"name":"Печать древнего владыки","slot":"neck","icon":"☼","atk":[5,7],"matk":8,"hp":40,"value":3200,"origin":"Хозяин Гнилого Леса","classes":["knight","mage","ranger","necro","assassin"],"assassinForeign":false},
  weapon_scroll:{"name":"Свиток оружия · обычный","type":"enhance","icon":"▤","value":185,"desc":"Оружие: безопасно до +3. Двойной клик — выбрать вещь для одной попытки."},
  weapon_scroll_improved:{"name":"Свиток оружия · улучшенный","type":"enhance","icon":"▤","value":1850,"desc":"Повышенный шанс заточки оружия. Не защищает от уничтожения."},
  armor_scroll:{"name":"Свиток доспехов · обычный","type":"enhance","icon":"▤","value":185,"desc":"Доспехи, плащи, ожерелья, серьга, щит и фокус; кольца не подходят. Безопасно до +1."},
  armor_scroll_improved:{"name":"Свиток доспехов · улучшенный","type":"enhance","icon":"▤","value":1850,"desc":"Доспехи, плащи, ожерелья, серьга, щит и фокус; кольца не подходят. Безопасно до +2; далее повышенный шанс."},
  haste:{"name":"Зелье стремительности","type":"consumable","icon":"»","value":100,"desc":"На 10 минут: бег +50%, скорость атаки +15%. Повторное использование обновляет время."},
  potion:{"name":"Багровое зелье","type":"consumable","icon":"♥","value":32,"heal":37,"desc":"Мгновенно восстанавливает 37 HP."},
  potion_large:{"name":"Большое багровое зелье","type":"consumable","icon":"♥","value":64,"heal":70,"desc":"Мгновенно восстанавливает 70 HP."},
  ether:{"name":"Эфирное зелье","type":"consumable","icon":"◆","value":40,"desc":"Восстанавливает 45% ресурса."},
  scroll:{"name":"Свиток улучшения","type":"enhance","icon":"▤","value":185,"desc":"Старый тип свитка, выведен из использования."},
  teleport:{"name":"Камень возврата","type":"consumable","icon":"◉","value":90,"desc":"Возвращает в Гринфолл."},
  wolf_fang:{"name":"Клык серого волка","type":"material","icon":"⌁","value":12,"origin":"Серые волки"},
  black_bone:{"name":"Чёрная кость","type":"material","icon":"╱","value":16,"origin":"Безымянные мертвецы"},
  venom:{"name":"Ядовитая железа","type":"material","icon":"✾","value":19,"origin":"Теневые пауки"},
  iron:{"name":"Кровавая руда","type":"material","icon":"◆","value":24,"origin":"Одержимые рудокопы"},
  boss_seal:{"name":"Осколок печати владыки","type":"material","icon":"✺","value":750,"origin":"Хозяин Гнилого Леса"},
  rift_sword:{"name":"Меч раскалённого разлома","slot":"weapon","atk":[18,24],"crit":3,"accuracy":3,"icon":"◆","value":650,"origin":"Големы 20/22 ур.","classes":["knight"],"assassinForeign":false,"visualModel":"sword"},
  rift_staff:{"name":"Посох угасшего вулкана","slot":"weapon","matk":30,"mp":35,"accuracy":2,"icon":"◆","value":650,"origin":"Големы 20/22 ур.","classes":["mage"],"assassinForeign":false},
  rift_daggers:{"name":"Клинки обсидиановой тени","slot":"weapon","atk":[16,22],"crit":5,"accuracy":3,"icon":"◆","value":650,"origin":"Големы 20/22 ур.","classes":["assassin"],"assassinForeign":false},
  rift_bow:{"name":"Лук ледяного утёса","slot":"weapon","atk":[17,24],"accuracy":8,"icon":"◆","value":650,"origin":"Големы 20/22 ур.","classes":["ranger"],"assassinForeign":false},
  rift_grimoire:{"name":"Гримуар стылых душ","slot":"weapon","matk":32,"mp":30,"accuracy":3,"icon":"◆","value":650,"origin":"Големы 20/22 ур.","classes":["necro"],"assassinForeign":false},
  rift_plate:{"name":"Латы раскалённой твердыни","slot":"chest","def":20,"mdef":5,"hp":65,"icon":"◆","value":650,"origin":"Големы 20/22 ур.","classes":["knight"],"assassinForeign":false,"visualModel":"armor_chest"},
  rift_helm:{"name":"Шлем базальтового стража","slot":"head","def":14,"hp":75,"icon":"◆","value":650,"origin":"Големы 20/22 ур.","classes":["knight","mage","ranger","necro","assassin"],"assassinForeign":true,"visualModel":"helmet_closed"},
  rift_gloves:{"name":"Перчатки базальтового стража","slot":"gloves","def":6,"crit":3,"icon":"◆","value":650,"origin":"Големы 20/22 ур.","classes":["knight","mage","ranger","necro","assassin"],"assassinForeign":true,"visualModel":"armor_gloves"},
  rift_boots:{"name":"Сапоги базальтового стража","slot":"boots","def":6,"speed":8,"icon":"◆","value":650,"origin":"Големы 20/22 ур.","classes":["knight","mage","ranger","necro","assassin"],"assassinForeign":true,"visualModel":"armor_boots"},
  rift_shield:{"name":"Щит остывшей магмы","slot":"offhand","def":5,"mdef":2,"hp":15,"icon":"◆","value":650,"origin":"Големы 20/22 ур.","classes":["knight","mage","ranger","necro","assassin"],"assassinForeign":true},
  rift_coat:{"name":"Куртка сумеречного странника","slot":"chest","def":14,"hp":20,"accuracy":6,"icon":"◆","value":650,"origin":"Големы 20/22 ур.","classes":["mage","ranger","necro","assassin"],"assassinForeign":true},
  rift_robe:{"name":"Мантия ледяного святилища","slot":"chest","def":2,"mdef":19,"mp":70,"icon":"◆","value":650,"origin":"Големы 20/22 ур.","classes":["mage","ranger","necro","assassin"],"assassinForeign":true},
  shade_chest:{"name":"Панцирь Безлунной тени","slot":"chest","def":13,"hp":20,"evasion":6,"icon":"◆","value":650,"origin":"Големы 20/22 ур.","classes":["assassin"],"assassinForeign":false},
  shade_helm:{"name":"Маска Безлунной тени","slot":"head","def":12,"hp":55,"evasion":1,"icon":"◆","value":650,"origin":"Големы 20/22 ур.","classes":["assassin"],"assassinForeign":false},
  shade_gloves:{"name":"Перчатки Безлунной тени","slot":"gloves","def":5,"crit":3,"evasion":1,"icon":"◆","value":650,"origin":"Големы 20/22 ур.","classes":["assassin"],"assassinForeign":false},
  shade_boots:{"name":"Сапоги Безлунной тени","slot":"boots","def":5,"evasion":2,"speed":8,"icon":"◆","value":650,"origin":"Големы 20/22 ур.","classes":["assassin"],"assassinForeign":false},
  rift_belt:{"name":"Пояс древних рун","slot":"belt","def":8,"hp":40,"icon":"◆","value":650,"origin":"Големы 20/22 ур.","classes":["knight","mage","ranger","necro","assassin"],"assassinForeign":false,"visualModel":"armor_belt"},
  rift_neck_blade:{"name":"Амулет расколотого клыка","slot":"neck","atk":[5,7],"hp":20,"icon":"◆","value":650,"origin":"Големы 20/22 ур.","classes":["knight","mage","ranger","necro","assassin"],"assassinForeign":false},
  rift_neck_soul:{"name":"Амулет ледяного сердца","slot":"neck","matk":9,"mp":25,"icon":"◆","value":650,"origin":"Големы 20/22 ур.","classes":["knight","mage","ranger","necro","assassin"],"assassinForeign":false},
  rift_ear_guard:{"name":"Серьга базальтовой воли","slot":"ear","def":2,"hp":15,"accuracy":1,"icon":"◆","value":650,"origin":"Големы 20/22 ур.","classes":["knight","mage","ranger","necro","assassin"],"assassinForeign":false},
  rift_ear_soul:{"name":"Серьга стылого шёпота","slot":"ear","mdef":2,"mp":15,"crit":1,"icon":"◆","value":650,"origin":"Големы 20/22 ур.","classes":["knight","mage","ranger","necro","assassin"],"assassinForeign":false},
  warden_sword:{"name":"Меч Стража Разлома","slot":"weapon","atk":[21,27],"crit":4,"accuracy":4,"icon":"◆","value":1200,"origin":"Босс 25 ур.","classes":["knight"],"assassinForeign":false,"visualModel":"sword"},
  warden_staff:{"name":"Посох Сердца Разлома","slot":"weapon","matk":33,"mp":40,"accuracy":3,"icon":"◆","value":1200,"origin":"Босс 25 ур.","classes":["mage"],"assassinForeign":false},
  warden_daggers:{"name":"Клинки Последней трещины","slot":"weapon","atk":[19,25],"crit":6,"accuracy":4,"icon":"◆","value":1200,"origin":"Босс 25 ур.","classes":["assassin"],"assassinForeign":false},
  warden_bow:{"name":"Лук Безмолвного Стража","slot":"weapon","atk":[20,27],"accuracy":9,"icon":"◆","value":1200,"origin":"Босс 25 ур.","classes":["ranger"],"assassinForeign":false},
  warden_grimoire:{"name":"Гримуар Погребённого Стража","slot":"weapon","matk":35,"mp":40,"accuracy":4,"icon":"◆","value":1200,"origin":"Босс 25 ур.","classes":["necro"],"assassinForeign":false},
  warden_plate:{"name":"Латы Стража Разлома","slot":"chest","def":22,"mdef":6,"hp":75,"icon":"◆","value":1200,"origin":"Босс 25 ур.","classes":["knight"],"assassinForeign":false,"visualModel":"armor_chest"},
  warden_vestment:{"name":"Облачение хранителя печати","slot":"chest","def":15,"mdef":20,"hp":30,"mp":75,"accuracy":6,"icon":"◆","value":1200,"origin":"Босс 25 ур.","classes":["mage","ranger","necro","assassin"],"assassinForeign":true},
  warden_shade:{"name":"Панцирь Погребённой тени","slot":"chest","def":15,"hp":30,"evasion":7,"icon":"◆","value":1200,"origin":"Босс 25 ур.","classes":["assassin"],"assassinForeign":false},
  warden_seal:{"name":"Печать Сердца Разлома","slot":"neck","atk":[6,8],"matk":10,"hp":45,"icon":"◆","value":1200,"origin":"Босс 25 ур.","classes":["knight","mage","ranger","necro","assassin"],"assassinForeign":false},
  fire_core:{"name":"Огненное ядро","type":"material","icon":"◆","value":45,"origin":"Разлом големов"},
  ice_core:{"name":"Ледяное ядро","type":"material","icon":"◆","value":45,"origin":"Разлом големов"},
  ancient_shard:{"name":"Осколок древнего камня","type":"material","icon":"◆","value":90,"origin":"Разлом големов"},
  ...RING_ITEMS,...CLOAK_ITEMS,...CRAFT_MATERIAL_ITEMS,...STARTER_ITEMS,...LATE_HEALING_POTIONS,
};

export const MONSTERS = {
  fire_golem:{visualModel:'FireGolem',visualHeight:3.1,name:'Огненный голем',model:'FireGolem',level:20,hp:650,atk:60,xp:750,gold:[45,75],tint:0xff6c28,scale:1.45,drops:[]},
  ice_golem:{visualModel:'IceGolem',visualHeight:3.1,name:'Ледяной голем',model:'IceGolem',level:22,hp:750,atk:66,xp:950,gold:[55,90],tint:0x86d6ee,scale:1.5,drops:[]},
  cave_boss:CAVE_BOSS_DEFINITION,
  rift_boss:{visualModel:'RiftWarden',visualHeight:5.1,name:'Страж раскалённого разлома',model:'RiftWarden',level:25,hp:9000,atk:90,xp:9000,gold:[1400,2000],tint:0xff963e,scale:2.3,boss:'big',drops:[]},
  night_zombie:{visualModel:'Zombie',visualHeight:1.92,name:'Ночной зомби',model:'Monk',level:4,hp:155,atk:18,xp:70,gold:[9,18],tint:0x70885b,scale:.8,drops:[['weapon_scroll_improved',.005],['armor_scroll_improved',.005],['fang_necklace',.01]]},
  night_skeleton:{visualModel:'SkeletonV3',visualHeight:1.92,name:'Лунный скелет',model:'Skeleton',level:4,hp:155,atk:18,xp:70,gold:[9,18],tint:0xc3d1bd,scale:.78,drops:[['weapon_scroll_improved',.005],['armor_scroll_improved',.005],['fang_necklace',.01]]},
  wolf:{name:'Пепельный гончий',model:'Fox',level:1,hp:85,atk:10,xp:30,gold:[4,9],tint:0x8b8478,scale:.55,drops:[['wolf_fang',.78],['potion',.12],['wolf_gloves',.035]]},
  exile:{name:'Проклятый изгнанник',model:'Rogue',level:2,hp:110,atk:13,xp:42,gold:[6,13],tint:0x9d6a54,scale:.72,drops:[['ash_belt',.025]]},
  spider:{name:'Теневой слизень',model:'Slime',level:3,hp:125,atk:15,xp:54,gold:[7,15],tint:0x5b426d,scale:.62,drops:[['venom',.74],['ether',.11],['night_leather',.018]]},
  undead:{visualModel:'SkeletonV3',visualHeight:1.92,name:'Безымянный мертвец',model:'Skeleton',level:4,hp:155,atk:18,xp:70,gold:[9,18],tint:0xb5ad95,scale:.78,drops:[['black_bone',.72],['grave_boots',.027]]},
  bat:{visualModel:'GiantBat',visualHeight:1.6,name:'Пещерный кровопийца',model:'Bat',level:5,hp:135,atk:21,xp:85,gold:[11,21],tint:0x642f38,scale:.72,drops:[['potion',.17],['fang_necklace',.018]]},
  cultist:{name:'Сектант Пепла',model:'Wizard',level:6,hp:190,atk:24,xp:105,gold:[14,26],tint:0xa54c43,scale:.82,drops:[]},
  miner:{visualModel:'Zombie',visualHeight:1.92,name:'Одержимый рудокоп',model:'Warrior',level:7,hp:235,atk:27,xp:130,gold:[17,31],tint:0x99734d,scale:.9,drops:[['iron',.82],['fallen_helm',.018]]},
  wraith:{visualModel:'WraithV3',visualHeight:2.15,name:'Болотный призрак',model:'Monk',level:8,hp:210,atk:31,xp:158,gold:[20,38],tint:0x4bc2a2,scale:.9,drops:[['ether',.19],['oracle_robe',.014]]},
  mini:{visualModel:'Werewolf',visualHeight:3.2,name:'Кровавый Оборотень',model:'Fox',level:10,hp:1750,atk:43,xp:1100,gold:[180,290],tint:0xb52f32,scale:1.45,boss:'mini',drops:[['fallen_helm',.55],['fang_necklace',.65],['executioner',.22]]},
  big:{name:'Хозяин Гнилого Леса',model:'Dragon',visualModel:'ForestLord',visualHeight:5.2,level:14,hp:6200,atk:64,xp:3900,gold:[650,950],tint:0x477943,scale:1.45,boss:'big',drops:[['boss_seal',1],['rotten_root',.4],['dead_king_plate',.32],['sovereign_seal',.22]]}
};

export const EQUIP_SLOTS=['head','neck','chest','gloves','weapon','offhand','ring1','ring2','ear1','cloak','belt','boots'];
export const SLOT_NAMES={head:'Голова',neck:'Ожерелье',chest:'Нагрудник',gloves:'Перчатки',weapon:'Оружие',offhand:'Щит / фокус',ring1:'Кольцо I',ring2:'Кольцо II',ear1:'Серьга',cloak:'Плащ',belt:'Пояс',boots:'Обувь'};
export const LOCATIONS=[
  {name:'Астерхолд',level:'Столица',desc:'Последний бастион живых.',x:-108,z:-82,kind:'safe'},
  {name:'Гринфолл',level:'1–10',desc:'Пограничная крепость: площадь, ремесло, донжон.',x:-7,z:-5,kind:'safe'},
  {name:'Пепельный рубеж',level:'1–10',desc:'Открытые земли изгнанников.',x:96,z:-77,kind:'field'},
  {name:'Чёрный лес',level:'10–20',desc:'Лес, который помнит мёртвых.',x:103,z:61,kind:'field'},
  {name:'Заброшенная шахта',level:'Подземелье',desc:'Северная выработка под скальным хребтом.',x:-46,z:109,kind:'dungeon'}
];
