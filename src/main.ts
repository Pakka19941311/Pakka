import './styles.css';
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
  statsAtLevel,
  xpNeeded,
} from './core/game-rules';
import { addOrStackItem, applyExperience, equipmentSlot, resolveEnhancement } from './core/gameplay-session';
import { LocalGameGateway } from './network/game-gateway';

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
  kind: 'player' | 'npc' | 'monster' | 'summon';
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
  animations: AnimationGroup[];
  actionType?: string;
  label?: Mesh;
  labelTexture?: DynamicTexture;
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
] as const;

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
 <div class="quick-items glass"><button class="skill-button" id="potion"><span class="key">Q</span><span class="symbol">♥</span><small>Зелье <b id="potion-count">0</b></small></button><button class="skill-button" id="ether"><span class="key">E</span><span class="symbol">◆</span><small>Эфир <b id="ether-count">0</b></small></button></div>
 <div class="notice-stack" id="notices"></div><div class="damage-layer" id="damage-layer"></div>
</div><div id="modal-root"></div><div id="confirm-root"></div>`;

const settings: Settings = {
  quality: 'high', shadows: true, bloom: true, damage: true, screenShake: true,
  music: 0.3, sfx: 0.75, ui: 0.7,
};

const state = {
  started: false,
  starting: false,
  paused: false,
  selectedClass: 'knight',
  target: null as Entity | null,
  moveTarget: null as { x: number; z: number } | null,
  entities: [] as Entity[],
  effects: [] as Array<{ update: (dt: number) => void; dead?: boolean }>,
  worldTime: 19.35,
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

const emptyStats: CombatStats = {
  str: 0, dex: 0, int: 0, vit: 0, spi: 0, atkMin: 0, atkMax: 0, matk: 0,
  def: 0, mdef: 0, crit: 0, accuracy: 0, evasion: 0, speed: 6.2,
};
let player: Player = {
  name: 'Странник', classId: 'knight', level: 1, xp: 0, gold: 320, x: -7, z: -4,
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
const engine = new Engine(canvas, true, { stencil: true, preserveDrawingBuffer: false }, true);
const scene = new Scene(engine);
scene.clearColor = new Color4(0.035, 0.055, 0.065, 1);
scene.fogMode = Scene.FOGMODE_EXP2;
scene.fogColor = new Color3(0.045, 0.075, 0.08);
scene.fogDensity = 0.018;
scene.ambientColor = new Color3(0.25, 0.28, 0.3);

const camera = new ArcRotateCamera('isometric-camera', -Math.PI * 0.72, 1.02, 26, new Vector3(0, 1, 0), scene);
camera.lowerRadiusLimit = 18;
camera.upperRadiusLimit = 34;
camera.lowerBetaLimit = 0.72;
camera.upperBetaLimit = 1.18;
camera.wheelDeltaPercentage = 0.025;
camera.panningSensibility = 0;
camera.attachControl(canvas, true);
camera.inputs.removeByType('ArcRotateCameraPointersInput');
camera.inputs.removeByType('ArcRotateCameraKeyboardMoveInput');

const hemi = new HemisphericLight('ashen-sky', new Vector3(0.25, 1, 0.15), scene);
hemi.intensity = 0.78;
hemi.diffuse = new Color3(0.45, 0.58, 0.7);
hemi.groundColor = new Color3(0.12, 0.08, 0.06);
const moon = new DirectionalLight('moon', new Vector3(0.35, -1, 0.22), scene);
moon.position = new Vector3(-20, 34, -12);
moon.intensity = 2.15;
moon.diffuse = new Color3(0.58, 0.74, 0.88);
const shadows = new ShadowGenerator(2048, moon);
shadows.useBlurExponentialShadowMap = true;
shadows.blurKernel = 24;
const glow = new GlowLayer('ashen-glow', scene, { blurKernelSize: 32 });
glow.intensity = 0.35;

const groundMaterial = new StandardMaterial('ground-material', scene);
groundMaterial.diffuseColor = new Color3(0.12, 0.17, 0.13);
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
roadMaterial.diffuseColor = new Color3(0.29, 0.25, 0.18);
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
safeMaterial.alpha = 0.42;
const safeRing = MeshBuilder.CreateTorus('safe-zone', { diameter: 15.5, thickness: 0.08, tessellation: 96 }, scene);
safeRing.position.set(-8, 0.07, -5);
safeRing.material = safeMaterial;
safeRing.isPickable = false;

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
  root.getChildMeshes().forEach((mesh) => {
    mesh.receiveShadows = true;
    shadows.addShadowCaster(mesh, true);
    if (tint == null) return;
    const source = mesh.material;
    if (!(source instanceof StandardMaterial)) return;
    const material = source.clone(`${source.name}-${root.name}`);
    const color = Color3.FromHexString(`#${tint.toString(16).padStart(6, '0')}`);
    material.diffuseColor = material.diffuseColor.multiply(color);
    mesh.material = material;
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
  const container = entity.kind === 'player' || entity.kind === 'npc'
    ? characterAssets.get(entity.model)
    : monsterAssets.get(entity.model);
  if (!container) throw new Error(`Asset not loaded: ${entity.model}`);
  const instance = instantiateContainer(container, entity.uid);
  entity.root = instance.root;
  entity.animations = instance.animations;
  entity.root.position.set(entity.x, 0, entity.z);
  normalizeHeight(entity.root, entity.targetHeight);
  tintMeshes(entity.root, entity.tint);
  entity.root.getChildMeshes().forEach((mesh) => {
    mesh.metadata = { entity };
    mesh.isPickable = true;
  });
  setEntityAction(entity, 'idle');
  if (entity.kind === 'monster') addNameplate(entity);
  if (entity.kind === 'npc') addNpcLabel(entity);
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

