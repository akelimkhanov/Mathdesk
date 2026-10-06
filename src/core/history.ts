import type { BoardObject, Command } from './types';

export function makeCommand(before: BoardObject[], after: BoardObject[]): Command {
  const a = new Map(before.map((o, i) => [o.id, { o, i }]));
  const b = new Map(after.map((o, i) => [o.id, { o, i }]));
  const patches: Command['patches'] = [];
  for (const id of new Set([...a.keys(), ...b.keys()])) {
    const prev = a.get(id),
      next = b.get(id);
    if (prev?.o !== next?.o)
      patches.push({
        id,
        before: prev?.o,
        after: next?.o,
        beforeIndex: prev?.i ?? -1,
        afterIndex: next?.i ?? -1,
      });
  }
  return { patches };
}
export function applyCommand(
  objects: BoardObject[],
  command: Command,
  direction: 'undo' | 'redo',
): BoardObject[] {
  const ids = new Set(command.patches.map((p) => p.id));
  const result = objects.filter((o) => !ids.has(o.id));
  const entries = command.patches
    .map((p) => ({
      object: direction === 'undo' ? p.before : p.after,
      index: direction === 'undo' ? p.beforeIndex : p.afterIndex,
    }))
    .filter((p) => p.object)
    .sort((a, b) => a.index - b.index);
  for (const p of entries) result.splice(p.index, 0, p.object!);
  return result;
}
