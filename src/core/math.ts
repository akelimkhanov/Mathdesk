import katex from 'katex';

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
