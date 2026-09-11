/** Spatial identity is explicit; interior coordinates are local metres. */
export type SpaceId = 'surface' | 'mine' | 'great_cave';
export type SpatialPoint = {x:number; z:number; spaceId?:SpaceId};
export const spaceOf = (p:SpatialPoint):SpaceId => p.spaceId ?? 'surface';
export const sameSpace = (a:SpatialPoint,b:SpatialPoint):boolean => spaceOf(a)===spaceOf(b);
export const spatialDistance = (a:SpatialPoint,b:SpatialPoint):number => sameSpace(a,b)?Math.hypot(a.x-b.x,a.z-b.z):Infinity;
