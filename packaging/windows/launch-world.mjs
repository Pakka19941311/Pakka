// Copied to server/launch-world.mjs in the portable Windows package.
import { existsSync, mkdirSync, readFileSync, writeFileSync, unlinkSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import { startWorldServer } from './http-server.mjs';
import { restoreWorldTopology } from '../src/world/world-topology.ts';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const args=process.argv.slice(2);
const option=name=>{const index=args.indexOf(name);return index<0?undefined:args[index+1];};
const port=Number(option('--port')??4173);
if(!Number.isInteger(port)||port<0||port>65535)throw Error('Invalid port');
const dataOverride=option('--data-dir');
if(!dataOverride&&!process.env.LOCALAPPDATA)throw Error('LOCALAPPDATA is unavailable; cannot locate saved world.');
const data=resolve(dataOverride??resolve(process.env.LOCALAPPDATA,'Varendor','world-beta-v1'));
const topology=resolve(root,'dist/assets/world/world-topology.json');
if(!existsSync(topology)||!existsSync(resolve(root,'dist/index.html')))throw Error('Game files are missing. Extract the complete ZIP first.');
mkdirSync(data,{recursive:true});
const lock=resolve(data,'server.lock');
for(let attempt=0;attempt<2;attempt++){
  try{writeFileSync(lock,JSON.stringify({pid:process.pid}),{flag:'wx'});break;}
  catch(error){
    if(error.code!=='EEXIST')throw error;
    let owner;
    try{owner=JSON.parse(readFileSync(lock,'utf8')).pid;}catch{throw Error('Cannot read world lock. Close the previous server before retrying.');}
    if(!Number.isInteger(owner)||owner<1)throw Error('Invalid world lock. Close the previous server before retrying.');
    try{process.kill(owner,0);throw Error('This saved world is already running. Use the existing server window.');}
    catch(probe){if(probe.code!=='ESRCH')throw probe;}
    if(attempt===1)throw Error('World lock changed while launching. Retry after closing the previous server.');
    unlinkSync(lock);
  }
}
process.once('exit',()=>{try{if(JSON.parse(readFileSync(lock,'utf8')).pid===process.pid)unlinkSync(lock);}catch{}});
const {collision,terrain}=restoreWorldTopology(JSON.parse(readFileSync(topology,'utf8')));
const world=startWorldServer({database:resolve(data,'world.sqlite'),collision,terrain,port,host:'127.0.0.1',
  beta:true,allowLocalImport:true,staticRoot:resolve(root,'dist')});
let stopping=false;
const input=createInterface({input:process.stdin,output:process.stdout,terminal:process.stdin.isTTY});
const stop=async()=>{
  if(stopping)return;stopping=true;
  input.close();
  try{await world.close();console.log('Мир сохранён. Сервер остановлен.');process.exit(0);}
  catch(error){console.error('Не удалось штатно завершить сервер:',error.message);process.exit(1);}
};
// EOF is not a stop command: closing a browser or a launcher pipe must not stop time.
input.on('line',line=>{if(line.trim().toLowerCase()==='stop')void stop();});
input.on('SIGINT',()=>void stop());
for(const signal of ['SIGINT','SIGTERM'])process.once(signal,()=>void stop());
world.server.once('error',error=>{
  console.error(error.code==='EADDRINUSE'
    ?'Порт 4173 уже занят. Закройте окно прежнего сервера Varendor и повторите запуск. Другие процессы не остановлены.'
    :`Сервер не запущен: ${error.message}`);
  process.exit(1);
});
world.server.once('listening',()=>{
  const url=`http://localhost:${world.server.address().port}/`;
  const commit=readFileSync(resolve(root,'BUILD_COMMIT.txt'),'utf8').trim();
  console.log(`Varendor | мир: ${url} | сборка ${commit.slice(0,12)}`);
  console.log(`Сохранения: ${data}`);
  console.log('Мир работает, пока открыто это окно, даже если все вкладки игры закрыты.');
  console.log('Для остановки и сохранения введите stop и нажмите Enter (или Ctrl+C).');
  console.log('Это тестовый сервер на вашем ПК. Выключение или сон ПК останавливают его.');
  if(!args.includes('--no-browser')&&process.platform==='win32'){
    const opener=spawn('rundll32.exe',['url.dll,FileProtocolHandler',url],{stdio:'ignore',windowsHide:true});
    opener.on('error',()=>console.log(`Откройте в браузере: ${url}`));
    opener.unref();
  }
});
