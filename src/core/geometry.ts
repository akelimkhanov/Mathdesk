import type {
  BoardObject,
  Camera,
  Point,
  Rect,
  Sample,
  ShapeKind,
  ShapeObject,
  StrokeObject,
  ObjectStyle,
} from './types';

export const MIN_ZOOM = 0.1;
export const MAX_ZOOM = 5;
export const screenToWorld = (p: Point, c: Camera): Point => ({
  x: (p.x - c.x) / c.zoom,
  y: (p.y - c.y) / c.zoom,
});
export const worldToScreen = (p: Point, c: Camera): Point => ({
  x: p.x * c.zoom + c.x,
  y: p.y * c.zoom + c.y,
});
export function zoomAt(c: Camera, anchor: Point, zoom: number): Camera {
  const next = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, zoom));
  const world = screenToWorld(anchor, c);
  return { x: anchor.x - world.x * next, y: anchor.y - world.y * next, zoom: next };
}
export function localToWorld(p: Point, o: Rect & { rotation: number }): Point {
  const dx = p.x - o.width / 2,
    dy = p.y - o.height / 2;
  const cos = Math.cos(o.rotation),
    sin = Math.sin(o.rotation);
  return {
    x: o.x + o.width / 2 + dx * cos - dy * sin,
    y: o.y + o.height / 2 + dx * sin + dy * cos,
  };
}
export function worldToLocal(p: Point, o: Rect & { rotation: number }): Point {
  const dx = p.x - o.x - o.width / 2,
    dy = p.y - o.y - o.height / 2;
  const cos = Math.cos(o.rotation),
    sin = Math.sin(o.rotation);
  return { x: o.width / 2 + dx * cos + dy * sin, y: o.height / 2 - dx * sin + dy * cos };
}
export function bounds(o: BoardObject): Rect {
  const corners = [
    { x: 0, y: 0 },
    { x: o.width, y: 0 },
    { x: o.width, y: o.height },
    { x: 0, y: o.height },
  ].map((p) => localToWorld(p, o));
  const x = Math.min(...corners.map((p) => p.x)),
    y = Math.min(...corners.map((p) => p.y));
  const pad = o.style.width / 2;
  return {
    x: x - pad,
    y: y - pad,
    width: Math.max(...corners.map((p) => p.x)) - x + 2 * pad,
    height: Math.max(...corners.map((p) => p.y)) - y + 2 * pad,
  };
}
export function unionBounds(objects: BoardObject[]): Rect | null {
  if (!objects.length) return null;
  let minX = Infinity,
    minY = Infinity,
    maxX = -Infinity,
    maxY = -Infinity;
  for (const o of objects) {
    const b = bounds(o);
    minX = Math.min(minX, b.x);
    minY = Math.min(minY, b.y);
    maxX = Math.max(maxX, b.x + b.width);
    maxY = Math.max(maxY, b.y + b.height);
  }
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}
export const intersects = (a: Rect, b: Rect): boolean =>
  a.x <= b.x + b.width && a.x + a.width >= b.x && a.y <= b.y + b.height && a.y + a.height >= b.y;
