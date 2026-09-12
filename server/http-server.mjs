import {FinalWorld} from '../src/world/final-world.ts';
import { createServer } from 'node:http';
import { randomBytes, randomUUID } from 'node:crypto';
import { readFileSync, existsSync } from 'node:fs';
import { resolve, extname, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { WorldStore } from './world-store.mjs';
import { createWorldStream } from './world-stream.mjs';
import { WorldSimulation } from '../src/server/world-simulation.ts';
import { restoreWorldTopology } from '../src/world/world-topology.ts';

export function startWorldServer({database, collision, terrain, finalWorld, port=4173, host='127.0.0.1', beta=false, xpRate=Number(process.env.VARENDOR_XP_RATE??(finalWorld?.populationMode==='starter-v3'?1:20)), allowLocalImport=false, staticRoot, now=Date.now}) {
  const loopback=address=>['127.0.0.1','::1','::ffff:127.0.0.1'].includes(address);
  if(allowLocalImport&&(!beta||!loopback(host)))throw Error('Local import requires a private loopback beta server');
  const store=new WorldStore(database);
  const world=new WorldSimulation({store,collision,terrain,finalWorld,now:now(),identifier:randomUUID,beta,xpRate});
  const streams=new Map();let broadcastAt=0;
  let fatal=null;
  const clock=setInterval(()=>{
    try{
      world.advance(now());
      for(const [id,connections] of streams)if(connections.size)world.heartbeat(id);
      if(now()-broadcastAt>=1000/30){
        broadcastAt=now();
        for(const [id,connections] of streams)for(const connection of connections){
          connection.stream.flush(after=>world.snapshot(id,after),world.state.sequence,world.state.time);
        }
      }
    }catch(error){fatal=error;clearInterval(clock);for(const connections of streams.values())for(const connection of connections)connection.response.destroy();console.error('World persistence failed; mutations stopped:',error.message);}
  },1000/60);
  const rates=new Map();
  const server=createServer(async(req,res)=>{
    res.setHeader('Cache-Control','no-store');
    res.setHeader('X-Content-Type-Options','nosniff');
    const json=(code,value)=>{res.writeHead(code,{'Content-Type':'application/json; charset=utf-8'});res.end(JSON.stringify(value));};
    try {
      const url=new URL(req.url,'http://localhost');
      if(!url.pathname.startsWith('/api/')){
        if(url.pathname==='/favicon.ico'&&['GET','HEAD'].includes(req.method)){res.writeHead(204);res.end();return;}
        if(!staticRoot||!['GET','HEAD'].includes(req.method)){json(404,{error:'not-found'});return;}
        const root=resolve(staticRoot);const path=resolve(root,'.'+decodeURIComponent(url.pathname==='/'?'/index.html':url.pathname));
        if(!path.startsWith(root+sep)||!existsSync(path)){json(404,{error:'not-found'});return;}
        const mime={'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.glb':'model/gltf-binary','.gltf':'model/gltf+json','.jpg':'image/jpeg','.png':'image/png','.webp':'image/webp','.hdr':'application/octet-stream','.bin':'application/octet-stream','.mp3':'audio/mpeg','.wav':'audio/wav'};
        res.setHeader('Content-Type',mime[extname(path)]??'application/octet-stream');res.end(req.method==='HEAD'?undefined:readFileSync(path));return;
      }
      // Mutations are same-origin JSON; no CORS, query tokens or cookie credentials.
      if(req.headers.origin&&new URL(req.headers.origin).host!==req.headers.host){json(403,{error:'origin-mismatch'});return;}
      if(fatal){json(503,{error:'world-storage-unavailable'});return;}
      const address=req.socket.remoteAddress??'local';
      let rate=rates.get(address);
      if(!rate||rate.until<now()){rate={until:now()+1000,count:0};rates.set(address,rate);}
      if(++rate.count>80){json(429,{error:'rate-limit'});return;}
      if(rates.size>1000)for(const [key,value] of rates)if(value.until<now())rates.delete(key);
      if(req.method==='GET'&&url.pathname==='/api/health'){json(200,{protocol:1,time:world.state.time,revision:world.state.revision,beta,localImport:allowLocalImport&&loopback(address)});return;}
      let body={};
      if(req.method==='POST'){
        if(!req.headers['content-type']?.startsWith('application/json')){json(415,{error:'json-required'});return;}
        const chunks=[];let size=0;
        const limit=allowLocalImport&&loopback(address)&&url.pathname==='/api/session'?262144:16384;
        for await(const chunk of req){size+=chunk.length;if(size>limit){json(413,{error:'request-too-large'});return;}chunks.push(chunk);}
        try{body=JSON.parse(Buffer.concat(chunks).toString('utf8'));}catch{json(400,{error:'invalid-json'});return;}
        if(!body||Array.isArray(body)||typeof body!=='object'){json(400,{error:'invalid-body'});return;}
      }
      if(req.method==='POST'&&url.pathname==='/api/session'){
        if(body.legacySave!==undefined&&(!allowLocalImport||!loopback(address))){json(403,{error:'beta-import-disabled'});return;}
        const p=body.legacySave===undefined?world.createCharacter(body.name,body.classId):world.importCharacter(body.importId,body.legacySave);
        const token=randomBytes(32).toString('base64url');
        store.session(token,p.id);world.heartbeat(p.id);world.checkpoint();
        json(201,{token,snapshot:world.snapshot(p.id)});return;
      }
      const bearer=req.headers.authorization?.match(/^Bearer ([A-Za-z0-9_-]{43})$/)?.[1];
      const id=bearer?store.resolveSession(bearer):null;
      if(!id){json(401,{error:'session-required'});return;}
      if(req.method==='GET'&&url.pathname==='/api/stream'){
        world.heartbeat(id);
        res.writeHead(200,{'Content-Type':'text/event-stream','Connection':'keep-alive'});
        res.flushHeaders();
        const after=Number(url.searchParams.get('after')??world.state.sequence);
        const cursor=Number.isSafeInteger(after)&&after>=0?Math.min(after,world.state.sequence):world.state.sequence;
        const connection={response:res,stream:createWorldStream(res,cursor)};
        let connections=streams.get(id);if(!connections){connections=new Set();streams.set(id,connections);}
        connections.add(connection);
        connection.closed=new Promise(resolveClosed=>req.once('close',()=>{
          connections.delete(connection);
          if(!connections.size){streams.delete(id);if(!fatal)world.disconnect(id);}
          resolveClosed();
        }));
        return;
      }
      if(req.method==='GET'&&url.pathname==='/api/world'){
        world.heartbeat(id);const after=Number(url.searchParams.get('after')??0);
        json(200,world.snapshot(id,Number.isSafeInteger(after)?after:0));return;
      }
      if(req.method==='POST'&&url.pathname==='/api/input'){
        world.heartbeat(id);
        // Native generation fences delayed pre-teleport inputs. Legacy v1
        // clients without this additive envelope field remain supported.
        if(body.generation===undefined||body.generation===world.state.characters[id].generation)world.input(id,body.sequence,body.intent);
        json(200,{sequence:world.state.characters[id].lastInputSequence});return;
      }
      if(req.method==='POST'&&url.pathname==='/api/command'){
        world.heartbeat(id);const receipt=world.command(id,body.id,body.command);json(200,{receipt,snapshot:world.snapshot(id)});return;
      }
      if(req.method==='POST'&&url.pathname==='/api/disconnect'){world.disconnect(id);json(200,{ok:true});return;}
      json(404,{error:'not-found'});
    }catch(error){json(400,{error:error instanceof Error?error.message:'invalid-request'});}
  });
  server.requestTimeout=10_000;server.headersTimeout=10_000;
  server.listen(port,host);
  const close=()=>new Promise((resolveClose,reject)=>{
    clearInterval(clock);
    const disconnected=[];
    for(const connections of streams.values())for(const connection of connections){
      disconnected.push(connection.closed);connection.response.end();
    }
    // server.close can precede the request-close handlers that persist disconnects.
    server.close(async error=>{try{await Promise.all(disconnected);if(!fatal)world.checkpoint();store.close();error?reject(error):resolveClose();}catch(error){reject(error);}});
    server.closeIdleConnections();
  });
  return {server,world,close};
}

if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const finalWorld=process.env.VARENDOR_WORLD==='final'?new FinalWorld(process.env.VARENDOR_FINAL_ROOT):undefined;
  const manifest=process.env.VARENDOR_COLLISIONS??'public/assets/world/world-topology.json';
  if(!finalWorld&&!existsSync(manifest))throw Error('The reviewed world topology is missing. Generate it during the offline world build before starting the server.');
  const {collision,terrain}=finalWorld?.spaces.surface??restoreWorldTopology(JSON.parse(readFileSync(manifest,'utf8')));
  const running=startWorldServer({database:process.env.VARENDOR_DATABASE??'server-data/world.sqlite',collision,terrain,finalWorld,
    port:Number(process.env.PORT??4173),host:'127.0.0.1',beta:process.env.VARENDOR_BETA==='1',
    allowLocalImport:process.env.VARENDOR_ALLOW_LOCAL_IMPORT==='1',staticRoot:'dist'});
  running.server.on('listening',()=>console.log(`Varendor world listening on http://127.0.0.1:${running.server.address().port}`));
  for(const signal of ['SIGINT','SIGTERM'])process.once(signal,()=>void running.close().then(()=>process.exit(0)));
}
