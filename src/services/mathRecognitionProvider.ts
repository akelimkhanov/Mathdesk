import type { MathRecognitionProvider } from './mathRecognition';
import { developmentMathProvider } from './developmentMathProvider';

// Replace this adapter to connect a real service; the board and dialog stay unchanged.
export const mathRecognitionProvider: MathRecognitionProvider = developmentMathProvider;
