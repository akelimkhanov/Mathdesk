import type { BoardObject, Point, Rect } from './types';
import { localToWorld, resizeObject, strokeExtent, unionBounds } from './geometry';

export function expandGroups(objects: BoardObject[], ids: string[]): string[] {
  const selected = new Set(ids),
    groups = new Set(objects.filter((o) => selected.has(o.id) && o.groupId).map((o) => o.groupId));
  return objects
    .filter((o) => selected.has(o.id) || (o.groupId && groups.has(o.groupId)))
    .map((o) => o.id);
}
export function isLocked(objects: BoardObject[], o: BoardObject): boolean {
  return (
    o.locked ||
    !!(o.groupId && objects.some((member) => member.groupId === o.groupId && member.locked))
  );
}
export function cloneObjects(objects: BoardObject[], offset = 24): BoardObject[] {
  const groups = new Map<string, string>();
  return structuredClone(objects).map((o) => {
    if (o.groupId && !groups.has(o.groupId)) groups.set(o.groupId, crypto.randomUUID());
    return {
      ...o,
      id: crypto.randomUUID(),
      x: o.x + offset,
      y: o.y + offset,
      locked: false,
      ...(o.groupId ? { groupId: groups.get(o.groupId) } : {}),
    };
  });
}
export function scaleSelection(objects: BoardObject[], frame: Rect, factor: number): BoardObject[] {
  return objects.map((o) => {
    const next = resizeObject(o, o.width * factor, o.height * factor);
    return {
      ...next,
      x: frame.x + (o.x - frame.x) * factor,
      y: frame.y + (o.y - frame.y) * factor,
      ...('fontSize' in o ? { fontSize: Math.max(8, Math.min(300, o.fontSize * factor)) } : {}),
    } as BoardObject;
  });
}
export function rotateSelection(objects: BoardObject[], frame: Rect, angle: number): BoardObject[] {
  const cx = frame.x + frame.width / 2,
    cy = frame.y + frame.height / 2,
    cos = Math.cos(angle),
    sin = Math.sin(angle);
  return objects.map((o) => {
    const dx = o.x + o.width / 2 - cx,
      dy = o.y + o.height / 2 - cy;
    return {
      ...o,
      x: cx + dx * cos - dy * sin - o.width / 2,
      y: cy + dx * sin + dy * cos - o.height / 2,
      rotation: o.rotation + angle,
    };
  });
}
export function selectionFrame(objects: BoardObject[]): Rect & { rotation: number } {
  if (objects.length === 1) return objects[0];
  return { ...(unionBounds(objects) ?? { x: 0, y: 0, width: 1, height: 1 }), rotation: 0 };
}
export function pointInPolygon(p: Point, polygon: Point[]): boolean {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const a = polygon[i],
      b = polygon[j];
    if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x)
      inside = !inside;
  }
  return inside;
}
const cross = (a: Point, b: Point, c: Point) =>
  (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
function segmentsIntersect(a: Point, b: Point, c: Point, d: Point): boolean {
  const on = (p: Point, q: Point, r: Point) =>
    Math.abs(cross(p, q, r)) < 1e-8 &&
    r.x >= Math.min(p.x, q.x) - 1e-8 &&
    r.x <= Math.max(p.x, q.x) + 1e-8 &&
    r.y >= Math.min(p.y, q.y) - 1e-8 &&
    r.y <= Math.max(p.y, q.y) + 1e-8;
  return (
    (cross(a, b, c) * cross(a, b, d) < 0 && cross(c, d, a) * cross(c, d, b) < 0) ||
    on(a, b, c) ||
    on(a, b, d) ||
    on(c, d, a) ||
    on(c, d, b)
  );
}
export function lassoHits(o: BoardObject, polygon: Point[]): boolean {
  if (polygon.length < 3) return false;
  let points: Point[];
  let closed = true;
  if (o.type === 'stroke') {
    const extent = strokeExtent(o.points);
    points = o.points.map((p) => ({
      x: (p.x * o.width) / extent.width,
      y: (p.y * o.height) / extent.height,
    }));
    closed = false;
  } else if (o.type === 'shape' && (o.kind === 'line' || o.kind === 'arrow')) {
    points = [
      { x: 0, y: o.height / 2 },
      { x: o.width, y: o.height / 2 },
    ];
    closed = false;
  } else if (o.type === 'shape' && o.kind === 'ellipse')
    points = Array.from({ length: 48 }, (_, i) => ({
      x: o.width / 2 + (o.width / 2) * Math.cos((i * Math.PI) / 24),
      y: o.height / 2 + (o.height / 2) * Math.sin((i * Math.PI) / 24),
    }));
  else if (o.type === 'shape' && o.kind === 'triangle')
    points = [
      { x: o.width / 2, y: 0 },
      { x: o.width, y: o.height },
      { x: 0, y: o.height },
    ];
  else
    points = [
      { x: 0, y: 0 },
      { x: o.width, y: 0 },
      { x: o.width, y: o.height },
      { x: 0, y: o.height },
    ];
  points = points.map((p) => localToWorld(p, o));
  if (
    points.some((p) => pointInPolygon(p, polygon)) ||
    (closed && polygon.some((p) => pointInPolygon(p, points)))
  )
    return true;
  const edges = closed ? points.length : points.length - 1;
  for (let i = 0; i < edges; i++)
    for (let j = 0; j < polygon.length; j++)
      if (
        segmentsIntersect(
          points[i],
          points[(i + 1) % points.length],
          polygon[j],
          polygon[(j + 1) % polygon.length],
        )
      )
        return true;
  return false;
}
