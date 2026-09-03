export type GameCommand =
  | { type: 'move'; x: number; z: number }
  | { type: 'move-intent'; x: number; z: number; sequence: number }
  | { type: 'target'; entityId: string }
  | { type: 'attack'; entityId: string; skillIndex: number | null }
  | { type: 'equip'; itemUid: string; slot: string }
  | { type: 'enhance'; itemUid: string; from: number; to: number }
  | { type: 'npc'; role: string }
  | { type: 'teleport'; destination: string };

export interface GameGateway<TSave> {
  load(): Promise<TSave | null>;
  save(state: TSave): Promise<void>;
  send(command: GameCommand): Promise<void>;
  clear(): Promise<void>;
}

export class LocalGameGateway<TSave> implements GameGateway<TSave> {
  readonly commandLog: GameCommand[] = [];
  private readonly storageKey: string;
  private readonly storage: Storage;
  private readonly legacyKeys: readonly string[];

  constructor(
    storageKey: string,
    storage: Storage = window.localStorage,
    legacyKeys: readonly string[] = [],
  ) {
    this.storageKey = storageKey;
    this.storage = storage;
    this.legacyKeys = legacyKeys;
  }

  async load(): Promise<TSave | null> {
    for (const key of [this.storageKey, ...this.legacyKeys]) {
      const raw = this.storage.getItem(key);
      if (!raw) continue;
      try {
        const state = JSON.parse(raw) as TSave;
        if (key !== this.storageKey) await this.save(state);
        return state;
      } catch {
        if (key === this.storageKey) this.storage.removeItem(key);
      }
    }
    return null;
  }

  async save(state: TSave): Promise<void> {
    this.storage.setItem(this.storageKey, JSON.stringify(state));
  }

  async send(command: GameCommand): Promise<void> {
    this.commandLog.push(command);
    if (this.commandLog.length > 100) this.commandLog.shift();
  }

  async clear(): Promise<void> {
    this.storage.removeItem(this.storageKey);
    this.commandLog.length = 0;
  }
}
