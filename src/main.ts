import './styles.css';
import './hotbar.css';
import '@babylonjs/loaders/glTF';
import {
  AbstractMesh,
  AnimationGroup,
  ArcRotateCamera,
  AssetContainer,
  Color3,
  Color4,
  DirectionalLight,
  DynamicTexture,
  Engine,
  GlowLayer,
  HemisphericLight,
  Matrix,
  Mesh,
  MeshBuilder,
  PBRMaterial,
  PointLight,
  Scene,
  SceneLoader,
  ShadowGenerator,
  StandardMaterial,
  Texture,
  TransformNode,
  Vector3,
  VertexBuffer,
  VertexData,
} from '@babylonjs/core';
import { CLASSES, EQUIP_SLOTS, ITEMS, LOCATIONS, MONSTERS, SLOT_NAMES } from './data/game-data';
import {
  INVENTORY_CAPACITY,
  baseVitals,
  bossRespawnSeconds,
  classCombatProfile,
  enhancementCanDestroy,
  enhancementChance,
  enhancementStatMultiplier,
  monsterMovementSpeed,
  statsAtLevel,
  xpNeeded,
} from './core/game-rules';
import { addOrStackItem, applyExperience, equipmentSlot, resolveEnhancement } from './core/gameplay-session';
import { LocalGameGateway } from './network/game-gateway';
import { CombatControl } from './controls/combat-controller';
import { CharacterMotor, smoothAngle } from './controls/character-motor';
import { PlayerInputController } from './controls/input-controller';
import { TargetingController } from './controls/targeting-controller';
import { ThirdPersonCameraController } from './controls/third-person-camera';
import { CollisionWorld } from './world/collision-world';
import { AmbientNpcBrain } from './world/ambient-npc';
import type { AmbientWaypoint } from './world/ambient-npc';
import {
  CONSUMABLE_KEY_OPTIONS,
  consumableActionForCode,
  keyLabel,
  normalizeConsumableBindings,
} from './controls/action-bindings';
import type { ConsumableBindings } from './controls/action-bindings';

type ItemInstance = { id: string; plus: number; count: number; uid: string };
type BaseStats = { str: number; dex: number; int: number; vit: number; spi: number };
type CombatStats = BaseStats & {
  atkMin: number;
  atkMax: number;
  matk: number;
  def: number;
  mdef: number;
  crit: number;
  accuracy: number;
  evasion: number;
  speed: number;
};
type SkillDef = {
  name: string;
  icon: string;
  cost: number;
  cd: number;
  mul?: number;
  fx?: string;
  stun?: number;
  aoe?: number;
  slow?: number;
  chain?: number;
  dot?: number;
  knock?: number;
  buff?: string;
  leech?: number;
  summon?: boolean;
};
type ClassDef = {
  name: string;
  title: string;
  model: string;
  color: number;
  resource: string;
  ranged: boolean;
  hp: number;
  mp: number;
  stats: BaseStats;
  weapon: string;
  armor: string;
  skills: SkillDef[];
};
type ItemDef = {
  name: string;
  slot?: string;
  type?: string;
  icon: string;
  atk?: [number, number];
  matk?: number;
  def?: number;
  mdef?: number;
  hp?: number;
  mp?: number;
  crit?: number;
  accuracy?: number;
  evasion?: number;
  speed?: number;
  spirit?: number;
  value: number;
  origin?: string;
  desc?: string;
};
type MonsterDef = {
  name: string;
  model: string;
  level: number;
  hp: number;
  atk: number;
  xp: number;
  gold: [number, number];
  tint: number;
  scale: number;
  boss?: 'mini' | 'big';
  drops: Array<[string, number]>;
};
type Player = {
  name: string;
  classId: string;
  level: number;
  xp: number;
  gold: number;
  x: number;
  z: number;
  hp: number;
  mp: number;
  maxHp: number;
  maxMp: number;
  stats: CombatStats;
  inventory: ItemInstance[];
  equipment: Record<string, ItemInstance | undefined>;
  cooldowns: number[];
  attackCd: number;
  dead: boolean;
};
type Statuses = { dot?: number; slow?: number; stun?: number };
type Entity = {
  uid: string;
  kind: 'player' | 'npc' | 'ambient' | 'monster' | 'summon';
  id?: string;
  name?: string;
  model: string;
  role?: string;
  level?: number;
  boss?: 'mini' | 'big';
  hp?: number;
  maxHp?: number;
  atk?: number;
  baseAtk?: number;
  phase?: number;
  x: number;
  z: number;
  homeX?: number;
  homeZ?: number;
  tint?: number;
  targetHeight: number;
  alive: boolean;
  respawn: number;
  attackCd: number;
  status: Statuses;
  root: TransformNode | null;
  baseY?: number;
  baseScale?: Vector3;
  pickVolume?: Mesh;
  animations: AnimationGroup[];
  actionType?: string;
  label?: Mesh;
  labelTexture?: DynamicTexture;
  ambientBrain?: AmbientNpcBrain;
  ambientActivity?: AmbientWaypoint['activity'];
  patrol?: Array<{ x: number; z: number }>;
  patrolIndex?: number;
  patrolPause?: number;
  groupId?: string;
  npcActionTimer?: number;
};
type Settings = {
  quality: 'low' | 'medium' | 'high' | 'ultra';
  shadows: boolean;
  bloom: boolean;
  damage: boolean;
  screenShake: boolean;
  music: number;
  sfx: number;
  ui: number;
  keybinds: ConsumableBindings;
};
type PlayerSave = {
  schema: 1;
  savedAt?: number;
  player: Player;
  quest: number;
  kills: number;
  bossKills: number;
  lootBuffer: ItemInstance[];
  settings: Settings;
  bossTimers?: { mini: number; big: number };
};

const CLASSES_MAP = CLASSES as Record<string, ClassDef>;
const ITEMS_MAP = ITEMS as unknown as Record<string, ItemDef>;
const MONSTERS_MAP = MONSTERS as unknown as Record<string, MonsterDef>;
const LOCATIONS_LIST = LOCATIONS as Array<{ name: string; level: string; desc: string; x: number; z: number; kind: string }>;
const SLOT_NAMES_MAP = SLOT_NAMES as Record<string, string>;
const EQUIPMENT_SLOTS = EQUIP_SLOTS as string[];

const CHARACTER_DIR = '/assets/models/characters/';
const MONSTER_DIR = '/assets/models/monsters-glb/';
const WORLD_DIR = '/assets/models/world/';
const CHARACTER_MODELS = ['Warrior', 'Wizard', 'Rogue', 'Ranger', 'Monk'] as const;
const MONSTER_MODELS = ['Skeleton', 'Slime', 'Bat', 'Dragon'] as const;
const WORLD_MODELS = [
  'tree', 'tree-crooked', 'tree-high', 'tree-high-crooked', 'rock-large', 'rock-wide',
  'lantern', 'fence', 'fence-broken', 'cart', 'stall', 'stall-red', 'wall-arch',
  'wall-block', 'wall-corner', 'wall-door', 'roof', 'roof-high', 'fountain-round',
  'pillar-stone', 'planks',
] as const;
const GREENFALL_SPAWN = Object.freeze({ x: -7, z: -11 });

function q<T extends Element>(selector: string): T {
  const value = document.querySelector<T>(selector);
  if (!value) throw new Error(`Missing required UI node: ${selector}`);
  return value;
}

function qa<T extends Element>(selector: string): T[] {
  return Array.from(document.querySelectorAll<T>(selector));
}

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));
const rand = (min: number, max: number) => min + Math.random() * (max - min);
const rint = (min: number, max: number) => Math.floor(rand(min, max + 1));
const uid = () => crypto.randomUUID?.() ?? `${Date.now()}-${Math.random()}`;

const app = q<HTMLDivElement>('#app');
app.innerHTML = `
<canvas id="game-canvas" tabindex="0" aria-label="Игровой мир Varendor"></canvas><div class="vignette"></div><div class="grain"></div>
<div class="loading hidden" id="loading"><div class="loading-box"><h1>VARENDOR</h1><div class="loadbar"><i id="load-fill"></i></div><p id="load-text">Пробуждаем древний мир…</p></div></div>
<div class="start-screen" id="start-screen"><div class="start-content"><h1 class="logo">VARENDOR<span>ASHEN FRONTIER</span></h1><div class="eyebrow">Выберите судьбу</div><div class="class-picker" id="class-picker"></div><div class="start-actions"><input class="name-field" id="name-field" maxlength="16" value="Странник" aria-label="Имя персонажа"><button class="gold-btn" id="begin">ВОЙТИ В МИР</button><button class="dark-btn hidden" id="continue">ПРОДОЛЖИТЬ</button></div></div></div>
<div class="hud hidden" id="hud">
 <section class="player-frame glass"><div class="portrait" id="portrait">V</div><div><div class="identity"><b id="player-name">Странник</b><span id="player-class">ур. 1</span><span class="coins">◈ <i id="gold">0</i></span></div><div class="bar"><i id="hp-fill"></i><span id="hp-text"></span></div><div class="bar mana"><i id="mp-fill"></i><span id="mp-text"></span></div><div class="bar xp"><i id="xp-fill"></i></div></div></section>
 <section class="target-frame glass hidden" id="target-frame"><div><span class="boss-mark" id="boss-mark"></span><span class="target-name" id="target-name"></span><span class="target-meta" id="target-meta"></span></div><div class="bar"><i id="target-fill"></i><span id="target-hp"></span></div></section>
 <section class="minimap-wrap glass"><canvas class="minimap" id="minimap" width="428" height="328"></canvas><span class="clock" id="clock">19:21</span><div class="zone" id="zone">Гринфолл</div></section>
 <section class="tracker glass"><div class="eyebrow">Путь странника</div><h3 id="quest-title">Голос границы</h3><p id="quest-text">Поговорите со старостой Гринфолла.</p><div class="progress"><i id="quest-progress"></i></div></section>
 <section class="boss-timers glass"><div class="eyebrow">Владыки региона</div><div class="timer"><span>Кровавый Оборотень</span><b id="mini-timer">жив</b></div><div class="timer"><span>Хозяин Гнилого Леса</span><b id="big-timer">жив</b></div></section>
 <section class="combat-log glass"><div class="messages" id="messages"></div><div class="chat-input"><input id="chat" placeholder="Enter — общий чат"><button id="send-chat">›</button></div></section>
 <div class="bottom-cluster"><div class="hotbar glass" id="hotbar"></div><nav class="menu glass"><button class="menu-button" data-window="character"><span>C</span><small>Герой</small></button><button class="menu-button" data-window="inventory"><span>I</span><small>Сумка</small></button><button class="menu-button" data-window="skills"><span>K</span><small>Навыки</small></button><button class="menu-button" data-window="map"><span>M</span><small>Карта</small></button><button class="menu-button" data-window="settings"><span>Esc</span><small>Настройки</small></button></nav></div>
 <div class="quick-items glass" aria-label="Быстрые расходники"><button class="skill-button" id="potion"><span class="key" id="potion-key">Q</span><span class="symbol">♥</span><small>Зелье <b id="potion-count">0</b></small></button><button class="skill-button" id="ether"><span class="key" id="ether-key">E</span><span class="symbol">◆</span><small>Эфир <b id="ether-count">0</b></small></button></div>
 <div class="notice-stack" id="notices"></div><div class="damage-layer" id="damage-layer"></div>
</div><div id="modal-root"></div><div id="confirm-root"></div>`;

const settings: Settings = {
  quality: 'high', shadows: true, bloom: true, damage: true, screenShake: true,
  music: 0.3, sfx: 0.75, ui: 0.7, keybinds: normalizeConsumableBindings(),
};

const state = {
  started: false,
  starting: false,
  paused: false,
  selectedClass: 'knight',
  moveTarget: null as { x: number; z: number } | null,
  interactionTarget: null as Entity | null,
  entities: [] as Entity[],
  effects: [] as Array<{ update: (dt: number) => void; dead?: boolean }>,
  worldTime: 12.5,
  selectedItem: null as number | null,
  quest: 0,
  kills: 0,
  bossKills: 0,
  lootBuffer: [] as ItemInstance[],
  gateWarn: 0,
  settings,
  bossTimers: { mini: 0, big: 0 },
  playerBuffs: { guard: 0, vanish: 0 },
};

const targeting = new TargetingController<Entity>();
const combatControl = new CombatControl();
const playerMotor = new CharacterMotor();
const collisionWorld = new CollisionWorld();

const emptyStats: CombatStats = {
  str: 0, dex: 0, int: 0, vit: 0, spi: 0, atkMin: 0, atkMax: 0, matk: 0,
  def: 0, mdef: 0, crit: 0, accuracy: 0, evasion: 0, speed: 6.2,
};
let player: Player = {
  name: 'Странник', classId: 'knight', level: 1, xp: 0, gold: 320, x: GREENFALL_SPAWN.x, z: GREENFALL_SPAWN.z,
  hp: 1, mp: 1, maxHp: 1, maxMp: 1, stats: { ...emptyStats }, inventory: [],
  equipment: {}, cooldowns: [0, 0, 0, 0], attackCd: 0, dead: false,
};

const gateway = new LocalGameGateway<PlayerSave>('varendor_reborn_v03', window.localStorage, ['varendor_reborn_v02']);
let audioContext: AudioContext | null = null;
let ambientGain: GainNode | null = null;
let assetsLoaded = false;

Object.entries(CLASSES_MAP).forEach(([id, classDef]) => {
  q('#class-picker').insertAdjacentHTML('beforeend', `
    <button class="class-option ${id === 'knight' ? 'selected' : ''}" data-class="${id}">
      <span class="class-symbol" style="color:#${classDef.color.toString(16).padStart(6, '0')}">${classDef.skills[0].icon}</span>
      <b>${classDef.name}</b><small>${classDef.title}<br>HP ${classDef.hp} · ${classDef.resource} ${classDef.mp}</small>
    </button>`);
});

qa<HTMLButtonElement>('[data-class]').forEach((button) => {
  button.onclick = () => {
    qa('[data-class]').forEach((entry) => entry.classList.remove('selected'));
    button.classList.add('selected');
    state.selectedClass = button.dataset.class ?? 'knight';
  };
});

void gateway.load().then((save) => {
  if (save) q('#continue').classList.remove('hidden');
});

const canvas = q<HTMLCanvasElement>('#game-canvas');
const inputControl = new PlayerInputController(canvas);
const engine = new Engine(canvas, true, { stencil: true, preserveDrawingBuffer: false }, true);
const scene = new Scene(engine);
scene.clearColor = new Color4(0.46, 0.66, 0.76, 1);
scene.fogMode = Scene.FOGMODE_EXP2;
scene.fogColor = new Color3(0.48, 0.66, 0.71);
scene.fogDensity = 0.0065;
scene.ambientColor = new Color3(0.56, 0.58, 0.54);

const camera = new ArcRotateCamera('third-person-camera', -Math.PI / 2, 1.06, 10.5, new Vector3(0, 1, 0), scene);
camera.panningSensibility = 0;
const cameraControl = new ThirdPersonCameraController(camera);

const hemi = new HemisphericLight('day-sky', new Vector3(0.18, 1, -0.08), scene);
hemi.intensity = 1.2;
hemi.diffuse = new Color3(0.94, 0.97, 1);
hemi.groundColor = new Color3(0.42, 0.38, 0.3);
const moon = new DirectionalLight('sun', new Vector3(-0.38, -1, 0.24), scene);
moon.position = new Vector3(24, 42, -18);
moon.intensity = 2.65;
moon.diffuse = new Color3(1, 0.94, 0.78);
const shadows = new ShadowGenerator(2048, moon);
shadows.useBlurExponentialShadowMap = true;
shadows.blurKernel = 18;
const glow = new GlowLayer('day-glow', scene, { blurKernelSize: 24 });
glow.intensity = 0.16;

