import { Color3, DynamicTexture, Mesh, PBRMaterial, Texture, VertexData } from '@babylonjs/core';
import type { Material, Scene } from '@babylonjs/core';

export const CONIFER_TEMPLATE_COUNT = 3;
export const CONIFER_LOD_DISTANCE = 38;
export type ConiferDetail = 'near' | 'far';
type Point = readonly [number, number, number];
type Buffers = { positions: number[]; indices: number[]; uvs: number[]; colors: number[] };
export type ConiferGeometry = { wood: Buffers; needles: Buffers; branchCount: number };
export type ConiferSources = Readonly<{ trunk: Mesh; crown: Mesh }>;

const empty = (): Buffers => ({ positions: [], indices: [], uvs: [], colors: [] });
const add = (a: Point, b: Point): Point => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const scale = (p: Point, value: number): Point => [p[0] * value, p[1] * value, p[2] * value];
const lerp = (a: Point, b: Point, t: number): Point => add(scale(a, 1 - t), scale(b, t));
const unit = (p: Point): Point => scale(p, 1 / Math.hypot(...p));
const cross = (a: Point, b: Point): Point => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];

function vertex(buffer: Buffers, point: Point, u: number, v: number, tint = 1): number {
  const index = buffer.positions.length / 3;
  buffer.positions.push(...point); buffer.uvs.push(u, v);
  // Subtle needle tip and branch variation also works with the shared PBR material.
  buffer.colors.push(tint * 0.94, tint, tint * 0.9, 1);
  return index;
}

function branch(buffer: Buffers, a: Point, b: Point, radiusA: number, radiusB: number, sides: number): void {
  const direction = unit(add(b, scale(a, -1)));
  const right = unit(cross(direction, Math.abs(direction[1]) > 0.95 ? [1, 0, 0] : [0, 1, 0]));
  const up = cross(right, direction);
  const first = buffer.positions.length / 3;
  for (let ring = 0; ring < 2; ring += 1) {
    for (let side = 0; side <= sides; side += 1) {
      const angle = side / sides * Math.PI * 2, radius = ring ? radiusB : radiusA;
      const offset = add(scale(right, Math.cos(angle) * radius), scale(up, Math.sin(angle) * radius));
      vertex(buffer, add(ring ? b : a, offset), side / sides, ring ? b[1] * 3 : a[1] * 3);
    }
  }
  for (let side = 0; side < sides; side += 1) {
    const lower = first + side, upper = lower + sides + 1;
    buffer.indices.push(lower, lower + 1, upper, upper, lower + 1, upper + 1);
  }
}

/** A closed, flattened needle spray with an alternating serrated outline.
 * Separate boughs leave visible sky gaps. Near sprays carry an alpha-tested
 * needle mask, rather than blending broad transparent cards. All dimensions
 * are fractions of tree height. */
function spray(buffer: Buffers, center: Point, direction: Point, length: number, width: number,
  thickness: number, rimCount: number, tint: number, phase: number): void {
  const axis = unit(direction), side = unit(cross(axis, [0, 1, 0])), normal = unit(cross(side, axis));
  const top = vertex(buffer, add(center, scale(normal, thickness)), 0.5, 0.5, tint * 1.1);
  const bottom = vertex(buffer, add(center, scale(normal, -thickness * 0.65)), 0.5, 0.5, tint * 0.7);
  const rim = buffer.positions.length / 3;
  for (let index = 0; index < rimCount; index += 1) {
    const angle = index / rimCount * Math.PI * 2;
    const serration = rimCount > 4 && index % 2 ? 0.67 : 1;
    const longitudinal = Math.cos(angle) * length * 0.5;
    const lateral = Math.sin(angle) * width * 0.5 * serration;
    const uneven = Math.sin(index * 2.7 + phase) * thickness * 0.3;
    vertex(buffer, add(center, add(scale(axis, longitudinal), add(scale(side, lateral), scale(normal, uneven)))),
      (Math.cos(angle) + 1) * 0.5, (Math.sin(angle) + 1) * 0.5, tint * (index % 2 ? 0.82 : 1));
  }
  for (let index = 0; index < rimCount; index += 1) {
    const current = rim + index, next = rim + (index + 1) % rimCount;
    buffer.indices.push(top, current, next, bottom, next, current);
  }
}

