export type PlanarPoint = Readonly<{ x: number; z: number }>;

/** Swept circle contact with tangent motion. An overlapping actor can always leave;
 * NPC/monster bodies never become permanent blockers in the static navigation grid. */
export function slidePastActor(from: PlanarPoint, delta: PlanarPoint, center: PlanarPoint, radius: number): PlanarPoint {
  const sx = from.x - center.x, sz = from.z - center.z;
  const length = Math.hypot(sx, sz);
  if (length < radius + 0.0001) {
    if (length < 0.0001) return delta;
    const nx = sx / length, nz = sz / length;
    const inward = Math.min(0, delta.x * nx + delta.z * nz);
    return { x: delta.x - inward * nx, z: delta.z - inward * nz };
  }
  const a = delta.x * delta.x + delta.z * delta.z;
  if (a < 1e-12) return delta;
  const b = 2 * (sx * delta.x + sz * delta.z);
  const c = sx * sx + sz * sz - radius * radius;
  const discriminant = b * b - 4 * a * c;
  if (discriminant <= 0 || b >= 0) return delta;
  const hit = (-b - Math.sqrt(discriminant)) / (2 * a);
  if (hit < 0 || hit > 1) return delta;
  const t = Math.max(0, hit - 0.0001);
  const nx = (sx + delta.x * hit) / radius, nz = (sz + delta.z * hit) / radius;
  const rx = delta.x * (1 - t), rz = delta.z * (1 - t);
  const inward = Math.min(0, rx * nx + rz * nz);
  return { x: delta.x * t + rx - inward * nx, z: delta.z * t + rz - inward * nz };
}
