from pathlib import Path
import re

ROOT = Path(__file__).resolve().parents[1]
MAIN = ROOT / 'src' / 'main.ts'
DATA = ROOT / 'src' / 'data' / 'game-data.ts'
SOURCE_TEST = ROOT / 'tests' / 'source-contract.test.mjs'
BOOTSTRAP = ROOT / 'src' / 'bootstrap.ts'
GUARDRAILS = ROOT / 'src' / 'presentation' / 'visual-guardrails.ts'
QUEUE = ROOT / 'docs' / 'LOCAL_POLISH_QUEUE.md'
SPEC = ROOT / 'docs' / 'PHASE_1_2_WORLD_COMBAT_CORRECTION.md'
WORKFLOW = ROOT / '.github' / 'workflows' / 'apply-phase12.yml'
SELF = Path(__file__).resolve()


def replace_exact(text: str, old: str, new: str, label: str) -> str:
    if old not in text:
        raise RuntimeError(f'missing exact patch target: {label}')
    return text.replace(old, new, 1)


def replace_regex(text: str, pattern: str, replacement: str, label: str) -> str:
    updated, count = re.subn(pattern, replacement, text, count=1, flags=re.S)
    if count != 1:
        raise RuntimeError(f'patch target {label}: expected 1 match, got {count}')
    return updated


main = MAIN.read_text(encoding='utf-8')

# ----- entity state: patrol + smith animation timers -----
main = replace_exact(
    main,
    "  ambientActivity?: AmbientWaypoint['activity'];\n};",
    "  ambientActivity?: AmbientWaypoint['activity'];\n  patrol?: Array<{ x: number; z: number }>;\n  patrolIndex?: number;\n  patrolPause?: number;\n  groupId?: string;\n  npcActionTimer?: number;\n};",
    'entity patrol fields',
)

# ----- daylight presentation -----
main = replace_exact(main, '  worldTime: 19.35,', '  worldTime: 12.5,', 'daytime initial clock')
main = replace_regex(
    main,
    r"scene\.clearColor = new Color4\([\s\S]*?glow\.intensity = 0\.35;",
    """scene.clearColor = new Color4(0.46, 0.66, 0.76, 1);
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
glow.intensity = 0.16;""",
    'daylight scene block',
)
main = replace_exact(
    main,
    "groundMaterial.diffuseColor = new Color3(0.12, 0.17, 0.13);",
    "groundMaterial.diffuseColor = new Color3(0.31, 0.46, 0.32);",
    'ground daylight color',
)
main = replace_exact(
    main,
    "roadMaterial.diffuseColor = new Color3(0.29, 0.25, 0.18);",
    "roadMaterial.diffuseColor = new Color3(0.48, 0.41, 0.29);",
    'road daylight color',
)

# ----- remove giant red selection/impact geometry completely -----
main = replace_regex(
    main,
    r"const targetIndicatorMaterial = new StandardMaterial\('selected-target-material'[\s\S]*?targetIndicator\.setEnabled\(false\);",
    """// Selection is communicated by the target HUD/nameplate. The previous emissive
// torus + mesh outline could expose oversized hidden model geometry as a giant red blob.
const targetIndicator = new TransformNode('selected-target-anchor', scene);
targetIndicator.setEnabled(false);""",
    'target indicator geometry',
)
main = replace_regex(
    main,
    r"function setTargetOutline\(entity: Entity \| null, enabled: boolean\): void \{[\s\S]*?\n\}",
    """function setTargetOutline(entity: Entity | null, enabled: boolean): void {
  // Never outline imported character meshes: some GLTFs contain helper geometry whose
  // silhouette is many times larger than the visible monster. That caused the red blob.
  entity?.root?.getChildMeshes().forEach((mesh) => { mesh.renderOutline = false; });
  void enabled;
}""",
    'disable imported mesh outlines',
)
main = replace_regex(
    main,
    r"function updateTargetIndicator\(\): void \{[\s\S]*?\n\}\n\nfunction update\(dt: number\)",
    """function updateTargetIndicator(): void {
  const target = targeting.validate();
  if (outlinedTarget !== target) {
    setTargetOutline(outlinedTarget, false);
    outlinedTarget = target;
    setTargetOutline(outlinedTarget, false);
  }
  targetIndicator.setEnabled(false);
}

function update(dt: number)""",
    'selection indicator update',
)
main = replace_exact(
    main,
    "  state.worldTime = (state.worldTime + dt * 0.035) % 24;",
    "  state.worldTime = 12.5; // current vertical slice is intentionally locked to readable daylight",
    'lock daytime',
)
main = replace_regex(
    main,
    r"function impactEffect\(position: Vector3, color: Color3\): void \{[\s\S]*?\n\}\n\nfunction damageMonster",
    """function impactEffect(position: Vector3, color: Color3): void {
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

function damageMonster""",
    'compact impact effect',
)

