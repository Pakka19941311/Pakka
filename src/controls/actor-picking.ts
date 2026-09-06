import { Mesh } from '@babylonjs/core';
import type { AbstractMesh, Camera, PickingInfo, Scene, Skeleton } from '@babylonjs/core';

/** Exact visible-actor selection, sampled only on a pointer command.
 * Refresh every eligible visible mesh before ray picking: a stale bind-pose
 * bound must not reject an animated limb before its current pose is sampled.
 * The caller owns alive/kind filtering and static-world occlusion. */
export function pickVisibleActor(
  scene: Scene,
  camera: Camera,
  x: number,
  y: number,
  meshFilter: (mesh: AbstractMesh) => boolean,
  options: {radius?: number; visible?: (hit: PickingInfo) => boolean} = {},
): PickingInfo | null {
  const candidates = new Set<AbstractMesh>();
  const preparedSkeletons = new Set<Skeleton>();
  for (const mesh of scene.meshes) {
    if (!(mesh instanceof Mesh) || !mesh.isEnabled() || !mesh.isVisible || mesh.visibility <= 0
      || mesh.getTotalVertices() === 0 || !meshFilter(mesh)) continue;
    mesh.computeWorldMatrix(true);
    if (mesh.skeleton && !preparedSkeletons.has(mesh.skeleton)) {
      mesh.skeleton.prepare(true);
      preparedSkeletons.add(mesh.skeleton);
    }
    // Babylon 8.26 uses this per-instance, CPU-skinned position cache for exact
    // triangle intersections; GPU skinning and vertex buffers remain unchanged.
    mesh.refreshBoundingInfo({ applySkeleton: true, applyMorph: true, updatePositionsArray: true });
    candidates.add(mesh);
  }
  if (!candidates.size) return null;
  const sample = (sx: number, sy: number): PickingInfo | null => {
    // Occlusion is checked per candidate, so a hidden foreground actor cannot
    // mask a visible neighbour sampled by the same forgiving click.
    const hits = scene.multiPick(sx, sy, mesh => candidates.has(mesh), camera) ?? [];
    return hits.filter(hit => hit.hit && (!options.visible || options.visible(hit)))
      .sort((a, b) => a.distance - b.distance)[0] ?? null;
  };
  const exact = sample(x, y);
  if (exact) return exact;
  // CSS pixels, independent of render resolution. Exact geometry always wins;
  // tolerance samples actual animated triangles instead of oversized hit boxes.
  const radius = Math.max(0, Math.min(16, options.radius ?? 0));
  for (const distance of [radius / 2, radius]) {
    if (!distance) continue;
    const ring: PickingInfo[] = [];
    for (let i = 0; i < 12; i++) {
      const angle = i * Math.PI / 6;
      const hit = sample(x + Math.cos(angle) * distance, y + Math.sin(angle) * distance);
      if (hit) ring.push(hit);
    }
    if (ring.length) return ring.sort((a, b) => a.distance - b.distance)[0];
  }
  return null;
}
