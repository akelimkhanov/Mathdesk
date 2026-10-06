'use client';
import { useCallback, useEffect, useRef, useState } from 'react';

export function useBrowserFullscreen() {
  const [fullscreen, setFullscreen] = useState(false);
  const [supported, setSupported] = useState(false);
  const [pending, setPending] = useState(false);
  const active = useRef(false);
  const exitedAt = useRef(-Infinity);
  const inFlight = useRef(false);

  useEffect(() => {
    setSupported(
      typeof document.documentElement.requestFullscreen === 'function' &&
        typeof document.exitFullscreen === 'function' &&
        document.fullscreenEnabled !== false,
    );
    const changed = () => {
      const next = !!document.fullscreenElement;
      if (active.current && !next) exitedAt.current = performance.now();
      active.current = next;
      setFullscreen(next);
    };
    changed();
    document.addEventListener('fullscreenchange', changed);
    return () => document.removeEventListener('fullscreenchange', changed);
  }, []);

  const toggle = useCallback(async () => {
    if (inFlight.current) return;
    inFlight.current = true;
    setPending(true);
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else if (typeof document.documentElement.requestFullscreen === 'function')
        await document.documentElement.requestFullscreen();
    } catch {
      // A denied request leaves the presentation usable in the browser window.
    } finally {
      inFlight.current = false;
      setPending(false);
    }
  }, []);

  const handleEscape = useCallback(() => {
    if (document.fullscreenElement) {
      // Also supports browsers that deliver Escape to the page before exiting.
      void document.exitFullscreen().catch(() => {});
      return true;
    }
    // Native Escape can arrive before or just after fullscreenchange.
    // Do not let that same key press also close Presentation Mode.
    return active.current || performance.now() - exitedAt.current < 250;
  }, []);

  return { fullscreen, supported, pending, toggle, handleEscape };
}
