'use client';
import { useMemo } from 'react';
import { mathHTML } from '@/core/math';
export { mathHTML } from '@/core/math';
export default function MathView({ latex }: { latex: string }) {
  const result = useMemo(() => mathHTML(latex), [latex]);
  return result.valid ? (
    <span dangerouslySetInnerHTML={{ __html: result.html }} />
  ) : (
    <span className="math-fallback">{latex}</span>
  );
}
