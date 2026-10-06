import { beforeEach, describe, expect, it, vi } from 'vitest';
import { InkBuilder, simplifyInk, smoothInk } from '@/core/ink';
import { createShape, createStroke, screenToWorld, worldToScreen } from '@/core/geometry';
import { recognizeShape } from '@/core/shapeRecognition';
import {
  cloneObjects,
  expandGroups,
  isLocked,
  lassoHits,
  rotateSelection,
  scaleSelection,
} from '@/core/selection';
import { CameraMotion } from '@/core/cameraMotion';
import { useEditor } from '@/store/editor';
import { createBoard, DEFAULT_STYLE, type Camera, type Point, type Sample } from '@/core/types';
import { parseBoard } from '@/core/validation';

function samples(points: Point[]): Sample[] {
  return points.map((p) => ({ ...p, pressure: 0.65 }));
}
function circle(rx = 80, ry = 80): Sample[] {
  return samples(
    Array.from({ length: 81 }, (_, i) => {
      const angle = (i * Math.PI) / 40,
        noise = Math.sin(i * 3) * 1.5;
      return { x: 200 + (rx + noise) * Math.cos(angle), y: 180 + (ry + noise) * Math.sin(angle) };
    }),
  );
}
function rectangle(angle = 0): Sample[] {
  const corners = [
      { x: 0, y: 0 },
      { x: 180, y: 0 },
      { x: 180, y: 100 },
      { x: 0, y: 100 },
      { x: 0, y: 0 },
    ],
    points: Point[] = [];
  for (let i = 1; i < corners.length; i++)
    for (let j = 0; j < 16; j++) {
      const t = j / 16,
        x = corners[i - 1].x + (corners[i].x - corners[i - 1].x) * t,
        y = corners[i - 1].y + (corners[i].y - corners[i - 1].y) * t;
      points.push({
        x: 200 + x * Math.cos(angle) - y * Math.sin(angle),
        y: 200 + x * Math.sin(angle) + y * Math.cos(angle),
      });
    }
  points.push(points[0]);
  return samples(points);
}
describe('ink smoothing and compression', () => {
  it('suppresses slow mouse jitter, keeps the endpoint, and reduces storage', () => {
    const ink = new InkBuilder({ x: 0, y: 0, pressure: 0.65 }, 1, false, 0);
    for (let i = 1; i <= 200; i++)
      ink.add({ x: i, y: (i % 2 ? 1 : -1) * 1.4, pressure: 0.65 }, i * 16);
    const deviation = Math.sqrt(
      ink.points.slice(10).reduce((sum, p) => sum + p.y * p.y, 0) / (ink.points.length - 10),
    );
    expect(deviation).toBeLessThan(0.7);
    const result = ink.finish();
    expect(result.length).toBeLessThan(40);
    expect(result[0].x).toBe(0);
    expect(result.at(-1)!.x).toBe(200);
  });
  it('preserves pressure extrema when simplifying a straight stroke', () => {
    const points = Array.from({ length: 101 }, (_, i) => ({
      x: i,
      y: 0,
      pressure: i === 50 ? 1 : 0.2,
    }));
    const result = simplifyInk(points, 0.6);
    expect(result.length).toBeLessThan(10);
    expect(result.some((p) => p.pressure === 1)).toBe(true);
    expect(result.at(-1)).toEqual(points.at(-1));
  });
  it('keeps corners and does not simplify scribbles into a straight segment', () => {
    const points = samples([
      { x: 0, y: 0 },
      { x: 10, y: 40 },
      { x: 20, y: -30 },
      { x: 40, y: 30 },
      { x: 60, y: 0 },
    ]);
    expect(simplifyInk(points, 0.7)).toEqual(points);
  });
  it('spline has finite pressure and exact endpoints, including repeated points', () => {
    const p = samples([
      { x: 0, y: 0 },
      { x: 10, y: 30 },
      { x: 10, y: 30 },
      { x: 20, y: 0 },
    ]);
    const result = smoothInk(p);
    expect(result[0]).toEqual(p[0]);
    expect(result.at(-1)).toEqual(p.at(-1));
    expect(result.every((p) => Number.isFinite(p.x) && p.pressure >= 0 && p.pressure <= 1)).toBe(
      true,
    );
  });
});
describe('deterministic shape recognition', () => {
  it('recognizes a noisy straight line and retains source samples', () => {
    const p = samples(
      Array.from({ length: 35 }, (_, i) => ({ x: i * 6, y: 100 + Math.sin(i) * 1.8 })),
    );
    const result = recognizeShape(createStroke(p, 'pen', DEFAULT_STYLE));
    expect(result?.kind).toBe('line');
    expect(result?.source?.strokes?.[0]).toHaveLength(p.length);
    result!.source!.strokes![0].forEach((point, i) => {
      expect(point.x).toBeCloseTo(p[i].x, 10);
      expect(point.y).toBeCloseTo(p[i].y, 10);
      expect(point.pressure).toBe(p[i].pressure);
    });
  });
  it('recognizes a simplified two-point line', () => {
    expect(
      recognizeShape(
        createStroke(
          samples([
            { x: 10, y: 20 },
            { x: 200, y: 100 },
          ]),
          'pen',
          DEFAULT_STYLE,
        ),
      )?.kind,
    ).toBe('line');
  });
  it('recognizes a noisy closed circle, with an exact circular radius', () => {
    const r = recognizeShape(createStroke(circle(), 'pen', DEFAULT_STYLE));
    expect(r?.kind).toBe('ellipse');
    expect(r?.width).toBeCloseTo(r!.height);
  });
  it.each([0, 0.47])('recognizes rough rectangles including rotation %s', (angle) => {
    const r = recognizeShape(createStroke(rectangle(angle), 'pen', DEFAULT_STYLE));
    expect(r?.kind).toBe('rectangle');
    expect(r?.width).toBeCloseTo(180, 0);
    expect(r?.height).toBeCloseTo(100, 0);
  });
  it('does not replace arcs, ellipses, triangles, tiny dots, or zigzags', () => {
    const inputs = [
      circle(120, 40),
      circle().slice(0, 45),
      samples([
        { x: 0, y: 0 },
        { x: 100, y: 150 },
        { x: 200, y: 0 },
        { x: 0, y: 0 },
      ]),
      samples([
        { x: 0, y: 0 },
        { x: 2, y: 2 },
      ]),
      samples([
        { x: 0, y: 0 },
        { x: 70, y: 90 },
        { x: 40, y: 40 },
        { x: 200, y: 0 },
      ]),
    ];
    for (const p of inputs)
      expect(recognizeShape(createStroke(p, 'pen', DEFAULT_STYLE))).toBeNull();
  });
});
describe('lasso and groups', () => {
  const a = createShape({ x: 10, y: 10 }, { x: 50, y: 50 }, 'rectangle', DEFAULT_STYLE),
    b = createShape({ x: 80, y: 10 }, { x: 120, y: 50 }, 'ellipse', DEFAULT_STYLE);
  beforeEach(() => useEditor.getState().load(createBoard('lesson')));
  it('lasso uses its polygon, including rotated geometry and crossed lines', () => {
    const triangle = [
      { x: 0, y: 0 },
      { x: 150, y: 0 },
      { x: 0, y: 150 },
    ];
    expect(lassoHits(a, triangle)).toBe(true);
    const outside = createShape({ x: 110, y: 110 }, { x: 140, y: 140 }, 'rectangle', DEFAULT_STYLE);
    expect(lassoHits(outside, triangle)).toBe(false);
    const line = createShape({ x: -30, y: 20 }, { x: 180, y: 20 }, 'line', DEFAULT_STYLE);
    expect(lassoHits(line, triangle)).toBe(true);
    const rotated = { ...a, rotation: 0.7 };
    expect(lassoHits(rotated, triangle)).toBe(true);
  });
  it('grouping, selection expansion and ungrouping survive undo and JSON', () => {
    const s = useEditor.getState();
    s.commit([a, b]);
    s.select([a.id, b.id]);
    s.groupSelection();
    const objects = useEditor.getState().document!.objects;
    expect(objects[0].groupId).toBeTruthy();
    expect(expandGroups(objects, [a.id])).toEqual([a.id, b.id]);
    expect(parseBoard(useEditor.getState().document!).objects[0].groupId).toBe(objects[0].groupId);
    s.ungroupSelection();
    expect(useEditor.getState().document!.objects.every((o) => !o.groupId)).toBe(true);
    s.undo();
    expect(useEditor.getState().document!.objects[0].groupId).toBe(objects[0].groupId);
    s.undo();
    expect(useEditor.getState().document!.objects[0].groupId).toBeUndefined();
  });
  it('duplicated groups have fresh identities, not a link to the original group', () => {
    const objects = [
      { ...a, groupId: 'g' },
      { ...b, groupId: 'g' },
    ];
    const copies = cloneObjects(objects);
    expect(copies[0].groupId).not.toBe('g');
    expect(copies[1].groupId).toBe(copies[0].groupId);
    expect(copies[0].id).not.toBe(a.id);
  });
  it('a locked member protects a whole imported group from deletion and styles', () => {
    const objects = [
        { ...a, groupId: 'g', locked: true },
        { ...b, groupId: 'g' },
      ],
      s = useEditor.getState();
    s.commit(objects);
    s.select([b.id]);
    expect(isLocked(objects, objects[1])).toBe(true);
    s.remove();
    s.applyStyle({ color: '#dc5972' });
    expect(useEditor.getState().document!.objects).toEqual(objects);
  });
  it('rotates and uniformly resizes groups around a shared frame', () => {
    const frame = { x: 0, y: 0, width: 140, height: 60 };
    const scaled = scaleSelection([a, b], frame, 2);
    expect(scaled[1].x).toBe(160);
    expect(scaled[0].width).toBe(80);
    const rotated = rotateSelection([a, b], frame, Math.PI);
    expect(rotated[0].x).toBeCloseTo(90);
    expect(rotated[0].rotation).toBeCloseTo(Math.PI);
  });
  it('color and thickness are distinct reversible commands; no-op style changes add no command', () => {
    const s = useEditor.getState();
    s.commit([a]);
    s.select([a.id]);
    s.applyStyle({ color: '#dc5972' });
    s.applyStyle({ width: 12 });
    expect(useEditor.getState().past).toHaveLength(3);
    s.applyStyle({ width: 12 });
    expect(useEditor.getState().past).toHaveLength(3);
    s.undo();
    expect(useEditor.getState().document!.objects[0].style.width).toBe(3);
    s.undo();
    expect(useEditor.getState().document!.objects[0].style.color).toBe(DEFAULT_STYLE.color);
    s.redo();
    s.redo();
    expect(useEditor.getState().document!.objects[0].style.width).toBe(12);
  });
});
describe('animated camera', () => {
  it('keeps the cursor anchor fixed on every frame and clamps zoom to 10–500%', () => {
    let camera: Camera = { x: 45, y: -80, zoom: 1 },
      time = 100;
    const pending: { callback: FrameRequestCallback | null } = { callback: null };
    vi.stubGlobal('requestAnimationFrame', (fn: FrameRequestCallback) => {
      pending.callback = fn;
      return 1;
    });
    vi.stubGlobal('cancelAnimationFrame', () => {
      pending.callback = null;
    });
    vi.spyOn(performance, 'now').mockImplementation(() => time);
    const anchor = { x: 360, y: 240 },
      world = screenToWorld(anchor, camera),
      frames: Camera[] = [];
    const motion = new CameraMotion(
      () => camera,
      (c) => {
        camera = c;
        frames.push(c);
      },
    );
    try {
      motion.zoom(anchor, 100);
      for (time = 120; time <= 280; time += 20) {
        const next = pending.callback;
        pending.callback = null;
        next?.(time);
      }
      expect(camera.zoom).toBe(5);
      for (const c of frames) {
        const p = worldToScreen(world, c);
        expect(p.x).toBeCloseTo(anchor.x);
        expect(p.y).toBeCloseTo(anchor.y);
      }
      motion.zoom(anchor, 0.00001);
      for (let i = 0; i < 10; i++) {
        time += 20;
        const next = pending.callback;
        pending.callback = null;
        next?.(time);
      }
      expect(camera.zoom).toBe(0.1);
    } finally {
      motion.stop();
      vi.restoreAllMocks();
      vi.unstubAllGlobals();
    }
  });
});
