import { create } from 'zustand';
import { applyCommand, makeCommand } from '@/core/history';
import { createBoard, DEFAULT_STYLE } from '@/core/types';
import type { BoardDocument, BoardObject, Camera, Command, ObjectStyle, Tool } from '@/core/types';

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
  select: (selected) => set({ selected }),
  remove: () => {
    const s = get();
    if (s.document)
      s.commit(s.document.objects.filter((o) => !s.selected.includes(o.id) || o.locked));
  },
  duplicate: () => {
    const s = get();
    if (!s.document) return;
    const copies = s.document.objects
      .filter((o) => s.selected.includes(o.id))
      .map((o) => ({ ...o, id: crypto.randomUUID(), x: o.x + 24, y: o.y + 24, locked: false }));
    s.commit([...s.document.objects, ...copies]);
    set({ selected: copies.map((o) => o.id) });
  },
  updateSelected: (patch) => {
    const s = get();
    if (s.document)
      s.commit(
        s.document.objects.map((o) =>
          s.selected.includes(o.id) &&
          (!o.locked || Object.keys(patch).every((k) => k === 'locked'))
            ? ({ ...o, ...patch } as BoardObject)
            : o,
        ),
      );
  },
}));
export { createBoard };
