import test from 'node:test';
import assert from 'node:assert/strict';
import { CharacterMotor, JUMP_GRAVITY } from '../src/controls/character-motor.ts';
import { WorldSimulation } from '../src/server/world-simulation.ts';
import { CollisionWorld } from '../src/world/collision-world.ts';
import { TerrainSurface } from '../src/world/terrain-surface.ts';

const dt=1/60;
function fixture(classId='knight',target=false) {
  let sequence=0;const terrain=new TerrainSurface();terrain.heights.fill(0);
  const world=new WorldSimulation({store:{load:()=>null,save:()=>{}},collision:new CollisionWorld(),terrain,now:1000,identifier:()=>`stop-boundary-${++sequence}`,random:()=>.5});
  const p=world.createCharacter('Stop boundary',classId);
  Object.assign(p,{x:40,z:40,yaw:0,hp:99999,maxHp:99999});
  const monster=world.state.monsters.find(m=>m.id==='wolf');
  Object.assign(monster,{x:40,z:65,home:{x:40,z:65},hp:99999,maxHp:99999,regionId:undefined});
  monster.status.stun=1e9;world.state.monsters=target?[monster]:[];
  return {world,p,monster,input:intent=>world.input(p.id,++sequence,intent),step(){world.heartbeat(p.id);world.advance(world.state.time+1000*dt);}};
}

test('all eight movement directions have exactly zero displacement on the first neutral tick and every later tick',()=>{
  for(const [x,z] of [[0,1],[1,1],[1,0],[1,-1],[0,-1],[-1,-1],[-1,0],[-1,1]]){
    const motor=new CharacterMotor();
    for(let tick=0;tick<90;tick++)motor.step({x,z},6.2,dt);
    for(let tick=0;tick<120;tick++){
      const stopped=motor.step({x:0,z:0},6.2,dt);
      assert.equal(stopped.dx,0,`direction ${x},${z}, tick ${tick}`);
      assert.equal(stopped.dz,0);assert.equal(stopped.moving,false);
    }
    const resumed=motor.step({x:-z,z:x},6.2,dt);
    assert.ok(Math.hypot(resumed.dx,resumed.dz)>0,'new input starts on the first tick');
  }
});

for(const classId of ['knight','assassin','ranger','mage','necro']){
  test(`${classId}: authoritative release stops on the next simulation tick without an idle position tail`,()=>{
    const f=fixture(classId);
    for(let tick=0;tick<60;tick++){if(tick%6===0)f.input({type:'direction',x:1,z:1});f.step();}
    const endpoint=[f.p.x,f.p.z];assert.ok(Math.hypot(f.p.velocityX,f.p.velocityZ)>5);
    f.input({type:'direction',x:0,z:0});
    for(let tick=0;tick<120;tick++){
      f.step();assert.deepEqual([f.p.x,f.p.z],endpoint,`release tick ${tick}`);
      assert.deepEqual([f.p.velocityX,f.p.velocityZ],[0,0]);assert.equal(f.p.action,'idle');
    }
  });
  test(`${classId}: click arrival and combat range stop have no post-arrival displacement`,()=>{
    for(const mode of ['destination','combat']){
      const f=fixture(classId,mode==='combat');
      f.input(mode==='destination'?{type:'destination',x:46,z:43}:{type:'attack',entityId:f.monster.uid,skill:null});
      let stopped=false;
      for(let tick=0;tick<600;tick++){
        const before=[f.p.x,f.p.z];f.step();
        const reached=mode==='destination'?f.p.destination===null:['face','windup','recovery'].includes(f.p.combatState);
        if(reached){
          assert.deepEqual([f.p.x,f.p.z],before,`${mode} first arrival tick`);
          const endpoint=[f.p.x,f.p.z];
          for(let hold=0;hold<90;hold++){f.step();assert.deepEqual([f.p.x,f.p.z],endpoint,`${mode} held tick ${hold}`);}
          if(mode==='combat'){
            assert.ok(Math.hypot(f.p.x-f.monster.x,f.p.z-f.monster.z)>1,'keep body spacing');
            assert.ok(f.world.events.some(e=>e.kind==='attack'&&e.actor===f.p.id),'a stopped approach still attacks');
          }
          stopped=true;break;
        }
      }
      assert.equal(stopped,true,`${mode} must actually reach its stopping condition`);
    }
  });
}

test('neutral planar stop in the air preserves jump gravity, height and double-jump prevention',()=>{
  const motor=new CharacterMotor();
  for(let tick=0;tick<40;tick++)motor.step({x:0,z:1},6.2,dt);
  assert.equal(motor.requestJump(),true);
  let before;
  for(let tick=0;tick<8;tick++)before=motor.step({x:0,z:1},6.2,dt);
  const stopped=motor.step({x:0,z:0},6.2,dt);
  assert.equal(stopped.dx,0);assert.equal(stopped.dz,0);
  assert.equal(stopped.verticalVelocity,before.verticalVelocity-JUMP_GRAVITY*dt);
  assert.equal(stopped.height,before.height+stopped.verticalVelocity*dt);
  assert.equal(motor.requestJump(),false);
  let landed=stopped;
  for(let tick=0;tick<60;tick++)landed=motor.step({x:0,z:0},6.2,dt);
  assert.equal(landed.grounded,true);assert.equal(landed.height,0);
});
