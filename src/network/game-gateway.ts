export type GameCommand =
  | { type: 'move'; x: number; z: number }
  | { type: 'move-intent'; x: number; z: number; sequence: number }
  | { type: 'target'; entityId: string }
  | { type: 'attack'; entityId: string; skillIndex: number | null }
  | { type: 'equip'; itemUid: string; slot: string }
  | { type: 'enhance'; itemUid: string; from: number; to: number | null; attemptId: string; scrollUid: string; scrollId: string }
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
        throw new Error('Не удалось прочитать сохранение. Исходные данные сохранены.');
      }
    }
    return null;
  }

  saveNow(state: TSave, backup = false): void {
    const bytes = JSON.stringify(state);
    if (backup) {const previous = this.storage.getItem(this.storageKey); if(previous && !this.storage.getItem(this.storageKey + '_before_scroll_v2')) this.storage.setItem(this.storageKey + '_before_scroll_v2',previous);}
    this.storage.setItem(this.storageKey, bytes);
  }
  async save(state: TSave): Promise<void> { this.saveNow(state); }

  async send(command: GameCommand): Promise<void> {
    this.commandLog.push(command);
    if (this.commandLog.length > 100) this.commandLog.shift();
  }

  async clear(): Promise<void> {
    this.storage.removeItem(this.storageKey);
    this.commandLog.length = 0;
  }
}
