/**
 * Accepted V3 canonical catalogue. STAGED DATA ONLY: this module must not register
 * fallback combatants in MONSTERS or replace the live spawn manifest.
 * Source: WORLD_PROGRESS_V3 POP-003/004, RB-001/002 and WORLD_DESIGN_V3.
 * Layout uses east +X / south +Z; runtime uses east +X / north +Z.
 */
import type {SpaceId} from '../world/world-space.ts';

export type LocationId = `L${string}`;
export type LayoutXZ = readonly [number, number];
export type MobV3 = {id:string;speciesId:string;name:string;levelBand:readonly [number,number];legacySpeciesId:string|null;actorRadius:number;assetGate:string};
export type HuntingZoneV3 = {id:string;locationId:LocationId;name:string;spaceId:SpaceId;anchorLayout:LayoutXZ;counts:readonly {mobId:string;count:number}[]};
export const WORLD_V3_REVISION = 'world-expansion-v3-p0-1';
export const WORLD_V3_ACTIVATION = {runtimeEnabled:false,requiredGates:['unique-approved-assets','native-animation-combat','safe-boundary-runtime','population-migration-dry-run','new-class-stat-balance','native-route-and-performance']} as const;
export const WORLD_V3_TARGET = {width:1600,depth:1400,levelCap:90,ordinary:2400,miniBosses:12,majorBosses:4,total:2416} as const;
export const WORLD_V3_LOCATION_COUNTS = {L01:100,L02:150,L03:400,L04:200,L05:200,L06:160,L07:160,L08:180,L09:240,L10:150,L11:180,L12:280} as const;
/** P1 administrative outskirts, within the existing 1600x1400 terrain.
 * The west strip follows the free gap east of L03. No terrain/collision change.
 * The original contour is retained in hunting-layout.json for migration/review.
 */
