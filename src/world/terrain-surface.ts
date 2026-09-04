export type SurfacePoint = Readonly<{ x: number; y: number; z: number }>;
export type RoadArea = Readonly<{ x: number; z: number; width: number; depth: number; rotation: number }>;
const clamp = (n: number, min: number, max: number) => Math.max(min, Math.min(max, n));

/** The same triangles are used by rendering and actor support. No per-frame raycast. */
export class TerrainSurface {
  readonly width = 320;
  readonly depth = 280;
  readonly columns = 140;
  readonly rows = 140;
  readonly heights = new Float32Array((this.columns + 1) * (this.rows + 1));
  readonly roads: RoadArea[] = [];
  private platforms: Array<RoadArea & { y: number }> = [];

  constructor() {
    for (let row = 0; row <= this.rows; row++) for (let col = 0; col <= this.columns; col++) {
      const x = col * this.width / this.columns - this.width / 2;
      const z = this.depth / 2 - row * this.depth / this.rows;
      const macro = Math.sin(x * 0.025) * 1.3 + Math.cos(z * 0.031) * 1.1 + Math.sin((x + z) * 0.018) * 0.8;
      const detail = (Math.sin(x * 0.31) + Math.cos(z * 0.27)) * 0.11;
      // Existing settlements need level foundations and continuous approaches.
      const greenfall = Math.max(Math.abs(x + 7) - 19, Math.abs(z + 8.5) - 20);
      const asterhold = Math.max(Math.abs(x + 108) - 25, Math.abs(z + 82) - 24);
      const edge = clamp(Math.min(greenfall, asterhold) / 8, 0, 1);
      const blend = edge * edge * (3 - 2 * edge);
      this.heights[row * (this.columns + 1) + col] = (macro * 0.42 + detail) * blend;
    }
  }

  vertex(col: number, row: number): SurfacePoint {
    return { x: col * this.width / this.columns - this.width / 2,
      z: this.depth / 2 - row * this.depth / this.rows,
      y: this.heights[row * (this.columns + 1) + col] };
  }

  heightAt(x: number, z: number): number {
    const gx = clamp((x + this.width / 2) * this.columns / this.width, 0, this.columns);
    const gz = clamp((this.depth / 2 - z) * this.rows / this.depth, 0, this.rows);
    const col = Math.min(this.columns - 1, Math.floor(gx));
    const row = Math.min(this.rows - 1, Math.floor(gz));
    const u = gx - col; const v = gz - row;
    const a = this.heights[row * (this.columns + 1) + col];
    const b = this.heights[row * (this.columns + 1) + col + 1];
    const c = this.heights[(row + 1) * (this.columns + 1) + col];
    const d = this.heights[(row + 1) * (this.columns + 1) + col + 1];
    // Babylon ground diagonal is top-left -> bottom-right, NOT bilinear interpolation.
    return u >= v ? a + u * (b - a) + v * (d - b) : a + u * (d - c) + v * (c - a);
  }

  supportAt(x: number, z: number): number {
    let y = this.heightAt(x, z);
    for (const platform of this.platforms) if (insideArea(platform, x, z)) y = Math.max(y, platform.y);
    return y;
  }
  addPlatform(x: number, z: number, width: number, depth: number, y: number): void {
    this.platforms.push({ x, z, width, depth, y, rotation: 0 });
  }
  addRoad(x: number, z: number, width: number, depth: number, rotation = 0): void {
    this.roads.push({ x, z, width, depth, rotation });
  }
  roadAt(x: number, z: number, margin = 0): boolean {
    return this.roads.some(road => insideArea(road, x, z, margin));
  }

