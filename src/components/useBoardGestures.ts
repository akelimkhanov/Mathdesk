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
  worldToLocal,
} from '@/core/geometry';
import {
  expandGroups,
  isLocked,
  lassoHits,
  rotateSelection,
  scaleSelection,
  selectionFrame,
} from '@/core/selection';
import { InkBuilder } from '@/core/ink';
import { recognizeShape, SHAPE_HOLD_MS } from '@/core/shapeRecognition';
import type { CameraMotion } from '@/core/cameraMotion';
import type {
  BoardObject,
  Camera,
  ObjectStyle,
  Point,
  Rect,
  Sample,
  ShapeKind,
  ShapeObject,
} from '@/core/types';
import { drawMarquee, prepareCanvas, renderObject, renderSelection } from '@/render/canvas';

type Frame = Rect & { rotation: number };
type Gesture =
  | {
      kind: 'stroke';
      ink: InkBuilder;
      brush: 'pen' | 'pencil' | 'marker';
      style: ObjectStyle;
      anchor: Point;
      recognized: ShapeObject | null;
    }
  | { kind: 'shape'; start: Point; end: Point; shape: ShapeKind }
  | { kind: 'pan'; start: Point; camera: Camera }
  | { kind: 'move'; start: Point; original: BoardObject[]; all: BoardObject[] }
  | { kind: 'marquee'; start: Point; end: Point; previous: string[] }
  | { kind: 'lasso'; points: Point[]; previous: string[] }
  | {
      kind: 'resize';
      original: BoardObject[];
      all: BoardObject[];
      frame: Frame;
      fixed: Point;
      corner: Point;
    }
  | { kind: 'rotate'; original: BoardObject[]; all: BoardObject[]; frame: Frame; angle: number }
  | { kind: 'erase'; all: BoardObject[]; removed: Set<string>; previous: Point };
type Pinch = { camera: Camera; center: Point; distance: number };
const editableTarget = (target: EventTarget | null) =>
  target instanceof HTMLElement &&
  !!target.closest('input,textarea,select,[contenteditable="true"]');

