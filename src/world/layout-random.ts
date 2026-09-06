/** A private stream for map construction. Gameplay, effects and UUID creation
 * cannot consume it or change the world shared by different clients. */
export function createLayoutRandom(seed = 314159): (min: number, max: number) => number {
  return (min, max) => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return min + seed / 4294967296 * (max - min);
  };
}