const groundMaterial = new StandardMaterial('ground-material', scene);
groundMaterial.diffuseColor = new Color3(0.31, 0.46, 0.32);
groundMaterial.specularColor = new Color3(0.02, 0.02, 0.02);
const ground = MeshBuilder.CreateGround('ground', { width: 105, height: 90, subdivisions: 55, updatable: true }, scene);
ground.material = groundMaterial;
ground.receiveShadows = true;
ground.metadata = { ground: true };
const groundPositions = ground.getVerticesData(VertexBuffer.PositionKind);
if (groundPositions) {
  for (let index = 0; index < groundPositions.length; index += 3) {
    const x = groundPositions[index];
    const z = groundPositions[index + 2];
    groundPositions[index + 1] = (Math.sin(x * 0.37) + Math.cos(z * 0.29) + Math.sin((x + z) * 0.17)) * 0.13;
  }
  ground.updateVerticesData(VertexBuffer.PositionKind, groundPositions);
  const indices = ground.getIndices();
  if (indices) {
    const normals = new Array<number>(groundPositions.length).fill(0);
    VertexData.ComputeNormals(groundPositions, indices, normals);
    ground.updateVerticesData(VertexBuffer.NormalKind, normals);
  }
  ground.refreshBoundingInfo();
}

const roadMaterial = new StandardMaterial('road-material', scene);
roadMaterial.diffuseColor = new Color3(0.48, 0.41, 0.29);
roadMaterial.specularColor = Color3.Black();
function road(x: number, z: number, width: number, depth: number, rotation = 0) {
  const mesh = MeshBuilder.CreateGround(`road-${x}-${z}`, { width, height: depth }, scene);
  mesh.position.set(x, 0.045, z);
  mesh.rotation.y = rotation;
  mesh.material = roadMaterial;
  mesh.receiveShadows = true;
  mesh.isPickable = false;
}
road(-15, -9, 35, 4, 0.12);
road(7, 1, 31, 3.8, -0.25);
road(28, 15, 35, 3.2, -0.43);

const safeMaterial = new StandardMaterial('safe-zone-material', scene);
safeMaterial.emissiveColor = new Color3(0.66, 0.48, 0.18);
safeMaterial.alpha = 0.1;
const safeRing = MeshBuilder.CreateTorus('safe-zone', { diameter: 24, thickness: 0.07, tessellation: 128 }, scene);
safeRing.position.set(-7, 0.07, -5);
safeRing.material = safeMaterial;
safeRing.isPickable = false;

// Selection is communicated by the target HUD/nameplate. The previous emissive
// torus + mesh outline could expose oversized hidden model geometry as a giant red blob.
const targetIndicator = new TransformNode('selected-target-anchor', scene);
targetIndicator.setEnabled(false);

const pickVolumeMaterial = new StandardMaterial('combat-pick-volume-material', scene);
pickVolumeMaterial.alpha = 0.001;
pickVolumeMaterial.disableLighting = true;
pickVolumeMaterial.disableColorWrite = true;

const characterAssets = new Map<string, AssetContainer>();
const monsterAssets = new Map<string, AssetContainer>();
const worldAssets = new Map<string, AssetContainer>();

async function loadContainer(directory: string, filename: string): Promise<AssetContainer> {
  return SceneLoader.LoadAssetContainerAsync(directory, filename, scene);
}

async function loadAssets(): Promise<void> {
  if (assetsLoaded) return;
  const tasks: Array<Promise<void>> = [];
  let loaded = 0;
  const total = CHARACTER_MODELS.length + MONSTER_MODELS.length + WORLD_MODELS.length;
  const progress = (label: string) => {
    loaded += 1;
    (q<HTMLElement>('#load-fill')).style.width = `${Math.round((loaded / total) * 100)}%`;
    q('#load-text').textContent = label;
  };
  for (const name of CHARACTER_MODELS) {
    tasks.push(loadContainer(CHARACTER_DIR, `${name}.gltf`).then((container) => {
      characterAssets.set(name, container);
      progress(`Вооружаем: ${name}`);
    }));
  }
  for (const name of MONSTER_MODELS) {
    tasks.push(loadContainer(MONSTER_DIR, `${name}.glb`).then((container) => {
      monsterAssets.set(name, container);
      progress(`Пробуждаем: ${name}`);
    }));
  }
  for (const name of WORLD_MODELS) {
    tasks.push(loadContainer(WORLD_DIR, `${name}.glb`).then((container) => {
      worldAssets.set(name, container);
      progress('Возводим Пепельный рубеж');
    }));
  }
  await Promise.all(tasks);
  assetsLoaded = true;
}

function instantiateContainer(container: AssetContainer, name: string): { root: TransformNode; animations: AnimationGroup[] } {
  const entries = container.instantiateModelsToScene((sourceName) => `${name}-${sourceName}`, true);
  const root = new TransformNode(name, scene);
  for (const node of entries.rootNodes) node.parent = root;
  return { root, animations: entries.animationGroups };
}

function tintMeshes(root: TransformNode, tint?: number): void {
  const tintColor = tint == null ? null : Color3.FromHexString(`#${tint.toString(16).padStart(6, '0')}`);
  root.getChildMeshes().forEach((mesh) => {
    mesh.receiveShadows = true;
    shadows.addShadowCaster(mesh, true);
    const source = mesh.material;
    if (source instanceof StandardMaterial) {
      if (tintColor) source.diffuseColor = source.diffuseColor.multiply(tintColor);
      if (!source.diffuseTexture && source.diffuseColor.toLuminance() < 0.02) {
        source.diffuseColor = tintColor?.scale(0.42) ?? new Color3(0.32, 0.32, 0.32);
      }
    } else if (source instanceof PBRMaterial) {
      if (tintColor) source.albedoColor = source.albedoColor.multiply(tintColor);
      if (!source.albedoTexture && source.albedoColor.toLuminance() < 0.02) {
        source.albedoColor = tintColor?.scale(0.42) ?? new Color3(0.32, 0.32, 0.32);
      }
      source.metallic = Math.min(source.metallic ?? 0, 0.35);
      source.roughness = Math.max(source.roughness ?? 0.6, 0.55);
    }
  });
}

function normalizeHeight(root: TransformNode, targetHeight: number): void {
  root.computeWorldMatrix(true);
  root.getChildMeshes().forEach((mesh) => mesh.computeWorldMatrix(true));
  const bounds = root.getHierarchyBoundingVectors(true);
  const height = Math.max(0.001, bounds.max.y - bounds.min.y);
  const scale = targetHeight / height;
  root.scaling.setAll(scale);
  root.computeWorldMatrix(true);
  const corrected = root.getHierarchyBoundingVectors(true);
  root.position.y -= corrected.min.y;
}

function setEntityAction(entity: Entity, action: 'idle' | 'walk' | 'attack' | 'death', once = false): void {
  if (entity.actionType === action && !once) return;
  const terms: Record<string, string[]> = {
    idle: ['idle', 'survey'], walk: ['walk', 'run', 'flying'],
    attack: ['sword_attack', 'dagger_attack', 'bow_shoot', 'attack', 'spell', 'shoot', 'cast'],
    death: ['death', 'die'],
  };
  const group = terms[action]
    .map((term) => entity.animations.find((candidate) => candidate.name.toLowerCase().includes(term)))
    .find(Boolean) ?? entity.animations[action === 'attack' ? 1 : 0];
  if (!group) return;
  entity.animations.forEach((candidate) => {
    if (candidate !== group && candidate.isPlaying) candidate.stop();
  });
  group.start(!once, 1, group.from, group.to, false);
  entity.actionType = action;
}

function createEntityModel(entity: Entity): void {
  const container = entity.kind === 'player' || entity.kind === 'npc' || entity.kind === 'ambient'
    ? characterAssets.get(entity.model)
    : monsterAssets.get(entity.model);
  if (!container) throw new Error(`Asset not loaded: ${entity.model}`);
  const instance = instantiateContainer(container, entity.uid);
  entity.root = instance.root;
  entity.animations = instance.animations;
  entity.root.position.set(entity.x, 0, entity.z);
  normalizeHeight(entity.root, entity.targetHeight);
  entity.baseY = entity.root.position.y;
  entity.baseScale = entity.root.scaling.clone();
  tintMeshes(entity.root, entity.tint);
  entity.root.getChildMeshes().forEach((mesh) => {
    mesh.metadata = { entity };
    mesh.isPickable = entity.kind === 'monster' || entity.kind === 'npc';
  });
  if (entity.kind === 'monster' || entity.kind === 'npc') {
    const radius = entity.kind === 'npc'
      ? 0.62
      : entity.boss === 'big' ? 1.75 : entity.boss === 'mini' ? 1.25 : Math.max(0.72, entity.targetHeight * 0.42);
    const height = entity.targetHeight + radius * 1.45;
    const volume = MeshBuilder.CreateCapsule(`pick-volume-${entity.uid}`, { height, radius, tessellation: 12 }, scene);
    volume.position.set(entity.x, height * 0.5, entity.z);
    volume.material = pickVolumeMaterial;
    volume.metadata = { entity, combatPickVolume: entity.kind === 'monster' };
    volume.isPickable = true;
    entity.pickVolume = volume;
  }
  setEntityAction(entity, 'idle');
  if (entity.kind === 'monster') addNameplate(entity);
  if (entity.kind === 'npc') addNpcLabel(entity);
}

function syncEntityTransform(entity: Entity, verticalOffset = 0): void {
  entity.root?.position.set(entity.x, (entity.baseY ?? entity.root.position.y) + verticalOffset, entity.z);
  if (entity.pickVolume) {
    entity.pickVolume.position.x = entity.x;
    entity.pickVolume.position.z = entity.z;
    entity.pickVolume.position.y = entity.targetHeight * 0.5 + verticalOffset;
  }
}

function labelMaterial(entity: Entity, height = 96): { material: StandardMaterial; texture: DynamicTexture } {
  const texture = new DynamicTexture(`label-${entity.uid}`, { width: 512, height }, scene, false);
  texture.hasAlpha = true;
  const material = new StandardMaterial(`label-material-${entity.uid}`, scene);
  material.diffuseTexture = texture;
  material.opacityTexture = texture;
  material.emissiveColor = Color3.White();
  material.disableLighting = true;
  material.backFaceCulling = false;
  return { material, texture };
}

function addNpcLabel(entity: Entity): void {
  if (!entity.root) return;
  const { material, texture } = labelMaterial(entity, 80);
  const context = texture.getContext() as unknown as CanvasRenderingContext2D;
  context.clearRect(0, 0, 512, 80);
  context.textAlign = 'center';
  context.shadowColor = '#000';
  context.shadowBlur = 9;
  context.font = '700 25px Georgia';
  context.fillStyle = '#e1c17f';
  context.fillText(entity.name ?? '', 256, 31);
  context.font = '18px Arial';
  context.fillStyle = '#b9afa0';
  const role = { elder: 'Задание', smith: 'Кузница', shop: 'Торговля', teleport: 'Переход' }[entity.role ?? ''] ?? '';
  context.fillText(role, 256, 59);
  texture.update();
  const plane = MeshBuilder.CreatePlane(`npc-label-${entity.uid}`, { width: 5.4, height: 0.84 }, scene);
  plane.billboardMode = Mesh.BILLBOARDMODE_ALL;
  plane.position.y = entity.targetHeight + 0.8;
  plane.material = material;
  plane.parent = entity.root;
  plane.isPickable = false;
}

function addNameplate(entity: Entity): void {
  if (!entity.root) return;
  const { material, texture } = labelMaterial(entity);
  const plane = MeshBuilder.CreatePlane(`monster-label-${entity.uid}`, { width: entity.boss ? 7 : 5.5, height: entity.boss ? 1.32 : 1.05 }, scene);
  plane.billboardMode = Mesh.BILLBOARDMODE_ALL;
  plane.position.y = entity.targetHeight + 0.8;
  plane.material = material;
  plane.parent = entity.root;
  plane.isPickable = false;
  entity.label = plane;
  entity.labelTexture = texture;
  refreshNameplate(entity);
}

function refreshNameplate(entity: Entity): void {
  if (!entity.labelTexture) return;
  const context = entity.labelTexture.getContext() as unknown as CanvasRenderingContext2D;
  context.clearRect(0, 0, 512, 96);
  context.textAlign = 'center';
  context.shadowColor = '#000';
  context.shadowBlur = 8;
  context.font = `700 ${entity.boss ? 29 : 25}px Georgia`;
  context.fillStyle = entity.boss ? '#efb4a0' : '#e8e0d0';
  context.fillText(entity.name ?? '', 256, 35);
  context.shadowBlur = 0;
  context.fillStyle = '#090b0c';
  context.fillRect(96, 56, 320, 14);
  context.fillStyle = entity.boss ? '#b63339' : '#7f242b';
  const ratio = clamp((entity.hp ?? 0) / Math.max(1, entity.maxHp ?? 1), 0, 1);
  context.fillRect(99, 59, 314 * ratio, 8);
  entity.labelTexture.update();
}

const CIRCLE_COLLIDERS: Record<string, number> = {
  tree: 0.5, 'tree-crooked': 0.62, 'tree-high': 0.48, 'tree-high-crooked': 0.58,
  'rock-large': 0.9, 'rock-wide': 1.05, lantern: 0.2, 'fountain-round': 1.2, 'pillar-stone': 0.42,
};
const BOX_COLLIDERS: Record<string, readonly [number, number]> = {
  roof: [1.5, 1.25], 'roof-high': [1.65, 1.4], stall: [1.2, 0.75], 'stall-red': [1.2, 0.75],
  cart: [1.2, 0.58], 'wall-block': [0.85, 0.3], 'wall-corner': [0.8, 0.8],
  'wall-door': [1.15, 0.35], fence: [1.1, 0.16], 'fence-broken': [1.05, 0.16],
};

function registerWorldCollider(name: string, x: number, z: number, scale: number, rotation: number): void {
  const circle = CIRCLE_COLLIDERS[name];
  if (circle) collisionWorld.addCircle(x, z, circle * scale);
  const box = BOX_COLLIDERS[name];
  if (box) collisionWorld.addBox(x, z, box[0] * scale, box[1] * scale, rotation);
  if (name === 'wall-arch') {
    const side = 1.15 * scale;
    const cosine = Math.cos(rotation);
    const sine = Math.sin(rotation);
    for (const direction of [-1, 1]) {
      collisionWorld.addBox(
        x + cosine * side * direction,
        z - sine * side * direction,
        0.36 * scale,
        0.42 * scale,
        rotation,
      );
    }
  }
}

function worldModel(name: string, x: number, z: number, scale = 1, rotation = 0, tint?: number): TransformNode | null {
  const container = worldAssets.get(name);
  if (!container) return null;
  const instance = instantiateContainer(container, `world-${name}-${uid()}`);
  instance.root.position.set(x, 0, z);
  instance.root.rotation.y = rotation;
  instance.root.scaling.setAll(scale);
  tintMeshes(instance.root, tint);
  instance.root.getChildMeshes().forEach((mesh) => { mesh.isPickable = false; });
  registerWorldCollider(name, x, z, scale, rotation);
  return instance.root;
}

const townMaterials = new Map<number, StandardMaterial>();
function townMaterial(color: number): StandardMaterial {
  const existing = townMaterials.get(color);
  if (existing) return existing;
  const material = new StandardMaterial(`town-material-${color.toString(16)}`, scene);
  material.diffuseColor = Color3.FromHexString(`#${color.toString(16).padStart(6, '0')}`);
  material.specularColor = new Color3(0.04, 0.04, 0.035);
  material.roughness = 0.92;
  townMaterials.set(color, material);
  return material;
}

function townBox(name: string, x: number, y: number, z: number, width: number, height: number, depth: number, color: number, collider = true): Mesh {
  const mesh = MeshBuilder.CreateBox(name, { width, height, depth }, scene);
  mesh.position.set(x, y, z);
  mesh.material = townMaterial(color);
  mesh.receiveShadows = true;
  shadows.addShadowCaster(mesh, true);
  mesh.isPickable = false;
  if (collider) collisionWorld.addBox(x, z, width * 0.5, depth * 0.5, 0);
  return mesh;
}

