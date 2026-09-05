export type Point2 = Readonly<{ x: number; z: number }>;
export type Point3 = Point2 & Readonly<{ y: number }>;

type CircleObstacle = Readonly<{ kind: 'circle'; x: number; z: number; radius: number; bottom?: number; top?: number }>;
type BoxObstacle = Readonly<{ kind: 'box'; x: number; z: number; halfX: number; halfZ: number; rotation: number; bottom?: number; top?: number }>;
type Obstacle = CircleObstacle | BoxObstacle;

export type CollisionMove = Readonly<{ x: number; z: number; blocked: boolean }>;

function circleOverlap(point: Point2, actorRadius: number, obstacle: CircleObstacle): boolean {
  return Math.hypot(point.x - obstacle.x, point.z - obstacle.z) < actorRadius + obstacle.radius;
}

function boxOverlap(point: Point2, actorRadius: number, obstacle: BoxObstacle): boolean {
  const cosine = Math.cos(obstacle.rotation);
  const sine = Math.sin(obstacle.rotation);
  const dx = point.x - obstacle.x;
  const dz = point.z - obstacle.z;
  const localX = dx * cosine - dz * sine;
  const localZ = dx * sine + dz * cosine;
  const closestX = Math.max(-obstacle.halfX, Math.min(obstacle.halfX, localX));
  const closestZ = Math.max(-obstacle.halfZ, Math.min(obstacle.halfZ, localZ));
  return Math.hypot(localX - closestX, localZ - closestZ) < actorRadius;
}

export class CollisionWorld {
  private readonly obstacles: Obstacle[] = [];
  private readonly cells = new Map<string, Obstacle[]>();
  private readonly cellSize = 8;
  candidateChecks = 0;
  private readonly segmentCandidates = new Set<Obstacle>();

  clear(): void {
    this.obstacles.length = 0;
    this.cells.clear();
    this.candidateChecks = 0;
  }

  private insert(obstacle: Obstacle, extentX: number, extentZ: number): void {
    this.obstacles.push(obstacle);
    for (let x = Math.floor((obstacle.x - extentX) / this.cellSize); x <= Math.floor((obstacle.x + extentX) / this.cellSize); x += 1) {
      for (let z = Math.floor((obstacle.z - extentZ) / this.cellSize); z <= Math.floor((obstacle.z + extentZ) / this.cellSize); z += 1) {
        const key = `${x}:${z}`;
        const bucket = this.cells.get(key);
        if (bucket) bucket.push(obstacle); else this.cells.set(key, [obstacle]);
      }
    }
  }

  addCircle(x: number, z: number, radius: number, bottom?: number, top?: number): void {
    if (radius > 0) this.insert({ kind: 'circle', x, z, radius, bottom, top }, radius, radius);
  }

  addBox(x: number, z: number, halfX: number, halfZ: number, rotation = 0, bottom?: number, top?: number): void {
    if (halfX > 0 && halfZ > 0) this.insert({ kind: 'box', x, z, halfX, halfZ, rotation, bottom, top },
      Math.abs(Math.cos(rotation)) * halfX + Math.abs(Math.sin(rotation)) * halfZ,
      Math.abs(Math.sin(rotation)) * halfX + Math.abs(Math.cos(rotation)) * halfZ);
  }

  isBlocked(point: Point2, actorRadius: number): boolean {
    for (let x = Math.floor((point.x - actorRadius) / this.cellSize); x <= Math.floor((point.x + actorRadius) / this.cellSize); x += 1) {
      for (let z = Math.floor((point.z - actorRadius) / this.cellSize); z <= Math.floor((point.z + actorRadius) / this.cellSize); z += 1) {
        for (const obstacle of this.cells.get(`${x}:${z}`) ?? []) {
          this.candidateChecks += 1;
          if (obstacle.kind === 'circle' ? circleOverlap(point, actorRadius, obstacle) : boxOverlap(point, actorRadius, obstacle)) return true;
        }
      }
    }
    return false;
  }

  resolve(from: Point2, delta: Point2, actorRadius: number): CollisionMove {
    const embedded = this.isBlocked(from, actorRadius);
    let point = embedded ? this.depenetrate(from, actorRadius) : { ...from };
    let blocked = embedded;
    // Swept substeps prevent crossing thin fences after a long frame or knockback.
    const steps = Math.max(1, Math.ceil(Math.hypot(delta.x, delta.z) / Math.max(0.1, actorRadius * 0.5)));
    for (let step = 0; step < steps; step++) {
      const candidate = { x: point.x + delta.x / steps, z: point.z + delta.z / steps };
      if (!this.isBlocked(candidate, actorRadius)) { point = candidate; continue; }
      blocked = true;
      const slid = this.depenetrate(candidate, actorRadius);
      if (!this.isBlocked(slid, actorRadius)) point = slid;
    }
    return { ...point, blocked };
  }

