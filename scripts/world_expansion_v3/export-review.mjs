import {readFileSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {MOBS_V3} from '../../src/data/world-expansion-v3.ts';
const esc=s=>String(s).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('"','&quot;');
const color=level=>level<=9?'#a7d66d':level<30?'#55b5b0':level<50?'#e7c06c':level<70?'#df8c61':'#cf648a';
export function exportReview(output=resolve('docs/world-expansion-v3')){
 const pop=JSON.parse(readFileSync(resolve(output,'population.json'),'utf8'));
 const plan=JSON.parse(readFileSync(resolve(output,'hunting-layout.json'),'utf8'));
 const water=JSON.parse(readFileSync('godot-pc/world-final/world_layout.json','utf8')).water;
 const point=([x,z])=>(x+820)+','+(z+790);
 const shape=(points,fill,stroke,width=1,extra='')=>'<polygon points="'+points.map(point).join(' ')+'" fill="'+fill+'" stroke="'+stroke+'" stroke-width="'+width+'" '+extra+'/>';
 const line=(points,stroke,width=1,extra='')=>'<polyline points="'+points.map(point).join(' ')+'" fill="none" stroke="'+stroke+'" stroke-width="'+width+'" '+extra+'/>';
 const label=(x,y,text,size=14,fill='#d7e5e1')=>'<text x="'+x+'" y="'+y+'" font-size="'+size+'" fill="'+fill+'">'+esc(text)+'</text>';
 const svg=['<svg xmlns="http://www.w3.org/2000/svg" width="2050" height="1560" viewBox="0 0 2050 1560"><rect width="2050" height="1560" fill="#121e24"/><g font-family="Segoe UI,Arial,sans-serif">',
 label(20,34,'VARENDOR · V3 / карта размещений для P1',26),label(20,61,'2400 обычных · 12 мини · 4 крупных | Схема по текущим высотам и коллизиям. Не финальный арт и не включённая популяция.',16)];
 for(const l of plan.locations)svg.push(shape(l.outlineLayout,'#253b3f','#52706f',1.2));
 svg.push(shape(water.lake.polygon,'#214b63','#55849a'),shape(water.swamp.polygon,'#254847','#43736a'));
 svg.push(line(water.river.centerline_xyz.map(p=>[p[0],p[2]]),'#3e748d',water.river.width));
 for(const road of plan.roads)svg.push(line(road.pointsLayout.map(p=>[p[0],p[2]]),road.kind==='protected'?'#b6dbc1':'#637e78',road.kind==='protected'?4:2));
 for(const safe of plan.safeCores)svg.push(shape(safe.polygon,'#76bd8b44','#b9e9b7',2));
 for(const l of plan.locations.filter(l=>l.boundaryChanged))svg.push(shape(l.previousOutlineLayout,'none','#ffffff',1.5,'stroke-dasharray="6 4"'));
 for(const slot of pop.slots.filter(s=>s.spaceId==='surface')){
  const [x,z]=slot.layoutXZ,cx=x+820,cy=z+790;
  const title=esc(slot.uid+' / lv'+slot.level+' / '+(MOBS_V3.find(m=>m.id===slot.mobId)?.name??slot.speciesId));
  if(slot.kind==='ordinary')svg.push('<circle cx="'+cx+'" cy="'+cy+'" r="2.5" fill="'+color(slot.level)+'"><title>'+title+'</title></circle>');
  else svg.push('<path d="M '+cx+' '+(cy-8)+' L '+(cx+8)+' '+cy+' L '+cx+' '+(cy+8)+' L '+(cx-8)+' '+cy+' Z" fill="'+(slot.kind==='major'?'#fa6b58':'#fbe08a')+'" stroke="#151c20"><title>'+title+'</title></path>');
 }
 for(const zone of plan.zones.filter(z=>z.spaceId==='surface')){
  const [x,z]=zone.anchorLayout;
  svg.push(label(x+824,z+775,zone.id+' · '+zone.levelBand.join('–')+' / '+zone.ordinary,12));
 }
 svg.push(line([[-800,-700],[-800,700],[800,700],[800,-700],[-800,-700]],'#9fafab',2));
 svg.push(label(1635,112,'Север ↑ · +X восток',18),label(1635,140,'1600 × 1400 м',18));
 const legend=['Точки: постоянные обычные слоты','Ромб светлый: новый мини-босс','Ромб красный: действующий крупный','Зелёные ядра: безопасные услуги','Белый пунктир: прежний контур L02','L02 расширен в западную окраину','Сервер: Z = −Z этой карты','Blender: (X, Z карты, высота)','Ни NPC, ни призывы не входят'];
 legend.forEach((s,i)=>svg.push(label(1635,180+i*25,s,14)));
 ['1–9','10–29','30–49','50–69','70–90'].forEach((s,i)=>svg.push('<circle cx="1650" cy="'+(445+i*25)+'" r="5" fill="'+color([5,20,40,60,80][i])+'"/>',label(1665,450+i*25,s,15)));
 let row=610;
 for(const spaceId of ['mine','great_cave']){
  const entries=pop.slots.filter(s=>s.spaceId===spaceId);
  svg.push(label(1635,row,spaceId+' · '+entries.length+' мест',18));
  const minX=Math.min(...entries.map(s=>s.x))-10,minZ=Math.min(...entries.map(s=>s.layoutXZ[1]))-10;
  const scale=.72;
  for(const s of entries){
   const x=1645+(s.x-minX)*scale,y=row+22+(s.layoutXZ[1]-minZ)*scale;
   svg.push('<circle cx="'+x+'" cy="'+y+'" r="'+(s.kind==='ordinary'?2:5)+'" fill="'+(s.kind==='major'?'#fa6b58':s.kind==='mini'?'#fbe08a':color(s.level))+'"><title>'+esc(s.uid)+'</title></circle>');
  }
  row+=330;
 }
 svg.push(label(20,1527,'P0: данные и воспроизводимая пространственная проверка. Анимации, атаки, границы агрессии и баланс новых атрибутов требуют следующих игровых проверок.',15),'</g></svg>');
 writeFileSync(resolve(output,'hunting-map.svg'),svg.join('\n')+'\n');
 const fields=['uid','kind','mobId','speciesId','locationId','subzoneId','spaceId','level','blender_x','blender_y','blender_z','runtime_x','runtime_z','actor_radius','runtime_enabled'];
 const csv=[fields.join(',')];
 for(const s of pop.slots)csv.push([s.uid,s.kind,s.mobId??s.bossId,s.speciesId,s.locationId,s.subzoneId,s.spaceId,s.level,
 s.x,-s.z,s.y,s.x,s.z,s.actorRadius,false].join(','));
 writeFileSync(resolve(output,'blender-planning-slots.csv'),csv.join('\n')+'\n');
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href)exportReview();