function worldModel(name: string, x: number, z: number, scale = 1, rotation = 0, tint?: number): TransformNode | null {
  const container = worldAssets.get(name);
  if (!container) return null;
  const instance = instantiateContainer(container, `world-${name}-${uid()}`);
  instance.root.position.set(x, 0, z);
  instance.root.rotation.y = rotation;
  instance.root.scaling.setAll(scale);
  tintMeshes(instance.root, tint);
  instance.root.getChildMeshes().forEach((mesh) => { mesh.isPickable = false; });
  return instance.root;
}

function buildTown(x: number, z: number, scale: number): void {
  for (let index = 0; index < 7; index += 1) {
    const angle = (index / 7) * Math.PI * 2;
    const radius = 5 * scale;
    worldModel('wall-block', x + Math.cos(angle) * radius, z + Math.sin(angle) * radius, 1.5 * scale, -angle, 0xb0a999);
  }
  worldModel('wall-arch', x, z + 5 * scale, 1.8 * scale, 0, 0xb0a999);
  worldModel('roof-high', x - 2 * scale, z - scale, 2 * scale, 0.2, 0x8c6c61);
  worldModel('roof', x + 2.5 * scale, z - 1.4 * scale, 1.7 * scale, -0.2, 0x79524a);
  worldModel('fountain-round', x, z, 1.5 * scale);
  worldModel('stall-red', x + 3 * scale, z + 2 * scale, 1.2 * scale, -1);
  worldModel('cart', x - 3 * scale, z + 1.5 * scale, 1.1 * scale, 0.5);
}

