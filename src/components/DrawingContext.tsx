'use client';
import { PenLine, Pencil, Highlighter } from 'lucide-react';
import { useEditor } from '@/store/editor';
import { useSettings } from '@/i18n/context';
import { IconButton } from './Controls';
import type { TranslationKey } from '@/i18n/dictionaries';
export const colors: [string, TranslationKey][] = [
  ['#303245', 'black'],
  ['#7c5ce7', 'purple'],
  ['#377adf', 'blue'],
  ['#249d83', 'green'],
  ['#dc5972', 'red'],
  ['#e7a23d', 'orange'],
];
export default function DrawingContext({ minimal = false }: { minimal?: boolean }) {
  const { t } = useSettings();
  const s = useEditor();
  const brushes = ['pen', 'pencil', 'marker'].includes(s.tool);
  return (
    <aside
      className={`drawing-context ${minimal ? 'minimal-context' : ''}`}
      aria-label={t('tools')}
    >
      {brushes && !minimal && (
        <div className="brush-options">
          {(
            [
              { brush: 'pen', Icon: PenLine },
              { brush: 'pencil', Icon: Pencil },
              { brush: 'marker', Icon: Highlighter },
            ] as const
          ).map(({ brush, Icon }) => (
            <IconButton
              key={brush}
              label={t(brush)}
              testId={`context-${brush}`}
              active={s.tool === brush}
              onClick={() => s.setTool(brush)}
            >
              <Icon size={18} />
            </IconButton>
          ))}
        </div>
      )}
      {s.tool === 'eraser' ? (
        <span className="small muted">{t('eraserHint')}</span>
      ) : (
        <>
          <div className="swatches">
            {colors.map(([color, key]) => (
              <button
                key={color}
                className={`swatch ${s.style.color === color ? 'chosen' : ''}`}
                style={{ background: color }}
                aria-label={t(key)}
                aria-pressed={s.style.color === color}
                title={t(key)}
                onClick={() => s.setStyle({ color })}
              />
            ))}
          </div>
          <label className="context-width">
            <span>{t('width')}</span>
            <input
              aria-label={t('width')}
              type="range"
              min="1"
              max="30"
              step="1"
              value={s.style.width}
              onChange={(e) => s.setStyle({ width: Number(e.target.value) })}
            />
            <output>{s.style.width}</output>
          </label>
          {!minimal && (
            <details className="context-more">
              <summary>{t('details')}</summary>
              <div className="context-options">
                <label>
                  {t('opacity')}
                  <input
                    aria-label={t('opacity')}
                    type="range"
                    min=".1"
                    max="1"
                    step=".1"
                    value={s.style.opacity}
                    onChange={(e) => s.setStyle({ opacity: Number(e.target.value) })}
                  />
                  <output>{Math.round(s.style.opacity * 100)}%</output>
                </label>
                {['rectangle', 'ellipse', 'triangle'].includes(s.tool) && (
                  <button
                    className="button"
                    onClick={() =>
                      s.setStyle({
                        fill: s.style.fill === 'transparent' ? s.style.color : 'transparent',
                      })
                    }
                  >
                    {t(s.style.fill === 'transparent' ? 'noFill' : 'fill')}
                  </button>
                )}
              </div>
            </details>
          )}
        </>
      )}
    </aside>
  );
}
