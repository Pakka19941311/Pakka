import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { createWorldStream } from '../server/world-stream.mjs';

class SlowResponse extends EventEmitter {
  packets=[]; ready=false; destroyed=false; writableEnded=false;
  write(packet){this.packets.push(JSON.parse(packet.slice(6)));return this.ready;}
  destroy(){this.destroyed=true;this.emit('close');}
}

test('backpressure skips obsolete snapshots and resumes with latest state and unsent events',()=>{
  const response=new SlowResponse();const stream=createWorldStream(response,4);
  let sequence=7,revision=1,calls=0;
  const snapshot=after=>{calls++;return {revision,events:Array.from({length:sequence-after},(_,i)=>({sequence:after+i+1}))};};
  assert.equal(stream.flush(snapshot,sequence,1000),true);
  assert.equal(stream.after,7,'write(false) accepted this packet; its cursor must advance');
  sequence=12;revision=9;
  for(let at=1100;at<1200;at++)assert.equal(stream.flush(snapshot,sequence,at),false);
  assert.equal(calls,1,'backpressure must suppress expensive snapshot creation');
  assert.equal(response.packets.length,1);
  assert.equal(stream.after,7,'skipped states must never advance the event cursor');
  response.ready=true;response.emit('drain');
  assert.equal(stream.flush(snapshot,sequence,1300),true);
  assert.equal(calls,2);
  assert.equal(response.packets[1].revision,9);
  assert.deepEqual(response.packets[1].events.map(e=>e.sequence),[8,9,10,11,12]);
  assert.equal(stream.after,12);
  assert.equal(response.destroyed,false);
});

test('a permanently blocked stream is released after 30 seconds and removes its listeners',()=>{
  const response=new SlowResponse();const stream=createWorldStream(response);
  let calls=0;const snapshot=()=>{calls++;return {revision:1,events:[]};};
  stream.flush(snapshot,0,1000);stream.flush(snapshot,1,30_999);
  assert.equal(response.destroyed,false);
  stream.flush(snapshot,2,31_000);
  assert.equal(response.destroyed,true);assert.equal(calls,1);
  assert.equal(response.listenerCount('drain'),0);assert.equal(response.listenerCount('close'),0);
  assert.equal(stream.flush(snapshot,3,32_000),false);assert.equal(calls,1);
});
