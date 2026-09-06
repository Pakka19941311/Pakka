import { Color3, MaterialPluginBase, PBRMaterial, Scene, Texture } from '@babylonjs/core';

/** Retain the source atlas's eyes, muzzle and coat boundaries at pixel resolution.
 * Vertex colour alone loses details painted inside a triangle. */
class GreyCoat extends MaterialPluginBase {
  constructor(material: PBRMaterial) {
    super(material, 'VarendorGreyCoat', 200, {}, true, true);
    this.doNotSerialize = true;
  }
  override getCustomCode(shaderType: string): Record<string, string> | null {
    return shaderType === 'fragment' ? {
      CUSTOM_FRAGMENT_BEFORE_LIGHTS: `
        float varendorCoatLuma = dot(surfaceAlbedo, vec3(0.2126, 0.7152, 0.0722));
        surfaceAlbedo = varendorCoatLuma * vec3(0.98, 1.0, 1.02);
      `,
    } : null;
  }
}

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
  if (material.name.startsWith('Reference grey wolf coat') && !material.pluginManager?.getPlugin('VarendorGreyCoat')) {
    new GreyCoat(material);
  }
  if (tint) material.albedoColor = material.albedoColor.multiply(tint);
  if (!material.albedoTexture && material.albedoColor.toLuminance() < 0.025) {
    material.albedoColor = tint?.scale(0.5) ?? new Color3(0.34, 0.33, 0.31);
  }
  // G reference surfaces are authored with explicit steel/leather values;
  // legacy imported assets retain the conservative repair limits.
  if (!material.name.startsWith('Reference ')) {
    material.metallic = Math.min(material.metallic ?? 0, 0.38);
    material.roughness = Math.max(material.roughness ?? 0.55, 0.48);
  }
  material.environmentIntensity = Math.max(material.environmentIntensity, 0.42);
  // Preserve glTF's doubleSided choice. Do not force every opaque surface two-sided.
}
