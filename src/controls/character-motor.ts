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
    const hasInput = length > 0.0001;

    const currentSpeed = Math.hypot(this.velocityX, this.velocityZ);
    const currentDirX = currentSpeed > 0.0001 ? this.velocityX / currentSpeed : 0;
    const currentDirZ = currentSpeed > 0.0001 ? this.velocityZ / currentSpeed : 0;
    const directionDot = hasInput ? currentDirX * inputX + currentDirZ * inputZ : 1;
    const reversing = hasInput && currentSpeed > 0.25 && directionDot < -0.2;

    // Smoother acceleration/deceleration than the prototype while keeping WASD responsive.
    const velocityResponse = hasInput ? (reversing ? 14.5 : 11.5) : 17.5;
    const blend = response(velocityResponse, dt);
    this.velocityX += (inputX * maxSpeed - this.velocityX) * blend;
    this.velocityZ += (inputZ * maxSpeed - this.velocityZ) * blend;

    if (hasInput) {
      const facingBlend = response(reversing ? 11.5 : 8.5, dt);
      this.facingX += (inputX - this.facingX) * facingBlend;
      this.facingZ += (inputZ - this.facingZ) * facingBlend;
      const facingLength = Math.hypot(this.facingX, this.facingZ);
      if (facingLength > 0.0001) {
        this.facingX /= facingLength;
        this.facingZ /= facingLength;
      }
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
}
