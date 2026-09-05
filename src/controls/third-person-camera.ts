import { ArcRotateCamera, Vector3 } from '@babylonjs/core';
import type { MovementAxes } from './input-controller';

export type ThirdPersonCameraState = Readonly<{
  yaw: number;
  pitch: number;
  distance: number;
}>;

export const THIRD_PERSON_CAMERA_LIMITS = Object.freeze({
  minDistance: 5.5,
  maxDistance: 18,
  minPitch: 0.72,
  maxPitch: 1.36,
});

export function clampThirdPersonCameraState(state: ThirdPersonCameraState): ThirdPersonCameraState {
  return {
    yaw: state.yaw,
    pitch: Math.max(THIRD_PERSON_CAMERA_LIMITS.minPitch, Math.min(THIRD_PERSON_CAMERA_LIMITS.maxPitch, state.pitch)),
    distance: Math.max(THIRD_PERSON_CAMERA_LIMITS.minDistance, Math.min(THIRD_PERSON_CAMERA_LIMITS.maxDistance, state.distance)),
  };
}

export function cameraRelativeDirection(axes: MovementAxes, cameraYaw: number): Readonly<{ x: number; z: number }> {
  const forwardX = -Math.cos(cameraYaw);
  const forwardZ = -Math.sin(cameraYaw);
  const rightX = forwardZ;
  const rightZ = -forwardX;
  const x = forwardX * axes.forward + rightX * axes.strafe;
  const z = forwardZ * axes.forward + rightZ * axes.strafe;
  const length = Math.hypot(x, z);
  return length > 1 ? { x: x / length, z: z / length } : { x, z };
}

function smoothFactor(speed: number, dt: number): number {
  return 1 - Math.exp(-speed * Math.max(0, dt));
}

function lerpAngle(current: number, target: number, amount: number): number {
  const delta = ((target - current + Math.PI) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) - Math.PI;
  return current + delta * amount;
}

export class ThirdPersonCameraController {
  private readonly camera: ArcRotateCamera;
  private desired: ThirdPersonCameraState;
  private readonly focus = new Vector3();
  private readonly wantedFocus = new Vector3();
  private readonly wantedCamera = new Vector3();
  private obstruction?: (focus: Vector3, camera: Vector3) => number;
  private zoomDistance = 10.5;
  private mouseSensitivity = 1;
  private zoomSensitivity = 1;
  private smoothing = 1;
  private invertY = false;

  constructor(camera: ArcRotateCamera) {
    this.camera = camera;
    this.desired = clampThirdPersonCameraState({
      yaw: -Math.PI / 2,
      pitch: 1.06,
      distance: 10.5,
    });
    // Input zoom still has its gameplay limit; obstruction recovery may move closer.
    camera.lowerRadiusLimit = 1.1;
    camera.upperRadiusLimit = THIRD_PERSON_CAMERA_LIMITS.maxDistance;
    camera.lowerBetaLimit = THIRD_PERSON_CAMERA_LIMITS.minPitch;
    camera.upperBetaLimit = THIRD_PERSON_CAMERA_LIMITS.maxPitch;
    camera.alpha = this.desired.yaw;
    camera.beta = this.desired.pitch;
    camera.radius = this.desired.distance;
  }

  orbit(delta: Readonly<{ x: number; y: number }>): void {
    this.desired = clampThirdPersonCameraState({
      yaw: this.desired.yaw - delta.x * 0.0048 * this.mouseSensitivity,
      pitch: this.desired.pitch - delta.y * 0.0038 * this.mouseSensitivity * (this.invertY ? -1 : 1),
      distance: this.desired.distance,
    });
  }

  zoom(wheelDelta: number): void {
    this.desired = clampThirdPersonCameraState({
      ...this.desired,
      distance: this.desired.distance + wheelDelta * 0.0065 * this.zoomSensitivity,
    });
  }

  movementDirection(axes: MovementAxes): Readonly<{ x: number; z: number }> {
    return cameraRelativeDirection(axes, this.camera.alpha);
  }

  update(dt: number, playerPosition: Readonly<{ x: number; y: number; z: number }>): void {
    const rotationBlend = smoothFactor(16 * this.smoothing, dt);
    const distanceBlend = smoothFactor(12 * this.smoothing, dt);
    this.camera.alpha = lerpAngle(this.camera.alpha, this.desired.yaw, rotationBlend);
    this.camera.beta += (this.desired.pitch - this.camera.beta) * rotationBlend;
    this.zoomDistance += (this.desired.distance - this.zoomDistance) * distanceBlend;

    const viewForward = cameraRelativeDirection({ forward: 1, strafe: 0 }, this.camera.alpha);
    this.wantedFocus.set(
      playerPosition.x + viewForward.x * 2.15,
      playerPosition.y + 1.35,
      playerPosition.z + viewForward.z * 2.15,
    );
    // The caller supplies the interpolated player pose. Adding a second long
    // horizontal follow filter here made movement feel hundreds of milliseconds late.
    this.focus.x = this.wantedFocus.x;
    this.focus.z = this.wantedFocus.z;
    this.focus.y += (this.wantedFocus.y - this.focus.y) * smoothFactor(18, dt);
    this.camera.target.copyFrom(this.focus);
    const horizontal = this.zoomDistance * Math.sin(this.camera.beta);
    this.wantedCamera.set(this.focus.x + Math.cos(this.camera.alpha) * horizontal,
      this.focus.y + this.zoomDistance * Math.cos(this.camera.beta), this.focus.z + Math.sin(this.camera.alpha) * horizontal);
    const allowed = this.obstruction ? this.obstruction(this.focus, this.wantedCamera) : this.zoomDistance;
    const radius = Math.max(1.1, Math.min(this.zoomDistance, allowed));
    this.camera.radius = radius < this.camera.radius ? radius : this.camera.radius + (radius - this.camera.radius) * smoothFactor(7, dt);
  }

  snap(playerPosition: Readonly<{ x: number; y: number; z: number }>): void {
    this.camera.alpha = this.desired.yaw;
    this.camera.beta = this.desired.pitch;
    this.camera.radius = this.desired.distance;
    this.zoomDistance = this.desired.distance;
    const viewForward = cameraRelativeDirection({ forward: 1, strafe: 0 }, this.desired.yaw);
    this.focus.set(
      playerPosition.x + viewForward.x * 2.15,
      playerPosition.y + 1.35,
      playerPosition.z + viewForward.z * 2.15,
    );
    this.camera.target.copyFrom(this.focus);
  }

  get state(): ThirdPersonCameraState {
    return { ...this.desired };
  }

  setObstructionProbe(probe: (focus: Vector3, camera: Vector3) => number): void { this.obstruction = probe; }

  configure(options: Readonly<{ mouseSensitivity: number; zoomSensitivity: number; smoothing: number; invertY: boolean }>): void {
    this.mouseSensitivity = Math.max(0.25, Math.min(2.5, options.mouseSensitivity));
    this.zoomSensitivity = Math.max(0.35, Math.min(2.2, options.zoomSensitivity));
    this.smoothing = Math.max(0.55, Math.min(1.8, options.smoothing));
    this.invertY = options.invertY;
  }
}