function townCylinder(name: string, x: number, y: number, z: number, diameter: number, height: number, color: number, tessellation = 10, collider = true): Mesh {
  const mesh = MeshBuilder.CreateCylinder(name, { diameter, height, tessellation }, scene);
  mesh.position.set(x, y, z);
  mesh.material = townMaterial(color);
  mesh.receiveShadows = true;
  shadows.addShadowCaster(mesh, true);
  mesh.isPickable = false;
  if (collider) collisionWorld.addCircle(x, z, diameter * 0.46);
  return mesh;
}

function createBuilding(name: string, x: number, z: number, width: number, depth: number, height: number, wallColor: number, roofColor: number): void {
  townBox(`${name}-body`, x, height * 0.5, z, width, height, depth, wallColor);
  const roof = MeshBuilder.CreateCylinder(`${name}-roof`, {
    height: 1.55,
    diameterTop: 0.25,
    diameterBottom: Math.max(width, depth) * 1.18,
    tessellation: 4,
  }, scene);
  roof.position.set(x, height + 0.7, z);
  roof.rotation.y = Math.PI / 4;
  roof.scaling.z = Math.max(0.72, depth / Math.max(width, depth));
  roof.material = townMaterial(roofColor);
  roof.receiveShadows = true;
  shadows.addShadowCaster(roof, true);
  roof.isPickable = false;
  townBox(`${name}-door`, x, 1.05, z - depth * 0.505, 1.1, 2.1, 0.16, 0x4b3526, false);
  townBox(`${name}-window-a`, x - width * 0.24, 1.75, z - depth * 0.51, 0.75, 0.8, 0.08, 0xa9d2d0, false);
  townBox(`${name}-window-b`, x + width * 0.24, 1.75, z - depth * 0.51, 0.75, 0.8, 0.08, 0xa9d2d0, false);
}

function createWatchTower(name: string, x: number, z: number, scale = 1): void {
  townCylinder(`${name}-tower`, x, 2.45 * scale, z, 3.25 * scale, 4.9 * scale, 0x7f7768, 10);
  townCylinder(`${name}-top`, x, 5.02 * scale, z, 4.05 * scale, 0.38 * scale, 0x5f594f, 10, false);
  for (let index = 0; index < 8; index += 1) {
    const angle = (index / 8) * Math.PI * 2;
    townBox(`${name}-merlon-${index}`, x + Math.cos(angle) * 1.63 * scale, 5.45 * scale, z + Math.sin(angle) * 1.63 * scale, 0.48 * scale, 0.8 * scale, 0.48 * scale, 0x70695d, false);
  }
}

function createGate(name: string, x: number, z: number, width = 7): void {
  createWatchTower(`${name}-left`, x - width * 0.58, z, 0.92);
  createWatchTower(`${name}-right`, x + width * 0.58, z, 0.92);
  townBox(`${name}-beam`, x, 4.2, z, width * 0.72, 1.0, 1.05, 0x71695d, false);
  townBox(`${name}-door-left`, x - 1.05, 1.55, z + 0.05, 1.9, 3.1, 0.22, 0x563723, false);
  townBox(`${name}-door-right`, x + 1.05, 1.55, z + 0.05, 1.9, 3.1, 0.22, 0x563723, false);
}

function createSmithy(x: number, z: number): void {
  townBox('smithy-floor', x, 0.08, z, 5.8, 0.16, 4.4, 0x746b5d, false);
  townBox('smithy-back', x, 1.3, z + 1.85, 5.8, 2.6, 0.35, 0x685f52);
  townBox('smithy-awning', x, 2.55, z + 0.1, 5.6, 0.24, 3.2, 0x6e3f2c, false);
  townBox('smithy-anvil-base', x + 0.8, 0.38, z - 0.15, 0.65, 0.75, 0.7, 0x3b4244, false);
  townBox('smithy-anvil-top', x + 0.8, 0.86, z - 0.15, 1.35, 0.28, 0.62, 0x4f595c, false);
  townCylinder('smithy-brazier', x - 1.1, 0.5, z - 0.25, 1.15, 0.65, 0x3d3630, 12, false);
  const flame = MeshBuilder.CreateCylinder('smithy-brazier-flame', { height: 0.8, diameterTop: 0.08, diameterBottom: 0.72, tessellation: 10 }, scene);
  flame.position.set(x - 1.1, 1.08, z - 0.25);
  const flameMaterial = new StandardMaterial('smithy-brazier-flame-material', scene);
  flameMaterial.emissiveColor = new Color3(1, 0.28, 0.035);
  flameMaterial.diffuseColor = new Color3(0.9, 0.18, 0.02);
  flameMaterial.alpha = 0.82;
  flame.material = flameMaterial;
  flame.isPickable = false;
  const light = new PointLight('smithy-brazier-light', new Vector3(x - 1.1, 1.7, z - 0.25), scene);
  light.diffuse = new Color3(1, 0.42, 0.12);
  light.intensity = 1.15;
  light.range = 5.5;
}

function buildTown(x: number, z: number, scale: number): void {
  // Asterhold reads as a fortified keep instead of a ring of placeholder roof cubes.
  createBuilding('asterhold-keep', x, z, 8.5 * scale, 6.4 * scale, 4.3 * scale, 0x8a8273, 0x59473f);
  createGate('asterhold-gate', x, z - 7.2 * scale, 7.5 * scale);
  createWatchTower('asterhold-nw', x - 6.4 * scale, z + 4.9 * scale, scale);
  createWatchTower('asterhold-ne', x + 6.4 * scale, z + 4.9 * scale, scale);
  createBuilding('asterhold-tavern', x - 7.8 * scale, z - 1.4 * scale, 5.7 * scale, 4.4 * scale, 3.0 * scale, 0x92785e, 0x6f4036);
  createBuilding('asterhold-barracks', x + 7.8 * scale, z - 1.4 * scale, 5.8 * scale, 4.5 * scale, 3.2 * scale, 0x81796d, 0x4e5355);
}

function createBonfire(x: number, z: number): void {
  for (let index = 0; index < 7; index += 1) {
    const angle = (index / 7) * Math.PI * 2;
    worldModel('rock-wide', x + Math.cos(angle) * 1.05, z + Math.sin(angle) * 1.05, 0.28, angle, 0x77736b);
  }
  worldModel('planks', x, z, 0.78, Math.PI / 4, 0x5f3823);
  worldModel('planks', x, z, 0.72, -Math.PI / 4, 0x704027);
  collisionWorld.addCircle(x, z, 1.15);

  const flames: Mesh[] = [];
  const colors = [new Color3(1, 0.16, 0.01), new Color3(1, 0.48, 0.03), new Color3(1, 0.78, 0.18)];
  colors.forEach((color, index) => {
    const flame = MeshBuilder.CreateCylinder(`bonfire-flame-${index}`, {
      height: 1.3 - index * 0.18,
      diameterTop: 0.04,
      diameterBottom: 0.72 - index * 0.13,
      tessellation: 12,
    }, scene);
    const material = new StandardMaterial(`bonfire-flame-material-${index}`, scene);
    material.emissiveColor = color;
    material.diffuseColor = color.scale(0.7);
    material.alpha = 0.82;
    material.disableLighting = true;
    flame.material = material;
    flame.position.set(x + (index - 1) * 0.18, 0.78 + index * 0.08, z + (index % 2 ? 0.12 : -0.08));
    flame.isPickable = false;
    glow.addIncludedOnlyMesh(flame);
    flames.push(flame);
  });
  const fireLight = new PointLight('greenfall-bonfire-light', new Vector3(x, 2.2, z), scene);
  fireLight.diffuse = new Color3(1, 0.32, 0.06);
  fireLight.intensity = 5.2;
  fireLight.range = 15;
  let fireTime = 0;
  scene.onBeforeRenderObservable.add(() => {
    fireTime += engine.getDeltaTime() / 1000;
    flames.forEach((flame, index) => {
      flame.scaling.y = 0.88 + Math.sin(fireTime * (5.5 + index) + index * 1.7) * 0.14;
      flame.rotation.y += 0.012 * (index % 2 ? 1 : -1);
      flame.position.x = x + (index - 1) * 0.18 + Math.sin(fireTime * 3.1 + index) * 0.06;
    });
    fireLight.intensity = 4.8 + Math.sin(fireTime * 8.4) * 0.55;
  });
}

function buildStarterSettlement(x: number, z: number): void {
  // Readable road hierarchy: south gate -> civic square -> keep.
  road(x, z - 4.8, 4.4, 20);
  road(x, z, 20, 4.4);
  road(x - 6.5, z + 0.2, 7.5, 3.2, 0.05);
  road(x + 6.5, z + 0.2, 7.5, 3.2, -0.05);

  // Outer fortification and four real watch towers.
  createWatchTower('greenfall-sw', x - 10.2, z - 8.2, 0.86);
  createWatchTower('greenfall-se', x + 10.2, z - 8.2, 0.86);
  createWatchTower('greenfall-nw', x - 10.2, z + 8.2, 0.86);
  createWatchTower('greenfall-ne', x + 10.2, z + 8.2, 0.86);
  createGate('greenfall-south-gate', x, z - 10.2, 6.8);
  for (const offset of [-6.6, -2.2, 2.2, 6.6]) {
    townBox(`greenfall-west-wall-${offset}`, x - 10.2, 1.35, z + offset, 0.65, 2.7, 3.6, 0x81796c);
    townBox(`greenfall-east-wall-${offset}`, x + 10.2, 1.35, z + offset, 0.65, 2.7, 3.6, 0x81796c);
  }
  for (const offset of [-6.4, -2.1, 2.1, 6.4]) {
    if (Math.abs(offset) < 3) continue;
    townBox(`greenfall-north-wall-${offset}`, x + offset, 1.35, z + 8.2, 3.6, 2.7, 0.65, 0x81796c);
  }

  // Northern keep: actual civic focus with a visible entrance.
  createBuilding('greenfall-keep', x, z + 5.0, 8.4, 5.2, 3.9, 0x978d7d, 0x5c4a42);
  townBox('greenfall-keep-steps', x, 0.24, z + 1.95, 3.4, 0.48, 1.5, 0x8a8172, false);
  createWatchTower('greenfall-keep-left', x - 5.0, z + 5.7, 0.72);
  createWatchTower('greenfall-keep-right', x + 5.0, z + 5.7, 0.72);

  // West quarter: tavern and working forge.
  createBuilding('greenfall-tavern', x - 6.0, z + 0.4, 6.0, 4.6, 3.0, 0x9a7b5e, 0x754335);
  townBox('greenfall-tavern-sign', x - 3.0, 2.3, z - 0.8, 0.18, 1.2, 1.05, 0x6a4326, false);
  createSmithy(x - 6.4, z - 0.2);

  // East quarter: market + storehouse. No black placeholder roofs.
  createBuilding('greenfall-storehouse', x + 6.1, z + 2.3, 5.2, 4.0, 2.8, 0x8d806c, 0x625046);
  worldModel('stall-red', x + 6.3, z - 0.2, 1.15, -Math.PI / 2, 0x9b6656);
  worldModel('stall', x + 6.1, z - 3.0, 1.05, -Math.PI / 2, 0x826b57);
  worldModel('cart', x + 4.7, z - 1.7, 0.95, 0.35, 0x72533d);

  // Central social square.
  createBonfire(x, z - 0.4);
  worldModel('fountain-round', x + 3.0, z + 1.2, 0.9, 0, 0x9b9a8d);
  for (const [lx, lz] of [[x - 3.4, z - 3.6], [x + 3.4, z - 3.6], [x - 3.4, z + 2.8], [x + 3.4, z + 2.8]]) {
    const lantern = worldModel('lantern', lx, lz, 1.25);
    if (lantern) {
      const light = new PointLight(`settlement-light-${lx}-${lz}`, new Vector3(0, 2.5, 0), scene);
      light.diffuse = new Color3(1, 0.55, 0.2);
      light.intensity = 0.6;
      light.range = 5.5;
      light.parent = lantern;
    }
  }
}

function buildWorld(): void {
  collisionWorld.clear();
  for (let index = 0; index < 52; index += 1) {
    const forest = index > 24;
    const x = forest ? rand(12, 47) : rand(-43, 25);
    const z = forest ? rand(5, 36) : rand(-31, 19);
    if (Math.hypot(x + 7, z + 5) < 16) continue;
    worldModel(WORLD_MODELS[index % 4], x, z, rand(1.1, 2.2), rand(0, Math.PI * 2), forest ? 0x879b83 : 0x9aa38c);
  }
  for (let index = 0; index < 22; index += 1) {
    worldModel(index % 2 ? 'rock-large' : 'rock-wide', rand(-46, 48), rand(-35, 37), rand(0.7, 1.7), rand(0, Math.PI * 2), 0x8b918b);
  }
  buildTown(-27, -19, 1.5);
  buildStarterSettlement(-7, -5);
  for (let index = 0; index < 8; index += 1) worldModel(index % 3 ? 'fence' : 'fence-broken', -14 + index * 2.2, -7 + index * 0.22, 1, 0);
  for (const [x, z] of [[-25, -16], [-30, -22], [19, 7], [35, 25]]) {
    const lantern = worldModel('lantern', x, z, 1.4);
    if (lantern) {
      const light = new PointLight(`fire-${x}-${z}`, new Vector3(0, 2.6, 0), scene);
      light.diffuse = new Color3(1, 0.34, 0.08);
      light.intensity = 2.6;
      light.range = 10;
      light.parent = lantern;
    }
  }
  worldModel('wall-arch', 39, 31, 3.2, Math.PI, 0x59605d);
  for (let index = 0; index < 6; index += 1) worldModel('rock-large', 35 + rand(0, 8), 27 + rand(0, 8), rand(1.5, 2.4), rand(0, Math.PI * 2), 0x5f615d);
}

function makeItem(id: string, plus = 0, count = 1): ItemInstance {
  return { id, plus, count, uid: uid() };
}

function itemDef(item: ItemInstance): ItemDef {
  const definition = ITEMS_MAP[item.id];
  if (!definition) throw new Error(`Unknown item: ${item.id}`);
  return definition;
}

function newPlayer(): void {
  const classDef = CLASSES_MAP[state.selectedClass];
  player = {
    name: q<HTMLInputElement>('#name-field').value.trim() || 'Странник', classId: state.selectedClass,
    level: 1, xp: 0, gold: 320, x: GREENFALL_SPAWN.x, z: GREENFALL_SPAWN.z, hp: 1, mp: 1, maxHp: 1, maxMp: 1,
    stats: { ...emptyStats }, inventory: [makeItem('potion', 0, 6), makeItem('ether', 0, 4), makeItem('scroll', 0, 4), makeItem('teleport')],
    equipment: { weapon: makeItem(classDef.weapon), chest: makeItem(classDef.armor) },
    cooldowns: [0, 0, 0, 0], attackCd: 0, dead: false,
  };
  state.quest = 0;
  state.kills = 0;
  state.bossKills = 0;
  state.lootBuffer = [];
  recalculate(true);
}

function recalculate(fill = false): void {
  const classDef = CLASSES_MAP[player.classId];
  const stats = statsAtLevel(player.classId, classDef.stats, player.level);
  const profile = classCombatProfile(player.classId, player.level, stats);
  const computed: CombatStats = {
    ...stats,
    atkMin: profile.physicalScaling,
    atkMax: profile.physicalScaling,
    matk: profile.magicScaling,
    def: stats.vit * 1.2 + player.level * 0.7,
    mdef: stats.spi * 1.15 + player.level * 0.65,
    crit: profile.critChance,
    accuracy: profile.accuracy,
    evasion: stats.dex * 0.45,
    speed: profile.movementSpeed,
  };
  let gearHp = 0;
  let gearMp = 0;
  Object.values(player.equipment).filter((item): item is ItemInstance => Boolean(item)).forEach((item) => {
    const definition = itemDef(item);
    const multiplier = enhancementStatMultiplier(definition.slot === 'weapon' ? 'weapon' : 'armor', item.plus);
    if (definition.atk) {
      computed.atkMin += definition.atk[0] * multiplier;
      computed.atkMax += definition.atk[1] * multiplier;
    }
    for (const key of ['matk', 'def', 'mdef'] as const) computed[key] += (definition[key] ?? 0) * multiplier;
    computed.crit += definition.crit ?? 0;
    computed.accuracy += definition.accuracy ?? 0;
    computed.evasion += definition.evasion ?? 0;
    computed.speed += (definition.speed ?? 0) * 0.062;
    gearHp += definition.hp ?? 0;
    gearMp += definition.mp ?? 0;
  });
  player.stats = computed;
  const vitals = baseVitals(player.classId, player.level, stats);
  player.maxHp = vitals.hp + gearHp;
  player.maxMp = vitals.mp + gearMp;
  if (fill) {
    player.hp = player.maxHp;
    player.mp = player.maxMp;
  } else {
    player.hp = Math.min(player.hp, player.maxHp);
    player.mp = Math.min(player.mp, player.maxMp);
  }
  updateHud();
}

