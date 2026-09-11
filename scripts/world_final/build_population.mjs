import {mkdirSync,writeFileSync,existsSync} from 'node:fs';
import {resolve} from 'node:path';
import {FinalWorld,inPolygon} from '../../src/world/final-world.ts';
import {MONSTERS} from '../../src/data/game-data.ts';
import {SPAWN_REGIONS} from '../../src/world/spawn-regions.ts';
import {pathSegmentIsClear} from '../../src/world/navigation.ts';

const world=new FinalWorld(undefined,false),out=resolve(world.root,'gameplay');
mkdirSync(out,{recursive:true});
if(existsSync(resolve(out,'spawn-manifest.json'))&&!process.argv.includes('--replace'))throw Error('Existing authored population preserved. Use --replace only after checkpointing edits.');
let seed=11092026;
const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
const round=n=>Math.round(n*1000)/1000;
const matrix=[
 ['L03','living_forest','surface',{wolf:100,spider:40,exile:20}],
 ['L03','rotten_forest','surface',{undead:35,wraith:30,night_zombie:12,night_skeleton:12,big:1}],
 ['L04','snow','surface',{ice_golem:69,wolf:10,mini:1}],
 ['L05','mine_exterior','surface',{miner:24,bat:6}],
 ['L05','mine_interior','mine',{miner:45,bat:15,spider:10}],
 ['L06','shores','surface',{spider:30,bat:15,wolf:15}],
 ['L07','cave_depths','great_cave',{bat:60,spider:25,undead:25}],
 ['L08','sanctuary','surface',{cultist:40,undead:20}],
 ['L09','volcano','surface',{fire_golem:75,cultist:14,rift_boss:1}],
 ['L10','ruins','surface',{exile:45,cultist:25}],
 ['L11','swamp','surface',{wraith:60,spider:30}],
 ['L12','necropolis','surface',{undead:40,night_zombie:25,night_skeleton:25}],
];
const bossAnchors={big:[-170,427],mini:[-560,514],rift_boss:[545,490]};
const slots=[],groups=[],stats=[];
const radius=id=>id==='mini'?2.05:id==='wolf'?1.615:id==='rift_boss'?1.65:id==='big'?1.4:id.includes('golem')?1.05:.46;
const profile=id=>SPAWN_REGIONS.find(r=>r.monsterId===id)??{aggroRadius:9,leashRadius:15,patrolRadius:4};
for(const [locationId,subzoneId,spaceId,counts] of matrix){
 const space=world.spaces[spaceId],collision=space.collision;
 const polygon=(world.layout.masks.find(m=>m.id===subzoneId)?.polygon??world.layout.locations.find(l=>l.id===locationId).outline_xz);
 const allowed=(p,id,candidatePool=false)=>{
   if(spaceId==='surface'){
     if(!inPolygon(p.x,-p.z,polygon))return false;
     if(!inPolygon(p.x,-p.z,world.layout.locations.find(l=>l.id===locationId).outline_xz))return false;
     if(!candidatePool&&!('boss' in MONSTERS[id])&&Object.values(bossAnchors).some(a=>Math.hypot(p.x-a[0],p.z-a[1])<32))return false;
   }else if(p.z<38)return false;
   if(collision.isBlocked(p,radius(id)+.35)||world.safe({...p,spaceId},20))return false;
   return true;
 };
 const candidates=[];
 const b=space.bounds;
 const accessByRadius=new Map();
 const reachable=(p,id)=>{
   const rad=radius(id);
   if(!accessByRadius.has(rad)){
     const anchors=spaceId==='surface'?world.layout.roads.flatMap(r=>r.points_xyz.map(p=>({x:p[0],z:-p[2]}))):space.definition.rooms.map(r=>({x:r.center[0],z:-r.center[1]}));
     const queue=[],seen=new Set(),connected=new Set();
     const admit=(x,z)=>{
       const key=`${x}:${z}`;if(seen.has(key))return;seen.add(key);
       if(x<b[0]||x>b[2]||z<b[1]||z>b[3])return;
       if(spaceId==='surface'&&!inPolygon(x,-z,polygon))return;
       if(collision.isBlocked({x,z},rad))return;
       connected.add(key);queue.push({x,z});
     };
     for(const a of anchors)admit(Math.round(a.x/2)*2,Math.round(a.z/2)*2);
     for(let i=0;i<queue.length;i++){
       const a=queue[i];
       for(const [dx,dz] of [[2,0],[-2,0],[0,2],[0,-2]]){
         const q={x:a.x+dx,z:a.z+dz};
         if(!seen.has(`${q.x}:${q.z}`)&&pathSegmentIsClear(collision,a,q,rad))admit(q.x,q.z);
       }
     }
     accessByRadius.set(rad,connected);console.log(`${subzoneId}: radius ${rad}, reachable grid ${connected.size}`);
   }
   const q={x:Math.round(p.x/2)*2,z:Math.round(p.z/2)*2};
   return accessByRadius.get(rad).has(`${q.x}:${q.z}`)&&pathSegmentIsClear(collision,p,q,rad);
 };
 // A deterministic shuffled pool; IDs become authored data, never regenerated at login.
 for(let x=b[0]+4;x<b[2]-4;x+=5)for(let z=b[1]+4;z<b[3]-4;z+=5){
   const p={x:round(x+random()*3),z:round(z+random()*3),spaceId};
   if(allowed(p,'ice_golem',true))candidates.push(p);
 }
 for(let i=candidates.length-1;i>0;i--){const j=Math.floor(random()*(i+1));[candidates[i],candidates[j]]=[candidates[j],candidates[i]];}
 console.log(`${subzoneId}: ${candidates.length} terrain/obstacle candidates`);
 let groupNumber=0;
 // Reserve the actual, reachable boss encounter before packing regular groups.
 // Otherwise regular group centres can surround an unused nominal anchor.
 for(const [speciesId,count] of Object.entries(counts).sort(([a],[b])=>Number('boss' in MONSTERS[b])-Number('boss' in MONSTERS[a]))){
   const boss='boss' in MONSTERS[speciesId],pinfo=profile(speciesId);
   let remaining=count,index=0;
   while(remaining){
     // Rotten terraces are the specifically dangerous 6–10 encounters allowed
     // by FINAL 1.0 §10.2; the rest of the world retains predominantly 2–5.
     const amount=boss?1:subzoneId==='rotten_forest'?Math.ceil(remaining/Math.ceil(remaining/9)):Math.min(remaining,random()<.25?4:5);
     let selected=null;
     const pool=boss?[...candidates].sort((a,b)=>Math.hypot(a.x-bossAnchors[speciesId][0],a.z-bossAnchors[speciesId][1])-Math.hypot(b.x-bossAnchors[speciesId][0],b.z-bossAnchors[speciesId][1])):candidates;
     for(const center of pool){
       if(groups.some(g=>g.spaceId===spaceId&&Math.hypot(g.x-center.x,g.z-center.z)<(spaceId==='surface'?profile(g.speciesId).aggroRadius+pinfo.aggroRadius+10:19)))continue;
       if(boss&&Math.hypot(center.x-bossAnchors[speciesId][0],center.z-bossAnchors[speciesId][1])>35)break;
       const members=[];
       for(let attempt=0;attempt<90&&members.length<amount;attempt++){
         const angle=random()*Math.PI*2,rad=boss?0:Math.sqrt(random())*(spaceId==='surface'?7:5.5);
         const p={x:round(center.x+Math.cos(angle)*rad),z:round(center.z+Math.sin(angle)*rad),spaceId};
         if(!allowed(p,speciesId)||members.some(m=>Math.hypot(m.x-p.x,m.z-p.z)<radius(speciesId)*2+1.2))continue;
         if(!pathSegmentIsClear(collision,center,p,radius(speciesId)))continue;
         members.push(p);
       }
       if(members.length!==amount)continue;
       if(!reachable(center,speciesId))continue;
       selected={center,members};break;
     }
     if(!selected)throw Error(`No reachable separated group: ${subzoneId} ${speciesId} remaining=${remaining}`);
     const groupId=`wf:${subzoneId}:g${String(groupNumber++).padStart(3,'0')}`;
     groups.push({...selected.center,groupId,speciesId,locationId,subzoneId,count:amount});
     for(const p of selected.members){
       const patrol=[];
       if(!boss)for(let attempt=0;attempt<24&&patrol.length<3;attempt++){
         const angle=random()*Math.PI*2,r=1+random()*Math.min(3,pinfo.patrolRadius);
         const q={x:round(p.x+Math.cos(angle)*r),z:round(p.z+Math.sin(angle)*r),spaceId};
         if(allowed(q,speciesId)&&pathSegmentIsClear(collision,p,q,radius(speciesId)))patrol.push(q);
       }
       slots.push({...p,uid:`wf:${subzoneId}:${speciesId}:${String(index++).padStart(3,'0')}`,speciesId,locationId,subzoneId,groupId,boss,patrol,aggroRadius:pinfo.aggroRadius,leashRadius:pinfo.leashRadius});
     }
     remaining-=amount;
     if(groupNumber%10===0)console.log(`${subzoneId}: ${groupNumber} groups accepted`);
   }
 }
 stats.push({locationId,subzoneId,spaceId,count:slots.filter(s=>s.subzoneId===subzoneId).length});
 console.log(JSON.stringify(stats.at(-1)));
}
if(slots.length!==1000||slots.filter(s=>s.boss).length!==3||new Set(slots.map(s=>s.uid)).size!==1000||new Set(slots.map(s=>s.speciesId)).size!==15)throw Error('Population contract failed');
const write=(name,value)=>writeFileSync(resolve(out,name),JSON.stringify(value,null,2)+'\n');
write('spawn-manifest.json',{schema:1,revision:world.revision,coordinateSystem:'server +z north; explicit local spaceId',permanentCapacity:1000,slots});
write('species-location-matrix.json',{schema:1,catalog:'src/data/game-data.ts:MONSTERS',bossesIncludedIn15:true,rows:matrix.map(([locationId,subzoneId,spaceId,counts])=>({locationId,subzoneId,spaceId,counts})),species:Object.entries(MONSTERS).map(([id,m])=>({id,name:m.name,model:m.visualModel??m.model,boss:'boss' in m,count:slots.filter(s=>s.speciesId===id).length})),groups});
write('services.json',world.services);
console.log('Population saved: 997 regular + 3 bosses; 15 species.');
