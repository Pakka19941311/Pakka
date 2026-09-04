// Centralized gameplay manifest. Presentation code must not invent balance values.
export const CLASSES = {
  knight: { name:'Рыцарь', title:'Несокрушимый авангард', model:'Warrior', color:0xcda15d, resource:'Ярость', ranged:false, hp:642, mp:96, stats:{str:12,dex:6,int:2,vit:14,spi:4}, weapon:'wardens_blade', armor:'militia_plate', skills:[
    {name:'Сокрушающий удар',icon:'⚔',cost:12,cd:5,mul:1.8,fx:'slash'}, {name:'Удар щитом',icon:'⬢',cost:18,cd:9,mul:1.2,stun:2,fx:'impact'}, {name:'Рассекающий удар',icon:'◒',cost:28,cd:12,mul:1.45,aoe:4,fx:'slash'}, {name:'Последний рубеж',icon:'◆',cost:40,cd:28,buff:'guard',fx:'guard'}]},
  mage: { name:'Маг', title:'Повелитель стихий', model:'Wizard', color:0x649dff, resource:'Мана', ranged:true, hp:270, mp:454, stats:{str:3,dex:7,int:15,vit:6,spi:13}, weapon:'ember_staff', armor:'oracle_robe', skills:[
    {name:'Огненная стрела',icon:'✦',cost:22,cd:3.5,mul:1.75,fx:'fire'}, {name:'Ледяное копьё',icon:'❄',cost:32,cd:7,mul:1.5,slow:3,fx:'ice'}, {name:'Цепная молния',icon:'ϟ',cost:48,cd:12,mul:1.35,chain:3,fx:'lightning'}, {name:'Морозное кольцо',icon:'◉',cost:60,cd:22,mul:1.1,aoe:5,fx:'ice'}]},
  assassin: { name:'Ассасин', title:'Клинок из сумрака', model:'Rogue', color:0xbe70e8, resource:'Энергия', ranged:false, hp:370, mp:180, stats:{str:9,dex:15,int:3,vit:8,spi:6}, weapon:'bone_fangs', armor:'night_leather', skills:[
    {name:'Удар из тени',icon:'◈',cost:24,cd:5,mul:2.0,fx:'shadow'}, {name:'Отравленный клинок',icon:'♠',cost:30,cd:9,mul:1.35,dot:5,fx:'poison'}, {name:'Удар в спину',icon:'⟡',cost:45,cd:13,mul:2.65,fx:'shadow'}, {name:'Исчезновение',icon:'◌',cost:55,cd:25,buff:'vanish',fx:'shadow'}]},
  ranger: { name:'Рейнджер', title:'Охотник дальних земель', model:'Ranger', color:0x71c77c, resource:'Концентрация', ranged:true, hp:380, mp:218, stats:{str:7,dex:14,int:5,vit:8,spi:8}, weapon:'blackwood_bow', armor:'tracker_coat', skills:[
    {name:'Точный выстрел',icon:'➶',cost:18,cd:4,mul:1.8,fx:'arrow'}, {name:'Ядовитая стрела',icon:'⌁',cost:28,cd:8,mul:1.25,dot:5,fx:'poison'}, {name:'Отбрасывающая стрела',icon:'»',cost:34,cd:11,mul:1.5,knock:3,fx:'arrow'}, {name:'Град стрел',icon:'⫷',cost:55,cd:21,mul:1.15,aoe:6,fx:'arrow'}]},
  necro: { name:'Некромант', title:'Владыка запретного ритуала', model:'Monk', color:0x5bd6b1, resource:'Эссенция', ranged:true, hp:344, mp:421, stats:{str:4,dex:8,int:14,vit:8,spi:13}, weapon:'mourn_grimoire', armor:'bone_raiment', skills:[
    {name:'Костяное копьё',icon:'†',cost:20,cd:4,mul:1.7,fx:'bone'}, {name:'Похищение жизни',icon:'☾',cost:34,cd:9,mul:1.35,leech:.55,fx:'drain'}, {name:'Проклятие слабости',icon:'⌘',cost:45,cd:14,mul:.9,dot:7,fx:'curse'}, {name:'Призыв скелета',icon:'☠',cost:70,cd:30,summon:true,fx:'summon'}]}
};

