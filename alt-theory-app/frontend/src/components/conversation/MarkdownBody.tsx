import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { MouseEvent } from "react";
import { renderMarkdown } from "@/lib/markdown";
import { cn } from "@/lib/cn";
import { t } from "@/i18n";

let mermaidReady: Promise<typeof import("mermaid").default> | null = null;
let diagramSeq = 0;

/** Mermaid is ~1MB; load it only once a conversation actually shows a diagram. */
function loadMermaid() {
  if (!mermaidReady) {
    mermaidReady = import("mermaid").then((module) => {
      module.default.initialize({
        startOnLoad: false,
        securityLevel: "strict",
        theme: document.documentElement.dataset.theme === "dark" ? "dark" : "default",
      });
      return module.default;
    });
  }
  return mermaidReady;
}

function decodeEntities(text: string): string {
  return text
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, "&");
}

/**
 * Split on blank lines: prefix is treated as finished blocks; suffix is still
 * growing. Finished prefix must not be DOM-replaced on every token — that is
 * what made already-stable lines in the *current* reply flash (including when
 * those lines sat in the viewport while later parts updated off-screen).
 */
function splitFinishedAndTail(text: string): { finished: string; tail: string } {
  const cut = text.lastIndexOf("\n\n");
  if (cut < 0) return { finished: "", tail: text };
  return { finished: text.slice(0, cut + 2), tail: text.slice(cut + 2) };
}

/**
 * Rendered markdown, with ```mermaid fences drawn as diagrams (alpha.3).
 *
 * Streaming: freeze HTML for blank-line-finished blocks; only re-parse the
 * growing tail. Final (non-streaming) messages still render as one document
 * so mermaid and full structure match the settled text.
 */
export function MarkdownBody({
  text,
  className,
  renderMermaid = true,
  streaming = false,
}: {
  text: string;
  className?: string;
  renderMermaid?: boolean;
  streaming?: boolean;
}) {
  const rootRef = useRef<HTMLDivElement>(null);
  const finishedRef = useRef<HTMLDivElement>(null);
  const tailRef = useRef<HTMLDivElement>(null);
  const frozenFinishedRef = useRef("");

  useLayoutEffect(() => {
    if (!streaming) {
      frozenFinishedRef.current = "";
      return;
    }
    const finishedEl = finishedRef.current;
    const tailEl = tailRef.current;
    if (!finishedEl || !tailEl) return;

    const { finished, tail } = splitFinishedAndTail(text);

    // Only when a new finished block appears do we touch the frozen region.
    if (finished !== frozenFinishedRef.current) {
      frozenFinishedRef.current = finished;
      finishedEl.innerHTML = finished ? renderMarkdown(finished) : "";
    }

    tailEl.innerHTML = tail ? renderMarkdown(tail) : "";
  }, [text, streaming]);

  const sourceHtml = useMemo(
    () => (streaming ? "" : renderMarkdown(text)),
    [text, streaming],
  );

  const [diagramHtml, setDiagramHtml] = useState<{
    source: string;
    rendered: string;
  } | null>(null);

  useEffect(() => {
    if (!renderMermaid || streaming) return;
    const host = document.createElement("div");
    host.innerHTML = sourceHtml;
    const blocks = host.querySelectorAll<HTMLElement>("code.language-mermaid");
    if (blocks.length === 0) return;
    let cancelled = false;
    void loadMermaid().then(async (mermaid) => {
      for (const block of blocks) {
        if (cancelled) return;
        const source = decodeEntities(block.textContent ?? "");
        const target = block.parentElement ?? block;
        try {
          const { svg } = await mermaid.render(`d${(diagramSeq += 1)}`, source);
          if (cancelled) return;
          const figure = document.createElement("div");
          figure.className = "mermaid-figure";
          figure.innerHTML = svg;
          // Diagram + fenced source in one block, with a small control that
          // swaps between them (the rendered HTML is set via innerHTML, so
          // the flip is a class toggle handled by onClick on the root below).
          const wrap = document.createElement("div");
          wrap.className = "mermaid-block";
          const toggle = document.createElement("button");
          toggle.type = "button";
          toggle.className = "mermaid-toggle";
          toggle.textContent = t("Source code");
          const sourcePre = target.cloneNode(true) as HTMLElement;
          sourcePre.classList.add("mermaid-source");
          // renderMarkdown escapes the whole document before parsing, so the
          // code text carries one round of entities (--&gt;). Decode to the
          // true source the user wrote — the toggle exists to copy it.
          const sourceCode = sourcePre.querySelector("code");
          if (sourceCode) {
            sourceCode.textContent = decodeEntities(sourceCode.textContent ?? "");
          }
          wrap.append(toggle, figure, sourcePre);
          target.replaceWith(wrap);
        } catch {
          // Leave the source visible — a broken diagram is still readable text.
        }
      }
      if (!cancelled) {
        setDiagramHtml({ source: sourceHtml, rendered: host.innerHTML });
      }
    });
    return () => {
      cancelled = true;
    };
  }, [renderMermaid, sourceHtml, streaming]);

  if (streaming) {
    return (
      <div ref={rootRef} className={cn("markdown-body", className)}>
        <div ref={finishedRef} className="md-stream-finished" />
        <div ref={tailRef} className="md-stream-tail" />
      </div>
    );
  }

  const html =
    renderMermaid && diagramHtml?.source === sourceHtml
      ? diagramHtml.rendered
      : sourceHtml;

  const onMermaidToggle = (event: MouseEvent<HTMLDivElement>) => {
    const button = (event.target as HTMLElement).closest<HTMLButtonElement>(
      ".mermaid-toggle",
    );
    if (!button) return;
    const block = button.closest(".mermaid-block");
    if (!block) return;
    const showingSource = block.classList.toggle("show-source");
    button.textContent = showingSource ? t("Rendered") : t("Source code");
  };

  return (
    <div
      className={cn("markdown-body", className)}
      onClick={onMermaidToggle}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
