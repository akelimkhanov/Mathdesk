'use client';
import { useRef, useState } from 'react';
import { useSettings } from '@/i18n/context';
import { useEditor } from '@/store/editor';
import type { BoardObject, Point } from '@/core/types';
import { Dialog } from './Controls';
import MathView, { mathHTML } from './MathView';
export type ContentRequest = { kind: 'text' | 'math'; point: Point; object?: BoardObject };
export default function ContentDialog({
  request,
  onClose,
}: {
  request: ContentRequest;
  onClose: () => void;
}) {
  const { t, theme } = useSettings();
  const s = useEditor();
  const old = request.object;
  const [value, setValue] = useState(
    old?.type === 'math'
      ? old.latex
      : old?.type === 'text'
        ? old.text
        : request.kind === 'math'
          ? 'x^{2} + 5x + 6 = 0'
          : '',
  );
  const [fontSize, setFontSize] = useState(
    old && 'fontSize' in old ? old.fontSize : request.kind === 'math' ? 28 : 24,
  );
  const preview = useRef<HTMLDivElement>(null);
  const valid = request.kind === 'text' || mathHTML(value).valid;
  function submit() {
    if (!value.trim() || !valid || !s.document) return;
    const element = preview.current;
    let width = 320,
      height = fontSize * 1.5;
    if (request.kind === 'math' && element) {
      const r = element.querySelector('.katex')?.getBoundingClientRect();
      if (r) {
        width = Math.ceil(r.width) + 20;
        height = Math.ceil(r.height) + 20;
      }
    } else {
      const lines = value.split('\n');
      const ctx = document.createElement('canvas').getContext('2d');
      if (ctx) {
        ctx.font = `${fontSize}px Arial`;
        width = Math.max(
          100,
          Math.min(800, ...lines.map((line) => ctx.measureText(line).width + 12)),
        );
      }
      height = Math.ceil(
        lines.reduce(
          (sum, line) =>
            sum +
            Math.max(
              1,
              Math.ceil((ctx?.measureText(line).width ?? line.length * fontSize * 0.6) / width),
            ),
          0,
        ) *
          fontSize *
          1.5,
      );
    }
    const common = {
      id: old?.id ?? crypto.randomUUID(),
      ...request.point,
      width,
      height,
      rotation: old?.rotation ?? 0,
      locked: false,
      style: old?.style ?? { ...s.style, width: 3, opacity: 1 },
      ...(old?.source ? { source: old.source } : {}),
    };
    const object: BoardObject =
      request.kind === 'math'
        ? { ...common, type: 'math', latex: value, fontSize }
        : { ...common, type: 'text', text: value, fontSize };
    s.commit(
      old
        ? s.document.objects.map((o) => (o.id === old.id ? object : o))
        : [...s.document.objects, object],
    );
    s.setTool('select');
    s.select([object.id]);
    onClose();
  }
  return (
    <Dialog
      title={t(
        request.kind === 'math' ? (old ? 'editMath' : 'addMath') : old ? 'editText' : 'addText',
      )}
      onClose={onClose}
      wide
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <label className="field-label" htmlFor="content-input">
          {t(request.kind === 'math' ? 'latex' : 'content')}
        </label>
        <textarea
          id="content-input"
          data-testid="content-input"
          className={request.kind === 'math' ? 'latex-input' : ''}
          rows={request.kind === 'math' ? 3 : 5}
          maxLength={10000}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
              e.preventDefault();
              submit();
            }
          }}
        />
        {request.kind === 'math' && <p className="muted small">{t('latexHint')}</p>}
        <div className="font-field">
          <label htmlFor="font-size">{t('fontSize')}</label>
          <input
            id="font-size"
            type="number"
            step="any"
            min="8"
            max="300"
            value={fontSize}
            onChange={(e) => setFontSize(Math.max(8, Math.min(300, Number(e.target.value) || 8)))}
          />
        </div>
        <label className="field-label">{t('preview')}</label>
        <div
          className="content-preview"
          ref={preview}
          style={{
            fontSize,
            color: theme === 'dark' && s.style.color === '#303245' ? '#e4e5f1' : s.style.color,
          }}
        >
          {request.kind === 'math' ? (
            <MathView latex={value} />
          ) : (
            <span style={{ whiteSpace: 'pre-wrap' }}>{value}</span>
          )}
        </div>
        {!valid && (
          <p className="error" role="alert">
            {t('invalidMath')}
          </p>
        )}
        <div className="dialog-actions">
          <button type="button" className="button" onClick={onClose}>
            {t('cancel')}
          </button>
          <button
            type="submit"
            className="button primary"
            data-testid="submit-content"
            disabled={!valid || !value.trim()}
          >
            {t(old ? 'apply' : 'insert')}
          </button>
        </div>
      </form>
    </Dialog>
  );
}
