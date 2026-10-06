'use client';
import {
  MousePointer2,
  Hand,
  PenLine,
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
  ChevronDown,
  Lasso,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import { useEditor } from '@/store/editor';
import { useSettings } from '@/i18n/context';
import type { Tool } from '@/core/types';
import type { TranslationKey } from '@/i18n/dictionaries';
import { IconButton } from './Controls';
const shapeTools: Tool[] = ['line', 'arrow', 'rectangle', 'ellipse', 'triangle'];
export default function Toolbar({ compact = false }: { compact?: boolean }) {
  const { t } = useSettings();
  const tool = useEditor((s) => s.tool),
    setTool = useEditor((s) => s.setTool),
    undo = useEditor((s) => s.undo),
    redo = useEditor((s) => s.redo),
    canUndo = useEditor((s) => s.past.length > 0),
    canRedo = useEditor((s) => s.future.length > 0);
  const [popover, setPopover] = useState<'shapes' | 'selection' | null>(null);
  useEffect(() => {
    setPopover(null);
  }, [tool]);
  const items = [
    { tool: 'select', icon: tool === 'lasso' ? Lasso : MousePointer2, key: 'select', hotkey: 'V' },
    { tool: 'pen', icon: PenLine, key: 'pen', hotkey: 'P' },
    { tool: 'eraser', icon: Eraser, key: 'eraser', hotkey: 'E' },
    { tool: 'text', icon: Type, key: 'text', hotkey: 'T' },
    { tool: 'math', icon: Sigma, key: 'math', hotkey: 'M' },
    { tool: 'pan', icon: Hand, key: 'pan', hotkey: 'H / Space' },
  ] as const;
  return (
    <aside
      className={`floating-toolbar ${compact ? 'compact-toolbar' : ''}`}
      aria-label={t('toolbar')}
    >
      {items
        .filter((item) => !compact || ['select', 'pen', 'eraser', 'pan'].includes(item.tool))
        .map(({ tool: value, icon: Icon, key, hotkey }) => (
          <div key={value} className="toolbar-popover-anchor">
            <IconButton
              label={`${t(key)} (${hotkey})`}
              active={
                tool === value ||
                (value === 'select' && tool === 'lasso') ||
                (value === 'pen' && ['pencil', 'marker'].includes(tool))
              }
              testId={`tool-${value}`}
              onClick={() => {
                setTool(value);
                setPopover(null);
              }}
            >
              <Icon size={23} strokeWidth={1.8} />
              {!compact && <span className="tool-caption">{t(key)}</span>}
            </IconButton>
            {value === 'select' && !compact && (
              <button
                className="tool-menu-toggle"
                aria-label={t('rectangleSelect')}
                onClick={() => setPopover(popover === 'selection' ? null : 'selection')}
              >
                <ChevronDown size={11} />
              </button>
            )}
            {value === 'select' && popover === 'selection' && (
              <div className="shape-popover">
                <button
                  data-testid="selection-rectangle"
                  className={tool === 'select' ? 'chosen' : ''}
                  onClick={() => {
                    setTool('select');
                    setPopover(null);
                  }}
                >
                  <MousePointer2 size={18} />
                  {t('rectangleSelect')}
                </button>
                <button
                  data-testid="tool-lasso"
                  className={tool === 'lasso' ? 'chosen' : ''}
                  onClick={() => {
                    setTool('lasso');
                    setPopover(null);
                  }}
                >
                  <Lasso size={18} />
                  {t('lasso')}
                </button>
              </div>
            )}
          </div>
        ))}
      {!compact && (
        <div className="toolbar-popover-anchor">
          <IconButton
            label={t('shapes')}
            active={shapeTools.includes(tool) || popover === 'shapes'}
            testId="tool-shapes"
            onClick={() => setPopover(popover === 'shapes' ? null : 'shapes')}
          >
            <Shapes size={23} />
            <span className="tool-caption">{t('shapes')}</span>
          </IconButton>
          {popover === 'shapes' && (
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
                    setPopover(null);
                  }}
                >
                  <Icon size={18} />
                  {t(value as TranslationKey)}
                </button>
              ))}
            </div>
          )}
        </div>
      )}
      <span className="toolbar-divider" />
      <IconButton label={t('undo')} disabled={!canUndo} onClick={undo} testId="undo">
        <Undo2 size={21} />
      </IconButton>
      <IconButton label={t('redo')} disabled={!canRedo} onClick={redo} testId="redo">
        <Redo2 size={21} />
      </IconButton>
    </aside>
  );
}
