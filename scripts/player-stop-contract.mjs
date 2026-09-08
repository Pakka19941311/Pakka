// Independent authoritative fixtures for delayed-stop reconciliation.
// Runs the real server, never a duplicate of the native prediction algorithm.
// node --experimental-strip-types scripts/player-stop-contract.mjs [--write]
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { WorldSimulation } from '../src/server/world-simulation.ts';
import { CollisionWorld } from '../src/world/collision-world.ts';

const fields = ['time','lastInputSequence','lastInputAt','x','z','velocityX','velocityZ','combatState','destination','target','navigationPath','yaw','action'];
const round = value => typeof value === 'number' ? (Math.round(value * 1e8) / 1e8 || 0) : value;
function fixture(name, mode, delay, classId = 'knight', jitter = false) {
  let serial = 0;
  const world = new WorldSimulation({store:{load:()=>null,save:()=>{},receipt:()=>null,commit:()=>{}},collision:new CollisionWorld(),now:1000,identifier:()=>`stop-${++serial}`,random:()=>.5});
  const p=world.createCharacter('Stop regression',classId);
  Object.assign(p,{x:40,z:40,yaw:0,hp:99999,maxHp:99999});
  world.heartbeat(p.id);
  const monster=world.state.monsters.find(m=>m.id==='wolf');
  Object.assign(monster,{x:40,z:60,home:{x:40,z:60},hp:99999,regionId:undefined});monster.status.stun=1e9;
  world.state.monsters=mode==='combat'?[monster]:[];
  const initial=world.snapshot(p.id);
  delete initial.events; delete initial.summons; initial.heroes=[];
  const commands=[];
  if(mode==='manual')for(let tick=0;tick<=90;tick+=6)commands.push({tick,sequence:commands.length+1,intent:{type:'direction',x:tick<60?1:0,z:tick<60||tick===90?0:-1}});
  else commands.push({tick:0,sequence:1,intent:mode==='destination'?{type:'destination',x:46,z:43}:{type:'attack',entityId:monster.uid,skill:null}});
  const packets=[];
  for(let tick=0;tick<360;tick++){
    for(const command of commands)if(command.tick+delay===tick)world.input(p.id,command.sequence,command.intent);
    world.heartbeat(p.id);world.advance(1000+(tick+1)*1000/60);
    if(tick%2===0){const snapshot=world.snapshot(p.id);const row=fields.map(key=>round(key==='time'?snapshot.time:snapshot.character[key]));packets.push({tick:tick+delay+(jitter&&tick%8===0?8:0),revision:tick+1,row});}
  }
  assert.ok(Math.hypot(p.velocityX,p.velocityZ)<.001,`${name}: server must settle`);
  packets.sort((a,b)=>a.tick-b.tick||a.revision-b.revision);
  const final=[p.x,p.z].map(round);
  if(mode==='destination')assert.ok(Math.hypot(p.x-46,p.z-43)<.18);
  if(mode==='combat')assert.ok(world.events.some(e=>e.kind==='attack'&&e.actor===p.id));
  return {name,mode,input_delay_ticks:delay,snapshot_delay_ticks:delay,initial,commands,packets,final,ticks:400};
}
const traces=[0,2,12,24].map(delay=>fixture(`manual_rtt_${Math.round(delay*1000/30)}ms`,'manual',delay));
traces.push(fixture('manual_jitter_rtt_800ms','manual',24,'knight',true),fixture('click_rtt_800ms','destination',24),fixture('melee_rtt_800ms','combat',24),fixture('ranger_rtt_800ms','combat',24,'ranger'));
const result={schema:1,physics_hz:60,snapshot_hz:30,source:'WorldSimulation',fields,traces};
const path=new URL('../godot-pc/tests/player-stop-traces.json',import.meta.url);
const text=JSON.stringify(result)+'\n';
if(process.argv.includes('--write'))writeFileSync(path,text);
else assert.ok(readFileSync(path,'utf8')===text,'Authoritative stop fixtures changed; inspect the real server change before regenerating.');
console.log(JSON.stringify({ok:true,traces:traces.length,snapshots:traces.reduce((sum,trace)=>sum+trace.packets.length,0),bytes:Buffer.byteLength(text)}));
