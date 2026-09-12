import test from 'node:test';
import assert from 'node:assert/strict';
import {acceptStarterQuest} from '../src/core/starter-quests-v3.ts';
import {observeStarterQuestObjectives} from '../src/core/starter-quest-observation.ts';
const service={npcId:'npc:elder',position:{x:0,z:0},now:0,lineOfSight:()=>true};
const create=id=>acceptStarterQuest({classId:'knight',level:10,xp:0,hp:10,dead:false,x:0,z:0,inventory:[],equipment:{}},id,service);
const group=(speciesId='v3_forest_boar')=>({id:'actual-group',speciesId,center:{x:0,z:0},aliveCount:3,radius:14,visible:true});
const context=(now,extra={})=>({now,generation:1,locationId:'L02',grounded:true,speed:6.2,standing:false,safe:false,cityInterior:true,inCombat:false,groups:[group()],...extra});
function sample(p,now,x,z,extra={}){return observeStarterQuestObjectives({...p,x,z},context(now,extra));}
test('inspection requires a visible living slime group, safe distance and a full second standing',()=>{
 let p=create('QUEST-101');
 for(let now=0;now<=1500;now+=250)p=sample(p,now,18,0,{standing:true,groups:[{...group('spider'),visible:false}]});
 assert.deepEqual(p.starterProgress.quests['QUEST-101'].evidence,[]);
 for(let now=1750;now<=2500;now+=250)p=sample(p,now,18,0,{standing:true,groups:[group('spider')]});
 assert.deepEqual(p.starterProgress.quests['QUEST-101'].evidence,[]);
 p=sample(p,2750,18,0,{standing:true,groups:[group('spider')]});assert.deepEqual(p.starterProgress.quests['QUEST-101'].evidence,['outskirts-inspected']);
});
test('bypass requires continuous quarter-circle motion around the same living group followed by real retreat',()=>{
 let p=create('QUEST-104'),now=0;p=sample(p,now,18,0);p=sample(p,now+=250,18,0);
 for(let step=1;step<=40;step++){const angle=step*Math.PI/80;p=sample(p,now+=250,18*Math.cos(angle),18*Math.sin(angle));}
 assert.deepEqual(p.starterProgress.quests['QUEST-104'].evidence,['boar-approach','boar-flank']);
 p=JSON.parse(JSON.stringify(p));
 for(let radius=19;radius<=38;radius++)p=sample(p,now+=250,0,radius);
 assert.deepEqual(p.starterProgress.quests['QUEST-104'].evidence,['boar-approach','boar-flank','boar-retreat']);assert.equal(p.starterProgress.quests['QUEST-104'].status,'active');
 p=sample(p,now+=250,0,38,{inCombat:true});p=sample(p,now+=10000,18,0,{generation:2});
 assert.deepEqual(p.starterProgress.quests['QUEST-104'].evidence,['boar-approach','boar-flank','boar-retreat']);
});
test('teleport, generation change, combat, or a single surviving boar cannot fake the bypass',()=>{
 for(const extra of [{generation:2},{inCombat:true},{groups:[{...group(),aliveCount:1}]}]){
  let p=create('QUEST-104');p=sample(p,0,18,0);p=sample(p,250,18,0);p=sample(p,500,0,38,extra);
  assert.equal(p.starterProgress.quests['QUEST-104'].evidence.includes('boar-retreat'),false);
 }
 let p=create('QUEST-104');p=sample(p,0,18,0);p=sample(p,250,18,0);p=sample(p,500,0,18);p=sample(p,750,0,40);
 assert.equal(p.starterProgress.quests['QUEST-104'].evidence.includes('boar-flank'),false);
});
test('city return is observed only after hunting and an actual outside-to-safe movement transition',()=>{
 let p=create('QUEST-105');p=sample(p,0,18,0,{safe:true});p=sample(p,250,18,0,{safe:true});assert.deepEqual(p.starterProgress.quests['QUEST-105'].evidence,[]);
 p.starterProgress.quests['QUEST-105'].kills=6;p=sample(p,500,18,0,{safe:true});assert.deepEqual(p.starterProgress.quests['QUEST-105'].evidence,[]);
 p=sample(p,750,19,0);p=sample(p,1000,18,0,{safe:true,cityInterior:false});assert.deepEqual(p.starterProgress.quests['QUEST-105'].evidence,[]);
 p=sample(p,1250,17,0,{safe:true});assert.deepEqual(p.starterProgress.quests['QUEST-105'].evidence,['returned-to-city']);
});