# ----- authored town/castle primitives; stop using broken black roof assets -----
main = replace_regex(
    main,
    r"function buildTown\(x: number, z: number, scale: number\): void \{[\s\S]*?(?=function createBonfire)",
    """const townMaterials = new Map<number, StandardMaterial>();
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

""",
    'procedural fortified town',
)

main = replace_regex(
    main,
    r"function buildStarterSettlement\(x: number, z: number\): void \{[\s\S]*?(?=function buildWorld)",
    """function buildStarterSettlement(x: number, z: number): void {
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

""",
    'greenfall authored settlement',
)

# ----- ambient residents: safe authored routes, no texture jitter -----
main = replace_regex(
    main,
    r"function spawnAmbientResident\([\s\S]*?(?=function spawnAmbientResidents)",
    """function spawnAmbientResident(
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

""",
    'safe ambient resident spawn',
)
main = replace_regex(
    main,
    r"function spawnAmbientResidents\(\): void \{[\s\S]*?(?=function spawnEntities)",
    """function spawnAmbientResidents(): void {
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

""",
    'ambient routes and homogeneous monster camps',
)

main = replace_regex(
    main,
    r"function spawnEntities\(\): void \{[\s\S]*?(?=function playerEntity)",
    """function spawnEntities(): void {
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

""",
    'NPC positions and monster camp spawning',
)

# ----- ranged class identity + chain lightning -----
main = replace_regex(
    main,
    r"function attackRange\(\): number \{[\s\S]*?\n\}",
    """function attackRange(): number {
  if (player.classId === 'ranger') return 12.5;
  if (player.classId === 'mage') return 8.5;
  if (player.classId === 'necro') return 9.5;
  return 2.6;
}""",
    'class-specific basic ranges',
)
main = replace_exact(
    main,
    "  const multiplier = skill?.mul ?? 1;",
    "  const multiplier = skill?.mul ?? (player.classId === 'mage' ? 0.68 : player.classId === 'necro' ? 0.76 : 1);",
    'mage basic damage budget',
)
main = replace_exact(
    main,
    "  spawnAttackEffect(skill?.fx ?? (ranged ? 'arrow' : 'slash'), hero, target, () => {",
    "  const basicFx = player.classId === 'mage' ? 'arcane' : player.classId === 'necro' ? 'bone' : ranged ? 'arrow' : 'slash';\n  spawnAttackEffect(skill?.fx ?? basicFx, hero, target, () => {",
    'mage basic projectile identity',
)
main = replace_regex(
    main,
    r"    if \(skill\?\.chain\) \{[\s\S]*?\n    \}\n    if \(skill\?\.dot\)",
    """    if (skill?.chain) {
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
    if (skill?.dot)""",
    'diminishing chain lightning',
)
main = replace_exact(
    main,
    "    fire: new Color3(1, 0.2, 0.04), ice: new Color3(0.25, 0.75, 1), arrow: new Color3(0.8, 0.7, 0.45),",
    "    fire: new Color3(1, 0.2, 0.04), ice: new Color3(0.25, 0.75, 1), arrow: new Color3(0.8, 0.7, 0.45), arcane: new Color3(0.46, 0.64, 1),",
    'arcane projectile color',
)
main = replace_exact(
    main,
    "  const projectile = MeshBuilder.CreateSphere(`effect-${type}-${uid()}`, { diameter: type === 'arrow' ? 0.14 : 0.32, segments: 8 }, scene);",
    "  const projectile = MeshBuilder.CreateSphere(`effect-${type}-${uid()}`, { diameter: type === 'arrow' ? 0.12 : type === 'arcane' ? 0.22 : 0.28, segments: 8 }, scene);",
    'projectile sizes',
)

