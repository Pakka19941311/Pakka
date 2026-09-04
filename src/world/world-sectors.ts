export type SectorCoordinate = Readonly<{ x: number; z: number }>;

export class WorldSectorGrid {
  readonly sectorSize: number;
  constructor(sectorSize = 48) { this.sectorSize = sectorSize; }

  coordinateAt(x: number, z: number): SectorCoordinate {
    return { x: Math.floor(x / this.sectorSize), z: Math.floor(z / this.sectorSize) };
  }

  keyAt(x: number, z: number): string {
    const sector = this.coordinateAt(x, z);
    return `${sector.x}:${sector.z}`;
  }

  activeKeysAround(x: number, z: number, distance: number): Set<string> {
    const center = this.coordinateAt(x, z);
    const radius = Math.max(1, Math.ceil(distance / this.sectorSize));
    const keys = new Set<string>();
    for (let sx = center.x - radius; sx <= center.x + radius; sx += 1) {
      for (let sz = center.z - radius; sz <= center.z + radius; sz += 1) {
        const closestX = Math.max(sx * this.sectorSize, Math.min(x, (sx + 1) * this.sectorSize));
        const closestZ = Math.max(sz * this.sectorSize, Math.min(z, (sz + 1) * this.sectorSize));
        if (Math.hypot(closestX - x, closestZ - z) <= distance + this.sectorSize * 0.7) keys.add(`${sx}:${sz}`);
      }
    }
    return keys;
  }
}
