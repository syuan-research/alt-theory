import { useEffect, useState } from "react";

const TICK_MS = 60_000;

// One shared interval serves every subscriber; created on first attach,
// cleared when the last one detaches.
const listeners = new Set<() => void>();
let timer: number | undefined;

/** A 60-second shared tick for relative-time labels. Components calling this
 * re-render once a minute so "N minutes ago" stays honest in an idle window. */
export function useNow(): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const bump = () => setNow(Date.now());
    listeners.add(bump);
    if (timer === undefined) {
      timer = window.setInterval(() => listeners.forEach((fn) => fn()), TICK_MS);
    }
    return () => {
      listeners.delete(bump);
      if (listeners.size === 0 && timer !== undefined) {
        window.clearInterval(timer);
        timer = undefined;
      }
    };
  }, []);
  return now;
}