export const ITEMS = {
  wardens_blade:{name:'Меч северного дозора',slot:'weapon',icon:'⚔',atk:[12,18],value:140,origin:'Оружейная Астерхолда'}, ember_staff:{name:'Посох тлеющего камня',slot:'weapon',icon:'ϟ',matk:22,value:140,origin:'Архив Серого круга'}, bone_fangs:{name:'Парные костяные клинки',slot:'weapon',icon:'†',atk:[10,16],crit:5,value:140,origin:'Катакомбы границы'}, blackwood_bow:{name:'Лук Чёрного леса',slot:'weapon',icon:'➶',atk:[11,18],accuracy:7,value:140,origin:'Лесная застава'}, mourn_grimoire:{name:'Гримуар Последнего вздоха',slot:'weapon',icon:'▣',matk:24,spirit:3,value:140,origin:'Склеп Безымянных'},
  militia_plate:{name:'Латы пограничной стражи',slot:'chest',icon:'▥',def:14,hp:45,value:115,origin:'Астерхолд'}, oracle_robe:{name:'Мантия пепельного оракула',slot:'chest',icon:'♜',mdef:16,mp:60,value:115,origin:'Серый круг'}, night_leather:{name:'Теневой панцирь',slot:'chest',icon:'◩',def:10,evasion:5,value:115,origin:'Теневой рынок'}, tracker_coat:{name:'Куртка чёрного следопыта',slot:'chest',icon:'▧',def:11,accuracy:5,value:115,origin:'Гринфолл'}, bone_raiment:{name:'Облачение костяного хора',slot:'chest',icon:'☷',mdef:15,mp:45,value:115,origin:'Склеп Безымянных'},
  wolf_gloves:{name:'Перчатки Серой стаи',slot:'gloves',icon:'♢',def:5,crit:3,value:190,origin:'Серые волки'}, grave_boots:{name:'Сапоги могильщика',slot:'boots',icon:'♞',def:5,speed:8,value:220,origin:'Безымянные мертвецы'}, fallen_helm:{name:'Шлем павшего командира',slot:'head',icon:'♛',def:13,hp:70,value:480,origin:'Падший командир'}, ember_ring:{name:'Кольцо тлеющего угля',slot:'ring',icon:'○',matk:8,crit:3,value:420,origin:'Сектанты Пепла'}, fang_necklace:{name:'Ожерелье волчьих клыков',slot:'neck',icon:'◇',atk:[4,6],value:360,origin:'Кровавый Оборотень'}, ash_belt:{name:'Пояс Пепельной клятвы',slot:'belt',icon:'═',def:7,hp:35,value:390,origin:'Изгнанники'},
  executioner:{name:'Клинок Палача',slot:'weapon',icon:'⚔',atk:[31,44],crit:6,accuracy:6,value:2100,origin:'Кровавый Оборотень'}, rotten_root:{name:'Посох Гнилого Корня',slot:'weapon',icon:'♠',matk:54,mp:90,value:2600,origin:'Хозяин Гнилого Леса'}, dead_king_plate:{name:'Панцирь Мёртвого Короля',slot:'chest',icon:'▦',def:31,mdef:18,hp:120,value:2900,origin:'Хозяин Гнилого Леса'}, sovereign_seal:{name:'Печать древнего владыки',slot:'neck',icon:'☼',atk:[8,11],matk:13,hp:60,value:3200,origin:'Хозяин Гнилого Леса'},
  potion:{name:'Багровое зелье',type:'consumable',icon:'♥',value:32,desc:'Восстанавливает 45% здоровья.'}, ether:{name:'Эфирное зелье',type:'consumable',icon:'◆',value:40,desc:'Восстанавливает 45% ресурса.'}, scroll:{name:'Свиток улучшения',type:'enhance',icon:'▤',value:185,desc:'Используется для заточки +0…+15.'}, teleport:{name:'Камень возврата',type:'consumable',icon:'◉',value:90,desc:'Возвращает в Гринфолл.'}, wolf_fang:{name:'Клык серого волка',type:'material',icon:'⌁',value:12,origin:'Серые волки'}, black_bone:{name:'Чёрная кость',type:'material',icon:'╱',value:16,origin:'Безымянные мертвецы'}, venom:{name:'Ядовитая железа',type:'material',icon:'✾',value:19,origin:'Теневые пауки'}, iron:{name:'Кровавая руда',type:'material',icon:'◆',value:24,origin:'Одержимые рудокопы'}, boss_seal:{name:'Осколок печати владыки',type:'material',icon:'✺',value:750,origin:'Хозяин Гнилого Леса'}
};

