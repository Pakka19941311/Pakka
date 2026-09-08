import { TerrainSurface } from './terrain-surface.ts';
import { CollisionWorld } from './collision-world.ts';
import { worldTopology } from './world-topology.ts';
import { TERRITORY, ROAD_AXES, FORT, CAPITAL, REGION_CENTERS, forestDensity, roadDistance, inSettlement } from './territory.ts';

type Placement = Record<string,any>;
/** Reproducible scene source. Every solid silhouette and passage is emitted
 * alongside its server collider. Decoration never adds invisible blockers. */
export function buildTerritory(){
  const terrain=new TerrainSurface(),collision=new CollisionWorld(),placements:Placement[]=[];
  let seed=260908;const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
  const add=(kind:string,name:string,x:number,z:number,height:number,extra:Placement={})=>{const p={kind,name,x,z,y:terrain.heightAt(x,z),height,...extra};placements.push(p);return p;};
  const box=(name:string,x:number,z:number,w:number,d:number,h:number,material='stone',bottom=0,solid=true,rotation=0)=>{
    const y=terrain.heightAt(x,z);add('box',name,x,z,h,{width:w,depth:d,y:y+bottom+h/2,material,rotation});
    if(solid)collision.addBox(x,z,w/2,d/2,rotation,y+bottom,y+bottom+h);
  };
  const cylinder=(name:string,x:number,z:number,r:number,h:number,material='stone',bottom=0,solid=true)=>{
    const y=terrain.heightAt(x,z);add('cylinder',name,x,z,h,{diameter:r*2,material,y:y+bottom+h/2});
    if(solid)collision.addCircle(x,z,r,y+bottom,y+bottom+h);
  };
  const asset=(name:string,x:number,z:number,h:number,extra:Placement={})=>add('asset',name,x,z,h,{rotation:random()*Math.PI*2,...extra});
  const rock=(x:number,z:number,h:number,r:number,variant=Math.floor(random()*6))=>{
    asset(`rock_moss_set_01/${variant}`,x,z,h,{width:r*2,depth:r*1.8,centered:true});collision.addCircle(x,z,r*.86,terrain.heightAt(x,z)-.15,terrain.heightAt(x,z)+h);
  };
  // Curved axes are tessellated into an exact union with the ground surface.
  for(const route of ROAD_AXES)for(let i=1;i<route.points.length;i++){
    const a=route.points[i-1],b=route.points[i],dx=b.x-a.x,dz=b.z-a.z;
    terrain.addRoad((a.x+b.x)/2,(a.z+b.z)/2,Math.hypot(dx,dz)+.22,route.width,-Math.atan2(dz,dx));
  }
  terrain.addRoad(FORT.courtyard.x,FORT.courtyard.z,35,25);
  terrain.addRoad(-108,-82,40,34);
  terrain.addRoad(23,-5,13,12);terrain.addRoad(-38,-18,11,10);
  const wall=(name:string,x:number,z:number,length:number,rotation=0,h=6.1)=>{
    box(name,x,z,length,1.4,h,'stone',0,true,rotation);
    add('battlement',name+'-crown',x,z,1.05,{width:length,depth:1.7,rotation,y:terrain.heightAt(x,z)+h});
    for(let along=-length/2+3;along<length/2;along+=6){const px=x+along*Math.cos(rotation),pz=z-along*Math.sin(rotation);
      box(name+'-buttress',px,pz,1.05,2.15,h*.78,'stone',0,false,rotation);
    }
  };
  const tower=(name:string,x:number,z:number,r=3,h=10)=>{
    cylinder(name,x,z,r,h,'stone');
    cylinder(name+'-cornice',x,z,r+.26,.35,'stone',h-.4,false);
    add('tower_crown',name+'-parapet',x,z,1.2,{radius:r+.15,y:terrain.heightAt(x,z)+h});
    add('spire',name+'-roof',x,z,4,{radius:r+.35,y:terrain.heightAt(x,z)+h+1.2,material:'roof'});
    add('windows',name+'-arrowslits',x,z,1.2,{radius:r+.018,level:h*.64,count:6});
  };
  const gate=(name:string,x:number,z:number,rotation:number)=>{
    const half=4.1; // 6.0 m clear width, 4.3 m headroom; world and rays agree.
    for(const side of [-1,1]){const px=x+side*half*Math.cos(rotation),pz=z-side*half*Math.sin(rotation);
      box(name+'-pier',px,pz,2.2,3,7.5,'stone',0,true,rotation);
      add('battlement',name+'-pier-crown',px,pz,.9,{width:2.5,depth:3.2,rotation,y:terrain.heightAt(x,z)+7.5});
    }
    add('arch',name+'-arch',x,z,7.5,{width:6,depth:3,spring:4.3,rotation});
    const y=terrain.heightAt(x,z);collision.addOverhang(x,z,3,1.5,rotation,y+4.3,y+7.5);
    for(const side of [-1,1]){const px=x+side*4.1*Math.cos(rotation),pz=z-side*4.1*Math.sin(rotation);
      add('banner',name+'-banner',px,pz,2.3,{width:.95,rotation,y:y+5.8,offset:1.58});
    }
  };
  // Greenfall: 70 x 60 m, entrances on east and southwest, west keep district.
  wall('greenfall-north-wall',-7,25,70);wall('greenfall-south-wall',-7,-35,70);
  wall('greenfall-east-north',28,12.6,24.8,Math.PI/2);
  wall('greenfall-east-south',28,-22.6,24.8,Math.PI/2);
  wall('greenfall-west-north',-42,6.1,37.8,Math.PI/2);
  wall('greenfall-west-south',-42,-29.1,11.8,Math.PI/2);
  gate('greenfall-main-gate',28,-5,Math.PI/2);gate('greenfall-capital-gate',-42,-18,Math.PI/2);
  for(const x of [-42,28])for(const z of [-35,25])tower('greenfall-corner',x,z);
  tower('greenfall-north-watch',-7,25,2.5,9);
  const house=(name:string,x:number,z:number,w:number,d:number,h:number,style='house')=>{
    box(name+'-foundation',x,z,w+.25,d+.25,.45,'stone',-.2);
    box(name+'-masonry',x,z,w,d,h,'plaster',.1);
    add('house',name,x,z,h,{width:w,depth:d,style});
    add('roof',name+'-slate-roof',x,z,h*.56,{width:w+1,depth:d+1.2,y:terrain.heightAt(x,z)+h+.1,material:'roof'});
  };
  house('greenfall-keep',-30,9,13,17,11,'keep');
  tower('greenfall-keep-spire',-36,15,2.65,16);
  house('greenfall-archive',-31,-27,13,9,5.8);
  house('greenfall-forge',-12,16,12,9,5.1,'forge');
  house('greenfall-warehouse',-7,-26,14,10,5.4,'warehouse');
  house('greenfall-tavern',12,16,11,10,6.1,'tavern');
  house('greenfall-guard-house',18,-25,10,10,5.2);
  // Trade/forge awnings: posts and counter each have only their real footprint.
  const canopy=(name:string,x:number,z:number,w:number,d:number)=>{
    add('canopy',name,x,z,3.6,{width:w,depth:d});
    for(const dx of [-w/2+.15,w/2-.15])for(const dz of [-d/2+.15,d/2-.15])cylinder(name+'-post',x+dx,z+dz,.13,3.2,'wood');
    collision.addOverhang(x,z,w/2,d/2,0,terrain.heightAt(x,z)+3.05,terrain.heightAt(x,z)+3.65);
  };
  canopy('elsa-market',0,-14,7,4);box('elsa-counter',0,-12.6,5.8,.8,.95,'wood');
  canopy('bran-forge-canopy',-12,8,8,4);
  add('anvil','bran-anvil',-14.5,7,.9);box('anvil-base',-14.5,7,1.4,.85,.65,'wood');
  add('forge','bran-hearth',-16,10,2.1);box('hearth-footprint',-16,10,2,1.3,1.4,'stone');
  add('fire','forge-fire',-16,10,1,{y:1.3,scale:.65});
  const props=(x:number,z:number,count:number)=>{for(let i=0;i<count;i++){
    const px=x+(i%3)*1.15,pz=z+Math.floor(i/3)*1.15;
    if(i%2){cylinder('barrel',px,pz,.41,.98,'wood');add('barrel_hoops','barrel-iron',px,pz,.98,{radius:.43});}
    else {box('supply-crate',px,pz,.88,.9,.84,'wood');add('crate_braces','crate-straps',px,pz,.86,{width:.92,depth:.94});}
  }};
  props(-2,-20,6);props(-19,13,4);props(5,-17,3);props(23,-19,3);
  for(const z of [6,10]){add('rack','training-weapon-rack',21,z,2);box('rack-footprint',21,z,2,.5,1.7,'wood');}
  add('training','training-dummy',22,16,2.1);cylinder('training-post',22,16,.25,1.9,'wood');
  cylinder('memory-plinth',-30,-7,1.55,.6);add('memorial','greenfall-memory',-30,-7,3.6);
  for(const x of [-34,-26]){box('memorial-bench',x,-8,1.7,.6,.48,'wood');add('banner','memory-banner',x,-3,3.2,{width:1.1,y:5.7,rotation:0});cylinder('banner-pole',x,-3,.075,6,'iron');}
  add('noticeboard','gate-noticeboard',18,10,2.5);box('noticeboard-footprint',18,10,2.4,.28,2.3,'wood');
  cylinder('courtyard-fire-ring',5,5,1,.22);add('firepit','courtyard-fire',5,5,.7);add('fire','courtyard-light',5,5,1,{scale:.8});
  for(const p of [[2,5],[8,5]])box('fire-bench',p[0],p[1],.55,2.3,.48,'wood');
  // Separate existing capital, never a second oversized Greenfall.
  wall('asterhold-north',-108,-63,44,0,5);wall('asterhold-south',-108,-101,44,0,5);wall('asterhold-west',-130,-82,38,Math.PI/2,5);
  wall('asterhold-east-north',-86,-70.6,15.2,Math.PI/2,5);wall('asterhold-east-south',-86,-93.4,15.2,Math.PI/2,5);gate('asterhold-gate',-86,-82,Math.PI/2);
  for(const x of [-130,-86])for(const z of [-101,-63])tower('asterhold-tower',x,z,2.5,8);
  house('asterhold-hall',-111,-69,17,9,10,'keep');house('asterhold-west-home',-123,-86,9,12,6);house('asterhold-south-home',-106,-94,15,8,6);
  canopy('asterhold-stall',-96,-73,6,3);props(-96,-76,3);
  cylinder('asterhold-well',-110,-83,1.2,.85);add('well','asterhold-well-frame',-110,-83,3.1);
  // Distinct landmarks; each combat centre has a clear arena, not a prop pile.
  wall('ruin-back',-82,84,23,0,3.1);wall('ruin-west',-94,75,17,Math.PI/2,2.5);wall('ruin-east',-70,79,10,Math.PI/2,2.2);
  for(const p of [[-94,84],[-70,84]])cylinder('ruin-broken-tower',p[0],p[1],2.3,4.3);
  for(let i=0;i<8;i++){const x=-94+random()*26,z=85+random()*4;rock(x,z,.5+random(),.6+random()*.55);}
  for(let i=0;i<6;i++)add('grave','outpost-marker',-94+i*4,65,.95,{rotation:(random()-.5)*.3});
  for(let i=0;i<13;i++){const a=i*Math.PI*2/13;if(Math.sin(a)<-.7)continue;rock(Math.cos(a)*17,103+Math.sin(a)*14,3.2+random()*3,1.6+random()*1.4);}
  terrain.addRoad(0,103,23,20); // Worn arena floor, no raised/coplanar pad.
  add('den','hound-den',105,73,6,{width:13,depth:8});collision.addBox(105,76,6.5,2,0,terrain.heightAt(105,76),terrain.heightAt(105,76)+6);
  for(const p of [[98,73],[112,73]])rock(p[0],p[1],5,2.3);
  add('mine','mine-entrance',-46,112,5.5,{width:10,depth:5});collision.addBox(-46,114,5,1,0,terrain.heightAt(-46,114),terrain.heightAt(-46,114)+5.5);
  for(const x of [-52,-40])rock(x,111,6,2.5);
  for(const p of [[85,-83],[109,-85],[107,-68]]){add('tent','exile-tent',p[0],p[1],3.1,{width:5,depth:5,rotation:.2});collision.addBox(p[0],p[1],2.5,2.5,.2,terrain.heightAt(p[0],p[1]),terrain.heightAt(p[0],p[1])+3.1);}
  add('firepit','exile-fire',96,-79,.8);add('fire','exile-fire-light',96,-79,1,{scale:.7});props(85,-70,4);
  for(let i=0;i<9;i++){const a=i*Math.PI*2/9;cylinder('cult-standing-stone',113+Math.cos(a)*12,-25+Math.sin(a)*12,.55,1.7+random()*1.1);}
  for(let i=0;i<14;i++){const a=random()*Math.PI*2;asset('realism/dead_tree_trunk',62+Math.cos(a)*18,-103+Math.sin(a)*14,1.3+random()*1.8);}
  // Clustered forest, with older canopy trees, saplings and uneven edges.
  const trees:{x:number;z:number}[]=[];
  for(let i=0;i<4200;i++){
    const x=-146+random()*292,z=-126+random()*249,p={x,z};const density=forestDensity(p);
    if(random()>density*.82+.025||inSettlement(p,8)||roadDistance(p)<3.0)continue;
    if(Object.values(REGION_CENTERS).some(c=>Math.hypot(x-c.x,z-c.z)<14)||Math.hypot(x+99,z+5)<6)continue;
    if(trees.some(t=>Math.hypot(t.x-x,t.z-z)<3.4))continue;
    const height=7+random()*8+(density>.35?3:0);
    asset(`pine_tree_01/${Math.floor(random()*3)}`,x,z,height,{centered:false,wind:true});
    collision.addCircle(x,z,.24+height*.012,terrain.heightAt(x,z),terrain.heightAt(x,z)+height*.7);trees.push(p);
  }
  for(let i=0;i<1100;i++){
    const x=-147+random()*294,z=-126+random()*250,p={x,z};
    if(inSettlement(p,5)||roadDistance(p)<1.4||forestDensity(p)<.05)continue;
    if(Object.values(REGION_CENTERS).some(c=>Math.hypot(x-c.x,z-c.z)<10)||Math.hypot(x+99,z+5)<6)continue;
    if(random()<.15){rock(x,z,.7+random()*1.8,.55+random()*.8);continue;}
    asset(random()<.2?'shrub_04/0':`fern_02/${Math.floor(random()*4)}`,x,z,.28+random()*.42,{centered:true,wind:true});
  }
  // Short grass in shaded banks. Blade roots sample the SAME triangle height.
  for(let i=0;i<950;i++){
    const x=-147+random()*294,z=-126+random()*250,p={x,z};
    if(inSettlement(p,3)||roadDistance(p)<.65)continue;
    if(Object.values(REGION_CENTERS).some(c=>Math.hypot(x-c.x,z-c.z)<11)&&random()>.12)continue;
    if(Math.abs(terrain.heightAt(x+1,z)-terrain.heightAt(x-1,z))>.8)continue;
    add('grass','meadow-grass',x,z,.14+random()*.2,{seed:i,patch:forestDensity(p)>.2?1.1:.7});
  }
  // Visible boundary outcrops overlap into a continuous inaccessible perimeter.
  for(const x of [-155,155])for(let z=-140;z<=140;z+=7)rock(x,z,6+random()*5,5.3);
  for(const z of [-135,134])for(let x=-154;x<=154;x+=7)rock(x,z,z>0?11+random()*11:6+random()*4,5.3);
  for(let i=0;i<19;i++)add('mountain','northern-background-ridge',-190+i*22,160+random()*14,28+random()*35,{radius:23+random()*12,seed:i,y:5});
  // Directions and courtyard lanterns are actual geometry, at route junctions.
  for(const p of [[32,-10],[33,51],[-63,-32],[-79,55]]){add('signpost','road-wayfinder',p[0],p[1],2.6);cylinder('wayfinder-post',p[0],p[1],.09,2.5,'wood');}
  for(const p of [[24,-9],[24,-1],[-38,-22],[-38,-14],[-20,-10],[8,9]])add('lantern','courtyard-lantern',p[0],p[1],3.6);
  const topology=worldTopology(collision,terrain);
  return {terrain,collision,topology,placements,territory:{...TERRITORY,buildings:placements.filter(p=>p.kind==='house').map(p=>({x:p.x,z:p.z,width:p.width,depth:p.depth,name:p.name})),trees:trees.map(p=>({...p}))}};
}
