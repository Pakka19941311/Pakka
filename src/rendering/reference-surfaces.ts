/** Authored B02 palette. Terrain tint is sampled in world coordinates so clipped
 * road seams share the same colour, with no extra overlapping ground planes. */
export function terrainVertexColors(positions: readonly number[]): number[] {
  const colors: number[] = [];
  for (let i = 0; i < positions.length; i += 3) {
    const x = positions[i], z = positions[i + 2];
    const broad = Math.sin(x * .073 + Math.sin(z * .043) * 2.2) * Math.cos(z * .065 - x * .017);
    const detail = Math.sin(x * .43 + z * .27) * Math.sin(z * .31 - x * .23);
    const shade = .9 + broad * .065 + detail * .025;
    const moss = Math.max(0, Math.sin(x * .11 + .9) * Math.cos(z * .095));
    colors.push(shade - moss * .055, shade, shade - moss * .075, 1);
  }
  return colors;
}

export const REFERENCE_SURFACES = Object.freeze({
  // Terrain UVs span 320 × 280 metres: fine leaf/soil detail repeats every 4 × 3.5 m.
  groundRepeats: 80,
  roadRepeats: 144,
  fogDensity: .006,
});
