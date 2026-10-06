import type { MathRecognitionProvider } from './mathRecognition';

/** Explicit local fixture, NOT a handwriting recognizer. No network calls or secret keys. */
export const developmentMathProvider: MathRecognitionProvider = {
  id: 'development-mock',
  mode: 'demo',
  async recognize(input, signal) {
    signal.throwIfAborted();
    if (!input.strokes.length || input.image.type !== 'image/png' || !input.image.size)
      throw new Error('INVALID_RECOGNITION_INPUT');
    return {
      candidates: [
        { latex: '2+2=5', confidence: 0.42 },
        { latex: '2+2=S', confidence: 0.32 },
        { latex: '2+2=8', confidence: 0.2 },
      ],
    };
  },
};
