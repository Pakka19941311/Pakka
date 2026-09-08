export type PlanarDirection = Readonly<{ x: number; z: number }>;

export type LocomotionState = 'ground' | 'jump_start' | 'airborne' | 'fall' | 'land';
export const JUMP_SPEED = 8.2;
export const JUMP_GRAVITY = 22;

export type CharacterMotorStep = Readonly<{
  dx: number;
  dz: number;
  facingX: number;
  facingZ: number;
  height: number;
  grounded: boolean;
  moving: boolean;
  verticalVelocity: number;
  locomotionState: LocomotionState;
}>;

const response = (speed: number, dt: number): number => 1 - Math.exp(-speed * Math.max(0, dt));

export function smoothAngle(current: number, target: number, speed: number, dt: number): number {
  const delta = ((target - current + Math.PI) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) - Math.PI;
  return current + delta * response(speed, dt);
}

export class CharacterMotor {
  private velocityX = 0;
  private velocityZ = 0;
  private facingX = 0;
  private facingZ = 1;
  private verticalVelocity = 0;
  private jumpHeight = 0;
  private onGround = true;
  private jumpTime = 0;
  private landTime = 0;

  requestJump(): boolean {
    if (!this.onGround) return false;
    this.onGround = false;
    this.verticalVelocity = JUMP_SPEED;
    this.jumpTime = 0;
    this.landTime = 0;
    return true;
  }

  step(direction: PlanarDirection, maxSpeed: number, dt: number, maxDistance = Infinity): CharacterMotorStep {
    dt = Math.max(0, dt);
    const length = Math.hypot(direction.x, direction.z);
    const inputX = length > 0.0001 ? direction.x / length : 0;
    const inputZ = length > 0.0001 ? direction.z / length : 0;
    const rate = length > 0.0001 ? 19 : 30;
    const blend = response(rate, dt);
    const targetX = inputX * maxSpeed, targetZ = inputZ * maxSpeed;
    // Exact approved 1e94a0d1 motor: the simulation owns a fixed 60 Hz step.
    // Integrate velocity first, as in the reference, then move by that velocity.
    this.velocityX += (targetX - this.velocityX) * blend;
    this.velocityZ += (targetZ - this.velocityZ) * blend;
    let dx = this.velocityX * dt;
    let dz = this.velocityZ * dt;

    if (length > 0.0001) {
      // The visual yaw already interpolates along the shortest arc in main.
      // Normalizing a second vector lerp here locks exact 180-degree reversals:
      // each small step remains positive and normalizes back to the old facing.
      this.facingX = inputX;
      this.facingZ = inputZ;
    }

    const distance = Math.hypot(dx, dz);
    if (distance > maxDistance) {
      const scale = maxDistance / Math.max(distance, 0.0001);
      dx *= scale;
      dz *= scale;
      this.velocityX = 0;
      this.velocityZ = 0;
    }

    if (!this.onGround) {
      this.jumpTime += dt;
      this.verticalVelocity -= JUMP_GRAVITY * dt;
      this.jumpHeight += this.verticalVelocity * dt;
      if (this.jumpHeight <= 0 && this.verticalVelocity <= 0) {
        this.jumpHeight = 0;
        this.verticalVelocity = 0;
        this.onGround = true;
        this.landTime = 0.10;
      }
    } else this.landTime = Math.max(0, this.landTime - dt);

    return {
      dx,
      dz,
      facingX: this.facingX,
      facingZ: this.facingZ,
      height: this.jumpHeight,
      grounded: this.onGround,
      moving: Math.hypot(this.velocityX, this.velocityZ) > 0.08,
      verticalVelocity: this.verticalVelocity,
      locomotionState: this.onGround ? (this.landTime > 0 ? 'land' : 'ground')
        : this.jumpTime <= 0.06 ? 'jump_start' : this.verticalVelocity > 0 ? 'airborne' : 'fall',
    };
  }

  reset(): void {
    this.velocityX = 0;
    this.velocityZ = 0;
    this.verticalVelocity = 0;
    this.jumpHeight = 0;
    this.onGround = true;
    this.jumpTime = 0;
    this.landTime = 0;
  }

  stopPlanar(): void {
    this.velocityX = 0;
    this.velocityZ = 0;
  }

  get grounded(): boolean { return this.onGround; }
}
