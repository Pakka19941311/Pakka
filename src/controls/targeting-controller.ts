export type ExplicitTarget = Readonly<{
  uid: string;
  alive: boolean;
  x: number;
  z: number;
}>;

export class TargetingController<T extends ExplicitTarget> {
  private current: T | null = null;

  get selected(): T | null {
    return this.current;
  }

  select(target: T): T {
    this.current = target;
    return target;
  }

  clear(): void {
    this.current = null;
  }

  validate(): T | null {
    if (this.current && !this.current.alive) this.current = null;
    return this.current;
  }

  isSelected(target: T): boolean {
    return this.current?.uid === target.uid;
  }
}