function buildWorld(): void {
  for (let index = 0; index < 52; index += 1) {
    const forest = index > 24;
    const x = forest ? rand(12, 47) : rand(-43, 25);
    const z = forest ? rand(5, 36) : rand(-31, 19);
    if (Math.hypot(x + 8, z + 5) < 10) continue;
    worldModel(WORLD_MODELS[index % 4], x, z, rand(1.1, 2.2), rand(0, Math.PI * 2), forest ? 0x879b83 : 0x9aa38c);
  }
  for (let index = 0; index < 22; index += 1) {
    worldModel(index % 2 ? 'rock-large' : 'rock-wide', rand(-46, 48), rand(-35, 37), rand(0.7, 1.7), rand(0, Math.PI * 2), 0x8b918b);
  }
  buildTown(-27, -19, 1.5);
  buildTown(-7, -5, 1);
  for (let index = 0; index < 8; index += 1) worldModel(index % 3 ? 'fence' : 'fence-broken', -14 + index * 2.2, -7 + index * 0.22, 1, 0);
  for (const [x, z] of [[-10, -4], [-4, -7], [-25, -16], [-30, -22], [19, 7], [35, 25]]) {
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
    level: 1, xp: 0, gold: 320, x: -7, z: -4, hp: 1, mp: 1, maxHp: 1, maxMp: 1,
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
  const entity = makeEntity({
    kind: 'monster', id, name: definition.name, model: definition.model, level: definition.level,
    boss: definition.boss, hp: definition.hp, maxHp: definition.hp, atk: definition.atk,
    baseAtk: definition.atk, phase: 1, x, z, homeX: x, homeZ: z, tint: definition.tint,
    targetHeight, alive: delay <= 0, respawn: delay,
  });
  createEntityModel(entity);
  entity.root?.setEnabled(entity.alive);
  state.entities.push(entity);
  return entity;
}

function spawnEntities(): void {
  state.entities.forEach((entity) => entity.root?.dispose(false, true));
  state.entities.length = 0;
  const classDef = CLASSES_MAP[player.classId];
  const playerEntity = makeEntity({ kind: 'player', model: classDef.model, x: player.x, z: player.z, targetHeight: 2.05 });
  createEntityModel(playerEntity);
  state.entities.push(playerEntity);
  const npcs: Array<[string, string, number, number, string]> = [
    ['Староста Роэн', 'Warrior', -7, -2.5, 'elder'], ['Кузнец Бран', 'Warrior', -10, -6, 'smith'],
    ['Торговка Эльза', 'Ranger', -4.8, -5, 'shop'], ['Проводник Каэль', 'Wizard', -7.5, -8, 'teleport'],
  ];
  npcs.forEach(([name, model, x, z, role]) => {
    const entity = makeEntity({ kind: 'npc', name, model, x, z, role, targetHeight: 2 });
    createEntityModel(entity);
    state.entities.push(entity);
  });
  const types = ['wolf', 'exile', 'spider', 'undead', 'bat', 'cultist', 'miner', 'wraith'];
  for (let index = 0; index < 36; index += 1) {
    const forest = index >= 17;
    spawnMonster(types[index % types.length], forest ? rand(13, 34) : rand(1, 17), forest ? rand(4, 24) : rand(-2, 15));
  }
  spawnMonster('mini', 26, 5, state.bossTimers.mini);
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
    applySettings();
    q('#loading').classList.add('hidden');
    q('#hud').classList.remove('hidden');
    state.started = true;
    state.paused = false;
    buildHotbar();
    updateQuest();
    updateHud();
    log(`Добро пожаловать в Варендор, ${player.name}.`, 'system');
    log('ЛКМ — путь и цель. Space — атака. 1–4 — навыки.', 'system');
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
  if (Math.hypot(x + 7, z + 5) < 7.8) return LOCATIONS_LIST[1];
  if (x > 32 && z > 24) return LOCATIONS_LIST[4];
  if (x > 13) return LOCATIONS_LIST[3];
  return LOCATIONS_LIST[2];
}

function buildHotbar(): void {
  const classDef = CLASSES_MAP[player.classId];
  const hotbar = q<HTMLElement>('#hotbar');
  hotbar.innerHTML = '';
  classDef.skills.forEach((skill, index) => hotbar.insertAdjacentHTML('beforeend', `<button class="skill-button" data-skill="${index}"><span class="key">${index + 1}</span><span class="symbol">${skill.icon}</span><small>${skill.name}</small><i class="cooldown"></i></button>`));
  hotbar.insertAdjacentHTML('beforeend', '<button class="skill-button" data-attack><span class="key">Space</span><span class="symbol">⚔</span><small>Обычная атака</small></button>');
  qa<HTMLButtonElement>('[data-skill]').forEach((button) => { button.onclick = () => castSkill(Number(button.dataset.skill)); });
  q<HTMLButtonElement>('[data-attack]').onclick = basicAttack;
}

function rotateTowards(entity: Entity, targetX: number, targetZ: number): void {
  if (!entity.root) return;
  entity.root.rotation.y = Math.atan2(targetX - entity.x, targetZ - entity.z);
}

function update(dt: number): void {
  if (!state.started || state.paused) return;
  state.worldTime = (state.worldTime + dt * 0.035) % 24;
  state.gateWarn = Math.max(0, state.gateWarn - dt);
  const hero = playerEntity();
  if (state.moveTarget) {
    const dx = state.moveTarget.x - player.x;
    const dz = state.moveTarget.z - player.z;
    const distance = Math.hypot(dx, dz);
    if (distance < 0.18) {
      state.moveTarget = null;
      setEntityAction(hero, 'idle');
    } else {
      const speed = player.stats.speed;
      player.x += (dx / distance) * speed * dt;
      player.z += (dz / distance) * speed * dt;
      if (player.x > 13 && player.level < 10) {
        player.x = 12.9;
        state.moveTarget = null;
        if (!state.gateWarn) {
          toast('Чёрный лес откроется на 10 уровне', 'bad');
          state.gateWarn = 3;
        }
      }
      rotateTowards(hero, state.moveTarget?.x ?? player.x, state.moveTarget?.z ?? player.z);
      setEntityAction(hero, 'walk');
    }
  }
  hero.x = player.x;
  hero.z = player.z;
  hero.root?.position.set(player.x, hero.root.position.y, player.z);
  player.attackCd = Math.max(0, player.attackCd - dt);
  player.cooldowns = player.cooldowns.map((value) => Math.max(0, value - dt));
  state.playerBuffs.guard = Math.max(0, state.playerBuffs.guard - dt);
  state.playerBuffs.vanish = Math.max(0, state.playerBuffs.vanish - dt);
  player.mp = Math.min(player.maxMp, player.mp + player.maxMp * 0.022 * dt);
  state.entities.filter((entity) => entity.kind === 'monster').forEach((entity) => updateMonster(entity, dt));
  state.entities.filter((entity) => entity.kind === 'summon').forEach((entity) => updateSummon(entity, dt));
  state.effects.forEach((effect) => effect.update(dt));
  state.effects = state.effects.filter((effect) => !effect.dead);
  const target = new Vector3(player.x, 1, player.z);
  camera.target = Vector3.Lerp(camera.target, target, 1 - Math.pow(0.001, dt));
  state.bossTimers.mini = Math.max(0, state.bossTimers.mini - dt);
  state.bossTimers.big = Math.max(0, state.bossTimers.big - dt);
  updateHud();
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
      entity.root?.position.set(entity.x, entity.root.position.y, entity.z);
      entity.root?.setEnabled(true);
      refreshNameplate(entity);
      setEntityAction(entity, 'idle');
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
      const speed = (entity.boss ? 2.1 : 2.7) * (entity.status.slow ? 0.45 : 1);
      entity.x += (dx / distance) * speed * dt;
      entity.z += (dz / distance) * speed * dt;
      entity.root?.position.set(entity.x, entity.root.position.y, entity.z);
      rotateTowards(entity, player.x, player.z);
      setEntityAction(entity, 'walk');
    } else if (entity.attackCd <= 0) {
      setEntityAction(entity, 'attack', true);
      entity.attackCd = entity.boss ? 1.45 : 2.05;
      window.setTimeout(() => {
        if (entity.alive && Math.hypot(player.x - entity.x, player.z - entity.z) < 2.3) {
          hurtPlayer(Math.max(1, Math.round((entity.atk ?? 1) - player.stats.def * 0.2)));
        }
      }, 280);
    }
  } else if (Math.hypot(entity.x - (entity.homeX ?? entity.x), entity.z - (entity.homeZ ?? entity.z)) > 7) {
    entity.x += ((entity.homeX ?? entity.x) - entity.x) * dt * 0.35;
    entity.z += ((entity.homeZ ?? entity.z) - entity.z) * dt * 0.35;
    entity.root?.position.set(entity.x, entity.root.position.y, entity.z);
    setEntityAction(entity, 'walk');
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
  state.paused = true;
  const loss = Math.floor(player.xp * 0.05);
  player.xp = Math.max(0, player.xp - loss);
  confirmBox('Вы пали', `Потеряно ${loss} опыта текущего уровня. Уровень и предметы сохранены.`, () => {
    player.x = -7; player.z = -4; player.hp = player.maxHp; player.mp = player.maxMp; player.dead = false;
    playerEntity().root?.setEnabled(true); state.paused = false; closeConfirm(); toast('Вы возродились в Гринфолле'); saveGame();
  }, false);
}

