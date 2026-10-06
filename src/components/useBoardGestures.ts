'use client';
import {
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type RefObject,
} from 'react';
import { useEditor } from '@/store/editor';
import {
  bounds,
  createShape,
  createStroke,
  hitTest,
  intersects,
  localToWorld,
  resizeObject,
  screenToWorld,
  unionBounds,
  worldToLocal,
  zoomAt,
} from '@/core/geometry';
import type { BoardObject, Camera, Point, Sample, ShapeKind } from '@/core/types';
import { drawMarquee, prepareCanvas, renderObject, renderSelection } from '@/render/canvas';

type Gesture =
  | { kind: 'stroke'; points: Sample[]; brush: 'pen' | 'pencil' | 'marker' }
  | { kind: 'shape'; start: Point; end: Point; shape: ShapeKind }
  | { kind: 'pan'; start: Point; camera: Camera }
  | { kind: 'move'; start: Point; original: BoardObject[]; all: BoardObject[] }
  | { kind: 'marquee'; start: Point; end: Point; previous: string[] }
  | { kind: 'resize'; original: BoardObject; all: BoardObject[]; fixed: Point }
  | { kind: 'rotate'; original: BoardObject; all: BoardObject[]; angle: number }
  | { kind: 'erase'; all: BoardObject[]; removed: Set<string> };
