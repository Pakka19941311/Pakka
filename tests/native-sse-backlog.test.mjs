import test from 'node:test';
import assert from 'node:assert/strict';

// Read-only model of the native pre-consume byte guard. Representative valid
// 35 KiB packets; the old runs did not record their actual packet byte lengths.
const packet=n=>Buffer.from('data: '+JSON.stringify({time:n,revision:n,character:{generation:4},events:[{sequence:n}],padding:'x'.repeat(35*1024)})+'\n\n');
const wire=Buffer.concat(Array.from({length:200},(_,n)=>packet(n)));
const partial=200,chunk=65536,limit=4194304;

test('64 chunks plus a valid previous partial can trip the native 4 MiB guard before parsing',()=>{
  let buffer=wire.subarray(0,partial),offset=partial,failed=false;
  for(let n=0;n<64;n++){
    buffer=Buffer.concat([buffer,wire.subarray(offset,offset+chunk)]);offset+=chunk;
    if(buffer.length>limit){failed=true;break;}
  }
  assert.equal(failed,true);
  assert.equal(buffer.length,limit+partial);
  const complete=buffer.toString().split('\n\n').slice(0,-1);
  assert.ok(complete.length>100);
  for(const message of complete)assert.ok(JSON.parse(message.slice(6)).character);
});

test('a proposed 1 MiB read budget preserves all complete packets and leaves only a partial',()=>{
  let buffer=wire.subarray(0,partial),offset=partial,maxBuffer=buffer.length;
  const events=[];
  while(offset<wire.length){
    for(let n=0;n<64&&offset<wire.length;n++){
      const end=Math.min(wire.length,offset+chunk);buffer=Buffer.concat([buffer,wire.subarray(offset,end)]);offset=end;
      if(buffer.length>=1048576)break;
    }
    maxBuffer=Math.max(maxBuffer,buffer.length);assert.ok(buffer.length<limit);
    let delimiter;
    while((delimiter=buffer.indexOf('\n\n'))>=0){
      const value=JSON.parse(buffer.subarray(6,delimiter).toString());events.push(value.events[0].sequence);buffer=buffer.subarray(delimiter+2);
    }
  }
  assert.deepEqual(events,Array.from({length:200},(_,n)=>n));
  assert.equal(buffer.length,0);assert.ok(maxBuffer<1048576+chunk);
});