  private depenetrate(start: Point2, radius: number): { x: number; z: number } {
    const point = { ...start };
    for (let iteration = 0; iteration < 8; iteration++) {
      let pushed = false;
      const candidates = new Set<Obstacle>();
      for (let x = Math.floor((point.x - radius) / this.cellSize); x <= Math.floor((point.x + radius) / this.cellSize); x++) {
        for (let z = Math.floor((point.z - radius) / this.cellSize); z <= Math.floor((point.z + radius) / this.cellSize); z++) {
          for (const obstacle of this.cells.get(`${x}:${z}`) ?? []) candidates.add(obstacle);
        }
      }
      for (const obstacle of candidates) {
        const dx = point.x - obstacle.x; const dz = point.z - obstacle.z;
        if (obstacle.kind === 'circle') {
          const length = Math.hypot(dx, dz); const depth = radius + obstacle.radius - length;
          if (depth <= 0) continue;
          const nx = length > 1e-8 ? dx / length : 1; const nz = length > 1e-8 ? dz / length : 0;
          point.x += nx * (depth + 1e-5); point.z += nz * (depth + 1e-5); pushed = true;
        } else {
          const cos = Math.cos(obstacle.rotation); const sin = Math.sin(obstacle.rotation);
          const x = dx * cos - dz * sin; const z = dx * sin + dz * cos;
          const ox = x - Math.max(-obstacle.halfX, Math.min(obstacle.halfX, x));
          const oz = z - Math.max(-obstacle.halfZ, Math.min(obstacle.halfZ, z));
          const length = Math.hypot(ox, oz);
          if (length >= radius) continue;
          let px: number; let pz: number;
          if (length > 1e-8) {
            const depth = radius - length + 1e-5; px = ox / length * depth; pz = oz / length * depth;
          } else if (obstacle.halfX - Math.abs(x) < obstacle.halfZ - Math.abs(z)) {
            px = (Math.sign(x) || 1) * (obstacle.halfX - Math.abs(x) + radius + 1e-5); pz = 0;
          } else {
            pz = (Math.sign(z) || 1) * (obstacle.halfZ - Math.abs(z) + radius + 1e-5); px = 0;
          }
          point.x += px * cos + pz * sin; point.z += -px * sin + pz * cos; pushed = true;
        }
      }
      if (!pushed) break;
    }
    return point;
  }

  findNearestFree(point: Point2, actorRadius: number): Point2 {
    if (!this.isBlocked(point, actorRadius)) return point;
    for (let ring = 1; ring <= 8; ring += 1) {
      const radius = ring * 0.8;
      const samples = 12 + ring * 4;
      for (let index = 0; index < samples; index += 1) {
        const angle = (index / samples) * Math.PI * 2;
        const candidate = { x: point.x + Math.cos(angle) * radius, z: point.z + Math.sin(angle) * radius };
        if (!this.isBlocked(candidate, actorRadius)) return candidate;
      }
    }
    return point;
  }

  get size(): number {
    return this.obstacles.length;
  }

  /** Camera sphere sweep against only nearby, height-bounded static colliders.
   * No scene traversal, triangle picking or new physics engine. */
  cameraDistance(from: Point3, to: Point3, radius = 0.22): number {
    return this.segmentDistance(from, to, radius, true);
  }

  /** Distance to the first static obstruction on a finite 3D segment.
   * Older colliders without height bounds remain solid for combat/picking.
   * A clear segment returns its full length; it never checks beyond `to`. */
  obstructionDistance(from: Point3, to: Point3, radius = 0): number {
    return this.segmentDistance(from, to, radius, false);
  }

  hasLineOfSight(from: Point3, to: Point3, radius = 0): boolean {
    const length = Math.hypot(to.x - from.x, to.y - from.y, to.z - from.z);
    return this.obstructionDistance(from, to, radius) >= length - 1e-5;
  }

  private segmentDistance(from: Point3, to: Point3, radius: number, heightBoundedOnly: boolean): number {
    const dx = to.x - from.x, dy = to.y - from.y, dz = to.z - from.z;
    const length = Math.hypot(dx, dy, dz);
    let closest = 1;
    this.segmentCandidates.clear();
    for (let x = Math.floor((Math.min(from.x, to.x) - radius) / this.cellSize); x <= Math.floor((Math.max(from.x, to.x) + radius) / this.cellSize); x++) {
      for (let z = Math.floor((Math.min(from.z, to.z) - radius) / this.cellSize); z <= Math.floor((Math.max(from.z, to.z) + radius) / this.cellSize); z++) {
        const bucket = this.cells.get(`${x}:${z}`);
        if (bucket) for (const obstacle of bucket) this.segmentCandidates.add(obstacle);
      }
    }
    for (const obstacle of this.segmentCandidates) {
      if (heightBoundedOnly && (obstacle.bottom === undefined || obstacle.top === undefined)) continue;
      let near = 0, far = closest;
      const slab = (origin: number, direction: number, low: number, high: number): boolean => {
        if (Math.abs(direction) < 1e-8) return origin >= low && origin <= high;
        const a = (low - origin) / direction, b = (high - origin) / direction;
        near = Math.max(near, Math.min(a, b)); far = Math.min(far, Math.max(a, b));
        return near <= far;
      };
      if (!slab(from.y, dy, (obstacle.bottom ?? -Infinity) - radius, (obstacle.top ?? Infinity) + radius)) continue;
      if (obstacle.kind === 'circle') {
        const sx = from.x - obstacle.x, sz = from.z - obstacle.z, r = obstacle.radius + radius;
        const a = dx * dx + dz * dz, b = 2 * (sx * dx + sz * dz), c = sx * sx + sz * sz - r * r;
        if (a < 1e-8) { if (c > 0) continue; }
        else {
          const discriminant = b * b - 4 * a * c;
          if (discriminant < 0) continue;
          near = Math.max(near, (-b - Math.sqrt(discriminant)) / (2 * a));
          far = Math.min(far, (-b + Math.sqrt(discriminant)) / (2 * a));
        }
      } else {
        const cosine = Math.cos(obstacle.rotation), sine = Math.sin(obstacle.rotation);
        const sx = from.x - obstacle.x, sz = from.z - obstacle.z;
        if (!slab(sx * cosine - sz * sine, dx * cosine - dz * sine, -obstacle.halfX - radius, obstacle.halfX + radius)) continue;
        if (!slab(sx * sine + sz * cosine, dx * sine + dz * cosine, -obstacle.halfZ - radius, obstacle.halfZ + radius)) continue;
      }
      if (near <= far && far >= 0) closest = Math.max(0, near);
    }
    return length * closest;
  }
}
