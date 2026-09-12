/** Layout coordinates: east +X, south +Z. Administrative hunting identity
 * only; this polygon must never be passed to the protected safe-zone resolver.
 * P0's tighter L02 contour remains in world-expansion-v3.ts as provenance.
 */
export const P2_L02_HUNTING_CONTOUR:number[][]=[
 [-264,62],[-40,55],[15,150],[-10,245],[-180,265],[-285,246],[-306,160],
];
export const P2_HABITAT_LAYOUT_VERSION='p2-habitats-v2';
export const P2_LOCATION_OVERRIDES=[{id:'L02',name:'Гринфолл',outline_xz:P2_L02_HUNTING_CONTOUR,
 purpose:'hunting-administration-only',version:P2_HABITAT_LAYOUT_VERSION}] as const;