function makeEntity(input: Partial<Entity> & Pick<Entity, 'kind' | 'model' | 'x' | 'z' | 'targetHeight'>): Entity {
  return {
    uid: uid(), alive: true, respawn: 0, attackCd: rand(0, 1), status: {}, root: null,
    animations: [], ...input,
  };
}

function spawnMonster(id: string, x: number, z: number, delay = 0): Entity {
  const definition = MONSTERS_MAP[id];
  const targetHeight = definition.boss === 'big' ? 4.6 : definition.boss === 'mini' ? 3.4 : id === 'bat' ? 1.4 : 1.9;
  const actorRadius = definition.boss === 'big' ? 1.2 : definition.boss === 'mini' ? 0.9 : 0.42;
  const spawn = collisionWorld.findNearestFree({ x, z }, actorRadius);
  const entity = makeEntity({
    kind: 'monster', id, name: definition.name, model: definition.model, level: definition.level,
    boss: definition.boss, hp: definition.hp, maxHp: definition.hp, atk: definition.atk,
    baseAtk: definition.atk, phase: 1, x: spawn.x, z: spawn.z, homeX: spawn.x, homeZ: spawn.z, tint: definition.tint,
    targetHeight, alive: delay <= 0, respawn: delay,
  });
  createEntityModel(entity);
  entity.root?.setEnabled(entity.alive);
  entity.pickVolume?.setEnabled(entity.alive);
  state.entities.push(entity);
  return entity;
}

function spawnAmbientResident(
  name: string,
  model: string,
  x: number,
  z: number,
  waypoints: readonly AmbientWaypoint[],
  seed: number,
): Entity {
  const safeWaypoints = waypoints.map((waypoint) => {
    const free = collisionWorld.findNearestFree(waypoint, 0.34);
    return { ...waypoint, x: free.x, z: free.z };
  });
  const spawn = collisionWorld.findNearestFree({ x, z }, 0.34);
  const entity = makeEntity({
    kind: 'ambient', name, model, x: spawn.x, z: spawn.z, targetHeight: 1.92,
    tint: 0xb9aa98, ambientBrain: new AmbientNpcBrain(safeWaypoints, seed),
  });
  createEntityModel(entity);
  rotateTowards(entity, safeWaypoints[0].x, safeWaypoints[0].z);
  state.entities.push(entity);
  return entity;
}

function spawnTowerGuard(name: string, x: number, z: number, elevation: number, lookX: number, lookZ: number): void {
  const entity = makeEntity({ kind: 'ambient', name, model: 'Ranger', x, z, targetHeight: 1.92, tint: 0xa9a18f });
  createEntityModel(entity);
  entity.baseY = (entity.baseY ?? 0) + elevation;
  if (entity.root) entity.root.position.y = entity.baseY;
  rotateTowards(entity, lookX, lookZ);
  state.entities.push(entity);
}

function spawnAmbientResidents(): void {
  // Routes are deliberately kept on the civic square and road corridors.
  spawnAmbientResident('Поселенец', 'Ranger', -5.2, -9.0, [
    { x: -5.2, z: -8.6, activity: 'guard' }, { x: -5.2, z: -5.6, activity: 'warm' }, { x: -3.8, z: -3.8, activity: 'trade' },
  ], 1);
  spawnAmbientResident('Подмастерье', 'Warrior', -12.0, -6.8, [
    { x: -11.7, z: -5.2, activity: 'work' }, { x: -9.8, z: -5.0, activity: 'talk' }, { x: -11.5, z: -7.3, activity: 'work' },
  ], 2);
  spawnAmbientResident('Дозорный', 'Warrior', -9.8, -12.4, [
    { x: -10.0, z: -12.4, activity: 'guard' }, { x: -4.0, z: -12.4, activity: 'guard' }, { x: -7.0, z: -9.3, activity: 'talk' },
  ], 3);
  spawnAmbientResident('Жительница', 'Monk', -3.2, -5.2, [
    { x: -3.0, z: -4.8, activity: 'trade' }, { x: -6.8, z: -5.4, activity: 'warm' }, { x: -4.0, z: -1.8, activity: 'talk' },
  ], 4);
  spawnAmbientResident('Грузчик', 'Rogue', -1.6, -7.4, [
    { x: -1.6, z: -7.0, activity: 'work' }, { x: -1.3, z: -4.0, activity: 'trade' }, { x: -4.2, z: -4.0, activity: 'talk' },
  ], 5);
  spawnAmbientResident('Странник', 'Wizard', -8.4, -8.0, [
    { x: -8.2, z: -8.0, activity: 'guard' }, { x: -7.0, z: -5.4, activity: 'warm' }, { x: -7.0, z: -1.5, activity: 'talk' },
  ], 6);
  spawnAmbientResident('Постоялец', 'Rogue', -12.0, -2.2, [
    { x: -11.5, z: -2.2, activity: 'talk' }, { x: -8.6, z: -2.0, activity: 'trade' }, { x: -7.2, z: -5.3, activity: 'warm' },
  ], 7);

  // Two visible guards on the south watch towers.
  spawnTowerGuard('Лучник западной башни', -17.2, -13.2, 4.35, -7, -18);
  spawnTowerGuard('Лучник восточной башни', 3.2, -13.2, 4.35, -7, -18);
}

function spawnMonsterCamp(id: string, centerX: number, centerZ: number, count: number, spread: number, patrolRadius: number): void {
  for (let index = 0; index < count; index += 1) {
    const angle = (index / count) * Math.PI * 2 + rand(-0.22, 0.22);
    const radius = rand(spread * 0.35, spread);
    const entity = spawnMonster(id, centerX + Math.cos(angle) * radius, centerZ + Math.sin(angle) * radius);
    entity.groupId = `${id}-${centerX}-${centerZ}`;
    entity.patrol = [0, 1, 2].map((step) => {
      const patrolAngle = angle + step * (Math.PI * 2 / 3);
      const point = { x: centerX + Math.cos(patrolAngle) * patrolRadius, z: centerZ + Math.sin(patrolAngle) * patrolRadius };
      return collisionWorld.findNearestFree(point, entityCollisionRadius(entity));
    });
    entity.patrolIndex = index % entity.patrol.length;
    entity.patrolPause = rand(0.25, 1.4);
  }
}

function spawnEntities(): void {
  state.entities.forEach((entity) => {
    entity.pickVolume?.dispose(false, true);
    entity.root?.dispose(false, true);
  });
  state.entities.length = 0;
  const safeSpawn = collisionWorld.findNearestFree({ x: player.x, z: player.z }, 0.46);
  player.x = safeSpawn.x;
  player.z = safeSpawn.z;
  const classDef = CLASSES_MAP[player.classId];
  const playerEntity = makeEntity({ kind: 'player', model: classDef.model, x: player.x, z: player.z, targetHeight: 2.05 });
  createEntityModel(playerEntity);
  state.entities.push(playerEntity);

  const npcs: Array<[string, string, number, number, string, number, number]> = [
    ['Староста Роэн', 'Warrior', -7, -0.2, 'elder', -7, 3.6],
    ['Кузнец Бран', 'Warrior', -12.7, -5.0, 'smith', -12.6, -5.2],
    ['Торговка Эльза', 'Ranger', -1.4, -5.1, 'shop', -0.7, -4.0],
    ['Проводник Каэль', 'Wizard', -7, -13.0, 'teleport', -7, -8.8],
  ];
  npcs.forEach(([name, model, x, z, role, lookX, lookZ]) => {
    const spawn = collisionWorld.findNearestFree({ x, z }, 0.5);
    const entity = makeEntity({ kind: 'npc', name, model, x: spawn.x, z: spawn.z, role, targetHeight: 2 });
    createEntityModel(entity);
    rotateTowards(entity, lookX, lookZ);
    state.entities.push(entity);
  });
  spawnAmbientResidents();

  // Homogeneous camps are separated spatially; mobs no longer spawn as a mixed pile.
  spawnMonsterCamp('wolf', 5, -2, 6, 3.6, 4.2);
  spawnMonsterCamp('exile', 7, 9, 5, 3.2, 4.0);
  spawnMonsterCamp('spider', 16, 1, 5, 3.4, 4.1);
  spawnMonsterCamp('undead', 15, 13, 5, 3.7, 4.5);
  spawnMonsterCamp('bat', 23, 7, 4, 3.1, 4.2);
  spawnMonsterCamp('cultist', 26, 17, 4, 3.3, 4.3);
  spawnMonsterCamp('miner', 34, 20, 4, 3.5, 4.0);
  spawnMonsterCamp('wraith', 39, 12, 4, 3.4, 4.4);

  spawnMonster('mini', 28, 6, state.bossTimers.mini);
  spawnMonster('big', 39, 32, state.bossTimers.big);
}

function playerEntity(): Entity {
  const entity = state.entities.find((candidate) => candidate.kind === 'player');
  if (!entity) throw new Error('Player entity not initialized');
  return entity;
}

async function startGame(load: boolean): Promise<void> {
  if (state.starting) return;
  state.starting = true;
  initAudio();
  q('#start-screen').classList.add('hidden');
  q('#loading').classList.remove('hidden');
  try {
    if (load) {
      const save = await gateway.load();
      if (save?.player) {
        player = save.player;
        player.cooldowns = [0, 0, 0, 0];
        player.attackCd = 0;
        player.dead = false;
        state.quest = save.quest ?? 0;
        state.kills = save.kills ?? 0;
        state.bossKills = save.bossKills ?? 0;
        state.lootBuffer = save.lootBuffer ?? [];
        Object.assign(state.settings, save.settings ?? {});
        state.settings.keybinds = normalizeConsumableBindings(state.settings.keybinds);
        const elapsed = Math.max(0, (Date.now() - (save.savedAt ?? Date.now())) / 1000);
        state.bossTimers.mini = Math.max(0, (save.bossTimers?.mini ?? 0) - elapsed);
        state.bossTimers.big = Math.max(0, (save.bossTimers?.big ?? 0) - elapsed);
        state.selectedClass = player.classId;
        recalculate(false);
      } else newPlayer();
    } else newPlayer();
    await loadAssets();
    if (!state.started) buildWorld();
    spawnEntities();
    targeting.clear();
    combatControl.cancelPursuit();
    playerMotor.reset();
    state.moveTarget = null;
    state.interactionTarget = null;
    cameraControl.snap({ x: player.x, y: 0, z: player.z });
    applySettings();
    q('#loading').classList.add('hidden');
    q('#hud').classList.remove('hidden');
    state.started = true;
    state.paused = false;
    buildHotbar();
    updateQuest();
    updateHud();
    log(`Добро пожаловать в Варендор, ${player.name}.`, 'system');
    log('WASD — движение. ПКМ — камера. Колесо — приближение. ЛКМ — путь, цель и атака.', 'system');
    canvas.focus();
    saveGame();
  } catch (error) {
    console.error(error);
    q('#load-text').textContent = 'Не удалось загрузить игровые ассеты. Перезапустите сборку.';
    (q<HTMLElement>('#load-text')).style.color = '#d36d61';
    q('#start-screen').classList.remove('hidden');
  } finally {
    state.starting = false;
  }
}

q<HTMLButtonElement>('#begin').onclick = () => { void startGame(false); };
q<HTMLButtonElement>('#continue').onclick = () => { void startGame(true); };

function zoneAt(x: number, z: number) {
  if (Math.hypot(x + 27, z + 19) < 9) return LOCATIONS_LIST[0];
  if (Math.hypot(x + 7, z + 5) < 12.2) return LOCATIONS_LIST[1];
  if (x > 32 && z > 24) return LOCATIONS_LIST[4];
  if (x > 13) return LOCATIONS_LIST[3];
  return LOCATIONS_LIST[2];
}

function buildHotbar(): void {
  const classDef = CLASSES_MAP[player.classId];
  const hotbar = q<HTMLElement>('#hotbar');
  hotbar.innerHTML = '';
  classDef.skills.forEach((skill, index) => hotbar.insertAdjacentHTML('beforeend', `<button class="skill-button" data-skill="${index}"><span class="key">${index + 1}</span><span class="symbol">${skill.icon}</span><small>${skill.name}</small><i class="cooldown"></i></button>`));
  hotbar.insertAdjacentHTML('beforeend', '<button class="skill-button" data-attack><span class="key">ЛКМ</span><span class="symbol">⚔</span><small>Обычная атака</small></button>');
  qa<HTMLButtonElement>('[data-skill]').forEach((button) => { button.onclick = () => castSkill(Number(button.dataset.skill)); });
  q<HTMLButtonElement>('[data-attack]').onclick = basicAttack;
}

function rotateTowards(entity: Entity, targetX: number, targetZ: number): void {
  if (!entity.root) return;
  entity.root.rotation.y = Math.atan2(targetX - entity.x, targetZ - entity.z);
}

function rotateTowardsSmooth(entity: Entity, targetX: number, targetZ: number, dt: number): void {
  if (!entity.root) return;
  const desired = Math.atan2(targetX - entity.x, targetZ - entity.z);
  entity.root.rotation.y = smoothAngle(entity.root.rotation.y, desired, 9, dt);
}

function entityCollisionRadius(entity: Entity): number {
  if (entity.boss === 'big') return 1.2;
  if (entity.boss === 'mini') return 0.9;
  return entity.kind === 'player' ? 0.46 : 0.42;
}

function moveEntityWithCollision(entity: Entity, dx: number, dz: number, avoidStuck = false): boolean {
  const from = { x: entity.x, z: entity.z };
  let resolved = collisionWorld.resolve(from, { x: dx, z: dz }, entityCollisionRadius(entity));
  if (avoidStuck && resolved.blocked && Math.hypot(resolved.x - from.x, resolved.z - from.z) < 0.0001) {
    const direction = entity.uid.charCodeAt(entity.uid.length - 1) % 2 ? 1 : -1;
    resolved = collisionWorld.resolve(from, { x: -dz * direction, z: dx * direction }, entityCollisionRadius(entity));
  }
  entity.x = resolved.x;
  entity.z = resolved.z;
  syncEntityTransform(entity);
  return Math.hypot(entity.x - from.x, entity.z - from.z) > 0.0001;
}

function attackRange(): number {
  if (player.classId === 'ranger') return 12.5;
  if (player.classId === 'mage') return 8.5;
  if (player.classId === 'necro') return 9.5;
  return 2.6;
}

function resetPlayerControl(clearTarget = false): void {
  state.moveTarget = null;
  state.interactionTarget = null;
  combatControl.cancelPursuit();
  playerMotor.reset();
  if (clearTarget) {
    targeting.clear();
    setTargetOutline(outlinedTarget, false);
    outlinedTarget = null;
    targetIndicator.setEnabled(false);
  }
}

function enforcePlayerBoundary(): void {
  if (player.x > 13 && player.level < 10) {
    player.x = 12.9;
    state.moveTarget = null;
    combatControl.cancelPursuit();
    playerMotor.stopPlanar();
    if (!state.gateWarn) {
      toast('Чёрный лес откроется на 10 уровне', 'bad');
      state.gateWarn = 3;
    }
  }
}

