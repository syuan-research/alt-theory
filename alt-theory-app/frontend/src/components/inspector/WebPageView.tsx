import { createPortal } from "react-dom";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { t } from "@/i18n";

/** One live frame: reading adjustments never reload a form or its scroll state. */
export function WebPageView({ url, title, actions, onError, controlsHost }: {
  url: string; title: string; actions?: ReactNode; onError?: () => void; controlsHost?: HTMLElement | null;
}) {
  const [zoom, setZoom] = useState(100);
  const [open, setOpen] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const controls = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open && !expanded) return;
    const escape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setOpen(false); setExpanded(false);
    };
    const outside = (event: MouseEvent) => {
      if (!controls.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("keydown", escape);
    document.addEventListener("click", outside);
    return () => {
      document.removeEventListener("keydown", escape);
      document.removeEventListener("click", outside);
    };
  }, [open, expanded]);
  const readingControls = <div className="web-page-controls" ref={controls}>
        {open ? <>
          <button className="flat" title={t("Zoom out")} aria-label={t("Zoom out")} disabled={zoom <= 50} onClick={() => setZoom(value => value - 10)}><i className="ph ph-minus" aria-hidden="true" /></button>
          <button className="flat web-page-percent" title={t("Reset zoom")} onClick={() => setZoom(100)}>{zoom}%</button>
          <button className="flat" title={t("Zoom in")} aria-label={t("Zoom in")} disabled={zoom >= 200} onClick={() => setZoom(value => value + 10)}><i className="ph ph-plus" aria-hidden="true" /></button>
        </> : null}
        {open || expanded ? <button className="flat" title={t(expanded ? "Exit expanded view" : "Expand view")} aria-label={t(expanded ? "Exit expanded view" : "Expand view")} onClick={() => setExpanded(value => !value)}><i className={"ph " + (expanded ? "ph-corners-in" : "ph-corners-out")} aria-hidden="true" /></button> : null}
        <button className="flat" title={t("Page reading controls")} aria-label={t("Page reading controls")} aria-expanded={open} onClick={() => setOpen(value => !value)}><i className="ph ph-magnifying-glass" aria-hidden="true" /></button>
      </div>;
  return <div className={"web-page-view" + (expanded ? " web-page-expanded" : "")}>
    <div className="web-page-toolbar" style={{ display: controlsHost && !expanded ? "none" : undefined }}>
      {expanded ? <span className="web-page-title" title={title}>{title}</span> : null}
      {actions}
      {controlsHost && !expanded ? createPortal(readingControls, controlsHost) : readingControls}
    </div>
    <div className="web-page-viewport">
      <iframe src={url} title={title} style={{ width: (10000 / zoom) + "%", height: (10000 / zoom) + "%", transform: "scale(" + zoom / 100 + ")" }}
        sandbox="allow-scripts allow-forms allow-same-origin allow-downloads allow-popups" onError={onError} />
    </div>
  </div>;
}
