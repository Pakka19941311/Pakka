import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {join,resolve,sep} from 'node:path';
import {tmpdir} from 'node:os';
import {once} from 'node:events';
import {startWorldServer} from '../server/http-server.mjs';
import {FinalWorld} from '../src/world/final-world.ts';
import {p2Encounter} from '../src/data/p2-encounters.ts';
import {MONSTERS} from '../src/data/game-data.ts';

for(const mode of ['legacy','starter-v3'])test(`native HTTP ${mode} applies its explicit progression baseline`,async()=>{
 const dir=mkdtempSync(join(tmpdir(),'varendor-p2-xp-'));
 const geography=new FinalWorld(undefined,true,{populationMode:mode});let service;
 const previous=process.env.VARENDOR_XP_RATE;delete process.env.VARENDOR_XP_RATE;
 try{
  service=startWorldServer({database:join(dir,'world.sqlite'),collision:geography.spaces.surface.collision,terrain:geography.spaces.surface.terrain,finalWorld:geography,port:0,beta:true});
  if(!service.server.listening)await once(service.server,'listening');
  const world=service.world,p=world.createCharacter('XP test','knight');
  const m=world.state.monsters.find(m=>mode==='starter-v3'?m.canonicalMobId==='MOB-01':m.id==='wolf');
  Object.assign(p,{x:m.x,z:m.z,spaceId:m.spaceId});
  const def=p2Encounter(m)??MONSTERS[m.id];world.damage(m,m.hp+1,p,false);
  const loot=world.events.find(e=>e.kind==='loot'&&e.actor===p.id&&e.target===m.uid);
  assert.equal(loot.xp,def.xp*(mode==='starter-v3'?1:20));
 }finally{
  if(previous===undefined)delete process.env.VARENDOR_XP_RATE;else process.env.VARENDOR_XP_RATE=previous;
  if(service)await service.close();assert.ok(resolve(dir).startsWith(resolve(tmpdir())+sep));rmSync(dir,{recursive:true,force:true});
 }
});
