import type { CollisionWorld, Point2 } from './collision-world.ts';

export type NavigationOptions = Readonly<{
  actorRadius?: number;
  cellSize?: number;
  margin?: number;
  maxVisited?: number;
}>;

type GridNode = { x: number; z: number; score: number };

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
  const gridStart = toGrid(start);
  const gridGoal = toGrid(goal);
  const key = (x: number, z: number) => `${x}:${z}`;
  const startKey = key(gridStart.x, gridStart.z);
  const goalKey = key(gridGoal.x, gridGoal.z);
  const open: GridNode[] = [{ ...gridStart, score: 0 }];
  const costs = new Map<string, number>([[startKey, 0]]);
  const previous = new Map<string, string>();
  const nodes = new Map<string, Readonly<{ x: number; z: number }>>([[startKey, gridStart]]);
  const closed = new Set<string>();
  const directions = [-1, 0, 1].flatMap((x) => [-1, 0, 1].map((z) => ({ x, z }))).filter(({ x, z }) => x || z);

  while (open.length && closed.size < maxVisited) {
    open.sort((a, b) => a.score - b.score);
    const current = open.shift()!;
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
