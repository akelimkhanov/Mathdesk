import type { Sample } from './types';
import { distanceToSegment } from './geometry';

/** Simplification considers pressure as well as position; endpoints always survive. */
export function simplifyInk(points: Sample[], tolerance: number): Sample[] {
  if (points.length < 3) return points.map((p) => ({ ...p }));
  const keep = new Set([0, points.length - 1]);
  const pending = [[0, points.length - 1]];
  while (pending.length) {
    const [start, end] = pending.pop()!;
    const a = points[start],
      b = points[end],
      dx = b.x - a.x,
      dy = b.y - a.y,
      length = dx * dx + dy * dy;
    let maximum = tolerance,
      index = -1;
    for (let i = start + 1; i < end; i++) {
      const p = points[i];
      const t = length
        ? Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / length))
        : (i - start) / (end - start);
      const error = Math.max(
        distanceToSegment(p, a, b),
        Math.abs(p.pressure - (a.pressure + (b.pressure - a.pressure) * t)) * tolerance * 16,
      );
      if (error > maximum) {
        maximum = error;
        index = i;
      }
    }
    if (index !== -1) {
      keep.add(index);
      pending.push([start, index], [index, end]);
    }
  }
  return [...keep].sort((a, b) => a - b).map((i) => ({ ...points[i] }));
}

/** Adaptive low-pass filtering in screen units: remove slow jitter without lagging fast strokes. */
export class InkBuilder {
  readonly points: Sample[];
  private latest: Sample;
  private filtered: Sample;
  private timestamp: number;
  private velocity = { x: 0, y: 0 };
  constructor(
    first: Sample,
    readonly zoom: number,
    readonly pen: boolean,
    time: number,
  ) {
    this.points = [{ ...first }];
    this.latest = { ...first };
    this.filtered = { ...first };
    this.timestamp = time;
  }
  add(sample: Sample, time: number) {
    const dt = Math.min(0.05, Math.max(0.001, (time - this.timestamp) / 1000));
    this.timestamp = time;
    const velocityAlpha = 1 - Math.exp(-dt * 2 * Math.PI * 2);
    this.velocity.x +=
      (((sample.x - this.latest.x) * this.zoom) / dt - this.velocity.x) * velocityAlpha;
    this.velocity.y +=
      (((sample.y - this.latest.y) * this.zoom) / dt - this.velocity.y) * velocityAlpha;
    const frequency =
      (this.pen ? 7 : 3) +
      Math.hypot(this.velocity.x, this.velocity.y) * (this.pen ? 0.025 : 0.018);
    const alpha = 1 - Math.exp(-dt * 2 * Math.PI * frequency);
    this.latest = { ...sample };
    this.filtered = {
      x: this.filtered.x + (sample.x - this.filtered.x) * alpha,
      y: this.filtered.y + (sample.y - this.filtered.y) * alpha,
      pressure: this.filtered.pressure + (sample.pressure - this.filtered.pressure) * 0.45,
    };
    const last = this.points.at(-1)!;
    if (
      Math.hypot(this.filtered.x - last.x, this.filtered.y - last.y) * this.zoom >=
        (this.pen ? 0.65 : 1.1) ||
      Math.abs(this.filtered.pressure - last.pressure) > 0.06
    )
      this.points.push({ ...this.filtered });
  }
  finish(): Sample[] {
    const last = this.points.at(-1)!;
    if (Math.hypot(this.latest.x - last.x, this.latest.y - last.y) * this.zoom > 0.25)
      this.points.push({ ...this.latest });
    return simplifyInk(this.points, 0.65 / this.zoom);
  }
}

const curves = new WeakMap<Sample[], Sample[]>();
/** Quadratic midpoint spline; also shared by rendering and hit tests. */
export function smoothInk(points: Sample[]): Sample[] {
  if (points.length < 3) return points;
  const cached = curves.get(points);
  if (cached) return cached;
  const result: Sample[] = [points[0]];
  let start = points[0];
  const quadratic = (control: Sample, end: Sample) => {
    const steps = Math.min(
      12,
      Math.max(2, Math.ceil(Math.hypot(end.x - start.x, end.y - start.y) / 4)),
    );
    for (let i = 1; i <= steps; i++) {
      const t = i / steps,
        u = 1 - t;
      result.push({
        x: u * u * start.x + 2 * u * t * control.x + t * t * end.x,
        y: u * u * start.y + 2 * u * t * control.y + t * t * end.y,
        pressure: u * u * start.pressure + 2 * u * t * control.pressure + t * t * end.pressure,
      });
    }
    start = end;
  };
  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i],
      b = points[i + 1];
    quadratic(a, {
      x: (a.x + b.x) / 2,
      y: (a.y + b.y) / 2,
      pressure: (a.pressure + b.pressure) / 2,
    });
  }
  quadratic(points.at(-1)!, points.at(-1)!);
  curves.set(points, result);
  return result;
}
