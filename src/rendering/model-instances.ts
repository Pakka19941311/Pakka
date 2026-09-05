import { AssetContainer, Color3, Material, MultiMaterial, PBRMaterial, StandardMaterial, TransformNode } from '@babylonjs/core';
import { repairImportedMaterial } from './realism-materials.ts';

/** Templates/material variants live for the scene; meshes, rigs and animations live per actor. */
export class ModelInstances {
  private variants = new Map<Material, Map<string, Material>>();

  private materialFor(source: Material, tint?: number): Material {
    let variants = this.variants.get(source);
    if (!variants) { variants = new Map(); this.variants.set(source, variants); }
    const key = tint === undefined ? 'base' : String(tint);
    const previous = variants.get(key);
    if (previous) return previous;
    const name = `${source.name}-variant-${key}`;
    let material: Material;
    if (source instanceof MultiMaterial) {
      // Avoid Babylon 8.26 AssetContainer cloneMaterials mutating template subMaterials.
      if (tint === undefined) {
        for (const child of source.subMaterials) if (child) this.materialFor(child);
        material = source;
      } else {
        const multi = new MultiMaterial(name, source.getScene());
        multi.subMaterials = source.subMaterials.map(child => child ? this.materialFor(child, tint) : null);
        material = multi;
      }
    } else {
      material = tint === undefined ? source : source.clone(name) ?? source;
      const color = tint === undefined ? undefined : Color3.FromHexString(`#${tint.toString(16).padStart(6, '0')}`);
      if (material instanceof PBRMaterial) repairImportedMaterial(material, color);
      else if (material instanceof StandardMaterial && color) material.diffuseColor = material.diffuseColor.multiply(color);
    }
    variants.set(key, material);
    return material;
  }

  create(container: AssetContainer, name: string, tint?: number) {
    const entries = container.instantiateModelsToScene(source => `${name}-${source}`, false,
      { doNotInstantiate: container.animationGroups.length > 0 || container.skeletons.length > 0 || tint !== undefined });
    entries.animationGroups.forEach(group => { group.stop(); group.reset(); });
    entries.skeletons.forEach(skeleton => skeleton.returnToRest());
    const root = new TransformNode(name, container.scene);
    const pose = entries.animationGroups.length ? new TransformNode(`${name}-pose`, container.scene) : root;
    if (pose !== root) pose.parent = root;
    for (const node of entries.rootNodes) node.parent = pose;
    for (const mesh of root.getChildMeshes()) {
      if (mesh.material) {
        const material = this.materialFor(mesh.material, tint);
        if (mesh.material !== material) mesh.material = material;
      }
    }
    let disposed = false;
    return {
      root, pose, animations: entries.animationGroups,
      dispose: () => {
        if (disposed) return;
        disposed = true;
        // InstantiatedEntries disposes cloned rigs/animations, never shared textures/materials.
        entries.dispose();
        root.dispose(false, false);
      },
    };
  }
}
