import { bounds, localToWorld, strokeExtent } from './geometry';
import { isLocked } from './selection';
import type { BoardDocument, MathObject, Rect, StrokeObject } from './types';
import type { MathRecognitionCandidate } from '@/services/mathRecognition';

export type HandwritingSelection = { boardId: string; strokes: StrokeObject[]; bounds: Rect };
export function captureHandwriting(doc: BoardDocument, ids: string[]): HandwritingSelection {
  const selected = new Set(ids);
  const strokes = doc.objects.filter(
    (o): o is StrokeObject => o.type === 'stroke' && selected.has(o.id),
  );
  if (!strokes.length || strokes.some((o) => isLocked(doc.objects, o)))
    throw new Error('INVALID_HANDWRITING_SELECTION');
  if (strokes.length > 1000 || strokes.reduce((n, o) => n + o.points.length, 0) > 200000)
    throw new Error('HANDWRITING_TOO_LARGE');
  const boxes = strokes.map((o) => {
    const b = bounds(o),
      extent = strokeExtent(o.points);
    // Canvas scales the ink ribbon too; ordinary object bounds only pad by style.width.
    const padding = Math.max(
      0,
      (o.style.width / 2) * (Math.max(o.width / extent.width, o.height / extent.height) - 1),
    );
    return {
      x: b.x - padding,
      y: b.y - padding,
      width: b.width + padding * 2,
      height: b.height + padding * 2,
    };
  });
  const x = Math.min(...boxes.map((b) => b.x)),
    y = Math.min(...boxes.map((b) => b.y));
  return {
    boardId: doc.id,
    strokes: structuredClone(strokes),
    bounds: {
      x,
      y,
      width: Math.max(...boxes.map((b) => b.x + b.width)) - x,
      height: Math.max(...boxes.map((b) => b.y + b.height)) - y,
    },
  };
}
export function handwritingSamples(selection: HandwritingSelection) {
  return selection.strokes.map((o) => {
    const extent = strokeExtent(o.points);
    return {
      id: o.id,
      points: o.points.map((p) => ({
        ...localToWorld(
          { x: (p.x * o.width) / extent.width, y: (p.y * o.height) / extent.height },
          o,
        ),
        pressure: p.pressure,
      })),
    };
  });
}
export function handwritingUnchanged(doc: BoardDocument | null, selection: HandwritingSelection) {
  if (!doc || doc.id !== selection.boardId) return false;
  return selection.strokes.every((old) => {
    const current = doc.objects.find((o) => o.id === old.id);
    return (
      current && !isLocked(doc.objects, current) && JSON.stringify(current) === JSON.stringify(old)
    );
  });
}
export function createRecognizedMath(
  selection: HandwritingSelection,
  candidate: MathRecognitionCandidate,
  provider: string,
  placement: 'replace' | 'beside',
  size: { width: number; height: number },
): MathObject {
  const b = selection.bounds;
  return {
    id: crypto.randomUUID(),
    type: 'math',
    latex: candidate.latex,
    fontSize: 28,
    x: placement === 'replace' ? b.x : b.x + b.width + 24,
    y: b.y,
    width: Math.max(1, size.width),
    height: Math.max(1, size.height),
    rotation: 0,
    locked: false,
    style: { ...selection.strokes[0].style, opacity: 1, fill: 'transparent' },
    source: {
      provider,
      ...(candidate.confidence === null ? {} : { confidence: candidate.confidence }),
      strokes: handwritingSamples(selection).map((o) => o.points),
    },
  };
}
