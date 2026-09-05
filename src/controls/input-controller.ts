export type MovementAxes = Readonly<{
  forward: number;
  strafe: number;
}>;

const FORWARD_CODES = ['KeyW', 'ArrowUp'];
const BACKWARD_CODES = ['KeyS', 'ArrowDown'];
const LEFT_CODES = ['KeyA', 'ArrowLeft'];
const RIGHT_CODES = ['KeyD', 'ArrowRight'];

function hasAny(pressed: ReadonlySet<string>, codes: readonly string[]): boolean {
  return codes.some((code) => pressed.has(code));
}

export function movementAxesFromPressed(pressed: ReadonlySet<string>): MovementAxes {
  const forward = Number(hasAny(pressed, FORWARD_CODES)) - Number(hasAny(pressed, BACKWARD_CODES));
  const strafe = Number(hasAny(pressed, RIGHT_CODES)) - Number(hasAny(pressed, LEFT_CODES));
  const length = Math.hypot(forward, strafe);

  if (length <= 1) return { forward, strafe };
  return { forward: forward / length, strafe: strafe / length };
}

function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return Boolean(target.closest('input, textarea, select, [contenteditable="true"]'));
}

export class PlayerInputController {
  private readonly canvas: HTMLCanvasElement;
  private readonly windowTarget: Window;
  private readonly pressed = new Set<string>();
  private orbitPointerId: number | null = null;
  private orbitX = 0;
  private orbitY = 0;
  private zoom = 0;
  private jumpQueued = false;
  private movementStarted = false;

  constructor(
    canvas: HTMLCanvasElement,
    windowTarget: Window = window,
  ) {
    this.canvas = canvas;
    this.windowTarget = windowTarget;
    windowTarget.addEventListener('keydown', this.onKeyDown);
    windowTarget.addEventListener('keyup', this.onKeyUp);
    windowTarget.addEventListener('blur', this.onBlur);
    canvas.addEventListener('pointerdown', this.onPointerDown);
    canvas.addEventListener('pointermove', this.onPointerMove);
    canvas.addEventListener('pointerup', this.onPointerUp);
    canvas.addEventListener('pointercancel', this.onPointerUp);
    canvas.addEventListener('wheel', this.onWheel, { passive: false });
    canvas.addEventListener('contextmenu', this.onContextMenu);
  }

  movementAxes(): MovementAxes {
    return movementAxesFromPressed(this.pressed);
  }

  consumeMovementStart(): boolean {
    const started = this.movementStarted;
    this.movementStarted = false;
    return started;
  }

  consumeCameraOrbit(): Readonly<{ x: number; y: number }> {
    const delta = { x: this.orbitX, y: this.orbitY };
    this.orbitX = 0;
    this.orbitY = 0;
    return delta;
  }

  consumeZoom(): number {
    const delta = this.zoom;
    this.zoom = 0;
    return delta;
  }

  consumeJump(): boolean {
    const queued = this.jumpQueued;
    this.jumpQueued = false;
    return queued;
  }

  get isOrbitingCamera(): boolean {
    return this.orbitPointerId !== null;
  }

  reset(): void {
    this.pressed.clear();
    if (this.orbitPointerId !== null && this.canvas.hasPointerCapture?.(this.orbitPointerId)) this.canvas.releasePointerCapture(this.orbitPointerId);
    this.orbitPointerId = null;
    this.orbitX = 0; this.orbitY = 0; this.zoom = 0; this.jumpQueued = false; this.movementStarted = false;
  }

  dispose(): void {
    this.windowTarget.removeEventListener('keydown', this.onKeyDown);
    this.windowTarget.removeEventListener('keyup', this.onKeyUp);
    this.windowTarget.removeEventListener('blur', this.onBlur);
    this.canvas.removeEventListener('pointerdown', this.onPointerDown);
    this.canvas.removeEventListener('pointermove', this.onPointerMove);
    this.canvas.removeEventListener('pointerup', this.onPointerUp);
    this.canvas.removeEventListener('pointercancel', this.onPointerUp);
    this.canvas.removeEventListener('wheel', this.onWheel);
    this.canvas.removeEventListener('contextmenu', this.onContextMenu);
  }

  private readonly onKeyDown = (event: KeyboardEvent): void => {
    if (isTypingTarget(event.target)) return;
    if (event.code === 'Space') {
      event.preventDefault();
      if (!event.repeat) this.jumpQueued = true;
      return;
    }
    if ([...FORWARD_CODES, ...BACKWARD_CODES, ...LEFT_CODES, ...RIGHT_CODES].includes(event.code)) {
      event.preventDefault();
      // Preserve the command edge even if key-down and key-up both arrive
      // during a slow frame; combat cancellation must not depend on held keys.
      if (!this.pressed.has(event.code)) this.movementStarted = true;
      this.pressed.add(event.code);
    }
  };

  private readonly onKeyUp = (event: KeyboardEvent): void => {
    this.pressed.delete(event.code);
  };

  private readonly onBlur = (): void => {
    this.reset();
  };

  private readonly onPointerDown = (event: PointerEvent): void => {
    if (event.button !== 2) return;
    event.preventDefault();
    this.orbitPointerId = event.pointerId;
    this.canvas.setPointerCapture?.(event.pointerId);
  };

  private readonly onPointerMove = (event: PointerEvent): void => {
    if (event.pointerId !== this.orbitPointerId) return;
    this.orbitX += event.movementX;
    this.orbitY += event.movementY;
  };

  private readonly onPointerUp = (event: PointerEvent): void => {
    if (event.pointerId !== this.orbitPointerId) return;
    this.orbitPointerId = null;
    if (this.canvas.hasPointerCapture?.(event.pointerId)) this.canvas.releasePointerCapture(event.pointerId);
  };

  private readonly onWheel = (event: WheelEvent): void => {
    event.preventDefault();
    this.zoom += Math.max(-240, Math.min(240, event.deltaY));
  };

  private readonly onContextMenu = (event: MouseEvent): void => {
    event.preventDefault();
  };
}
