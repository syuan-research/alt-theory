/**
 * Styled tooltip (v1.4.7-beta.2): replaces the native `title` attribute.
 *
 * Native tooltips were unusable here — a browser-enforced ~1.5s hover delay
 * users reliably missed, and OS-drawn chrome CSS cannot reach. This module
 * keeps the authoring ergonomics of `title` (one JSX attribute) while owning
 * timing and appearance:
 *
 *   <button data-tip={t("Stop")} />                  — body only
 *   <button data-tip-title={t("Context usage")}      — optional small-caps
 *            data-tip={usageSummary} />                label above the body
 *
 * One singleton bubble lives under a fixed-position root; a single delegated
 * `mouseover` listener manages it, so 80+ call sites stay untouched apart
 * from the attribute rename. Wheel/touch are untouched: desktop Electron is
 * the target and hover is the only trigger.
 */

import { useEffect } from "react";

const SHOW_DELAY_MS = 120;
const EDGE_MARGIN = 8;

export function TooltipRoot() {
  useEffect(() => {
    const tip = document.createElement("div");
    tip.className = "app-tooltip";
    const title = document.createElement("div");
    title.className = "app-tooltip-title";
    const body = document.createElement("div");
    body.className = "app-tooltip-body";
    tip.append(title, body);
    document.body.appendChild(tip);

    let active: Element | null = null;
    let timer: number | undefined;
    let raf = 0;

    const hide = () => {
      window.clearTimeout(timer);
      cancelAnimationFrame(raf);
      active = null;
      tip.classList.remove("show");
    };

    const render = (el: Element) => {
      const titleText = el.getAttribute("data-tip-title");
      const bodyText = el.getAttribute("data-tip");
      if (!bodyText) return;
      title.textContent = titleText ?? "";
      title.style.display = titleText ? "" : "none";
      body.textContent = bodyText;
      tip.classList.add("show");
      position(el);
    };

    const position = (el: Element) => {
      const r = el.getBoundingClientRect();
      const tr = tip.getBoundingClientRect();
      if (!tr.width && !tr.height) {
        // Hidden bubbles report zero size; measure on the next frame.
        raf = requestAnimationFrame(() => position(el));
        return;
      }
      const x = Math.max(
        EDGE_MARGIN,
        Math.min(r.left, window.innerWidth - tr.width - EDGE_MARGIN),
      );
      let y = r.bottom + 8;
      if (y + tr.height > window.innerHeight - EDGE_MARGIN) {
        y = r.top - tr.height - 8;
      }
      tip.style.left = `${Math.max(EDGE_MARGIN, x)}px`;
      tip.style.top = `${Math.max(EDGE_MARGIN, y)}px`;
    };

    const schedule = (el: Element) => {
      hide();
      active = el;
      timer = window.setTimeout(() => {
        if (active === el) render(el);
      }, SHOW_DELAY_MS);
    };

    // pointerover, not mouseover: Chromium never dispatches mouse events on
    // disabled form controls, but does dispatch pointer events — and several
    // tips (mode switch, model picker) exist precisely to explain why a
    // control is disabled.
    const onOver = (event: PointerEvent) => {
      const target = (event.target as Element | null)?.closest?.("[data-tip]");
      if (target === active) return;
      if (target) schedule(target);
      else hide();
    };

    // Tab onto a control shows the same bubble the mouse would.
    const onFocusIn = (event: FocusEvent) => {
      const el = event.target as Element | null;
      if (el?.hasAttribute?.("data-tip")) schedule(el);
    };
    const onFocusOut = () => hide();
    const onDown = (event: MouseEvent) => {
      if ((event.target as Element | null)?.closest?.("[data-tip]")) hide();
    };

    document.addEventListener("pointerover", onOver);
    document.addEventListener("focusin", onFocusIn);
    document.addEventListener("focusout", onFocusOut);
    document.addEventListener("mousedown", onDown);
    window.addEventListener("scroll", hide, true);
    window.addEventListener("resize", hide);
    window.addEventListener("blur", hide);

    return () => {
      document.removeEventListener("pointerover", onOver);
      document.removeEventListener("focusin", onFocusIn);
      document.removeEventListener("focusout", onFocusOut);
      document.removeEventListener("mousedown", onDown);
      window.removeEventListener("scroll", hide, true);
      window.removeEventListener("resize", hide);
      window.removeEventListener("blur", hide);
      window.clearTimeout(timer);
      cancelAnimationFrame(raf);
      tip.remove();
    };
  }, []);

  return null;
}

/** Mount once, next to other providers. */
export default TooltipRoot;
