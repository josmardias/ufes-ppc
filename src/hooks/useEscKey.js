import { useEffect, useRef } from "react";

/**
 * Attaches a document-level "keydown" listener that calls `handler` whenever
 * the Escape key is pressed.  The handler ref is kept up-to-date so callers
 * never need to worry about stale closures.
 *
 * @param {(() => void) | null | undefined} handler
 */
export function useEscKey(handler) {
  const ref = useRef(handler);
  ref.current = handler;

  useEffect(() => {
    if (!handler) return;
    function onKeyDown(e) {
      if (e.key === "Escape") ref.current?.();
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [handler]);
}