  /** Partition each terrain triangle into the UNION of roads and the remaining ground.
   * A road is a material assignment, never a coplanar sheet placed over another road. */
  geometry() {
    const positions: number[] = []; const uvs: number[] = [];
    const groundIndices: number[] = []; const roadIndices: number[] = [];
    const vertices = new Map<string, number>();
    const emit = (polygon: SurfacePoint[], indices: number[]) => {
      const ids = polygon.map(p => {
        const key = `${p.x.toFixed(6)}:${p.y.toFixed(6)}:${p.z.toFixed(6)}`;
        let index = vertices.get(key);
        if (index === undefined) {
          index = positions.length / 3; vertices.set(key, index);
          positions.push(p.x, p.y, p.z); uvs.push((p.x + 160) / 320, (p.z + 140) / 280);
        }
        return index;
      });
      for (let i = 1; i < polygon.length - 1; i++) {
        const [a, b, c] = [polygon[0], polygon[i], polygon[i + 1]];
        if (Math.abs((b.x - a.x) * (c.z - a.z) - (b.z - a.z) * (c.x - a.x)) > 1e-8) indices.push(ids[0], ids[i], ids[i + 1]);
      }
    };
    for (let row = 0; row < this.rows; row++) for (let col = 0; col < this.columns; col++) {
      const a = this.vertex(col, row); const b = this.vertex(col + 1, row);
      const c = this.vertex(col, row + 1); const d = this.vertex(col + 1, row + 1);
      for (const triangle of [[d, b, a], [c, d, a]]) {
        let remaining = [triangle];
        for (const road of this.roads) {
          const cos = Math.cos(road.rotation); const sin = Math.sin(road.rotation);
          const extentX = Math.abs(cos) * road.width / 2 + Math.abs(sin) * road.depth / 2;
          const extentZ = Math.abs(sin) * road.width / 2 + Math.abs(cos) * road.depth / 2;
          if (b.x < road.x - extentX || a.x > road.x + extentX || a.z < road.z - extentZ || c.z > road.z + extentZ) continue;
          const outside: SurfacePoint[][] = [];
          for (const polygon of remaining) {
            const result = partition(polygon, road);
            if (result.inside.length >= 3) emit(result.inside, roadIndices);
            outside.push(...result.outside);
          }
          remaining = outside;
          if (!remaining.length) break;
        }
        for (const polygon of remaining) emit(polygon, groundIndices);
      }
    }
    return { positions, uvs, groundIndices, roadIndices };
  }
}

export function insideArea(area: RoadArea, x: number, z: number, margin = 0): boolean {
  const dx = x - area.x; const dz = z - area.z;
  // Inverse of Babylon's positive Y rotation.
  const lx = dx * Math.cos(area.rotation) - dz * Math.sin(area.rotation);
  const lz = dx * Math.sin(area.rotation) + dz * Math.cos(area.rotation);
  return Math.abs(lx) <= area.width / 2 + margin && Math.abs(lz) <= area.depth / 2 + margin;
}

function partition(polygon: SurfacePoint[], area: RoadArea) {
  const cos = Math.cos(area.rotation); const sin = Math.sin(area.rotation);
  const x = (p: SurfacePoint) => (p.x - area.x) * cos - (p.z - area.z) * sin;
  const z = (p: SurfacePoint) => (p.x - area.x) * sin + (p.z - area.z) * cos;
  const planes = [(p: SurfacePoint) => area.width / 2 - x(p), (p: SurfacePoint) => area.width / 2 + x(p),
    (p: SurfacePoint) => area.depth / 2 - z(p), (p: SurfacePoint) => area.depth / 2 + z(p)];
  const outside: SurfacePoint[][] = [];
  let inside = polygon;
  for (const plane of planes) {
    const keep: SurfacePoint[] = []; const cut: SurfacePoint[] = [];
    for (let i = 0; i < inside.length; i++) {
      const a = inside[i]; const b = inside[(i + 1) % inside.length];
      const da = plane(a); const db = plane(b);
      (da >= 0 ? keep : cut).push(a);
      if ((da >= 0) !== (db >= 0)) {
        const t = da / (da - db);
        const point = { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, z: a.z + (b.z - a.z) * t };
        keep.push(point); cut.push(point);
      }
    }
    if (cut.length >= 3) outside.push(cut);
    inside = keep;
    if (inside.length < 3) break;
  }
  return { inside, outside };
}
