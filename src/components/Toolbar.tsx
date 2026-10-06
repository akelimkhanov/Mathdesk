'use client';
import {
  MousePointer2,
  Hand,
  PenLine,
  Pencil,
  Highlighter,
  Eraser,
  Type,
  Sigma,
  Shapes,
  Minus,
  MoveUpRight,
  Square,
  Circle,
  Triangle,
  Undo2,
  Redo2,
} from 'lucide-react';
import { useState } from 'react';
import { useEditor } from '@/store/editor';
import { useSettings } from '@/i18n/context';
import type { Tool } from '@/core/types';
import type { TranslationKey } from '@/i18n/dictionaries';
import { IconButton } from './Controls';
const shapeTools: Tool[] = ['line', 'arrow', 'rectangle', 'ellipse', 'triangle'];
export default function Toolbar() {
  const { t } = useSettings();
  const tool = useEditor((s) => s.tool),
    setTool = useEditor((s) => s.setTool),
    undo = useEditor((s) => s.undo),
    redo = useEditor((s) => s.redo),
    canUndo = useEditor((s) => s.past.length > 0),
    canRedo = useEditor((s) => s.future.length > 0);
  const [shapesOpen, setShapesOpen] = useState(false);
  const items = [
    { tool: 'select', icon: MousePointer2, key: 'select', hotkey: 'V' },
    { tool: 'pan', icon: Hand, key: 'pan', hotkey: 'Space' },
    { tool: 'pen', icon: PenLine, key: 'pen', hotkey: 'P' },
    { tool: 'pencil', icon: Pencil, key: 'pencil' },
    { tool: 'marker', icon: Highlighter, key: 'marker' },
    { tool: 'eraser', icon: Eraser, key: 'eraser', hotkey: 'E' },
    { tool: 'text', icon: Type, key: 'text', hotkey: 'T' },
    { tool: 'math', icon: Sigma, key: 'math' },
  ] as const;
  return (
    <aside className="floating-toolbar" aria-label={t('toolbar')}>
      {items.map(
        ({
          tool: value,
          icon: Icon,
          key,
          hotkey,
        }: (typeof items)[number] & { hotkey?: string }) => (
          <IconButton
            key={value}
            label={`${t(key)}${hotkey ? ` (${hotkey})` : ''}`}
            active={tool === value}
            testId={`tool-${value}`}
            onClick={() => {
              setTool(value);
              setShapesOpen(false);
            }}
          >
            <Icon size={20} strokeWidth={1.8} />
          </IconButton>
        ),
      )}
      <div className="toolbar-popover-anchor">
        <IconButton
          label={t('shapes')}
          active={shapeTools.includes(tool) || shapesOpen}
          testId="tool-shapes"
          onClick={() => setShapesOpen(!shapesOpen)}
        >
          <Shapes size={20} strokeWidth={1.8} />
        </IconButton>
        {shapesOpen && (
          <div className="shape-popover">
            {[
              { value: 'line', Icon: Minus },
              { value: 'arrow', Icon: MoveUpRight },
              { value: 'rectangle', Icon: Square },
              { value: 'ellipse', Icon: Circle },
              { value: 'triangle', Icon: Triangle },
            ].map(({ value, Icon }) => (
              <button
                key={value}
                className={tool === value ? 'chosen' : ''}
                data-testid={`tool-${value}`}
                onClick={() => {
                  setTool(value as Tool);
                  setShapesOpen(false);
                }}
              >
                <Icon size={18} />
                {t(value as TranslationKey)}
              </button>
            ))}
          </div>
        )}
      </div>
      <span className="toolbar-divider" />
      <IconButton label={t('undo')} disabled={!canUndo} onClick={undo} testId="undo">
        <Undo2 size={19} />
      </IconButton>
      <IconButton label={t('redo')} disabled={!canRedo} onClick={redo} testId="redo">
        <Redo2 size={19} />
      </IconButton>
    </aside>
  );
}
