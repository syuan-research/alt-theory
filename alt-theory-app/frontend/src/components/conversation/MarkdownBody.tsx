import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { MouseEvent } from "react";
import { renderMarkdown } from "@/lib/markdown";
import { cn } from "@/lib/cn";
import { t } from "@/i18n";
import { useConversationContext } from "@/context/ConversationContext";
import { useContentLinks } from "@/components/conversation/useContentLinks";
import { contentLink, selectionMarkdown } from "@/lib/contentLinks";
import type { FileRef } from "@/lib/fileContent";

let mermaidReady: Promise<typeof import("mermaid").default> | null = null;
let diagramSeq = 0;

/** Mermaid is ~1MB; load it only once a conversation actually shows a diagram. */
function loadMermaid() {
  if (!mermaidReady) {
    mermaidReady = import("mermaid").then((module) => {
      module.default.initialize({
        startOnLoad: false,
        securityLevel: "strict",
        // A broken diagram throws instead of drawing mermaid's error graphic;
        // the fenced source stays visible (perf plan WP 1.7).
        suppressErrorRendering: true,
        theme: document.documentElement.dataset.theme === "dark" ? "dark" : "default",
      });
      return module.default;
    });
  }
  return mermaidReady;
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
  sessionId,
  baseFile,
  baseFolderPath,
  markRow,
}: {
  text: string;
  className?: string;
  renderMermaid?: boolean;
  streaming?: boolean;
  sessionId?: string | null;
  baseFile?: FileRef;
  baseFolderPath?: string | null;
  /** Transcript row id: this text takes reader marks (lib/marks.ts). */
  markRow?: string;
}) {
  const conversation = useConversationContext();
  const links = useContentLinks(sessionId === undefined ? conversation.sessionId : sessionId, baseFile, baseFolderPath);
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
        const source = block.textContent ?? "";
        const target = block.parentElement ?? block;
        const id = `d${(diagramSeq += 1)}`;
        try {
          const { svg } = await mermaid.render(id, source);
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
          // The fenced code already contains the original text for copying.
          wrap.append(toggle, figure, sourcePre);
          target.replaceWith(wrap);
        } catch {
          // Leave the source visible — a broken diagram is still readable text.
          // Mermaid's scratch nodes for a failed render can stay in <body>.
          document.getElementById(id)?.remove();
          document.getElementById(`d${id}`)?.remove();
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

  const html =
    renderMermaid && diagramHtml?.source === sourceHtml
      ? diagramHtml.rendered
      : sourceHtml;
  // Stable identity prevents same-HTML renders from replacing selected DOM text.
  const innerHtml = useMemo(() => ({ __html: html }), [html]);

  const onClick = (event: MouseEvent<HTMLDivElement>) => {
    const anchor = (event.target as Element).closest<HTMLAnchorElement>("a[href]");
    const href = anchor?.getAttribute("href");
    if (href && contentLink(href)?.kind !== "anchor") {
      event.preventDefault();
      links.open(href);
      return;
    }
    onMermaidToggle(event);
  };
  // A middle click would open a file link as a window of the app's own address.
  const onAuxClick = (event: MouseEvent<HTMLDivElement>) => {
    const href = (event.target as Element).closest<HTMLAnchorElement>("a[href]")?.getAttribute("href");
    const kind = href ? contentLink(href)?.kind : undefined;
    if (event.button !== 1 || !href || kind === "web" || kind === "page") return;
    event.preventDefault();
    if (kind === "file") links.open(href);
  };
  const onContextMenu = (event: MouseEvent<HTMLDivElement>) => {
    const anchor = (event.target as Element).closest<HTMLAnchorElement>("a[href]");
    const href = anchor?.getAttribute("href");
    if (href) links.context(event, href);
  };
  const onCopy = (event: React.ClipboardEvent<HTMLDivElement>) => {
    const selection = window.getSelection();
    if (!selection?.rangeCount || selection.isCollapsed) return;
    const range = selection.getRangeAt(0);
    if (!event.currentTarget.contains(range.commonAncestorContainer)) return;
    const fragment = range.cloneContents();
    const ancestor = range.commonAncestorContainer instanceof Element
      ? range.commonAncestorContainer : range.commonAncestorContainer.parentElement;
    const enclosingLink = ancestor?.closest<HTMLAnchorElement>("a[href]");
    if (!fragment.querySelector("a[href]") && !enclosingLink) return;
    const host = document.createElement("div");
    if (enclosingLink) {
      const anchor = document.createElement("a");
      anchor.setAttribute("href", enclosingLink.getAttribute("href")!);
      anchor.append(fragment);
      host.append(anchor);
    } else host.append(fragment);
    event.preventDefault();
    event.clipboardData.setData("text/plain", selectionMarkdown(host).trimEnd());
    event.clipboardData.setData("text/html", host.innerHTML);
  };

  if (streaming) {
    return (
      <div ref={rootRef} className={cn("markdown-body", className)} onClick={onClick} onAuxClick={onAuxClick} onContextMenu={onContextMenu} onCopy={onCopy}>
        <div ref={finishedRef} className="md-stream-finished" />
        <div ref={tailRef} className="md-stream-tail" />
        {links.menu}
      </div>
    );
  }

  function onMermaidToggle(event: MouseEvent<HTMLDivElement>) {
    const button = (event.target as HTMLElement).closest<HTMLButtonElement>(
      ".mermaid-toggle",
    );
    if (!button) return;
    const block = button.closest(".mermaid-block");
    if (!block) return;
    const showingSource = block.classList.toggle("show-source");
    button.textContent = showingSource ? t("Rendered") : t("Source code");
  }

  return (<>
    <div
      className={cn("markdown-body", className)}
      data-mark-row={markRow}
      onClick={onClick}
      onAuxClick={onAuxClick}
      onContextMenu={onContextMenu}
      onCopy={onCopy}
      dangerouslySetInnerHTML={innerHtml}
    />
    {links.menu}
  </>);
}
