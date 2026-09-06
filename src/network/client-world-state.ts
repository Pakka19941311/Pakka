import type { Position, WorldEvent } from './world-protocol.ts';

/** Streams repeat the recent event window. Resume starts at the current world,
 * while subsequent packets may only present events newer than the cursor. */
export class WorldEventCursor {
  private sequence = -1;
  consume(events: readonly WorldEvent[], serverTime: number): WorldEvent[] {
    const first = this.sequence < 0;
    const result: WorldEvent[] = [];
    for (const event of [...events].sort((a,b)=>a.sequence-b.sequence)) {
      if (event.sequence <= this.sequence) continue;
      this.sequence = event.sequence;
      if (!first && event.at >= serverTime - 1800) result.push(event);
    }
    if (first && this.sequence < 0) this.sequence = 0;
    return result;
  }
  get lastSequence(): number { return this.sequence; }
}

/** Normal packets correct prediction gently; respawn/teleport cannot leave a
 * rendered character sliding through the intervening walls. */
export function reconcilePosition(current: Position, authoritative: Position, seconds: number, discontinuity = false): Position {
  const error = Math.hypot(authoritative.x-current.x,authoritative.z-current.z);
  if (discontinuity || error > 3.5) return {x:authoritative.x,z:authoritative.z};
  const blend=1-Math.exp(-12*Math.max(0,seconds));
  return {x:current.x+(authoritative.x-current.x)*blend,z:current.z+(authoritative.z-current.z)*blend};
}