# ----- monster patrol AI; no static mobs when not aggroed -----
main = replace_regex(
    main,
    r"function updateMonster\(entity: Entity, dt: number\): void \{[\s\S]*?(?=function hurtPlayer)",
    """function updateMonster(entity: Entity, dt: number): void {
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

""",
    'monster patrol AI',
)

# ----- smith actually works at the anvil; ambient NPC fallback unstuck -----
main = replace_regex(
    main,
    r"const AMBIENT_ACTIVITY_LOOK:[\s\S]*?(?=function updateAmbientResident)",
    """const AMBIENT_ACTIVITY_LOOK: Record<AmbientWaypoint['activity'], Readonly<{ x: number; z: number }>> = {
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

""",
    'smith working behaviour',
)
main = replace_regex(
    main,
    r"function updateAmbientResident\(entity: Entity, dt: number\): void \{[\s\S]*?\n\}\n\nfunction projectEntity",
    """function updateAmbientResident(entity: Entity, dt: number): void {
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

function projectEntity""",
    'ambient movement recovery',
)
main = replace_exact(
    main,
    "  state.entities.filter((entity) => entity.kind === 'summon').forEach((entity) => updateSummon(entity, dt));\n  state.entities.filter((entity) => entity.kind === 'ambient').forEach((entity) => updateAmbientResident(entity, dt));",
    "  state.entities.filter((entity) => entity.kind === 'summon').forEach((entity) => updateSummon(entity, dt));\n  state.entities.filter((entity) => entity.kind === 'npc').forEach((entity) => updateTownNpc(entity, dt));\n  state.entities.filter((entity) => entity.kind === 'ambient').forEach((entity) => updateAmbientResident(entity, dt));",
    'town npc updater',
)

MAIN.write_text(main, encoding='utf-8')

# Chain lightning should visibly travel through a group, not stop after two secondary targets.
data = DATA.read_text(encoding='utf-8')
data = replace_exact(data, "{name:'Цепная молния',icon:'ϟ',cost:48,cd:12,mul:1.35,chain:3,fx:'lightning'}", "{name:'Цепная молния',icon:'ϟ',cost:48,cd:12,mul:1.35,chain:5,fx:'lightning'}", 'chain count')
DATA.write_text(data, encoding='utf-8')

# Bootstrap is retained for future presentation modules, but the old torus monkey-patch is removed.
BOOTSTRAP.write_text("import './main';\n", encoding='utf-8')
if GUARDRAILS.exists():
    GUARDRAILS.unlink()

# Update source contract to the real bootstrap architecture and assert the new correction points.
test = SOURCE_TEST.read_text(encoding='utf-8')
test = replace_regex(
    test,
    r"test\('browser client uses Babylon\.js and TypeScript entrypoint',[\s\S]*?\n\}\);",
    """test('browser client uses Babylon.js and TypeScript bootstrap', async () => {
  const [html, bootstrap, source, pkg] = await Promise.all([
    readFile(new URL('../index.html', import.meta.url), 'utf8'),
    readFile(new URL('../src/bootstrap.ts', import.meta.url), 'utf8'),
    readFile(new URL('../src/main.ts', import.meta.url), 'utf8'),
    readFile(new URL('../package.json', import.meta.url), 'utf8').then(JSON.parse),
  ]);
  assert.match(html, /src\\/bootstrap\\.ts/);
  assert.match(bootstrap, /import '\\.\\/main'/);
  assert.match(source, /from '@babylonjs\\/core'/);
  assert.match(source, /LocalGameGateway/);
  assert.equal(pkg.dependencies.three, undefined);
  assert.equal(pkg.dependencies['@babylonjs/core'], '8.26.1');
});""",
    'bootstrap source contract',
)
test += """

test('phase 1.2 world correction uses daylight, homogeneous patrol camps and restrained hit feedback', async () => {
  const [source, data] = await Promise.all([
    readFile(new URL('../src/main.ts', import.meta.url), 'utf8'),
    readFile(new URL('../src/data/game-data.ts', import.meta.url), 'utf8'),
  ]);
  assert.match(source, /worldTime = 12\\.5/);
  assert.match(source, /spawnMonsterCamp\\('wolf'/);
  assert.match(source, /entity\\.patrol\\?\\.length/);
  assert.match(source, /createSmithy/);
  assert.match(source, /greenfall-keep/);
  assert.match(source, /greenfall-south-gate/);
  assert.match(source, /selected-target-anchor/);
  assert.doesNotMatch(source, /CreateTorus\\(`impact-/);
  assert.match(source, /player\\.classId === 'mage' \\? 'arcane'/);
  assert.match(source, /Math\\.pow\\(0\\.68, hop\\)/);
  assert.match(data, /Цепная молния[^\\n]*chain:5/);
});
"""
SOURCE_TEST.write_text(test, encoding='utf-8')

