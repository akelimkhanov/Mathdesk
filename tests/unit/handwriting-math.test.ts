import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  captureHandwriting,
  handwritingSamples,
  handwritingUnchanged,
} from '@/core/handwritingMath';
import { createStroke, createShape } from '@/core/geometry';
import { createBoard, DEFAULT_STYLE, type BoardDocument } from '@/core/types';
import { parseBoard } from '@/core/validation';
import { useEditor } from '@/store/editor';
import {
  isLowConfidence,
  recognizeMath,
  validateMathResult,
  type MathRecognitionInput,
  type MathRecognitionProvider,
} from '@/services/mathRecognition';
import { developmentMathProvider } from '@/services/developmentMathProvider';

function fixture() {
  const a = createStroke(
    [
      { x: 100, y: 200, pressure: 0.2 },
      { x: 110, y: 210, pressure: 0.8 },
    ],
    'pen',
    DEFAULT_STYLE,
  );
  const b = createStroke(
    [
      { x: 130, y: 200, pressure: 0.5 },
      { x: 140, y: 220, pressure: 0.7 },
    ],
    'pencil',
    DEFAULT_STYLE,
  );
  const other = createShape({ x: 300, y: 100 }, { x: 350, y: 200 }, 'rectangle', DEFAULT_STYLE);
  const doc: BoardDocument = { ...createBoard('math'), objects: [a, other, b] };
  return { a, b, other, doc, selection: captureHandwriting(doc, [a.id, other.id, b.id]) };
}
const candidate = { latex: '2+2=5', confidence: 0.42 };
const size = { width: 200, height: 60 };
function input(): MathRecognitionInput {
  const { selection } = fixture();
  return {
    requestId: 'test',
    boardId: selection.boardId,
    locale: 'ru',
    image: new Blob(['test-png'], { type: 'image/png' }),
    imageSize: { width: 200, height: 80 },
    bounds: selection.bounds,
    strokes: handwritingSamples(selection),
  };
}

describe('handwriting capture and provenance', () => {
  it('captures only selected strokes in board order and copies the samples', () => {
    const { a, b, selection } = fixture();
    expect(selection.strokes.map((o) => o.id)).toEqual([a.id, b.id]);
    a.points[0].pressure = 1;
    expect(selection.strokes[0].points[0].pressure).toBe(0.2);
  });
  it('exports resized and rotated samples in world coordinates with pressure intact', () => {
    const { a, doc } = fixture();
    a.width = 20;
    a.height = 40;
    a.rotation = Math.PI / 2;
    const points = handwritingSamples(captureHandwriting(doc, [a.id]))[0].points;
    expect(points[0].x).toBeCloseTo(130);
    expect(points[0].y).toBeCloseTo(210);
    expect(points[1].x).toBeCloseTo(90);
    expect(points[1].y).toBeCloseTo(230);
    expect(points.map((p) => p.pressure)).toEqual([0.2, 0.8]);
  });
  it('rejects empty, locked and oversized handwriting', () => {
    const { a, doc } = fixture();
    expect(() => captureHandwriting(doc, [])).toThrow();
    a.locked = true;
    expect(() => captureHandwriting(doc, [a.id])).toThrow();
    const many = Array.from({ length: 1001 }, (_, i) => ({ ...a, id: String(i), locked: false }));
    expect(() =>
      captureHandwriting(
        { ...doc, objects: many },
        many.map((o) => o.id),
      ),
    ).toThrow('HANDWRITING_TOO_LARGE');
  });
  it('rejects a stroke locked through another member of its group', () => {
    const { a, other, doc } = fixture();
    a.groupId = other.groupId = 'group';
    other.locked = true;
    expect(() => captureHandwriting(doc, [a.id])).toThrow();
  });
  it('detects changed or removed ink and board changes, but permits unrelated edits', () => {
    const { a, other, doc, selection } = fixture();
    other.x += 50;
    expect(handwritingUnchanged(doc, selection)).toBe(true);
    expect(handwritingUnchanged({ ...doc, id: 'other-board' }, selection)).toBe(false);
    expect(
      handwritingUnchanged(
        { ...doc, objects: doc.objects.filter((o) => o.id !== a.id) },
        selection,
      ),
    ).toBe(false);
    a.points[0].pressure = 0.1;
    expect(handwritingUnchanged(doc, selection)).toBe(false);
  });
});