let movementSequence = 0;
let movementIntentCooldown = 0;
let wasMovingManually = false;
function syncMovementIntent(direction: Readonly<{ x: number; z: number }> | null, dt: number): void {
  movementIntentCooldown = Math.max(0, movementIntentCooldown - dt);
  if (direction) {
    if (!wasMovingManually || movementIntentCooldown <= 0) {
      movementSequence += 1;
      void gateway.send({ type: 'move-intent', x: direction.x, z: direction.z, sequence: movementSequence });
      movementIntentCooldown = 0.12;
    }
    wasMovingManually = true;
  } else if (wasMovingManually) {
    movementSequence += 1;
    void gateway.send({ type: 'move-intent', x: 0, z: 0, sequence: movementSequence });
    wasMovingManually = false;
  }
}

let outlinedTarget: Entity | null = null;
function setTargetOutline(entity: Entity | null, enabled: boolean): void {
  // Never outline imported character meshes: some GLTFs contain helper geometry whose
  // silhouette is many times larger than the visible monster. That caused the red blob.
  entity?.root?.getChildMeshes().forEach((mesh) => { mesh.renderOutline = false; });
  void enabled;
}

function updateTargetIndicator(): void {
  const target = targeting.validate();
  if (outlinedTarget !== target) {
    setTargetOutline(outlinedTarget, false);
    outlinedTarget = target;
    setTargetOutline(outlinedTarget, false);
  }
  targetIndicator.setEnabled(false);
}

function update(dt: number): void {
  if (!state.started || state.paused) return;
  state.worldTime = 12.5; // current vertical slice is intentionally locked to readable daylight
  state.gateWarn = Math.max(0, state.gateWarn - dt);
  const hero = playerEntity();
  player.attackCd = Math.max(0, player.attackCd - dt);
  player.cooldowns = player.cooldowns.map((value) => Math.max(0, value - dt));
  state.playerBuffs.guard = Math.max(0, state.playerBuffs.guard - dt);
  state.playerBuffs.vanish = Math.max(0, state.playerBuffs.vanish - dt);
  player.mp = Math.min(player.maxMp, player.mp + player.maxMp * 0.022 * dt);

  const target = targeting.validate();
  const axes = inputControl.movementAxes();
  const manualMovement = Math.hypot(axes.forward, axes.strafe) > 0.0001;
  const combatDecision = combatControl.plan({
    player,
    target,
    basicRange: attackRange(),
    skillRange: () => attackRange(),
    canBasicAttack: player.attackCd <= 0,
    canUseSkill: (index) => player.cooldowns[index] <= 0 && player.mp >= (CLASSES_MAP[player.classId].skills[index]?.cost ?? Infinity),
  });

  let desiredDirection: Readonly<{ x: number; z: number }> = { x: 0, z: 0 };
  let maxMoveDistance = Infinity;
  if (manualMovement) {
    state.moveTarget = null;
    state.interactionTarget = null;
    combatControl.cancelPursuit();
    desiredDirection = cameraControl.movementDirection(axes);
    syncMovementIntent(desiredDirection, dt);
  } else {
    syncMovementIntent(null, dt);
    const destination = combatDecision.kind === 'approach' ? combatDecision : state.moveTarget;
    if (destination) {
      const dx = destination.x - player.x;
      const dz = destination.z - player.z;
      const distance = Math.hypot(dx, dz);
      if (distance < 0.18) {
        if (combatDecision.kind !== 'approach') state.moveTarget = null;
      } else {
        desiredDirection = { x: dx, z: dz };
        maxMoveDistance = distance;
      }
    }
    if (combatDecision.kind === 'attack') performAttack(combatDecision.skillIndex);
  }

  if (inputControl.consumeJump()) playerMotor.requestJump();
  const motion = playerMotor.step(desiredDirection, player.stats.speed, dt, maxMoveDistance);
  const resolvedPlayer = collisionWorld.resolve(player, { x: motion.dx, z: motion.dz }, 0.46);
  player.x = resolvedPlayer.x;
  player.z = resolvedPlayer.z;
  if (resolvedPlayer.blocked && Math.hypot(resolvedPlayer.x - hero.x, resolvedPlayer.z - hero.z) < 0.0001) playerMotor.stopPlanar();
  enforcePlayerBoundary();
  const moved = Math.hypot(player.x - hero.x, player.z - hero.z) > 0.001;
  if (moved && hero.root) {
    const desiredAngle = Math.atan2(motion.facingX, motion.facingZ);
    hero.root.rotation.y = smoothAngle(hero.root.rotation.y, desiredAngle, 16, dt);
    setEntityAction(hero, 'walk');
  } else if (hero.actionType === 'walk') setEntityAction(hero, 'idle');
  if (state.interactionTarget && Math.hypot(state.interactionTarget.x - player.x, state.interactionTarget.z - player.z) < 3.2) {
    const npc = state.interactionTarget;
    state.interactionTarget = null;
    state.moveTarget = null;
    interactNpc(npc);
  }
  hero.x = player.x;
  hero.z = player.z;
  syncEntityTransform(hero, motion.height);
  state.entities.filter((entity) => entity.kind === 'monster').forEach((entity) => updateMonster(entity, dt));
  state.entities.filter((entity) => entity.kind === 'summon').forEach((entity) => updateSummon(entity, dt));
  state.entities.filter((entity) => entity.kind === 'npc').forEach((entity) => updateTownNpc(entity, dt));
  state.entities.filter((entity) => entity.kind === 'ambient').forEach((entity) => updateAmbientResident(entity, dt));
  state.effects.forEach((effect) => effect.update(dt));
  state.effects = state.effects.filter((effect) => !effect.dead);
  updateTargetIndicator();
  state.bossTimers.mini = Math.max(0, state.bossTimers.mini - dt);
  state.bossTimers.big = Math.max(0, state.bossTimers.big - dt);
  updateHud();
}

function restoreEntityAfterRespawn(entity: Entity): void {
  entity.status = {};
  entity.attackCd = rand(0.25, 0.8);
  entity.animations.forEach((animation) => {
    animation.stop();
    animation.reset();
  });
  if (entity.root) {
    entity.root.scaling.copyFrom(entity.baseScale ?? Vector3.One());
    entity.root.rotation.x = 0;
    entity.root.rotation.z = 0;
    entity.root.setEnabled(true);
    entity.root.getChildMeshes().forEach((mesh) => {
      mesh.setEnabled(true);
      mesh.isVisible = true;
      if (mesh !== entity.label) mesh.visibility = 1;
      mesh.renderOutline = false;
    });
  }
  entity.actionType = undefined;
  entity.pickVolume?.setEnabled(true);
  syncEntityTransform(entity);
  refreshNameplate(entity);
  setEntityAction(entity, 'idle');
}

function updateMonster(entity: Entity, dt: number): void {
  if (!entity.alive) {
    entity.respawn -= dt;
    if (entity.respawn <= 0) {
      entity.alive = true;
      entity.hp = entity.maxHp;
      entity.atk = entity.baseAtk;
      entity.phase = 1;
      entity.x = entity.homeX ?? entity.x;
      entity.z = entity.homeZ ?? entity.z;
      const safeSpawn = collisionWorld.findNearestFree(entity, entityCollisionRadius(entity));
      entity.x = safeSpawn.x;
      entity.z = safeSpawn.z;
      entity.patrolPause = rand(0.2, 1.2);
      restoreEntityAfterRespawn(entity);
      if (entity.boss === 'big') {
        toast('Печать древнего владыки разрушена…');
        log('Регион: Хозяин Гнилого Леса пробудился.', 'combat');
      }
    }
    return;
  }
  entity.attackCd -= dt;
  for (const status of Object.keys(entity.status) as Array<keyof Statuses>) {
    entity.status[status] = Math.max(0, (entity.status[status] ?? 0) - dt);
    if (!entity.status[status]) delete entity.status[status];
  }
  const dx = player.x - entity.x;
  const dz = player.z - entity.z;
  const distance = Math.hypot(dx, dz);
  const safe = zoneAt(player.x, player.z).kind === 'safe' || state.playerBuffs.vanish > 0;
  if (!safe && distance < 9) {
    if (entity.status.stun) setEntityAction(entity, 'idle');
    else if (distance > 1.65) {
      const speed = monsterMovementSpeed(Boolean(entity.boss)) * (entity.status.slow ? 0.45 : 1);
      const moved = moveEntityWithCollision(entity, (dx / distance) * speed * dt, (dz / distance) * speed * dt, true);
      rotateTowardsSmooth(entity, player.x, player.z, dt);
      setEntityAction(entity, moved ? 'walk' : 'idle');
    } else if (entity.attackCd <= 0) {
      setEntityAction(entity, 'attack', true);
      entity.attackCd = entity.boss ? 1.45 : 2.05;
      window.setTimeout(() => {
        if (entity.alive && Math.hypot(player.x - entity.x, player.z - entity.z) < 2.3) {
          hurtPlayer(Math.max(1, Math.round((entity.atk ?? 1) - player.stats.def * 0.2)));
        }
      }, 280);
    }
  } else if (entity.patrol?.length) {
    entity.patrolPause = Math.max(0, (entity.patrolPause ?? 0) - dt);
    const index = entity.patrolIndex ?? 0;
    const waypoint = entity.patrol[index % entity.patrol.length];
    const pdx = waypoint.x - entity.x;
    const pdz = waypoint.z - entity.z;
    const patrolDistance = Math.hypot(pdx, pdz);
    if (patrolDistance < 0.55) {
      entity.patrolIndex = (index + 1) % entity.patrol.length;
      entity.patrolPause = rand(0.8, 2.4);
      setEntityAction(entity, 'idle');
    } else if ((entity.patrolPause ?? 0) <= 0) {
      const speed = monsterMovementSpeed(Boolean(entity.boss)) * 0.42;
      const moved = moveEntityWithCollision(entity, (pdx / patrolDistance) * speed * dt, (pdz / patrolDistance) * speed * dt, true);
      rotateTowardsSmooth(entity, waypoint.x, waypoint.z, dt);
      setEntityAction(entity, moved ? 'walk' : 'idle');
    } else setEntityAction(entity, 'idle');
  } else if (Math.hypot(entity.x - (entity.homeX ?? entity.x), entity.z - (entity.homeZ ?? entity.z)) > 7) {
    const homeX = entity.homeX ?? entity.x;
    const homeZ = entity.homeZ ?? entity.z;
    const moved = moveEntityWithCollision(entity, (homeX - entity.x) * dt * 0.35, (homeZ - entity.z) * dt * 0.35, true);
    rotateTowardsSmooth(entity, homeX, homeZ, dt);
    setEntityAction(entity, moved ? 'walk' : 'idle');
  } else setEntityAction(entity, 'idle');
  if (entity.status.dot && Math.random() < dt) damageMonster(entity, Math.max(2, Math.round(player.stats.matk * 0.08)), false, false);
}

function hurtPlayer(value: number): void {
  if (player.dead) return;
  const received = state.playerBuffs.guard > 0 ? Math.max(1, Math.round(value * 0.5)) : value;
  player.hp -= received;
  damageNumber(playerEntity(), `−${received}`, '#ef6666');
  pulseScreen('#7c101a');
  if (player.hp <= 0) die();
}

function die(): void {
  player.dead = true;
  player.hp = 0;
  resetPlayerControl(true);
  state.paused = true;
  const loss = Math.floor(player.xp * 0.05);
  player.xp = Math.max(0, player.xp - loss);
  confirmBox('Вы пали', `Потеряно ${loss} опыта текущего уровня. Уровень и предметы сохранены.`, () => {
    player.x = GREENFALL_SPAWN.x; player.z = GREENFALL_SPAWN.z; player.hp = player.maxHp; player.mp = player.maxMp; player.dead = false;
    playerEntity().root?.setEnabled(true); cameraControl.snap({ x: player.x, y: 0, z: player.z });
    state.paused = false; closeConfirm(); toast('Вы возродились в Гринфолле'); saveGame();
  }, false);
}

function basicAttack(): void {
  const target = targeting.validate();
  if (!target) return toast('Выберите живую цель', 'bad');
  state.moveTarget = null;
  state.interactionTarget = null;
  combatControl.engageBasic(target.uid);
}

function castSkill(index: number): void {
  const skill = CLASSES_MAP[player.classId].skills[index];
  if (!skill) return;
  if (player.cooldowns[index] > 0) return toast('Навык ещё восстанавливается', 'bad');
  if (player.mp < skill.cost) return toast(`Недостаточно: ${CLASSES_MAP[player.classId].resource}`, 'bad');
  if (skill.buff) {
    player.mp -= skill.cost;
    player.cooldowns[index] = skill.cd;
    state.playerBuffs[skill.buff as 'guard' | 'vanish'] = skill.buff === 'guard' ? 7 : 4;
    toast(skill.buff === 'guard' ? 'Последний рубеж: входящий урон снижен' : 'Вы растворяетесь в сумраке');
    impactEffect(entityWorldPosition(playerEntity()), Color3.FromHexString(skill.buff === 'guard' ? '#d3ad63' : '#7b46a8'));
    void gateway.send({ type: 'attack', entityId: 'self', skillIndex: index });
    return;
  }
  if (skill.summon) {
    player.mp -= skill.cost;
    player.cooldowns[index] = skill.cd;
    summonSkeleton();
    void gateway.send({ type: 'attack', entityId: 'summon', skillIndex: index });
    return;
  }
  const target = targeting.validate();
  if (!target) return toast('Выберите живую цель', 'bad');
  state.moveTarget = null;
  state.interactionTarget = null;
  combatControl.queueSkill(target.uid, index);
}

function performAttack(skillIndex: number | null): void {
  const target = targeting.validate();
  if (!target) return combatControl.cancelPursuit();
  const skill = skillIndex === null ? null : CLASSES_MAP[player.classId].skills[skillIndex];
  if (skillIndex !== null) {
    if (!skill || player.cooldowns[skillIndex] > 0 || player.mp < skill.cost) return;
    player.mp -= skill.cost;
    player.cooldowns[skillIndex] = skill.cd;
  } else if (player.attackCd > 0) return;
  const ranged = CLASSES_MAP[player.classId].ranged;
  player.attackCd = classCombatProfile(player.classId, player.level, player.stats).attackInterval;
  combatControl.completeAttack(skillIndex);
  const hero = playerEntity();
  rotateTowards(hero, target.x, target.z);
  setEntityAction(hero, 'attack', true);
  window.setTimeout(() => {
    if (!player.dead && hero.actionType === 'attack') setEntityAction(hero, 'idle');
  }, 460);
  playSfx(skill?.fx ?? 'attack');
  const magic = player.classId === 'mage' || player.classId === 'necro';
  const base = magic ? player.stats.matk : rand(player.stats.atkMin, player.stats.atkMax);
  const multiplier = skill?.mul ?? (player.classId === 'mage' ? 0.68 : player.classId === 'necro' ? 0.76 : 1);
  const critical = Math.random() < player.stats.crit / 100;
  const damage = Math.max(1, Math.round(base * multiplier * (critical ? classCombatProfile(player.classId, player.level, player.stats).critMultiplier : 1)));
  void gateway.send({ type: 'attack', entityId: target.uid, skillIndex });
  const basicFx = player.classId === 'mage' ? 'arcane' : player.classId === 'necro' ? 'bone' : ranged ? 'arrow' : 'slash';
  spawnAttackEffect(skill?.fx ?? basicFx, hero, target, () => {
    let victims = [target];
    if (skill?.aoe) victims = state.entities.filter((entity) => entity.kind === 'monster' && entity.alive && Math.hypot(entity.x - target.x, entity.z - target.z) < (skill.aoe ?? 0));
    victims.forEach((entity, index) => damageMonster(entity, Math.round(damage * (index ? 0.72 : 1)), critical && index === 0));
    if (skill?.chain) {
      const struck = new Set<string>([target.uid]);
      let chainFrom = target;
      for (let hop = 1; hop < skill.chain; hop += 1) {
        const next = state.entities
          .filter((entity) => entity.kind === 'monster' && entity.alive && !struck.has(entity.uid)
            && Math.hypot(entity.x - chainFrom.x, entity.z - chainFrom.z) <= 7.2)
          .sort((a, b) => Math.hypot(a.x - chainFrom.x, a.z - chainFrom.z) - Math.hypot(b.x - chainFrom.x, b.z - chainFrom.z))[0];
        if (!next) break;
        struck.add(next.uid);
        const chainDamage = Math.max(1, Math.round(damage * Math.pow(0.68, hop)));
        const previous = chainFrom;
        spawnAttackEffect('lightning', previous, next, () => damageMonster(next, chainDamage, false, false));
        chainFrom = next;
      }
    }
    if (skill?.dot) target.status.dot = skill.dot;
    if (skill?.slow) target.status.slow = skill.slow;
    if (skill?.stun) target.status.stun = skill.stun;
    if (skill?.knock && target.root) {
      const dx = target.x - player.x; const dz = target.z - player.z; const distance = Math.max(0.001, Math.hypot(dx, dz));
      moveEntityWithCollision(target, (dx / distance) * skill.knock, (dz / distance) * skill.knock, true);
    }
    if (skill?.leech) player.hp = Math.min(player.maxHp, player.hp + Math.round(damage * skill.leech));
    if (skill?.summon) summonSkeleton();
  });
}

