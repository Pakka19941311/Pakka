// Design artifacts only. Does not write gameplay, saves, Godot or server data.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { SPAWN_REGIONS } from '../src/world/spawn-regions.ts';
import { MONSTERS } from '../src/data/game-data.ts';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const out=path.join(root,'docs/world-expansion-v4');fs.mkdirSync(out,{recursive:true});
const zone=(id,n,name,center,polygon,monsters,color,elevation,description)=>({id,n,name,center,polygon,monsters,color,elevation,description});
const zones=[
zone('fox-forest','01','Лисий лес',[-490,-65],[[-745,-210],[-610,-290],[-380,-240],[-260,-120],[-310,100],[-540,170],[-735,70]],['wolf'],'#3f654e',[6,32],'Густой смешанный лес. Дуб, бук, берёза, сосна; папоротники, трава, корни. Лисы распределены по всей территории, с короткими индивидуальными обходами. У опушки — одиночные противники.'),
zone('exile-camp','02','Разбитый тракт',[85,-475],[[-110,-620],[250,-620],[295,-395],[110,-335],[-60,-360]],['exile'],'#8f7352',[8,35],'Изгнанники: разорённый придорожный посёлок, каменные остатки дворов, лагерь, обходы между домами. Разные места обитания вместо одного костра со всей популяцией.'),
zone('blight-marsh','03','Гнилые заводи',[-695,-440],[[-780,-650],[-620,-645],[-595,-555],[-645,-445],[-600,-300],[-745,-260],[-785,-410]],['spider'],'#65745b',[-3,5],'Теневые слизни: мелкие заводи, осока, коряги, гниющие мостки. Сухие островки соединены проходимыми тропами; размещение только на подходящей поверхности.'),
zone('necropolis','04','Некрополь Безымянных',[445,-370],[[260,-690],[770,-680],[775,-145],[465,-155],[290,-250]],['undead','night_zombie','night_skeleton'],'#77777f',[0,22],'Мертвец, ночной зомби, лунный скелет. Старые могильные кварталы, склепы, разрушенные стены и плотный низовой туман. Ночные виды остаются привязаны к циклу ночи и полнолуния.'),
zone('bloodwing-cave','05','Пещера кровопийц',[220,230],[[20,260],[30,510],[260,565],[380,455],[365,290],[230,180]],['bat'],'#76766b',[15,60],'Большая пещера над северным берегом озера. Восемь залов, обходное кольцо, узкие и широкие переходы; кровопийцы занимают разные залы. На поверхности показан вход, интерьер имеет отдельный слой.'),
zone('ash-coven','06','Пепельное святилище',[555,45],[[420,-100],[745,-105],[765,190],[565,200],[415,110]],['cultist'],'#976e57',[22,55],'Сектанты Пепла: заброшенный храм у начала вулканического подъёма, расколотые колонны, базальт и выжженная растительность. Ритуальные дворы и маршруты между ними.'),
zone('broken-mine','07','Одержимая выработка',[-50,415],[[-125,330],[30,305],[95,445],[35,600],[-100,570]],['miner'],'#8b806b',[35,90],'Одержимые рудокопы: карьер, эстакады, каменные уступы и штольни. Зоны добычи распределены по террасам; отдельный интерьер, без проваливания под поверхность мира.'),
zone('drowned-chapel','08','Затонувшая часовня',[640,-495],[[550,-620],[745,-620],[745,-345],[600,-335],[535,-450]],['wraith'],'#667d82',[-4,5],'Болотные призраки: затопленный восточный квартал того же кладбища. Над водой — могилы, склепы и часовня; туман скрывает дальние силуэты, слышны близкие угрозы.'),
zone('werewolf-den','09','Чаща Оборотня',[-430,260],[[-575,185],[-345,170],[-265,280],[-365,365],[-540,335]],['mini'],'#514f4a',[28,65],'Принятый массивный Кровавый Оборотень. Глубокая чаща, логово под корнями, следы охоты; отдельная арена в стороне от транзитной дороги.'),
zone('rotten-grove','10','Чертог Гнилого Леса',[-205,465],[[-305,385],[-155,365],[-115,430],[-130,555],[-260,580],[-330,490]],['big'],'#555c49',[60,105],'Хозяин Гнилого Леса: мёртвые гигантские деревья, корневые арки, проваленная лесная часовня. Живая листва постепенно сменяется гнилью. Арена босса отделена от пути в снег.'),
zone('ice-highlands','11','Стылый хребет',[-530,515],[[-780,300],[-690,665],[-350,665],[-275,570],[-340,405],[-540,370],[-590,215]],['ice_golem'],'#a2bac1',[80,215],'Ледяные големы: снег, каменные чаши, сугробы и еловая граница леса. Поиск по разным котловинам и седловинам; локальный снегопад. Тропа поднимается серпантином.'),
zone('extinct-volcano','12','Угасший Венец',[600,475],[[360,225],[320,640],[595,690],[780,640],[785,265],[665,175],[505,185]],['fire_golem','rift_boss'],'#79635b',[45,205],'Огненные големы — на верхних террасах угасшего вулкана. Чёрный базальт, пепел, сухой кратер. Страж раскалённого разлома, ур. 25, стоит в центре; магическое свечение исходит от големов, извержения нет.')
];
const route=(id,name,kind,width,points)=>({id,name,kind,width,points});
// Each route point is [x,z,elevation]. Heights are authored targets, not a terrain bake.
const routes=[
route('trade','Астерхолд — Гринфолл','protected',6,[[-500,-450,8],[-400,-435,10],[-280,-350,12],[-140,-230,12]]),
route('lake-road','Гринфолл — Озёрный дозор','main',5,[[-140,-230,12],[40,-205,10],[180,-140,6],[355,-95,6]]),
route('west-loop','Западный обход','main',4.5,[[-140,-230,12],[-215,-120,16],[-230,60,28],[-220,245,45],[-210,340,55]]),
route('north-loop','Северный тракт','main',4.5,[[-210,340,55],[-75,275,38],[65,245,30],[220,200,24],[390,140,20],[400,10,10],[355,-95,6]]),
route('south-loop','Южный тракт','main',4.5,[[355,-95,6],[310,-175,8],[240,-265,12],[175,-340,16],[90,-350,17],[20,-285,15],[-140,-230,12]]),
route('forest-path','Тропы лисьего леса','hunt',2.5,[[-215,-120,16],[-320,-145,20],[-420,-95,24],[-530,-125,20],[-610,-40,14],[-525,70,24],[-380,80,28],[-230,60,28]]),
route('exile-path','Лагерь изгнанников','hunt',2.8,[[175,-340,16],[205,-420,22],[85,-475,23],[-45,-455,18]]),
route('bog-path','Тропа заводей','hunt',2.2,[[-500,-450,8],[-550,-390,7],[-630,-355,4],[-695,-440,1],[-690,-555,0]]),
route('grave-path','Ворота некрополя','hunt',3,[[310,-175,8],[345,-270,14],[395,-310,16],[445,-370,10],[480,-455,5],[590,-475,2],[640,-495,1]]),
route('ash-path','К святилищу','hunt',3,[[400,10,10],[515,50,25],[555,45,25]]),
route('volcano-ascent','Подъём к кратеру','ascent',3.5,[[515,50,25],[550,175,40],[470,240,58],[655,300,83],[495,370,108],[705,435,145],[670,520,166],[650,580,185],[585,565,202],[595,510,185]]),
route('ice-ascent','Подъём в снег','ascent',3,[[-210,340,55],[-325,355,70],[-435,320,85],[-580,375,115],[-640,455,137],[-510,475,162],[-410,540,190],[-555,565,210]]),
route('mine-path','Вход в выработку','hunt',3,[[-75,275,38],[-45,330,45],[-50,415,65]]),
route('wolf-path','К логову','hunt',2.5,[[-230,60,28],[-260,145,36],[-345,210,48],[-430,260,55]]),
route('grove-path','К Хозяину леса','hunt',3,[[-210,340,55],[-230,410,75],[-205,465,85]])
];
const settlements=[{id:'asterhold',name:'Астерхолд',center:[-500,-450],size:[44,38],reserve:[160,130],description:'Существующее ядро столицы и резерв будущих кварталов; NPC сохраняют роли.'},{id:'greenfall',name:'Гринфолл',center:[-140,-230],size:[70,60],description:'Принятая пограничная крепость, двор 35×25 м, человеческий масштаб.'},{id:'lake-watch',name:'Озёрный дозор',center:[355,-95],size:[70,50],description:'Пять домов, причал, дозорная башня и стражи. Дорога уходит к пещере по берегу.'}];
const lake=[[20,20],[45,115],[140,155],[245,125],[335,65],[315,-35],[225,-60],[100,-45]];
const river=[[225,-60],[270,-165],[290,-230],[255,-345],[270,-490],[235,-610],[220,-700]];
const bridges=[];
for(const r of routes)for(let i=1;i<r.points.length;i++)for(let j=1;j<river.length;j++){
 const a=r.points[i-1],b=r.points[i],c=river[j-1],d=river[j],u=[b[0]-a[0],b[1]-a[1]],v=[d[0]-c[0],d[1]-c[1]],w=[c[0]-a[0],c[1]-a[1]],cross=(p,q)=>p[0]*q[1]-p[1]*q[0],det=cross(u,v);
 if(Math.abs(det)<1e-8)continue;const t=cross(w,v)/det,s=cross(w,u)/det;if(t<0||t>1||s<0||s>1)continue;
 const center=[+(a[0]+t*u[0]).toFixed(1),+(a[1]+t*u[1]).toFixed(1)],len=Math.hypot(...u),axis=u.map(n=>n/len);
 bridges.push({id:`bridge-${bridges.length+1}`,route:r.id,center,width:r.width,span:32,ends:[center.map((n,k)=>n-axis[k]*16),center.map((n,k)=>n+axis[k]*16)]});
}
const baseCounts={};for(const r of SPAWN_REGIONS)baseCounts[r.monsterId]=(baseCounts[r.monsterId]??0)+r.population;
baseCounts.night_zombie=8;baseCounts.night_skeleton=8;
const bosses=new Set(['mini','big','rift_boss']);
const populations=Object.entries(MONSTERS).map(([id,m])=>({id,name:m.name,level:m.level,old:baseCounts[id],planned:baseCounts[id]*(bosses.has(id)?1:25),condition:id==='night_skeleton'?'full-moon':id==='night_zombie'?'night':'always',zone:zones.find(z=>z.monsters.includes(id))?.id}));
const cave={id:'bloodwing-interior',surfaceEntrance:[220,200],width:360,depth:320,north:'+z',rooms:[[-100,-100,44],[-85,5,46],[-105,100,40],[10,100,44],[100,95,46],[115,-5,45],[65,-100,42],[15,-5,34]],links:[[0,1],[1,2],[2,3],[3,4],[4,5],[5,6],[6,0],[1,7],[7,5]],entry:[-115,-120],exitRoom:0};
cave.roomPolygons=cave.rooms.map((r,i)=>Array.from({length:16},(_,k)=>{const a=k*Math.PI/8,f=.86+.10*Math.sin(k*1.7+i*2)+.04*Math.cos(k*2.3+i);return [+(r[0]+Math.cos(a)*r[2]*f).toFixed(1),+(r[1]+Math.sin(a)*r[2]*f).toFixed(1)];}));
const plan={schema:1,status:'visual-proposal-not-runtime',date:'2026-09-10',branch:'work/character-art-v3',baseline:'96dd25319eab2de99aba226b7ab07e0010214a8d',world:{oldWidth:320,oldDepth:280,width:1600,depth:1400,areaMultiplier:25,sideMultiplier:5,north:'+z',bounds:{minX:-800,maxX:800,minZ:-700,maxZ:700}},zones,routes,settlements,lake,cave,populations,bosses:[{id:'mini',center:[-430,260],radius:32},{id:'big',center:[-205,465],radius:40},{id:'rift_boss',center:[595,510],radius:48}],minimap:{northUp:true,refreshHz:10,viewMetres:[100,180,300],defaultViewMetres:180,caveViewMetres:100,hideUndetectedEnemies:true,source:'same reviewed world geometry and support layer as game',buffOrder:'speed potion first; others by application order; row to the left of the top-right minimap'}};
const pointIn=(p,poly)=>{let b=false;for(let i=0,j=poly.length-1;i<poly.length;j=i++){const [x,y]=poly[i],[u,v]=poly[j];if((y>p[1])!==(v>p[1])&&p[0]<(u-x)*(p[1]-y)/(v-y)+x)b=!b;}return b;};
Object.assign(plan,{river,bridges});
const dist=(a,b)=>Math.hypot(a[0]-b[0],a[1]-b[1]);
const segmentDist=(p,a,b)=>{const dx=b[0]-a[0],dy=b[1]-a[1],t=Math.max(0,Math.min(1,((p[0]-a[0])*dx+(p[1]-a[1])*dy)/(dx*dx+dy*dy||1)));return dist(p,[a[0]+dx*t,a[1]+dy*t]);};
const roadDist=(p,r)=>Math.min(...r.points.slice(1).map((b,i)=>segmentDist(p,r.points[i],b)));
let seed=0x5ae17;const random=()=>{seed=(Math.imul(1664525,seed)+1013904223)>>>0;return seed/4294967296;};
const candidates=[],spatial=new Map();
const cellKey=(x,z,layer)=>`${layer}:${x}:${z}`;
for(const pop of populations.filter(p=>!bosses.has(p.id)&&p.id!=='night_skeleton').sort((a,b)=>b.planned-a.planned)){
 const z=zones.find(z=>z.id===pop.zone),isCave=pop.id==='bat';
 const minX=isCave?-170:Math.min(...z.polygon.map(p=>p[0])),maxX=isCave?170:Math.max(...z.polygon.map(p=>p[0]));
 const minZ=isCave?-150:Math.min(...z.polygon.map(p=>p[1])),maxZ=isCave?150:Math.max(...z.polygon.map(p=>p[1]));
 const spacing=pop.id.includes('golem')?17:pop.id==='bat'?10:11;
 let done=0,attempts=0;const layer=isCave?'bloodwing-interior':'surface';
 while(done<pop.planned&&attempts++<1000000){
  const p=[Math.round((minX+random()*(maxX-minX))*10)/10,Math.round((minZ+random()*(maxZ-minZ))*10)/10];
  if(isCave){if(!cave.roomPolygons.some(poly=>pointIn(p,poly))||dist(p,cave.entry)<18)continue;}
  else {
   if(!pointIn(p,z.polygon)||pointIn(p,lake)||river.slice(1).some((b,i)=>segmentDist(p,river[i],b)<12))continue;
   if(pop.id!=='wraith'&&pop.zone==='necropolis'&&pointIn(p,zones.find(z=>z.id==='drowned-chapel').polygon))continue;
   if(settlements.some(s=>Math.abs(p[0]-s.center[0])<s.size[0]/2+24&&Math.abs(p[1]-s.center[1])<s.size[1]/2+24))continue;
   if(plan.bosses.some(b=>dist(p,b.center)<b.radius+18))continue;
   if(routes.some(r=>roadDist(p,r)<(r.kind==='protected'?20:r.width/2+3)))continue;
   // Summit-only fire golems: no sprinkling along the valley or the whole mountain base.
   if(pop.id==='fire_golem'&&p[1]<330)continue;
  }
  const cx=Math.floor(p[0]/20),cz=Math.floor(p[1]/20);let crowded=false;
  for(let a=cx-1;a<=cx+1;a++)for(let b=cz-1;b<=cz+1;b++)if((spatial.get(cellKey(a,b,layer))??[]).some(c=>dist(p,c.p)<Math.max(spacing,c.spacing)))crowded=true;
  if(crowded)continue;
  const candidate={id:pop.id,p,spacing,layer};candidates.push(candidate);
  const key=cellKey(cx,cz,layer);if(!spatial.has(key))spatial.set(key,[]);spatial.get(key).push(candidate);done++;
 }
 if(done!==pop.planned)throw Error(`Cannot disperse ${pop.id}: ${done}/${pop.planned}`);
}
// Retain the existing full-moon zombie/skeleton pair; only two members share a home.
// Other pairs/ordinary enemies stay dispersed. Pair IDs must not link distant districts.
for(const [i,zombie] of candidates.filter(c=>c.id==='night_zombie').entries()){
 zombie.pairId=`necropolis-night-${i}`;let partner=null;
 for(let k=0;k<72;k++){
  const a=k*Math.PI*2/72,p=[Math.round((zombie.p[0]+Math.cos(a)*3.5)*10)/10,Math.round((zombie.p[1]+Math.sin(a)*3.5)*10)/10];
  if(!pointIn(p,zones.find(z=>z.id==='necropolis').polygon)||pointIn(p,zones.find(z=>z.id==='drowned-chapel').polygon))continue;
  if(river.slice(1).some((b,j)=>segmentDist(p,river[j],b)<12))continue;
  if(routes.some(r=>roadDist(p,r)<r.width/2+3))continue;
  if(candidates.some(c=>c!==zombie&&c.layer==='surface'&&dist(p,c.p)<8))continue;
  partner={id:'night_skeleton',p,spacing:8,layer:'surface',pairId:zombie.pairId};break;
 }
 if(!partner)throw Error(`Cannot preserve full-moon pair ${i}`);candidates.push(partner);
}
for(const b of plan.bosses)candidates.push({id:b.id,p:b.center,spacing:b.radius,layer:'surface'});
const metrics=populations.map(pop=>{const ps=candidates.filter(c=>c.id===pop.id);const distances=ps.length>1?ps.map(p=>Math.min(...ps.filter(q=>p!==q).map(q=>dist(p.p,q.p)))).sort((a,b)=>a-b):[];return {...pop,minHomeSpacing:distances.length?+distances[0].toFixed(1):null,medianHomeSpacing:distances.length?+distances[Math.floor(distances.length/2)].toFixed(1):null};});
const errors=[];if(populations.some(p=>!p.zone||!Number.isFinite(p.old)))errors.push('catalog-coverage');if(new Set(zones.flatMap(z=>z.monsters)).size!==Object.keys(MONSTERS).length)errors.push('catalog-mismatch');
for(const c of candidates)if(c.layer==='surface'&&(Math.abs(c.p[0])>800||Math.abs(c.p[1])>700))errors.push('outside-world');
const ascents=routes.filter(r=>r.kind==='ascent').map(r=>({id:r.id,length:+r.points.slice(1).reduce((s,b,i)=>s+dist(r.points[i],b),0).toFixed(1),maxGradeDegrees:+Math.max(...r.points.slice(1).map((b,i)=>Math.atan2(Math.abs(b[2]-r.points[i][2]),dist(b,r.points[i]))*180/Math.PI)).toFixed(1)}));
const totals={oldDay:populations.filter(p=>p.condition==='always').reduce((s,p)=>s+p.old,0),plannedDay:populations.filter(p=>p.condition==='always').reduce((s,p)=>s+p.planned,0),plannedNight:populations.filter(p=>p.condition!=='full-moon').reduce((s,p)=>s+p.planned,0),plannedFullMoon:populations.reduce((s,p)=>s+p.planned,0)};
const evidence={status:'DESIGN_CHECK_ONLY',scope:'2D home candidates, catalogue, sizes and authored slope targets; no runtime navigation, terrain, patrol or performance validation',errors,totals,ascents,riverCrossingsWithBridges:bridges.length,fullMoonPairs:candidates.filter(c=>c.id==='night_skeleton'&&c.pairId).length,populations:metrics};
fs.writeFileSync(path.join(out,'world-plan.json'),JSON.stringify(plan,null,2)+'\n');
fs.writeFileSync(path.join(out,'spawn-layout.json'),JSON.stringify({schema:1,status:'2D-design-candidates-not-runtime-spawns',tuple:['monsterId','x','z','layer','optionalPairId'],points:candidates.map(c=>[c.id,c.p[0],c.p[1],c.layer,...(c.pairId?[c.pairId]:[])])})+'\n');
fs.writeFileSync(path.join(out,'design-check.json'),JSON.stringify(evidence,null,2)+'\n');
// Shared geometry: design map and minimap preview use the same SVG surface, no second drawing.
const e=s=>String(s).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('"','&quot;');
const xy=p=>[p[0]+800,700-p[1]];
const pts=ps=>ps.map(p=>xy(p).join(',')).join(' ');
const line=(ps,stroke,width,extra='')=>`<polyline points="${pts(ps)}" fill="none" stroke="${stroke}" stroke-width="${width}" stroke-linejoin="round" stroke-linecap="round" ${extra}/>`;
let geometry=`<rect width="1600" height="1400" fill="#374b3c"/><path d="M0 0H1600V120L1500 65 1320 145 1000 70 850 180 660 130 420 60 200 160 0 100Z" fill="#68736d"/>`;
for(const z of zones.filter(z=>z.id!=='bloodwing-cave'))geometry+=`<polygon points="${pts(z.polygon)}" fill="${z.color}" stroke="#233932" stroke-width="3"/>`;
// Contour bands are schematic target relief, not surveyed isolines.
for(const [cx,cy,rx,ry] of [[-530,535,170,115],[590,500,180,130],[-45,440,70,110]])for(const q of [.35,.55,.75,.95]){const [x,y]=xy([cx,cy]);geometry+=`<ellipse cx="${x}" cy="${y}" rx="${rx*q}" ry="${ry*q}" fill="none" stroke="#dedace" stroke-opacity=".24" stroke-width="2"/>`;}
geometry+=`<polygon points="${pts(lake)}" fill="#386c7b" stroke="#75969a" stroke-width="5"/>`;
geometry+=line(river,'#4d7b85',16);
for(const r of routes){geometry+=line(r.points,'#263c33',r.width+9);geometry+=line(r.points,r.kind==='protected'?'#d4c79c':r.kind==='ascent'?'#cbb596':r.kind==='main'?'#bfa37b':'#ac916b',r.width+3,r.kind==='hunt'?'stroke-dasharray="7 6"':'');}
for(const b of bridges){geometry+=line(b.ends,'#e9d9b2',b.width+8);geometry+=line(b.ends,'#957c55',b.width+3);}
for(const s of settlements){const [x,y]=xy(s.center);if(s.reserve)geometry+=`<rect x="${x-s.reserve[0]/2}" y="${y-s.reserve[1]/2}" width="${s.reserve[0]}" height="${s.reserve[1]}" fill="none" stroke="#dccb9c" stroke-dasharray="6 5"/>`;geometry+=`<rect x="${x-s.size[0]/2}" y="${y-s.size[1]/2}" width="${s.size[0]}" height="${s.size[1]}" fill="#b4a581" stroke="#ded5b1" stroke-width="4"/>`;}
for(const b of plan.bosses){const [x,y]=xy(b.center);geometry+=`<circle cx="${x}" cy="${y}" r="${b.radius}" fill="#493a35" stroke="#ca9f82" stroke-width="3"/><circle cx="${x}" cy="${y}" r="9" fill="#efa575"/>`;}
const cavePoint=xy(cave.surfaceEntrance);geometry+=`<circle cx="${cavePoint[0]}" cy="${cavePoint[1]}" r="13" fill="#152321" stroke="#c5c7b3" stroke-width="3"/>`;
let labels='';for(const z of zones){let p=z.center;if(z.id==='extinct-volcano')p=[585,615];if(z.id==='ice-highlands')p=[-530,635];if(z.id==='bloodwing-cave')p=[225,265];if(z.id==='rotten-grove')p=[-190,615];if(z.id==='blight-marsh')p=[-660,-555];if(z.id==='drowned-chapel')p=[585,-595];const [x,y]=xy(p);labels+=`<g class="zone-label" data-zone="${z.id}"><text class="full-label" x="${x}" y="${y}" text-anchor="middle" fill="#fff1cc" font-size="25" font-weight="600" stroke="#23322c" stroke-width="7" paint-order="stroke">${z.n} · ${e(z.name)}</text><text class="compact-label" x="${x}" y="${y}" text-anchor="middle" fill="#fff1cc" font-size="60" stroke="#23322c" stroke-width="8" paint-order="stroke">${z.n}</text></g>`;}
for(const s of settlements){const [x,y]=xy(s.center);labels+=`<text class="settlement-label" x="${x}" y="${y+65}" text-anchor="middle" fill="#fff1cc" font-size="27" stroke="#23322c" stroke-width="7" paint-order="stroke">${s.name}</text>`;}
labels+=`<text class="map-note" x="970" y="680" text-anchor="middle" fill="#dee6dc" font-size="24">Озеро Дозора</text><text class="full-label" x="1410" y="195" fill="#ffcda4" font-size="20">Босс 25</text><text class="map-note" x="32" y="47" fill="#f5e9cc" font-size="26">С ↑</text><path d="M60 1350H260M60 1343V1357M260 1343V1357" stroke="#efe0bc" stroke-width="3"/><text class="map-note" x="160" y="1335" text-anchor="middle" font-size="22" fill="#efe0bc">200 м</text>`;
const svg=`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1600 1400" font-family="Segoe UI, sans-serif" role="img" aria-label="Предлагаемая карта VARENDOR 1600 на 1400 метров"><title>VARENDOR: схема мира для согласования</title><style>.compact-label{display:none}@media(max-width:700px){.full-label{display:none}.compact-label{display:block}.settlement-label{font-size:52px}.map-note{font-size:48px}}</style>${geometry}${labels}</svg>`;
fs.writeFileSync(path.join(out,'world-plan.svg'),svg+'\n');
// Write all chart inputs for the standalone review document; no remote code or network required.
const template=fs.readFileSync(path.join(root,'scripts/world-v4-review-template.html'),'utf8');
const html=template.replace('/*__PLAN__*/',JSON.stringify(plan)).replace('/*__CANDIDATES__*/',JSON.stringify(candidates.map(c=>[c.id,c.p[0],c.p[1],c.layer]))).replace('/*__EVIDENCE__*/',JSON.stringify(evidence)).replace('/*__GEOMETRY__*/',JSON.stringify(geometry)).replace('<!--__MAP__-->',svg);
fs.writeFileSync(path.join(out,'WORLD_REVIEW.html'),html);
console.log(JSON.stringify({files:['world-plan.json','spawn-layout.json','design-check.json','world-plan.svg','WORLD_REVIEW.html'],...evidence},null,2));
if(errors.length)process.exitCode=1;