describe('MathRecognitionProvider boundary', () => {
  it('preserves 2+2=5 verbatim, accepts unknown confidence and caps alternatives at three', () => {
    const response = validateMathResult({
      candidates: [candidate, { latex: '\\frac{1}{2}', confidence: null }, candidate, candidate],
    });
    expect(response.candidates).toHaveLength(3);
    expect(response.candidates[0].latex).toBe('2+2=5');
    expect(isLowConfidence(response.candidates[0])).toBe(true);
    expect(isLowConfidence(response.candidates[1])).toBe(true);
    expect(isLowConfidence({ latex: 'x', confidence: 0.9 })).toBe(false);
  });
  it.each([
    {},
    { candidates: [] },
    { candidates: [{ latex: 'x', confidence: NaN }] },
    { candidates: [{ latex: '\\invalidcommand', confidence: 1 }] },
    { candidates: [{ latex: 'x', confidence: 2 }] },
    { candidates: [{ latex: 'x'.repeat(10001), confidence: 0.5 }] },
  ])('rejects malformed or unrenderable responses (%j)', (response) => {
    expect(() => validateMathResult(response)).toThrow('INVALID_RECOGNITION_RESULT');
  });
  it('passes real input and signal through the provider and never applies a response automatically', async () => {
    const request = input(),
      controller = new AbortController();
    const recognize = vi.fn(async () => ({ candidates: [candidate] }));
    const before = useEditor.getState().document;
    expect(
      await recognizeMath({ id: 'test', mode: 'live', recognize }, request, controller.signal),
    ).toEqual({ candidates: [candidate] });
    expect(recognize).toHaveBeenCalledWith(request, controller.signal);
    expect(useEditor.getState().document).toBe(before);
  });
  it('settles cancellation even if the provider ignores the signal', async () => {
    const controller = new AbortController();
    const provider: MathRecognitionProvider = {
      id: 'slow',
      mode: 'live',
      recognize: () => new Promise(() => {}),
    };
    const pending = recognizeMath(provider, input(), controller.signal);
    await Promise.resolve();
    controller.abort(new Error('CANCELED'));
    await expect(pending).rejects.toThrow('CANCELED');
  });
  it('surfaces provider errors and rejects before calling an already canceled provider', async () => {
    const recognize = vi.fn(async () => {
      throw new Error('SERVICE_ERROR');
    });
    const provider: MathRecognitionProvider = { id: 'test', mode: 'live', recognize };
    await expect(recognizeMath(provider, input(), new AbortController().signal)).rejects.toThrow(
      'SERVICE_ERROR',
    );
    const controller = new AbortController();
    controller.abort();
    await expect(recognizeMath(provider, input(), controller.signal)).rejects.toThrow();
    expect(recognize).toHaveBeenCalledTimes(1);
  });
  it('the demo fixture is explicit, local, low-confidence and does not share mutable results', async () => {
    expect(developmentMathProvider.mode).toBe('demo');
    const first = await developmentMathProvider.recognize(input(), new AbortController().signal);
    expect(first.candidates.every(isLowConfidence)).toBe(true);
    first.candidates[0].latex = '4';
    expect(
      (await developmentMathProvider.recognize(input(), new AbortController().signal)).candidates[0]
        .latex,
    ).toBe('2+2=5');
  });
});

describe('recognized MathObject and history', () => {
  beforeEach(() => useEditor.getState().load(createBoard('test')));
  it('replaces only ink as one operation; Undo restores exact objects, samples, groups and order', () => {
    const { doc, a, b, other } = fixture();
    a.groupId = b.groupId = 'ink-group';
    useEditor.getState().load(doc);
    const selection = captureHandwriting(doc, [a.id, b.id]);
    expect(
      useEditor
        .getState()
        .applyRecognition(selection, candidate, 'development-mock', 'replace', size),
    ).toBe(true);
    const state = useEditor.getState();
    expect(state.past).toHaveLength(1);
    expect(state.document!.objects[0]).toEqual(other);
    const formula = state.document!.objects[1];
    expect(formula.type === 'math' && formula.latex).toBe('2+2=5');
    expect(formula.source!.strokes).toEqual(handwritingSamples(selection).map((s) => s.points));
    expect(state.selected).toEqual([formula.id]);
    state.undo();
    expect(useEditor.getState().document!.objects).toEqual(doc.objects);
    state.redo();
    expect(useEditor.getState().document!.objects).toEqual([other, formula]);
    expect(parseBoard(JSON.parse(JSON.stringify(useEditor.getState().document)))).toEqual(
      useEditor.getState().document,
    );
  });
  it('insert beside keeps all original strokes and can be undone', () => {
    const { doc, selection } = fixture();
    useEditor.getState().load(doc);
    useEditor.getState().applyRecognition(selection, candidate, 'mock', 'beside', size);
    const formula = useEditor.getState().document!.objects.at(-1)!;
    expect(formula.x).toBeGreaterThan(selection.bounds.x + selection.bounds.width);
    expect(useEditor.getState().document!.objects.slice(0, -1)).toEqual(doc.objects);
    useEditor.getState().undo();
    expect(useEditor.getState().document!.objects).toEqual(doc.objects);
  });
  it('refuses stale, locked or invalid results without changing history', () => {
    const { doc, selection, a } = fixture();
    useEditor.getState().load(doc);
    const apply = useEditor.getState().applyRecognition;
    expect(
      apply(selection, { latex: '\\invalidcommand', confidence: 0.5 }, 'mock', 'replace', size),
    ).toBe(false);
    expect(apply(selection, candidate, 'mock', 'replace', { width: NaN, height: 1 })).toBe(false);
    useEditor.setState({
      document: {
        ...doc,
        objects: doc.objects.map((o) => (o.id === a.id ? { ...o, locked: true } : o)),
      },
    });
    expect(apply(selection, candidate, 'mock', 'replace', size)).toBe(false);
    expect(useEditor.getState().past).toHaveLength(0);
  });
});
