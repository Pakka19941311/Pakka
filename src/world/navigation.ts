import type { CollisionWorld, Point2 } from './collision-world.ts';

export type NavigationOptions = Readonly<{
  actorRadius?: number;
  cellSize?: number;
  margin?: number;
  maxVisited?: number;
}>;

type GridNode = { x: number; z: number; score: number };

/** Binary min-heap: never re-sort the entire frontier for every visited cell. */
class Frontier {
  private nodes: GridNode[] = [];
  get length(): number { return this.nodes.length; }
  push(node: GridNode): void {
    let index = this.nodes.length;
    this.nodes.push(node);
    while (index > 0) {
      const parent = (index - 1) >> 1;
      if (this.nodes[parent].score <= node.score) break;
      this.nodes[index] = this.nodes[parent]; index = parent;
    }
    this.nodes[index] = node;
  }
  pop(): GridNode {
    const first = this.nodes[0];
    const last = this.nodes.pop()!;
    if (this.nodes.length) {
      let index = 0;
      while (index * 2 + 1 < this.nodes.length) {
        let child = index * 2 + 1;
        if (child + 1 < this.nodes.length && this.nodes[child + 1].score < this.nodes[child].score) child += 1;
        if (this.nodes[child].score >= last.score) break;
        this.nodes[index] = this.nodes[child]; index = child;
      }
      this.nodes[index] = last;
    }
    return first;
  }
}

function segmentIsClear(world: CollisionWorld, from: Point2, to: Point2, actorRadius: number, sampleStep: number): boolean {
  const distance = Math.hypot(to.x - from.x, to.z - from.z);
  const samples = Math.max(1, Math.ceil(distance / sampleStep));
  for (let index = 1; index <= samples; index += 1) {
    const ratio = index / samples;
    if (world.isBlocked({ x: from.x + (to.x - from.x) * ratio, z: from.z + (to.z - from.z) * ratio }, actorRadius)) return false;
  }
  return true;
}

function smoothPath(world: CollisionWorld, start: Point2, path: Point2[], actorRadius: number, cellSize: number): Point2[] {
  const result: Point2[] = [];
  let anchor = start;
  let index = 0;
  while (index < path.length) {
    let furthest = index;
    for (let candidate = path.length - 1; candidate >= index; candidate -= 1) {
      if (segmentIsClear(world, anchor, path[candidate], actorRadius, cellSize * 0.45)) {
        furthest = candidate;
        break;
      }
    }
    result.push(path[furthest]);
    anchor = path[furthest];
    index = furthest + 1;
  }
  return result;
}

