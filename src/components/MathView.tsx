'use client';
import katex from 'katex';
import { useMemo } from 'react';
export function mathHTML(latex: string): { html: string; valid: boolean } {
  try {
    return {
      html: katex.renderToString(latex, {
        throwOnError: true,
        displayMode: true,
        trust: false,
        strict: 'ignore',
        maxExpand: 1000,
        maxSize: 20,
        output: 'htmlAndMathml',
      }),
      valid: true,
    };
  } catch {
    return { html: '', valid: false };
  }
}
export default function MathView({ latex }: { latex: string }) {
  const result = useMemo(() => mathHTML(latex), [latex]);
  return result.valid ? (
    <span dangerouslySetInnerHTML={{ __html: result.html }} />
  ) : (
    <span className="math-fallback">{latex}</span>
  );
}
