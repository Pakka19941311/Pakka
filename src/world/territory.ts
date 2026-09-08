/** Authored territory from TZ v2.0, approved visual and organization plates.
 * Metres, north = +z. The native scene, map, server and migration share this file.
 * No gameplay catalogue, mesh loader or engine dependency belongs here. */
export type TerritoryPoint = {x:number;z:number};
export const TERRITORY_VERSION = 3;
export const START_POINT = {x:12,z:-9};
export const SERVICES = {
  'npc:alchemist':{name:'Алхимик Мира',model:'Monk',x:8,z:-12,role:'Алхимия'},
  'npc:storage':{name:'Кладовщик Торв',model:'Rogue',x:-7,z:-12,role:'Склад · 500 ячеек'},
  'npc:asterhold:shop':{name:'Торговец Эдрик',model:'Ranger',x:-98,z:-80,role:'Торговля'},
  'npc:asterhold:elder':{name:'Старейшина Арден',model:'Warrior',x:-107,z:-80,role:'Задание'},
  'npc:asterhold:smith':{name:'Кузнец Ульф',model:'Warrior',x:-117,z:-81,role:'Кузница'},
  'npc:asterhold:teleport':{name:'Хранитель Ивен',model:'Wizard',x:-93,z:-84,role:'Переход'},
  'npc:asterhold:alchemist':{name:'Алхимик Селин',model:'Monk',x:-109,z:-88,role:'Алхимия'},
  'npc:asterhold:storage':{name:'Кладовщик Орен',model:'Rogue',x:-116,z:-90,role:'Склад · 500 ячеек'},
  'npc:shop':{name:'Торговка Эльза',model:'Ranger',x:0,z:-8,role:'Торговля'},
  'npc:elder':{name:'Староста Роэн',model:'Warrior',x:18,z:5,role:'Задание'},
  'npc:smith':{name:'Кузнец Бран',model:'Warrior',x:-12,z:7,role:'Кузница'},
  'npc:teleport':{name:'Проводник Каэль',model:'Wizard',x:-33,z:-18,role:'Переход'},
} as const;
export const REGION_CENTERS: Record<string,TerritoryPoint> = {
  'greyfang-meadow':{x:-118,z:11}, 'exile-camp':{x:96,z:-77},
  'blight-pool':{x:-123,z:49}, 'nameless-graves':{x:-82,z:72},
  'bloodwing-ridge':{x:63,z:94}, 'ember-coven':{x:113,z:-25},
  'broken-mine':{x:-46,z:99}, 'drowned-fen':{x:62,z:-103},
  'blood-alpha-den':{x:103,z:61}, 'rotten-lord-pit':{x:0,z:103},
};
export const LEGACY_REGION_CENTERS: Record<string,TerritoryPoint> = {
  'greyfang-meadow':{x:22,z:-6}, 'exile-camp':{x:39,z:20},
  'blight-pool':{x:59,z:-8}, 'nameless-graves':{x:69,z:50},
  'bloodwing-ridge':{x:93,z:18}, 'ember-coven':{x:101,z:49},
  'broken-mine':{x:123,z:77}, 'drowned-fen':{x:111,z:12},
  'blood-alpha-den':{x:109,z:2}, 'rotten-lord-pit':{x:136,z:101},
};
export const FORT = {x:-7,z:-5,width:70,depth:60,courtyard:{x:1.5,z:-3,width:35,depth:25},eastGate:{x:28,z:-5},westGate:{x:-42,z:-18}};
export const CAPITAL = {x:-108,z:-82,width:44,depth:38};
const points=(pairs:number[][]):TerritoryPoint[]=>pairs.map(([x,z])=>({x,z}));
export const ROUTES = [
  {id:'capital',name:'Защищённый подход',width:5.5,kind:'protected',points:points([[-92,-82],[-81,-82],[-77,-71],[-66,-51],[-57,-31],[-42,-18],[-31,-18],[-22,-16],[-11,-8],[9,-5],[28,-5]])},
  {id:'main',name:'Дорога старой заставы',width:5.2,kind:'main',points:points([[28,-5],[47,-6],[65,-2],[73,11],[72,29],[59,46],[35,55],[11,57],[-17,53],[-46,51],[-78,59]])},
  {id:'forest-edge',name:'Лесная опушка',width:4,kind:'main',points:points([[-78,59],[-83,44],[-84,24],[-80,5],[-69,-13],[-57,-31]])},
  {id:'camp',name:'Пепельный тракт',width:4.5,kind:'main',points:points([[56,-6],[55,-23],[59,-42],[72,-62],[89,-73]])},
  {id:'arena',name:'Путь к хребту',width:4.2,kind:'main',points:points([[35,55],[43,66],[34,79],[18,86],[5,89],[0,97]])},
  {id:'hound',name:'Тропа гончих',width:2.5,kind:'danger',points:points([[67,40],[80,48],[91,55],[98,57]])},
  {id:'shortcut',name:'Опасный обход',width:2.2,kind:'danger',points:points([[81,1],[98,-1],[112,-17],[110,-42],[104,-59],[99,-67]])},
  {id:'boss-shortcut',name:'Северный срез',width:2.1,kind:'danger',points:points([[26,55],[26,66],[15,80],[3,89]])},
  {id:'mine',name:'Тропа выработки',width:2.6,kind:'danger',points:points([[-48,52],[-54,67],[-51,85],[-46,94]])},
];
/** Centripetal-looking restrained Catmull-Rom sampling: one shared road axis.
 * Render polygons partition the terrain; paths are never overlapping planes. */