type Pinch = { camera: Camera; center: Point; distance: number };
export function useBoardGestures({
  surface,
  overlay,
  size,
  onInsert,
  enabled,
}: {
  surface: RefObject<HTMLDivElement | null>;
  overlay: RefObject<HTMLCanvasElement | null>;
  size: { width: number; height: number };
  onInsert: (kind: 'text' | 'math', point: Point) => void;
  enabled: boolean;
}) {
  const gesture = useRef<Gesture | null>(null);
  const pointers = useRef(new Map<number, Point>());
  const pinch = useRef<Pinch | null>(null);
  const space = useRef(false);
  const frame = useRef<number>(0);
  const [preview, setPreview] = useState<BoardObject[] | null>(null);
  const previewRef = useRef<BoardObject[] | null>(null);
  const state = useEditor();
  const sizeRef = useRef(size);
  sizeRef.current = size;
  function redraw() {
    if (!overlay.current) return;
    const s = useEditor.getState();
    const currentSize = sizeRef.current;
    const ctx = prepareCanvas(overlay.current, currentSize.width, currentSize.height);
    if (!ctx) return;
    ctx.translate(s.camera.x, s.camera.y);
    ctx.scale(s.camera.zoom, s.camera.zoom);
    const g = gesture.current;
    if (g?.kind === 'stroke')
      renderObject(
        ctx,
        createStroke(g.points, g.brush, s.style),
        document.documentElement.dataset.theme === 'dark',
      );
    if (g?.kind === 'shape')
      renderObject(
        ctx,
        createShape(g.start, g.end, g.shape, s.style),
        document.documentElement.dataset.theme === 'dark',
      );
    if (g?.kind === 'marquee') drawMarquee(ctx, g.start, g.end, s.camera.zoom);
    const selected = (previewRef.current ?? s.document?.objects ?? []).filter((o) =>
      s.selected.includes(o.id),
    );
    if (selected.length === 1) {
      const o = selected[0];
      ctx.save();
      ctx.translate(o.x + o.width / 2, o.y + o.height / 2);
      ctx.rotate(o.rotation);
      ctx.translate(-o.width / 2, -o.height / 2);
      renderSelection(
        ctx,
        { x: 0, y: 0, width: o.width, height: o.height },
        s.camera.zoom,
        !o.locked,
      );
      ctx.restore();
    } else {
      const b = unionBounds(selected);
      if (b) renderSelection(ctx, b, s.camera.zoom, false);
    }
  }
  function schedule() {
    if (!frame.current)
      frame.current = requestAnimationFrame(() => {
        frame.current = 0;
        if (previewRef.current) setPreview(previewRef.current);
        redraw();
      });
  }
  function cancel() {
    gesture.current = null;
    pinch.current = null;
    pointers.current.clear();
    previewRef.current = null;
    setPreview(null);
    redraw();
  }
  useEffect(() => {
    redraw();
  });
  useEffect(() => {
    const keyDown = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).closest('input,textarea,select,[contenteditable="true"]'))
        return;
      if (e.code === 'Space') {
        space.current = true;
        e.preventDefault();
      }
      if (
        e.key === 'Escape' ||
        ((e.ctrlKey || e.metaKey) && ['z', 'y'].includes(e.key.toLowerCase()))
      )
        cancel();
    };
    const keyUp = (e: KeyboardEvent) => {
      if (e.code === 'Space') space.current = false;
    };
    const blur = () => {
      space.current = false;
      cancel();
    };
    window.addEventListener('keydown', keyDown);
    window.addEventListener('keyup', keyUp);
    window.addEventListener('blur', blur);
    return () => {
      window.removeEventListener('keydown', keyDown);
      window.removeEventListener('keyup', keyUp);
      window.removeEventListener('blur', blur);
      cancelAnimationFrame(frame.current);
    };
    // Event handlers read the live store. Rebind when the drawing surface changes size.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    const element = surface.current;
    if (!element) return;
    const wheel = (e: WheelEvent) => {
      if (!enabled) return;
      e.preventDefault();
      const rect = element.getBoundingClientRect();
      const s = useEditor.getState();
      const multiplier = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? sizeRef.current.height : 1;
      if (e.ctrlKey || e.metaKey)
        s.setCamera(
          zoomAt(
            s.camera,
            { x: e.clientX - rect.left, y: e.clientY - rect.top },
            s.camera.zoom * Math.exp(-e.deltaY * multiplier * 0.002),
          ),
        );
      else
        s.setCamera({
          ...s.camera,
          x: s.camera.x - e.deltaX * multiplier,
          y: s.camera.y - e.deltaY * multiplier,
        });
    };
    element.addEventListener('wheel', wheel, { passive: false });
    return () => element.removeEventListener('wheel', wheel);
  }, [surface, enabled]);
  function screen(e: { clientX: number; clientY: number }): Point {
    const r = surface.current!.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }
  function erase(point: Point, g: Extract<Gesture, { kind: 'erase' }>) {
    const s = useEditor.getState();
    for (const o of g.all)
      if (!o.locked && hitTest(point, o, 10 / s.camera.zoom)) g.removed.add(o.id);
    previewRef.current = g.all.filter((o) => !g.removed.has(o.id));
    schedule();
  }
  function pointerDown(e: ReactPointerEvent<HTMLDivElement>) {
    if (!enabled || e.button === 2) return;
    e.preventDefault();
    surface.current?.focus({ preventScroll: true });
    surface.current?.setPointerCapture(e.pointerId);
    const q = screen(e);
    pointers.current.set(e.pointerId, q);
    const s = useEditor.getState();
    if (!s.document) return;
    if (e.pointerType === 'touch' && pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()];
      pinch.current = {
        camera: s.camera,
        center: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 },
        distance: Math.max(1, Math.hypot(a.x - b.x, a.y - b.y)),
      };
      gesture.current = null;
      previewRef.current = null;
      setPreview(null);
      schedule();
      return;
    }
    if (pointers.current.size > 1) return;
    const p = screenToWorld(q, s.camera);
    if (space.current || s.tool === 'pan' || e.button === 1) {
      gesture.current = { kind: 'pan', start: q, camera: s.camera };
      return;
    }
    if (['pen', 'pencil', 'marker'].includes(s.tool)) {
      gesture.current = {
        kind: 'stroke',
        points: [{ ...p, pressure: e.pointerType === 'pen' ? Math.max(0.05, e.pressure) : 0.65 }],
        brush: s.tool as 'pen' | 'pencil' | 'marker',
      };
      schedule();
      return;
    }
    if (s.tool === 'eraser') {
      const g: Extract<Gesture, { kind: 'erase' }> = {
        kind: 'erase',
        all: s.document.objects,
        removed: new Set(),
      };
      gesture.current = g;
      erase(p, g);
      return;
    }
    if (['line', 'arrow', 'rectangle', 'ellipse', 'triangle'].includes(s.tool)) {
      gesture.current = { kind: 'shape', start: p, end: p, shape: s.tool as ShapeKind };
      schedule();
      return;
    }
    if (s.tool === 'text' || s.tool === 'math') {
      onInsert(s.tool, p);
      return;
    }
    const selected = s.document.objects.filter((o) => s.selected.includes(o.id));
    if (selected.length === 1 && !selected[0].locked) {
      const o = selected[0];
      const local = worldToLocal(p, o);
      const tolerance = 12 / s.camera.zoom;
      if (Math.hypot(local.x - o.width, local.y - o.height) < tolerance) {
        gesture.current = {
          kind: 'resize',
          original: o,
          all: s.document.objects,
          fixed: localToWorld({ x: 0, y: 0 }, o),
        };
        return;
      }
      if (Math.hypot(local.x - o.width / 2, local.y + 24 / s.camera.zoom) < tolerance) {
        gesture.current = {
          kind: 'rotate',
          original: o,
          all: s.document.objects,
          angle: Math.atan2(p.y - o.y - o.height / 2, p.x - o.x - o.width / 2),
        };
        return;
      }
    }
    const object = [...s.document.objects].reverse().find((o) => hitTest(p, o, 6 / s.camera.zoom));
    if (object) {
      let ids = s.selected;
      if (e.shiftKey) {
        ids = ids.includes(object.id) ? ids.filter((id) => id !== object.id) : [...ids, object.id];
        s.select(ids);
      } else if (!ids.includes(object.id)) {
        ids = [object.id];
        s.select(ids);
      }
      const original = s.document.objects.filter((o) => ids.includes(o.id) && !o.locked);
      if (original.length)
        gesture.current = { kind: 'move', start: p, original, all: s.document.objects };
    } else {
      gesture.current = {
        kind: 'marquee',
        start: p,
        end: p,
        previous: e.shiftKey ? s.selected : [],
      };
      if (!e.shiftKey) s.select([]);
    }
    schedule();
  }
  function pointerMove(e: ReactPointerEvent<HTMLDivElement>) {
    if (!pointers.current.has(e.pointerId)) return;
    const q = screen(e);
    pointers.current.set(e.pointerId, q);
    const s = useEditor.getState();
    if (pinch.current) {
      if (pointers.current.size >= 2) {
        const [a, b] = [...pointers.current.values()];
        const g = pinch.current;
        const center = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
        const c = zoomAt(
          g.camera,
          g.center,
          (g.camera.zoom * Math.hypot(a.x - b.x, a.y - b.y)) / g.distance,
        );
        s.setCamera({ ...c, x: c.x + center.x - g.center.x, y: c.y + center.y - g.center.y });
      }
      return;
    }
    const g = gesture.current;
    if (!g) return;
    const p = screenToWorld(q, s.camera);
    if (g.kind === 'pan') {
      s.setCamera({
        ...g.camera,
        x: g.camera.x + q.x - g.start.x,
        y: g.camera.y + q.y - g.start.y,
      });
      return;
    }
    if (g.kind === 'stroke') {
      const events = e.nativeEvent.getCoalescedEvents?.() ?? [e.nativeEvent];
      for (const event of events.length ? events : [e.nativeEvent]) {
        const pt = screenToWorld(screen(event), s.camera);
        const last = g.points.at(-1)!;
        if (Math.hypot(pt.x - last.x, pt.y - last.y) > 0.3 / s.camera.zoom)
          g.points.push({
            ...pt,
            pressure: event.pointerType === 'pen' ? Math.max(0.05, event.pressure) : 0.65,
          });
      }
    } else if (g.kind === 'shape') {
      let end = p;
      if (e.shiftKey && g.shape !== 'line' && g.shape !== 'arrow') {
        const length = Math.max(Math.abs(p.x - g.start.x), Math.abs(p.y - g.start.y));
        end = {
          x: g.start.x + Math.sign(p.x - g.start.x) * length,
          y: g.start.y + Math.sign(p.y - g.start.y) * length,
        };
      }
      g.end = end;
    } else if (g.kind === 'marquee') {
      g.end = p;
    } else if (g.kind === 'erase') {
      erase(p, g);
    } else if (g.kind === 'move') {
      const replacements = new Map(
        g.original.map((o) => [o.id, { ...o, x: o.x + p.x - g.start.x, y: o.y + p.y - g.start.y }]),
      );
      previewRef.current = g.all.map((o) => replacements.get(o.id) ?? o);
    } else if (g.kind === 'resize') {
      const o = g.original,
        dx = p.x - g.fixed.x,
        dy = p.y - g.fixed.y,
        cos = Math.cos(o.rotation),
        sin = Math.sin(o.rotation);
      let width = Math.max(10, dx * cos + dy * sin),
        height = Math.max(10, -dx * sin + dy * cos);
      if (e.shiftKey) {
        height = (width * o.height) / o.width;
      }
      const center = {
        x: g.fixed.x + (width / 2) * cos - (height / 2) * sin,
        y: g.fixed.y + (width / 2) * sin + (height / 2) * cos,
      };
      const next = {
        ...resizeObject(o, width, height),
        x: center.x - width / 2,
        y: center.y - height / 2,
      };
      previewRef.current = g.all.map((item) => (item.id === o.id ? next : item));
    } else if (g.kind === 'rotate') {
      const o = g.original;
      let rotation =
        o.rotation + Math.atan2(p.y - o.y - o.height / 2, p.x - o.x - o.width / 2) - g.angle;
      if (e.shiftKey) rotation = (Math.round(rotation / (Math.PI / 12)) * Math.PI) / 12;
      previewRef.current = g.all.map((item) => (item.id === o.id ? { ...o, rotation } : item));
    }
    schedule();
  }
  function pointerUp(e: ReactPointerEvent<HTMLDivElement>) {
    pointers.current.delete(e.pointerId);
    if (pinch.current) {
      if (!pointers.current.size) pinch.current = null;
      return;
    }
    const g = gesture.current;
    const s = useEditor.getState();
    if (!g || !s.document) return;
    if (g.kind === 'stroke')
      s.commit([...s.document.objects, createStroke(g.points, g.brush, s.style)]);
    if (
      g.kind === 'shape' &&
      Math.hypot(g.end.x - g.start.x, g.end.y - g.start.y) > 3 / s.camera.zoom
    )
      s.commit([...s.document.objects, createShape(g.start, g.end, g.shape, s.style)]);
    if (['move', 'resize', 'rotate', 'erase'].includes(g.kind) && previewRef.current)
      s.commit(previewRef.current);
    if (g.kind === 'marquee') {
      const rect = {
        x: Math.min(g.start.x, g.end.x),
        y: Math.min(g.start.y, g.end.y),
        width: Math.abs(g.end.x - g.start.x),
        height: Math.abs(g.end.y - g.start.y),
      };
      s.select([
        ...new Set([
          ...g.previous,
          ...s.document.objects.filter((o) => intersects(rect, bounds(o))).map((o) => o.id),
        ]),
      ]);
    }
    gesture.current = null;
    previewRef.current = null;
    setPreview(null);
    schedule();
  }
  return { preview, pointerDown, pointerMove, pointerUp, pointerCancel: cancel, redraw, state };
}