/** Deterministic authored geometry. Every world tree instances one of three
 * templates; the world placement RNG is deliberately never consumed here. */
export function buildConiferGeometry(template = 0, detail: ConiferDetail = 'near'): ConiferGeometry {
  const variant = ((template % CONIFER_TEMPLATE_COUNT) + CONIFER_TEMPLATE_COUNT) % CONIFER_TEMPLATE_COUNT;
  let seed = [74017, 95131, 133337][variant];
  const random = (): number => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
  const wood = empty(), needles = empty(), near = detail === 'near';
  const leanX = (random() - 0.5) * 0.025, leanZ = (random() - 0.5) * 0.025;
  const trunkAt = (height: number): Point => [leanX * height * height, height, leanZ * height * height];
  const trunkSegments = near ? 7 : 4;
  for (let segment = 0; segment < trunkSegments; segment += 1) {
    const y0 = segment / trunkSegments, y1 = (segment + 1) / trunkSegments;
    branch(wood, trunkAt(y0), trunkAt(y1), 0.029 * (1 - y0) + 0.001, 0.029 * (1 - y1) + 0.001, near ? 7 : 5);
  }
  let branchCount = 0;
  const whorls = [6, 6, 6, 5, 5, 4, 4, 3];
  for (let tier = 0; tier < whorls.length; tier += 1) {
    const count = whorls[tier], tierY = 0.265 + tier * 0.092;
    const rotation = tier * 2.399 + variant * 0.71 + (random() - 0.5) * 0.5;
    for (let index = 0; index < count; index += 1) {
      branchCount += 1;
      const angle = rotation + index / count * Math.PI * 2 + (random() - 0.5) * 0.27;
      const y = tierY + (random() - 0.5) * 0.032;
      const reach = (0.232 - tier * 0.025) * (0.86 + random() * 0.22);
      const dip = (1 - tier / 10) * (0.016 + random() * 0.018);
      const start = trunkAt(y);
      const elbow: Point = add(start, [Math.cos(angle) * reach * 0.5, -dip, Math.sin(angle) * reach * 0.5]);
      const tip: Point = add(start, [Math.cos(angle) * reach, 0.012 + tier * 0.001, Math.sin(angle) * reach]);
      const tint = 0.76 + random() * 0.27 + tier * 0.014;
      // Draw all randomness before the detail branch, preserving the same skeleton in both LODs.
      const sprayTwist = (random() - 0.5) * 0.5;
      if (near) {
        const radius = 0.0055 * (1 - tier * 0.085);
        branch(wood, start, elbow, radius, radius * 0.56, 3);
        branch(wood, elbow, tip, radius * 0.56, 0.0007, 3);
        for (let tuft = 0; tuft < 3; tuft += 1) {
          const t = 0.28 + tuft * 0.32, tuftAngle = angle + (tuft % 2 ? 1 : -1) * (0.3 + sprayTwist);
          const center = t < 0.5 ? lerp(start, elbow, t * 2) : lerp(elbow, tip, (t - 0.5) * 2);
          const sideOffset = tuft === 1 ? -0.012 : 0.012;
          const displaced = add(center, [-Math.sin(angle) * sideOffset, (tuft - 1) * 0.014, Math.cos(angle) * sideOffset]);
          const tuftLength = reach * (0.61 - tuft * 0.045);
          spray(needles, displaced, [Math.cos(tuftAngle), 0.12 + tuft * 0.06, Math.sin(tuftAngle)],
            tuftLength, reach * (0.62 - tuft * 0.08), 0.018 + reach * 0.055, 10, tint, angle + tuft);
        }
      } else {
        spray(needles, lerp(elbow, tip, 0.28), [Math.cos(angle), 0.12, Math.sin(angle)],
          reach * 0.96, reach * 0.62, 0.023 + reach * 0.06, 4, tint, angle);
      }
    }
  }
  // A narrow upward shoot finishes the crown rather than a broad pyramid cap.
  spray(needles, trunkAt(0.965), [0.08, 1, 0.1], 0.07, 0.027, 0.01, near ? 10 : 4, 1.08, variant);
  return { wood, needles, branchCount };
}

