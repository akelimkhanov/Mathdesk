import { openDB, type DBSchema } from 'idb';
import type { BoardDocument } from '@/core/types';
import { parseBoard } from '@/core/validation';
interface BoardDB extends DBSchema {
  boards: { key: string; value: BoardDocument; indexes: { updatedAt: string } };
}
export interface BoardRepository {
  list(): Promise<BoardDocument[]>;
  save(board: BoardDocument): Promise<void>;
  remove(id: string): Promise<void>;
}
const database = () =>
  openDB<BoardDB>('ai-math-board', 1, {
    upgrade(db) {
      const store = db.createObjectStore('boards', { keyPath: 'id' });
      store.createIndex('updatedAt', 'updatedAt');
    },
  });
export const localBoards: BoardRepository = {
  async list() {
    const db = await database();
    try {
      return (await db.getAllFromIndex('boards', 'updatedAt')).reverse().map(parseBoard);
    } finally {
      db.close();
    }
  },
  async save(board) {
    const db = await database();
    try {
      await db.put('boards', board);
    } finally {
      db.close();
    }
  },
  async remove(id) {
    const db = await database();
    try {
      await db.delete('boards', id);
    } finally {
      db.close();
    }
  },
};
// Serialize writes so an older autosave can never overwrite a newer explicit save.
let writes: Promise<void> = Promise.resolve();
export function saveBoard(board: BoardDocument): Promise<void> {
  const snapshot = structuredClone(board);
  writes = writes.catch(() => {}).then(() => localBoards.save(snapshot));
  return writes;
}
export function downloadBoard(board: BoardDocument) {
  const url = URL.createObjectURL(
    new Blob([JSON.stringify(board, null, 2)], { type: 'application/json' }),
  );
  const a = document.createElement('a');
  a.href = url;
  a.download = `${board.title.replace(/[^\p{L}\p{N}_-]/gu, '_') || 'board'}.mathboard.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
