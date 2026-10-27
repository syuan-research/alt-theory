import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Button } from "@/components/ui/Button";
import { t } from "@/i18n";

type Point = { x: number; y: number };
type View = { scale: number; x: number; y: number };

const MIN_SCALE = 0.05;
const MAX_SCALE = 12;
const FIT_SIDE = 56;
const FIT_TOP = 104;
const FIT_BOTTOM = 32;

const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value));

export function MermaidViewer({ svg, onClose }: { svg: string; onClose: () => void }) {
  const viewportRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const sizeRef = useRef({ width: 0, height: 0 });
  const viewRef = useRef<View>({ scale: 1, x: 0, y: 0 });
  const dragRef = useRef<{ pointerId: number; point: Point } | null>(null);
  const [view, setView] = useState<View>(viewRef.current);
  const [white, setWhite] = useState(false);
  const [fromDark] = useState(() => document.documentElement.dataset.theme === "dark");
  const [animate, setAnimate] = useState(false);
  const [fitMode, setFitMode] = useState(true);
  const animateTimer = useRef<number | null>(null);

  const apply = useCallback((next: View, transition = false) => {
    viewRef.current = next;
    setView(next);
    setAnimate(transition);
    if (animateTimer.current !== null) window.clearTimeout(animateTimer.current);
    if (transition) {
      animateTimer.current = window.setTimeout(() => setAnimate(false), 220);
    }
  }, []);

  const fitView = useCallback((): View => {
    const viewport = viewportRef.current;
    const stage = stageRef.current;
    const width = stage?.offsetWidth || sizeRef.current.width;
    const height = stage?.offsetHeight || sizeRef.current.height;
    if (!viewport || width === 0 || height === 0) return viewRef.current;
    const vw = viewport.clientWidth;
    const vh = viewport.clientHeight;
    const availableWidth = Math.max(1, vw - FIT_SIDE * 2);
    const availableHeight = Math.max(1, vh - FIT_TOP - FIT_BOTTOM);
    const scale = clamp(
      Math.min(availableWidth / width, availableHeight / height),
      MIN_SCALE,
      MAX_SCALE,
    );
    return {
      scale,
      x: (vw - width * scale) / 2,
      y: FIT_TOP + (availableHeight - height * scale) / 2,
    };
  }, []);

  const zoomAt = useCallback((point: Point, factor: number, transition = false) => {
    const current = viewRef.current;
    const scale = clamp(current.scale * factor, MIN_SCALE, MAX_SCALE);
    if (scale === current.scale) return;
    const ratio = scale / current.scale;
    apply({
      scale,
      x: point.x - (point.x - current.x) * ratio,
      y: point.y - (point.y - current.y) * ratio,
    }, transition);
    setFitMode(false);
  }, [apply]);

  const zoomCentered = useCallback((factor: number) => {
    const viewport = viewportRef.current;
    if (!viewport) return;
    zoomAt({ x: viewport.clientWidth / 2, y: viewport.clientHeight / 2 }, factor, true);
  }, [zoomAt]);

  useLayoutEffect(() => {
    const stage = stageRef.current;
    const viewport = viewportRef.current;
    const svgEl = stage?.querySelector("svg");
    if (!stage || !viewport || !svgEl) return;

    svgEl.style.maxWidth = "none";
    svgEl.style.height = "auto";
    let content: { x: number; y: number; width: number; height: number } | null = null;
    try {
      const box = svgEl.getBBox();
      if (box.width > 0 && box.height > 0) {
        content = { x: box.x, y: box.y, width: box.width, height: box.height };
        svgEl.setAttribute("viewBox", `${box.x} ${box.y} ${box.width} ${box.height}`);
      }
    } catch {
      /* A non-graphical SVG falls back to its declared dimensions. */
    }
    const declared = svgEl.viewBox?.baseVal;
    const rect = svgEl.getBoundingClientRect();
    const width = content?.width || declared?.width || rect.width;
    const height = content?.height || declared?.height || rect.height;
    sizeRef.current = { width, height };
    svgEl.setAttribute("width", String(width));
    svgEl.setAttribute("height", String(height));

    const fitNow = () => apply(fitView(), false);
    fitNow();
    setFitMode(true);
    const frame = requestAnimationFrame(() => {
      fitNow();
      dialogRef.current?.querySelector<HTMLButtonElement>(".mermaid-viewer-close")?.focus();
    });
    const settle = window.setTimeout(fitNow, 80);
    return () => {
      cancelAnimationFrame(frame);
      window.clearTimeout(settle);
    };
  }, [apply, fitView, svg]);

  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;
    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      let dy = event.deltaY;
      if (event.deltaMode === 1) dy *= 16;
      else if (event.deltaMode === 2) dy *= 100;
      const factor = Math.exp(-clamp(dy * (event.ctrlKey ? 0.01 : 0.0019), -1.6, 1.6));
      const rect = viewport.getBoundingClientRect();
      zoomAt({ x: event.clientX - rect.left, y: event.clientY - rect.top }, factor);
    };
    viewport.addEventListener("wheel", onWheel, { passive: false });
    return () => viewport.removeEventListener("wheel", onWheel);
  }, [zoomAt]);

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
      } else if (event.key === "f" || event.key === "F") {
        apply(fitView(), true);
        setFitMode(true);
      } else if (event.key === "+" || event.key === "=") {
        zoomCentered(1.35);
      } else if (event.key === "-" || event.key === "_") {
        zoomCentered(1 / 1.35);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKey);
      if (animateTimer.current !== null) window.clearTimeout(animateTimer.current);
    };
  }, [apply, fitView, onClose, zoomCentered]);

  const resizeFit = useCallback(() => {
    if (fitMode) apply(fitView(), false);
  }, [apply, fitMode, fitView]);

  useEffect(() => {
    window.addEventListener("resize", resizeFit);
    const viewport = viewportRef.current;
    const observer = viewport ? new ResizeObserver(resizeFit) : null;
    if (viewport && observer) observer.observe(viewport);
    return () => {
      window.removeEventListener("resize", resizeFit);
      observer?.disconnect();
    };
  }, [resizeFit]);

  const onPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    dragRef.current = { pointerId: event.pointerId, point: { x: event.clientX, y: event.clientY } };
    event.currentTarget.setPointerCapture(event.pointerId);
  };
  const onPointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    const dx = event.clientX - drag.point.x;
    const dy = event.clientY - drag.point.y;
    drag.point = { x: event.clientX, y: event.clientY };
    const current = viewRef.current;
    apply({ ...current, x: current.x + dx, y: current.y + dy });
    setFitMode(false);
  };
  const endDrag = (event: React.PointerEvent<HTMLDivElement>) => {
    if (dragRef.current?.pointerId !== event.pointerId) return;
    dragRef.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  };
  const onDoubleClick = (event: React.MouseEvent<HTMLDivElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    zoomAt(
      { x: event.clientX - rect.left, y: event.clientY - rect.top },
      event.shiftKey ? 1 / 1.6 : 1.6,
      true,
    );
  };

  return createPortal(
    <div
      ref={dialogRef}
      className={`mermaid-viewer${white ? " is-white" : ""}${fromDark ? " from-dark" : ""}`}
      role="dialog"
      aria-modal="true"
      aria-label={t("Diagram")}
    >
      <div className="mermaid-viewer-toolbar">
        <Button variant="secondary" onClick={() => { apply(fitView(), true); setFitMode(true); }}>
          {t("Fit")}
        </Button>
        <Button variant="ghost" aria-label={t("Zoom out")} data-tip={t("Zoom out")} onClick={() => zoomCentered(1 / 1.35)}>
          <i className="ph ph-minus" aria-hidden="true" />
        </Button>
        <span className="mermaid-viewer-zoom">{Math.round(view.scale * 100)}%</span>
        <Button variant="ghost" aria-label={t("Zoom in")} data-tip={t("Zoom in")} onClick={() => zoomCentered(1.35)}>
          <i className="ph ph-plus" aria-hidden="true" />
        </Button>
        <Button
          variant={white ? "primary" : "secondary"}
          aria-pressed={white}
          onClick={() => setWhite((value) => !value)}
        >
          {t("White background")}
        </Button>
        <Button className="mermaid-viewer-close" variant="ghost" aria-label={t("Close")} data-tip={t("Close")} onClick={onClose}>
          <i className="ph ph-x" aria-hidden="true" />
        </Button>
      </div>
      <div
        ref={viewportRef}
        className="mermaid-viewer-viewport"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        onDoubleClick={onDoubleClick}
      >
        <div
          ref={stageRef}
          className={`mermaid-viewer-stage${animate ? " animate" : ""}`}
          style={{ transform: `translate(${view.x}px, ${view.y}px) scale(${view.scale})` }}
          dangerouslySetInnerHTML={{ __html: svg }}
        />
      </div>
    </div>,
    document.body,
  );
}
