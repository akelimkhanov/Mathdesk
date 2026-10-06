import { describe, it, expect, beforeEach } from 'vitest';
import {
  bounds,
  createShape,
  createStroke,
  distanceToSegment,
  fitCamera,
  hitTest,
  localToWorld,
  resizeObject,
  screenToWorld,
  worldToLocal,
  worldToScreen,
  zoomAt,
} from '@/core/geometry';
import { applyCommand, makeCommand } from '@/core/history';
import { createBoard, DEFAULT_STYLE, type MathObject } from '@/core/types';
import { parseBoard } from '@/core/validation';
import { useEditor } from '@/store/editor';
import { canAutoApply } from '@/services/recognition';

describe('world coordinates and transforms', () => {
  it('round-trips negative world coordinates through pan and zoom', () => {
    const c = { x: 302, y: -560, zoom: 0.37 },
      p = { x: -942.5, y: 30.7 };
    const result = screenToWorld(worldToScreen(p, c), c);
    expect(result.x).toBeCloseTo(p.x);
    expect(result.y).toBeCloseTo(p.y);
  });
  it('keeps the pointer anchor fixed at both zoom limits', () => {
    const c = { x: -123, y: 890, zoom: 1.7 },
      anchor = { x: 601, y: 420 },
      p = screenToWorld(anchor, c);
    for (const z of [0.001, 0.4, 500]) {
      const n = zoomAt(c, anchor, z);
      expect(n.zoom).toBeGreaterThanOrEqual(0.1);
      expect(n.zoom).toBeLessThanOrEqual(5);
      const result = worldToScreen(p, n);
      expect(result.x).toBeCloseTo(anchor.x);
      expect(result.y).toBeCloseTo(anchor.y);
    }
  });
  it('inverts rotation about the object center', () => {
    const o = createShape({ x: 10, y: 20 }, { x: 110, y: 70 }, 'rectangle', DEFAULT_STYLE);
    o.rotation = 1.13;
    const p = { x: 83, y: 14 };
    const q = worldToLocal(localToWorld(p, o), o);
    expect(q.x).toBeCloseTo(p.x);
    expect(q.y).toBeCloseTo(p.y);
  });
  it('calculates rotated bounds and fits all objects in the viewport', () => {
    const o = createShape({ x: -150, y: 300 }, { x: 250, y: 400 }, 'rectangle', DEFAULT_STYLE);
    o.rotation = Math.PI / 2;
    expect(bounds(o).width).toBeCloseTo(103);
    const c = fitCamera([o], { width: 1200, height: 800 });
    const b = bounds(o);
    const top = worldToScreen(b, c),
      bottom = worldToScreen({ x: b.x + b.width, y: b.y + b.height }, c);
    expect(top.x).toBeGreaterThanOrEqual(0);
    expect(top.y).toBeGreaterThanOrEqual(0);
    expect(bottom.x).toBeLessThanOrEqual(1200);
    expect(bottom.y).toBeLessThanOrEqual(800);
  });
  it('does not mutate source stroke samples during resize', () => {
    const o = createStroke(
      [
        { x: 20, y: 50, pressure: 0.1 },
        { x: 70, y: 90, pressure: 0.9 },
      ],
      'pen',
      DEFAULT_STYLE,
    );
    const next = resizeObject(o, 100, 80);
    expect(next.width).toBe(100);
    expect(next.type === 'stroke' && next.points).toEqual(o.points);
    expect(hitTest({ x: 120, y: 130 }, next, 1)).toBe(true);
    expect(o.width).toBe(50);
    expect(o.points[1].pressure).toBe(0.9);
  });
  it('preserves line direction for negative slopes', () => {
    const o = createShape({ x: 100, y: 10 }, { x: 20, y: 90 }, 'line', DEFAULT_STYLE);
    expect(hitTest({ x: 60, y: 50 }, o, 1)).toBe(true);
    expect(hitTest({ x: 100, y: 90 }, o, 1)).toBe(false);
  });
  it('rejects empty corners of ellipses and triangles in hit tests', () => {
    for (const kind of ['ellipse', 'triangle'] as const) {
      const o = createShape({ x: 0, y: 0 }, { x: 100, y: 100 }, kind, {
        ...DEFAULT_STYLE,
        width: 1,
      });
      expect(hitTest({ x: 50, y: 50 }, o, 0)).toBe(true);
      expect(hitTest({ x: 0, y: 0 }, o, 0)).toBe(false);
    }
  });
  it('handles zero-length segments and dots', () => {
    expect(distanceToSegment({ x: 4, y: 3 }, { x: 0, y: 0 }, { x: 0, y: 0 })).toBe(5);
    const dot = createStroke([{ x: 8, y: 9, pressure: 0.4 }], 'pencil', DEFAULT_STYLE);
    expect(hitTest({ x: 8, y: 9 }, dot)).toBe(true);
  });
  it('rescales formula text when its height changes', () => {
    const o: MathObject = {
      id: 'math',
      type: 'math',
      x: 0,
      y: 0,
      width: 200,
      height: 50,
      rotation: 0,
      locked: false,
      style: DEFAULT_STYLE,
      fontSize: 24,
      latex: '2+2=5',
    };
    const n = resizeObject(o, 400, 100);
    expect(n.type === 'math' && n.fontSize).toBe(48);
    expect(n.type === 'math' && n.latex).toBe('2+2=5');
  });
});
describe('command history', () => {
  const a = createShape({ x: 0, y: 0 }, { x: 30, y: 40 }, 'rectangle', DEFAULT_STYLE),
    b = createShape({ x: 80, y: 0 }, { x: 110, y: 40 }, 'ellipse', DEFAULT_STYLE),
    c = createShape({ x: 160, y: 0 }, { x: 190, y: 40 }, 'triangle', DEFAULT_STYLE);
  it('undo restores deleted objects in original z-order', () => {
    const before = [a, b, c],
      after = [c];
    const cmd = makeCommand(before, after);
    expect(applyCommand(after, cmd, 'undo')).toEqual(before);
    expect(applyCommand(before, cmd, 'redo')).toEqual(after);
  });
  it('round-trips mixed additions, deletion, and transforms', () => {
    const before = [a, b],
      after = [{ ...a, x: 900 }, c];
    const cmd = makeCommand(before, after);
    expect(applyCommand(after, cmd, 'undo')).toEqual(before);
    expect(applyCommand(before, cmd, 'redo')).toEqual(after);
  });
  beforeEach(() => useEditor.getState().load(createBoard('test')));
  it('clears redo after a new operation and keeps camera out of history', () => {
    const s = useEditor.getState();
    s.commit([a]);
    s.commit([a, b]);
    s.undo();
    expect(useEditor.getState().future).toHaveLength(1);
    s.commit([a, c]);
    expect(useEditor.getState().future).toHaveLength(0);
    s.setCamera({ x: 100, y: -900, zoom: 2 });
    expect(useEditor.getState().past).toHaveLength(2);
  });
  it('honors locks but permits explicit unlock', () => {
    const s = useEditor.getState();
    s.commit([{ ...a, locked: true }]);
    s.select([a.id]);
    s.remove();
    expect(useEditor.getState().document!.objects).toHaveLength(1);
    s.updateSelected({ x: 10 });
    expect(useEditor.getState().document!.objects[0].x).toBe(a.x);
    s.updateSelected({ locked: false });
    s.remove();
    expect(useEditor.getState().document!.objects).toHaveLength(0);
  });
  it('limits history to 200 operations', () => {
    const s = useEditor.getState();
    for (let x = 0; x < 230; x++) s.commit([{ ...a, x }]);
    expect(useEditor.getState().past).toHaveLength(200);
  });
});
describe('document import and AI policy', () => {
  it('validates and clones a document including untouched math', () => {
    const doc = createBoard('2+2=5');
    const parsed = parseBoard(doc);
    expect(parsed).toEqual(doc);
    expect(parsed).not.toBe(doc);
  });
  it.each([
    null,
    {},
    { schemaVersion: 2 },
    { ...createBoard('test'), objects: [{ type: 'script' }] },
    { ...createBoard('test'), title: 'x'.repeat(201) },
  ])('rejects corrupt or unsupported input (%j)', (input) => {
    expect(() => parseBoard(input)).toThrow('INVALID_BOARD');
  });
  it('rejects non-finite coordinates, duplicate ids, invalid pressure and unsafe colors', () => {
    const o = createStroke([{ x: 1, y: 1, pressure: 0.4 }], 'pen', DEFAULT_STYLE),
      doc = createBoard('test');
    for (const objects of [
      [{ ...o, x: Infinity }],
      [o, o],
      [{ ...o, points: [{ x: 0, y: 0, pressure: 9 }] }],
      [{ ...o, style: { ...o.style, color: 'url(javascript:bad)' } }],
    ])
      expect(() => parseBoard({ ...doc, objects })).toThrow();
  });
  it('does not auto-apply uncertain recognition or Smart Ink', () => {
    const candidate = { content: '2+2=5', confidence: 0.65, source: {} };
    expect(canAutoApply('auto-math', candidate)).toBe(false);
    expect(canAutoApply('smart-ink', { ...candidate, confidence: 1 })).toBe(false);
    expect(canAutoApply('handwriting', { ...candidate, confidence: 1 })).toBe(false);
    expect(canAutoApply('auto-math', { ...candidate, confidence: 0.98 })).toBe(true);
  });
});