function entityWorldPosition(entity: Entity, height = 1.4): Vector3 {
  return new Vector3(entity.x, height, entity.z);
}

function spawnAttackEffect(type: string, from: Entity, to: Entity, onHit?: () => void): void {
  const colors: Record<string, Color3> = {
    fire: new Color3(1, 0.2, 0.04), ice: new Color3(0.25, 0.75, 1), arrow: new Color3(0.8, 0.7, 0.45), arcane: new Color3(0.46, 0.64, 1),
    bone: new Color3(0.85, 0.82, 0.7), drain: new Color3(0.15, 0.9, 0.55), curse: new Color3(0.52, 0.12, 0.9),
    lightning: new Color3(0.35, 0.75, 1), poison: new Color3(0.35, 0.85, 0.2), slash: new Color3(0.9, 0.65, 0.25),
  };
  const start = entityWorldPosition(from);
  const end = entityWorldPosition(to);
  const projectile = MeshBuilder.CreateSphere(`effect-${type}-${uid()}`, { diameter: type === 'arrow' ? 0.12 : type === 'arcane' ? 0.22 : 0.28, segments: 8 }, scene);
  const material = new StandardMaterial(`effect-material-${uid()}`, scene);
  material.emissiveColor = colors[type] ?? colors.slash;
  material.disableLighting = true;
  projectile.material = material;
  projectile.position.copyFrom(start);
  projectile.isPickable = false;
  glow.addIncludedOnlyMesh(projectile);
  let life = 0;
  const duration = type === 'slash' ? 0.18 : 0.28;
  state.effects.push({ update(dt) {
    life += dt;
    projectile.position.copyFrom(Vector3.Lerp(start, end, clamp(life / duration, 0, 1)));
    projectile.scaling.setAll(1 + Math.sin(life * 30) * 0.22);
    if (life >= duration) {
      this.dead = true;
      projectile.dispose(false, true);
      onHit?.();
      impactEffect(end, material.emissiveColor);
    }
  } });
}

function impactEffect(position: Vector3, color: Color3): void {
  // Compact contact spark only. No torus, expanding decal or emissive surface.
  const spark = MeshBuilder.CreateSphere(`impact-${uid()}`, { diameter: 0.12, segments: 6 }, scene);
  const material = new StandardMaterial(`impact-material-${uid()}`, scene);
  material.emissiveColor = color.scale(0.55);
  material.diffuseColor = color.scale(0.35);
  material.alpha = 0.58;
  spark.material = material;
  spark.position.copyFrom(position);
  spark.isPickable = false;
  let life = 0;
  state.effects.push({ update(dt) {
    life += dt;
    spark.scaling.setAll(1 + life * 2.4);
    material.alpha = Math.max(0, 0.58 - life * 4.8);
    if (life > 0.12) { this.dead = true; spark.dispose(false, true); }
  } });
}

function damageMonster(entity: Entity, damage: number, critical = true, showEffect = true): void {
  if (!entity.alive) return;
  entity.hp = (entity.hp ?? 0) - damage;
  if (entity.boss === 'big') {
    const ratio = (entity.hp ?? 0) / Math.max(1, entity.maxHp ?? 1);
    const nextPhase = ratio <= 0.3 ? 3 : ratio <= 0.65 ? 2 : 1;
    if (nextPhase > (entity.phase ?? 1)) {
      entity.phase = nextPhase;
      entity.atk = Math.round((entity.baseAtk ?? 1) * (1 + (nextPhase - 1) * 0.32));
      entity.root?.scaling.scaleInPlace(1.08);
      toast(nextPhase === 2 ? 'Владыка разрывает корни земли!' : 'Владыка входит в кровавую ярость!');
      log(`Pit Boss: началась фаза ${nextPhase}.`, 'combat');
      for (let index = 0; index < nextPhase + 1; index += 1) {
        const angle = (index / (nextPhase + 1)) * Math.PI * 2;
        spawnMonster(nextPhase === 2 ? 'wraith' : 'bat', entity.x + Math.cos(angle) * 4, entity.z + Math.sin(angle) * 4);
      }
    }
  }
  refreshNameplate(entity);
  damageNumber(entity, `${critical ? 'КРИТ ' : ''}−${damage}`, critical ? '#ffd36b' : '#f1e9da', critical);
  if (showEffect) impactEffect(entityWorldPosition(entity), Color3.FromHexString(`#${(entity.tint ?? 0xaa6655).toString(16).padStart(6, '0')}`));
  if ((entity.hp ?? 0) <= 0) killMonster(entity);
}

function killMonster(entity: Entity): void {
  entity.alive = false;
  entity.pickVolume?.setEnabled(false);
  setEntityAction(entity, 'death', true);
  window.setTimeout(() => entity.root?.setEnabled(false), 650);
  const definition = MONSTERS_MAP[entity.id ?? 'wolf'];
  entity.respawn = definition.boss ? bossRespawnSeconds(definition.boss) : rand(28, 48);
  if (definition.boss) state.bossTimers[definition.boss] = entity.respawn;
  state.kills += 1;
  if (definition.boss) state.bossKills += 1;
  gainXp(definition.xp);
  const gold = rint(definition.gold[0], definition.gold[1]);
  player.gold += gold;
  log(`${definition.name} повержен: +${definition.xp} опыта, +${gold} золота.`, 'combat');
  definition.drops.forEach(([id, chance]) => { if (Math.random() < chance) addItem(id); });
  combatControl.targetRemoved(entity.uid);
  if (targeting.isSelected(entity)) targeting.clear();
  if (state.quest === 1 && state.kills >= 8) state.quest = 2;
  if (state.quest === 2 && definition.boss === 'mini') state.quest = 3;
  if (state.quest === 3 && definition.boss === 'big') state.quest = 4;
  updateQuest();
  saveGame();
}

function gainXp(value: number): void {
  const result = applyExperience(player.level, player.xp, value);
  player.level = result.level;
  player.xp = result.xp;
  if (result.levelsGained > 0) {
    recalculate(true);
    toast(`Достигнут уровень ${player.level}`);
    log(`Новый уровень: ${player.level}.`, 'loot');
  }
}

function addItem(id: string, count = 1): void {
  const definition = ITEMS_MAP[id];
  const item = makeItem(id, 0, count);
  const result = addOrStackItem(player.inventory, item, !definition.slot);
  if (result === 'full') {
    state.lootBuffer.push(item);
    toast('Сумка полна — добыча сохранена в буфере', 'bad');
    return;
  }
  playSfx('loot');
  toast(`Получено: ${definition.name}${count > 1 ? ` ×${count}` : ''}`);
  log(`Получено: ${definition.name}.`, 'loot');
}

function summonSkeleton(): void {
  const summon = makeEntity({ kind: 'summon', name: 'Призванный страж', model: 'Skeleton', x: player.x + 1.2, z: player.z + 1.2, targetHeight: 1.8 });
  createEntityModel(summon);
  state.entities.push(summon);
  toast('Костяной страж служит вам 20 секунд');
  window.setTimeout(() => {
    summon.root?.dispose(false, true);
    const index = state.entities.indexOf(summon);
    if (index >= 0) state.entities.splice(index, 1);
  }, 20_000);
}

function updateSummon(summon: Entity, dt: number): void {
  summon.attackCd -= dt;
  const target = state.entities
    .filter((entity) => entity.kind === 'monster' && entity.alive)
    .sort((a, b) => Math.hypot(a.x - summon.x, a.z - summon.z) - Math.hypot(b.x - summon.x, b.z - summon.z))[0];
  if (!target) return setEntityAction(summon, 'idle');
  const dx = target.x - summon.x; const dz = target.z - summon.z; const distance = Math.hypot(dx, dz);
  if (distance > 1.8) {
    const moved = moveEntityWithCollision(summon, (dx / distance) * 3.6 * dt, (dz / distance) * 3.6 * dt, true);
    rotateTowardsSmooth(summon, target.x, target.z, dt); setEntityAction(summon, moved ? 'walk' : 'idle');
  } else if (summon.attackCd <= 0) {
    summon.attackCd = 1.25; rotateTowards(summon, target.x, target.z); setEntityAction(summon, 'attack', true);
    damageMonster(target, Math.max(5, Math.round(player.stats.matk * 0.3)), false);
  }
}

const AMBIENT_ACTIVITY_LOOK: Record<AmbientWaypoint['activity'], Readonly<{ x: number; z: number }>> = {
  warm: { x: -7, z: -5.4 },
  trade: { x: -1.0, z: -4.2 },
  work: { x: -12.6, z: -5.2 },
  guard: { x: -7, z: -15.5 },
  talk: { x: -7, z: -1.0 },
};

function updateTownNpc(entity: Entity, dt: number): void {
  if (entity.role !== 'smith') return;
  const anvil = { x: -12.6, z: -5.2 };
  rotateTowardsSmooth(entity, anvil.x, anvil.z, dt);
  entity.npcActionTimer = (entity.npcActionTimer ?? 0.5) - dt;
  if (entity.npcActionTimer <= 0) {
    setEntityAction(entity, 'attack', true);
    entity.npcActionTimer = rand(1.7, 2.6);
    window.setTimeout(() => {
      if (entity.alive && entity.role === 'smith' && entity.actionType === 'attack') setEntityAction(entity, 'idle');
    }, 620);
  }
}

function updateAmbientResident(entity: Entity, dt: number): void {
  const decision = entity.ambientBrain?.update(dt, entity);
  if (!decision) return;
  entity.ambientActivity = decision.waypoint.activity;
  if (decision.state === 'walk') {
    const dx = decision.waypoint.x - entity.x;
    const dz = decision.waypoint.z - entity.z;
    const distance = Math.max(0.0001, Math.hypot(dx, dz));
    const step = Math.min(distance, 1.15 * dt);
    const moved = moveEntityWithCollision(entity, (dx / distance) * step, (dz / distance) * step, true);
    if (!moved) {
      const free = collisionWorld.findNearestFree(decision.waypoint, 0.34);
      const fdx = free.x - entity.x;
      const fdz = free.z - entity.z;
      const freeDistance = Math.max(0.0001, Math.hypot(fdx, fdz));
      moveEntityWithCollision(entity, (fdx / freeDistance) * Math.min(freeDistance, 0.72 * dt), (fdz / freeDistance) * Math.min(freeDistance, 0.72 * dt), true);
    }
    rotateTowardsSmooth(entity, decision.waypoint.x, decision.waypoint.z, dt);
    setEntityAction(entity, moved ? 'walk' : 'idle');
    return;
  }
  const look = AMBIENT_ACTIVITY_LOOK[decision.waypoint.activity];
  rotateTowardsSmooth(entity, look.x, look.z, dt);
  if (decision.state === 'activity' && decision.changed && decision.waypoint.activity === 'work') {
    setEntityAction(entity, 'attack', true);
    window.setTimeout(() => {
      if (entity.alive && entity.actionType === 'attack') setEntityAction(entity, 'idle');
    }, 620);
  } else if (entity.actionType === 'walk') setEntityAction(entity, 'idle');
}

function projectEntity(entity: Entity): { x: number; y: number } {
  const viewport = camera.viewport.toGlobal(engine.getRenderWidth(), engine.getRenderHeight());
  const projected = Vector3.Project(entityWorldPosition(entity, entity.targetHeight + 0.6), Matrix.IdentityReadOnly, scene.getTransformMatrix(), viewport);
  const rect = canvas.getBoundingClientRect();
  return {
    x: rect.left + projected.x * (rect.width / engine.getRenderWidth()),
    y: rect.top + projected.y * (rect.height / engine.getRenderHeight()),
  };
}

function damageNumber(entity: Entity, text: string, color: string, critical = false): void {
  if (!state.settings.damage) return;
  const point = projectEntity(entity);
  const node = document.createElement('span');
  node.className = `damage-number${critical ? ' crit' : ''}`;
  node.textContent = text;
  node.style.left = `${point.x}px`;
  node.style.top = `${point.y}px`;
  node.style.color = color;
  q('#damage-layer').append(node);
  window.setTimeout(() => node.remove(), 950);
}

function pulseScreen(color: string): void {
  if (!state.settings.screenShake) return;
  const overlay = document.createElement('div');
  overlay.className = 'screen-pulse';
  overlay.style.boxShadow = `inset 0 0 100px ${color}`;
  document.body.append(overlay);
  window.setTimeout(() => overlay.remove(), 260);
}

function initAudio(): void {
  if (audioContext) return;
  audioContext = new AudioContext();
  ambientGain = audioContext.createGain();
  ambientGain.gain.value = state.settings.music * 0.018;
  ambientGain.connect(audioContext.destination);
  const oscillator = audioContext.createOscillator();
  oscillator.type = 'sine';
  oscillator.frequency.value = 55;
  oscillator.connect(ambientGain);
  oscillator.start();
}

function playSfx(type: string): void {
  if (!audioContext || state.settings.sfx <= 0) return;
  const oscillator = audioContext.createOscillator();
  const gain = audioContext.createGain();
  const frequencies: Record<string, number> = { attack: 140, slash: 180, fire: 320, ice: 520, lightning: 760, loot: 620 };
  oscillator.type = type === 'lightning' ? 'sawtooth' : 'triangle';
  oscillator.frequency.value = frequencies[type] ?? 240;
  gain.gain.setValueAtTime(0.06 * state.settings.sfx, audioContext.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, audioContext.currentTime + 0.18);
  oscillator.connect(gain).connect(audioContext.destination);
  oscillator.start(); oscillator.stop(audioContext.currentTime + 0.19);
}

