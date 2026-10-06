import { bounds, intersects, strokeExtent } from '@/core/geometry';
import type { BoardObject, Camera, Point, Rect } from '@/core/types';
import { smoothInk } from '@/core/ink';
export function prepareCanvas(
  canvas: HTMLCanvasElement,
  width: number,
  height: number,
): CanvasRenderingContext2D | null {
  const dpr = Math.min(window.devicePixelRatio || 1, 3);
  if (canvas.width !== Math.round(width * dpr) || canvas.height !== Math.round(height * dpr)) {
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
  }
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, width, height);
  return ctx;
}
export function renderObject(ctx: CanvasRenderingContext2D, o: BoardObject, dark = false) {
  if (o.type === 'text' || o.type === 'math') return;
  ctx.save();
  ctx.translate(o.x + o.width / 2, o.y + o.height / 2);
  ctx.rotate(o.rotation);
  ctx.translate(-o.width / 2, -o.height / 2);
  ctx.strokeStyle = dark && o.style.color === '#303245' ? '#e4e5f1' : o.style.color;
  ctx.fillStyle = o.style.fill;
  ctx.globalAlpha = o.style.opacity;
  ctx.lineWidth = o.style.width;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  if (o.type === 'stroke') {
    if (o.brush === 'marker') ctx.globalAlpha *= 0.3;
    if (o.brush === 'pencil') ctx.globalAlpha *= 0.7;
    const extent = strokeExtent(o.points);
    ctx.scale(o.width / extent.width, o.height / extent.height);
    const points = smoothInk(o.points);
    ctx.fillStyle = ctx.strokeStyle;
    if (points.length === 1) {
      ctx.beginPath();
      ctx.arc(
        points[0].x,
        points[0].y,
        (o.style.width * (0.25 + points[0].pressure * 0.75)) / 2,
        0,
        Math.PI * 2,
      );
      ctx.fill();
    } else if (o.brush === 'marker') {
      ctx.beginPath();
      ctx.moveTo(points[0].x, points[0].y);
      for (const p of points.slice(1)) ctx.lineTo(p.x, p.y);
      ctx.stroke();
    } else {
      // Fill one pressure-aware ribbon; translucent pencil segments never stack at joins.
      const left: Point[] = [],
        right: Point[] = [];
      for (let i = 0; i < points.length; i++) {
        const before = points[Math.max(0, i - 1)],
          after = points[Math.min(points.length - 1, i + 1)];
        const dx = after.x - before.x,
          dy = after.y - before.y,
          len = Math.hypot(dx, dy) || 1;
        const radius = (o.style.width * (0.25 + points[i].pressure * 0.75)) / 2;
        left.push({ x: points[i].x - (dy / len) * radius, y: points[i].y + (dx / len) * radius });
        right.push({ x: points[i].x + (dy / len) * radius, y: points[i].y - (dx / len) * radius });
      }
      ctx.beginPath();
      ctx.moveTo(left[0].x, left[0].y);
      for (const p of left.slice(1)) ctx.lineTo(p.x, p.y);
      for (const p of right.reverse()) ctx.lineTo(p.x, p.y);
      ctx.closePath();
      for (const p of [points[0], points.at(-1)!]) {
        const r = (o.style.width * (0.25 + p.pressure * 0.75)) / 2;
        ctx.moveTo(p.x + r, p.y);
        ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
      }
      ctx.fill();
    }
  } else {
    ctx.beginPath();
    if (o.kind === 'rectangle') ctx.rect(0, 0, o.width, o.height);
    else if (o.kind === 'ellipse')
      ctx.ellipse(o.width / 2, o.height / 2, o.width / 2, o.height / 2, 0, 0, Math.PI * 2);
    else if (o.kind === 'triangle') {
      ctx.moveTo(o.width / 2, 0);
      ctx.lineTo(o.width, o.height);
      ctx.lineTo(0, o.height);
      ctx.closePath();
    } else {
      ctx.moveTo(0, o.height / 2);
      ctx.lineTo(o.width, o.height / 2);
    }
    if (o.style.fill !== 'transparent' && !['line', 'arrow'].includes(o.kind)) ctx.fill();
    ctx.stroke();
    if (o.kind === 'arrow') {
      const size = Math.min(o.width / 2, Math.max(12, o.style.width * 4));
      ctx.beginPath();
      ctx.moveTo(o.width - size, o.height / 2 - size / 2);
      ctx.lineTo(o.width, o.height / 2);
      ctx.lineTo(o.width - size, o.height / 2 + size / 2);
      ctx.stroke();
    }
  }
  ctx.restore();
}
export function renderScene(
  canvas: HTMLCanvasElement,
  size: { width: number; height: number },
  camera: Camera,
  objects: BoardObject[],
  dark: boolean,
  excluded: Set<string> = new Set(),
) {
  const ctx = prepareCanvas(canvas, size.width, size.height);
  if (!ctx) return;
  const viewport: Rect = {
    x: -camera.x / camera.zoom,
    y: -camera.y / camera.zoom,
    width: size.width / camera.zoom,
    height: size.height / camera.zoom,
  };
  ctx.translate(camera.x, camera.y);
  ctx.scale(camera.zoom, camera.zoom);
  for (const o of objects)
    if (!excluded.has(o.id) && intersects(bounds(o), viewport)) renderObject(ctx, o, dark);
}
export function renderSelection(
  ctx: CanvasRenderingContext2D,
  rect: Rect,
  zoom: number,
  single: boolean,
) {
  ctx.save();
  ctx.strokeStyle = '#7c5ce7';
  ctx.fillStyle = '#ffffff';
  ctx.lineWidth = 1.5 / zoom;
  ctx.strokeRect(rect.x, rect.y, rect.width, rect.height);
  if (single) {
    const s = 8 / zoom;
    for (const [x, y] of [
      [rect.x, rect.y],
      [rect.x + rect.width, rect.y],
      [rect.x, rect.y + rect.height],
      [rect.x + rect.width, rect.y + rect.height],
    ]) {
      ctx.fillRect(x - s / 2, y - s / 2, s, s);
      ctx.strokeRect(x - s / 2, y - s / 2, s, s);
    }
    ctx.beginPath();
    ctx.moveTo(rect.x + rect.width / 2, rect.y);
    ctx.lineTo(rect.x + rect.width / 2, rect.y - 24 / zoom);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(rect.x + rect.width / 2, rect.y - 24 / zoom, 4 / zoom, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  }
  ctx.restore();
}
export function drawMarquee(ctx: CanvasRenderingContext2D, start: Point, end: Point, zoom: number) {
  ctx.save();
  ctx.strokeStyle = '#7c5ce7';
  ctx.fillStyle = 'rgba(124,92,231,0.08)';
  ctx.lineWidth = 1 / zoom;
  ctx.setLineDash([5 / zoom, 4 / zoom]);
  ctx.fillRect(start.x, start.y, end.x - start.x, end.y - start.y);
  ctx.strokeRect(start.x, start.y, end.x - start.x, end.y - start.y);
  ctx.restore();
}
