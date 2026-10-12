import { useEffect, useState, type RefObject } from "react";

/** Both composers fold permission, then model labels at the same widths. */
export function useComposerRow(rowRef: RefObject<HTMLDivElement | null>) {
  const [width, setWidth] = useState(Infinity);
  useEffect(() => {
    const row = rowRef.current;
    if (!row) return;
    const observer = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width));
    observer.observe(row);
    return () => observer.disconnect();
  }, [rowRef]);
  return `row${width < 460 ? " narrow" : ""}${width < 360 ? " tiny" : ""}`;
}
