import { createShape, distanceToSegment, localToWorld } from './geometry';
import { simplifyInk } from './ink';
import type { Point, ShapeObject, StrokeObject } from './types';
export const SHAPE_HOLD_MS = 500;
export function recognizeShape(stroke: StrokeObject, zoom = 1): ShapeObject | null {
  const points = stroke.points.map((p) => ({ ...localToWorld(p, stroke), pressure: p.pressure }));
  if (points.length < 2) return null;
  const first = points[0],
    last = points.at(-1)!;
  const distance = Math.hypot(last.x - first.x, last.y - first.y);
  let length = 0;
  for (let i = 1; i < points.length; i++)
    length += Math.hypot(points[i].x - points[i - 1].x, points[i].y - points[i - 1].y);
  const source = { strokes: [points] };
  if (
    distance * zoom >= 30 &&
    length / distance < 1.08 &&
    points.every((p) => distanceToSegment(p, first, last) <= Math.max(2.5 / zoom, distance * 0.035))
  ) {
    return { ...createShape(first, last, 'line', stroke.style), source };
  }
  const xs = points.map((p) => p.x),
    ys = points.map((p) => p.y);
  const minX = Math.min(...xs),
    minY = Math.min(...ys),
    width = Math.max(...xs) - minX,
    height = Math.max(...ys) - minY;
  const diagonal = Math.hypot(width, height);
  if (Math.min(width, height) * zoom < 30 || distance > Math.max(10 / zoom, diagonal * 0.15))
    return null;
  if (width / height > 0.8 && width / height < 1.25) {
    const center = { x: minX + width / 2, y: minY + height / 2 },
      radius = (width + height) / 4;
    const rms = Math.sqrt(
      points.reduce(
        (sum, p) => sum + (Math.hypot(p.x - center.x, p.y - center.y) / radius - 1) ** 2,
        0,
      ) / points.length,
    );
    let angularTravel = 0;
    for (let i = 1; i < points.length; i++) {
      let a =
        Math.atan2(points[i].y - center.y, points[i].x - center.x) -
        Math.atan2(points[i - 1].y - center.y, points[i - 1].x - center.x);
      if (a > Math.PI) a -= Math.PI * 2;
      if (a < -Math.PI) a += Math.PI * 2;
      angularTravel += a;
    }
    if (
      rms < 0.12 &&
      Math.abs(angularTravel) > 5.4 &&
      length / (2 * Math.PI * radius) > 0.8 &&
      length / (2 * Math.PI * radius) < 1.25
    ) {
      return {
        ...createShape(
          { x: center.x - radius, y: center.y - radius },
          { x: center.x + radius, y: center.y + radius },
          'ellipse',
          stroke.style,
        ),
        source,
      };
    }
  }
  const simplified = simplifyInk(points, Math.max(2 / zoom, diagonal * 0.025));
  const angles = [
    0,
    ...simplified.slice(1).map((p, i) => Math.atan2(p.y - simplified[i].y, p.x - simplified[i].x)),
  ];
  for (const angle of angles) {
    const cos = Math.cos(angle),
      sin = Math.sin(angle);
    const rotated: Point[] = points.map((p) => ({
      x: p.x * cos + p.y * sin,
      y: -p.x * sin + p.y * cos,
    }));
    const x = Math.min(...rotated.map((p) => p.x)),
      y = Math.min(...rotated.map((p) => p.y));
    const w = Math.max(...rotated.map((p) => p.x)) - x,
      h = Math.max(...rotated.map((p) => p.y)) - y;
    if (Math.min(w, h) * zoom < 25 || length / (2 * (w + h)) < 0.8 || length / (2 * (w + h)) > 1.2)
      continue;
    const errors = rotated.map((p) =>
      Math.min(
        Math.abs(p.x - x) / w,
        Math.abs(p.x - x - w) / w,
        Math.abs(p.y - y) / h,
        Math.abs(p.y - y - h) / h,
      ),
    );
    const corners = [
      { x, y },
      { x: x + w, y },
      { x: x + w, y: y + h },
      { x, y: y + h },
    ];
    if (
      errors.some((e) => e > 0.12) ||
      errors.reduce((a, b) => a + b, 0) / errors.length > 0.045 ||
      !corners.every((c) =>
        rotated.some((p) => Math.hypot((p.x - c.x) / w, (p.y - c.y) / h) < 0.18),
      )
    )
      continue;
    const cx = (x + w / 2) * cos - (y + h / 2) * sin,
      cy = (x + w / 2) * sin + (y + h / 2) * cos;
    return {
      ...createShape(
        { x: cx - w / 2, y: cy - h / 2 },
        { x: cx + w / 2, y: cy + h / 2 },
        'rectangle',
        stroke.style,
      ),
      rotation: angle,
      source,
    };
  }
  return null;
}
