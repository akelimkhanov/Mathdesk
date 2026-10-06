'use client';
import { useState } from 'react';
export function usePresentation() {
  const [presentation, setPresentation] = useState(false);
  const enter = () => setPresentation(true);
  const exit = () => setPresentation(false);
  return { presentation, enter, exit };
}
