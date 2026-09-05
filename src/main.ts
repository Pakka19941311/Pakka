import './styles.css';
import './hotbar.css';
import './overhaul.css';
import '@babylonjs/loaders/glTF';
import {
  AbstractMesh,
  AnimationGroup,
  ArcRotateCamera,
  AssetContainer,
  Color3,
  Color4,
  ColorCurves,
  DefaultRenderingPipeline,
  DirectionalLight,
  DynamicTexture,
  Engine,
  GlowLayer,
  HDRCubeTexture,
  HemisphericLight,
  Matrix,
  Mesh,
  MeshBuilder,
  MultiMaterial,
  PBRMaterial,
  PhotoDome,
  PointLight,
  Scene,
  SceneLoader,
  SceneInstrumentation,
  ShadowGenerator,
  StandardMaterial,
  SubMesh,
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
  classAttackRange,
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
import { slidePastActor } from './controls/actor-spacing';
import { PlayerInputController } from './controls/input-controller';
import { TargetingController } from './controls/targeting-controller';
import { ThirdPersonCameraController } from './controls/third-person-camera';
import { CollisionWorld } from './world/collision-world';
import { AmbientNpcBrain } from './world/ambient-npc';
import type { AmbientWaypoint } from './world/ambient-npc';
import { findNavigationPath } from './world/navigation';
import { MonsterAiBrain } from './world/monster-ai';
import type { MonsterAiState } from './world/monster-ai';
import { SPAWN_REGIONS, patrolRouteInRegion, spawnPointInRegion } from './world/spawn-regions';
import type { SpawnRegion } from './world/spawn-regions';
import {
  CONSUMABLE_KEY_OPTIONS,
  consumableActionForCode,
  keyLabel,
  normalizeConsumableBindings,
} from './controls/action-bindings';
import type { ConsumableBindings } from './controls/action-bindings';
import { GameAudio } from './audio/game-audio';
import { createPbrSurface, repairImportedMaterial } from './rendering/realism-materials';
import { MonsterLifecycle } from './core/monster-lifecycle';
import { qualityPreset } from './rendering/quality-presets';
import { WorldSectorGrid } from './world/world-sectors';
import { AttackTimeline, combatTimings } from './combat/attack-timeline';
import { resolveChainLightning } from './combat/chain-lightning';
import { SimulationClock } from './core/simulation-clock';
import { FrameTelemetry, ResolutionGovernor, renderScaling, effectiveRenderBudget } from './rendering/frame-budget';
import { ModelInstances } from './rendering/model-instances';
import { ActorAnimation } from './rendering/actor-animation';
import type { ActorAction } from './rendering/actor-animation';
import { TerrainSurface } from './world/terrain-surface';
import { createStaticPart } from './rendering/static-part';

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
  chainRadius?: number;
  chainFalloff?: number;
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
  releaseVisual?: () => void;
  baseY?: number;
  baseScale?: Vector3;
  pickVolume?: Mesh;
  animations: AnimationGroup[];
  motion?: ActorAnimation;
  nearby?: Entity[];
  attackToken?: number;
  activeAttack?: { token: number; target: Entity; impacted: boolean };
  previousX?: number;
  previousZ?: number;
  previousSupportY?: number;
  verticalOffset?: number;
  previousVerticalOffset?: number;
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
  npcActionRelease?: number;
  moveSpeed?: number;
  navPath?: Array<{ x: number; z: number }>;
  navIndex?: number;
  navGoalX?: number;
  navGoalZ?: number;
  navCooldown?: number;
  territoryId?: string;
  aggroRadius?: number;
  leashRadius?: number;
  aiBrain?: MonsterAiBrain;
  aiState?: MonsterAiState;
  visualGeneration?: number;
  normalizationKey?: string;
  visualActive?: boolean;
  supportY?: number;
  lifecycle?: MonsterLifecycle;
};
type Settings = {
  quality: 'low' | 'medium' | 'high' | 'ultra';
  resolutionScale: number;
  antiAliasing: boolean;
  textureQuality: 'medium' | 'high' | 'ultra';
  shadowQuality: 'off' | 'low' | 'high' | 'ultra';
  foliage: 'low' | 'medium' | 'high';
  exposure: number;
  contrast: number;
  saturation: number;
  fog: number;
  fov: number;
  mouseSensitivity: number;
  zoomSensitivity: number;
  cameraSmoothing: number;
  invertCameraY: boolean;
  uiScale: number;
  shadows: boolean;
  bloom: boolean;
  damage: boolean;
  screenShake: boolean;
  master: number;
  music: number;
  ambience: number;
  sfx: number;
  ui: number;
  muteOnBlur: boolean;
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
const EXTRA_MONSTER_MODELS = ['Fox'] as const;
const REALISM_MODELS = ['Barrel_01', 'boulder_01', 'dead_tree_trunk', 'gothic_statue', 'large_castle_door', 'modular_fort_01', 'rock_09', 'tree_stump_01', 'wooden_crate_01'] as const;
type RealismModel = typeof REALISM_MODELS[number];
const WORLD_MODELS = [
  'tree', 'tree-crooked', 'tree-high', 'tree-high-crooked', 'rock-large', 'rock-wide',
  'lantern', 'fence', 'fence-broken', 'cart', 'stall', 'stall-red', 'wall-arch',
  'wall-block', 'wall-corner', 'wall-door', 'roof', 'roof-high', 'fountain-round',
  'pillar-stone', 'planks',
] as const;
const GREENFALL_SPAWN = Object.freeze({ x: -7, z: -11 });

const uiNodes = new Map<string, Element>();
function q<T extends Element>(selector: string): T {
  const cached = uiNodes.get(selector);
  if (cached?.isConnected) return cached as T;
  const value = document.querySelector<T>(selector);
  if (!value) throw new Error(`Missing required UI node: ${selector}`);
  uiNodes.set(selector, value);
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
 <section class="player-frame glass"><div class="portrait" id="portrait">V</div><div><div class="identity"><b id="player-name">Странник</b><span id="player-class">ур. 1</span><span class="coins">◈ <i id="gold">0</i></span></div><div class="bar"><i id="hp-fill"></i><span id="hp-text"></span></div><div class="bar mana"><i id="mp-fill"></i><span id="mp-text"></span></div><div class="bar xp"><i id="xp-fill"></i><span id="xp-text"></span></div></div></section>
 <section class="target-frame glass hidden" id="target-frame"><div><span class="boss-mark" id="boss-mark"></span><span class="target-name" id="target-name"></span><span class="target-meta" id="target-meta"></span></div><div class="bar"><i id="target-fill"></i><span id="target-hp"></span></div></section>
 <section class="minimap-wrap glass"><canvas class="minimap" id="minimap" width="428" height="328"></canvas><span class="clock" id="clock">19:21</span><div class="zone" id="zone">Гринфолл</div></section>
 <section class="tracker glass"><div class="eyebrow">Путь странника</div><h3 id="quest-title">Голос границы</h3><p id="quest-text">Поговорите со старостой Гринфолла.</p><div class="progress"><i id="quest-progress"></i></div></section>
 <section class="boss-timers glass"><div class="eyebrow">Владыки региона</div><div class="timer"><span>Кровавый Оборотень</span><b id="mini-timer">жив</b></div><div class="timer"><span>Хозяин Гнилого Леса</span><b id="big-timer">жив</b></div></section>
 <section class="combat-log glass"><div class="messages" id="messages"></div><div class="chat-input"><input id="chat" placeholder="Enter — общий чат"><button id="send-chat">›</button></div></section>
 <div class="bottom-cluster"><div class="hotbar glass" id="hotbar"></div><nav class="menu glass"><button class="menu-button" data-window="character"><span>C</span><small>Герой</small></button><button class="menu-button" data-window="inventory"><span>I</span><small>Сумка</small></button><button class="menu-button" data-window="skills"><span>K</span><small>Навыки</small></button><button class="menu-button" data-window="map"><span>M</span><small>Карта</small></button><button class="menu-button" data-window="settings"><span>Esc</span><small>Настройки</small></button></nav></div>
 <div class="quick-items glass" aria-label="Быстрые расходники"><button class="skill-button" id="potion"><span class="key" id="potion-key">Q</span><span class="symbol">♥</span><small>Зелье <b id="potion-count">0</b></small></button><button class="skill-button" id="ether"><span class="key" id="ether-key">E</span><span class="symbol">◆</span><small>Эфир <b id="ether-count">0</b></small></button></div>
 <div class="notice-stack" id="notices"></div><div class="damage-layer" id="damage-layer"></div>
</div><div id="modal-root"></div><div id="confirm-root"></div>`;
q('#hud').insertAdjacentHTML('beforeend', '<output id="performance-readout" aria-label="Производительность">Motion · измерение FPS…</output>');
q('.bottom-cluster').append(q('.quick-items'));

function settingsDefaults(): Settings { return {
  quality: 'high', shadows: true, bloom: true, damage: true, screenShake: true,
  resolutionScale: 1, antiAliasing: true, textureQuality: 'high', shadowQuality: 'high', foliage: 'high',
  exposure: 1, contrast: 1.16, saturation: 0.92, fog: 1, fov: 0.82,
  mouseSensitivity: 1, zoomSensitivity: 1, cameraSmoothing: 1, invertCameraY: false, uiScale: 1,
  master: 0.8, music: 0.3, ambience: 0.55, sfx: 0.75, ui: 0.7, muteOnBlur: true,
  keybinds: normalizeConsumableBindings(),
}; }
const settings: Settings = settingsDefaults();

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
const terrain = new TerrainSurface();

const emptyStats: CombatStats = {
  str: 0, dex: 0, int: 0, vit: 0, spi: 0, atkMin: 0, atkMax: 0, matk: 0,
  def: 0, mdef: 0, crit: 0, accuracy: 0, evasion: 0, speed: 6.2,
};
let player: Player = {
  name: 'Странник', classId: 'knight', level: 1, xp: 0, gold: 320, x: GREENFALL_SPAWN.x, z: GREENFALL_SPAWN.z,
  hp: 1, mp: 1, maxHp: 1, maxMp: 1, stats: { ...emptyStats }, inventory: [],
  equipment: {}, cooldowns: [0, 0, 0, 0], attackCd: 0, dead: false,
};

const gameAudio = new GameAudio(settings);

const gateway = new LocalGameGateway<PlayerSave>('varendor_reborn_v03', window.localStorage, ['varendor_reborn_v02']);
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
// The client owns click picking. Hover/orbit must never initiate mesh picking.
scene.skipPointerMovePicking = true;
scene.skipPointerDownPicking = true;
scene.skipPointerUpPicking = true;
scene.clearColor = new Color4(0.055, 0.065, 0.07, 1);
scene.fogMode = Scene.FOGMODE_EXP2;
scene.fogColor = new Color3(0.18, 0.22, 0.23);
scene.fogDensity = 0.008;
scene.ambientColor = new Color3(0.32, 0.34, 0.31);
scene.imageProcessingConfiguration.exposure = 1;
scene.imageProcessingConfiguration.contrast = 1.16;
scene.imageProcessingConfiguration.toneMappingEnabled = true;
scene.imageProcessingConfiguration.vignetteEnabled = true;
scene.imageProcessingConfiguration.vignetteWeight = 1.3;
scene.imageProcessingConfiguration.vignetteStretch = 0.3;

const sky = new PhotoDome('ashen-frontier-sky', '/assets/textures/pbr/dark_autumn_forest_2k.jpg', {
  resolution: 32,
  size: 260,
}, scene);
sky.mesh.isPickable = false;
const environment = new HDRCubeTexture('/assets/textures/pbr/dark_autumn_forest_1k.hdr', scene, 128, false, true, false, true);
environment.rotationY = Math.PI * 0.18;
scene.environmentTexture = environment;
scene.environmentIntensity = 0.62;

const camera = new ArcRotateCamera('third-person-camera', -Math.PI / 2, 1.06, 10.5, new Vector3(0, 1, 0), scene);
camera.panningSensibility = 0;
const cameraControl = new ThirdPersonCameraController(camera);
const renderPipeline = new DefaultRenderingPipeline('realism-pipeline', true, scene, [camera]);
renderPipeline.samples = 2;
renderPipeline.fxaaEnabled = true;
renderPipeline.imageProcessingEnabled = true;
const colorCurves = new ColorCurves();
scene.imageProcessingConfiguration.colorCurves = colorCurves;
scene.imageProcessingConfiguration.colorCurvesEnabled = true;

const hemi = new HemisphericLight('day-sky', new Vector3(0.18, 1, -0.08), scene);
hemi.intensity = 0.82;
hemi.diffuse = new Color3(0.74, 0.8, 0.84);
hemi.groundColor = new Color3(0.2, 0.18, 0.14);
const moon = new DirectionalLight('sun', new Vector3(-0.38, -1, 0.24), scene);
moon.position = new Vector3(24, 42, -18);
moon.intensity = 2.15;
moon.diffuse = new Color3(1, 0.82, 0.61);
const shadows = new ShadowGenerator(2048, moon);
shadows.usePercentageCloserFiltering = true;
shadows.filteringQuality = ShadowGenerator.QUALITY_LOW;
const shadowCasters = new Set<AbstractMesh>();
const modelInstances = new ModelInstances();
const sceneTimings = new SceneInstrumentation(scene);
sceneTimings.captureAnimationsTime = true;
sceneTimings.captureActiveMeshesEvaluationTime = true;
sceneTimings.captureRenderTargetsRenderTime = true;
sceneTimings.captureRenderTime = true;
const frameTelemetry = new FrameTelemetry();
const resolutionGovernor = new ResolutionGovernor();
const simulationClock = new SimulationClock();
let navigationBudget = 2;
let hudTimer = 0;
let minimapTimer = 0;
let performanceTimer = 0;
let lastTelemetry = frameTelemetry.snapshot();
let lastRenderStats = { drawCalls: 0, activeMeshes: 0, renderWidth: 0, renderHeight: 0, shadowCasters: 0 };
const glow = new GlowLayer('ashen-glow', scene, { blurKernelSize: 24, mainTextureRatio: 0.25 });
glow.intensity = 0.35;

const groundMaterial = createPbrSurface(scene, 'forest_ground_06', 18, 0.96);
const ground = new Mesh('ground', scene);
ground.material = groundMaterial;
ground.receiveShadows = true;
ground.metadata = { ground: true };
const roadMaterial = createPbrSurface(scene, 'cobblestone_floor_001', 120, 0.92);
const castleStoneMaterial = createPbrSurface(scene, 'castle_wall_slates', 2.4, 0.88);
const medievalWoodMaterial = createPbrSurface(scene, 'medieval_wood', 2.2, 0.86);
const roofSlateMaterial = createPbrSurface(scene, 'roof_slates_02', 2.8, 0.9);
const barkMaterial = createPbrSurface(scene, 'pine_bark', 2.6, 0.96);
function road(x: number, z: number, width: number, depth: number, rotation = 0) {
  terrain.addRoad(x, z, width, depth, rotation);
}
function roadBetween(ax: number, az: number, bx: number, bz: number, width = 4): void {
  const dx = bx - ax; const dz = bz - az;
  road((ax + bx) * 0.5, (az + bz) * 0.5, Math.hypot(dx, dz), width, -Math.atan2(dz, dx));
}

function finishTerrain(): void {
  const geometry = terrain.geometry();
  const data = new VertexData();
  data.positions = geometry.positions;
  data.uvs = geometry.uvs;
  data.indices = [...geometry.groundIndices, ...geometry.roadIndices];
  data.normals = new Array<number>(data.positions.length).fill(0);
  VertexData.ComputeNormals(data.positions, data.indices, data.normals);
  data.applyToMesh(ground);
  const surfaces = new MultiMaterial('terrain-surfaces', scene);
  surfaces.subMaterials = [groundMaterial, roadMaterial];
  ground.material = surfaces;
  ground.releaseSubMeshes();
  new SubMesh(0, 0, ground.getTotalVertices(), 0, geometry.groundIndices.length, ground);
  new SubMesh(1, 0, ground.getTotalVertices(), geometry.groundIndices.length, geometry.roadIndices.length, ground);
  ground.freezeWorldMatrix();
}

const safeMaterial = new StandardMaterial('safe-zone-material', scene);
safeMaterial.emissiveColor = new Color3(0.66, 0.48, 0.18);
safeMaterial.alpha = 0.1;
const safeRing = MeshBuilder.CreateTorus('safe-zone', { diameter: 24, thickness: 0.07, tessellation: 128 }, scene);
safeRing.position.set(-7, 0.07, -5);
safeRing.material = safeMaterial;
safeRing.isPickable = false;

const targetIndicator = new TransformNode('selected-target-anchor', scene);
const targetRingMaterial = new StandardMaterial('selected-target-ring-material', scene);
targetRingMaterial.emissiveColor = new Color3(0.82, 0.13, 0.08);
targetRingMaterial.diffuseColor = new Color3(0.25, 0.02, 0.01);
targetRingMaterial.alpha = 0.88;
targetRingMaterial.disableLighting = true;
const targetRingOuter = MeshBuilder.CreateTorus('selected-target-ring', { diameter: 2.1, thickness: 0.065, tessellation: 72 }, scene);
targetRingOuter.rotation.x = 0;
targetRingOuter.position.y = 0.08;
targetRingOuter.parent = targetIndicator;
targetRingOuter.material = targetRingMaterial;
targetRingOuter.isPickable = false;
const targetChevron = MeshBuilder.CreateTorus('selected-target-chevron', { diameter: 1.7, thickness: 0.035, tessellation: 64 }, scene);
targetChevron.position.y = 0.075;
targetChevron.parent = targetIndicator;
targetChevron.material = targetRingMaterial;
targetChevron.isPickable = false;
targetIndicator.setEnabled(false);

const pickVolumeMaterial = new StandardMaterial('combat-pick-volume-material', scene);
pickVolumeMaterial.alpha = 0.001;
pickVolumeMaterial.disableLighting = true;
pickVolumeMaterial.disableColorWrite = true;

const characterAssets = new Map<string, AssetContainer>();
const monsterAssets = new Map<string, AssetContainer>();
const worldAssets = new Map<string, AssetContainer>();
const realismAssets = new Map<RealismModel, AssetContainer>();
const sectorGrid = new WorldSectorGrid(48);
const sectorNodes = new Map<string, TransformNode>();
let sectorVisibilityCooldown = 0;
let actorVisibilityCooldown = 0;
function updateActorVisibility(dt: number): void {
  actorVisibilityCooldown -= dt;
  if (actorVisibilityCooldown > 0) return;
  actorVisibilityCooldown = 0.2;
  const radius = state.settings.quality === 'low' ? 48 : state.settings.quality === 'ultra' ? 110 : 76;
  for (const entity of state.entities) {
    if (entity.kind === 'player') continue;
    const distance = Math.hypot(entity.x - player.x, entity.z - player.z);
    const visible = distance < radius + (entity.visualActive ? 6 : 0) || targeting.isSelected(entity);
    if (visible !== entity.visualActive) {
      entity.visualActive = visible;
      entity.root?.setEnabled(visible);
      entity.pickVolume?.setEnabled(visible && entity.alive);
      entity.motion?.setVisible(visible);
    }
    entity.label?.setEnabled(visible && entity.alive && (distance < (entity.kind === 'npc' ? 24 : 18) || targeting.isSelected(entity)));
  }
}
function sectorParent(x: number, z: number): TransformNode {
  const key = sectorGrid.keyAt(x, z);
  let node = sectorNodes.get(key);
  if (!node) { node = new TransformNode(`world-sector-${key}`, scene); sectorNodes.set(key, node); }
  return node;
}
function assignWorldSector(node: TransformNode | Mesh, x: number, z: number): void { node.parent = sectorParent(x, z); }
function updateWorldSectorVisibility(dt: number): void {
  sectorVisibilityCooldown -= dt;
  if (sectorVisibilityCooldown > 0) return;
  sectorVisibilityCooldown = 0.45;
  const distance = state.settings.quality === 'low' ? 74 : state.settings.quality === 'medium' ? 104 : state.settings.quality === 'high' ? 142 : 196;
  const active = sectorGrid.activeKeysAround(player.x, player.z, distance);
  sectorNodes.forEach((node, key) => node.setEnabled(active.has(key)));
  const shadowMap = shadows.getShadowMap();
  if (shadowMap) {
    const radius = (state.settings.quality === 'low' ? 24 : state.settings.quality === 'ultra' ? 65 : 45)
      * (resolutionGovernor.detailStep >= 2 ? 0.65 : 1);
    shadowMap.renderList = [...shadowCasters].filter(mesh => {
      if (mesh.isDisposed()) { shadowCasters.delete(mesh); return false; }
      if (!mesh.isEnabled()) return false;
      if (!mesh.subMeshes?.length || mesh.getTotalVertices() === 0) return false;
      mesh.computeWorldMatrix();
      const bounds = mesh.getBoundingInfo().boundingSphere;
      return Math.hypot(bounds.centerWorld.x - player.x, bounds.centerWorld.z - player.z) < radius + Math.min(bounds.radiusWorld, 12);
    });
  }
}

async function loadContainer(directory: string, filename: string): Promise<AssetContainer> {
  return SceneLoader.LoadAssetContainerAsync(directory, filename, scene);
}

async function loadAssets(): Promise<void> {
  if (assetsLoaded) return;
  const tasks: Array<Promise<void>> = [];
  let loaded = 0;
  const total = CHARACTER_MODELS.length + MONSTER_MODELS.length + EXTRA_MONSTER_MODELS.length + WORLD_MODELS.length + REALISM_MODELS.length;
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
  for (const name of EXTRA_MONSTER_MODELS) {
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
  for (const name of REALISM_MODELS) {
    tasks.push(loadContainer(`/assets/models/realism/${name}/`, `${name}_1k.gltf`).then((container) => {
      realismAssets.set(name, container);
      progress('Детализируем мир');
    }));
  }
  await Promise.all(tasks);
  assetsLoaded = true;
}

function instantiateContainer(container: AssetContainer, name: string, tint?: number) {
  return modelInstances.create(container, name, tint);
}

function tintMeshes(root: TransformNode, tint?: number): void {
  void tint; // Variants are prepared once by ModelInstances, never multiplied per clone.
  root.getChildMeshes().forEach((mesh) => {
    mesh.receiveShadows = true;
    if (mesh.getTotalVertices() > 0 && mesh.subMeshes?.length) shadowCasters.add(mesh);
    const source = mesh.material;
    if (source instanceof StandardMaterial) {
      if (!source.diffuseTexture && source.diffuseColor.toLuminance() < 0.02) {
        source.diffuseColor = new Color3(0.32, 0.32, 0.32);
      }
    } else if (source instanceof PBRMaterial) {
      repairImportedMaterial(source);
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

function setEntityAction(entity: Entity, action: ActorAction, once = false): void {
  if (entity.activeAttack && (action === 'idle' || action === 'walk')) return;
  if (entity.actionType === action && !once) return;
  if (action === 'attack') entity.motion?.beginAttack();
  else entity.motion?.request(action, once);
  entity.actionType = action;
}

function cancelActorAttack(entity: Entity): void {
  if (!entity.activeAttack) return;
  entity.attackToken = (entity.attackToken ?? 0) + 1;
  entity.activeAttack = undefined;
  setEntityAction(entity, 'idle', true);
}

function createEntityModel(entity: Entity): void {
  const wantsCharacter = entity.kind === 'player' || entity.kind === 'npc' || entity.kind === 'ambient';
  const container = wantsCharacter
    ? characterAssets.get(entity.model)
    : monsterAssets.get(entity.model) ?? characterAssets.get(entity.model);
  if (!container) throw new Error(`Asset not loaded: ${entity.model}`);
  const instance = instantiateContainer(container, entity.uid, entity.tint);
  entity.releaseVisual = instance.dispose;
  entity.visualActive = true;
  entity.root = instance.root;
  entity.animations = instance.animations;
  entity.animations.forEach((animation) => { animation.speedRatio = 1; });
  entity.root.position.set(entity.x, 0, entity.z);
  const normalizationKey = `${entity.model}:${entity.targetHeight}`;
  if (entity.normalizationKey === normalizationKey && entity.baseScale) {
    // Never re-measure a skinned/animated bound on respawn: its pose may differ.
    entity.root.scaling.copyFrom(entity.baseScale);
    entity.root.position.y = entity.baseY ?? 0;
  } else {
    normalizeHeight(entity.root, entity.targetHeight);
    entity.baseY = entity.root.position.y;
    entity.baseScale = entity.root.scaling.clone();
    entity.normalizationKey = normalizationKey;
  }
  entity.visualGeneration = (entity.visualGeneration ?? 0) + 1;
  entity.motion = new ActorAnimation(entity.model, entity.targetHeight, entity.animations, instance.pose,
    entity.root.scaling.y, entity.kind === 'player');
  entity.previousX = entity.x; entity.previousZ = entity.z;
  entity.previousSupportY = terrain.supportAt(entity.x, entity.z);
  entity.verticalOffset = 0; entity.previousVerticalOffset = 0;
  tintMeshes(entity.root, entity.tint);
  entity.root.getChildMeshes().forEach((mesh) => {
    mesh.metadata = { entity };
    mesh.isPickable = false; // Capsules own actor picking, including skinned models.
  });
  if (entity.kind === 'monster' || entity.kind === 'npc') {
    const radius = entity.kind === 'npc'
      ? 0.62
      : entity.boss === 'big' ? 1.75 : entity.boss === 'mini' ? 1.25 : Math.max(0.72, entity.targetHeight * 0.42);
    const height = entity.targetHeight + radius * 1.45;
    const volume = MeshBuilder.CreateCapsule(`pick-volume-${entity.uid}`, { height, radius, tessellation: 12 }, scene);
    volume.position.set(entity.x, terrain.supportAt(entity.x, entity.z) + height * 0.5, entity.z);
    volume.material = pickVolumeMaterial;
    volume.metadata = { entity, combatPickVolume: entity.kind === 'monster', centerY: height * 0.5 };
    volume.isPickable = true;
    entity.pickVolume = volume;
  }
  setEntityAction(entity, 'idle');
  if (entity.kind === 'monster') addNameplate(entity);
  if (entity.kind === 'npc') addNpcLabel(entity);
  syncEntityTransform(entity);
}

function disposeEntityVisual(entity: Entity): void {
  cancelActorAttack(entity);
  entity.root?.getChildMeshes().forEach(mesh => { shadowCasters.delete(mesh); shadows.removeShadowCaster(mesh); });
  entity.pickVolume?.dispose(false, false);
  entity.pickVolume = undefined;
  entity.label?.dispose(false, true); // Only this actor's dynamic label owns its texture.
  entity.labelTexture = undefined;
  entity.label = undefined;
  entity.releaseVisual?.();
  entity.releaseVisual = undefined;
  entity.animations = [];
  entity.motion = undefined;
  entity.root = null;
  // Preserve canonical normalization across death; replacement models use a new key.
  entity.actionType = undefined;
}

function recreateEntityVisual(entity: Entity): void {
  disposeEntityVisual(entity);
  createEntityModel(entity);
}

function syncEntityTransform(entity: Entity, verticalOffset = 0): void {
  const supportY = terrain.supportAt(entity.x, entity.z);
  entity.supportY = supportY;
  entity.verticalOffset = verticalOffset;
  if (Math.hypot(entity.x - (entity.previousX ?? entity.x), entity.z - (entity.previousZ ?? entity.z)) > 3.5) {
    entity.previousX = entity.x; entity.previousZ = entity.z;
    entity.previousSupportY = supportY; entity.previousVerticalOffset = verticalOffset;
  }
  entity.root?.position.set(entity.x, supportY + (entity.baseY ?? 0) + verticalOffset, entity.z);
  if (entity.pickVolume) {
    entity.pickVolume.position.x = entity.x;
    entity.pickVolume.position.z = entity.z;
    entity.pickVolume.position.y = supportY + entity.pickVolume.metadata.centerY + verticalOffset;
  }
  entity.label?.position.set(entity.x, supportY + entity.targetHeight + 0.65 + verticalOffset, entity.z);
}

function presentActors(alpha: number): void {
  for (const entity of state.entities) {
    if (!entity.root || entity.visualActive === false) continue;
    const x = (entity.previousX ?? entity.x) + (entity.x - (entity.previousX ?? entity.x)) * alpha;
    const z = (entity.previousZ ?? entity.z) + (entity.z - (entity.previousZ ?? entity.z)) * alpha;
    const support = terrain.supportAt(x, z);
    const jump = (entity.previousVerticalOffset ?? 0) + ((entity.verticalOffset ?? 0) - (entity.previousVerticalOffset ?? 0)) * alpha;
    entity.root.position.set(x, support + (entity.baseY ?? 0) + jump, z);
    entity.pickVolume?.position.set(x, support + entity.pickVolume.metadata.centerY + jump, z);
    entity.label?.position.set(x, support + entity.targetHeight + 0.65 + jump, z);
    entity.motion?.render();
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
  // Labels stay in world units; parenting to a normalized rig scales them twice.
  plane.isPickable = false;
  entity.label = plane;
  entity.labelTexture = texture;
}

function addNameplate(entity: Entity): void {
  if (!entity.root) return;
  const { material, texture } = labelMaterial(entity);
  const plane = MeshBuilder.CreatePlane(`monster-label-${entity.uid}`, { width: entity.boss ? 7 : 5.5, height: entity.boss ? 1.32 : 1.05 }, scene);
  plane.billboardMode = Mesh.BILLBOARDMODE_ALL;
  plane.position.y = entity.targetHeight + 0.8;
  plane.material = material;
  // Independent world-space label, kept in sync with ground support.
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

const ROUND_PROPS = new Set(['tree', 'tree-crooked', 'tree-high', 'tree-high-crooked',
  'rock-large', 'rock-wide', 'lantern', 'fountain-round', 'pillar-stone']);
const SOLID_PROPS = new Set(['stall', 'stall-red', 'cart', 'wall-block', 'wall-corner', 'wall-door', 'fence', 'fence-broken']);

function registerWorldCollider(name: string, root: TransformNode, x: number, z: number, rotation: number): void {
  if (!ROUND_PROPS.has(name) && !SOLID_PROPS.has(name) && name !== 'wall-arch') return;
  root.computeWorldMatrix(true);
  root.getChildMeshes().forEach(mesh => mesh.computeWorldMatrix(true));
  const { min, max } = root.getHierarchyBoundingVectors(true);
  const halfX = (max.x - min.x) / 2, halfZ = (max.z - min.z) / 2;
  const dx = (min.x + max.x) / 2 - x, dz = (min.z + max.z) / 2 - z;
  const cx = x + dx * Math.cos(rotation) + dz * Math.sin(rotation);
  const cz = z - dx * Math.sin(rotation) + dz * Math.cos(rotation);
  const bottom = terrain.heightAt(cx, cz), top = bottom + max.y - min.y;
  if (ROUND_PROPS.has(name)) collisionWorld.addCircle(cx, cz, Math.max(0.07, Math.max(halfX, halfZ) * (name.startsWith('tree') ? 0.18 : 1)), bottom, top);
  if (SOLID_PROPS.has(name)) collisionWorld.addBox(cx, cz, halfX, halfZ, rotation, bottom, top);
  if (name === 'wall-arch') {
    const side = halfX * 0.88;
    const cosine = Math.cos(rotation);
    const sine = Math.sin(rotation);
    for (const direction of [-1, 1]) {
      collisionWorld.addBox(
        cx + cosine * side * direction,
        cz - sine * side * direction,
        halfX * 0.12,
        halfZ,
        rotation,
      );
    }
  }
}

function worldModel(name: string, x: number, z: number, scale = 1, rotation = 0, tint?: number): TransformNode | null {
  const container = worldAssets.get(name);
  if (!container) return null;
  const instance = instantiateContainer(container, `world-${name}-${uid()}`, tint);
  instance.root.position.set(x, terrain.heightAt(x, z), z);
  instance.root.scaling.setAll(scale);
  assignWorldSector(instance.root, x, z);
  tintMeshes(instance.root, tint);
  instance.root.getChildMeshes().forEach((mesh) => { mesh.isPickable = false; });
  registerWorldCollider(name, instance.root, x, z, rotation);
  instance.root.rotation.y = rotation;
  return instance.root;
}

function realismModel(name: RealismModel, x: number, z: number, height: number, rotation = 0): TransformNode | null {
  const container = realismAssets.get(name);
  if (!container) return null;
  const instance = instantiateContainer(container, `realism-${name}-${uid()}`);
  instance.root.position.set(x, 0, z);
  normalizeHeight(instance.root, height);
  instance.root.computeWorldMatrix(true);
  instance.root.getChildMeshes().forEach(mesh => mesh.computeWorldMatrix(true));
  const bounds = instance.root.getHierarchyBoundingVectors(true);
  const halfX = (bounds.max.x - bounds.min.x) / 2, halfZ = (bounds.max.z - bounds.min.z) / 2;
  const dx = (bounds.min.x + bounds.max.x) / 2 - x, dz = (bounds.min.z + bounds.max.z) / 2 - z;
  const cx = x + dx * Math.cos(rotation) + dz * Math.sin(rotation);
  const cz = z - dx * Math.sin(rotation) + dz * Math.cos(rotation);
  instance.root.rotation.y = rotation;
  instance.root.position.y += terrain.heightAt(x, z);
  assignWorldSector(instance.root, x, z);
  tintMeshes(instance.root);
  instance.root.getChildMeshes().forEach((mesh) => { mesh.isPickable = false; });
  const bottom = terrain.heightAt(cx, cz), top = bottom + height;
  if (name === 'Barrel_01') collisionWorld.addCircle(cx, cz, Math.max(halfX, halfZ), bottom, top);
  else if (name === 'dead_tree_trunk' || name === 'tree_stump_01') collisionWorld.addCircle(cx, cz, Math.max(0.25, Math.min(halfX, halfZ) * 0.65), bottom, top);
  else collisionWorld.addBox(cx, cz, halfX, halfZ, rotation, bottom, top);
  return instance.root;
}

function realismModelPart(partName: string, x: number, z: number, height: number, rotation = 0): TransformNode | null {
  const container = realismAssets.get('modular_fort_01');
  if (!container) return null;
  const { root, size } = createStaticPart(container, partName, `fort-part-${partName}-${uid()}`, height);
  root.position.set(x, terrain.heightAt(x, z), z);
  root.rotation.y = rotation;
  assignWorldSector(root, x, z);
  tintMeshes(root);
  root.getChildMeshes().forEach((mesh) => { mesh.isPickable = false; });
  // Colliders are registered only after a real visual exists, using that visual's bounds.
  const bottom = terrain.heightAt(x, z), top = bottom + height;
  if (partName.includes('gate')) {
    const offset = size.x * 0.41;
    for (const side of [-1, 1]) collisionWorld.addBox(x + Math.cos(rotation) * offset * side,
      z - Math.sin(rotation) * offset * side, size.x * 0.09, size.z * 0.5, rotation, bottom, top);
  } else if (partName.includes('tower')) collisionWorld.addCircle(x, z, Math.min(size.x, size.z) * 0.44, bottom, top);
  else collisionWorld.addBox(x, z, size.x * 0.5, size.z * 0.5, rotation, bottom, top);
  return root;
}

const foliageMaterial = new PBRMaterial('forest-needle-material', scene);
foliageMaterial.albedoColor = new Color3(0.055, 0.115, 0.078);
foliageMaterial.roughness = 0.98;
foliageMaterial.metallic = 0;
let pineGeometry: { trunk: Mesh; crown: Mesh } | undefined;
function createPineTree(name: string, x: number, z: number, height: number, rotation: number): void {
  if (!pineGeometry) {
    const trunk = MeshBuilder.CreateCylinder('pine-source-trunk', { height: 0.62, diameterTop: 0.075, diameterBottom: 0.12, tessellation: 12 }, scene);
    trunk.bakeTransformIntoVertices(Matrix.Translation(0, 0.31, 0));
    trunk.material = barkMaterial;
    const layers: Mesh[] = [];
    for (let layer = 0; layer < 5; layer += 1) {
      const crown = MeshBuilder.CreateCylinder(`pine-source-layer-${layer}`, { height: 0.3, diameterTop: 0.02, diameterBottom: 0.48 - layer * 0.055, tessellation: 12 }, scene);
      crown.position.y = 0.48 + layer * 0.105;
      crown.rotation.y = layer * 0.53;
      crown.material = foliageMaterial;
      layers.push(crown);
    }
    const crown = Mesh.MergeMeshes(layers, true, true)!;
    crown.name = 'pine-source-crown';
    pineGeometry = { trunk, crown };
    for (const source of [trunk, crown]) {
      source.isVisible = false; source.isPickable = false; source.receiveShadows = true;
    }
  }
  for (const [part, source] of Object.entries(pineGeometry)) {
    const mesh = source.createInstance(`${name}-${part}`);
    mesh.position.set(x, terrain.heightAt(x, z), z); mesh.rotation.y = rotation; mesh.scaling.setAll(height);
    mesh.isVisible = true; mesh.isPickable = false;
    shadowCasters.add(mesh);
    assignWorldSector(mesh, x, z);
  }
  collisionWorld.addCircle(x, z, height * 0.06 + 0.03, terrain.heightAt(x, z), terrain.heightAt(x, z) + height);
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
  mesh.material = /door|sign|beam|awning|plank/i.test(name) ? medievalWoodMaterial
    : /window|flame/i.test(name) ? townMaterial(color)
      : castleStoneMaterial;
  mesh.receiveShadows = true;
  shadowCasters.add(mesh);
  mesh.isPickable = false;
  assignWorldSector(mesh, x, z);
  if (collider) collisionWorld.addBox(x, z, width * 0.5, depth * 0.5, 0);
  return mesh;
}

function townCylinder(name: string, x: number, y: number, z: number, diameter: number, height: number, color: number, tessellation = 10, collider = true): Mesh {
  const mesh = MeshBuilder.CreateCylinder(name, { diameter, height, tessellation }, scene);
  mesh.position.set(x, y, z);
  mesh.material = townMaterial(color);
  mesh.receiveShadows = true;
  shadowCasters.add(mesh);
  mesh.isPickable = false;
  assignWorldSector(mesh, x, z);
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
  roof.material = roofSlateMaterial;
  roof.receiveShadows = true;
  shadowCasters.add(roof);
  roof.isPickable = false;
  assignWorldSector(roof, x, z);
  townBox(`${name}-door`, x, 1.05, z - depth * 0.505, 1.1, 2.1, 0.16, 0x4b3526, false);
  townBox(`${name}-window-a`, x - width * 0.24, 1.75, z - depth * 0.51, 0.75, 0.8, 0.08, 0xa9d2d0, false);
  townBox(`${name}-window-b`, x + width * 0.24, 1.75, z - depth * 0.51, 0.75, 0.8, 0.08, 0xa9d2d0, false);
  for (const offset of [-width * 0.43, width * 0.43]) {
    townBox(`${name}-beam-${offset}`, x + offset, height * 0.55, z - depth * 0.525, 0.18, height * 0.88, 0.18, 0x4f3322, false);
  }
  townBox(`${name}-crossbeam`, x, height * 0.92, z - depth * 0.53, width * 0.9, 0.18, 0.18, 0x4f3322, false);
  townBox(`${name}-chimney`, x + width * 0.3, height + 1.0, z + depth * 0.18, 0.72, 2.0, 0.72, 0x6c675e, false);
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
  terrain.addPlatform(x, z, 5.8, 4.4, 0.16);
  townBox('smithy-back', x, 1.3, z + 1.85, 5.8, 2.6, 0.35, 0x685f52);
  townBox('smithy-awning', x, 2.55, z + 0.1, 5.6, 0.24, 3.2, 0x6e3f2c, false);
  townBox('smithy-anvil-base', x + 0.8, 0.38, z - 0.15, 0.65, 0.75, 0.7, 0x3b4244);
  townBox('smithy-anvil-top', x + 0.8, 0.86, z - 0.15, 1.35, 0.28, 0.62, 0x4f595c, false);
  townCylinder('smithy-brazier', x - 1.1, 0.5, z - 0.25, 1.15, 0.65, 0x3d3630, 12);
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
  realismModel('large_castle_door', x, z - 7.72 * scale, 4.7 * scale, Math.PI);
  realismModel('gothic_statue', x, z + 4.2 * scale, 4.4 * scale, Math.PI);
  for (const [bx, bz] of [[x - 7, z - 7], [x + 7, z - 7], [x - 9, z + 2]]) realismModel('Barrel_01', bx, bz, 1.2 * scale, rand(0, Math.PI * 2));
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
  // Broad, readable hierarchy: gate -> main street -> central square -> keep.
  road(x, z - 2.5, 5.2, 35);
  road(x, z - 3.0, 27, 4.4);
  road(x - 8.8, z + 3.0, 13, 3.5, 0.1);
  road(x + 8.8, z + 3.0, 13, 3.5, -0.1);

  // Production CC0 fort modules form a complete defensive silhouette.
  realismModelPart('wall_thin_gate_01', x, z - 17.2, 5.6, 0);
  realismModelPart('tower_round', x - 5.2, z - 17.1, 6.8, 0);
  realismModelPart('tower_round', x + 5.2, z - 17.1, 6.8, 0);
  for (const side of [-1, 1]) {
    for (const offset of [-10.6, -3.4, 3.8]) {
      realismModelPart('wall_thin_straight_01', x + side * 15.8, z + offset, 4.8, Math.PI / 2);
    }
    realismModelPart('wall_thin_corner_01', x + side * 15.8, z + 10.2, 5.0, side > 0 ? Math.PI : -Math.PI / 2);
    realismModelPart('tower_round', x + side * 15.4, z + 10.0, 6.3, 0);
    realismModelPart('wall_thin_straight_01', x + side * 10.5, z + 10.5, 4.8, 0);
    realismModelPart('wall_thin_straight_01', x + side * 4.2, z + 10.5, 4.8, 0);
  }
  realismModelPart('wall_thin_straight_01', x - 11.0, z - 17.0, 4.8, 0);
  realismModelPart('wall_thin_straight_01', x + 11.0, z - 17.0, 4.8, 0);

  // Raised northern keep, framed by real fort towers and a textured castle door.
  createBuilding('greenfall-keep', x, z + 6.0, 9.4, 6.2, 4.7, 0x978d7d, 0x5c4a42);
  townBox('greenfall-keep-steps', x, 0.24, z + 2.45, 3.8, 0.48, 1.5, 0x8a8172, false);
  terrain.addPlatform(x, z + 2.45, 3.8, 1.5, 0.48);
  realismModelPart('tower_round', x - 6.0, z + 7.0, 7.0, 0);
  realismModelPart('tower_round', x + 6.0, z + 7.0, 7.0, 0);
  realismModel('large_castle_door', x, z + 2.9, 4.2, 0);

  // Western craft lane: tavern, working smithy, storage and delivery props.
  createBuilding('greenfall-tavern', x - 9.4, z + 3.5, 6.7, 5.0, 3.4, 0x9a7b5e, 0x754335);
  townBox('greenfall-tavern-sign', x - 5.95, 2.55, z + 1.9, 0.18, 1.25, 1.1, 0x6a4326, false);
  createSmithy(x - 10.2, z - 6.2);
  realismModel('wooden_crate_01', x - 13.0, z - 10.0, 1.05, -0.2);
  realismModel('Barrel_01', x - 11.6, z - 10.2, 1.1, 0.25);

  // Eastern market lane and storehouse form a distinct commercial quarter.
  createBuilding('greenfall-storehouse', x + 10.0, z + 4.6, 6.4, 5.0, 3.2, 0x8d806c, 0x625046);
  createBuilding('greenfall-home-east', x + 10.7, z - 10.0, 5.2, 4.2, 2.9, 0x8b8171, 0x564942);
  worldModel('stall-red', x + 8.1, z - 3.5, 1.25, -Math.PI / 2, 0x9b6656);
  worldModel('stall', x + 8.0, z - 6.3, 1.2, -Math.PI / 2, 0x826b57);
  worldModel('cart', x + 11.1, z - 4.7, 1.0, 0.35, 0x72533d);
  realismModel('wooden_crate_01', x + 12.8, z - 2.7, 1.15, 0.3);
  realismModel('Barrel_01', x + 12.6, z - 6.9, 1.1, -0.15);

  // Central social square remains open and legible from the gate.
  road(x, z - 1.0, 12.5, 11.0);
  createBonfire(x, z - 1.2);
  realismModel('gothic_statue', x + 4.0, z + 1.9, 3.4, -Math.PI / 2);
  for (const [lx, lz] of [[x - 4.2, z - 5.2], [x + 4.2, z - 5.2], [x - 4.2, z + 2.9], [x + 4.2, z + 2.9]]) {
    const lantern = worldModel('lantern', lx, lz, 1.25);
    if (lantern) {
      const light = new PointLight(`settlement-light-${lx}-${lz}`, new Vector3(0, 2.5, 0), scene);
      light.diffuse = new Color3(1, 0.4, 0.1);
      light.intensity = 1.8;
      light.range = 7;
      light.parent = lantern;
    }
  }
}

function buildRuinLandmark(x: number, z: number, scale = 1): void {
  worldModel('wall-arch', x, z, 2.1 * scale, rand(0, Math.PI * 2), 0x777870);
  for (let index = 0; index < 5; index += 1) {
    const angle = index * 0.92 + 0.25;
    worldModel(index % 2 ? 'wall-block' : 'pillar-stone', x + Math.cos(angle) * 4.3 * scale, z + Math.sin(angle) * 4.3 * scale, 1.3 * scale, -angle, 0x6d716c);
  }
  realismModel('gothic_statue', x + 1.4 * scale, z + 1.1 * scale, 3.6 * scale, Math.PI * 0.75);
  realismModel('boulder_01', x - 3.5 * scale, z + 2.8 * scale, 2.1 * scale, 0.4);
}

function buildFrontierCamp(x: number, z: number, scale = 1): void {
  worldModel('stall-red', x, z, 1.25 * scale, 0.25, 0x684b43);
  worldModel('cart', x + 3.0 * scale, z + 1.3 * scale, 1.05 * scale, -0.55, 0x66513e);
  for (let index = 0; index < 4; index += 1) worldModel(index === 2 ? 'fence-broken' : 'fence', x - 3.2 * scale + index * 2.15 * scale, z - 3.0 * scale, 1.05 * scale, 0);
  realismModel('Barrel_01', x - 2.0 * scale, z + 1.2 * scale, 1.15 * scale, 0.2);
  realismModel('wooden_crate_01', x + 1.7 * scale, z + 2.2 * scale, 1.1 * scale, -0.4);
}

function buildWorld(): void {
  collisionWorld.clear();
  // Stable decoration positions across Continue, quality levels and character selection.
  let seed = 314159;
  const rand = (min: number, max: number) => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return min + seed / 4294967296 * (max - min);
  };
  roadBetween(-108, -82, -65, -55, 5.4);
  roadBetween(-65, -55, -7, -27, 5.2);
  roadBetween(-7, -27, -7, -15, 5.2);
  roadBetween(-7, -27, 20, -27, 4.8);
  roadBetween(20, -27, 35, 18, 4.8);
  roadBetween(35, 18, 70, 6, 4.2);
  roadBetween(35, 18, 72, 52, 4.4);
  roadBetween(72, 52, 104, 48, 4.0);
  roadBetween(104, 48, 136, 101, 4.0);
  roadBetween(70, 6, 112, 4, 3.5);
  const reserved = (x: number, z: number, radius: number) =>
    (Math.abs(x + 7) < 21 + radius && Math.abs(z + 8) < 23 + radius)
    || (Math.abs(x + 108) < 26 + radius && Math.abs(z + 82) < 26 + radius)
    || terrain.roadAt(x, z, radius + 1);
  const treeCount = 220; // Quality changes rendering, never collision/world topology.
  for (let index = 0; index < treeCount; index += 1) {
    const forest = index > treeCount * 0.34;
    const x = forest ? rand(50, 154) : rand(-145, 52);
    const z = forest ? rand(-18, 126) : rand(-120, 64);
    if (reserved(x, z, 1)) continue;
    createPineTree(`pine-${index}`, x, z, forest ? rand(6.5, 10.5) : rand(5.2, 8.2), rand(0, Math.PI * 2));
  }
  for (let index = 0; index < 70; index += 1) {
    const x = rand(-150, 155); const z = rand(-128, 132);
    if (reserved(x, z, 2.5)) continue;
    realismModel(index % 2 ? 'rock_09' : 'boulder_01', x, z, rand(1.2, 3.1), rand(0, Math.PI * 2));
  }
  for (let index = 0; index < 34; index += 1) {
    const x = rand(45, 155); const z = rand(-18, 126);
    if (reserved(x, z, 1.5)) continue;
    realismModel(index % 2 ? 'dead_tree_trunk' : 'tree_stump_01', x, z, rand(1.5, 3.8), rand(0, Math.PI * 2));
  }
  buildTown(-108, -82, 1.65);
  buildStarterSettlement(-7, -5);
  buildFrontierCamp(34, 19, 1.1);
  buildFrontierCamp(70, 4, 0.95);
  buildRuinLandmark(69, 52, 1.15);
  buildRuinLandmark(105, 49, 1.3);
  buildRuinLandmark(132, 96, 1.4);
  // The obsolete fence through the central square blocked the street and the bonfire.
  for (const [x, z] of [[-102, -77], [-114, -88], [35, 18], [72, 52], [104, 48], [133, 96]]) {
    const lantern = worldModel('lantern', x, z, 1.4);
    if (lantern) {
      const light = new PointLight(`fire-${x}-${z}`, new Vector3(0, 2.6, 0), scene);
      light.diffuse = new Color3(1, 0.34, 0.08);
      light.intensity = 2.6;
      light.range = 10;
      light.parent = lantern;
    }
  }
  worldModel('wall-arch', 136, 98, 3.2, Math.PI, 0x59605d);
  for (let index = 0; index < 9; index += 1) realismModel('boulder_01', 130 + rand(0, 14), 94 + rand(0, 15), rand(2.2, 4.2), rand(0, Math.PI * 2));
  finishTerrain();
  for (const node of sectorNodes.values()) {
    node.computeWorldMatrix(true); node.freezeWorldMatrix();
    node.getDescendants().forEach(child => {
      if (child instanceof TransformNode) { child.computeWorldMatrix(true); child.freezeWorldMatrix(); }
    });
  }
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

function spawnMonster(id: string, x: number, z: number, delay = 0, region?: SpawnRegion, populationIndex = 0): Entity {
  const definition = MONSTERS_MAP[id];
  const targetHeight = definition.boss === 'big' ? 4.6 : definition.boss === 'mini' ? 3.4 : id === 'bat' ? 1.4 : 1.9;
  const actorRadius = definition.boss === 'big' ? 1.2 : definition.boss === 'mini' ? 0.9 : 0.42;
  const spawn = collisionWorld.findNearestFree({ x, z }, actorRadius);
  const entity = makeEntity({
    kind: 'monster', id, name: definition.name, model: definition.model, level: definition.level,
    boss: definition.boss, hp: definition.hp, maxHp: definition.hp, atk: definition.atk,
    baseAtk: definition.atk, phase: 1, x: spawn.x, z: spawn.z, homeX: spawn.x, homeZ: spawn.z, tint: definition.tint,
    targetHeight, alive: delay <= 0, respawn: delay,
    lifecycle: new MonsterLifecycle(delay),
    territoryId: region?.id,
    aggroRadius: region?.aggroRadius ?? (definition.boss ? 11 : 9),
    leashRadius: region?.leashRadius ?? (definition.boss ? 18 : 14),
    patrol: region?.boss ? [] : region ? patrolRouteInRegion(region, spawn, populationIndex)
      .map((point) => collisionWorld.findNearestFree(point, actorRadius)) : [],
    patrolIndex: populationIndex % 3,
    patrolPause: 0,
    aiBrain: new MonsterAiBrain(x * 0.173 + z * 0.127 + populationIndex * 1.91),
    aiState: delay > 0 ? 'despawn' : 'spawn',
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
  moveSpeed: number,
): Entity {
  const spawn = collisionWorld.findNearestFree({ x, z }, 0.38);
  const entity = makeEntity({
    kind: 'ambient', name, model, x: spawn.x, z: spawn.z, targetHeight: 1.92,
    tint: 0xb9aa98, ambientBrain: new AmbientNpcBrain(waypoints, seed), moveSpeed,
  });
  createEntityModel(entity);
  rotateTowards(entity, waypoints[0].x, waypoints[0].z);
  state.entities.push(entity);
  return entity;
}

function spawnAmbientResidents(): void {
  spawnAmbientResident('Поселенец', 'Ranger', -5.2, -14.1, [
    { x: -7, z: -6.2, activity: 'warm' }, { x: 1.1, z: -8.5, activity: 'trade' }, { x: -5.2, z: -14.1, activity: 'talk' },
  ], 1, 1.08);
  spawnAmbientResident('Подмастерье', 'Warrior', -18.5, -12.8, [
    { x: -17.2, z: -11.2, activity: 'work' }, { x: -12.5, z: -8.2, activity: 'talk' },
  ], 2, 1.22);
  spawnAmbientResident('Дозорный', 'Warrior', -12.2, -20.3, [
    { x: -12.2, z: -20.3, activity: 'guard' }, { x: -1.8, z: -20.3, activity: 'guard' },
  ], 3, 1.0);
  spawnAmbientResident('Жительница', 'Monk', 3.4, -14.5, [
    { x: 1.1, z: -8.5, activity: 'trade' }, { x: -4.2, z: -4.6, activity: 'talk' }, { x: -7, z: -6.2, activity: 'warm' },
  ], 4, 0.94);
  spawnAmbientResident('Грузчик', 'Rogue', 4.6, -11.5, [
    { x: 3.0, z: -2.0, activity: 'work' }, { x: 1.1, z: -8.5, activity: 'trade' }, { x: -3.5, z: -12.0, activity: 'talk' },
  ], 5, 1.34);
  spawnAmbientResident('Странник', 'Wizard', -13.8, -3.5, [
    { x: -13.8, z: -3.5, activity: 'talk' }, { x: -7, z: -6.2, activity: 'warm' }, { x: -7, z: -20.2, activity: 'guard' },
  ], 6, 1.12);
}

function spawnEntities(): void {
  state.entities.forEach(disposeEntityVisual);
  state.entities.length = 0;
  const safeSpawn = collisionWorld.findNearestFree({ x: player.x, z: player.z }, 0.46);
  player.x = safeSpawn.x;
  player.z = safeSpawn.z;
  const classDef = CLASSES_MAP[player.classId];
  const playerEntity = makeEntity({ kind: 'player', model: classDef.model, x: player.x, z: player.z, targetHeight: 2.05 });
  createEntityModel(playerEntity);
  state.entities.push(playerEntity);
  const npcs: Array<[string, string, number, number, string, number, number]> = [
    ['Староста Роэн', 'Warrior', -7, -2.6, 'elder', -7, -6.2],
    ['Кузнец Бран', 'Warrior', -17.5, -12.6, 'smith', -16.4, -11.35],
    ['Торговка Эльза', 'Ranger', 0.3, -7.8, 'shop', 1.1, -8.5],
    ['Проводник Каэль', 'Wizard', -7, -20.0, 'teleport', -7, -16.5],
  ];
  npcs.forEach(([name, model, x, z, role, lookX, lookZ]) => {
    const point = collisionWorld.findNearestFree({ x, z }, 0.42);
    const entity = makeEntity({ kind: 'npc', name, model, ...point, role, targetHeight: 2, npcActionTimer: role === 'smith' ? 1.2 : undefined });
    createEntityModel(entity);
    rotateTowards(entity, lookX, lookZ);
    state.entities.push(entity);
  });
  spawnAmbientResidents();
  for (const region of SPAWN_REGIONS) {
    for (let index = 0; index < region.population; index += 1) {
      const point = spawnPointInRegion(region, index);
      const delay = region.boss ? state.bossTimers[region.boss] : 0;
      spawnMonster(region.monsterId, point.x, point.z, delay, region, index);
    }
  }
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
    updateActorVisibility(1);
    updateWorldSectorVisibility(1);
    q('#load-text').textContent = 'Подготавливаем изображение…';
    // Loaded GLTF data does not mean the shaders/post-processing are ready to display.
    await scene.whenReadyAsync();
    await new Promise<void>(resolve => scene.onAfterRenderObservable.addOnce(() => resolve()));
    q('#loading').classList.add('hidden');
    q('#hud').classList.remove('hidden');
    state.started = true;
    state.paused = false;
    skipFrameDelta = true;
    buildHotbar();
    fitActionDock();
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
  if (Math.hypot(x + 108, z + 82) < 16) return LOCATIONS_LIST[0];
  if (Math.hypot(x + 7, z + 5) < 20.5) return LOCATIONS_LIST[1];
  if (x > 122 && z > 82) return LOCATIONS_LIST[4];
  if (x > 58) return LOCATIONS_LIST[3];
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

function actorBodyRadius(entity: Entity): number {
  if (entity.kind === 'player') return 0.46;
  // The fox rig is much longer than a humanoid at the same normalized height.
  // Keep its torso clear of the player, including the scaled miniboss variant.
  if (entity.model === 'Fox') return Math.max(0.7, Math.min(2.05, entity.targetHeight * 0.85));
  if (entity.boss === 'big') return 1.4;
  if (entity.boss === 'mini') return 1;
  return 0.46;
}

function monsterReach(entity: Entity): number { return Math.max(1.65, actorBodyRadius(entity) + 0.64); }

const crowdCells = new Map<number, Entity[]>();
const usedCrowdCells: Entity[][] = [];
function crowdKey(x: number, z: number): number { return (Math.floor(x / 10) + 64) * 128 + Math.floor(z / 10) + 64; }
function rebuildCrowdCells(): void {
  for (const bucket of usedCrowdCells) bucket.length = 0;
  usedCrowdCells.length = 0;
  for (const entity of state.entities) {
    if (!entity.alive) continue;
    const key = crowdKey(entity.x, entity.z);
    let bucket = crowdCells.get(key);
    if (!bucket) { bucket = []; crowdCells.set(key, bucket); }
    if (!bucket.length) usedCrowdCells.push(bucket);
    bucket.push(entity);
  }
}
function nearbyActors(entity: Entity): Entity[] {
  const result = entity.nearby ??= [];
  result.length = 0;
  const key = crowdKey(entity.x, entity.z);
  for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) {
    const bucket = crowdCells.get(key + dx * 128 + dz);
    if (bucket) for (const other of bucket) result.push(other);
  }
  return result;
}

function restrictActorOverlap(entity: Entity, from: Readonly<{ x: number; z: number }>, delta: Readonly<{ x: number; z: number }>) {
  if (entity.kind !== 'player' && entity.kind !== 'monster' && entity.kind !== 'summon') return delta;
  let result = delta;
  for (const other of nearbyActors(entity)) {
    if (other === entity || !other.alive || (other.kind !== 'player' && other.kind !== 'monster')) continue;
    const radius = actorBodyRadius(entity) + actorBodyRadius(other);
    if (Math.abs(other.x - from.x) > radius + Math.abs(result.x) || Math.abs(other.z - from.z) > radius + Math.abs(result.z)) continue;
    result = slidePastActor(from, result, other, radius);
  }
  return result;
}

function moveEntityWithCollision(entity: Entity, dx: number, dz: number, avoidStuck = false): boolean {
  const from = { x: entity.x, z: entity.z };
  let resolved = collisionWorld.resolve(from, restrictActorOverlap(entity, from, { x: dx, z: dz }), entityCollisionRadius(entity));
  if (avoidStuck && resolved.blocked && Math.hypot(resolved.x - from.x, resolved.z - from.z) < 0.0001) {
    const direction = entity.uid.charCodeAt(entity.uid.length - 1) % 2 ? 1 : -1;
    resolved = collisionWorld.resolve(from, restrictActorOverlap(entity, from, { x: -dz * direction, z: dx * direction }), entityCollisionRadius(entity));
  }
  entity.x = resolved.x;
  entity.z = resolved.z;
  syncEntityTransform(entity);
  return Math.hypot(entity.x - from.x, entity.z - from.z) > 0.0001;
}

function attackRange(): number {
  return classAttackRange(player.classId);
}

function resetPlayerControl(clearTarget = false): void {
  state.moveTarget = null;
  state.interactionTarget = null;
  combatControl.cancelPursuit();
  playerMotor.reset();
  const hero = state.entities.find(entity => entity.kind === 'player');
  if (hero) { cancelActorAttack(hero); hero.navPath = undefined; hero.navCooldown = 0; }
  if (clearTarget) {
    targeting.clear();
    setTargetOutline(outlinedTarget, false);
    outlinedTarget = null;
    targetIndicator.setEnabled(false);
  }
}

function enforcePlayerBoundary(): void {
  player.x = clamp(player.x, -156, 156);
  player.z = clamp(player.z, -136, 136);
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
  // Imported GLTFs can contain oversized hidden helper meshes. Outlining those
  // caused the giant red surface bug; the restrained ground marker is authoritative.
  entity?.root?.getChildMeshes().forEach((mesh) => { mesh.renderOutline = false; });
  void enabled;
}

function updateTargetIndicator(): void {
  const target = targeting.validate();
  if (outlinedTarget !== target) {
    setTargetOutline(outlinedTarget, false);
    outlinedTarget = target;
    setTargetOutline(outlinedTarget, true);
  }
  if (!target) {
    targetIndicator.setEnabled(false);
    return;
  }
  targetIndicator.position.set(target.x, terrain.supportAt(target.x, target.z) + 0.03, target.z);
  const scale = target.boss === 'big' ? 2.2 : target.boss === 'mini' ? 1.55 : Math.max(0.85, target.targetHeight * 0.52);
  targetIndicator.scaling.setAll(scale);
  targetIndicator.rotation.y += 0.7 / 60;
  targetIndicator.setEnabled(true);
}

let qaMotionSample: (() => void) | undefined;
function update(dt: number): void {
  if (!state.started || state.paused) return;
  rebuildCrowdCells();
  for (const entity of state.entities) {
    entity.previousX = entity.x; entity.previousZ = entity.z;
    entity.previousSupportY = entity.supportY;
    entity.previousVerticalOffset = entity.verticalOffset;
  }
  state.worldTime = 12.5;
  state.gateWarn = Math.max(0, state.gateWarn - dt);
  const hero = playerEntity();
  player.attackCd = Math.max(0, player.attackCd - dt);
  player.cooldowns = player.cooldowns.map((value) => Math.max(0, value - dt));
  state.playerBuffs.guard = Math.max(0, state.playerBuffs.guard - dt);
  state.playerBuffs.vanish = Math.max(0, state.playerBuffs.vanish - dt);
  player.mp = Math.min(player.maxMp, player.mp + player.maxMp * 0.022 * dt);

  const target = targeting.validate();
  if (hero.activeAttack && (hero.activeAttack.target !== target || !target?.alive)) cancelActorAttack(hero);
  if (inputControl.consumeJump() && playerMotor.requestJump()) {
    cancelActorAttack(hero);
    combatControl.cancelPursuit();
  }
  const axes = inputControl.movementAxes();
  const manualMovement = Math.hypot(axes.forward, axes.strafe) > 0.0001;
  const combatDecision = combatControl.plan({
    player,
    target,
    basicRange: attackRange(),
    skillRange: () => attackRange(),
    canBasicAttack: player.attackCd <= 0 && !hero.activeAttack && playerMotor.grounded,
    canUseSkill: (index) => !hero.activeAttack && playerMotor.grounded && player.cooldowns[index] <= 0 && player.mp >= (CLASSES_MAP[player.classId].skills[index]?.cost ?? Infinity),
  });

  let desiredDirection: Readonly<{ x: number; z: number }> = { x: 0, z: 0 };
  let maxMoveDistance = Infinity;
  if (manualMovement) {
    cancelActorAttack(hero);
    state.moveTarget = null;
    state.interactionTarget = null;
    combatControl.cancelPursuit();
    hero.navPath = undefined; hero.navCooldown = 0;
    desiredDirection = cameraControl.movementDirection(axes);
    syncMovementIntent(desiredDirection, dt);
  } else {
    syncMovementIntent(null, dt);
    const destination = hero.activeAttack ? null : combatDecision.kind === 'approach' ? combatDecision : state.moveTarget;
    if (destination) {
      // The same obstacle-aware route serves ground clicks, NPC approach and pursuit.
      const waypoint = navigationWaypoint(hero, destination, dt, 0.46);
      const dx = (waypoint?.x ?? player.x) - player.x;
      const dz = (waypoint?.z ?? player.z) - player.z;
      const distance = Math.hypot(dx, dz);
      if (Math.hypot(destination.x - player.x, destination.z - player.z) < 0.18) {
        if (combatDecision.kind !== 'approach') state.moveTarget = null;
      } else if (waypoint) {
        desiredDirection = { x: dx, z: dz };
        maxMoveDistance = distance;
      }
    }
    if ((combatDecision.kind === 'attack' || combatDecision.kind === 'wait') && target) {
      playerMotor.stopPlanar();
      rotateTowardsSmooth(hero, target.x, target.z, dt);
      const desiredYaw = Math.atan2(target.x - player.x, target.z - player.z);
      const facing = Math.cos(desiredYaw - (hero.root?.rotation.y ?? desiredYaw));
      if (combatDecision.kind === 'attack' && facing > 0.97) performAttack(combatDecision.skillIndex);
    }
  }

  const motion = playerMotor.step(desiredDirection, player.stats.speed, dt, maxMoveDistance);
  const actorDelta = restrictActorOverlap(hero, player, { x: motion.dx, z: motion.dz });
  const resolvedPlayer = collisionWorld.resolve(player, actorDelta, 0.46);
  player.x = resolvedPlayer.x;
  player.z = resolvedPlayer.z;
  // Keep intent while sliding; repeatedly zeroing acceleration at a contact caused sticky walls.
  enforcePlayerBoundary();
  const moved = Math.hypot(player.x - hero.x, player.z - hero.z) > 0.001;
  if (!manualMovement && resolvedPlayer.blocked && !moved) {
    hero.navPath = undefined; hero.navCooldown = Math.max(hero.navCooldown ?? 0, 0.25);
  }
  if (moved && hero.root) {
    const desiredAngle = Math.atan2(motion.facingX, motion.facingZ);
    hero.root.rotation.y = smoothAngle(hero.root.rotation.y, desiredAngle, 16, dt);
    setEntityAction(hero, motion.grounded ? 'walk' : 'jump');
  } else if (!motion.grounded) setEntityAction(hero, 'jump');
  else if (hero.actionType === 'walk' || hero.actionType === 'jump') setEntityAction(hero, 'idle');
  if (state.interactionTarget && Math.hypot(state.interactionTarget.x - player.x, state.interactionTarget.z - player.z) < 3.2) {
    const npc = state.interactionTarget;
    state.interactionTarget = null;
    state.moveTarget = null;
    interactNpc(npc);
  }
  hero.x = player.x;
  hero.z = player.z;
  syncEntityTransform(hero, motion.height);
  const previousPhase = hero.motion?.phase ?? 0;
  hero.motion?.advance(dt, Math.hypot(player.x - (hero.previousX ?? player.x), player.z - (hero.previousZ ?? player.z)));
  const phase = hero.motion?.phase ?? 0;
  if (motion.grounded && hero.actionType === 'walk' && moved
    && [0.24, 0.75].some(contact => phase >= previousPhase ? previousPhase < contact && phase >= contact : previousPhase < contact || phase >= contact)) gameAudio.footstep();
  for (const entity of state.entities) {
    if (entity.kind === 'monster') updateMonster(entity, dt);
    else if (entity.kind === 'summon') updateSummon(entity, dt);
    else if (entity.kind === 'npc') updateTownNpc(entity, dt);
    else if (entity.kind === 'ambient') updateAmbientResident(entity, dt);
    if (entity !== hero) entity.motion?.advance(dt, Math.hypot(entity.x - (entity.previousX ?? entity.x), entity.z - (entity.previousZ ?? entity.z)));
  }
  state.effects.forEach((effect) => effect.update(dt));
  state.effects = state.effects.filter((effect) => !effect.dead);
  updateTargetIndicator();
  gameAudio.update(dt);
  gameAudio.setRegion(zoneAt(player.x, player.z).kind === 'safe');
  state.bossTimers.mini = Math.max(0, state.bossTimers.mini - dt);
  state.bossTimers.big = Math.max(0, state.bossTimers.big - dt);
  if (__QA_BUILD__) qaMotionSample?.();
}

function restoreEntityAfterRespawn(entity: Entity): void {
  entity.status = {};
  entity.attackCd = rand(0.25, 0.8);
  recreateEntityVisual(entity);
  syncEntityTransform(entity);
}

function updateMonster(entity: Entity, dt: number): void {
  if (!entity.alive) {
    const events = entity.lifecycle?.tick(dt) ?? [];
    entity.respawn = entity.lifecycle?.remaining ?? Math.max(0, entity.respawn - dt);
    const lifecycleState = entity.lifecycle?.state;
    entity.aiState = lifecycleState === 'death' ? 'dead' : lifecycleState === 'corpse' ? 'corpse' : 'despawn';
    if (entity.aiState === 'corpse') entity.aiBrain?.forceLifecycle('corpse');
    else if (entity.aiState === 'despawn') entity.aiBrain?.forceLifecycle('despawn');
    if (events.includes('corpse-finished')) disposeEntityVisual(entity);
    if (events.includes('respawn') || (!entity.lifecycle && entity.respawn <= 0)) {
      entity.alive = true;
      entity.hp = entity.maxHp;
      entity.atk = entity.baseAtk;
      entity.phase = 1;
      entity.x = entity.homeX ?? entity.x;
      entity.z = entity.homeZ ?? entity.z;
      const safeSpawn = collisionWorld.findNearestFree(entity, entityCollisionRadius(entity));
      entity.x = safeSpawn.x;
      entity.z = safeSpawn.z;
      entity.patrolIndex = Math.floor(rand(0, Math.max(1, entity.patrol?.length ?? 1)));
      entity.patrolPause = rand(0.35, 1.5);
      entity.navPath = undefined;
      entity.navIndex = 0;
      entity.aiBrain?.reset(entity.x * 0.173 + entity.z * 0.127 + (entity.visualGeneration ?? 0));
      entity.aiState = 'spawn';
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
  if (safe || player.dead) cancelActorAttack(entity);
  const homeX = entity.homeX ?? entity.x;
  const homeZ = entity.homeZ ?? entity.z;
  const homeDistance = Math.hypot(entity.x - homeX, entity.z - homeZ);
  const selected = targeting.isSelected(entity);
  if (entity.visualActive === false && !selected) {
    if (entity.actionType === 'walk') setEntityAction(entity, 'idle');
    return;
  }
  const patrol = entity.patrol ?? [];
  const patrolPoint = patrol[entity.patrolIndex ?? 0];
  const atPatrolPoint = !patrolPoint || Math.hypot(patrolPoint.x - entity.x, patrolPoint.z - entity.z) < 0.55;
  const decision = entity.aiBrain?.update({
    dt,
    alive: entity.alive,
    playerSafe: safe,
    playerDistance: distance,
    homeDistance,
    atPatrolPoint,
    aggroRadius: entity.aggroRadius ?? 9,
    leashRadius: entity.leashRadius ?? 14,
    attackRange: monsterReach(entity),
  });
  if (!decision) return;
  entity.aiState = decision.state;
  if (decision.changed && decision.state === 'patrol' && patrol.length) {
    entity.patrolIndex = ((entity.patrolIndex ?? 0) + 1) % patrol.length;
  }
  if (entity.status.stun) {
    cancelActorAttack(entity);
    setEntityAction(entity, 'idle');
  } else if (entity.activeAttack && !safe && homeDistance < (entity.leashRadius ?? 14)) {
    // Finish the committed swing; moving out of reach avoids its hit without
    // restarting chase/attack on every tick at the range boundary.
    rotateTowardsSmooth(entity, player.x, player.z, dt);
  } else if (decision.intent === 'chase') {
    const speed = monsterMovementSpeed(Boolean(entity.boss)) * (entity.status.slow ? 0.45 : 1);
    const moved = moveEntityAlongNavigation(entity, player, speed, dt, entityCollisionRadius(entity));
    rotateTowardsSmooth(entity, player.x, player.z, dt);
    setEntityAction(entity, moved ? 'walk' : 'idle');
  } else if (decision.intent === 'attack') {
    rotateTowardsSmooth(entity, player.x, player.z, dt);
    if (entity.attackCd <= 0) {
      const token = entity.attackToken = (entity.attackToken ?? 0) + 1;
      entity.activeAttack = { token, target: playerEntity(), impacted: false };
      const timings = entity.motion?.beginAttack() ?? combatTimings('monster');
      entity.actionType = 'attack';
      entity.attackCd = entity.boss ? 1.45 : 2.05;
      const generation = entity.visualGeneration;
      queueAttackTimeline(new AttackTimeline(timings), () => {
        if (entity.alive && Math.hypot(player.x - entity.x, player.z - entity.z) < monsterReach(entity) + 0.25) {
          hurtPlayer(Math.max(1, Math.round((entity.atk ?? 1) - player.stats.def * 0.2)));
        }
      }, () => {
        if (entity.alive && entity.visualGeneration === generation && entity.attackToken === token) {
          entity.activeAttack = undefined; setEntityAction(entity, 'idle');
        }
      }, () => entity.alive && entity.visualGeneration === generation && entity.attackToken === token && !player.dead);
    }
  } else if (decision.intent === 'return') {
    cancelActorAttack(entity);
    const moved = moveEntityAlongNavigation(entity, { x: homeX, z: homeZ }, monsterMovementSpeed(Boolean(entity.boss)) * 0.9, dt, entityCollisionRadius(entity));
    rotateTowardsSmooth(entity, homeX, homeZ, dt);
    setEntityAction(entity, moved ? 'walk' : 'idle');
  } else if (decision.intent === 'patrol' && patrol.length) {
    const target = patrol[entity.patrolIndex ?? 0];
    const speed = monsterMovementSpeed(Boolean(entity.boss)) * 0.46;
    const moved = moveEntityAlongNavigation(entity, target, speed, dt, entityCollisionRadius(entity));
    rotateTowardsSmooth(entity, target.x, target.z, dt);
    setEntityAction(entity, moved ? 'walk' : 'idle');
  } else {
    entity.navPath = undefined;
    entity.navIndex = 0;
    setEntityAction(entity, 'idle');
  }
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
    const hero = playerEntity(); hero.x = player.x; hero.z = player.z; recreateEntityVisual(hero);
    playerMotor.reset(); cameraControl.snap({ x: player.x, y: 0, z: player.z });
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
  const hero = playerEntity();
  if (hero.activeAttack || !playerMotor.grounded || Math.hypot(player.x - target.x, player.z - target.z) > attackRange() + 0.05) return;
  const skill = skillIndex === null ? null : CLASSES_MAP[player.classId].skills[skillIndex];
  if (skillIndex !== null) {
    if (!skill || player.cooldowns[skillIndex] > 0 || player.mp < skill.cost) return;
    player.mp -= skill.cost;
    player.cooldowns[skillIndex] = skill.cd;
  } else if (player.attackCd > 0) return;
  const ranged = CLASSES_MAP[player.classId].ranged;
  player.attackCd = classCombatProfile(player.classId, player.level, player.stats).attackInterval;
  combatControl.completeAttack(skillIndex);
  playerMotor.stopPlanar();
  const token = hero.attackToken = (hero.attackToken ?? 0) + 1;
  hero.activeAttack = { token, target, impacted: false };
  hero.actionType = 'attack';
  const timings = hero.motion?.beginAttack(player.attackCd * 0.92) ?? combatTimings(ranged ? 'ranged' : 'melee');
  const generation = target.visualGeneration;
  const magic = player.classId === 'mage' || player.classId === 'necro';
  const base = magic ? player.stats.matk : rand(player.stats.atkMin, player.stats.atkMax);
  const multiplier = skill?.mul ?? 1;
  const critical = Math.random() < player.stats.crit / 100;
  const damage = Math.max(1, Math.round(base * multiplier * (critical ? classCombatProfile(player.classId, player.level, player.stats).critMultiplier : 1)));
  void gateway.send({ type: 'attack', entityId: target.uid, skillIndex });
  queueAttackTimeline(new AttackTimeline(timings), () => {
    if (!target.alive || player.dead) return;
    if (hero.activeAttack) hero.activeAttack.impacted = true;
    if (!ranged && Math.hypot(player.x - target.x, player.z - target.z) > attackRange() + 0.25) return;
    playSfx(skill?.fx ?? 'attack');
    gameAudio.play(ranged ? 'swordClash' : 'swordSwing', ranged ? 0.34 : 0.7, 0.94 + Math.random() * 0.12);
    spawnAttackEffect(skill?.fx ?? (magic ? 'fire' : ranged ? 'arrow' : 'slash'), hero, target, () => {
      if (!target.alive || target.visualGeneration !== generation) return;
      if (skill?.chain) {
        const chainHits = resolveChainLightning(
          target,
          state.entities.filter((entity) => entity.kind === 'monster'),
          { maxTargets: skill.chain, radius: skill.chainRadius ?? 6.5, falloff: skill.chainFalloff ?? 0.76 },
        );
        damageMonster(target, damage, critical);
        const strikeJump = (index: number): void => {
          const hit = chainHits[index];
          if (!hit) return;
          if (!hit.source || !hit.target.alive) return strikeJump(index + 1);
          spawnAttackEffect('lightning', hit.source, hit.target, () => {
            damageMonster(hit.target, Math.max(1, Math.round(damage * hit.multiplier)), false);
            strikeJump(index + 1);
          });
        };
        strikeJump(1);
      } else {
        let victims = [target];
        if (skill?.aoe) victims = state.entities.filter((entity) => entity.kind === 'monster' && entity.alive && Math.hypot(entity.x - target.x, entity.z - target.z) < (skill.aoe ?? 0));
        victims.forEach((entity, index) => damageMonster(entity, Math.round(damage * (index ? 0.72 : 1)), critical && index === 0));
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
  }, () => {
    if (hero.attackToken === token) {
      hero.activeAttack = undefined;
      if (!player.dead) setEntityAction(hero, 'idle');
    }
  }, () => !player.dead && hero.attackToken === token && target.alive && target.visualGeneration === generation);
}

function queueAttackTimeline(timeline: AttackTimeline, onImpact: () => void, onComplete?: () => void, valid?: () => boolean): void {
  state.effects.push({ update(dt) {
    if (valid && !valid()) { onComplete?.(); this.dead = true; return; }
    const events = timeline.tick(dt);
    if (events.includes('impact')) onImpact();
    if (events.includes('complete')) {
      onComplete?.();
      this.dead = true;
    }
  } });
}

function entityWorldPosition(entity: Entity, height = 1.4): Vector3 {
  return new Vector3(entity.x, terrain.supportAt(entity.x, entity.z) + height, entity.z);
}

function spawnAttackEffect(type: string, from: Entity, to: Entity, onHit?: () => void): void {
  if (type === 'slash') {
    // A sword connects on its contact frame, not after a second projectile timer.
    onHit?.();
    return;
  }
  if (type === 'lightning') {
    spawnLightningArc(from, to, onHit);
    return;
  }
  const colors: Record<string, Color3> = {
    fire: new Color3(1, 0.2, 0.04), ice: new Color3(0.25, 0.75, 1), arrow: new Color3(0.8, 0.7, 0.45),
    bone: new Color3(0.85, 0.82, 0.7), drain: new Color3(0.15, 0.9, 0.55), curse: new Color3(0.52, 0.12, 0.9),
    lightning: new Color3(0.35, 0.75, 1), poison: new Color3(0.35, 0.85, 0.2), slash: new Color3(0.9, 0.65, 0.25),
  };
  const start = entityWorldPosition(from);
  let end = entityWorldPosition(to);
  const projectile = MeshBuilder.CreateSphere(`effect-${type}-${uid()}`, { diameter: type === 'arrow' ? 0.14 : 0.32, segments: 8 }, scene);
  const material = new StandardMaterial(`effect-material-${uid()}`, scene);
  material.emissiveColor = colors[type] ?? colors.slash;
  material.disableLighting = true;
  projectile.material = material;
  projectile.position.copyFrom(start);
  if (type === 'arrow') {
    projectile.scaling.z = 4.2;
    projectile.lookAt(end);
  }
  projectile.isPickable = false;
  glow.addIncludedOnlyMesh(projectile);
  let life = 0;
  const duration = type === 'slash' ? 0.18 : 0.28;
  state.effects.push({ update(dt) {
    life += dt;
    end = entityWorldPosition(to);
    projectile.position.copyFrom(Vector3.Lerp(start, end, clamp(life / duration, 0, 1)));
    if (type !== 'arrow') projectile.scaling.setAll(1 + Math.sin(life * 30) * 0.16);
    if (life >= duration) {
      this.dead = true;
      projectile.dispose(false, true);
      onHit?.();
      impactEffect(end, material.emissiveColor);
    }
  } });
}

function spawnLightningArc(from: Entity, to: Entity, onHit?: () => void): void {
  const start = entityWorldPosition(from);
  const end = entityWorldPosition(to);
  const direction = end.subtract(start);
  const side = new Vector3(-direction.z, 0, direction.x).normalize();
  const points: Vector3[] = [];
  const segments = 9;
  for (let index = 0; index <= segments; index += 1) {
    const ratio = index / segments;
    const point = Vector3.Lerp(start, end, ratio);
    if (index > 0 && index < segments) {
      const zigzag = (index % 2 ? 1 : -1) * (0.1 + Math.sin(index * 4.13) * 0.07);
      point.addInPlace(side.scale(zigzag));
      point.y += Math.sin(ratio * Math.PI) * 0.3 + Math.cos(index * 2.7) * 0.06;
    }
    points.push(point);
  }
  const bolt = MeshBuilder.CreateLines(`lightning-${uid()}`, { points }, scene);
  bolt.color = new Color3(0.42, 0.78, 1);
  bolt.alpha = 0.96;
  bolt.isPickable = false;
  let life = 0;
  state.effects.push({ update(dt) {
    life += dt;
    bolt.alpha = Math.max(0, 1 - life / 0.14);
    if (life >= 0.14) {
      onHit?.();
      impactEffect(entityWorldPosition(to), new Color3(0.36, 0.7, 1));
      bolt.dispose();
      this.dead = true;
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
  playHitReaction(entity);
  damageNumber(entity, `${critical ? 'КРИТ ' : ''}−${damage}`, critical ? '#ffd36b' : '#f1e9da', critical);
  if (showEffect) impactEffect(entityWorldPosition(entity), Color3.FromHexString(`#${(entity.tint ?? 0xaa6655).toString(16).padStart(6, '0')}`));
  gameAudio.play('monsterHit', entity.boss ? 0.7 : 0.38, 0.88 + Math.random() * 0.2);
  if ((entity.hp ?? 0) <= 0) killMonster(entity);
}

function playHitReaction(entity: Entity): void {
  entity.motion?.reactToHit();
}

function killMonster(entity: Entity): void {
  if (!entity.alive) return;
  cancelActorAttack(entity);
  entity.alive = false;
  if (entity.root && entity.baseScale) entity.root.scaling.copyFrom(entity.baseScale);
  entity.pickVolume?.setEnabled(false);
  setEntityAction(entity, 'death', true);
  gameAudio.play('monsterDeath', entity.boss ? 0.9 : 0.52, entity.boss ? 0.75 : 0.92 + Math.random() * 0.12);
  const definition = MONSTERS_MAP[entity.id ?? 'wolf'];
  entity.respawn = definition.boss ? bossRespawnSeconds(definition.boss) : rand(28, 48);
  entity.lifecycle ??= new MonsterLifecycle();
  entity.lifecycle.kill(entity.respawn, 0.65);
  entity.aiState = 'dead';
  entity.aiBrain?.forceLifecycle('dead');
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
    disposeEntityVisual(summon);
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
  warm: { x: -7, z: -6.2 },
  trade: { x: 1.1, z: -8.5 },
  work: { x: -16.4, z: -11.35 },
  guard: { x: -7, z: -22.2 },
  talk: { x: -7, z: -5.0 },
};

function navigationWaypoint(entity: Entity, destination: Readonly<{ x: number; z: number }>, dt: number, actorRadius: number) {
  entity.navCooldown = Math.max(0, (entity.navCooldown ?? 0) - dt);
  const goalMoved = Math.hypot((entity.navGoalX ?? Infinity) - destination.x, (entity.navGoalZ ?? Infinity) - destination.z) > 0.7;
  if (entity.navCooldown <= 0 && (goalMoved || !entity.navPath?.length) && navigationBudget > 0) {
    navigationBudget -= 1;
    entity.navPath = findNavigationPath(collisionWorld, entity, destination, { actorRadius, cellSize: 0.85, margin: entity.kind === 'player' ? 24 : 10, maxVisited: 4500 });
    entity.navIndex = 0;
    entity.navGoalX = destination.x;
    entity.navGoalZ = destination.z;
    entity.navCooldown = entity.navPath.length ? (entity.kind === 'player' ? 0.18 : 0.65) : 1;
  }
  let waypoint = entity.navPath?.[entity.navIndex ?? 0];
  while (waypoint && Math.hypot(waypoint.x - entity.x, waypoint.z - entity.z) < (entity.kind === 'player' ? 0.1 : 0.24)) {
    entity.navIndex = (entity.navIndex ?? 0) + 1;
    waypoint = entity.navPath?.[entity.navIndex];
  }
  return waypoint;
}

function moveEntityAlongNavigation(entity: Entity, destination: Readonly<{ x: number; z: number }>, speed: number, dt: number, actorRadius = 0.4): boolean {
  const waypoint = navigationWaypoint(entity, destination, dt, actorRadius);
  if (!waypoint) return false;
  const dx = waypoint.x - entity.x;
  const dz = waypoint.z - entity.z;
  const distance = Math.max(0.0001, Math.hypot(dx, dz));
  let separationX = 0;
  let separationZ = 0;
  for (const neighbor of nearbyActors(entity)) {
    if (neighbor === entity) continue;
    const sharesCrowd = entity.kind === 'monster'
      ? neighbor.kind === 'monster' && neighbor.alive
      : neighbor.kind === 'ambient' || neighbor.kind === 'npc';
    if (!sharesCrowd) continue;
    const sx = entity.x - neighbor.x;
    const sz = entity.z - neighbor.z;
    const gap = Math.hypot(sx, sz);
    const desiredGap = actorBodyRadius(entity) + actorBodyRadius(neighbor) + 0.18;
    if (gap > 0.001 && gap < desiredGap) {
      separationX += (sx / gap) * (desiredGap - gap) * 0.85;
      separationZ += (sz / gap) * (desiredGap - gap) * 0.85;
    }
  }
  const intentX = dx / distance + separationX;
  const intentZ = dz / distance + separationZ;
  const intentLength = Math.max(0.001, Math.hypot(intentX, intentZ));
  const step = Math.min(distance, speed * dt);
  const moved = moveEntityWithCollision(entity, (intentX / intentLength) * step, (intentZ / intentLength) * step, true);
  rotateTowardsSmooth(entity, waypoint.x, waypoint.z, dt);
  if (!moved) { entity.navPath = undefined; entity.navCooldown = Math.max(entity.navCooldown ?? 0, 0.3); }
  return moved;
}

function updateTownNpc(entity: Entity, dt: number): void {
  if (entity.visualActive === false) return;
  if (entity.role !== 'smith') return;
  rotateTowardsSmooth(entity, -16.4, -11.35, dt);
  entity.npcActionTimer = (entity.npcActionTimer ?? 0) - dt;
  entity.npcActionRelease = Math.max(0, (entity.npcActionRelease ?? 0) - dt);
  if (entity.npcActionTimer <= 0) {
    setEntityAction(entity, 'attack', true);
    gameAudio.play('hammer', 0.58, 0.94 + Math.random() * 0.1);
    entity.npcActionRelease = 0.68;
    entity.npcActionTimer = 3.1 + Math.random() * 1.5;
  } else if (entity.actionType === 'attack' && entity.npcActionRelease <= 0) {
    setEntityAction(entity, 'idle');
  }
}

function updateAmbientResident(entity: Entity, dt: number): void {
  if (entity.visualActive === false) return;
  const decision = entity.ambientBrain?.update(dt, entity);
  if (!decision) return;
  entity.ambientActivity = decision.waypoint.activity;
  if (decision.state === 'walk') {
    const moved = moveEntityAlongNavigation(entity, decision.waypoint, entity.moveSpeed ?? 1.1, dt);
    setEntityAction(entity, moved ? 'walk' : 'idle');
    return;
  }
  entity.navPath = undefined;
  entity.navIndex = 0;
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

function initAudio(): void { void gameAudio.unlock(); }

function playSfx(type: string): void {
  if (type === 'loot') gameAudio.play('coin', 0.62, 1.05);
  else if (type === 'attack' || type === 'slash') gameAudio.play('swordSwing', 0.48, 1);
  else gameAudio.play('meleeImpact', 0.32, type === 'lightning' ? 1.35 : 1.02);
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
  q('#xp-text').textContent = `EXP ${player.xp.toLocaleString('ru-RU')} / ${xpNeeded(player.level).toLocaleString('ru-RU')} · ${Math.floor(clamp(player.xp / Math.max(1, xpNeeded(player.level)), 0, 1) * 100)}%`;
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
  potionButton.classList.toggle('disabled', potionCount <= 0);
  etherButton.classList.toggle('disabled', etherCount <= 0);
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
  const mapX = (x: number) => ((x + 160) / 320) * minimap.width;
  const mapY = (z: number) => ((z + 140) / 280) * minimap.height;
  context.strokeStyle = '#847252'; context.lineWidth = 4; context.beginPath();
  context.moveTo(mapX(-108), mapY(-82)); context.lineTo(mapX(-7), mapY(-5)); context.lineTo(mapX(35), mapY(18)); context.lineTo(mapX(72), mapY(52)); context.lineTo(mapX(104), mapY(48)); context.lineTo(mapX(136), mapY(101)); context.stroke();
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
  const pick = scene.pick(event.offsetX, event.offsetY, mesh => mesh.isPickable && Boolean(mesh.metadata?.entity?.alive))
    ?? null;
  const hit = pick?.hit ? pick : scene.pick(event.offsetX, event.offsetY, mesh => mesh === ground);
  if (!hit?.hit || !hit.pickedPoint) return;
  const hero = playerEntity(); hero.navPath = undefined; hero.navCooldown = 0;
  let mesh: AbstractMesh | null = hit.pickedMesh;
  let entity: Entity | undefined;
  while (mesh && !entity) {
    entity = (mesh.metadata as { entity?: Entity } | null)?.entity;
    mesh = mesh.parent as AbstractMesh | null;
  }
  if (entity) {
    if (entity.kind === 'monster') {
      if (hero.activeAttack?.target !== entity) cancelActorAttack(hero);
      targeting.select(entity);
      combatControl.engageBasic(entity.uid);
      gameAudio.play('monsterAggro', entity.boss ? 0.65 : 0.28, entity.boss ? 0.78 : 1.05);
      state.moveTarget = null;
      state.interactionTarget = null;
      void gateway.send({ type: 'target', entityId: entity.uid });
      return;
    }
    if (entity.kind === 'npc') {
      cancelActorAttack(hero);
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
  if ((hit.pickedMesh?.metadata as { ground?: boolean } | null)?.ground) {
    cancelActorAttack(hero);
    state.moveTarget = collisionWorld.findNearestFree({ x: hit.pickedPoint.x, z: hit.pickedPoint.z }, 0.46);
    state.interactionTarget = null;
    combatControl.cancelPursuit();
    void gateway.send({ type: 'move', x: hit.pickedPoint.x, z: hit.pickedPoint.z });
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
  q('#window-content').innerHTML = `<h2>Инвентарь</h2>${tabs('inventory')}<div class="inventory-shell"><div class="paper-doll"><div class="doll-art"></div><div class="equipment-grid">${EQUIPMENT_SLOTS.map((slot) => `<button class="equip-slot ${player.equipment[slot] ? 'filled' : ''}" title="${SLOT_NAMES_MAP[slot]} — нажмите, чтобы снять" data-equip="${slot}" data-slot="${slot}">${player.equipment[slot] ? formatItem(player.equipment[slot] as ItemInstance) : `<span>${SLOT_NAMES_MAP[slot]}</span>`}</button>`).join('')}</div></div><div class="bag-panel"><div class="bag-toolbar"><b>ПОХОДНАЯ СУМКА</b><span>${player.inventory.length} / ${INVENTORY_CAPACITY} · ◈ ${player.gold.toLocaleString()} ${state.lootBuffer.length ? `· Буфер: ${state.lootBuffer.length} <button class="dark-btn" id="collect-buffer">Забрать</button>` : ''}</span></div><div class="bag-grid">${player.inventory.map((item, index) => `<button class="item-card ${index === selected ? 'selected' : ''}" title="${itemDef(item).name}${item.count > 1 ? ` ×${item.count}` : ''}" data-item="${index}">${formatItem(item)}</button>`).join('')}${Array(Math.max(0, INVENTORY_CAPACITY - player.inventory.length)).fill('<div class="empty-slot"></div>').join('')}</div><div class="item-details" id="item-details"><b>Сравнение экипировки</b><br>Выберите предмет. Характеристики покажут разницу с надетой вещью.</div></div></div>`;
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
  const statKeys: Array<[keyof ItemDef, string]> = [['def', 'Защита'], ['mdef', 'Маг. защита'], ['hp', 'HP'], ['mp', 'MP'], ['matk', 'Маг. атака'], ['crit', 'Крит'], ['accuracy', 'Точность'], ['evasion', 'Уклонение'], ['speed', 'Скорость']];
  const currentDef = current ? itemDef(current) : undefined;
  const deltas = definition.slot ? statKeys.map(([key, label]) => {
    const next = Number(definition[key] ?? 0); const equipped = Number(currentDef?.[key] ?? 0); const delta = next - equipped;
    return next || equipped ? `<span class="${delta >= 0 ? 'compare-positive' : 'compare-negative'}">${label}: ${next || 0} (${delta >= 0 ? '+' : ''}${delta})</span>` : '';
  }).filter(Boolean) : [];
  if (definition.atk) {
    const oldAtk = currentDef?.atk ?? [0, 0]; const deltaMin = definition.atk[0] - oldAtk[0]; const deltaMax = definition.atk[1] - oldAtk[1];
    deltas.unshift(`<span class="${deltaMin + deltaMax >= 0 ? 'compare-positive' : 'compare-negative'}">Урон: ${definition.atk[0]}–${definition.atk[1]} (${deltaMin >= 0 ? '+' : ''}${deltaMin}/${deltaMax >= 0 ? '+' : ''}${deltaMax})</span>`);
  }
  const compare = definition.slot ? `<br><span style="color:#c4a876">Надето: ${current ? `${itemDef(current).name}${current.plus ? ` +${current.plus}` : ''}` : 'ничего'}</span>${deltas.length ? `<div class="stat-columns">${deltas.join('')}</div>` : ''}` : '';
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
  const range = (id: string, label: string, value: number, min: number, max: number, step: number, suffix = '') => `<div class="setting"><label>${label}<b id="${id}-value">${value}${suffix}</b></label><input id="${id}" type="range" min="${min}" max="${max}" step="${step}" value="${value}" data-setting-range="${id}" data-suffix="${suffix}"></div>`;
  q('#window-content').innerHTML = `<h2>Настройки</h2>${tabs('settings')}<div class="settings-grid">
    <section><h3>Экран и графика</h3>
      <div class="setting"><label>Профиль качества<select id="quality"><option value="low">Производительность</option><option value="medium">Среднее</option><option value="high">Высокое</option><option value="ultra">Ультра</option></select></label></div>
      <div class="setting"><label>Масштаб рендера<select id="resolution-scale"><option value="0.5">50%</option><option value="0.65">65%</option><option value="0.75">75%</option><option value="0.82">82%</option><option value="1">100%</option><option value="1.1">110%</option><option value="1.25">125%</option></select></label></div>
      <div class="setting"><label>Качество текстур<select id="texture-quality"><option value="medium">Среднее</option><option value="high">Высокое</option><option value="ultra">Ультра</option></select></label></div>
      <div class="setting"><label>Тени<select id="shadow-quality"><option value="off">Выкл.</option><option value="low">Низкие</option><option value="high">Высокие</option><option value="ultra">Ультра</option></select></label></div>
      <div class="setting"><label>Плотность леса<select id="foliage"><option value="low">Низкая</option><option value="medium">Средняя</option><option value="high">Высокая</option></select></label></div>
      <div class="setting"><label>Сглаживание <input type="checkbox" id="anti-aliasing" ${s.antiAliasing ? 'checked' : ''}></label></div>
      <div class="setting"><label>Свечение <input type="checkbox" id="bloom" ${s.bloom ? 'checked' : ''}></label></div>
      ${range('exposure', 'Яркость', Math.round(s.exposure * 100), 70, 135, 1, '%')}
      ${range('contrast', 'Контраст', Math.round(s.contrast * 100), 80, 145, 1, '%')}
      ${range('saturation', 'Насыщенность', Math.round(s.saturation * 100), 50, 130, 1, '%')}
      ${range('fog', 'Плотность тумана', Math.round(s.fog * 100), 0, 160, 5, '%')}
      <p class="settings-note">Окно: ${window.innerWidth}×${window.innerHeight}. 3D: ${engine.getRenderWidth()}×${engine.getRenderHeight()}. Профиль ограничивает число пикселей; при перегрузке масштаб 3D адаптируется до 65%. Текст/UI не уменьшается. Полный экран — только по нажатию.</p>
    </section>
    <section><h3>Камера и управление</h3>
      ${range('mouse-sensitivity', 'Чувствительность мыши', Math.round(s.mouseSensitivity * 100), 25, 250, 5, '%')}
      ${range('zoom-sensitivity', 'Скорость приближения', Math.round(s.zoomSensitivity * 100), 35, 220, 5, '%')}
      ${range('camera-smoothing', 'Плавность камеры', Math.round(s.cameraSmoothing * 100), 55, 180, 5, '%')}
      ${range('camera-fov', 'Поле зрения', Math.round(s.fov * 100), 65, 105, 1, '')}
      ${range('ui-scale', 'Масштаб интерфейса', Math.round(s.uiScale * 100), 80, 125, 5, '%')}
      <div class="setting"><label>Инвертировать вертикаль <input type="checkbox" id="invert-y" ${s.invertCameraY ? 'checked' : ''}></label></div>
      <div class="setting"><label>Цифры урона <input type="checkbox" id="damage" ${s.damage ? 'checked' : ''}></label></div>
      <div class="setting"><label>Эффект получения урона <input type="checkbox" id="shake" ${s.screenShake ? 'checked' : ''}></label></div>
      <div class="setting"><label>Зелье здоровья<select id="potion-binding">${bindingOptions(s.keybinds.potion)}</select></label></div>
      <div class="setting"><label>Зелье ресурса<select id="ether-binding">${bindingOptions(s.keybinds.ether)}</select></label></div>
      <div class="stat-row"><span>Движение / прыжок</span><b>WASD / Space</b></div><div class="stat-row"><span>Камера</span><b>ПКМ / колесо</b></div>
    </section>
    <section><h3>Звук</h3>
      ${[['master', 'Общая громкость'], ['music', 'Фоновая музыка'], ['ambience', 'Природа и лес'], ['sfx', 'Бой и монстры'], ['ui', 'Интерфейс']].map(([id, name]) => range(id, name, Math.round((s[id as keyof Settings] as number) * 100), 0, 100, 1, '%')).join('')}
      <div class="setting"><label>Приглушать вне окна <input type="checkbox" id="mute-on-blur" ${s.muteOnBlur ? 'checked' : ''}></label></div>
      <h3>Режим отображения</h3><button class="dark-btn" id="fullscreen">Полный экран</button>
      <div class="settings-actions"><button class="gold-btn" id="save-settings">Применить</button><button class="dark-btn" id="reset-settings">Сбросить</button></div>
      <p class="settings-note">Изменение плотности леса применяется после следующего входа в мир. Остальные параметры — сразу.</p>
    </section>
  </div>`;
  bindTabs(); q<HTMLSelectElement>('#quality').value = s.quality;
  q<HTMLSelectElement>('#resolution-scale').value = String(s.resolutionScale);
  q<HTMLSelectElement>('#texture-quality').value = s.textureQuality;
  q<HTMLSelectElement>('#shadow-quality').value = s.shadowQuality;
  q<HTMLSelectElement>('#foliage').value = s.foliage;
  q<HTMLSelectElement>('#quality').onchange = () => {
    const preset = qualityPreset(q<HTMLSelectElement>('#quality').value as Settings['quality']);
    q<HTMLSelectElement>('#resolution-scale').value = String(preset.resolutionScale);
    q<HTMLSelectElement>('#texture-quality').value = preset.textureQuality;
    q<HTMLSelectElement>('#shadow-quality').value = preset.shadowQuality;
    q<HTMLSelectElement>('#foliage').value = preset.foliage;
    q<HTMLInputElement>('#anti-aliasing').checked = preset.antiAliasing;
    q<HTMLInputElement>('#bloom').checked = preset.bloom;
  };
  qa<HTMLInputElement>('[data-setting-range]').forEach((input) => { input.oninput = () => { q(`#${input.id}-value`).textContent = `${input.value}${input.dataset.suffix ?? ''}`; }; });
  q<HTMLButtonElement>('#fullscreen').onclick = () => { if (document.fullscreenElement) void document.exitFullscreen(); else void canvas.requestFullscreen(); };
  q<HTMLButtonElement>('#reset-settings').onclick = () => { Object.assign(s, settingsDefaults()); renderSettings(); };
  q<HTMLButtonElement>('#save-settings').onclick = () => {
    const requestedBindings = {
      potion: q<HTMLSelectElement>('#potion-binding').value,
      ether: q<HTMLSelectElement>('#ether-binding').value,
    };
    if (requestedBindings.potion === requestedBindings.ether) {
      toast('Для расходников нужны разные клавиши', 'bad');
      return;
    }
    s.quality = q<HTMLSelectElement>('#quality').value as Settings['quality'];
    s.resolutionScale = Number(q<HTMLSelectElement>('#resolution-scale').value);
    s.textureQuality = q<HTMLSelectElement>('#texture-quality').value as Settings['textureQuality'];
    s.shadowQuality = q<HTMLSelectElement>('#shadow-quality').value as Settings['shadowQuality'];
    s.foliage = q<HTMLSelectElement>('#foliage').value as Settings['foliage'];
    s.shadows = s.shadowQuality !== 'off'; s.antiAliasing = q<HTMLInputElement>('#anti-aliasing').checked;
    s.bloom = q<HTMLInputElement>('#bloom').checked; s.damage = q<HTMLInputElement>('#damage').checked; s.screenShake = q<HTMLInputElement>('#shake').checked;
    s.exposure = Number(q<HTMLInputElement>('#exposure').value) / 100; s.contrast = Number(q<HTMLInputElement>('#contrast').value) / 100;
    s.saturation = Number(q<HTMLInputElement>('#saturation').value) / 100; s.fog = Number(q<HTMLInputElement>('#fog').value) / 100;
    s.mouseSensitivity = Number(q<HTMLInputElement>('#mouse-sensitivity').value) / 100; s.zoomSensitivity = Number(q<HTMLInputElement>('#zoom-sensitivity').value) / 100;
    s.cameraSmoothing = Number(q<HTMLInputElement>('#camera-smoothing').value) / 100; s.fov = Number(q<HTMLInputElement>('#camera-fov').value) / 100;
    s.uiScale = Number(q<HTMLInputElement>('#ui-scale').value) / 100; s.invertCameraY = q<HTMLInputElement>('#invert-y').checked;
    s.muteOnBlur = q<HTMLInputElement>('#mute-on-blur').checked;
    s.keybinds = normalizeConsumableBindings(requestedBindings);
    for (const id of ['master', 'music', 'ambience', 'sfx', 'ui']) (s as unknown as Record<string, number>)[id] = Number(q<HTMLInputElement>(`#${id}`).value) / 100;
    applySettings(); updateHud(); saveGame(); toast('Настройки применены'); closeWindow();
  };
}

function applyRenderBudget(): void {
  const budget = effectiveRenderBudget(state.settings.quality, state.settings.shadowQuality,
    state.settings.antiAliasing, state.settings.bloom, resolutionGovernor.detailStep);
  const map = shadows.getShadowMap();
  if (map && map.getSize().width !== budget.shadowSize) map.resize(budget.shadowSize);
  renderPipeline.samples = budget.samples;
  renderPipeline.bloomEnabled = budget.bloom;
  glow.isEnabled = budget.bloom;
  sectorVisibilityCooldown = 0;
}

function applySettings(): void {
  resolutionGovernor.reset();
  applyRenderResolution();
  sectorVisibilityCooldown = 0;
  shadows.setDarkness(0.28);
  moon.shadowEnabled = state.settings.shadows && state.settings.shadowQuality !== 'off';
  renderPipeline.fxaaEnabled = state.settings.antiAliasing;
  applyRenderBudget();
  renderPipeline.bloomWeight = 0.12;
  renderPipeline.bloomThreshold = 0.86;
  scene.imageProcessingConfiguration.exposure = state.settings.exposure;
  scene.imageProcessingConfiguration.contrast = state.settings.contrast;
  colorCurves.globalSaturation = (state.settings.saturation - 1) * 100;
  scene.fogDensity = 0.008 * state.settings.fog;
  scene.environmentIntensity = state.settings.quality === 'low' ? 0.38 : state.settings.quality === 'medium' ? 0.5 : 0.62;
  camera.fov = state.settings.fov;
  camera.maxZ = qualityPreset(state.settings.quality).maxDistance;
  cameraControl.configure({ mouseSensitivity: state.settings.mouseSensitivity, zoomSensitivity: state.settings.zoomSensitivity, smoothing: state.settings.cameraSmoothing, invertY: state.settings.invertCameraY });
  const anisotropy = state.settings.textureQuality === 'ultra' ? 16 : state.settings.textureQuality === 'high' ? 8 : 4;
  scene.textures.forEach((texture) => { texture.anisotropicFilteringLevel = anisotropy; });
  document.documentElement.style.setProperty('--ui-scale', String(state.settings.uiScale));
  fitActionDock();
  gameAudio.apply(state.settings);
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
  const points: Array<[string, number, number, number, number]> = [['Астерхолд', -108, -82, 0, 1], ['Гринфолл', GREENFALL_SPAWN.x, GREENFALL_SPAWN.z, 25, 1], ['Чёрный лес', 94, 44, 90, 10], ['Вход в шахту', 132, 94, 150, 10]];
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
    gameAudio.play('hammer', 0.72, 0.94 + Math.random() * 0.08);
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
  if (id === 'potion') { if (player.hp >= player.maxHp) return toast('Здоровье уже полное'); if (!consumeItem(id)) return toast('Нет багровых зелий', 'bad'); player.hp = Math.min(player.maxHp, player.hp + Math.round(player.maxHp * 0.45)); gameAudio.play('potion', 0.74, 0.92); toast('Здоровье восстановлено'); }
  else if (id === 'ether') { if (player.mp >= player.maxMp) return toast('Ресурс уже полный'); if (!consumeItem(id)) return toast('Нет эфирных зелий', 'bad'); player.mp = Math.min(player.maxMp, player.mp + Math.round(player.maxMp * 0.45)); gameAudio.play('potion', 0.68, 1.12); toast(`${CLASSES_MAP[player.classId].resource} восстановлена`); }
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
  const messages = q<HTMLElement>('#messages'); messages.append(entry);
  while (messages.childElementCount > 80) messages.firstElementChild?.remove();
  messages.scrollTop = messages.scrollHeight;
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

function applyRenderResolution(): void {
  engine.setHardwareScalingLevel(renderScaling(window.innerWidth, window.innerHeight, window.devicePixelRatio,
    state.settings.quality, state.settings.resolutionScale, resolutionGovernor.scale));
  engine.resize();
  fitActionDock();
}
function fitActionDock(): void {
  const dock = q<HTMLElement>('.bottom-cluster');
  if (!dock.offsetWidth) return;
  const scale = Math.min(state.settings.uiScale, (window.innerWidth - 32) / dock.offsetWidth);
  document.documentElement.style.setProperty('--dock-scale', String(scale));
  document.documentElement.style.setProperty('--dock-height', `${dock.offsetHeight * scale}px`);
}
window.addEventListener('resize', applyRenderResolution);
let skipFrameDelta = false;
document.addEventListener('visibilitychange', () => {
  simulationClock.reset(); inputControl.reset(); playerMotor.stopPlanar();
  skipFrameDelta = true;
});
let saveTimer = 0;
const cameraProbeOrigin = new Vector3();
cameraControl.setObstructionProbe((focus, desiredCamera) => {
  const root = playerEntity().root;
  const x = root?.position.x ?? player.x, z = root?.position.z ?? player.z;
  cameraProbeOrigin.set(x, terrain.supportAt(x, z) + 1.25, z);
  const length = Vector3.Distance(cameraProbeOrigin, desiredCamera);
  let allowed = collisionWorld.cameraDistance(cameraProbeOrigin, desiredCamera);
  for (let distance = 0.5; distance <= allowed; distance += 0.5) {
    const t = distance / Math.max(0.001, length);
    const sx = x + (desiredCamera.x - x) * t, sz = z + (desiredCamera.z - z) * t;
    const y = cameraProbeOrigin.y + (desiredCamera.y - cameraProbeOrigin.y) * t;
    if (y < terrain.heightAt(sx, sz) + 0.25) { allowed = Math.max(0, distance - 0.5); break; }
  }
  return Vector3.Distance(focus, desiredCamera) * allowed / Math.max(0.001, length);
});
engine.runRenderLoop(() => {
  if (document.hidden) { simulationClock.reset(); return; }
  const elapsed = skipFrameDelta ? 0 : engine.getDeltaTime() / 1000;
  skipFrameDelta = false;
  const dt = Math.min(elapsed, 0.5);
  const start = performance.now();
  navigationBudget = 2;
  if (state.started) {
    updateActorVisibility(dt);
    cameraControl.orbit(inputControl.consumeCameraOrbit());
    cameraControl.zoom(inputControl.consumeZoom());
  }
  if (state.started && !state.paused) {
    simulationClock.advance(elapsed, step => { update(step); return !state.paused; });
    saveTimer += dt; if (saveTimer > 8) { saveGame(); saveTimer = 0; }
  } else simulationClock.reset();
  if (state.started) {
    updateWorldSectorVisibility(dt);
    hudTimer += dt; minimapTimer += dt;
    if (hudTimer >= 0.1) { hudTimer = 0; updateHud(); }
    if (minimapTimer >= 0.2) { minimapTimer = 0; drawMinimap(); }
  }
  if (state.started) {
    presentActors(state.paused ? 1 : simulationClock.alpha);
    const root = playerEntity().root;
    const x = root?.position.x ?? player.x, z = root?.position.z ?? player.z;
    cameraControl.update(dt, { x, y: terrain.supportAt(x, z), z });
  }
  // Resizing clears the drawing buffer. It must happen BEFORE drawing, never after.
  if (state.started && !state.paused && resolutionGovernor.sample(dt)) { applyRenderResolution(); applyRenderBudget(); }
  const beforeRender = performance.now();
  engine._drawCalls.fetchNewFrame();
  scene.render();
  if (state.started && !state.paused) {
    frameTelemetry.record(engine.getDeltaTime(), beforeRender - start, performance.now() - beforeRender);
    performanceTimer += dt;
    if (performanceTimer >= 1) {
      performanceTimer = 0; lastTelemetry = frameTelemetry.snapshot();
      lastRenderStats = { drawCalls: engine._drawCalls.current, activeMeshes: scene.getActiveMeshes().length,
        renderWidth: engine.getRenderWidth(), renderHeight: engine.getRenderHeight(), shadowCasters: shadows.getShadowMap()?.renderList?.length ?? 0 };
      q('#performance-readout').textContent = `${lastTelemetry.fps.toFixed(0)} FPS · p95 ${lastTelemetry.p95Ms.toFixed(0)} ms · ${lastRenderStats.renderWidth}×${lastRenderStats.renderHeight}`;
    }
  }
});

// Exposed only for deterministic smoke tests executed by the project's QA harness.
Object.defineProperty(window, '__VARENDOR_QA__', {
  value: {
    engine: 'babylon',
    version: '0.6.0-motion-test',
    getPerformance: () => ({ ...lastTelemetry, ...lastRenderStats, meshes: scene.meshes.length,
      materials: scene.materials.length, textures: scene.textures.length, skeletons: scene.skeletons.length,
      adaptiveScale: resolutionGovernor.scale, adaptiveDetails: resolutionGovernor.detailStep,
      msaaSamples: renderPipeline.samples, shadowSize: shadows.getShadowMap()?.getSize().width,
      droppedSeconds: simulationClock.droppedSeconds,
      animationMs: sceneTimings.animationsTimeCounter.current,
      activeMeshEvaluationMs: sceneTimings.activeMeshesEvaluationTimeCounter.current,
      renderTargetsMs: sceneTimings.renderTargetsRenderTimeCounter.current,
      mainRenderMs: sceneTimings.renderTimeCounter.current,
      activeAnimatables: scene.animatables.length, renderer: engine.getGlInfo().renderer, settings: { ...state.settings },
    }),
    getState: () => ({
      started: state.started,
      entities: state.entities.length,
      monsters: state.entities.filter((entity) => entity.kind === 'monster').length,
      activeMonsterStates: state.entities.filter((entity) => entity.kind === 'monster' && entity.alive).map((entity) => entity.aiState),
      assetsLoaded,
      camera: cameraControl.state,
      selectedTarget: targeting.selected?.uid ?? null,
      player: { level: player.level, hp: player.hp, inventory: player.inventory.length, x: player.x, z: player.z },
    }),
  },
  enumerable: false,
});

// Only compiled into the separate CI build. Never included in the downloadable game.
if (__QA_BUILD__) {
  const motionTrace: unknown[] = [];
  const actors = () => state.entities.map(entity => {
    const point = Vector3.Project(entityWorldPosition(entity, entity.targetHeight * 0.55), Matrix.Identity(),
      scene.getTransformMatrix(), camera.viewport.toGlobal(engine.getRenderWidth(), engine.getRenderHeight()));
    const meshes = entity.root?.getChildMeshes().filter(mesh => mesh.getTotalVertices() > 0) ?? [];
    return { uid: entity.uid, id: entity.id, kind: entity.kind, model: entity.model, x: entity.x, z: entity.z,
      screenX: point.x * canvas.clientWidth / engine.getRenderWidth(), screenY: point.y * canvas.clientHeight / engine.getRenderHeight(),
      depth: point.z, hp: entity.hp, alive: entity.alive, generation: entity.visualGeneration, action: entity.actionType,
      rootY: entity.root?.position.y, supportY: terrain.supportAt(entity.x, entity.z), baseY: entity.baseY,
      labelY: entity.label?.position.y, pickY: entity.pickVolume?.position.y,
      meshes: meshes.length, visible: meshes.some(mesh => mesh.isEnabled() && mesh.isVisible),
      ready: meshes.every(mesh => mesh.isReady(true)), animations: entity.animations.length,
      lifecycle: entity.lifecycle?.state, baseScale: entity.baseScale?.asArray(),
      yaw: entity.root?.rotation.y, grounded: entity.kind === 'player' ? playerMotor.grounded : true,
      attack: entity.activeAttack ? { token: entity.activeAttack.token, impacted: entity.activeAttack.impacted, target: entity.activeAttack.target.uid } : null,
      motion: entity.motion ? { action: entity.motion.action, phase: entity.motion.phase, clip: entity.motion.clip,
        starts: entity.motion.starts, activeGroups: entity.motion.activeGroups, playbackRate: entity.motion.playbackRate } : null,
      engaged: combatControl.isEngagedWith(entity.uid) };
  });
  Object.defineProperty(window, '__VARENDOR_FIXTURE__', { value: {
    actors,
    recordMotion: (enabled: boolean) => {
      if (enabled) motionTrace.length = 0;
      qaMotionSample = enabled ? () => {
        if (motionTrace.length >= 1800) return;
        const hero = playerEntity(), target = targeting.selected;
        motionTrace.push({ x: hero.x, z: hero.z, yaw: hero.root?.rotation.y, action: hero.motion?.action,
          phase: hero.motion?.phase, clip: hero.motion?.clip, attackToken: hero.activeAttack?.token,
          grounded: playerMotor.grounded, target: target?.uid, hp: target?.hp, targetX: target?.x, targetZ: target?.z });
      } : undefined;
    },
    motionTrace: () => motionTrace,
    surface: (x: number, z: number) => ({ ground: terrain.heightAt(x, z), support: terrain.supportAt(x, z), blocked: collisionWorld.isBlocked({ x, z }, 0.46) }),
    world: () => ({ fortParts: scene.transformNodes.filter(node => node.name.startsWith('fort-part-') && !node.name.endsWith('-content')).length,
      groundTriangles: ground.getTotalIndices() / 3, roads: terrain.roads.length,
      paths: [[{ x: -7, z: -11 }, { x: -7, z: -28 }],
        ...state.entities.filter(e => e.kind === 'npc' && ['elder', 'smith', 'shop', 'teleport'].includes(e.role ?? ''))
          .map(e => [{ x: -7, z: -11 }, { x: e.x, z: e.z }]),
        [{ x: -7, z: -28 }, { x: 30, z: 8 }]].map(([from, to]) => ({ from, to,
          path: findNavigationPath(collisionWorld, from, to, { actorRadius: 0.46, cellSize: 0.85, margin: 24 }) })) }),
    bounds: (id: string) => {
      const entity = state.entities.find(e => e.uid === id);
      if (!entity?.root) return null;
      const meshes = entity.root.getChildMeshes().filter(mesh => mesh.getTotalVertices() > 0 && mesh.isVisible);
      meshes.forEach(mesh => { mesh.computeWorldMatrix(true); if (mesh instanceof Mesh) mesh.refreshBoundingInfo(true, true); });
      return { minY: Math.min(...meshes.map(mesh => mesh.getBoundingInfo().boundingBox.minimumWorld.y)),
        maxY: Math.max(...meshes.map(mesh => mesh.getBoundingInfo().boundingBox.maximumWorld.y)),
        supportY: terrain.supportAt(entity.x, entity.z), rootY: entity.root.position.y };
    },
    uiScale: (scale: number) => { state.settings.uiScale = scale; document.documentElement.style.setProperty('--ui-scale', String(scale)); fitActionDock(); },
    moveTo: (x: number, z: number) => { resetPlayerControl(true); state.moveTarget = collisionWorld.findNearestFree({ x, z }, 0.46); },
    vitals: (hp: number, mp: number) => { player.hp = hp; player.mp = mp; updateHud(); },
    pause: (value: boolean) => { state.paused = value; simulationClock.reset(); skipFrameDelta = true; },
    kill: (id: string) => { const entity = state.entities.find(e => e.uid === id); if (entity) killMonster(entity); },
    lifecycleStep: (id: string, seconds: number) => { const entity = state.entities.find(e => e.uid === id); if (entity) updateMonster(entity, seconds); },
    placePlayer: (x: number, z: number) => {
      const point = collisionWorld.findNearestFree({ x, z }, 0.46);
      player.x = point.x; player.z = point.z; resetPlayerControl(true);
      const hero = playerEntity(); hero.x = player.x; hero.z = player.z; syncEntityTransform(hero);
      cameraControl.snap({ x: player.x, y: terrain.supportAt(player.x, player.z), z: player.z }); sectorVisibilityCooldown = 0; actorVisibilityCooldown = 0;
    },
    die: () => die(),
  } });
}
