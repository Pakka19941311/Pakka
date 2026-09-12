import type { WorldSnapshot, WorldCommand, WorldIntent, CommandReceipt, WorldEvent } from './world-protocol.ts';

class WorldRequestError extends Error { readonly status:number; constructor(message:string,status:number){super(message);this.status=status;} }

/** A suspended/slow renderer can receive many valid SSE frames in one read.
 * Bound each frame, not that transport batch, and project only its newest state. */
export class WorldStreamDecoder {
  private remainder='';
  private afterEvent:number;
  private readonly maxPacketLength:number;
  constructor(afterEvent=0,maxPacketLength=2_000_000){this.afterEvent=afterEvent;this.maxPacketLength=maxPacketLength;}
  push(chunk:string):WorldSnapshot|null {
    const input=this.remainder+chunk;
    let offset=0,delimiter:number,latest:WorldSnapshot|null=null;
    const events=new Map<number,WorldEvent>();
    while((delimiter=input.indexOf('\n\n',offset))>=0){
      if(delimiter-offset>this.maxPacketLength)throw Error('invalid-world-packet');
      const packet=input.slice(offset,delimiter);offset=delimiter+2;
      if(!packet.startsWith('data: '))continue;
      const snapshot=JSON.parse(packet.slice(6)) as WorldSnapshot;
      if(snapshot.protocol!==1)throw Error('Несовместимая версия сервера.');
      if(!latest||snapshot.time>latest.time||snapshot.time===latest.time&&snapshot.revision>=latest.revision)latest=snapshot;
      for(const event of snapshot.events)if(event.sequence>this.afterEvent)events.set(event.sequence,event);
    }
    this.remainder=input.slice(offset);
    if(this.remainder.length>this.maxPacketLength)throw Error('invalid-world-packet');
    if(!latest)return null;
    const unseen=[...events.values()].sort((a,b)=>a.sequence-b.sequence);
    if(unseen.length)this.afterEvent=unseen[unseen.length-1].sequence;
    return {...latest,events:unseen};
  }
}

