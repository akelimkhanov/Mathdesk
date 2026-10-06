import { createBoard, DEFAULT_STYLE, type BoardDocument, type BoardObject } from './types';
export function exampleBoard(title: string, heading: string, note: string): BoardDocument {
  const board = createBoard(title);
  const base = { rotation: 0, locked: false, style: { ...DEFAULT_STYLE }, fontSize: 28 };
  const object = (o: Omit<BoardObject, 'id'>) => ({ ...o, id: crypto.randomUUID() }) as BoardObject;
  board.objects = [
    object({
      ...base,
      type: 'text',
      text: heading,
      x: 160,
      y: 110,
      width: 620,
      height: 60,
      fontSize: 40,
    } as Omit<BoardObject, 'id'>),
    object({
      ...base,
      type: 'text',
      text: note,
      x: 160,
      y: 182,
      width: 620,
      height: 50,
      fontSize: 20,
      style: { ...DEFAULT_STYLE, color: '#7c5ce7' },
    } as Omit<BoardObject, 'id'>),
    object({
      ...base,
      type: 'math',
      latex: 'x^2 - 5x + 6 = 0',
      x: 180,
      y: 280,
      width: 420,
      height: 68,
      fontSize: 32,
    } as Omit<BoardObject, 'id'>),
    object({
      ...base,
      type: 'math',
      latex: '(x-2)(x-3)=0',
      x: 180,
      y: 392,
      width: 420,
      height: 68,
      fontSize: 32,
    } as Omit<BoardObject, 'id'>),
    object({
      ...base,
      type: 'math',
      latex: 'x_1=2,\\quad x_2=3',
      x: 180,
      y: 508,
      width: 420,
      height: 68,
      fontSize: 32,
      style: { ...DEFAULT_STYLE, color: '#249d83' },
    } as Omit<BoardObject, 'id'>),
    object({
      type: 'shape',
      kind: 'rectangle',
      x: 154,
      y: 484,
      width: 468,
      height: 114,
      rotation: 0,
      locked: false,
      style: { ...DEFAULT_STYLE, color: '#249d83', width: 2 },
    } as Omit<BoardObject, 'id'>),
  ];
  return board;
}
