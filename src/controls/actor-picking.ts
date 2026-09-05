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
  const hit = scene.pick(x, y, mesh => candidates.has(mesh), false, camera);
  return hit.hit ? hit : null;
}
