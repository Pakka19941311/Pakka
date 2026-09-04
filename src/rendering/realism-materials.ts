import { Color3, PBRMaterial, Scene, Texture } from '@babylonjs/core';

export type PbrSurface = 'forest_ground_06' | 'cobblestone_floor_001' | 'castle_wall_slates' | 'medieval_wood' | 'roof_slates_02' | 'pine_bark';

const TEXTURE_ROOT = '/assets/textures/pbr/';

export function createPbrSurface(scene: Scene, surface: PbrSurface, tiling: number, roughness = 0.9): PBRMaterial {
  const material = new PBRMaterial(`pbr-${surface}`, scene);
  const texture = (suffix: string, gammaSpace: boolean) => {
    const value = new Texture(`${TEXTURE_ROOT}${surface}_${suffix}.jpg`, scene, false, false);
    value.uScale = tiling;
    value.vScale = tiling;
    value.gammaSpace = gammaSpace;
    value.anisotropicFilteringLevel = 8;
    return value;
  };
  material.albedoTexture = texture('albedo', true);
  material.bumpTexture = texture('normal', false);
  material.metallicTexture = texture('roughness', false);
  material.useRoughnessFromMetallicTextureGreen = true;
  material.useMetallnessFromMetallicTextureBlue = false;
  material.metallic = 0;
  material.roughness = roughness;
  material.environmentIntensity = 0.65;
  return material;
}

export function repairImportedMaterial(material: unknown, tint?: Color3): void {
  if (!(material instanceof PBRMaterial)) return;
  if (tint) material.albedoColor = material.albedoColor.multiply(tint);
  if (!material.albedoTexture && material.albedoColor.toLuminance() < 0.025) {
    material.albedoColor = tint?.scale(0.5) ?? new Color3(0.34, 0.33, 0.31);
  }
  material.metallic = Math.min(material.metallic ?? 0, 0.38);
  material.roughness = Math.max(material.roughness ?? 0.55, 0.48);
  material.environmentIntensity = Math.max(material.environmentIntensity, 0.42);
  // Preserve glTF's doubleSided choice. Do not force every opaque surface two-sided.
}
