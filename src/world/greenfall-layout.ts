import type { CollisionWorld } from './collision-world.ts';

export type FortPartPlacement = Readonly<{
  part: 'wall_thin_gate_01' | 'wall_thin_straight_01' | 'tower_round';
  x: number; z: number; height: number; rotation: number; width: number; depth: number;
}>;

/** Existing city bounds and streets stay fixed. All spans share canonical local
 * X along the wall and local Z through it; modules overlap 8 cm at their seams. */
export function greenfallFortLayout(x: number, z: number): FortPartPlacement[] {
  const parts: FortPartPlacement[] = [];
  const add = (part: FortPartPlacement['part'], px: number, pz: number, height: number,
    width: number, depth: number, rotation = 0) => parts.push({part, x: x + px, z: z + pz, height, width, depth, rotation});
  const wallLine = (ax: number, az: number, bx: number, bz: number, count: number) => {
    const length = Math.hypot(bx - ax, bz - az);
    for (let i = 0; i < count; i++) {
      const t = (i + .5) / count;
      add('wall_thin_straight_01', ax + (bx - ax) * t, az + (bz - az) * t,
        4.8, length / count + .08, 1.42, -Math.atan2(bz - az, bx - ax));
    }
  };
  add('wall_thin_gate_01', 0, -17.2, 5.6, 7.2, 1.75);
  for (const side of [-1, 1]) {
    add('tower_round', side * 5.8, -17.2, 6.8, 5.5, 5.5);
    wallLine(side * 5.8, -17.2, side * 15.8, -17.2, 1);
    wallLine(side * 15.8, -17.2, side * 15.8, 10.5, 4);
    add('tower_round', side * 15.8, -17.2, 5.7, 4.4, 4.4);
    add('tower_round', side * 15.8, 10.5, 6.1, 4.8, 4.8);
    // Keep turrets touch the keep, clear the tavern and stay inside the rear wall.
    add('tower_round', side * 5.6, 8.0, 6.2, 3.2, 3.2);
  }
  wallLine(-15.8, 10.5, 15.8, 10.5, 4);
  return parts;
}

/** At actor height, the real gate's two jambs occupy 26.4% of its total span
 * each (measured from the shipped mesh cross-section), leaving a 47.2% opening. */
export function registerFortPartCollider(world: CollisionWorld, part: string, x: number, z: number,
  size: Readonly<{x: number; z: number}>, rotation: number, bottom: number, top: number): void {
  if (part.includes('gate')) {
    const halfJamb = size.x * .132;
    const offset = size.x * .368;
    for (const side of [-1, 1]) world.addBox(x + Math.cos(rotation) * offset * side,
      z - Math.sin(rotation) * offset * side, halfJamb, size.z * .5, rotation, bottom, top);
  } else if (part.includes('tower')) world.addCircle(x, z, Math.max(size.x, size.z) * .5, bottom, top);
  else world.addBox(x, z, size.x * .5, size.z * .5, rotation, bottom, top);
}

export const GREENFALL_REFERENCE_VIEWS = {
  gate: {x: -7, z: -29.5, alpha: -Math.PI / 2, beta: 1.05, radius: 14},
  square: {x: -7, z: -13.4, alpha: -Math.PI / 2, beta: .86, radius: 17},
  smith: {x: -17.2, z: -14.4, alpha: -Math.PI / 2, beta: .92, radius: 8},
} as const;
