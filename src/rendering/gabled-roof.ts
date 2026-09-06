import { Mesh, VertexData } from '@babylonjs/core';
import type { Scene } from '@babylonjs/core';

/** A fitted roof with a real ridge and eaves. The old four-sided cone did not
 * cover the rectangular building corners, exposing a flat slab under the roof. */
export function createGabledRoof(scene: Scene, name: string, width: number, depth: number, rise: number): Mesh {
  const x = width / 2, z = depth / 2;
  const positions: number[] = [], indices: number[] = [], uvs: number[] = [];
  const face = (points: number[][]) => {
    const start = positions.length / 3;
    positions.push(...points.flat());
    uvs.push(...(points.length === 4 ? [0,0, 0,1, 1,1, 1,0] : [0,0, .5,1, 1,0]));
    for (let i = 1; i < points.length - 1; i++) indices.push(start, start + i + 1, start + i);
  };
  face([[-x,0,-z],[-x,0,z],[0,rise,z],[0,rise,-z]]);
  face([[0,rise,-z],[0,rise,z],[x,0,z],[x,0,-z]]);
  face([[-x,0,-z],[0,rise,-z],[x,0,-z]]);
  face([[-x,0,z],[x,0,z],[0,rise,z]]);
  face([[-x,0,-z],[x,0,-z],[x,0,z],[-x,0,z]]);
  const data = new VertexData();
  data.positions = positions; data.indices = indices; data.uvs = uvs;
  const normals: number[] = []; VertexData.ComputeNormals(positions, indices, normals); data.normals = normals;
  const mesh = new Mesh(name, scene); data.applyToMesh(mesh); return mesh;
}