export function findNavigationPath(
  world: CollisionWorld,
  requestedStart: Point2,
  requestedGoal: Point2,
  options: NavigationOptions = {},
): Point2[] {
  const actorRadius = options.actorRadius ?? 0.42;
  const cellSize = options.cellSize ?? 1.15;
  const margin = options.margin ?? 8;
  const maxVisited = options.maxVisited ?? 8000;
  const start = world.findNearestFree(requestedStart, actorRadius);
  const goal = world.findNearestFree(requestedGoal, actorRadius);
  if (segmentIsClear(world, start, goal, actorRadius, cellSize * 0.45)) return [goal];

  const minX = Math.min(start.x, goal.x) - margin;
  const minZ = Math.min(start.z, goal.z) - margin;
  const width = Math.max(3, Math.ceil((Math.max(start.x, goal.x) - minX + margin) / cellSize));
  const depth = Math.max(3, Math.ceil((Math.max(start.z, goal.z) - minZ + margin) / cellSize));
  const toGrid = (point: Point2) => ({
    x: Math.max(0, Math.min(width, Math.round((point.x - minX) / cellSize))),
    z: Math.max(0, Math.min(depth, Math.round((point.z - minZ) / cellSize))),
  });
  const toWorld = (x: number, z: number): Point2 => ({ x: minX + x * cellSize, z: minZ + z * cellSize });
  const endpointCell = (point: Point2) => {
    const center = toGrid(point);
    // A free click can round onto a blocked cell beside a wall. Find a connected
    // free endpoint instead of exhausting the entire A* budget against that wall.
    for (let ring = 0; ring <= 3; ring++) {
      let best: { x: number; z: number } | null = null; let distance = Infinity;
      for (let dx = -ring; dx <= ring; dx++) for (let dz = -ring; dz <= ring; dz++) {
        if (Math.max(Math.abs(dx), Math.abs(dz)) !== ring) continue;
        const x = center.x + dx, z = center.z + dz;
        if (x < 0 || z < 0 || x > width || z > depth) continue;
        const candidate = toWorld(x, z);
        const gap = Math.hypot(candidate.x - point.x, candidate.z - point.z);
        if (gap < distance && !world.isBlocked(candidate, actorRadius) && segmentIsClear(world, point, candidate, actorRadius, cellSize * 0.3)) {
          best = { x, z }; distance = gap;
        }
      }
      if (best) return best;
    }
    return null;
  };
  const gridStart = endpointCell(start);
  const gridGoal = endpointCell(goal);
  if (!gridStart || !gridGoal) return [];
  const key = (x: number, z: number) => `${x}:${z}`;
  const startKey = key(gridStart.x, gridStart.z);
  const goalKey = key(gridGoal.x, gridGoal.z);
  const open = new Frontier();
  open.push({ ...gridStart, score: 0 });
  const costs = new Map<string, number>([[startKey, 0]]);
  const previous = new Map<string, string>();
  const nodes = new Map<string, Readonly<{ x: number; z: number }>>([[startKey, gridStart]]);
  const closed = new Set<string>();
  const directions = [-1, 0, 1].flatMap((x) => [-1, 0, 1].map((z) => ({ x, z }))).filter(({ x, z }) => x || z);

  while (open.length && closed.size < maxVisited) {
    const current = open.pop();
    const currentKey = key(current.x, current.z);
    if (closed.has(currentKey)) continue;
    if (currentKey === goalKey) {
      const path: Point2[] = [goal];
      let cursor = currentKey;
      while (cursor !== startKey) {
        const cell = nodes.get(cursor);
        if (cell) path.unshift(toWorld(cell.x, cell.z));
        cursor = previous.get(cursor) ?? startKey;
      }
      return smoothPath(world, start, path, actorRadius, cellSize);
    }
    closed.add(currentKey);
    const currentCost = costs.get(currentKey) ?? Infinity;
    for (const direction of directions) {
      const next = { x: current.x + direction.x, z: current.z + direction.z };
      if (next.x < 0 || next.z < 0 || next.x > width || next.z > depth) continue;
      const nextKey = key(next.x, next.z);
      if (closed.has(nextKey) || world.isBlocked(toWorld(next.x, next.z), actorRadius)) continue;
      if (direction.x && direction.z) {
        if (world.isBlocked(toWorld(current.x + direction.x, current.z), actorRadius)
          || world.isBlocked(toWorld(current.x, current.z + direction.z), actorRadius)) continue;
      }
      const nextCost = currentCost + (direction.x && direction.z ? Math.SQRT2 : 1);
      if (nextCost >= (costs.get(nextKey) ?? Infinity)) continue;
      costs.set(nextKey, nextCost);
      previous.set(nextKey, currentKey);
      nodes.set(nextKey, next);
      const heuristic = Math.hypot(gridGoal.x - next.x, gridGoal.z - next.z);
      open.push({ ...next, score: nextCost + heuristic });
    }
  }
  return segmentIsClear(world, start, goal, actorRadius, cellSize * 0.3) ? [goal] : [];
}

export function pathSegmentIsClear(world: CollisionWorld, from: Point2, to: Point2, actorRadius = 0.42): boolean {
  return segmentIsClear(world, from, to, actorRadius, 0.35);
}
