'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useEditor } from '@/store/editor';
import { saveBoard } from '@/persistence/boards';
import type { BoardDocument } from '@/core/types';
export function useAutosave() {
  const doc = useEditor((s) => s.document);
  const saved = useRef<BoardDocument | null>(null);
  const [status, setStatus] = useState<'saving' | 'saved' | 'error'>('saving');
  const flush = useCallback(async () => {
    const snapshot = useEditor.getState().document;
    if (!snapshot) return true;
    setStatus('saving');
    try {
      await saveBoard(snapshot);
      saved.current = snapshot;
      if (useEditor.getState().document === snapshot) setStatus('saved');
      return true;
    } catch {
      setStatus('error');
      return false;
    }
  }, []);
  useEffect(() => {
    if (!doc || saved.current === doc) return;
    setStatus('saving');
    const timer = setTimeout(() => void flush(), 450);
    return () => clearTimeout(timer);
  }, [doc, flush]);
  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      const current = useEditor.getState().document;
      if (current && current !== saved.current) {
        void saveBoard(current);
        e.preventDefault();
      }
    };
    const visibility = () => {
      if (document.visibilityState === 'hidden') void flush();
    };
    window.addEventListener('beforeunload', handler);
    document.addEventListener('visibilitychange', visibility);
    return () => {
      window.removeEventListener('beforeunload', handler);
      document.removeEventListener('visibilitychange', visibility);
    };
  }, [flush]);
  // Derive pending status during render; a passive effect can run after a click
  // observer has already read the previous "saved" status.
  return {
    status: status === 'saved' && doc !== saved.current ? ('saving' as const) : status,
    flush,
  };
}
