'use client';
import {
  Copy,
  Trash2,
  LockKeyhole,
  UnlockKeyhole,
  Pencil,
  X,
  Group,
  Ungroup,
  ScanLine,
} from 'lucide-react';
import { useEditor } from '@/store/editor';
import { useSettings } from '@/i18n/context';
import type { BoardObject, ObjectStyle } from '@/core/types';
import type { TranslationKey } from '@/i18n/dictionaries';
import { IconButton } from './Controls';
import { resizeObject } from '@/core/geometry';
import DrawingContext, { colors } from './DrawingContext';
import { isLocked } from '@/core/selection';
export default function Inspector({
  onEdit,
  onRecognize,
}: {
  onEdit: (o: BoardObject) => void;
  onRecognize: () => void;
}) {
  const { t } = useSettings();
  const s = useEditor();
  if (!s.document) return null;
  const selected = s.document.objects.filter((o) => s.selected.includes(o.id));
  const isDrawing = [
    'pen',
    'pencil',
    'marker',
    'eraser',
    'line',
    'arrow',
    'rectangle',
    'ellipse',
    'triangle',
  ].includes(s.tool);
  if (!selected.length) return isDrawing ? <DrawingContext /> : null;
  const style = selected[0]?.style ?? s.style;
  const changeStyle = (patch: Partial<ObjectStyle>) => {
    s.applyStyle(patch);
  };
  const single = selected.length === 1 ? selected[0] : null;
  const locked = selected.some((o) => isLocked(s.document!.objects, o));
  return (
    <aside className="inspector" aria-label={t('selection')}>
      <div className="inspector-header">
        <span>
          {selected.length ? `${t('selection')} · ${selected.length}` : t(s.tool as TranslationKey)}
        </span>
        {selected.length > 0 && (
          <IconButton label={t('clearSelection')} onClick={() => s.select([])}>
            <X size={15} />
          </IconButton>
        )}
      </div>
      {selected.some((o) => o.type === 'stroke') && (
        <button
          className="button recognition-trigger"
          disabled={selected.some((o) => o.type === 'stroke' && isLocked(s.document!.objects, o))}
          onClick={onRecognize}
          data-testid="recognize-math"
        >
          <ScanLine size={17} />
          {t('recognizeMath')}
        </button>
      )}
      {s.tool === 'eraser' && !selected.length ? (
        <p className="muted small">{t('eraserHint')}</p>
      ) : (
        <>
          <label className="field-label">{t('color')}</label>
          <div className="swatches">
            {colors.map(([color, name]) => (
              <button
                key={color}
                title={t(name)}
                aria-label={t(name)}
                aria-pressed={style.color === color}
                className={`swatch ${style.color === color ? 'chosen' : ''}`}
                style={{ background: color }}
                onClick={() => changeStyle({ color })}
                disabled={locked}
              />
            ))}
          </div>
          <label className="field-label range-label">
            {t('width')}
            <output>{style.width}</output>
          </label>
          <input
            aria-label={t('width')}
            type="range"
            min="1"
            max="30"
            step="1"
            defaultValue={style.width}
            key={`${selected.map((o) => o.id).join('-')}-width-${style.width}`}
            onPointerUp={(e) => changeStyle({ width: Number(e.currentTarget.value) })}
            onKeyUp={(e) => changeStyle({ width: Number(e.currentTarget.value) })}
            disabled={locked || selected.some((o) => o.type === 'text' || o.type === 'math')}
          />
          <label className="field-label range-label">
            {t('opacity')}
            <output>{Math.round(style.opacity * 100)}%</output>
          </label>
          <input
            aria-label={t('opacity')}
            type="range"
            min="0.1"
            max="1"
            step="0.1"
            defaultValue={style.opacity}
            key={`${selected.map((o) => o.id).join('-')}-${style.opacity}`}
            onPointerUp={(e) => changeStyle({ opacity: Number(e.currentTarget.value) })}
            onKeyUp={(e) => changeStyle({ opacity: Number(e.currentTarget.value) })}
            disabled={locked}
          />
          {(selected.some((o) => o.type === 'shape') ||
            ['rectangle', 'ellipse', 'triangle'].includes(s.tool)) && (
            <>
              <label className="field-label">{t('fill')}</label>
              <div className="fill-options">
                <button
                  className={style.fill === 'transparent' ? 'chosen' : ''}
                  disabled={locked}
                  onClick={() => changeStyle({ fill: 'transparent' })}
                >
                  {t('noFill')}
                </button>
                <button
                  className={style.fill !== 'transparent' ? 'chosen' : ''}
                  disabled={locked}
                  onClick={() => changeStyle({ fill: style.color })}
                >
                  <span style={{ background: style.color }} />
                  {t('color')}
                </button>
              </div>
            </>
          )}
        </>
      )}
      {single && (
        <details className="object-fields">
          <summary>{t('details')}</summary>
          <NumberField
            label={t('objectWidth')}
            value={single.width}
            min={1}
            disabled={locked}
            onChange={(width) =>
              s.commit(
                s.document!.objects.map((o) =>
                  o.id === single.id ? resizeObject(o, width, o.height) : o,
                ),
              )
            }
          />
          <NumberField
            label={t('objectHeight')}
            value={single.height}
            min={1}
            disabled={locked}
            onChange={(height) =>
              s.commit(
                s.document!.objects.map((o) =>
                  o.id === single.id ? resizeObject(o, o.width, height) : o,
                ),
              )
            }
          />
          <NumberField
            label={t('rotation')}
            value={(single.rotation * 180) / Math.PI}
            min={-360}
            disabled={locked}
            onChange={(rotation) => s.updateSelected({ rotation: (rotation * Math.PI) / 180 })}
          />
          {'fontSize' in single && (
            <NumberField
              label={t('fontSize')}
              value={single.fontSize}
              min={8}
              max={300}
              disabled={locked}
              onChange={(fontSize) => s.updateSelected({ fontSize })}
            />
          )}
        </details>
      )}
      {selected.length > 0 && (
        <div className="selection-actions">
          {selected.length > 1 && (
            <IconButton
              label={t('group')}
              disabled={
                locked || selected.every((o) => o.groupId && o.groupId === selected[0].groupId)
              }
              onClick={s.groupSelection}
              testId="group"
            >
              <Group size={17} />
            </IconButton>
          )}
          {selected.some((o) => o.groupId) && (
            <IconButton
              label={t('ungroup')}
              disabled={locked}
              onClick={s.ungroupSelection}
              testId="ungroup"
            >
              <Ungroup size={17} />
            </IconButton>
          )}
          {single && (single.type === 'text' || single.type === 'math') && (
            <IconButton
              label={t('edit')}
              disabled={locked}
              onClick={() => onEdit(single)}
              testId="edit-object"
            >
              <Pencil size={17} />
            </IconButton>
          )}
          <IconButton label={t('duplicate')} onClick={s.duplicate} testId="duplicate">
            <Copy size={17} />
          </IconButton>
          <IconButton
            label={locked ? t('unlock') : t('lock')}
            onClick={() => s.updateSelected({ locked: !locked })}
          >
            {locked ? <UnlockKeyhole size={17} /> : <LockKeyhole size={17} />}
          </IconButton>
          <IconButton
            label={t('delete')}
            disabled={locked}
            onClick={s.remove}
            testId="delete-object"
          >
            <Trash2 size={17} />
          </IconButton>
        </div>
      )}
    </aside>
  );
}
function NumberField({
  label,
  value,
  min,
  max = 100000,
  onChange,
  disabled,
}: {
  label: string;
  value: number;
  min: number;
  max?: number;
  onChange: (n: number) => void;
  disabled?: boolean;
}) {
  return (
    <label className="number-field">
      <span>{label}</span>
      <input
        key={value}
        type="number"
        aria-label={label}
        min={min}
        max={max}
        defaultValue={Math.round(value * 10) / 10}
        disabled={disabled}
        onBlur={(e) => {
          const n = Number(e.target.value);
          if (
            e.target.value !== '' &&
            Number.isFinite(n) &&
            n >= min &&
            n <= max &&
            Math.abs(n - value) > 0.01
          )
            onChange(n);
          else e.target.value = String(Math.round(value * 10) / 10);
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') e.currentTarget.blur();
        }}
      />
    </label>
  );
}
