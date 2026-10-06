import type { BoardDocument } from './types';
const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);
const finite = (v: unknown): v is number =>
  typeof v === 'number' && Number.isFinite(v) && Math.abs(v) <= 1e7;
const string = (v: unknown, max = 10000): v is string => typeof v === 'string' && v.length <= max;
const color = (v: unknown): boolean =>
  v === 'transparent' || (typeof v === 'string' && /^#[0-9a-f]{6}$/i.test(v));
export function parseBoard(input: unknown): BoardDocument {
  const fail = (): never => {
    throw new Error('INVALID_BOARD');
  };
  if (
    !isRecord(input) ||
    input.schemaVersion !== 1 ||
    !string(input.id, 100) ||
    !input.id ||
    !string(input.title, 200) ||
    !string(input.subject, 200) ||
    !string(input.grade, 200) ||
    !string(input.topic, 200) ||
    !string(input.createdAt, 40) ||
    !string(input.updatedAt, 40) ||
    !Number.isFinite(Date.parse(input.createdAt)) ||
    !Number.isFinite(Date.parse(input.updatedAt)) ||
    !['dots', 'grid', 'plain', 'ruled'].includes(input.background as string) ||
    !Array.isArray(input.objects) ||
    input.objects.length > 20000
  )
    return fail();
  const ids = new Set<string>();
  let samples = 0;
  for (const o of input.objects) {
    if (
      !isRecord(o) ||
      !string(o.id, 100) ||
      !o.id ||
      ids.has(o.id) ||
      !['x', 'y', 'width', 'height', 'rotation'].every((k) => finite(o[k])) ||
      Number(o.width) <= 0 ||
      Number(o.height) <= 0 ||
      typeof o.locked !== 'boolean' ||
      !isRecord(o.style) ||
      !color(o.style.color) ||
      !color(o.style.fill) ||
      !finite(o.style.width) ||
      o.style.width <= 0 ||
      o.style.width > 100 ||
      !finite(o.style.opacity) ||
      o.style.opacity < 0 ||
      o.style.opacity > 1
    )
      return fail();
    ids.add(o.id);
    if (o.type === 'stroke') {
      if (
        !['pen', 'pencil', 'marker'].includes(o.brush as string) ||
        !Array.isArray(o.points) ||
        !o.points.length ||
        o.points.length > 100000
      )
        return fail();
      samples += o.points.length;
      if (samples > 2000000) return fail();
      for (const p of o.points)
        if (
          !isRecord(p) ||
          !finite(p.x) ||
          !finite(p.y) ||
          !finite(p.pressure) ||
          p.pressure < 0 ||
          p.pressure > 1
        )
          return fail();
    } else if (o.type === 'shape') {
      if (!['line', 'arrow', 'rectangle', 'ellipse', 'triangle'].includes(o.kind as string))
        return fail();
    } else if (o.type === 'text' || o.type === 'math') {
      if (
        !finite(o.fontSize) ||
        o.fontSize < 8 ||
        o.fontSize > 300 ||
        !string(o.type === 'text' ? o.text : o.latex)
      )
        return fail();
    } else return fail();
    if (o.source !== undefined) {
      if (!isRecord(o.source)) return fail();
      if (o.source.assetId !== undefined && !string(o.source.assetId, 200)) return fail();
      if (o.source.provider !== undefined && !string(o.source.provider, 200)) return fail();
      if (
        o.source.confidence !== undefined &&
        (!finite(o.source.confidence) || o.source.confidence < 0 || o.source.confidence > 1)
      )
        return fail();
      if (o.source.strokes !== undefined) {
        if (!Array.isArray(o.source.strokes)) return fail();
        for (const stroke of o.source.strokes) {
          if (!Array.isArray(stroke)) return fail();
          samples += stroke.length;
          if (samples > 2000000) return fail();
          for (const p of stroke)
            if (
              !isRecord(p) ||
              !finite(p.x) ||
              !finite(p.y) ||
              !finite(p.pressure) ||
              p.pressure < 0 ||
              p.pressure > 1
            )
              return fail();
        }
      }
    }
  }
  return structuredClone(input) as BoardDocument;
}