export function distanceToSegment(p: Point, a: Point, b: Point): number {
  const dx = b.x - a.x,
    dy = b.y - a.y;
  const t = Math.max(
    0,
    Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / (dx * dx + dy * dy || 1)),
  );
  return Math.hypot(p.x - a.x - t * dx, p.y - a.y - t * dy);
}
export function hitTest(p: Point, o: BoardObject, tolerance = 6): boolean {
  const q = worldToLocal(p, o),
    pad = tolerance + o.style.width / 2;
  if (o.type === 'stroke') {
    if (o.points.length === 1) return Math.hypot(q.x - o.points[0].x, q.y - o.points[0].y) <= pad;
    const sx = o.width / (strokeExtent(o.points).width || 1),
      sy = o.height / (strokeExtent(o.points).height || 1);
    for (let i = 1; i < o.points.length; i++) {
      const a = o.points[i - 1],
        b = o.points[i];
      if (distanceToSegment(q, { x: a.x * sx, y: a.y * sy }, { x: b.x * sx, y: b.y * sy }) <= pad)
        return true;
    }
    return false;
  }
  if (o.type === 'shape' && (o.kind === 'line' || o.kind === 'arrow'))
    return distanceToSegment(q, { x: 0, y: o.height / 2 }, { x: o.width, y: o.height / 2 }) <= pad;
  if (q.x < -pad || q.y < -pad || q.x > o.width + pad || q.y > o.height + pad) return false;
  if (o.type === 'shape' && o.kind === 'ellipse')
    return (
      ((q.x - o.width / 2) / (o.width / 2 + pad)) ** 2 +
        ((q.y - o.height / 2) / (o.height / 2 + pad)) ** 2 <=
      1
    );
  if (o.type === 'shape' && o.kind === 'triangle') {
    const edge = o.height ? (Math.min(1, Math.max(0, q.y / o.height)) * o.width) / 2 : o.width / 2;
    return Math.abs(q.x - o.width / 2) <= edge + pad;
  }
  return true;
}
export function fitCamera(
  objects: BoardObject[],
  viewport: { width: number; height: number },
): Camera {
  const b = unionBounds(objects);
  if (!b) return { x: 0, y: 0, zoom: 1 };
  const zoom = Math.max(
    MIN_ZOOM,
    Math.min(
      2,
      (viewport.width - 160) / Math.max(1, b.width),
      (viewport.height - 160) / Math.max(1, b.height),
    ),
  );
  return {
    x: (viewport.width - b.width * zoom) / 2 - b.x * zoom,
    y: (viewport.height - b.height * zoom) / 2 - b.y * zoom,
    zoom,
  };
}
export function strokeExtent(points: Sample[]): { width: number; height: number } {
  let width = 0,
    height = 0;
  for (const p of points) {
    width = Math.max(width, p.x);
    height = Math.max(height, p.y);
  }
  return { width: Math.max(1, width), height: Math.max(1, height) };
}
export function createStroke(
  points: Sample[],
  brush: StrokeObject['brush'],
  style: ObjectStyle,
): StrokeObject {
  let x = Infinity,
    y = Infinity,
    maxX = -Infinity,
    maxY = -Infinity;
  for (const p of points) {
    x = Math.min(x, p.x);
    y = Math.min(y, p.y);
    maxX = Math.max(maxX, p.x);
    maxY = Math.max(maxY, p.y);
  }
  return {
    id: crypto.randomUUID(),
    type: 'stroke',
    brush,
    x,
    y,
    width: Math.max(1, maxX - x),
    height: Math.max(1, maxY - y),
    rotation: 0,
    locked: false,
    style: { ...style },
    points: points.map((p) => ({ ...p, x: p.x - x, y: p.y - y })),
  };
}
export function createShape(
  start: Point,
  end: Point,
  kind: ShapeKind,
  style: ObjectStyle,
): ShapeObject {
  const isLine = kind === 'line' || kind === 'arrow';
  // Line orientation is preserved through rotation, including negative slopes.
  if (isLine) {
    const length = Math.max(1, Math.hypot(end.x - start.x, end.y - start.y));
    const mid = { x: (start.x + end.x) / 2, y: (start.y + end.y) / 2 };
    return {
      id: crypto.randomUUID(),
      type: 'shape',
      kind,
      x: mid.x - length / 2,
      y: mid.y - 0.5,
      width: length,
      height: 1,
      rotation: Math.atan2(end.y - start.y, end.x - start.x),
      locked: false,
      style: { ...style },
    };
  }
  return {
    id: crypto.randomUUID(),
    type: 'shape',
    kind,
    x: Math.min(start.x, end.x),
    y: Math.min(start.y, end.y),
    width: Math.max(1, Math.abs(end.x - start.x)),
    height: Math.max(1, Math.abs(end.y - start.y)),
    rotation: 0,
    locked: false,
    style: { ...style },
  };
}
export function resizeObject(o: BoardObject, width: number, height: number): BoardObject {
  const next = { ...o, width: Math.max(1, width), height: Math.max(1, height) };
  if (o.type === 'math')
    return {
      ...next,
      fontSize: Math.max(8, Math.min(300, (o.fontSize * next.height) / o.height)),
    } as BoardObject;
  return next;
}
