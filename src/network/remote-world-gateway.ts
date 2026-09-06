import type { WorldSnapshot, WorldCommand, WorldIntent, CommandReceipt } from './world-protocol.ts';

export class RemoteWorldGateway {
  private readonly storage:Storage;
  private readonly base:string;
  private token:string|null;
  private sequence=0;
  private connection:AbortController|null=null;
  private reconnectTimer:ReturnType<typeof setTimeout>|undefined;
  private commandQueue:Promise<unknown>=Promise.resolve();
  onSnapshot:(snapshot:WorldSnapshot)=>void=()=>{};
  onConnection:(connected:boolean)=>void=()=>{};
  constructor(storage:Storage,base='/api'){
    this.storage=storage;this.base=base;this.token=storage.getItem('varendor_world_token_v1');
  }
  get hasSession():boolean{return Boolean(this.token);}
  async create(name:string,classId:string):Promise<WorldSnapshot>{
    const response=await this.request('/session',{name,classId});
    // Preserve the previous local save; it is never replaced with an empty online character.
    this.token=response.token;this.storage.setItem('varendor_world_token_v1',response.token);
    this.accept(response.snapshot);this.connect();return response.snapshot;
  }
  async resume():Promise<WorldSnapshot>{
    const snapshot=await this.request('/world');this.accept(snapshot);await this.recoverPending();this.connect();return snapshot;
  }
  sendIntent(intent:WorldIntent):void{
    const sequence=++this.sequence;
    void this.request('/input',{sequence,intent}).catch(()=>this.onConnection(false));
  }
  command(command:WorldCommand,id=crypto.randomUUID()):Promise<CommandReceipt>{
    // Persist the ID before sending. A reconnect retries precisely the same operation.
    const execute=async()=>{
      const existing=this.storage.getItem('varendor_world_pending_v1');
      if(existing&&JSON.parse(existing).id!==id)throw Error('Предыдущая операция ожидает ответа сервера. Переподключитесь для восстановления.');
      const pending={id,command};this.storage.setItem('varendor_world_pending_v1',JSON.stringify(pending));
      const result=await this.request('/command',pending);
      this.accept(result.snapshot);this.storage.removeItem('varendor_world_pending_v1');return result.receipt as CommandReceipt;
    };
    const result=this.commandQueue.then(execute);this.commandQueue=result.catch(()=>{});return result;
  }
  async recoverPending():Promise<CommandReceipt|null>{
    const raw=this.storage.getItem('varendor_world_pending_v1');if(!raw)return null;
    const {id,command}=JSON.parse(raw);return this.command(command,id);
  }
  close():void{clearTimeout(this.reconnectTimer);this.connection?.abort();this.connection=null;}
  private accept(snapshot:WorldSnapshot):void{
    if(snapshot.protocol!==1)throw Error('Несовместимая версия сервера.');
    this.sequence=Math.max(this.sequence,snapshot.character.lastInputSequence+1);
    this.onSnapshot(snapshot);
  }
  private connect():void{
    this.close();const controller=new AbortController();this.connection=controller;
    void(async()=>{
      try{
        const response=await fetch(this.base+'/stream',{headers:{Authorization:`Bearer ${this.token}`},signal:controller.signal});
        if(!response.ok||!response.body)throw Error('stream-unavailable');
        this.onConnection(true);const reader=response.body.getReader();const decoder=new TextDecoder();let buffer='';
        while(!controller.signal.aborted){
          const {value,done}=await reader.read();if(done)break;buffer+=decoder.decode(value,{stream:true});
          if(buffer.length>2_000_000)throw Error('invalid-world-packet');
          let delimiter:number;
          while((delimiter=buffer.indexOf('\n\n'))>=0){
            const packet=buffer.slice(0,delimiter);buffer=buffer.slice(delimiter+2);
            if(packet.startsWith('data: '))this.accept(JSON.parse(packet.slice(6)));
          }
        }
      }catch(error){if(controller.signal.aborted)return;}
      if(!controller.signal.aborted){this.onConnection(false);this.reconnectTimer=setTimeout(()=>this.connect(),1500);}
    })();
  }
  private async request(path:string,body?:unknown):Promise<any>{
    const response=await fetch(this.base+path,{method:body===undefined?'GET':'POST',
      headers:{...(this.token?{Authorization:`Bearer ${this.token}`}:{ }),...(body===undefined?{}:{'Content-Type':'application/json'})},
      body:body===undefined?undefined:JSON.stringify(body)});
    const result=await response.json();if(!response.ok)throw Error(result.error??'Сервер недоступен.');return result;
  }
}
