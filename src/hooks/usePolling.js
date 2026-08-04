import { useEffect, useRef } from 'react';

/**
 * Re-runs `fetcher` every `intervalMs` while `enabled` is true, skipping a
 * tick whenever `paused()` returns true (e.g. a modal is open or a card is
 * mid-drag) so a background refresh can't clobber in-progress edits.
 */
export function usePolling(fetcher, { intervalMs = 4000, enabled = true, paused = () => false } = {}) {
  const fetcherRef = useRef(fetcher);
  fetcherRef.current = fetcher;
  const pausedRef = useRef(paused);
  pausedRef.current = paused;

  useEffect(() => {
    if (!enabled) return;
    const id = setInterval(() => {
      if (pausedRef.current()) return;
      fetcherRef.current();
    }, intervalMs);
    return () => clearInterval(id);
  }, [enabled, intervalMs]);
}