export const SURFACE_LOCATION_OVERRIDES_V3:Record<string,number[][]> = {
 L02:[[-232,65],[-40,55],[15,150],[-10,245],[-180,265],[-250,236],[-266,160]],
};
export const MOBS_V3:readonly MobV3[] = [
  {
    "id": "MOB-01",
    "speciesId": "spider",
    "name": "Теневой слизень",
    "levelBand": [
      1,
      4
    ],
    "legacySpeciesId": "spider",
    "actorRadius": 0.46,
    "assetGate": "not-runtime-accepted"
  },
  {
    "id": "MOB-02",
    "speciesId": "wolf",
    "name": "Пепельный гончий",
    "levelBand": [
      5,
      9
    ],
    "legacySpeciesId": "wolf",
    "actorRadius": 1.615,
    "assetGate": "not-runtime-accepted"
  },
  {
    "id": "MOB-03",
    "speciesId": "v3_field_rat",
    "name": "Полевая крыса",
    "levelBand": [
      1,
      3
    ],
    "legacySpeciesId": null,
    "actorRadius": 0.46,
    "assetGate": "not-runtime-accepted"
  },
  {
    "id": "MOB-04",
    "speciesId": "v3_forest_boar",
    "name": "Лесной кабан",
    "levelBand": [
      3,
      6
    ],
    "legacySpeciesId": null,
    "actorRadius": 0.46,
    "assetGate": "not-runtime-accepted"
  },
  {
    "id": "MOB-05",
    "speciesId": "v3_armored_beetle",
    "name": "Панцирный жук",
    "levelBand": [
      7,
      9
    ],
    "legacySpeciesId": null,
    "actorRadius": 0.46,
    "assetGate": "not-runtime-accepted"
  },
  {
    "id": "MOB-06",
    "speciesId": "v3_forest_spider",
    "name": "Лесной паук",
    "levelBand": [
      10,
      14
    ],
    "legacySpeciesId": null,
    "actorRadius": 0.46,
    "assetGate": "not-runtime-accepted"
  },
  {
    "id": "MOB-07",
    "speciesId": "v3_road_bandit",
    "name": "Разбойник тракта",
    "levelBand": [
      12,
      17
    ],
    "legacySpeciesId": null,
    "actorRadius": 0.46,
    "assetGate": "not-runtime-accepted"
  },
  {
    "id": "MOB-08",
    "speciesId": "v3_lynx",
    "name": "Рысь",
    "levelBand": [
      12,
      17
    ],
    "legacySpeciesId": null,
    "actorRadius": 0.46,
    "assetGate": "not-runtime-accepted"
  },
  {
    "id": "MOB-09",
    "speciesId": "exile",
    "name": "Проклятый изгнанник",
    "levelBand": [
      18,
      24
    ],
    "legacySpeciesId": "exile",
    "actorRadius": 0.46,
    "assetGate": "not-runtime-accepted"
  },
  {
    "id": "MOB-10",
    "speciesId": "v3_poacher",
    "name": "Браконьер",
    "levelBand": [
      16,
      21
    ],
    "legacySpeciesId": null,
    "actorRadius": 0.46,
    "assetGate": "not-runtime-accepted"
  },
  {
    "id": "MOB-11",
    "speciesId": "v3_goblin_trapper",
    "name": "Гоблин-ловчий",
    "levelBand": [
      18,
      23
    ],
    "legacySpeciesId": null,
    "actorRadius": 0.46,
    "assetGate": "not-runtime-accepted"
  },
  {
    "id": "MOB-12",
    "speciesId": "v3_reed_mantis",
    "name": "Камышовый богомол",
    "levelBand": [
      20,
      25
    ],
    "legacySpeciesId": null,
    "actorRadius": 0.46,
    "assetGate": "not-runtime-accepted"
  },
  {
    "id": "MOB-13",
    "speciesId": "v3_river_crab",
    "name": "Речной рак",
    "levelBand": [
      20,
      25
    ],
    "legacySpeciesId": null,
    "actorRadius": 0.46,
    "assetGate": "not-runtime-accepted"
  },
  {
    "id": "MOB-14",
    "speciesId": "v3_swamp_toad",
    "name": "Болотная жаба",
    "levelBand": [
      24,
      29
    ],
    "legacySpeciesId": null,
    "actorRadius": 0.46,
    "assetGate": "not-runtime-accepted"
  },
  {
    "id": "MOB-15",
    "speciesId": "v3_satyr",
    "name": "Сатир",
    "levelBand": [
      22,
      28
    ],
    "legacySpeciesId": null,
    "actorRadius": 0.46,
    "assetGate": "not-runtime-accepted"
  },
  {
    "id": "MOB-16",
    "speciesId": "bat",
    "name": "Пещерный кровопийца",
    "levelBand": [
      25,
      31
    ],
    "legacySpeciesId": "bat",
    "actorRadius": 0.46,
    "assetGate": "not-runtime-accepted"
  },
  {
    "id": "MOB-17",
    "speciesId": "miner",
    "name": "Одержимый рудокоп",
    "levelBand": [
      28,
      34
    ],
    "legacySpeciesId": "miner",
    "actorRadius": 0.46,
    "assetGate": "not-runtime-accepted"
  },
  {
    "id": "MOB-18",
    "speciesId": "v3_armored_scorpion",
    "name": "Панцирный скорпион",
    "levelBand": [
      29,
      35
    ],
    "legacySpeciesId": null,
    "actorRadius": 0.46,
    "assetGate": "not-runtime-accepted"
  },
  {
    "id": "MOB-19",
    "speciesId": "v3_kobold_orethief",
    "name": "Кобольд-рудокрад",
    "levelBand": [
      30,
      36
    ],
    "legacySpeciesId": null,
    "actorRadius": 0.46,
    "assetGate": "not-runtime-accepted"
  },
  {
    "id": "MOB-20",
    "speciesId": "undead",
    "name": "Безымянный мертвец",
    "levelBand": [
      30,
      36
    ],
    "legacySpeciesId": "undead",
    "actorRadius": 0.46,
    "assetGate": "not-runtime-accepted"
  },
  {
    "id": "MOB-21",
    "speciesId": "v3_stonebreaker_troll",
    "name": "Тролль-камнелом",
    "levelBand": [
      34,
      40
    ],
    "legacySpeciesId": null,
    "actorRadius": 1.05,
    "assetGate": "not-runtime-accepted"
  },
  {
    "id": "MOB-22",
    "speciesId": "night_zombie",
    "name": "Ночной зомби",
    "levelBand": [
      35,
      41
    ],
    "legacySpeciesId": "night_zombie",
    "actorRadius": 0.46,
    "assetGate": "not-runtime-accepted"
  },
  {
    "id": "MOB-23",
    "speciesId": "v3_fungal_walker",
    "name": "Грибной ходок",
    "levelBand": [
      34,
      40
    ],
    "legacySpeciesId": null,
    "actorRadius": 0.46,
    "assetGate": "not-runtime-accepted"
  },
  {
    "id": "MOB-24",
    "speciesId": "v3_blind_salamander",
    "name": "Слепая саламандра",
    "levelBand": [
      35,
      39
    ],
    "legacySpeciesId": null,
    "actorRadius": 0.46,
    "assetGate": "not-runtime-accepted"
  },
  {
    "id": "MOB-25",
    "speciesId": "wraith",
    "name": "Болотный призрак",
    "levelBand": [
      40,
      46
    ],
    "legacySpeciesId": "wraith",
    "actorRadius": 0.46,
    "assetGate": "not-runtime-accepted"
  },
  {
    "id": "MOB-26",
    "speciesId": "v3_corrupted_dryad",
    "name": "Осквернённая дриада",
    "levelBand": [
      42,
      48
    ],
    "legacySpeciesId": null,
    "actorRadius": 0.46,
    "assetGate": "not-runtime-accepted"
  },
  {
    "id": "MOB-27",
    "speciesId": "v3_root_crawler",
    "name": "Корневой ползун",
    "levelBand": [
      43,
      49
    ],
    "legacySpeciesId": null,
    "actorRadius": 0.46,
    "assetGate": "not-runtime-accepted"
  },
  {
    "id": "MOB-28",
    "speciesId": "v3_gargoyle",
    "name": "Горгулья",
    "levelBand": [
      45,
      51
    ],
    "legacySpeciesId": null,
    "actorRadius": 0.46,
    "assetGate": "not-runtime-accepted"
  },
  {
    "id": "MOB-29",
    "speciesId": "v3_orc_raider",
    "name": "Орк-разоритель",
    "levelBand": [
      46,
      52
    ],
    "legacySpeciesId": null,
    "actorRadius": 0.46,
    "assetGate": "not-runtime-accepted"
  },
  {
    "id": "MOB-30",
    "speciesId": "cultist",
    "name": "Сектант Пепла",
    "levelBand": [
      48,
      54
    ],
    "legacySpeciesId": "cultist",
    "actorRadius": 0.46,
    "assetGate": "not-runtime-accepted"
  },
  {
    "id": "MOB-31",
    "speciesId": "v3_harpy",
    "name": "Гарпия",
    "levelBand": [
      50,
      56
    ],
    "legacySpeciesId": null,
    "actorRadius": 0.46,
    "assetGate": "not-runtime-accepted"
  },
  {
    "id": "MOB-32",
    "speciesId": "v3_minotaur",
    "name": "Минотавр",
    "levelBand": [
      52,
      58
    ],
    "legacySpeciesId": null,
    "actorRadius": 1.05,
    "assetGate": "not-runtime-accepted"
  },
  {
    "id": "MOB-33",
    "speciesId": "v3_snow_leopard",
    "name": "Снежный барс",
    "levelBand": [
      52,
      58
    ],
    "legacySpeciesId": null,
    "actorRadius": 0.46,
    "assetGate": "not-runtime-accepted"
  },
  {
    "id": "MOB-34",
    "speciesId": "v3_yeti",
    "name": "Йети",
    "levelBand": [
      55,
      61
    ],
    "legacySpeciesId": null,
    "actorRadius": 1.05,
    "assetGate": "not-runtime-accepted"
  },
  {
    "id": "MOB-35",
    "speciesId": "ice_golem",
    "name": "Ледяной голем",
    "levelBand": [
      58,
      64
    ],
    "legacySpeciesId": "ice_golem",
    "actorRadius": 1.05,
    "assetGate": "not-runtime-accepted"
  },
  {
    "id": "MOB-36",
    "speciesId": "v3_ice_worm",
    "name": "Ледяной червь",
    "levelBand": [
      60,
      66
    ],
    "legacySpeciesId": null,
    "actorRadius": 0.46,
    "assetGate": "not-runtime-accepted"
  },
  {
    "id": "MOB-37",
    "speciesId": "v3_living_armor",
    "name": "Оживший доспех",
    "levelBand": [
      60,
      66
    ],
    "legacySpeciesId": null,
    "actorRadius": 0.46,
    "assetGate": "not-runtime-accepted"
  },
  {
    "id": "MOB-38",
    "speciesId": "v3_ash_imp",
    "name": "Пепельный бес",
    "levelBand": [
      63,
      69
    ],
    "legacySpeciesId": null,
    "actorRadius": 0.46,
    "assetGate": "not-runtime-accepted"
  },
  {
    "id": "MOB-39",
    "speciesId": "fire_golem",
    "name": "Огненный голем",
    "levelBand": [
      66,
      72
    ],
    "legacySpeciesId": "fire_golem",
    "actorRadius": 1.05,
    "assetGate": "not-runtime-accepted"
  },
  {
    "id": "MOB-40",
    "speciesId": "v3_basalt_centipede",
    "name": "Базальтовая многоножка",
    "levelBand": [
      68,
      74
    ],
    "legacySpeciesId": null,
    "actorRadius": 0.46,
    "assetGate": "not-runtime-accepted"
  },
  {
    "id": "MOB-41",
    "speciesId": "v3_lava_elemental",
    "name": "Лавовый элементаль",
    "levelBand": [
      72,
      78
    ],
    "legacySpeciesId": null,
    "actorRadius": 1.05,
    "assetGate": "not-runtime-accepted"
  },
  {
    "id": "MOB-42",
    "speciesId": "v3_demon_executioner",
    "name": "Демон-палач",
    "levelBand": [
      75,
      81
    ],
    "legacySpeciesId": null,
    "actorRadius": 1.05,
    "assetGate": "not-runtime-accepted"
  },
  {
    "id": "MOB-43",
    "speciesId": "v3_banshee",
    "name": "Банши",
    "levelBand": [
      70,
      76
    ],
    "legacySpeciesId": null,
    "actorRadius": 0.46,
    "assetGate": "not-runtime-accepted"
  },
  {
    "id": "MOB-44",
    "speciesId": "night_skeleton",
    "name": "Лунный скелет",
    "levelBand": [
      72,
      78
    ],
    "legacySpeciesId": "night_skeleton",
    "actorRadius": 0.46,
    "assetGate": "not-runtime-accepted"
  },
  {
    "id": "MOB-45",
    "speciesId": "v3_grave_knight",
    "name": "Могильный рыцарь",
    "levelBand": [
      78,
      84
    ],
    "legacySpeciesId": null,
    "actorRadius": 0.46,
    "assetGate": "not-runtime-accepted"
  },
  {
    "id": "MOB-46",
    "speciesId": "v3_renegade_necromancer",
    "name": "Некромант-отступник",
    "levelBand": [
      80,
      86
    ],
    "legacySpeciesId": null,
    "actorRadius": 0.46,
    "assetGate": "not-runtime-accepted"
  },
  {
    "id": "MOB-47",
    "speciesId": "v3_void_devourer",
    "name": "Пожиратель пустоты",
    "levelBand": [
      84,
      90
    ],
    "legacySpeciesId": null,
    "actorRadius": 1.05,
    "assetGate": "not-runtime-accepted"
  },
  {
    "id": "MOB-48",
    "speciesId": "v3_bone_colossus",
    "name": "Костяной колосс",
    "levelBand": [
      86,
      90
    ],
    "legacySpeciesId": null,
    "actorRadius": 1.05,
    "assetGate": "not-runtime-accepted"
  }
];
export const HUNTING_ZONES_V3:readonly HuntingZoneV3[] = [
  {
    "id": "L01-A",
    "locationId": "L01",
    "name": "Поля вне посёлка",
    "spaceId": "surface",
    "anchorLayout": [
      -545,
      393
    ],
    "counts": [
      {
        "mobId": "MOB-02",
        "count": 20
      },
      {
        "mobId": "MOB-03",
        "count": 20
      },
      {
        "mobId": "MOB-05",
        "count": 20
      }
    ]
  },
  {
    "id": "L01-B",
    "locationId": "L01",
    "name": "Лесной край браконьеров",
    "spaceId": "surface",
    "anchorLayout": [
      -569,
      327
    ],
    "counts": [
      {
        "mobId": "MOB-10",
        "count": 40
      }
    ]
  },
  {
    "id": "L02-A",
    "locationId": "L02",
    "name": "Ближняя окраина",
    "spaceId": "surface",
    "anchorLayout": [
      -220,
      212
    ],
    "counts": [
      {
        "mobId": "MOB-01",
        "count": 35
      },
      {
        "mobId": "MOB-03",
        "count": 25
      }
    ]
  },
  {
    "id": "L02-B",
    "locationId": "L02",
    "name": "Кустарниковый склон",
    "spaceId": "surface",
    "anchorLayout": [
      -246,
      165
    ],
    "counts": [
      {
        "mobId": "MOB-04",
        "count": 45
      }
    ]
  },
  {
    "id": "L02-C",
    "locationId": "L02",
    "name": "Дальний край стартовой охоты",
    "spaceId": "surface",
    "anchorLayout": [
      -234,
      95
    ],
    "counts": [
      {
        "mobId": "MOB-02",
        "count": 25
      },
      {
        "mobId": "MOB-05",
        "count": 20
      }
    ]
  },
  {
    "id": "L03-A",
    "locationId": "L03",
    "name": "Низкая опушка",
    "spaceId": "surface",
    "anchorLayout": [
      -455,
      100
    ],
    "counts": [
      {
        "mobId": "MOB-04",
        "count": 10
      },
      {
        "mobId": "MOB-06",
        "count": 40
      },
      {
        "mobId": "MOB-07",
        "count": 30
      },
      {
        "mobId": "MOB-08",
        "count": 40
      }
    ]
  },
  {
    "id": "L03-B",
    "locationId": "L03",
    "name": "Глубокий живой лес",
    "spaceId": "surface",
    "anchorLayout": [
      -565,
      -165
    ],
    "counts": [
      {
        "mobId": "MOB-09",
        "count": 40
      },
      {
        "mobId": "MOB-11",
        "count": 40
      },
      {
        "mobId": "MOB-15",
        "count": 40
      }
    ]
  },
  {
    "id": "L03-C",
    "locationId": "L03",
    "name": "Гнилая чаща и корни",
    "spaceId": "surface",
    "anchorLayout": [
      -200,
      -410
    ],
    "counts": [
      {
        "mobId": "MOB-21",
        "count": 25
      },
      {
        "mobId": "MOB-22",
        "count": 30
      },
      {
        "mobId": "MOB-25",
        "count": 25
      },
      {
        "mobId": "MOB-26",
        "count": 40
      },
      {
        "mobId": "MOB-27",
        "count": 40
      }
    ]
  },
  {
    "id": "L04-A",
    "locationId": "L04",
    "name": "Нижний снежный подъём",
    "spaceId": "surface",
    "anchorLayout": [
      -605,
      -295
    ],
    "counts": [
      {
        "mobId": "MOB-31",
        "count": 30
      },
      {
        "mobId": "MOB-33",
        "count": 35
      }
    ]
  },
  {
    "id": "L04-B",
    "locationId": "L04",
    "name": "Высокие уступы",
    "spaceId": "surface",
    "anchorLayout": [
      -625,
      -440
    ],
    "counts": [
      {
        "mobId": "MOB-34",
        "count": 40
      },
      {
        "mobId": "MOB-35",
        "count": 45
      }
    ]
  },
  {
    "id": "L04-C",
    "locationId": "L04",
    "name": "Ледяные седловины",
    "spaceId": "surface",
    "anchorLayout": [
      -515,
      -595
    ],
    "counts": [
      {
        "mobId": "MOB-36",
        "count": 50
      }
    ]
  },
  {
    "id": "L05-A",
    "locationId": "L05",
    "name": "Наружные выработки",
    "spaceId": "surface",
    "anchorLayout": [
      15,
      -390
    ],
    "counts": [
      {
        "mobId": "MOB-11",
        "count": 20
      },
      {
        "mobId": "MOB-16",
        "count": 20
      },
      {
        "mobId": "MOB-17",
        "count": 40
      }
    ]
  },
  {
    "id": "L05-B",
    "locationId": "L05",
    "name": "Камеры шахты",
    "spaceId": "mine",
    "anchorLayout": [
      -15,
      -155
    ],
    "counts": [
      {
        "mobId": "MOB-16",
        "count": 10
      },
      {
        "mobId": "MOB-17",
        "count": 30
      },
      {
        "mobId": "MOB-18",
        "count": 25
      },
      {
        "mobId": "MOB-19",
        "count": 35
      },
      {
        "mobId": "MOB-21",
        "count": 20
      }
    ]
  },
  {
    "id": "L06-A",
    "locationId": "L06",
    "name": "Дальние берега",
    "spaceId": "surface",
    "anchorLayout": [
      10,
      -225
    ],
    "counts": [
      {
        "mobId": "MOB-12",
        "count": 40
      },
      {
        "mobId": "MOB-13",
        "count": 60
      }
    ]
  },
  {
    "id": "L06-B",
    "locationId": "L06",
    "name": "Заводи вне пристани",
    "spaceId": "surface",
    "anchorLayout": [
      380,
      142
    ],
    "counts": [
      {
        "mobId": "MOB-12",
        "count": 40
      },
      {
        "mobId": "MOB-13",
        "count": 20
      }
    ]
  },
  {
    "id": "L07-A",
    "locationId": "L07",
    "name": "Передние камеры",
    "spaceId": "great_cave",
    "anchorLayout": [
      0,
      -160
    ],
    "counts": [
      {
        "mobId": "MOB-16",
        "count": 35
      },
      {
        "mobId": "MOB-18",
        "count": 25
      }
    ]
  },
  {
    "id": "L07-B",
    "locationId": "L07",
    "name": "Внутренние камеры",
    "spaceId": "great_cave",
    "anchorLayout": [
      -15,
      -290
    ],
    "counts": [
      {
        "mobId": "MOB-23",
        "count": 50
      },
      {
        "mobId": "MOB-24",
        "count": 50
      }
    ]
  },
  {
    "id": "L08-A",
    "locationId": "L08",
    "name": "Внешние руины",
    "spaceId": "surface",
    "anchorLayout": [
      570,
      75
    ],
    "counts": [
      {
        "mobId": "MOB-28",
        "count": 20
      },
      {
        "mobId": "MOB-30",
        "count": 30
      },
      {
        "mobId": "MOB-31",
        "count": 20
      }
    ]
  },
  {
    "id": "L08-B",
    "locationId": "L08",
    "name": "Ритуальные террасы",
    "spaceId": "surface",
    "anchorLayout": [
      655,
      -115
    ],
    "counts": [
      {
        "mobId": "MOB-32",
        "count": 60
      },
      {
        "mobId": "MOB-37",
        "count": 50
      }
    ]
  },
  {
    "id": "L09-A",
    "locationId": "L09",
    "name": "Пепельные предгорья",
    "spaceId": "surface",
    "anchorLayout": [
      550,
      -210
    ],
    "counts": [
      {
        "mobId": "MOB-30",
        "count": 35
      },
      {
        "mobId": "MOB-38",
        "count": 35
      }
    ]
  },
  {
    "id": "L09-B",
    "locationId": "L09",
    "name": "Склоны и внутренние полки",
    "spaceId": "surface",
    "anchorLayout": [
      585,
      -370
    ],
    "counts": [
      {
        "mobId": "MOB-39",
        "count": 40
      },
      {
        "mobId": "MOB-40",
        "count": 30
      },
      {
        "mobId": "MOB-41",
        "count": 30
      }
    ]
  },
  {
    "id": "L09-C",
    "locationId": "L09",
    "name": "Глубокие разломы",
    "spaceId": "surface",
    "anchorLayout": [
      570,
      -590
    ],
    "counts": [
      {
        "mobId": "MOB-42",
        "count": 40
      },
      {
        "mobId": "MOB-47",
        "count": 30
      }
    ]
  },
  {
    "id": "L10-A",
    "locationId": "L10",
    "name": "Разорённые подходы",
    "spaceId": "surface",
    "anchorLayout": [
      -30,
      330
    ],
    "counts": [
      {
        "mobId": "MOB-07",
        "count": 25
      },
      {
        "mobId": "MOB-09",
        "count": 25
      }
    ]
  },
  {
    "id": "L10-B",
    "locationId": "L10",
    "name": "Старая улица",
    "spaceId": "surface",
    "anchorLayout": [
      85,
      465
    ],
    "counts": [
      {
        "mobId": "MOB-20",
        "count": 40
      }
    ]
  },
  {
    "id": "L10-C",
    "locationId": "L10",
    "name": "Дворы орков",
    "spaceId": "surface",
    "anchorLayout": [
      -20,
      600
    ],
    "counts": [
      {
        "mobId": "MOB-29",
        "count": 60
      }
    ]
  },
  {
    "id": "L11-A",
    "locationId": "L11",
    "name": "Камышовые протоки",
    "spaceId": "surface",
    "anchorLayout": [
      -650,
      400
    ],
    "counts": [
      {
        "mobId": "MOB-12",
        "count": 30
      },
      {
        "mobId": "MOB-14",
        "count": 30
      }
    ]
  },
  {
    "id": "L11-B",
    "locationId": "L11",
    "name": "Топь и корневые острова",
    "spaceId": "surface",
    "anchorLayout": [
      -555,
      565
    ],
    "counts": [
      {
        "mobId": "MOB-23",
        "count": 40
      },
      {
        "mobId": "MOB-25",
        "count": 40
      },
      {
        "mobId": "MOB-27",
        "count": 40
      }
    ]
  },
  {
    "id": "L12-A",
    "locationId": "L12",
    "name": "Внешние могильники",
    "spaceId": "surface",
    "anchorLayout": [
      470,
      310
    ],
    "counts": [
      {
        "mobId": "MOB-20",
        "count": 35
      },
      {
        "mobId": "MOB-22",
        "count": 35
      }
    ]
  },
  {
    "id": "L12-B",
    "locationId": "L12",
    "name": "Разрушенная ограда",
    "spaceId": "surface",
    "anchorLayout": [
      420,
      490
    ],
    "counts": [
      {
        "mobId": "MOB-28",
        "count": 25
      },
      {
        "mobId": "MOB-37",
        "count": 25
      }
    ]
  },
  {
    "id": "L12-C",
    "locationId": "L12",
    "name": "Дальний некрополь",
    "spaceId": "surface",
    "anchorLayout": [
      640,
      585
    ],
    "counts": [
      {
        "mobId": "MOB-43",
        "count": 30
      },
      {
        "mobId": "MOB-44",
        "count": 40
      },
      {
        "mobId": "MOB-45",
        "count": 25
      },
      {
        "mobId": "MOB-46",
        "count": 25
      },
      {
        "mobId": "MOB-47",
        "count": 20
      },
      {
        "mobId": "MOB-48",
        "count": 20
      }
    ]
  }
];
export const MINI_BOSSES_V3 = [
  {
    "id": "RB-101",
    "speciesId": "v3_mini_01",
    "name": "Ратмир Ловчий",
    "locationId": "L01",
    "spaceId": "surface",
    "visualArchetype": "MOB-10",
    "level": 18,
    "anchorLayout": [
      -574,
      315
    ],
    "actorRadius": 1.1,
    "aggroRadius": 11,
    "leashRadius": 22,
    "respawn": {
      "distribution": "uniform-integer-minutes",
      "min": 30,
      "max": 75,
      "sample": "once-after-death",
      "persistDeadline": true
    },
    "assetGate": "not-runtime-accepted"
  },
  {
    "id": "RB-102",
    "speciesId": "v3_mini_02",
    "name": "Старый Клыкач",
    "locationId": "L02",
    "spaceId": "surface",
    "visualArchetype": "MOB-04",
    "level": 10,
    "anchorLayout": [
      -212,
      173
    ],
    "actorRadius": 1.1,
    "aggroRadius": 11,
    "leashRadius": 22,
    "respawn": {
      "distribution": "uniform-integer-minutes",
      "min": 30,
      "max": 75,
      "sample": "once-after-death",
      "persistDeadline": true
    },
    "assetGate": "not-runtime-accepted"
  },
  {
    "id": "RB-103",
    "speciesId": "v3_mini_03",
    "name": "Ткач Чащи",
    "locationId": "L03",
    "spaceId": "surface",
    "visualArchetype": "MOB-06",
    "level": 26,
    "anchorLayout": [
      -620,
      -160
    ],
    "actorRadius": 1.1,
    "aggroRadius": 11,
    "leashRadius": 22,
    "respawn": {
      "distribution": "uniform-integer-minutes",
      "min": 30,
      "max": 75,
      "sample": "once-after-death",
      "persistDeadline": true
    },
    "assetGate": "not-runtime-accepted"
  },
  {
    "id": "RB-104",
    "speciesId": "v3_mini_04",
    "name": "Седой Обвал",
    "locationId": "L04",
    "spaceId": "surface",
    "visualArchetype": "MOB-34",
    "level": 64,
    "anchorLayout": [
      -580,
      -588
    ],
    "actorRadius": 1.1,
    "aggroRadius": 11,
    "leashRadius": 22,
    "respawn": {
      "distribution": "uniform-integer-minutes",
      "min": 30,
      "max": 75,
      "sample": "once-after-death",
      "persistDeadline": true
    },
    "assetGate": "not-runtime-accepted"
  },
  {
    "id": "RB-105",
    "speciesId": "v3_mini_05",
    "name": "Надсмотрщик Карг",
    "locationId": "L05",
    "spaceId": "mine",
    "visualArchetype": "MOB-17",
    "level": 34,
    "anchorLayout": [
      35,
      -260
    ],
    "actorRadius": 1.1,
    "aggroRadius": 11,
    "leashRadius": 22,
    "respawn": {
      "distribution": "uniform-integer-minutes",
      "min": 30,
      "max": 75,
      "sample": "once-after-death",
      "persistDeadline": true
    },
    "assetGate": "not-runtime-accepted"
  },
  {
    "id": "RB-106",
    "speciesId": "v3_mini_06",
    "name": "Клешня Омута",
    "locationId": "L06",
    "spaceId": "surface",
    "visualArchetype": "MOB-13",
    "level": 28,
    "anchorLayout": [
      52,
      -236
    ],
    "actorRadius": 1.1,
    "aggroRadius": 11,
    "leashRadius": 22,
    "respawn": {
      "distribution": "uniform-integer-minutes",
      "min": 30,
      "max": 75,
      "sample": "once-after-death",
      "persistDeadline": true
    },
    "assetGate": "not-runtime-accepted"
  },
  {
    "id": "RB-107",
    "speciesId": "v3_mini_07",
    "name": "Слепой Смотритель",
    "locationId": "L07",
    "spaceId": "great_cave",
    "visualArchetype": "MOB-24",
    "level": 38,
    "anchorLayout": [
      40,
      -330
    ],
    "actorRadius": 1.1,
    "aggroRadius": 11,
    "leashRadius": 22,
    "respawn": {
      "distribution": "uniform-integer-minutes",
      "min": 30,
      "max": 75,
      "sample": "once-after-death",
      "persistDeadline": true
    },
    "assetGate": "not-runtime-accepted"
  },
  {
    "id": "RB-108",
    "speciesId": "v3_mini_08",
    "name": "Разбитый Претор",
    "locationId": "L08",
    "spaceId": "surface",
    "visualArchetype": "MOB-37",
    "level": 58,
    "anchorLayout": [
      690,
      -116
    ],
    "actorRadius": 1.1,
    "aggroRadius": 11,
    "leashRadius": 22,
    "respawn": {
      "distribution": "uniform-integer-minutes",
      "min": 30,
      "max": 75,
      "sample": "once-after-death",
      "persistDeadline": true
    },
    "assetGate": "not-runtime-accepted"
  },
  {
    "id": "RB-109",
    "speciesId": "v3_mini_09",
    "name": "Пепельный Глашатай",
    "locationId": "L09",
    "spaceId": "surface",
    "visualArchetype": "MOB-42",
    "level": 82,
    "anchorLayout": [
      550,
      -585
    ],
    "actorRadius": 1.1,
    "aggroRadius": 11,
    "leashRadius": 22,
    "respawn": {
      "distribution": "uniform-integer-minutes",
      "min": 30,
      "max": 75,
      "sample": "once-after-death",
      "persistDeadline": true
    },
    "assetGate": "not-runtime-accepted"
  },
  {
    "id": "RB-110",
    "speciesId": "v3_mini_10",
    "name": "Ург Разоритель",
    "locationId": "L10",
    "spaceId": "surface",
    "visualArchetype": "MOB-29",
    "level": 50,
    "anchorLayout": [
      -40,
      584
    ],
    "actorRadius": 1.1,
    "aggroRadius": 11,
    "leashRadius": 22,
    "respawn": {
      "distribution": "uniform-integer-minutes",
      "min": 30,
      "max": 75,
      "sample": "once-after-death",
      "persistDeadline": true
    },
    "assetGate": "not-runtime-accepted"
  },
  {
    "id": "RB-111",
    "speciesId": "v3_mini_11",
    "name": "Корневая Матерь",
    "locationId": "L11",
    "spaceId": "surface",
    "visualArchetype": "MOB-27",
    "level": 46,
    "anchorLayout": [
      -550,
      560
    ],
    "actorRadius": 1.1,
    "aggroRadius": 11,
    "leashRadius": 22,
    "respawn": {
      "distribution": "uniform-integer-minutes",
      "min": 30,
      "max": 75,
      "sample": "once-after-death",
      "persistDeadline": true
    },
    "assetGate": "not-runtime-accepted"
  },
  {
    "id": "RB-112",
    "speciesId": "v3_mini_12",
    "name": "Звонарь Безмолвия",
    "locationId": "L12",
    "spaceId": "surface",
    "visualArchetype": "MOB-48",
    "level": 90,
    "anchorLayout": [
      684,
      605
    ],
    "actorRadius": 1.1,
    "aggroRadius": 11,
    "leashRadius": 22,
    "respawn": {
      "distribution": "uniform-integer-minutes",
      "min": 30,
      "max": 75,
      "sample": "once-after-death",
      "persistDeadline": true
    },
    "assetGate": "not-runtime-accepted"
  }
] as const;
export const MAJOR_BOSSES_V3 = [
  {
    "id": "RB-001",
    "speciesId": "mini",
    "name": "Кровавый Оборотень",
    "locationId": "L04",
    "spaceId": "surface",
    "level": 60,
    "previousLevel": 10,
    "anchorLayout": [
      -560,
      -514
    ],
    "actorRadius": 2.05,
    "aggroRadius": 13,
    "leashRadius": 26,
    "respawn": "preserve-per-existing-id",
    "assetGate": "existing-asset-new-layout-pending"
  },
  {
    "id": "RB-002",
    "speciesId": "big",
    "name": "Хозяин Гнилого Леса",
    "locationId": "L03",
    "spaceId": "surface",
    "level": 50,
    "previousLevel": 14,
    "anchorLayout": [
      -170,
      -427
    ],
    "actorRadius": 1.4,
    "aggroRadius": 13,
    "leashRadius": 26,
    "respawn": "preserve-per-existing-id",
    "assetGate": "existing-asset-new-layout-pending"
  },
  {
    "id": "RB-003",
    "speciesId": "rift_boss",
    "name": "Страж раскалённого разлома",
    "locationId": "L09",
    "spaceId": "surface",
    "level": 80,
    "previousLevel": 25,
    "anchorLayout": [
      545,
      -490
    ],
    "actorRadius": 1.65,
    "aggroRadius": 13,
    "leashRadius": 26,
    "respawn": "preserve-per-existing-id",
    "assetGate": "existing-asset-new-layout-pending"
  },
  {
    "id": "RB-004",
    "speciesId": "cave_boss",
    "name": "Хранитель глубин",
    "locationId": "L07",
    "spaceId": "great_cave",
    "level": 40,
    "previousLevel": 40,
    "anchorLayout": [
      20,
      -100
    ],
    "actorRadius": 1.65,
    "preserveUid": "wf:great_cave:cave_boss:000",
    "preserveRewardContract": true,
    "aggroRadius": 13,
    "leashRadius": 26,
    "respawn": "preserve-per-existing-id",
    "assetGate": "existing-asset-new-layout-pending"
  }
] as const;

/** Conversion is its own involution. Interior coordinates remain LOCAL. */
export function layoutToRuntime([x,z]:LayoutXZ):{x:number;z:number} { return {x,z:-z}; }
export function runtimeToLayout(p:{x:number;z:number}):[number,number] { return [p.x,-p.z]; }
export function mobV3(id:string):MobV3 {
  const mob=MOBS_V3.find(m=>m.id===id);
  if(!mob) throw new Error('Unknown V3 mob: '+id);
  return mob;
}
export function zoneLevelBand(zone:HuntingZoneV3):[number,number] {
  const mobs=zone.counts.map(c=>mobV3(c.mobId));
  return [Math.min(...mobs.map(m=>m.levelBand[0])),Math.max(...mobs.map(m=>m.levelBand[1]))];
}