function basicAttack(): void { attackWith(null); }
function castSkill(index: number): void {
  const skill = CLASSES_MAP[player.classId].skills[index];
  if (!skill) return;
  if (player.cooldowns[index] > 0) return toast('Навык ещё восстанавливается', 'bad');
  if (player.mp < skill.cost) return toast(`Недостаточно: ${CLASSES_MAP[player.classId].resource}`, 'bad');
  player.mp -= skill.cost;
  player.cooldowns[index] = skill.cd;
  if (skill.buff) {
    state.playerBuffs[skill.buff as 'guard' | 'vanish'] = skill.buff === 'guard' ? 7 : 4;
    toast(skill.buff === 'guard' ? 'Последний рубеж: входящий урон снижен' : 'Вы растворяетесь в сумраке');
    impactEffect(entityWorldPosition(playerEntity()), Color3.FromHexString(skill.buff === 'guard' ? '#d3ad63' : '#7b46a8'));
    void gateway.send({ type: 'attack', entityId: 'self', skillIndex: index });
    return;
  }
  if (skill.summon) {
    summonSkeleton();
    void gateway.send({ type: 'attack', entityId: 'summon', skillIndex: index });
    return;
  }
  attackWith(skill, index);
}

function attackWith(skill: SkillDef | null, skillIndex: number | null = null): void {
  const target = state.target;
  if (!target?.alive) return toast('Выберите живую цель', 'bad');
  const ranged = CLASSES_MAP[player.classId].ranged;
  const range = ranged ? 12 : 2.6;
  const distance = Math.hypot(target.x - player.x, target.z - player.z);
  if (distance > range) {
    state.moveTarget = {
      x: target.x + ((player.x - target.x) / distance) * (ranged ? 8 : 1.6),
      z: target.z + ((player.z - target.z) / distance) * (ranged ? 8 : 1.6),
    };
    return toast('Приближаемся к цели');
  }
  if (!skill && player.attackCd > 0) return;
  player.attackCd = classCombatProfile(player.classId, player.level, player.stats).attackInterval;
  state.moveTarget = null;
  const hero = playerEntity();
  rotateTowards(hero, target.x, target.z);
  setEntityAction(hero, 'attack', true);
  playSfx(skill?.fx ?? 'attack');
  const magic = player.classId === 'mage' || player.classId === 'necro';
  const base = magic ? player.stats.matk : rand(player.stats.atkMin, player.stats.atkMax);
  const multiplier = skill?.mul ?? 1;
  const critical = Math.random() < player.stats.crit / 100;
  const damage = Math.max(1, Math.round(base * multiplier * (critical ? classCombatProfile(player.classId, player.level, player.stats).critMultiplier : 1)));
  void gateway.send({ type: 'attack', entityId: target.uid, skillIndex });
  spawnAttackEffect(skill?.fx ?? (ranged ? 'arrow' : 'slash'), hero, target, () => {
    let victims = [target];
    if (skill?.aoe) victims = state.entities.filter((entity) => entity.kind === 'monster' && entity.alive && Math.hypot(entity.x - target.x, entity.z - target.z) < (skill.aoe ?? 0));
    victims.forEach((entity, index) => damageMonster(entity, Math.round(damage * (index ? 0.72 : 1)), critical && index === 0));
    if (skill?.chain) {
      state.entities.filter((entity) => entity.kind === 'monster' && entity.alive && entity !== target)
        .sort((a, b) => Math.hypot(a.x - target.x, a.z - target.z) - Math.hypot(b.x - target.x, b.z - target.z))
        .slice(0, skill.chain - 1)
        .forEach((entity) => { spawnAttackEffect('lightning', target, entity); damageMonster(entity, Math.round(damage * 0.68), false); });
    }
    if (skill?.dot) target.status.dot = skill.dot;
    if (skill?.slow) target.status.slow = skill.slow;
    if (skill?.stun) target.status.stun = skill.stun;
    if (skill?.knock && target.root) {
      const dx = target.x - player.x; const dz = target.z - player.z; const distance = Math.max(0.001, Math.hypot(dx, dz));
      target.x += (dx / distance) * skill.knock; target.z += (dz / distance) * skill.knock;
      target.root.position.set(target.x, target.root.position.y, target.z);
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
    fire: new Color3(1, 0.2, 0.04), ice: new Color3(0.25, 0.75, 1), arrow: new Color3(0.8, 0.7, 0.45),
    bone: new Color3(0.85, 0.82, 0.7), drain: new Color3(0.15, 0.9, 0.55), curse: new Color3(0.52, 0.12, 0.9),
    lightning: new Color3(0.35, 0.75, 1), poison: new Color3(0.35, 0.85, 0.2), slash: new Color3(0.9, 0.65, 0.25),
  };
  const start = entityWorldPosition(from);
  const end = entityWorldPosition(to);
  const projectile = MeshBuilder.CreateSphere(`effect-${type}-${uid()}`, { diameter: type === 'arrow' ? 0.14 : 0.32, segments: 8 }, scene);
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
  const ring = MeshBuilder.CreateTorus(`impact-${uid()}`, { diameter: 0.45, thickness: 0.07, tessellation: 20 }, scene);
  const material = new StandardMaterial(`impact-material-${uid()}`, scene);
  material.emissiveColor = color;
  material.alpha = 0.9;
  material.disableLighting = true;
  ring.material = material;
  ring.position.copyFrom(position);
  ring.isPickable = false;
  let life = 0;
  state.effects.push({ update(dt) {
    life += dt;
    ring.scaling.setAll(1 + life * 7);
    material.alpha = Math.max(0, 0.9 - life * 2.6);
    if (life > 0.38) { this.dead = true; ring.dispose(false, true); }
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
  if (state.target === entity) state.target = null;
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
    summon.x += (dx / distance) * 3.6 * dt; summon.z += (dz / distance) * 3.6 * dt;
    summon.root?.position.set(summon.x, summon.root.position.y, summon.z);
    rotateTowards(summon, target.x, target.z); setEntityAction(summon, 'walk');
  } else if (summon.attackCd <= 0) {
    summon.attackCd = 1.25; rotateTowards(summon, target.x, target.z); setEntityAction(summon, 'attack', true);
    damageMonster(target, Math.max(5, Math.round(player.stats.matk * 0.3)), false);
  }
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
  q('#potion-count').textContent = String(countItem('potion'));
  q('#ether-count').textContent = String(countItem('ether'));
  const targetFrame = q('#target-frame');
  if (state.target?.alive) {
    targetFrame.classList.remove('hidden');
    q('#target-name').textContent = state.target.name ?? '';
    q('#target-meta').textContent = `ур. ${state.target.level}`;
    q('#boss-mark').textContent = state.target.boss ? '☠' : '';
    (q<HTMLElement>('#target-fill')).style.width = `${clamp((state.target.hp ?? 0) / Math.max(1, state.target.maxHp ?? 1), 0, 1) * 100}%`;
    q('#target-hp').textContent = `${Math.max(0, Math.ceil(state.target.hp ?? 0))} / ${state.target.maxHp}`;
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

const keys: Record<string, boolean> = {};
window.addEventListener('keydown', (event) => {
  if ((event.target as Element)?.matches('input,select')) return;
  keys[event.key.toLowerCase()] = true;
  if (!state.started) return;
  if (['1', '2', '3', '4'].includes(event.key)) castSkill(Number(event.key) - 1);
  if (event.code === 'Space') { event.preventDefault(); basicAttack(); }
  const key = event.key.toLowerCase();
  if (key === 'i') openWindow('inventory');
  if (key === 'c') openWindow('character');
  if (key === 'k') openWindow('skills');
  if (key === 'm') openWindow('map');
  if (key === 'q') useItem('potion');
  if (key === 'e') useItem('ether');
  if (event.key === 'Escape') openWindow('settings');
  if (event.key === 'Enter') q<HTMLInputElement>('#chat').focus();
});
window.addEventListener('keyup', (event) => { keys[event.key.toLowerCase()] = false; });

canvas.addEventListener('pointerdown', (event) => {
  if (!state.started || state.paused) return;
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
      state.target = entity; state.moveTarget = null;
      void gateway.send({ type: 'target', entityId: entity.uid });
      return;
    }
    if (entity.kind === 'npc' && Math.hypot(entity.x - player.x, entity.z - player.z) < 3.2) {
      interactNpc(entity); return;
    }
  }
  if ((pick.pickedMesh?.metadata as { ground?: boolean } | null)?.ground) {
    state.moveTarget = { x: pick.pickedPoint.x, z: pick.pickedPoint.z };
    state.target = null;
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
  q('#window-content').innerHTML = `<h2>Настройки</h2>${tabs('settings')}<div class="settings-grid"><section><h3>Графика</h3><div class="setting"><label>Качество<select id="quality"><option value="low">Низкое</option><option value="medium">Среднее</option><option value="high">Высокое</option><option value="ultra">Ультра</option></select></label></div><div class="setting"><label>Динамические тени <input type="checkbox" id="shadows" ${s.shadows ? 'checked' : ''}></label></div><div class="setting"><label>Свечение и магические эффекты <input type="checkbox" id="bloom" ${s.bloom ? 'checked' : ''}></label></div><div class="setting"><label>Цифры урона <input type="checkbox" id="damage" ${s.damage ? 'checked' : ''}></label></div><div class="setting"><label>Дрожание камеры <input type="checkbox" id="shake" ${s.screenShake ? 'checked' : ''}></label></div></section><section><h3>Звук и интерфейс</h3>${[['music', 'Музыка'], ['sfx', 'Эффекты'], ['ui', 'Интерфейс']].map(([id, name]) => `<div class="setting"><label>${name}<b id="${id}-value">${Math.round((s[id as keyof Settings] as number) * 100)}%</b></label><input type="range" min="0" max="100" value="${(s[id as keyof Settings] as number) * 100}" data-volume="${id}"></div>`).join('')}<h3>Управление</h3><div class="stat-row"><span>Движение</span><b>ЛКМ / WASD</b></div><div class="stat-row"><span>Обычная атака</span><b>Space</b></div><div class="stat-row"><span>Навыки</span><b>1–4</b></div><button class="gold-btn" id="save-settings">Применить</button></section></div>`;
  bindTabs(); q<HTMLSelectElement>('#quality').value = s.quality;
  qa<HTMLInputElement>('[data-volume]').forEach((input) => { input.oninput = () => { q(`#${input.dataset.volume}-value`).textContent = `${input.value}%`; }; });
  q<HTMLButtonElement>('#save-settings').onclick = () => {
    s.quality = q<HTMLSelectElement>('#quality').value as Settings['quality']; s.shadows = q<HTMLInputElement>('#shadows').checked;
    s.bloom = q<HTMLInputElement>('#bloom').checked; s.damage = q<HTMLInputElement>('#damage').checked; s.screenShake = q<HTMLInputElement>('#shake').checked;
    qa<HTMLInputElement>('[data-volume]').forEach((input) => { (s as unknown as Record<string, number>)[input.dataset.volume ?? 'ui'] = Number(input.value) / 100; });
    applySettings(); saveGame(); toast('Настройки применены'); closeWindow();
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
  const points: Array<[string, number, number, number, number]> = [['Астерхолд', -27, -19, 0, 1], ['Гринфолл', -7, -4, 25, 1], ['Чёрный лес', 21, 9, 90, 10], ['Вход в шахту', 35, 27, 150, 10]];
  q('#window-content').innerHTML = `<h2>Проводник Каэль</h2><p>Путь сохраняет цену. Бесплатен только переход в столицу. Чёрный лес открывается на 10 уровне.</p><div class="shop-grid">${points.map((point) => `<div class="shop-item"><b>${point[0]}</b><span>◈ ${point[3]} · ур. ${point[4]}</span><button class="dark-btn" data-tp="${point.slice(1).join(',')}" data-destination="${point[0]}">Отправиться</button></div>`).join('')}</div>`;
  qa<HTMLButtonElement>('[data-tp]').forEach((button) => { button.onclick = () => { const [x, z, cost, level] = (button.dataset.tp ?? '').split(',').map(Number); if (player.level < level) return toast(`Требуется доступ к территории: уровень ${level}`, 'bad'); if (player.gold < cost) return toast('Недостаточно золота', 'bad'); player.gold -= cost; player.x = x; player.z = z; state.moveTarget = null; void gateway.send({ type: 'teleport', destination: button.dataset.destination ?? '' }); closeWindow(); toast('Переход завершён'); saveGame(); }; });
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
  else if (id === 'teleport' && consumeItem(id)) { player.x = -7; player.z = -4; toast('Камень возвращает вас в Гринфолл'); }
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
  if (state.started && !state.paused) {
    const dx = (keys.d || keys.arrowright ? 1 : 0) - (keys.a || keys.arrowleft ? 1 : 0);
    const dz = (keys.s || keys.arrowdown ? 1 : 0) - (keys.w || keys.arrowup ? 1 : 0);
    if (dx || dz) { const length = Math.hypot(dx, dz); state.moveTarget = { x: player.x + (dx / length) * 2, z: player.z + (dz / length) * 2 }; }
    update(dt); saveTimer += dt; if (saveTimer > 8) { saveGame(); saveTimer = 0; }
  }
  scene.render();
});

// Exposed only for deterministic smoke tests executed by the project's QA harness.
Object.defineProperty(window, '__VARENDOR_QA__', {
  value: {
    engine: 'babylon',
    version: '0.3.0',
    getState: () => ({ started: state.started, entities: state.entities.length, assetsLoaded, player: { level: player.level, hp: player.hp, inventory: player.inventory.length } }),
  },
  enumerable: false,
});
