import type { Landmark, PoseFrame } from './pose';

/**
 * One Euro filter (Casiez et al. 2012): smooths jitter strongly when a point is still and lets it
 * follow quickly when it moves fast. Applied to every landmark coordinate before rep counting, so
 * camera noise neither breaks a rep apart nor triggers false form warnings.
 */
class OneEuro {
  private x: number | null = null;
  private dx = 0;
  private t = 0;
  constructor(
    private readonly minCutoff: number,
    private readonly beta: number,
    private readonly dCutoff = 1,
  ) {}

  private static alpha(cutoff: number, dt: number): number {
    const tau = 1 / (2 * Math.PI * cutoff);
    return 1 / (1 + tau / dt);
  }

  filter(value: number, tMs: number): number {
    if (this.x === null) {
      this.x = value;
      this.t = tMs;
      return value;
    }
    const dt = Math.max(1e-3, (tMs - this.t) / 1000);
    this.t = tMs;
    const dxRaw = (value - this.x) / dt;
    this.dx += (dxRaw - this.dx) * OneEuro.alpha(this.dCutoff, dt);
    const cutoff = this.minCutoff + this.beta * Math.abs(this.dx);
    this.x += (value - this.x) * OneEuro.alpha(cutoff, dt);
    return this.x;
  }
}

export class LandmarkSmoother {
  private filters: OneEuro[][] = [];
  private lastT = -Infinity;

  /** minCutoff in Hz (lower = smoother when still); beta = how fast it follows quick movement. */
  constructor(
    private readonly minCutoff = 1.5,
    private readonly beta = 8,
  ) {}

  reset(): void {
    this.filters = [];
    this.lastT = -Infinity;
  }

  apply(frame: PoseFrame): PoseFrame {
    if (!frame.landmarks) {
      // A gap longer than half a second starts the filters fresh (the person may have moved)
      if (frame.t - this.lastT > 500) this.filters = [];
      return frame;
    }
    if (frame.t - this.lastT > 500) this.filters = [];
    this.lastT = frame.t;
    const out: Landmark[] = frame.landmarks.map((l, i) => {
      const f = (this.filters[i] ??= [new OneEuro(this.minCutoff, this.beta), new OneEuro(this.minCutoff, this.beta)]);
      return { ...l, x: f[0]!.filter(l.x, frame.t), y: f[1]!.filter(l.y, frame.t) };
    });
    return { t: frame.t, landmarks: out };
  }
}
