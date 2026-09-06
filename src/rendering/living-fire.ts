import { Constants, Mesh, MeshBuilder, ShaderMaterial, VertexBuffer } from '@babylonjs/core';
import type { Scene } from '@babylonjs/core';

export interface LivingFireOptions {
  x: number;
  /** World height at the base of the flame, rather than its centre. */
  y: number;
  z: number;
  scale?: number;
}

export interface LivingFire {
  readonly flames: readonly Mesh[];
  readonly embers: readonly Mesh[];
  /** Normally called by the scene observer; also available for deterministic checks. */
  update(dt: number): void;
  dispose(): void;
}

// Authored locally: no downloaded flame sprite, texture sampler or compute pass.
// A colour attribute carries a fixed layer seed and distinguishes an ember from
// a flame, so all nine quads share the same material and shader program.
const vertexSource = `
precision highp float;
attribute vec3 position;
attribute vec2 uv;
attribute vec4 color;
uniform mat4 worldViewProjection;
varying vec2 fireUV;
varying vec4 layer;
void main(void) {
  fireUV = uv;
  layer = color;
  gl_Position = worldViewProjection * vec4(position, 1.0);
}`;

const fragmentSource = `
precision highp float;
uniform float fireTime;
varying vec2 fireUV;
varying vec4 layer;

float hash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}
float noise(vec2 p) {
  vec2 cell = floor(p);
  vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(cell), hash(cell + vec2(1.0, 0.0)), f.x),
             mix(hash(cell + vec2(0.0, 1.0)), hash(cell + vec2(1.0)), f.x), f.y);
}
float turbulence(vec2 p) {
  return noise(p) * 0.60 + noise(p * 2.03 + 7.1) * 0.28
       + noise(p * 4.11 + 13.7) * 0.12;
}
void main(void) {
  float seed = layer.r;
  if (layer.g > 0.5) {
    float age = fract(fireTime * (0.36 + seed * 0.05) + seed);
    vec2 p = (fireUV - 0.5) * vec2(2.8, 2.0);
    float alpha = (1.0 - smoothstep(0.15, 1.0, dot(p, p)))
                * smoothstep(0.02, 0.12, age)
                * (1.0 - smoothstep(0.62, 1.0, age));
    if (alpha < 0.015) discard;
    gl_FragColor = vec4(1.0, 0.48 + 0.30 * (1.0 - age), 0.10, alpha * 0.85);
    return;
  }

  float y = fireUV.y;
  float t = fireTime * (1.18 + seed * 0.21);
  vec2 flow = vec2(fireUV.x * 3.4 + seed * 19.0, y * 3.9 - t * 1.65);
  float n = turbulence(flow);
  float bend = sin(y * 7.0 - t * 2.3 + seed * 9.0) * y * 0.13;
  float across = abs((fireUV.x - 0.5) * 2.0 + bend + (n - 0.5) * (0.18 + y * 0.76));
  float width = 0.78 * pow(max(0.0, 1.0 - y), 0.68) + (n - 0.5) * 0.32;
  float body = 1.0 - smoothstep(width - 0.15, width + 0.075, across);
  float wisps = smoothstep(0.16 + y * 0.23, 0.64,
                          turbulence(flow * 0.73 + vec2(3.2, -t * 0.27)));
  float alpha = body * mix(0.60, 1.0, wisps)
              * smoothstep(0.0, 0.07, y)
              * (1.0 - smoothstep(0.78, 1.0, y));
  if (alpha < 0.015) discard;
  float heat = clamp(body * (1.0 - y * 0.80) + (n - 0.5) * 0.25 + layer.b * 0.10, 0.0, 1.0);
  vec3 flame = mix(vec3(0.92, 0.09, 0.012), vec3(1.0, 0.51, 0.06), smoothstep(0.05, 0.65, heat));
  flame = mix(flame, vec3(1.0, 0.88, 0.42), smoothstep(0.65, 1.0, heat));
  gl_FragColor = vec4(flame, alpha * 0.65);
}`;

/** Three camera-facing tongues plus six embers: 18 triangles per source.
 * The material is shared across the source, with one uniform update and one
 * observer. Keeping each source's clock separate also makes manual updates
 * deterministic without advancing neighbouring fires. */