function sourceMesh(scene: Scene, name: string, buffers: Buffers, material: Material): Mesh {
  const data = new VertexData(), normals: number[] = [];
  data.positions = buffers.positions; data.indices = buffers.indices;
  data.uvs = buffers.uvs; data.colors = buffers.colors;
  VertexData.ComputeNormals(buffers.positions, buffers.indices, normals); data.normals = normals;
  const mesh = new Mesh(name, scene); data.applyToMesh(mesh);
  mesh.material = material; mesh.isVisible = false; mesh.isPickable = false; mesh.receiveShadows = true;
  return mesh;
}

/** One small texture for the whole forest, authored from individual needle
 * strokes once at scene creation. Alpha testing keeps normal depth writes and
 * avoids sorting/blended foliage. No external image or runtime asset request. */
function needleMaterial(scene: Scene, foliage: Material): Material {
  // Geometry-only/server tools do not own a canvas; they still inspect exactly
  // the same vertices and LODs. The game itself always runs with a DOM canvas.
  if (!(foliage instanceof PBRMaterial) || typeof document === 'undefined') return foliage;
  const texture = new DynamicTexture('forest-shared-needle-mask', { width: 512, height: 256 }, scene, true, Texture.TRILINEAR_SAMPLINGMODE);
  texture.hasAlpha = true; texture.wrapU = texture.wrapV = Texture.CLAMP_ADDRESSMODE;
  const context = texture.getContext();
  context.clearRect(0, 0, 512, 256);
  let seed = 99173;
  const random = (): number => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
  const line = (ax: number, ay: number, bx: number, by: number, color: string, width: number) => {
    context.strokeStyle = color; context.lineWidth = width;
    context.beginPath(); context.moveTo(ax, ay); context.lineTo(bx, by); context.stroke();
  };
  for (let twig = 0; twig < 9; twig += 1) for (const side of [-1, 1]) {
    const x = 50 + twig * 43, y = 135 - twig * 1.5;
    const length = (88 - twig * 4) * (0.85 + random() * 0.2);
    const dx = length * 0.74, dy = side * length * 0.65;
    line(x, y, x + dx, y + dy, '#87916c', 3.1);
    for (let needle = 0; needle < 22; needle += 1) {
      const t = needle / 22, sx = x + dx * t, sy = y + dy * t;
      const needleLength = (15 + random() * 15) * (1 - t * 0.25);
      for (const flank of [-1, 1]) {
        const nx = dx / length * 0.45 - dy / length * flank * 0.9;
        const ny = dy / length * 0.45 + dx / length * flank * 0.9;
        const shade = Math.round(150 + random() * 80);
        line(sx, sy, sx + nx * needleLength, sy + ny * needleLength,
          `rgb(${Math.round(shade * 0.85)},${shade},${Math.round(shade * 0.77)})`, 1.65 + random() * 0.75);
      }
    }
  }
  line(25, 137, 493, 118, '#a49b76', 3.4);
  texture.update(false);
  const material = foliage.clone('forest-detailed-needle-material');
  material.albedoColor = new Color3(0.30, 0.41, 0.25);
  material.albedoTexture = texture; material.useAlphaFromAlbedoTexture = true;
  material.transparencyMode = PBRMaterial.PBRMATERIAL_ALPHATEST;
  material.alphaCutOff = 0.24; material.roughness = 0.98; material.metallic = 0;
  return material;
}

export function createConiferSources(scene: Scene, bark: Material, foliage: Material): readonly ConiferSources[] {
  const detailedNeedles = needleMaterial(scene, foliage);
  return Array.from({ length: CONIFER_TEMPLATE_COUNT }, (_, template) => {
    const near = buildConiferGeometry(template, 'near'), far = buildConiferGeometry(template, 'far');
    const trunk = sourceMesh(scene, `pine-source-${template}-trunk`, near.wood, bark);
    const crown = sourceMesh(scene, `pine-source-${template}-crown`, near.needles, detailedNeedles);
    trunk.addLODLevel(CONIFER_LOD_DISTANCE, sourceMesh(scene, `pine-source-${template}-trunk-far`, far.wood, bark));
    crown.addLODLevel(CONIFER_LOD_DISTANCE, sourceMesh(scene, `pine-source-${template}-crown-far`, far.needles, foliage));
    return { trunk, crown };
  });
}

export function coniferSourceForName(name: string, sources: readonly ConiferSources[]): ConiferSources {
  let hash = 0;
  for (const character of name) hash = (Math.imul(hash, 31) + character.charCodeAt(0)) >>> 0;
  return sources[hash % sources.length];
}
