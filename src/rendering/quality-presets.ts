export type QualityName = 'low' | 'medium' | 'high' | 'ultra';

export const QUALITY_PRESETS = Object.freeze({
  low: { resolutionScale: 0.65, antiAliasing: false, shadowQuality: 'off', textureQuality: 'medium', foliage: 'low', bloom: false, maxDistance: 150 },
  medium: { resolutionScale: 0.82, antiAliasing: true, shadowQuality: 'low', textureQuality: 'medium', foliage: 'medium', bloom: false, maxDistance: 230 },
  high: { resolutionScale: 1, antiAliasing: true, shadowQuality: 'high', textureQuality: 'high', foliage: 'high', bloom: true, maxDistance: 340 },
  ultra: { resolutionScale: 1.1, antiAliasing: true, shadowQuality: 'ultra', textureQuality: 'ultra', foliage: 'high', bloom: true, maxDistance: 430 },
} as const);

export function qualityPreset(name: QualityName) { return { ...QUALITY_PRESETS[name] }; }