function updateHud(): void {
  if (!player.stats) return;
  q('#player-name').textContent = player.name;
  q('#player-class').textContent = `${CLASSES_MAP[player.classId].name} · ур. ${player.level}`;
  q('#portrait').textContent = CLASSES_MAP[player.classId].skills[0].icon;
  q('#gold').textContent = player.gold.toLocaleString('ru-RU');
  (q<HTMLElement>('#hp-fill')).style.width = `${clamp(player.hp / Math.max(1, player.maxHp), 0, 1) * 100}%`;
  (q<HTMLElement>('#mp-fill')).style.width = `${clamp(player.mp / Math.max(1, player.maxMp), 0, 1) * 100}%`;
  (q<HTMLElement>('#xp-fill')).style.width = `${clamp(player.xp / Math.max(1, xpNeeded(player.level)), 0, 1) * 100}%`;
  q('#hp-text').textContent = `${Math.ceil(player.hp)} / ${player.maxHp}`;
  q('#mp-text').textContent = `${Math.ceil(player.mp)} / ${player.maxMp}`;
  const potionCount = countItem('potion');
  const etherCount = countItem('ether');
  q('#potion-count').textContent = String(potionCount);
  q('#ether-count').textContent = String(etherCount);
  q('#potion-key').textContent = keyLabel(state.settings.keybinds.potion);
  q('#ether-key').textContent = keyLabel(state.settings.keybinds.ether);
  const potionButton = q<HTMLButtonElement>('#potion');
  const etherButton = q<HTMLButtonElement>('#ether');
  potionButton.disabled = potionCount <= 0;
  etherButton.disabled = etherCount <= 0;
  potionButton.title = `Багровое зелье · ${keyLabel(state.settings.keybinds.potion)}`;
  etherButton.title = `Эфирное зелье · ${keyLabel(state.settings.keybinds.ether)}`;
  const targetFrame = q('#target-frame');
  const target = targeting.validate();
  if (target) {
    targetFrame.classList.remove('hidden');
    q('#target-name').textContent = target.name ?? '';
    q('#target-meta').textContent = `ур. ${target.level} · ${combatControl.isEngagedWith(target.uid) ? 'атака' : 'выбрана'}`;
    q('#boss-mark').textContent = target.boss ? '☠' : '';
    (q<HTMLElement>('#target-fill')).style.width = `${clamp((target.hp ?? 0) / Math.max(1, target.maxHp ?? 1), 0, 1) * 100}%`;
    q('#target-hp').textContent = `${Math.max(0, Math.ceil(target.hp ?? 0))} / ${target.maxHp}`;
  } else targetFrame.classList.add('hidden');
  q('#zone').textContent = zoneAt(player.x, player.z).name;
  const hours = Math.floor(state.worldTime);
  const minutes = Math.floor((state.worldTime % 1) * 60);
  q('#clock').textContent = `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
  q('#mini-timer').textContent = formatTimer(state.bossTimers.mini);
  q('#big-timer').textContent = formatTimer(state.bossTimers.big);
  qa<HTMLElement>('[data-skill]').forEach((button) => {
    const index = Number(button.dataset.skill);
    const cooldown = button.querySelector<HTMLElement>('.cooldown');
    if (cooldown) cooldown.textContent = player.cooldowns[index] > 0 ? player.cooldowns[index].toFixed(1) : '';
  });
  drawMinimap();
}

function formatTimer(seconds: number): string {
  if (seconds <= 0) return 'жив';
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);
  return hours ? `${hours}ч ${String(minutes).padStart(2, '0')}м` : `${minutes}:${String(secs).padStart(2, '0')}`;
}

function drawMinimap(): void {
  const minimap = q<HTMLCanvasElement>('#minimap');
  const context = minimap.getContext('2d');
  if (!context) return;
  context.clearRect(0, 0, minimap.width, minimap.height);
  const gradient = context.createRadialGradient(214, 164, 15, 214, 164, 210);
  gradient.addColorStop(0, '#3c493a'); gradient.addColorStop(1, '#121a17');
  context.fillStyle = gradient; context.fillRect(0, 0, minimap.width, minimap.height);
  const mapX = (x: number) => ((x + 52) / 104) * minimap.width;
  const mapY = (z: number) => ((z + 45) / 90) * minimap.height;
  context.strokeStyle = '#847252'; context.lineWidth = 4; context.beginPath();
  context.moveTo(mapX(-32), mapY(-22)); context.lineTo(mapX(-7), mapY(-5)); context.lineTo(mapX(14), mapY(5)); context.lineTo(mapX(40), mapY(31)); context.stroke();
  for (const entity of state.entities) {
    if (entity.kind !== 'monster' || !entity.alive) continue;
    context.fillStyle = entity.boss ? '#ffb24f' : '#a93d3d';
    context.beginPath(); context.arc(mapX(entity.x), mapY(entity.z), entity.boss ? 5 : 2, 0, Math.PI * 2); context.fill();
  }
  context.fillStyle = '#5fd8ff'; context.beginPath(); context.arc(mapX(player.x), mapY(player.z), 5, 0, Math.PI * 2); context.fill();
}

function updateQuest(): void {
  const entries: Array<[string, string, number]> = [
    ['Голос границы', 'Поговорите со старостой Гринфолла.', 0],
    ['Кровь на дороге', `Победите тварей рубежа: ${Math.min(state.kills, 8)} / 8`, state.kills / 8],
    ['Вой стаи', 'Отыщите Кровавого Оборотня в Чёрном лесу.', 0.2],
    ['Печать владыки', 'Спуститесь к шахте и победите Хозяина Гнилого Леса.', 0.55],
    ['Первый след', 'Вертикальный срез пройден. Продолжайте охоту и заточку.', 1],
  ];
  const current = entries[state.quest] ?? entries[0];
  q('#quest-title').textContent = current[0];
  q('#quest-text').textContent = current[1];
  (q<HTMLElement>('#quest-progress')).style.width = `${clamp(current[2], 0, 1) * 100}%`;
}

window.addEventListener('keydown', (event) => {
  if ((event.target as Element)?.matches('input, textarea, select, [contenteditable="true"]')) return;
  if (!state.started) return;
  if (['1', '2', '3', '4'].includes(event.key)) castSkill(Number(event.key) - 1);
  const consumableAction = consumableActionForCode(state.settings.keybinds, event.code);
  if (consumableAction) {
    event.preventDefault();
    useItem(consumableAction);
  }
  const key = event.key.toLowerCase();
  if (key === 'i') openWindow('inventory');
  if (key === 'c') openWindow('character');
  if (key === 'k') openWindow('skills');
  if (key === 'm') openWindow('map');
  if (event.key === 'Escape') openWindow('settings');
  if (event.key === 'Enter') q<HTMLInputElement>('#chat').focus();
});

canvas.addEventListener('pointerdown', (event) => {
  if (event.button !== 0 || !state.started || state.paused) return;
  const pick = scene.pick(event.offsetX, event.offsetY, (mesh) => mesh.isPickable);
  if (!pick?.hit || !pick.pickedPoint) return;
  let mesh: AbstractMesh | null = pick.pickedMesh;
  let entity: Entity | undefined;
  while (mesh && !entity) {
    entity = (mesh.metadata as { entity?: Entity } | null)?.entity;
    mesh = mesh.parent as AbstractMesh | null;
  }
  if (entity) {
    if (entity.kind === 'monster') {
      targeting.select(entity);
      combatControl.engageBasic(entity.uid);
      state.moveTarget = null;
      state.interactionTarget = null;
      void gateway.send({ type: 'target', entityId: entity.uid });
      return;
    }
    if (entity.kind === 'npc') {
      combatControl.cancelPursuit();
      const distance = Math.hypot(entity.x - player.x, entity.z - player.z);
      if (distance < 3.2) interactNpc(entity);
      else {
        state.interactionTarget = entity;
        state.moveTarget = { x: entity.x, z: entity.z };
      }
      return;
    }
  }
  if ((pick.pickedMesh?.metadata as { ground?: boolean } | null)?.ground) {
    state.moveTarget = { x: pick.pickedPoint.x, z: pick.pickedPoint.z };
    state.interactionTarget = null;
    combatControl.cancelPursuit();
    void gateway.send({ type: 'move', x: pick.pickedPoint.x, z: pick.pickedPoint.z });
  }
});

function interactNpc(npc: Entity): void {
  void gateway.send({ type: 'npc', role: npc.role ?? '' });
  if (npc.role === 'elder') {
    state.quest = Math.max(1, state.quest); updateQuest();
    openDialog(npc, 'За стенами снова слышен вой. Восемь тварей — и я поверю, что ты способен пережить эту ночь.', [{ label: 'Я очищу дорогу', action: closeWindow }]);
  }
  if (npc.role === 'shop') openShop();
  if (npc.role === 'smith') openForge();
  if (npc.role === 'teleport') openTeleport();
}

function openWindow(type: string): void {
  if (!state.started) return;
  state.paused = true;
  q('#modal-root').innerHTML = '<div class="modal-shade"></div><section class="window"><button class="close-window">×</button><div id="window-content"></div></section>';
  q<HTMLButtonElement>('.close-window').onclick = closeWindow;
  q<HTMLElement>('.modal-shade').onclick = closeWindow;
  if (type === 'inventory') renderInventory();
  if (type === 'character') renderCharacter();
  if (type === 'skills') renderSkills();
  if (type === 'map') renderMap();
  if (type === 'settings') renderSettings();
  qa<HTMLElement>('[data-window]').forEach((button) => button.classList.toggle('active', button.dataset.window === type));
}

function closeWindow(): void {
  state.paused = false; q('#modal-root').innerHTML = '';
  qa('[data-window]').forEach((button) => button.classList.remove('active')); canvas.focus();
}

function tabs(active: string): string {
  return `<div class="tabs">${[['character', 'Персонаж'], ['inventory', 'Инвентарь'], ['skills', 'Навыки'], ['map', 'Карта'], ['settings', 'Настройки']].map(([id, name]) => `<button class="tab ${active === id ? 'active' : ''}" data-goto="${id}">${name}</button>`).join('')}</div>`;
}
function bindTabs(): void { qa<HTMLButtonElement>('[data-goto]').forEach((button) => { button.onclick = () => openWindow(button.dataset.goto ?? 'character'); }); }
function formatItem(item: ItemInstance): string {
  const definition = itemDef(item);
  return `<span><span class="big-icon">${definition.icon}${item.plus ? ` <small>+${item.plus}</small>` : ''}</span>${definition.name}</span>${item.count > 1 ? `<span class="count">${item.count}</span>` : ''}`;
}

function renderInventory(selected = state.selectedItem): void {
  q('#window-content').innerHTML = `<h2>Инвентарь</h2>${tabs('inventory')}<div class="inventory-layout"><div class="doll"><div class="doll-art"></div>${EQUIPMENT_SLOTS.map((slot) => `<button class="equip-slot ${player.equipment[slot] ? 'filled' : ''}" data-equip="${slot}" data-slot="${slot}">${player.equipment[slot] ? formatItem(player.equipment[slot] as ItemInstance) : SLOT_NAMES_MAP[slot]}</button>`).join('')}</div><div><div class="bag-head"><b>Сумка</b><span>${player.inventory.length} / ${INVENTORY_CAPACITY} · ◈ ${player.gold.toLocaleString()} ${state.lootBuffer.length ? `· Буфер: ${state.lootBuffer.length} <button class="dark-btn" id="collect-buffer">Забрать</button>` : ''}</span></div><div class="bag-grid">${player.inventory.map((item, index) => `<button class="item-card ${index === selected ? 'selected' : ''}" data-item="${index}">${formatItem(item)}</button>`).join('')}${Array(Math.max(0, INVENTORY_CAPACITY - player.inventory.length)).fill('<div class="item-card"></div>').join('')}</div><div class="item-details" id="item-details">Выберите предмет. Все вещи можно надевать с любого уровня.</div></div></div>`;
  bindTabs();
  qa<HTMLButtonElement>('[data-item]').forEach((button) => { button.onclick = () => selectItem(Number(button.dataset.item)); });
  qa<HTMLButtonElement>('[data-equip]').forEach((button) => { button.onclick = () => unequip(button.dataset.equip ?? ''); });
  const collect = document.querySelector<HTMLButtonElement>('#collect-buffer');
  if (collect) collect.onclick = () => { while (state.lootBuffer.length && player.inventory.length < INVENTORY_CAPACITY) player.inventory.push(state.lootBuffer.shift() as ItemInstance); renderInventory(); saveGame(); };
}

function selectItem(index: number): void {
  state.selectedItem = index; renderInventory(index);
  const item = player.inventory[index]; const definition = itemDef(item); const parts: string[] = [];
  const slot = definition.slot === 'ring' ? 'ring1' : definition.slot;
  const current = slot ? player.equipment[slot] : undefined;
  if (definition.atk) parts.push(`Урон ${definition.atk[0]}–${definition.atk[1]}`);
  if (definition.matk) parts.push(`Магическая атака +${definition.matk}`);
  if (definition.def) parts.push(`Защита +${definition.def}`);
  if (definition.mdef) parts.push(`Магическая защита +${definition.mdef}`);
  const compare = definition.slot ? `<br><span style="color:#c4a876">Надето: ${current ? `${itemDef(current).name}${current.plus ? ` +${current.plus}` : ''}` : 'ничего'}</span>` : '';
  q('#item-details').innerHTML = `<b>${definition.name}${item.plus ? ` +${item.plus}` : ''}</b><br>${parts.join(' · ') || definition.desc || 'Ресурс мира'}${compare}<br><span style="color:#8f887c">Источник: ${definition.origin || 'Торговцы Варендора'}</span><div class="action-row">${definition.slot ? '<button class="gold-btn" id="equip-item">Надеть</button>' : ''}${definition.type === 'consumable' ? '<button class="gold-btn" id="use-item">Использовать</button>' : ''}<button class="dark-btn" id="sell-item">Продать за ${Math.floor(definition.value * 0.48)} ◈</button></div>`;
  const equip = document.querySelector<HTMLButtonElement>('#equip-item'); if (equip) equip.onclick = () => equipItem(index);
  const use = document.querySelector<HTMLButtonElement>('#use-item'); if (use) use.onclick = () => { useItem(item.id); renderInventory(); };
  q<HTMLButtonElement>('#sell-item').onclick = () => sellItem(index);
}

function equipItem(index: number): void {
  const item = player.inventory[index]; const definition = itemDef(item); const itemSlot = definition.slot;
  if (!itemSlot) return;
  const slot = equipmentSlot(itemSlot, player.equipment);
  if (player.equipment[slot]) player.inventory.push(player.equipment[slot] as ItemInstance);
  player.equipment[slot] = item; player.inventory.splice(index, 1); state.selectedItem = null;
  void gateway.send({ type: 'equip', itemUid: item.uid, slot });
  recalculate(); renderInventory(); toast(`Надето: ${definition.name}`); saveGame();
}

function unequip(slot: string): void {
  const item = player.equipment[slot]; if (!item || player.inventory.length >= INVENTORY_CAPACITY) return;
  player.inventory.push(item); delete player.equipment[slot]; recalculate(); renderInventory(); saveGame();
}

function sellItem(index: number): void {
  const item = player.inventory[index]; const definition = itemDef(item);
  player.gold += Math.floor(definition.value * 0.48) * item.count; player.inventory.splice(index, 1); state.selectedItem = null;
  renderInventory(); updateHud(); saveGame();
}

function renderCharacter(): void {
  const s = player.stats; const classDef = CLASSES_MAP[player.classId];
  const rows: Array<[string, string | number]> = [['Уровень', player.level], ['Опыт', `${player.xp.toLocaleString()} / ${xpNeeded(player.level).toLocaleString()}`], ['Сила', s.str], ['Ловкость', s.dex], ['Интеллект', s.int], ['Выносливость', s.vit], ['Дух', s.spi], ['Физическая атака', `${Math.floor(s.atkMin)}–${Math.floor(s.atkMax)}`], ['Магическая атака', Math.floor(s.matk)], ['Физическая защита', Math.floor(s.def)], ['Магическая защита', Math.floor(s.mdef)], ['Критический шанс', `${s.crit.toFixed(1)}%`], ['Точность', s.accuracy.toFixed(1)], ['Уклонение', s.evasion.toFixed(1)], ['Скорость движения', s.speed.toFixed(1)], ['Побеждено боссов', state.bossKills]];
  q('#window-content').innerHTML = `<h2>${player.name} · ${classDef.name}</h2>${tabs('character')}<div class="stat-columns"><section><h3>Основные параметры</h3>${rows.slice(0, 8).map(([name, value]) => `<div class="stat-row"><span>${name}</span><b>${value}</b></div>`).join('')}</section><section><h3>Боевые параметры</h3>${rows.slice(8).map(([name, value]) => `<div class="stat-row"><span>${name}</span><b>${value}</b></div>`).join('')}</section></div><p style="color:#9c9488;margin-top:22px">Экипировка не имеет требований уровня. Её ценность определяется источником, фиксированными характеристиками и рисковой заточкой.</p><button class="danger-btn" id="reset-save">Удалить персонажа</button>`;
  bindTabs();
  q<HTMLButtonElement>('#reset-save').onclick = () => confirmBox('Удалить персонажа?', 'Весь локальный прогресс будет удалён без восстановления.', () => { void gateway.clear().then(() => window.location.reload()); });
}

function renderSkills(): void {
  const classDef = CLASSES_MAP[player.classId];
  q('#window-content').innerHTML = `<h2>Навыки · ${classDef.name}</h2>${tabs('skills')}<div class="skill-tree">${classDef.skills.map((skill, index) => `<div class="skill-node"><div class="node-icon">${skill.icon}</div><div><b>${index + 1}. ${skill.name}</b><p>Расход: ${skill.cost} ${classDef.resource.toLowerCase()} · Перезарядка: ${skill.cd} сек.</p><span>${skill.mul ? `Сила: ${Math.round(skill.mul * 100)}%` : 'Тактический эффект'}${skill.aoe ? ` · Область ${skill.aoe} м` : ''}${skill.dot ? ' · Урон со временем' : ''}</span></div></div>`).join('')}</div>`;
  bindTabs();
}

function renderMap(): void {
  q('#window-content').innerHTML = `<h2>Карта Варендора</h2>${tabs('map')}<div class="map-large"><div class="map-road" style="left:11%;top:68%;width:75%;transform:rotate(-27deg)"></div>${LOCATIONS_LIST.map((location, index) => `<button class="map-node" style="left:${12 + index * 19}%;top:${76 - index * 13}%"><b>${location.name}</b><small>${location.level}</small><br><span>${location.desc}</span></button>`).join('')}</div>`;
  bindTabs();
}

function renderSettings(): void {
  const s = state.settings;
  const bindingOptions = (selected: string): string => CONSUMABLE_KEY_OPTIONS
    .map((option) => `<option value="${option.code}" ${option.code === selected ? 'selected' : ''}>${option.label}</option>`)
    .join('');
  q('#window-content').innerHTML = `<h2>Настройки</h2>${tabs('settings')}<div class="settings-grid"><section><h3>Графика</h3><div class="setting"><label>Качество<select id="quality"><option value="low">Низкое</option><option value="medium">Среднее</option><option value="high">Высокое</option><option value="ultra">Ультра</option></select></label></div><div class="setting"><label>Динамические тени <input type="checkbox" id="shadows" ${s.shadows ? 'checked' : ''}></label></div><div class="setting"><label>Свечение и магические эффекты <input type="checkbox" id="bloom" ${s.bloom ? 'checked' : ''}></label></div><div class="setting"><label>Цифры урона <input type="checkbox" id="damage" ${s.damage ? 'checked' : ''}></label></div><div class="setting"><label>Дрожание камеры <input type="checkbox" id="shake" ${s.screenShake ? 'checked' : ''}></label></div></section><section><h3>Звук и интерфейс</h3>${[['music', 'Музыка'], ['sfx', 'Эффекты'], ['ui', 'Интерфейс']].map(([id, name]) => `<div class="setting"><label>${name}<b id="${id}-value">${Math.round((s[id as keyof Settings] as number) * 100)}%</b></label><input type="range" min="0" max="100" value="${(s[id as keyof Settings] as number) * 100}" data-volume="${id}"></div>`).join('')}<h3>Управление</h3><div class="stat-row"><span>Движение</span><b>WASD / ЛКМ по земле</b></div><div class="stat-row"><span>Прыжок</span><b>Space</b></div><div class="stat-row"><span>Камера</span><b>ПКМ + мышь / колесо</b></div><div class="stat-row"><span>Цель и атака</span><b>ЛКМ по монстру</b></div><div class="stat-row"><span>Навыки</span><b>1–4</b></div><div class="setting"><label>Зелье здоровья<select id="potion-binding">${bindingOptions(s.keybinds.potion)}</select></label></div><div class="setting"><label>Зелье ресурса<select id="ether-binding">${bindingOptions(s.keybinds.ether)}</select></label></div><button class="gold-btn" id="save-settings">Применить</button></section></div>`;
  bindTabs(); q<HTMLSelectElement>('#quality').value = s.quality;
  qa<HTMLInputElement>('[data-volume]').forEach((input) => { input.oninput = () => { q(`#${input.dataset.volume}-value`).textContent = `${input.value}%`; }; });
  q<HTMLButtonElement>('#save-settings').onclick = () => {
    const requestedBindings = {
      potion: q<HTMLSelectElement>('#potion-binding').value,
      ether: q<HTMLSelectElement>('#ether-binding').value,
    };
    if (requestedBindings.potion === requestedBindings.ether) {
      toast('Для расходников нужны разные клавиши', 'bad');
      return;
    }
    s.quality = q<HTMLSelectElement>('#quality').value as Settings['quality']; s.shadows = q<HTMLInputElement>('#shadows').checked;
    s.bloom = q<HTMLInputElement>('#bloom').checked; s.damage = q<HTMLInputElement>('#damage').checked; s.screenShake = q<HTMLInputElement>('#shake').checked;
    s.keybinds = normalizeConsumableBindings(requestedBindings);
    qa<HTMLInputElement>('[data-volume]').forEach((input) => { (s as unknown as Record<string, number>)[input.dataset.volume ?? 'ui'] = Number(input.value) / 100; });
    applySettings(); updateHud(); saveGame(); toast('Настройки применены'); closeWindow();
  };
}