export function createLivingFire(scene: Scene, name: string, options: LivingFireOptions): LivingFire {
  const { x, y, z } = options;
  const scale = options.scale ?? 1;
  if (![x, y, z, scale].every(Number.isFinite) || scale <= 0) {
    throw new RangeError('Living fire needs finite coordinates and a positive scale.');
  }
  const material = new ShaderMaterial(`${name}-living-fire-material`, scene,
    { vertexSource, fragmentSource }, {
      attributes: ['position', 'uv', 'color'],
      uniforms: ['worldViewProjection', 'fireTime'],
      needAlphaBlending: true,
      needAlphaTesting: false,
    });
  material.backFaceCulling = false;
  material.disableDepthWrite = true;
  material.alphaMode = Constants.ALPHA_ADD;

  const makeQuad = (suffix: string, width: number, height: number, seed: number, ember: boolean): Mesh => {
    const mesh = MeshBuilder.CreatePlane(`${name}-${suffix}`, { width, height }, scene);
    const colors = new Float32Array(mesh.getTotalVertices() * 4);
    for (let index = 0; index < colors.length; index += 4) {
      colors[index] = seed;
      colors[index + 1] = ember ? 1 : 0;
      colors[index + 2] = ember ? 0 : seed;
      colors[index + 3] = 1;
    }
    mesh.setVerticesData(VertexBuffer.ColorKind, colors);
    mesh.material = material;
    mesh.billboardMode = ember ? Mesh.BILLBOARDMODE_ALL : Mesh.BILLBOARDMODE_Y;
    mesh.isPickable = false;
    mesh.checkCollisions = false;
    mesh.receiveShadows = false;
    mesh.metadata = { livingFire: name, kind: ember ? 'ember' : 'flame' };
    return mesh;
  };

  const flames: Mesh[] = [];
  const widths = [1.02, 0.92, 0.76];
  const heights = [1.36, 1.70, 1.13];
  for (let index = 0; index < 3; index += 1) {
    const height = heights[index] * scale;
    const mesh = makeQuad(`flame-${index}`, widths[index] * scale, height, 0.12 + index * 0.29, false);
    mesh.position.set(x + (index - 1) * 0.14 * scale, y + height * 0.5, z + (index % 2 ? 0.09 : -0.07) * scale);
    flames.push(mesh);
  }
  const embers: Mesh[] = [];
  for (let index = 0; index < 6; index += 1) {
    const size = (0.035 + (index % 3) * 0.011) * scale;
    embers.push(makeQuad(`ember-${index}`, size, size * 1.8, (index + 0.5) / 6, true));
  }

  let elapsed = 0;
  let disposed = false;
  const update = (dt: number): void => {
    if (disposed || !Number.isFinite(dt) || dt < 0) return;
    // A background-tab gap must not cause an oversized visible simulation step.
    elapsed += Math.min(dt, 0.10);
    material.setFloat('fireTime', elapsed);
    for (let index = 0; index < embers.length; index += 1) {
      const seed = (index + 0.5) / 6;
      const age = (elapsed * (0.36 + seed * 0.05) + seed) % 1;
      const angle = seed * Math.PI * 2;
      const spread = (0.08 + age * 0.30) * scale;
      embers[index].position.set(
        x + Math.sin(angle + age * 2.4) * spread,
        y + (0.35 + age * (1.9 + seed * 0.6)) * scale,
        z + Math.cos(angle + age * 1.7) * spread,
      );
    }
  };
  update(0);
  const observer = scene.onBeforeRenderObservable.add(() => update(scene.getEngine().getDeltaTime() / 1000));
  const dispose = (): void => {
    if (disposed) return;
    disposed = true;
    scene.onBeforeRenderObservable.remove(observer);
    scene.onDisposeObservable.remove(disposeObserver);
    for (let index = 0; index < flames.length; index += 1) flames[index].dispose();
    for (let index = 0; index < embers.length; index += 1) embers[index].dispose();
    material.dispose();
  };
  const disposeObserver = scene.onDisposeObservable.add(dispose);
  return { flames, embers, update, dispose };
}
