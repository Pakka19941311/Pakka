import { Color3, MeshBuilder, StandardMaterial } from '@babylonjs/core';

// Temporary presentation guardrail for the current vertical-slice prototype.
// It deliberately changes only the two torus effects that made combat read like
// a debug/mobile glow blob. Core combat, targeting and damage logic remain untouched.
const originalCreateTorus = MeshBuilder.CreateTorus;
type CreateTorusArgs = Parameters<typeof originalCreateTorus>;

const createTorusWithGuardrails = ((...args: CreateTorusArgs) => {
  const [name, options, scene] = args;
  const safeOptions = options ?? {};
  const isTargetMarker = name === 'selected-target';
  const isImpactRing = name.startsWith('impact-');

  const tunedOptions = isTargetMarker
    ? { ...safeOptions, thickness: Math.min(safeOptions.thickness ?? 0.09, 0.026) }
    : isImpactRing
      ? {
        ...safeOptions,
        diameter: Math.min(safeOptions.diameter ?? 0.45, 0.26),
        thickness: Math.min(safeOptions.thickness ?? 0.07, 0.016),
      }
      : safeOptions;

  const mesh = originalCreateTorus(name, tunedOptions, scene);

  // main.ts assigns the material immediately after mesh creation. Run after the
  // current synchronous block so we tune that actual material instead of racing it.
  if (isTargetMarker || isImpactRing) {
    queueMicrotask(() => {
      if (isImpactRing) {
        // Damage is already communicated by projectile/contact + damage number.
        // The expanding emissive ring was the giant orange/red blob seen in playtest.
        mesh.setEnabled(false);
        return;
      }

      mesh.visibility = 0.58;
      const material = mesh.material;
      if (material instanceof StandardMaterial) {
        material.emissiveColor = new Color3(0.055, 0.022, 0.008);
        material.diffuseColor = new Color3(0.34, 0.16, 0.055);
        material.alpha = 0.48;
        material.disableLighting = false;
      }
    });
  }

  return mesh;
}) as typeof MeshBuilder.CreateTorus;

MeshBuilder.CreateTorus = createTorusWithGuardrails;