function applySettings(): void {
  const ratios: Record<Settings['quality'], number> = { low: 1.5, medium: 1.2, high: 1, ultra: 1 / Math.min(window.devicePixelRatio, 2) };
  engine.setHardwareScalingLevel(ratios[state.settings.quality]);
  shadows.setDarkness(0.28);
  moon.shadowEnabled = state.settings.shadows;
  glow.isEnabled = state.settings.bloom;
  if (ambientGain) ambientGain.gain.value = state.settings.music * 0.018;
}

function openDialog(npc: Entity, text: string, actions: Array<{ label: string; action: () => void }>): void {
  openWindow('character');
  q('#window-content').innerHTML = `<h2>${npc.name}</h2><div class="npc-dialog"><div class="npc-portrait"></div><div><div class="eyebrow">Гринфолл</div><h3>${npc.name}</h3><p style="font:20px/1.6 'Cormorant Garamond'">«${text}»</p><div class="action-row">${actions.map((action, index) => `<button class="${index ? 'dark-btn' : 'gold-btn'}" data-dialog="${index}">${action.label}</button>`).join('')}</div></div></div>`;
  qa<HTMLButtonElement>('[data-dialog]').forEach((button) => { button.onclick = actions[Number(button.dataset.dialog)].action; });
}

function openShop(): void {
  openWindow('character');
  const stock: Array<[string, number]> = [['potion', 55], ['ether', 70], ['scroll', 240], ['teleport', 130]];
  q('#window-content').innerHTML = `<h2>Лавка Эльзы</h2><div class="npc-dialog"><div class="npc-portrait"></div><div><p>Боссовые вещи не продаются. За ними придётся идти в лес.</p><div class="shop-grid">${stock.map(([id, cost]) => `<div class="shop-item"><span class="big-icon">${ITEMS_MAP[id].icon}</span><b>${ITEMS_MAP[id].name}</b><span>◈ ${cost}</span><button class="dark-btn" data-buy="${id}" data-cost="${cost}">Купить</button></div>`).join('')}</div></div></div>`;
  qa<HTMLButtonElement>('[data-buy]').forEach((button) => { button.onclick = () => { const cost = Number(button.dataset.cost); if (player.gold < cost) return toast('Недостаточно золота', 'bad'); player.gold -= cost; addItem(button.dataset.buy ?? 'potion'); updateHud(); saveGame(); }; });
}

function openTeleport(): void {
  openWindow('character');
  const points: Array<[string, number, number, number, number]> = [['Астерхолд', -27, -19, 0, 1], ['Гринфолл', GREENFALL_SPAWN.x, GREENFALL_SPAWN.z, 25, 1], ['Чёрный лес', 21, 9, 90, 10], ['Вход в шахту', 35, 27, 150, 10]];
  q('#window-content').innerHTML = `<h2>Проводник Каэль</h2><p>Путь сохраняет цену. Бесплатен только переход в столицу. Чёрный лес открывается на 10 уровне.</p><div class="shop-grid">${points.map((point) => `<div class="shop-item"><b>${point[0]}</b><span>◈ ${point[3]} · ур. ${point[4]}</span><button class="dark-btn" data-tp="${point.slice(1).join(',')}" data-destination="${point[0]}">Отправиться</button></div>`).join('')}</div>`;
  qa<HTMLButtonElement>('[data-tp]').forEach((button) => { button.onclick = () => { const [x, z, cost, level] = (button.dataset.tp ?? '').split(',').map(Number); if (player.level < level) return toast(`Требуется доступ к территории: уровень ${level}`, 'bad'); if (player.gold < cost) return toast('Недостаточно золота', 'bad'); player.gold -= cost; player.x = x; player.z = z; resetPlayerControl(true); cameraControl.snap({ x, y: 0, z }); void gateway.send({ type: 'teleport', destination: button.dataset.destination ?? '' }); closeWindow(); toast('Переход завершён'); saveGame(); }; });
}

function openForge(): void { openWindow('character'); renderForge(); }
function renderForge(): void {
  const gear = Object.entries(player.equipment).filter((entry): entry is [string, ItemInstance] => Boolean(entry[1]));
  q('#window-content').innerHTML = `<h2>Кузница Брана</h2><p>Усиление до +3 безопасно. Начиная с попытки <b>+3 → +4</b>, неудача полностью уничтожает предмет.</p><p>Свитков: <b>${countItem('scroll')}</b></p><div class="bag-grid">${gear.map(([slot, item]) => `<button class="item-card" data-forge="${slot}">${formatItem(item)}</button>`).join('')}</div><div class="item-details" id="forge-info">Выберите надетый предмет.</div>`;
  qa<HTMLButtonElement>('[data-forge]').forEach((button) => { button.onclick = () => { const item = player.equipment[button.dataset.forge ?? '']; if (!item) return; const chance = enhancementChance(item.plus); q('#forge-info').innerHTML = `<b>${itemDef(item).name} +${item.plus} → +${item.plus + 1}</b><br>Вероятность успеха: ${Math.round(chance * 100)}%. ${enhancementCanDestroy(item.plus) ? '<span class="danger-text">При неудаче предмет будет уничтожен.</span>' : 'Безопасное улучшение.'}<div class="action-row"><button class="gold-btn" id="enhance">Усилить</button></div>`; q<HTMLButtonElement>('#enhance').onclick = () => attemptEnhance(button.dataset.forge ?? ''); }; });
}

function attemptEnhance(slot: string): void {
  const item = player.equipment[slot]; if (!item || item.plus >= 15) return;
  if (!countItem('scroll')) return toast('Нужен свиток улучшения', 'bad');
  const run = () => {
    consumeItem('scroll');
    void gateway.send({ type: 'enhance', itemUid: item.uid, from: item.plus, to: item.plus + 1 });
    const outcome = resolveEnhancement(item.plus);
    if (outcome.kind === 'success') {
      item.plus = outcome.level; recalculate(); toast(`${itemDef(item).name} усилен до +${item.plus}`); log(`Заточка успешна: ${itemDef(item).name} +${item.plus}.`, 'loot');
    } else if (outcome.kind === 'destroyed') {
      const name = itemDef(item).name; delete player.equipment[slot]; recalculate(); toast(`${name} уничтожен`, 'bad'); log(`Неудача: ${name} уничтожен при заточке.`, 'combat');
    }
    closeConfirm(); renderForge(); saveGame();
  };
  if (enhancementCanDestroy(item.plus)) confirmBox('Рискованная заточка', `Шанс успеха ${Math.round(enhancementChance(item.plus) * 100)}%. <span class="danger-text">При неудаче предмет будет уничтожен.</span> Продолжить?`, run);
  else run();
}

function countItem(id: string): number { return player.inventory.filter((item) => item.id === id).reduce((total, item) => total + item.count, 0); }
function consumeItem(id: string): boolean { const index = player.inventory.findIndex((item) => item.id === id); if (index < 0) return false; player.inventory[index].count -= 1; if (player.inventory[index].count <= 0) player.inventory.splice(index, 1); return true; }
function useItem(id: string): void {
  if (id === 'potion') { if (player.hp >= player.maxHp) return toast('Здоровье уже полное'); if (!consumeItem(id)) return toast('Нет багровых зелий', 'bad'); player.hp = Math.min(player.maxHp, player.hp + Math.round(player.maxHp * 0.45)); toast('Здоровье восстановлено'); }
  else if (id === 'ether') { if (player.mp >= player.maxMp) return toast('Ресурс уже полный'); if (!consumeItem(id)) return toast('Нет эфирных зелий', 'bad'); player.mp = Math.min(player.maxMp, player.mp + Math.round(player.maxMp * 0.45)); toast(`${CLASSES_MAP[player.classId].resource} восстановлена`); }
  else if (id === 'teleport' && consumeItem(id)) { player.x = GREENFALL_SPAWN.x; player.z = GREENFALL_SPAWN.z; resetPlayerControl(true); cameraControl.snap({ x: player.x, y: 0, z: player.z }); toast('Камень возвращает вас в Гринфолл'); }
  updateHud(); saveGame();
}

function confirmBox(title: string, text: string, yes: () => void, cancel = true): void {
  state.paused = true;
  q('#confirm-root').innerHTML = `<div class="modal-shade"></div><div class="confirm-box glass"><h3>${title}</h3><p>${text}</p><div class="action-row" style="justify-content:center"><button class="gold-btn" id="confirm-yes">Продолжить</button>${cancel ? '<button class="dark-btn" id="confirm-no">Отмена</button>' : ''}</div></div>`;
  q<HTMLButtonElement>('#confirm-yes').onclick = yes;
  const no = document.querySelector<HTMLButtonElement>('#confirm-no'); if (no) no.onclick = closeConfirm;
}
function closeConfirm(): void { state.paused = false; q('#confirm-root').innerHTML = ''; }

function saveGame(): void {
  if (!state.started) return;
  const save: PlayerSave = {
    schema: 1, savedAt: Date.now(), player, quest: state.quest, kills: state.kills,
    bossKills: state.bossKills, lootBuffer: state.lootBuffer, settings: state.settings,
    bossTimers: { ...state.bossTimers },
  };
  void gateway.save(save);
}

function log(message: string, type = ''): void {
  const time = new Date().toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
  const entry = document.createElement('div');
  entry.className = type ? `msg-${type}` : '';
  const stamp = document.createElement('span'); stamp.textContent = `[${time}] `;
  entry.append(stamp, document.createTextNode(message));
  const messages = q<HTMLElement>('#messages'); messages.append(entry); messages.scrollTop = messages.scrollHeight;
}
function toast(message: string, type = ''): void {
  const node = document.createElement('div'); node.className = `toast ${type}`; node.textContent = message; q('#notices').append(node); window.setTimeout(() => node.remove(), 3200);
}

qa<HTMLButtonElement>('[data-window]').forEach((button) => { button.onclick = () => openWindow(button.dataset.window ?? 'character'); });
q<HTMLButtonElement>('#potion').onclick = () => useItem('potion');
q<HTMLButtonElement>('#ether').onclick = () => useItem('ether');
function sendChat(): void { const input = q<HTMLInputElement>('#chat'); if (input.value.trim()) log(`[Общий] ${player.name}: ${input.value.trim()}`); input.value = ''; input.blur(); canvas.focus(); }
q<HTMLButtonElement>('#send-chat').onclick = sendChat;
q<HTMLInputElement>('#chat').onkeydown = (event) => { if (event.key === 'Enter') sendChat(); };

window.addEventListener('resize', () => engine.resize());
let saveTimer = 0;
engine.runRenderLoop(() => {
  const dt = Math.min(engine.getDeltaTime() / 1000, 0.04);
  if (state.started) {
    cameraControl.orbit(inputControl.consumeCameraOrbit());
    cameraControl.zoom(inputControl.consumeZoom());
  }
  if (state.started && !state.paused) {
    update(dt); saveTimer += dt; if (saveTimer > 8) { saveGame(); saveTimer = 0; }
  }
  if (state.started) cameraControl.update(dt, { x: player.x, y: 0, z: player.z });
  scene.render();
});

// Exposed only for deterministic smoke tests executed by the project's QA harness.
Object.defineProperty(window, '__VARENDOR_QA__', {
  value: {
    engine: 'babylon',
    version: '0.4.0-phase1',
    getState: () => ({
      started: state.started,
      entities: state.entities.length,
      assetsLoaded,
      camera: cameraControl.state,
      selectedTarget: targeting.selected?.uid ?? null,
      player: { level: player.level, hp: player.hp, inventory: player.inventory.length, x: player.x, z: player.z },
    }),
  },
  enumerable: false,
});
