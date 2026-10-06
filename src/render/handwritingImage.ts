import type { HandwritingSelection } from '@/core/handwritingMath';
import { handwritingSamples } from '@/core/handwritingMath';
import type { MathRecognitionInput } from '@/services/mathRecognition';
import type { Locale } from '@/i18n/dictionaries';
import { renderObject } from './canvas';

/** Render only selected ink. White background and black ink are independent of theme/camera. */
export async function prepareHandwritingImage(
  selection: HandwritingSelection,
  locale: Locale,
  signal: AbortSignal,
): Promise<MathRecognitionInput> {
  signal.throwIfAborted();
  const padding = 16;
  const b = selection.bounds;
  const scale = Math.min(2, 1536 / Math.max(b.width + padding * 2, b.height + padding * 2));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.min(1536, Math.ceil((b.width + padding * 2) * scale)));
  canvas.height = Math.max(1, Math.min(1536, Math.ceil((b.height + padding * 2) * scale)));
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('HANDWRITING_IMAGE_FAILED');
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.scale(scale, scale);
  ctx.translate(padding - b.x, padding - b.y);
  for (const stroke of selection.strokes)
    renderObject(ctx, {
      ...stroke,
      brush: 'pen',
      style: { ...stroke.style, color: '#000000', opacity: 1, fill: 'transparent' },
    });
  const image = await new Promise<Blob>((resolve, reject) => {
    const abort = () => reject(signal.reason);
    signal.addEventListener('abort', abort, { once: true });
    canvas.toBlob((blob) => {
      signal.removeEventListener('abort', abort);
      if (signal.aborted) reject(signal.reason);
      else if (blob) resolve(blob);
      else reject(new Error('HANDWRITING_IMAGE_FAILED'));
    }, 'image/png');
  });
  signal.throwIfAborted();
  return {
    requestId: crypto.randomUUID(),
    boardId: selection.boardId,
    locale,
    image,
    imageSize: { width: canvas.width, height: canvas.height },
    bounds: { ...b },
    strokes: handwritingSamples(selection),
  };
}
