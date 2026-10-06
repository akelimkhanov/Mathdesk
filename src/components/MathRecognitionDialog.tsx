'use client';
import { useEffect, useRef, useState } from 'react';
import { LoaderCircle } from 'lucide-react';
import type { HandwritingSelection } from '@/core/handwritingMath';
import { mathHTML } from '@/core/math';
import { useEditor } from '@/store/editor';
import { useSettings } from '@/i18n/context';
import { prepareHandwritingImage } from '@/render/handwritingImage';
import {
  isLowConfidence,
  recognizeMath,
  type MathRecognitionResult,
  type MathRecognitionProvider,
} from '@/services/mathRecognition';
import { Dialog } from './Controls';
import MathView from './MathView';

export default function MathRecognitionDialog({
  selection,
  provider,
  onClose,
}: {
  selection: HandwritingSelection;
  provider: MathRecognitionProvider;
  onClose: () => void;
}) {
  const { t, locale } = useSettings();
  const [attempt, setAttempt] = useState(0);
  const [result, setResult] = useState<MathRecognitionResult | null>(null);
  const [error, setError] = useState<'recognitionError' | 'recognitionStale' | null>(null);
  const [imageUrl, setImageUrl] = useState('');
  const [chosen, setChosen] = useState(0);
  const [latex, setLatex] = useState('');
  const [confirmed, setConfirmed] = useState(false);
  const preview = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let alive = true;
    let url = '';
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(new Error('RECOGNITION_TIMEOUT')), 30000);
    setResult(null);
    setError(null);
    setConfirmed(false);
    setImageUrl('');
    void (async () => {
      const input = await prepareHandwritingImage(selection, locale, controller.signal);
      if (!alive) return;
      url = URL.createObjectURL(input.image);
      setImageUrl(url);
      const next = await recognizeMath(provider, input, controller.signal);
      if (!alive) return;
      setResult(next);
      setChosen(0);
      setLatex(next.candidates[0].latex);
    })()
      .catch(() => {
        if (alive) setError('recognitionError');
      })
      .finally(() => clearTimeout(timeout));
    return () => {
      alive = false;
      clearTimeout(timeout);
      controller.abort();
      if (url) URL.revokeObjectURL(url);
    };
  }, [selection, provider, locale, attempt]);

  const candidate = result?.candidates[chosen];
  const low = candidate ? isLowConfidence(candidate) : true;
  const valid = latex.trim().length > 0 && latex.length <= 10000 && mathHTML(latex).valid;
  function apply(placement: 'replace' | 'beside') {
    if (!candidate || !valid || error || (placement === 'replace' && low && !confirmed)) return;
    const box = preview.current?.querySelector('.katex')?.getBoundingClientRect();
    const applied = useEditor
      .getState()
      .applyRecognition(
        selection,
        { latex, confidence: latex === candidate.latex ? candidate.confidence : null },
        provider.id,
        placement,
        { width: Math.ceil(box?.width ?? 200) + 20, height: Math.ceil(box?.height ?? 42) + 20 },
      );
    if (applied) onClose();
    else setError('recognitionStale');
  }
  return (
    <Dialog title={t('recognizeMath')} onClose={onClose} wide>
      {provider.mode === 'demo' && (
        <p className="recognition-demo" role="note">
          {t('recognitionDemoNotice')}
        </p>
      )}
      <div className="recognition-review">
        <div>
          <label className="field-label">
            {t('handwritingSource')} · {selection.strokes.length}
          </label>
          {imageUrl && (
            <img
              className="recognition-source"
              data-testid="recognition-source"
              src={imageUrl}
              alt={t('handwritingSource')}
            />
          )}
        </div>
        <div>
          {!result && !error && (
            <p role="status">
              <LoaderCircle className="spinning" size={18} /> {t('recognitionLoading')}
            </p>
          )}
          {result && (
            <>
              <fieldset className="recognition-candidates">
                <legend>{t('recognitionVariants')}</legend>
                {result.candidates.map((option, index) => (
                  <label key={index} className={chosen === index ? 'chosen' : ''}>
                    <input
                      type="radio"
                      name="math-candidate"
                      checked={chosen === index}
                      aria-label={`${t('recognitionVariant')} ${index + 1}`}
                      onChange={() => {
                        setChosen(index);
                        setLatex(option.latex);
                        setConfirmed(false);
                      }}
                    />
                    <MathView latex={option.latex} />
                    <small>
                      {option.confidence === null
                        ? t('recognitionUnknownConfidence')
                        : `${Math.round(option.confidence * 100)}%`}
                    </small>
                  </label>
                ))}
              </fieldset>
              <label className="field-label" htmlFor="recognition-latex">
                {t('latex')}
              </label>
              <textarea
                id="recognition-latex"
                data-testid="recognition-latex"
                className="latex-input"
                rows={2}
                maxLength={10000}
                value={latex}
                onChange={(e) => {
                  setLatex(e.target.value);
                  setConfirmed(false);
                }}
              />
              <p className="muted small">{t('recognitionNoCorrection')}</p>
              <div
                className="content-preview recognition-preview"
                ref={preview}
                data-testid="recognition-preview"
              >
                <MathView latex={latex} />
              </div>
              {!valid && (
                <p className="error" role="alert">
                  {t('invalidMath')}
                </p>
              )}
              {low && (
                <>
                  <p className="recognition-warning" role="status">
                    {t('recognitionLowConfidence')}
                  </p>
                  <label className="recognition-confirm">
                    <input
                      type="checkbox"
                      checked={confirmed}
                      onChange={(e) => setConfirmed(e.target.checked)}
                    />
                    {t('recognitionConfirm')}
                  </label>
                </>
              )}
            </>
          )}
        </div>
      </div>
      {error && (
        <p className="error" role="alert">
          {t(error)}
        </p>
      )}
      <div className="dialog-actions recognition-actions">
        <button className="button" onClick={onClose}>
          {t('cancel')}
        </button>
        {error === 'recognitionError' && (
          <button className="button" onClick={() => setAttempt((a) => a + 1)}>
            {t('retry')}
          </button>
        )}
        <button
          className="button"
          data-testid="recognition-beside"
          disabled={!candidate || !valid || !!error}
          onClick={() => apply('beside')}
        >
          {t('recognitionInsertBeside')}
        </button>
        <button
          className="button primary"
          data-testid="recognition-replace"
          disabled={!candidate || !valid || !!error || (low && !confirmed)}
          onClick={() => apply('replace')}
        >
          {t('recognitionReplace')}
        </button>
      </div>
    </Dialog>
  );
}