QUEUE.write_text("""# Local polish queue — Phase 1.2 applied

User playtest on 2026-09-03 exposed structural presentation/world issues rather than isolated cosmetic bugs.

Applied in Phase 1.2:
- removed imported-mesh red outline/torus hit blobs;
- locked the current vertical slice to readable daytime lighting;
- rebuilt Greenfall around a gate, walls, keep, watch towers, tavern, market and working smithy;
- removed the broken black roof placeholders from the authored settlement path;
- created homogeneous monster camps distributed across the field;
- added idle patrol routes for ordinary monsters;
- moved residents to safe road/civic routes and added collision recovery;
- made Bran face/work the anvil beside a brazier;
- separated Ranger and Mage basic ranged identity;
- made Chain Lightning hop through up to five nearby enemies with diminishing damage.

Next Work-owned stage remains v0.5: higher-quality art assets, authored animation retargeting, navmesh/pathfinding, richer enemy state machines and final environment art pass.
""", encoding='utf-8')

SPEC.write_text("""# Phase 1.2 — World, Population & Combat Readability Correction

## Objective
Turn the current prototype-like test scene into a readable MMORPG vertical slice before deeper content expansion. The acceptance bar is user-visible behavior, not merely passing code tests.

## Non-negotiable acceptance criteria
1. **No giant red/orange geometry** may appear from targeting, hit confirmation or imported helper meshes. Target feedback must remain readable through the target HUD/nameplate and restrained contact effects.
2. **Greenfall must read as a settlement at first glance**: southern gate, enclosing walls, watch towers, visible keep/castle focus, tavern, market/storehouse, forge, roads and civic square. Broken black roof/cube placeholders are not acceptable inside the authored settlement.
3. **Daylight readability** is mandatory for this slice. Terrain, roads, characters and architecture must be readable without crushing blacks.
4. **Monster ecology must be spatially authored**: same-species camps, camps separated across the field, ordinary mobs patrol around their own camp while idle, bosses remain authored encounters.
5. **Residents must move on safe routes** rather than vibrating against props. Route points must be collision-safe and movement must recover from a blocked waypoint.
6. **NPC staging must communicate role**: Bran faces an anvil and repeatedly performs a smithing strike beside a forge/brazier; elder, merchant and guide are placed at role-appropriate landmarks.
7. **Ranger and Mage must not feel like the same ranged class**: Ranger owns the longest physical basic range; Mage uses a shorter, weaker magical basic projectile and relies on spell throughput for power.
8. **Chain Lightning must actually chain**: primary target plus nearby hops, each hop originates from the previous victim, each subsequent hit is weaker, and a dense group can receive up to five total links.

## Follow-up / v0.5
Do not confuse this correction with final art. v0.5 still owns production-grade environment assets, animation retargeting, navigation mesh/pathfinding and deeper AI states.
""", encoding='utf-8')

# One-shot migration: remove the migration script/workflow from the resulting product commit.
if WORKFLOW.exists():
    WORKFLOW.unlink()
if SELF.exists():
    SELF.unlink()
