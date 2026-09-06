import { AssetContainer, TransformNode, Vector3 } from '@babylonjs/core';

/** Keep the selected glTF descendant and its coordinate-conversion parent.
 * glTF's root is __root__, not the exported Blender object name. */
export function createStaticPart(container: AssetContainer, partName: string, name: string, height: number,
  footprint: Readonly<{ width?: number; depth?: number }> = {}) {
  const entries = container.instantiateModelsToScene(source => `${name}-${source}`, false, { doNotInstantiate: true });
  const root = new TransformNode(name, container.scene);
  const content = new TransformNode(`${name}-content`, container.scene);
  content.parent = root;
  entries.rootNodes.forEach(node => { node.parent = content; });
  const matches = content.getDescendants().filter(node => node instanceof TransformNode && node.name.endsWith(partName));
  if (matches.length !== 1) {
    entries.dispose(); root.dispose();
    throw new Error(`Static part ${partName}: expected one exported node, found ${matches.length}`);
  }
  const selected = matches[0] as TransformNode;
  const keep = new Set([selected, ...selected.getDescendants()]);
  for (let parent = selected.parent; parent; parent = parent.parent) keep.add(parent);
  for (const node of content.getDescendants()) {
    if (!keep.has(node) && node.parent && keep.has(node.parent)) node.dispose(false, false);
  }
  const retained = content.getChildMeshes().filter(mesh => mesh.getTotalVertices() > 0);
  if (!retained.length) throw new Error(`Static part ${partName}: empty geometry`);
  entries.animationGroups.forEach(group => group.dispose());
  content.computeWorldMatrix(true);
  retained.forEach(mesh => mesh.computeWorldMatrix(true));
  let bounds = content.getHierarchyBoundingVectors(true);
  // These CC0 modules are exported along Z. The layout/collision contract uses
  // X for the wall span and Z for its thickness, including the gate's opening.
  if (/wall_thin_(straight|gate)/.test(partName) && bounds.max.z - bounds.min.z > bounds.max.x - bounds.min.x) {
    content.rotation.y = Math.PI / 2;
    content.computeWorldMatrix(true);
    retained.forEach(mesh => mesh.computeWorldMatrix(true));
    bounds = content.getHierarchyBoundingVectors(true);
  }
  const scale = height / Math.max(0.001, bounds.max.y - bounds.min.y);
  // Offset the exported grid placement BEFORE applying the world rotation.
  content.scaling.setAll(scale);
  content.position.set(-(bounds.min.x + bounds.max.x) * scale / 2, -bounds.min.y * scale, -(bounds.min.z + bounds.max.z) * scale / 2);
  const size = bounds.max.subtract(bounds.min).scale(scale);
  if (footprint.width !== undefined) { root.scaling.x = footprint.width / size.x; size.x = footprint.width; }
  if (footprint.depth !== undefined) { root.scaling.z = footprint.depth / size.z; size.z = footprint.depth; }
  return { root, size: new Vector3(size.x, size.y, size.z), meshes: retained };
}
