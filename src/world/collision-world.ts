export type Point2 = Readonly<{ x: number; z: number }>;

type CircleObstacle = Readonly<{ kind: 'circle'; x: number; z: number; radius: number }>;
type BoxObstacle = Readonly<{ kind: 'box'; x: number; z: number; halfX: number; halfZ: number; rotation: number }>;
type Obstacle = CircleObstacle | BoxObstacle;

export type CollisionMove = Readonly<{ x: number; z: number; blocked: boolean }>;

function circleOverlap(point: Point2, actorRadius: number, obstacle: CircleObstacle): boolean {
  return Math.hypot(point.x - obstacle.x, point.z - obstacle.z) < actorRadius + obstacle.radius;
}

function boxOverlap(point: Point2, actorRadius: number, obstacle: BoxObstacle): boolean {
  const cosine = Math.cos(-obstacle.rotation);
  const sine = Math.sin(-obstacle.rotation);
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

  clear(): void {
    this.obstacles.length = 0;
  }

  addCircle(x: number, z: number, radius: number): void {
    if (radius > 0) this.obstacles.push({ kind: 'circle', x, z, radius });
  }

  addBox(x: number, z: number, halfX: number, halfZ: number, rotation = 0): void {
    if (halfX > 0 && halfZ > 0) this.obstacles.push({ kind: 'box', x, z, halfX, halfZ, rotation });
  }

  isBlocked(point: Point2, actorRadius: number): boolean {
    return this.obstacles.some((obstacle) => obstacle.kind === 'circle'
      ? circleOverlap(point, actorRadius, obstacle)
      : boxOverlap(point, actorRadius, obstacle));
  }

  resolve(from: Point2, delta: Point2, actorRadius: number): CollisionMove {
    const full = { x: from.x + delta.x, z: from.z + delta.z };
    if (!this.isBlocked(full, actorRadius)) return { ...full, blocked: false };

    const xOnly = { x: full.x, z: from.z };
    const zOnly = { x: from.x, z: full.z };
    const canX = !this.isBlocked(xOnly, actorRadius);
    const canZ = !this.isBlocked(zOnly, actorRadius);
    if (canX && canZ) {
      return Math.abs(delta.x) >= Math.abs(delta.z)
        ? { ...xOnly, blocked: true }
        : { ...zOnly, blocked: true };
    }
    if (canX) return { ...xOnly, blocked: true };
    if (canZ) return { ...zOnly, blocked: true };
    return { ...from, blocked: true };
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
}
