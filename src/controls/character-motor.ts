export type PlanarDirection = Readonly<{ x: number; z: number }>;

export type CharacterMotorStep = Readonly<{
  dx: number;
  dz: number;
  facingX: number;
  facingZ: number;
  height: number;
  grounded: boolean;
  moving: boolean;
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

  requestJump(): boolean {
    if (!this.onGround) return false;
    this.onGround = false;
    this.verticalVelocity = 8.2;
    return true;
  }

  step(direction: PlanarDirection, maxSpeed: number, dt: number, maxDistance = Infinity): CharacterMotorStep {
    const length = Math.hypot(direction.x, direction.z);
    const inputX = length > 0.0001 ? direction.x / length : 0;
    const inputZ = length > 0.0001 ? direction.z / length : 0;
    const blend = response(length > 0.0001 ? 19 : 30, dt);
    this.velocityX += (inputX * maxSpeed - this.velocityX) * blend;
    this.velocityZ += (inputZ * maxSpeed - this.velocityZ) * blend;

    if (length > 0.0001) {
      // The visual yaw already interpolates along the shortest arc in main.
      // Normalizing a second vector lerp here locks exact 180-degree reversals:
      // each small step remains positive and normalizes back to the old facing.
      this.facingX = inputX;
      this.facingZ = inputZ;
    }

    let dx = this.velocityX * dt;
    let dz = this.velocityZ * dt;
    const distance = Math.hypot(dx, dz);
    if (distance > maxDistance) {
      const scale = maxDistance / Math.max(distance, 0.0001);
      dx *= scale;
      dz *= scale;
      this.velocityX = 0;
      this.velocityZ = 0;
    }

    if (!this.onGround) {
      this.verticalVelocity -= 22 * dt;
      this.jumpHeight += this.verticalVelocity * dt;
      if (this.jumpHeight <= 0) {
        this.jumpHeight = 0;
        this.verticalVelocity = 0;
        this.onGround = true;
      }
    }

    return {
      dx,
      dz,
      facingX: this.facingX,
      facingZ: this.facingZ,
      height: this.jumpHeight,
      grounded: this.onGround,
      moving: Math.hypot(this.velocityX, this.velocityZ) > 0.08,
    };
  }

  reset(): void {
    this.velocityX = 0;
    this.velocityZ = 0;
    this.verticalVelocity = 0;
    this.jumpHeight = 0;
    this.onGround = true;
  }

  stopPlanar(): void {
    this.velocityX = 0;
    this.velocityZ = 0;
  }

  get grounded(): boolean { return this.onGround; }
}
