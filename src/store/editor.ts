import { create } from 'zustand';
import { applyCommand, makeCommand } from '@/core/history';
import { createBoard, DEFAULT_STYLE } from '@/core/types';
import type { BoardDocument, BoardObject, Camera, Command, ObjectStyle, Tool } from '@/core/types';
import { cloneObjects, expandGroups, isLocked } from '@/core/selection';
import {
  createRecognizedMath,
  handwritingUnchanged,
  type HandwritingSelection,
} from '@/core/handwritingMath';
import { mathHTML } from '@/core/math';
import type { MathRecognitionCandidate } from '@/services/mathRecognition';

type EditorState = {
  document: BoardDocument | null;
  camera: Camera;
  tool: Tool;
  style: ObjectStyle;
  selected: string[];
  past: Command[];
  future: Command[];
  load: (doc: BoardDocument) => void;
  close: () => void;
  commit: (objects: BoardObject[]) => void;
  updateMeta: (
    patch: Partial<Pick<BoardDocument, 'title' | 'subject' | 'grade' | 'topic' | 'background'>>,
  ) => void;
  undo: () => void;
  redo: () => void;
  setCamera: (c: Camera) => void;
  setTool: (t: Tool) => void;
  setStyle: (s: Partial<ObjectStyle>) => void;
  select: (ids: string[]) => void;
  remove: () => void;
  duplicate: () => void;
  updateSelected: (patch: Partial<BoardObject>) => void;
  applyStyle: (patch: Partial<ObjectStyle>) => void;
  groupSelection: () => void;
  ungroupSelection: () => void;
  applyRecognition: (
    selection: HandwritingSelection,
    candidate: MathRecognitionCandidate,
    provider: string,
    placement: 'replace' | 'beside',
    size: { width: number; height: number },
  ) => boolean;
};
export const useEditor = create<EditorState>((set, get) => ({
  document: null,
  camera: { x: 0, y: 0, zoom: 1 },
  tool: 'select',
  style: { ...DEFAULT_STYLE },
  selected: [],
  past: [],
  future: [],
  load: (doc) =>
    set({
      document: doc,
      selected: [],
      past: [],
      future: [],
      camera: { x: 0, y: 0, zoom: 1 },
      tool: 'select',
    }),
  close: () => set({ document: null, selected: [], past: [], future: [] }),
  commit: (objects) => {
    const s = get();
    if (!s.document) return;
    const command = makeCommand(s.document.objects, objects);
    if (!command.patches.length) return;
    set({
      document: { ...s.document, objects, updatedAt: new Date().toISOString() },
      past: [...s.past, command].slice(-200),
      future: [],
      selected: s.selected.filter((id) => objects.some((o) => o.id === id)),
    });
  },
  updateMeta: (patch) => {
    const doc = get().document;
    if (doc) set({ document: { ...doc, ...patch, updatedAt: new Date().toISOString() } });
  },
  undo: () => {
    const s = get();
    const command = s.past.at(-1);
    if (!command || !s.document) return;
    set({
      document: {
        ...s.document,
        objects: applyCommand(s.document.objects, command, 'undo'),
        updatedAt: new Date().toISOString(),
      },
      past: s.past.slice(0, -1),
      future: [...s.future, command],
      selected: [],
    });
  },
  redo: () => {
    const s = get();
    const command = s.future.at(-1);
    if (!command || !s.document) return;
    set({
      document: {
        ...s.document,
        objects: applyCommand(s.document.objects, command, 'redo'),
        updatedAt: new Date().toISOString(),
      },
      future: s.future.slice(0, -1),
      past: [...s.past, command],
      selected: [],
    });
  },
  setCamera: (camera) => set({ camera }),
  setTool: (tool) => set({ tool, selected: [] }),
  setStyle: (style) => set((s) => ({ style: { ...s.style, ...style } })),
  select: (selected) => set({ selected: expandGroups(get().document?.objects ?? [], selected) }),
  remove: () => {
    const s = get();
    if (s.document)
      s.commit(
        s.document.objects.filter(
          (o) => !s.selected.includes(o.id) || isLocked(s.document!.objects, o),
        ),
      );
  },
  duplicate: () => {
    const s = get();
    if (!s.document) return;
    const copies = cloneObjects(s.document.objects.filter((o) => s.selected.includes(o.id)));
    s.commit([...s.document.objects, ...copies]);
    set({ selected: copies.map((o) => o.id) });
  },
  updateSelected: (patch) => {
    const s = get();
    if (s.document)
      s.commit(
        s.document.objects.map((o) =>
          s.selected.includes(o.id) &&
          (!isLocked(s.document!.objects, o) || Object.keys(patch).every((k) => k === 'locked'))
            ? ({ ...o, ...patch } as BoardObject)
            : o,
        ),
      );
  },
  applyStyle: (patch) => {
    const s = get();
    s.setStyle(patch);
    if (!s.document) return;
    s.commit(
      s.document.objects.map((o) =>
        s.selected.includes(o.id) &&
        !isLocked(s.document!.objects, o) &&
        Object.entries(patch).some(([key, value]) => o.style[key as keyof ObjectStyle] !== value)
          ? { ...o, style: { ...o.style, ...patch } }
          : o,
      ),
    );
  },
  groupSelection: () => {
    const s = get();
    if (!s.document || s.selected.length < 2) return;
    const chosen = s.document.objects.filter((o) => s.selected.includes(o.id));
    if (
      chosen.some((o) => isLocked(s.document!.objects, o)) ||
      chosen.every((o) => o.groupId && o.groupId === chosen[0].groupId)
    )
      return;
    const groupId = crypto.randomUUID();
    s.commit(s.document.objects.map((o) => (s.selected.includes(o.id) ? { ...o, groupId } : o)));
  },
  ungroupSelection: () => {
    const s = get();
    if (!s.document) return;
    s.commit(
      s.document.objects.map((o) => {
        if (!s.selected.includes(o.id) || !o.groupId || isLocked(s.document!.objects, o)) return o;
        const next = { ...o };
        delete next.groupId;
        return next;
      }),
    );
  },
  applyRecognition: (selection, candidate, provider, placement, size) => {
    const s = get();
    if (
      !handwritingUnchanged(s.document, selection) ||
      !candidate.latex.trim() ||
      candidate.latex.length > 10000 ||
      !mathHTML(candidate.latex).valid ||
      !provider ||
      provider.length > 200 ||
      ![size.width, size.height].every(
        (value) => Number.isFinite(value) && value > 0 && value <= 1e7,
      ) ||
      !(
        candidate.confidence === null ||
        (Number.isFinite(candidate.confidence) &&
          candidate.confidence >= 0 &&
          candidate.confidence <= 1)
      )
    )
      return false;
    const formula = createRecognizedMath(selection, candidate, provider, placement, size);
    const ids = new Set(selection.strokes.map((o) => o.id));
    s.commit([
      ...s.document!.objects.filter((o) => placement !== 'replace' || !ids.has(o.id)),
      formula,
    ]);
    s.setTool('select');
    s.select([formula.id]);
    return true;
  },
}));
export { createBoard };