export function useBoardGestures({
  surface,
  overlay,
  size,
  onInsert,
  enabled,
  motion,
}: {
  surface: RefObject<HTMLDivElement | null>;
  overlay: RefObject<HTMLCanvasElement | null>;
  size: { width: number; height: number };
  onInsert: (kind: 'text' | 'math', point: Point) => void;
  enabled: boolean;
  motion: CameraMotion;
}) {
  const gesture = useRef<Gesture | null>(null),
    pointers = useRef(new Map<number, Point>()),
    owner = useRef<number | null>(null),
    pen = useRef<number | null>(null),
    pinch = useRef<Pinch | null>(null);
  const space = useRef(false),
    frame = useRef(0),
    hold = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [spaceHeld, setSpaceHeld] = useState(false),
    [preview, setPreview] = useState<BoardObject[] | null>(null),
    [recognized, setRecognized] = useState<ShapeKind | null>(null);
  const previewRef = useRef<BoardObject[] | null>(null),
    sizeRef = useRef(size),
    enabledRef = useRef(enabled);
  sizeRef.current = size;
  enabledRef.current = enabled;
  const tool = useEditor((s) => s.tool);
  function clearHold() {
    if (hold.current) clearTimeout(hold.current);
    hold.current = null;
  }
  function redraw() {
    if (!overlay.current) return;
    const s = useEditor.getState(),
      ctx = prepareCanvas(overlay.current, sizeRef.current.width, sizeRef.current.height);
    if (!ctx) return;
    ctx.translate(s.camera.x, s.camera.y);
    ctx.scale(s.camera.zoom, s.camera.zoom);
    const g = gesture.current;
    if (g?.kind === 'stroke')
      renderObject(
        ctx,
        g.recognized ?? createStroke(g.ink.points, g.brush, g.style),
        document.documentElement.dataset.theme === 'dark',
      );
    if (g?.kind === 'shape')
      renderObject(
        ctx,
        createShape(g.start, g.end, g.shape, s.style),
        document.documentElement.dataset.theme === 'dark',
      );
    if (g?.kind === 'marquee') drawMarquee(ctx, g.start, g.end, s.camera.zoom);
    if (g?.kind === 'lasso') {
      ctx.save();
      ctx.beginPath();
      g.points.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
      ctx.closePath();
      ctx.fillStyle = '#7c5ce714';
      ctx.strokeStyle = '#7c5ce7';
      ctx.lineWidth = 1.5 / s.camera.zoom;
      ctx.setLineDash([5 / s.camera.zoom, 4 / s.camera.zoom]);
      ctx.fill();
      ctx.stroke();
      ctx.restore();
    }
    const all = previewRef.current ?? s.document?.objects ?? [],
      selected = all.filter((o) => s.selected.includes(o.id));
    if (selected.length) {
      const f = selectionFrame(selected);
      ctx.save();
      ctx.translate(f.x + f.width / 2, f.y + f.height / 2);
      ctx.rotate(f.rotation);
      ctx.translate(-f.width / 2, -f.height / 2);
      renderSelection(
        ctx,
        { x: 0, y: 0, width: f.width, height: f.height },
        s.camera.zoom,
        selected.every((o) => !isLocked(all, o)),
      );
      ctx.restore();
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
    clearHold();
    gesture.current = null;
    pinch.current = null;
    owner.current = null;
    pen.current = null;
    for (const id of pointers.current.keys())
      if (surface.current?.hasPointerCapture(id)) surface.current.releasePointerCapture(id);
    pointers.current.clear();
    previewRef.current = null;
    setPreview(null);
    setRecognized(null);
    schedule();
  }
  function armHold(g: Extract<Gesture, { kind: 'stroke' }>) {
    clearHold();
    g.recognized = null;
    setRecognized(null);
    hold.current = setTimeout(() => {
      hold.current = null;
      if (gesture.current !== g) return;
      g.recognized = recognizeShape(createStroke(g.ink.points, g.brush, g.style), g.ink.zoom);
      setRecognized(g.recognized?.kind ?? null);
      schedule();
    }, SHAPE_HOLD_MS);
  }
  useEffect(() => {
    redraw();
  });
  useEffect(() => {
    cancel();
  }, [tool, enabled]);
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (!enabledRef.current || editableTarget(e.target)) return;
      if (e.code === 'Space') {
        space.current = true;
        setSpaceHeld(true);
        e.preventDefault();
      }
      if (
        e.key === 'Escape' ||
        ((e.ctrlKey || e.metaKey) && ['z', 'y'].includes(e.key.toLowerCase()))
      )
        cancel();
    };
    const up = (e: KeyboardEvent) => {
      if (e.code === 'Space') {
        space.current = false;
        setSpaceHeld(false);
      }
    };
    const blur = () => {
      space.current = false;
      setSpaceHeld(false);
      cancel();
      motion.stop();
    };
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    window.addEventListener('blur', blur);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
      window.removeEventListener('blur', blur);
      clearHold();
      cancelAnimationFrame(frame.current);
    };
  }, [motion]);
  useEffect(() => {
    const element = surface.current;
    if (!element) return;
    const wheel = (e: WheelEvent) => {
      if (!enabled) return;
      e.preventDefault();
      if (gesture.current) return;
      const rect = element.getBoundingClientRect(),
        s = useEditor.getState();
      const multiplier = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? sizeRef.current.height : 1;
      if (e.ctrlKey || e.metaKey)
        motion.zoom(
          { x: e.clientX - rect.left, y: e.clientY - rect.top },
          Math.exp(-Math.max(-1000, Math.min(1000, e.deltaY * multiplier)) * 0.002),
        );
      else {
        motion.stop();
        s.setCamera({
          ...s.camera,
          x: s.camera.x - e.deltaX * multiplier,
          y: s.camera.y - e.deltaY * multiplier,
        });
      }
    };
    element.addEventListener('wheel', wheel, { passive: false });
    return () => element.removeEventListener('wheel', wheel);
  }, [surface, enabled, motion]);
  function screen(e: { clientX: number; clientY: number }): Point {
    const r = surface.current!.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }
  function pressure(e: { pointerType: string; pressure: number }) {
    return e.pointerType === 'pen' && e.pressure > 0 ? Math.min(1, e.pressure) : 0.65;
  }
  function erase(point: Point, g: Extract<Gesture, { kind: 'erase' }>) {
    const s = useEditor.getState(),
      distance = Math.hypot(point.x - g.previous.x, point.y - g.previous.y),
      steps = Math.max(1, Math.ceil((distance * s.camera.zoom) / 6));
    for (let i = 1; i <= steps; i++) {
      const p = {
        x: g.previous.x + ((point.x - g.previous.x) * i) / steps,
        y: g.previous.y + ((point.y - g.previous.y) * i) / steps,
      };
      for (const o of g.all)
        if (!isLocked(g.all, o) && !g.removed.has(o.id) && hitTest(p, o, 8 / s.camera.zoom))
          for (const id of expandGroups(g.all, [o.id])) g.removed.add(id);
    }
    g.previous = point;
    previewRef.current = g.all.filter((o) => !g.removed.has(o.id));
    schedule();
  }
  function pointerDown(e: ReactPointerEvent<HTMLDivElement>) {
    if (!enabled || (e.pointerType === 'touch' && pen.current !== null)) return;
    const s = useEditor.getState();
    if (!s.document) return;
    motion.stop();
    const q = screen(e),
      p = screenToWorld(q, s.camera);
    const hit = [...s.document.objects].reverse().find((o) => hitTest(p, o, 6 / s.camera.zoom));
    if (e.button === 2 && !(s.tool === 'select' && !hit)) return;
    e.preventDefault();
    surface.current?.focus({ preventScroll: true });
    surface.current?.setPointerCapture(e.pointerId);
    pointers.current.set(e.pointerId, q);
    if (e.pointerType === 'pen') pen.current = e.pointerId;
    if (e.pointerType === 'touch' && pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()];
      pinch.current = {
        camera: s.camera,
        center: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 },
        distance: Math.max(1, Math.hypot(a.x - b.x, a.y - b.y)),
      };
      clearHold();
      gesture.current = null;
      previewRef.current = null;
      setPreview(null);
      setRecognized(null);
      schedule();
      return;
    }
    if (pointers.current.size > 1) return;
    owner.current = e.pointerId;
    if (
      space.current ||
      s.tool === 'pan' ||
      e.button === 1 ||
      e.button === 2 ||
      (s.tool === 'select' && !hit && e.pointerType === 'touch')
    ) {
      gesture.current = { kind: 'pan', start: q, camera: s.camera };
      return;
    }
    if (['pen', 'pencil', 'marker'].includes(s.tool)) {
      const g: Extract<Gesture, { kind: 'stroke' }> = {
        kind: 'stroke',
        ink: new InkBuilder(
          { ...p, pressure: pressure(e) },
          s.camera.zoom,
          e.pointerType === 'pen',
          e.timeStamp,
        ),
        brush: s.tool as 'pen' | 'pencil' | 'marker',
        style: { ...s.style },
        anchor: p,
        recognized: null,
      };
      gesture.current = g;
      if (g.brush !== 'marker') armHold(g);
      schedule();
      return;
    }
    if (s.tool === 'eraser') {
      const g: Extract<Gesture, { kind: 'erase' }> = {
        kind: 'erase',
        all: s.document.objects,
        removed: new Set(),
        previous: p,
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
    if (selected.length && selected.every((o) => !isLocked(s.document!.objects, o))) {
      const f = selectionFrame(selected),
        local = worldToLocal(p, f),
        tolerance = 11 / s.camera.zoom;
      for (const corner of [
        { x: 0, y: 0 },
        { x: f.width, y: 0 },
        { x: 0, y: f.height },
        { x: f.width, y: f.height },
      ])
        if (Math.hypot(local.x - corner.x, local.y - corner.y) < tolerance) {
          gesture.current = {
            kind: 'resize',
            original: selected,
            all: s.document.objects,
            frame: f,
            corner,
            fixed: localToWorld({ x: f.width - corner.x, y: f.height - corner.y }, f),
          };
          return;
        }
      if (Math.hypot(local.x - f.width / 2, local.y + 24 / s.camera.zoom) < tolerance) {
        gesture.current = {
          kind: 'rotate',
          original: selected,
          all: s.document.objects,
          frame: f,
          angle: Math.atan2(p.y - f.y - f.height / 2, p.x - f.x - f.width / 2),
        };
        return;
      }
    }
    if (s.tool === 'lasso') {
      gesture.current = { kind: 'lasso', points: [p], previous: e.shiftKey ? s.selected : [] };
      if (!e.shiftKey) s.select([]);
      schedule();
      return;
    }
    if (hit) {
      const members = expandGroups(s.document.objects, [hit.id]);
      let ids = s.selected;
      if (e.shiftKey) {
        ids = members.every((id) => ids.includes(id))
          ? ids.filter((id) => !members.includes(id))
          : [...new Set([...ids, ...members])];
        s.select(ids);
      } else if (!ids.includes(hit.id)) {
        ids = members;
        s.select(ids);
      }
      const original = s.document.objects.filter(
        (o) => ids.includes(o.id) && !isLocked(s.document!.objects, o),
      );
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
        const [a, b] = [...pointers.current.values()],
          g = pinch.current,
          center = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
        const factor = Math.max(
            0.1,
            Math.min(5, (g.camera.zoom * Math.hypot(a.x - b.x, a.y - b.y)) / g.distance),
          ),
          world = screenToWorld(g.center, g.camera);
        s.setCamera({
          x: center.x - world.x * factor,
          y: center.y - world.y * factor,
          zoom: factor,
        });
      }
      return;
    }
    const g = gesture.current;
    if (!g || owner.current !== e.pointerId) return;
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
        const point = screenToWorld(screen(event), s.camera);
        g.ink.add({ ...point, pressure: pressure(event) }, event.timeStamp);
      }
      if (Math.hypot(p.x - g.anchor.x, p.y - g.anchor.y) * g.ink.zoom > 3) {
        g.anchor = p;
        if (g.brush !== 'marker') armHold(g);
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
    } else if (g.kind === 'marquee') g.end = p;
    else if (g.kind === 'lasso') {
      const last = g.points.at(-1)!;
      if (Math.hypot(p.x - last.x, p.y - last.y) * s.camera.zoom > 3) g.points.push(p);
    } else if (g.kind === 'erase') erase(p, g);
    else {
      let replacements: BoardObject[];
      if (g.kind === 'move')
        replacements = g.original.map((o) => ({
          ...o,
          x: o.x + p.x - g.start.x,
          y: o.y + p.y - g.start.y,
        }));
      else if (g.kind === 'resize') {
        const f = g.frame,
          dx = p.x - g.fixed.x,
          dy = p.y - g.fixed.y,
          cos = Math.cos(f.rotation),
          sin = Math.sin(f.rotation),
          sx = g.corner.x ? 1 : -1,
          sy = g.corner.y ? 1 : -1;
        let width = Math.max(1, (dx * cos + dy * sin) * sx),
          height = Math.max(1, (-dx * sin + dy * cos) * sy);
        if (g.original.length > 1) {
          const factor = Math.max(
            0.02,
            Math.min(100, Math.max(width / f.width, height / f.height)),
          );
          width = f.width * factor;
          height = f.height * factor;
        } else if (e.shiftKey) height = (width * f.height) / f.width;
        const center = {
          x: g.fixed.x + ((sx * width) / 2) * cos - ((sy * height) / 2) * sin,
          y: g.fixed.y + ((sx * width) / 2) * sin + ((sy * height) / 2) * cos,
        };
        if (g.original.length === 1)
          replacements = [
            {
              ...resizeObject(g.original[0], width, height),
              x: center.x - width / 2,
              y: center.y - height / 2,
            },
          ];
        else {
          const next = scaleSelection(g.original, f, width / f.width),
            shift = { x: center.x - width / 2 - f.x, y: center.y - height / 2 - f.y };
          replacements = next.map((o) => ({ ...o, x: o.x + shift.x, y: o.y + shift.y }));
        }
      } else {
        const f = g.frame;
        let angle = Math.atan2(p.y - f.y - f.height / 2, p.x - f.x - f.width / 2) - g.angle;
        if (e.shiftKey) angle = (Math.round(angle / (Math.PI / 12)) * Math.PI) / 12;
        replacements = rotateSelection(g.original, f, angle);
      }
      const map = new Map(replacements.map((o) => [o.id, o]));
      previewRef.current = g.all.map((o) => map.get(o.id) ?? o);
    }
    schedule();
  }
  function pointerUp(e: ReactPointerEvent<HTMLDivElement>) {
    pointers.current.delete(e.pointerId);
    if (pen.current === e.pointerId) pen.current = null;
    if (pinch.current) {
      if (!pointers.current.size) pinch.current = null;
      return;
    }
    if (owner.current !== e.pointerId) return;
    const g = gesture.current,
      s = useEditor.getState();
    clearHold();
    if (!g || !s.document) return;
    if (g.kind === 'stroke') {
      const stroke = createStroke(g.ink.finish(), g.brush, g.style);
      s.commit([...s.document.objects, stroke]);
      if (g.recognized) {
        const replacement = recognizeShape(stroke, g.ink.zoom);
        if (replacement)
          s.commit(
            useEditor
              .getState()
              .document!.objects.map((o) =>
                o.id === stroke.id ? { ...replacement, id: stroke.id } : o,
              ),
          );
      }
    }
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
    if (g.kind === 'lasso')
      s.select([
        ...new Set([
          ...g.previous,
          ...s.document.objects.filter((o) => lassoHits(o, g.points)).map((o) => o.id),
        ]),
      ]);
    gesture.current = null;
    owner.current = null;
    previewRef.current = null;
    setPreview(null);
    setRecognized(null);
    schedule();
  }
  return {
    preview,
    pointerDown,
    pointerMove,
    pointerUp,
    pointerCancel: cancel,
    spaceHeld,
    recognized,
  };
}
