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

  constructor(camera: ArcRotateCamera) {
    this.camera = camera;
    this.desired = clampThirdPersonCameraState({
      yaw: -Math.PI / 2,
      pitch: 1.06,
      distance: 10.5,
    });
    camera.lowerRadiusLimit = THIRD_PERSON_CAMERA_LIMITS.minDistance;
    camera.upperRadiusLimit = THIRD_PERSON_CAMERA_LIMITS.maxDistance;
    camera.lowerBetaLimit = THIRD_PERSON_CAMERA_LIMITS.minPitch;
    camera.upperBetaLimit = THIRD_PERSON_CAMERA_LIMITS.maxPitch;
    camera.alpha = this.desired.yaw;
    camera.beta = this.desired.pitch;
    camera.radius = this.desired.distance;
  }

  orbit(delta: Readonly<{ x: number; y: number }>): void {
    this.desired = clampThirdPersonCameraState({
      yaw: this.desired.yaw - delta.x * 0.006,
      pitch: this.desired.pitch - delta.y * 0.0045,
      distance: this.desired.distance,
    });
  }

  zoom(wheelDelta: number): void {
    this.desired = clampThirdPersonCameraState({
      ...this.desired,
      distance: this.desired.distance + wheelDelta * 0.008,
    });
  }

  movementDirection(axes: MovementAxes): Readonly<{ x: number; z: number }> {
    return cameraRelativeDirection(axes, this.camera.alpha);
  }

  update(dt: number, playerPosition: Readonly<{ x: number; y: number; z: number }>): void {
    const rotationBlend = smoothFactor(15, dt);
    const distanceBlend = smoothFactor(12, dt);
    this.camera.alpha = lerpAngle(this.camera.alpha, this.desired.yaw, rotationBlend);
    this.camera.beta += (this.desired.pitch - this.camera.beta) * rotationBlend;
    this.camera.radius += (this.desired.distance - this.camera.radius) * distanceBlend;

    const viewForward = cameraRelativeDirection({ forward: 1, strafe: 0 }, this.camera.alpha);
    const wantedFocus = new Vector3(
      playerPosition.x + viewForward.x * 2.15,
      playerPosition.y + 1.35,
      playerPosition.z + viewForward.z * 2.15,
    );
    Vector3.LerpToRef(this.focus, wantedFocus, smoothFactor(11, dt), this.focus);
    this.camera.setTarget(this.focus);
  }

  snap(playerPosition: Readonly<{ x: number; y: number; z: number }>): void {
    this.camera.alpha = this.desired.yaw;
    this.camera.beta = this.desired.pitch;
    this.camera.radius = this.desired.distance;
    const viewForward = cameraRelativeDirection({ forward: 1, strafe: 0 }, this.desired.yaw);
    this.focus.set(
      playerPosition.x + viewForward.x * 2.15,
      playerPosition.y + 1.35,
      playerPosition.z + viewForward.z * 2.15,
    );
    this.camera.setTarget(this.focus);
  }

  get state(): ThirdPersonCameraState {
    return { ...this.desired };
  }
}