export function sampleRoute(route:{points:TerritoryPoint[]}, spacing=2):TerritoryPoint[] {
  const output:TerritoryPoint[]=[];const p=route.points;
  for(let i=0;i<p.length-1;i++){
    const [a,b,c,d]=[p[Math.max(0,i-1)],p[i],p[i+1],p[Math.min(p.length-1,i+2)]];
    const steps=Math.max(2,Math.ceil(Math.hypot(c.x-b.x,c.z-b.z)/spacing));
    for(let k=0;k<steps;k++){const t=k/steps,t2=t*t,t3=t2*t;
      const v=(key:'x'|'z')=>.5*(2*b[key]+(-a[key]+c[key])*t+(2*a[key]-5*b[key]+4*c[key]-d[key])*t2+(-a[key]+3*b[key]-3*c[key]+d[key])*t3);
      output.push({x:v('x'),z:v('z')});
    }
  }output.push({...p[p.length-1]});return output;
}
export function segmentDistance(p:TerritoryPoint,a:TerritoryPoint,b:TerritoryPoint):number{
  const dx=b.x-a.x,dz=b.z-a.z,t=Math.max(0,Math.min(1,((p.x-a.x)*dx+(p.z-a.z)*dz)/(dx*dx+dz*dz||1)));
  return Math.hypot(p.x-a.x-t*dx,p.z-a.z-t*dz);
}
export const ROAD_AXES=ROUTES.map(route=>({...route,points:sampleRoute(route)}));
export function roadDistance(p:TerritoryPoint):number{
  let closest=Infinity;
  for(const route of ROAD_AXES)for(let i=1;i<route.points.length;i++)closest=Math.min(closest,segmentDistance(p,route.points[i-1],route.points[i])-route.width/2);
  return closest;
}
export const FORESTS = [
  {x:-114,z:3,rx:29,rz:40},{x:-69,z:70,rx:34,rz:26},
  {x:111,z:49,rx:34,rz:45},{x:123,z:-41,rx:29,rz:47},
  {x:29,z:-103,rx:44,rz:28},{x:-20,z:42,rx:31,rz:10},
  {x:-143,z:-53,rx:13,rz:43},{x:83,z:103,rx:48,rz:18},
];
export function forestDensity(p:TerritoryPoint):number{
  return Math.max(0,...FORESTS.map(f=>1-Math.hypot((p.x-f.x)/f.rx,(p.z-f.z)/f.rz)));
}
export function inSettlement(p:TerritoryPoint,margin=0):boolean{
  return [FORT,CAPITAL].some(r=>Math.abs(p.x-r.x)<r.width/2+margin&&Math.abs(p.z-r.z)<r.depth/2+margin);
}
export function isTerritorySafe(p:TerritoryPoint):boolean{
  if(inSettlement(p,-1.1))return true;
  // Only the southwest outside approach is protected, never the monster road.
  const path=ROAD_AXES[0].points;
  for(let i=1;i<path.length;i++)if(segmentDistance(p,path[i-1],path[i])<5.2)return true;
  return false;
}
export const LANDMARKS = [
  {id:'greenfall',name:'Гринфолл',subtitle:'Пограничная крепость',x:-7,z:-5,kind:'fort'},
  {id:'asterhold',name:'Астерхолд',subtitle:'Столица',x:-108,z:-82,kind:'town'},
  {id:'outpost',name:'Руины старой заставы',subtitle:'Могилы Безымянных',x:-82,z:72,kind:'ruin'},
  {id:'edge',name:'Лесная опушка',subtitle:'Луга Серой стаи',x:-109,z:3,kind:'forest'},
  {id:'hounds',name:'Логово гончих',subtitle:'Кровавый Оборотень',x:103,z:61,kind:'den'},
  {id:'exiles',name:'Лагерь изгнанников',subtitle:'Пепельный рубеж',x:96,z:-77,kind:'camp'},
  {id:'arena',name:'Арена босса',subtitle:'Хозяин леса',x:0,z:103,kind:'boss'},
  {id:'ridge',name:'Скальный хребет',subtitle:'Северная граница',x:-73,z:122,kind:'ridge'},
  {id:'blight',name:'Омут порчи',subtitle:'',x:-123,z:49,kind:'field'},
  {id:'bats',name:'Гребень кровопийц',subtitle:'',x:63,z:94,kind:'field'},
  {id:'cult',name:'Пепельный культ',subtitle:'',x:113,z:-25,kind:'field'},
  {id:'mine',name:'Разломанная выработка',subtitle:'',x:-46,z:99,kind:'mine'},
  {id:'fen',name:'Затонувшая топь',subtitle:'',x:62,z:-103,kind:'field'},
];
const route=(p:number[][],activity:string)=>p.map(([x,z])=>({x,z,activity}));
export const RESIDENT_LOOKS={warm:{x:5,z:5},trade:{x:0,z:-8},work:{x:-12,z:7},guard:{x:28,z:-5},talk:{x:12,z:-9}};
export const RESIDENTS=[
  {name:'Поселенец',model:'Ranger',x:6,z:-14,seed:1,speed:1.08,route:route([[5,3],[3,-8],[6,-14]],'talk')},
  {name:'Подмастерье',model:'Warrior',x:-10,z:9,seed:2,speed:1.22,route:route([[-10,9],[-7,5],[-9,-1]],'work')},
  {name:'Дозорный',model:'Warrior',x:22,z:-11,seed:3,speed:1,route:route([[22,-11],[22,1],[25,1]],'guard')},
  {name:'Жительница',model:'Monk',x:10,z:0,seed:4,speed:.94,route:route([[3,-8],[10,0],[5,3]],'trade')},
  {name:'Грузчик',model:'Rogue',x:5,z:-14,seed:5,speed:1.34,route:route([[5,-14],[-5,-14],[0,-11]],'work')},
  {name:'Странник',model:'Wizard',x:-25,z:-15,seed:6,speed:1.12,route:route([[-25,-15],[-29,-18],[-21,-18]],'talk')},
];
export const TERRITORY={version:TERRITORY_VERSION,width:320,depth:280,north:'+z',fort:FORT,capital:CAPITAL,roads:ROAD_AXES,forests:FORESTS,landmarks:LANDMARKS,services:SERVICES,residents:RESIDENTS,residentLooks:RESIDENT_LOOKS,spawn:START_POINT};
