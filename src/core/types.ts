export type Point = { x: number; y: number };
export type Sample = Point & { pressure: number };
export type Camera = Point & { zoom: number };
export type Rect = Point & { width: number; height: number };
export type Brush = 'pen' | 'pencil' | 'marker';
export type ShapeKind = 'line' | 'arrow' | 'rectangle' | 'ellipse' | 'triangle';
export type Tool = 'select' | 'pan' | Brush | 'eraser' | 'text' | 'math' | ShapeKind;
export type Background = 'dots' | 'grid' | 'plain' | 'ruled';
export type SourceData = {
  strokes?: Sample[][];
  assetId?: string;
  provider?: string;
  confidence?: number;
};
export type ObjectStyle = { color: string; width: number; opacity: number; fill: string };
export type BaseObject = Rect & {
  id: string;
  rotation: number;
  locked: boolean;
  style: ObjectStyle;
  source?: SourceData;
};
export type StrokeObject = BaseObject & {
  type: 'stroke';
  brush: Brush;
  points: Sample[];
};
export type ShapeObject = BaseObject & { type: 'shape'; kind: ShapeKind };
export type TextObject = BaseObject & { type: 'text'; text: string; fontSize: number };
export type MathObject = BaseObject & { type: 'math'; latex: string; fontSize: number };
export type BoardObject = StrokeObject | ShapeObject | TextObject | MathObject;
export type BoardDocument = {
  schemaVersion: 1;
  id: string;
  title: string;
  subject: string;
  grade: string;
  topic: string;
  createdAt: string;
  updatedAt: string;
  background: Background;
  objects: BoardObject[];
};
export type ObjectPatch = {
  id: string;
  before?: BoardObject;
  after?: BoardObject;
  beforeIndex: number;
  afterIndex: number;
};
export type Command = { patches: ObjectPatch[] };
export const DEFAULT_STYLE: ObjectStyle = {
  color: '#303245',
  width: 3,
  opacity: 1,
  fill: 'transparent',
};
export function createBoard(title: string): BoardDocument {
  const now = new Date().toISOString();
  return {
    schemaVersion: 1,
    id: crypto.randomUUID(),
    title,
    subject: '',
    grade: '',
    topic: '',
    createdAt: now,
    updatedAt: now,
    background: 'dots',
    objects: [],
  };
}