export const MONSTERS = {
  wolf:{name:'Пепельный гончий',model:'Fox',level:1,hp:85,atk:10,xp:30,gold:[4,9],tint:0x8b8478,scale:.55,drops:[['wolf_fang',.78],['potion',.12],['wolf_gloves',.035]]},
  exile:{name:'Проклятый изгнанник',model:'Rogue',level:2,hp:110,atk:13,xp:42,gold:[6,13],tint:0x9d6a54,scale:.72,drops:[['scroll',.08],['ash_belt',.025]]},
  spider:{name:'Теневой слизень',model:'Slime',level:3,hp:125,atk:15,xp:54,gold:[7,15],tint:0x5b426d,scale:.62,drops:[['venom',.74],['ether',.11],['night_leather',.018]]},
  undead:{name:'Безымянный мертвец',model:'Skeleton',level:4,hp:155,atk:18,xp:70,gold:[9,18],tint:0xb5ad95,scale:.78,drops:[['black_bone',.72],['scroll',.1],['grave_boots',.027]]},
  bat:{name:'Пещерный кровопийца',model:'Bat',level:5,hp:135,atk:21,xp:85,gold:[11,21],tint:0x642f38,scale:.72,drops:[['potion',.17],['fang_necklace',.018]]},
  cultist:{name:'Сектант Пепла',model:'Wizard',level:6,hp:190,atk:24,xp:105,gold:[14,26],tint:0xa54c43,scale:.82,drops:[['scroll',.13],['ember_ring',.022]]},
  miner:{name:'Одержимый рудокоп',model:'Warrior',level:7,hp:235,atk:27,xp:130,gold:[17,31],tint:0x99734d,scale:.9,drops:[['iron',.82],['fallen_helm',.018]]},
  wraith:{name:'Болотный призрак',model:'Monk',level:8,hp:210,atk:31,xp:158,gold:[20,38],tint:0x4bc2a2,scale:.9,drops:[['ether',.19],['scroll',.14],['oracle_robe',.014]]},
  mini:{name:'Кровавый Оборотень',model:'Fox',level:10,hp:1750,atk:43,xp:1100,gold:[180,290],tint:0xb52f32,scale:1.45,boss:'mini',drops:[['fallen_helm',.55],['fang_necklace',.65],['executioner',.22],['scroll',1]]},
  big:{name:'Хозяин Гнилого Леса',model:'Dragon',level:14,hp:6200,atk:64,xp:3900,gold:[650,950],tint:0x477943,scale:1.45,boss:'big',drops:[['boss_seal',1],['rotten_root',.4],['dead_king_plate',.32],['sovereign_seal',.22],['scroll',1]]}
};

export const EQUIP_SLOTS=['head','neck','chest','gloves','weapon','offhand','ring1','ring2','ear1','ear2','belt','boots'];
export const SLOT_NAMES={head:'Голова',neck:'Ожерелье',chest:'Нагрудник',gloves:'Перчатки',weapon:'Оружие',offhand:'Щит / фокус',ring1:'Кольцо I',ring2:'Кольцо II',ear1:'Серьга I',ear2:'Серьга II',belt:'Пояс',boots:'Обувь'};
export const LOCATIONS=[
  {name:'Астерхолд',level:'Столица',desc:'Последний бастион живых.',x:-28,z:-20,kind:'safe'},
  {name:'Гринфолл',level:'1–10',desc:'Пограничная деревня.',x:-7,z:-5,kind:'safe'},
  {name:'Пепельный рубеж',level:'1–10',desc:'Открытые земли изгнанников.',x:10,z:7,kind:'field'},
  {name:'Чёрный лес',level:'10–20',desc:'Лес, который помнит мёртвых.',x:27,z:14,kind:'field'},
  {name:'Заброшенная шахта',level:'Подземелье',desc:'Логово древнего владыки.',x:38,z:31,kind:'dungeon'}
];
