import assert from 'node:assert/strict';
import test from 'node:test';
import {request} from 'node:http';
import {once} from 'node:events';
import {mkdtempSync, rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {startWorldServer} from '../server/http-server.mjs';
import {CollisionWorld} from '../src/world/collision-world.ts';

function raw(port, path, headers={}, body) {
  return new Promise((resolve,reject)=>{
    const req=request({host:'127.0.0.1',port,path,method:body?'POST':'GET',headers},res=>{
      let data='';res.setEncoding('utf8');res.on('data',v=>data+=v);
      res.on('end',()=>resolve({status:res.statusCode,body:JSON.parse(data)}));
    });req.on('error',reject);req.end(body?JSON.stringify(body):undefined);
  });
}
test('private world rejects rebinding Host even with matching Origin before creating a character',async t=>{
  const dir=mkdtempSync(join(tmpdir(),'varendor-host-'));
  const running=startWorldServer({database:join(dir,'world.sqlite'),collision:new CollisionWorld(),port:0});
  t.after(async()=>{await running.close();rmSync(dir,{recursive:true,force:true});});
  await once(running.server,'listening');const port=running.server.address().port;
  for(const host of [`rebind.example:${port}`,`127.0.0.1.evil.example:${port}`,`localhost:${port+1}`]){
    const response=await raw(port,'/api/session',{Host:host,Origin:`http://${host}`,'Content-Type':'application/json'}, {name:'Rejected',classId:'knight'});
    assert.equal(response.status,403,host);assert.equal(response.body.error,'host-not-allowed');
    assert.equal(Object.keys(running.world.state.characters).length,0);
  }
  for(const host of [`127.0.0.1:${port}`,`localhost:${port}`,`[::1]:${port}`]){
    assert.equal((await raw(port,'/api/health',{Host:host})).status,200,host);
  }
  const host=`127.0.0.1:${port}`;
  assert.equal((await raw(port,'/api/session',{Host:host,Origin:'https://foreign.example','Content-Type':'application/json'},{name:'Rejected',classId:'knight'})).status,403);
  const allowed=await raw(port,'/api/session',{Host:host,Origin:`http://${host}`,'Content-Type':'application/json'},{name:'Allowed',classId:'knight'});
  assert.equal(allowed.status,201);assert.equal(Object.keys(running.world.state.characters).length,1);
});
