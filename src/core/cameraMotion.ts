import type { Camera, Point } from './types';
import { zoomAt } from './geometry';
export class CameraMotion {
  private frame = 0;
  private target: Camera | null = null;
  constructor(
    private readonly read: () => Camera,
    private readonly write: (c: Camera) => void,
  ) {}
  stop() {
    if (this.frame) cancelAnimationFrame(this.frame);
    this.frame = 0;
    this.target = null;
  }
  zoom(anchor: Point, factor: number) {
    this.to(zoomAt(this.read(), anchor, (this.target ?? this.read()).zoom * factor));
  }
  to(target: Camera) {
    const start = this.read();
    this.stop();
    this.target = target;
    if (
      typeof matchMedia !== 'undefined' &&
      matchMedia('(prefers-reduced-motion: reduce)').matches
    ) {
      this.write(target);
      this.target = null;
      return;
    }
    const time = performance.now();
    const tick = (now: number) => {
      const t = Math.min(1, (now - time) / 160),
        ease = 1 - (1 - t) ** 3;
      this.write(
        t === 1
          ? target
          : {
              x: start.x + (target.x - start.x) * ease,
              y: start.y + (target.y - start.y) * ease,
              zoom: start.zoom + (target.zoom - start.zoom) * ease,
            },
      );
      if (t < 1) this.frame = requestAnimationFrame(tick);
      else {
        this.frame = 0;
        this.target = null;
      }
    };
    this.frame = requestAnimationFrame(tick);
  }
}
