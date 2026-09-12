import assert from 'node:assert/strict';
import test from 'node:test';
import {RemoteWorldGateway} from '../src/network/remote-world-gateway.ts';
class Storage {
  values=new Map();getItem(key){return this.values.get(key)??null;}
  setItem(key,value){this.values.set(key,String(value));}removeItem(key){this.values.delete(key);}
}
function fixture(){
  const storage=new Storage();
  storage.setItem('varendor_world_token_v1','a'.repeat(43));
  storage.setItem('varendor_world_profiles_v1',JSON.stringify([
    {id:'a',name:'First',classId:'mage',token:'a'.repeat(43)},
    {id:'b',name:'Second',classId:'ranger',token:'b'.repeat(43)}]));
  const calls=[];
  const gateway=new RemoteWorldGateway(storage,'/api',(url,options)=>new Promise(resolve=>calls.push({url,options,resolve})));
  const snapshot=id=>({protocol:1,time:1000,revision:1,character:{id,lastInputSequence:0},heroes:[],monsters:[],summons:[],events:[]});
  return {storage,gateway,calls,snapshot};
}
test('late refresh cannot apply the old hero after selecting another profile',async()=>{
  const {gateway,calls,snapshot}=fixture();const seen=[];gateway.onSnapshot=s=>seen.push(s.character.id);
  const first=gateway.refresh();const rejected=assert.rejects(first,/session-changed/);
  gateway.selectProfile('b');const second=gateway.refresh();
  assert.equal(calls.length,2,'new profile must not reuse the previous refresh promise');
  calls[0].resolve(new Response(JSON.stringify(snapshot('a'))));await rejected;
  calls[1].resolve(new Response(JSON.stringify(snapshot('b'))));await second;
  assert.deepEqual(seen,['b']);gateway.close();
});
test('queued command is bound to the selected profile before its microtask starts',async()=>{
  const {gateway,calls,storage}=fixture();
  const pending=gateway.command({type:'respawn'},'profile-operation-1');
  gateway.selectProfile('b');
  await assert.rejects(pending,/session-changed/);
  assert.equal(calls.length,0,'old command must not be sent with the new token');
  assert.equal(storage.getItem('varendor_world_pending_v1'),null);gateway.close();
});