export class RemoteWorldGateway {
  private readonly storage:Storage;
  private readonly base:string;
  private token:string|null;
  private profileGeneration=0;
  private sequence=0;
  private connection:AbortController|null=null;
  private reconnectTimer:ReturnType<typeof setTimeout>|undefined;
  private commandQueue:Promise<unknown>=Promise.resolve();
  private latest:{time:number;revision:number}|null=null;
  private lastEventSequence=0;
  private readonly fetcher:typeof fetch;
  private refreshing:Promise<WorldSnapshot>|null=null;
  onSnapshot:(snapshot:WorldSnapshot)=>void=()=>{};
  onConnection:(connected:boolean)=>void=()=>{};
  onInputRejected:(reason:string)=>void=()=>{};
  onRecovered:(receipt:CommandReceipt,command:WorldCommand)=>void=()=>{};
  constructor(storage:Storage,base='/api',fetcher:typeof fetch=fetch){
    // Call the transport as a function. A browser's native Window.fetch rejects
    // the RemoteWorldGateway receiver if stored and invoked directly as a method.
    this.storage=storage;this.base=base;this.fetcher=(...args)=>fetcher(...args);this.token=storage.getItem('varendor_world_token_v1');
  }
  get hasSession():boolean{return Boolean(this.token);}
  get profiles():Array<{id:string;name:string;classId:string;selected:boolean}>{
    return this.savedProfiles().map(({id,name,classId,token})=>({id,name,classId,selected:token===this.token}));
  }
  selectProfile(id:string):void{
    if(this.storage.getItem('varendor_world_pending_v1'))throw Error('Сначала продолжите текущего персонажа: сервер должен подтвердить предыдущее действие.');
    const profile=this.savedProfiles().find(p=>p.id===id);if(!profile)throw Error('Персонаж не найден.');
    this.close();this.storage.setItem('varendor_world_token_v1',profile.token);this.token=profile.token;this.profileGeneration++;
    this.latest=null;this.lastEventSequence=0;this.sequence=0;this.refreshing=null;
  }
  private savedProfiles():Array<{id:string;name:string;classId:string;token:string}>{
    const raw=this.storage.getItem('varendor_world_profiles_v1');if(!raw)return [];
    const profiles=JSON.parse(raw);if(!Array.isArray(profiles))throw Error('Список персонажей повреждён. Исходные данные сохранены.');
    return profiles;
  }
  private remember(token:string,snapshot:WorldSnapshot):void{
    const profiles=this.savedProfiles().filter(p=>p.id!==snapshot.character.id);
    profiles.push({id:snapshot.character.id,name:snapshot.character.name,classId:snapshot.character.classId,token});
    this.storage.setItem('varendor_world_profiles_v1',JSON.stringify(profiles));
    this.storage.setItem('varendor_world_token_v1',token);
    if(this.token!==token){this.profileGeneration++;this.refreshing=null;}
    this.token=token;
  }
  get hasPendingImport():boolean{return this.storage.getItem('varendor_world_import_pending_v1')!==null;}
  async importLocal(save?:unknown):Promise<WorldSnapshot>{
    let raw=this.storage.getItem('varendor_world_import_pending_v1');
    if(!raw){
      if(save===undefined)throw Error('Нет сохранения для переноса.');
      raw=JSON.stringify({id:crypto.randomUUID(),save});
      // Both writes precede the request. Quota failure leaves the old save and
      // prevents a half-completed client-side migration.
      this.storage.setItem('varendor_world_import_backup_v1',JSON.stringify(save));
      this.storage.setItem('varendor_world_import_pending_v1',raw);
    }
    const pending=JSON.parse(raw);
    const response=await this.request('/session',{importId:pending.id,legacySave:pending.save});
    this.remember(response.token,response.snapshot);
    this.storage.removeItem('varendor_world_import_pending_v1');
    this.accept(response.snapshot);this.connect();return response.snapshot;
  }
  async create(name:string,classId:string):Promise<WorldSnapshot>{
    if(this.token){await this.recoverPending();const previous=await this.request('/world');this.remember(this.token,previous);}
    const response=await this.request('/session',{name,classId});
    // Preserve the previous local save; it is never replaced with an empty online character.
    this.remember(response.token,response.snapshot);this.latest=null;this.lastEventSequence=0;
    this.accept(response.snapshot);this.connect();return response.snapshot;
  }
  async resume():Promise<WorldSnapshot>{
    const snapshot=await this.request('/world');this.remember(this.token!,snapshot);this.accept(snapshot);await this.recoverPending();this.connect();return snapshot;
  }
  async refresh():Promise<WorldSnapshot>{
    if(this.refreshing)return this.refreshing;
    const pending=(async()=>{const snapshot=await this.request('/world');this.accept(snapshot);await this.recoverPending();return snapshot;})();
    this.refreshing=pending;
    try{return await pending;}finally{if(this.refreshing===pending)this.refreshing=null;}
  }
  sendIntent(intent:WorldIntent):void{
    const sequence=++this.sequence;
    void this.request('/input',{sequence,intent}).catch(error=>{
      if(error instanceof WorldRequestError && error.status>=400 && error.status<500){this.onInputRejected(error.message);return;}
      this.onConnection(false);this.connect();
    });
  }
  command(command:WorldCommand,id:string=crypto.randomUUID()):Promise<CommandReceipt>{
    // Persist the ID before sending. A reconnect retries precisely the same operation.
    const session=this.token,generation=this.profileGeneration;
    const execute=async()=>{
      if(this.token!==session||generation!==this.profileGeneration)throw new WorldRequestError('session-changed',409);
      const existing=this.storage.getItem('varendor_world_pending_v1');
      if(existing&&JSON.parse(existing).id!==id)throw Error('Предыдущая операция ожидает ответа сервера. Переподключитесь для восстановления.');
      const pending={id,command};this.storage.setItem('varendor_world_pending_v1',JSON.stringify(pending));
      try {
        const result=await this.request('/command',pending);
        this.accept(result.snapshot);this.storage.removeItem('varendor_world_pending_v1');return result.receipt as CommandReceipt;
      } catch(error) {
        if(!(error instanceof WorldRequestError)){this.onConnection(false);this.connect();}
        throw error;
      }
    };
    const result=this.commandQueue.then(execute);this.commandQueue=result.catch(()=>{});return result;
  }
  async recoverPending():Promise<CommandReceipt|null>{
    const raw=this.storage.getItem('varendor_world_pending_v1');if(!raw)return null;
    const {id,command}=JSON.parse(raw);const receipt=await this.command(command,id);this.onRecovered(receipt,command);return receipt;
  }
  close():void{clearTimeout(this.reconnectTimer);this.connection?.abort();this.connection=null;}
  private accept(snapshot:WorldSnapshot):void{
    if(snapshot.protocol!==1)throw Error('Несовместимая версия сервера.');
    if(this.latest&&(snapshot.time<this.latest.time||(snapshot.time===this.latest.time&&snapshot.revision<this.latest.revision)))return;
    this.latest={time:snapshot.time,revision:snapshot.revision};
    this.sequence=Math.max(this.sequence,snapshot.character.lastInputSequence+1);
    this.onSnapshot(snapshot);
    for(const event of snapshot.events)this.lastEventSequence=Math.max(this.lastEventSequence,event.sequence);
  }
  private connect():void{
    this.close();const controller=new AbortController();this.connection=controller;
    void(async()=>{
      try{
        const response=await this.fetcher(this.base+'/stream?after='+this.lastEventSequence,{headers:{Authorization:`Bearer ${this.token}`},signal:controller.signal});
        if(controller.signal.aborted||this.connection!==controller)return;
        if(!response.ok||!response.body)throw Error('stream-unavailable');
        // Replay a pending receipt before re-enabling inventory after reconnect.
        await this.recoverPending();
        if(controller.signal.aborted||this.connection!==controller)return;
        this.onConnection(true);const reader=response.body.getReader();const decoder=new TextDecoder();
        const packets=new WorldStreamDecoder(this.lastEventSequence);
        while(!controller.signal.aborted){
          const {value,done}=await reader.read();if(controller.signal.aborted||this.connection!==controller)return;if(done)break;
          const snapshot=packets.push(decoder.decode(value,{stream:true}));
          if(snapshot)this.accept(snapshot);
        }
      }catch(error){if(controller.signal.aborted)return;}
      if(!controller.signal.aborted){this.onConnection(false);this.reconnectTimer=setTimeout(()=>this.connect(),1500);}
    })();
  }
  private async request(path:string,body?:unknown):Promise<any>{
    const session=this.token,generation=this.profileGeneration;
    const controller=new AbortController();const timer=setTimeout(()=>controller.abort(),12_000);
    try{
    const response=await this.fetcher(this.base+path,{signal:controller.signal,method:body===undefined?'GET':'POST',
      headers:{...(this.token?{Authorization:`Bearer ${this.token}`}:{ }),...(body===undefined?{}:{'Content-Type':'application/json'})},
      body:body===undefined?undefined:JSON.stringify(body)});
    const result=await response.json();
    if(this.token!==session||generation!==this.profileGeneration)throw new WorldRequestError('session-changed',409);
    if(!response.ok)throw new WorldRequestError(result.error==='beta-import-disabled'?'Перенос сохранения доступен в локальной бета-сборке. Исходное сохранение сохранено.':result.error??'Сервер недоступен.',response.status);return result;
    }catch(error){if(controller.signal.aborted)throw Error('Сервер не ответил. Операция будет проверена после переподключения.');throw error;}finally{clearTimeout(timer);}
  }
}
