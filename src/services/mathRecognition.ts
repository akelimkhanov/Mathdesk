import type { Locale } from '@/i18n/dictionaries';
import type { Rect, Sample } from '@/core/types';
import { mathHTML } from '@/core/math';

export type MathRecognitionInput = {
  requestId: string;
  boardId: string;
  locale: Locale;
  image: Blob;
  imageSize: { width: number; height: number };
  bounds: Rect;
  /** Ordered world-coordinate samples, including pressure; no camera transform. */
  strokes: { id: string; points: Sample[] }[];
};
export type MathRecognitionCandidate = {
  latex: string;
  /** null means the provider does not supply a confidence score. */
  confidence: number | null;
};
export type MathRecognitionResult = { candidates: MathRecognitionCandidate[] };
export interface MathRecognitionProvider {
  readonly id: string;
  readonly mode: 'demo' | 'live';
  recognize(input: MathRecognitionInput, signal: AbortSignal): Promise<MathRecognitionResult>;
}
export const LOW_CONFIDENCE_THRESHOLD = 0.8;
export function isLowConfidence(candidate: MathRecognitionCandidate) {
  return candidate.confidence === null || candidate.confidence < LOW_CONFIDENCE_THRESHOLD;
}

/** Validate external data without solving, correcting, or rewriting the expression. */
export function validateMathResult(value: unknown): MathRecognitionResult {
  if (
    !value ||
    typeof value !== 'object' ||
    !('candidates' in value) ||
    !Array.isArray(value.candidates)
  )
    throw new Error('INVALID_RECOGNITION_RESULT');
  const candidates: MathRecognitionCandidate[] = [];
  for (const raw of value.candidates.slice(0, 3)) {
    if (!raw || typeof raw !== 'object') continue;
    const { latex, confidence } = raw;
    if (
      typeof latex !== 'string' ||
      !latex.trim() ||
      latex.length > 10000 ||
      !(
        confidence === null ||
        (typeof confidence === 'number' &&
          Number.isFinite(confidence) &&
          confidence >= 0 &&
          confidence <= 1)
      ) ||
      !mathHTML(latex).valid
    )
      continue;
    candidates.push({ latex, confidence });
  }
  if (!candidates.length) throw new Error('INVALID_RECOGNITION_RESULT');
  return { candidates };
}

/** Cancellation settles even when an adapter ignores its AbortSignal. */
export function recognizeMath(
  provider: MathRecognitionProvider,
  input: MathRecognitionInput,
  signal: AbortSignal,
): Promise<MathRecognitionResult> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) {
      reject(signal.reason);
      return;
    }
    const abort = () => reject(signal.reason);
    signal.addEventListener('abort', abort, { once: true });
    Promise.resolve()
      .then(() => {
        signal.throwIfAborted();
        return provider.recognize(input, signal);
      })
      .then((result) => {
        signal.throwIfAborted();
        return validateMathResult(result);
      })
      .then(resolve, reject)
      .finally(() => signal.removeEventListener('abort', abort));
  });
}
