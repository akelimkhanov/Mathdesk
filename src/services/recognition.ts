import type { BoardObject, Sample, SourceData } from '@/core/types';
export type RecognitionKind =
  | 'handwriting'
  | 'math'
  | 'ocr'
  | 'speech'
  | 'shape'
  | 'problem'
  | 'diagram'
  | 'validation'
  | 'assistant';
export type RecognitionRequest = {
  requestId: string;
  documentRevision: string;
  kind: RecognitionKind;
  locale: 'ru' | 'kk' | 'en';
  strokes?: Sample[][];
  text?: string;
  assetId?: string;
};
export type RecognitionCandidate = {
  content: string;
  confidence: number;
  objects?: BoardObject[];
  source: SourceData;
};
export interface RecognitionProvider {
  recognize(request: RecognitionRequest, signal: AbortSignal): Promise<RecognitionCandidate[]>;
}
export type RecognitionMode = 'handwriting' | 'smart-ink' | 'auto-math';
export function canAutoApply(mode: RecognitionMode, candidate: RecognitionCandidate): boolean {
  return mode === 'auto-math' && candidate.confidence >= 0.98;
}
// No mock provider is registered. MVP 1 never claims recognition is connected.
