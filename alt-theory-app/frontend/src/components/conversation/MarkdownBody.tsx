import { useEffect, useMemo, useState } from "react";
import { renderMarkdown } from "@/lib/markdown";
import { cn } from "@/lib/cn";

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
 * Rendered markdown, with ```mermaid fences drawn as diagrams (alpha.3).
 *
 * Relationships and flows are what a theory discussion keeps drawing in prose;
 * a diagram the user can actually see is worth the dependency. A fence that
 * fails to parse falls back to its source text rather than breaking the reply.
 */
export function MarkdownBody({
  text,
  className,
  renderMermaid = true,
}: {
  text: string;
  className?: string;
  renderMermaid?: boolean;
}) {
  const sourceHtml = useMemo(() => renderMarkdown(text), [text]);
  const [diagramHtml, setDiagramHtml] = useState<{
    source: string;
    rendered: string;
  } | null>(null);

  useEffect(() => {
    if (!renderMermaid) return;
    const host = document.createElement("div");
    host.innerHTML = sourceHtml;
    const blocks = host.querySelectorAll<HTMLElement>("code.language-mermaid");
    if (blocks.length === 0) return;
    let cancelled = false;
    void loadMermaid().then(async (mermaid) => {
      for (const block of blocks) {
        if (cancelled) return;
        // renderMarkdown escapes the text before marked escapes it again, so
        // textContent still holds one entity layer — "A --&gt; B", not "A --> B".
        const source = decodeEntities(block.textContent ?? "");
        const target = block.parentElement ?? block;
        try {
          const { svg } = await mermaid.render(`d${(diagramSeq += 1)}`, source);
          if (cancelled) return;
          const figure = document.createElement("div");
          figure.className = "mermaid-figure";
          figure.innerHTML = svg;
          target.replaceWith(figure);
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
  }, [renderMermaid, sourceHtml]);

  const html =
    renderMermaid && diagramHtml?.source === sourceHtml
      ? diagramHtml.rendered
      : sourceHtml;

  return (
    <div
      className={cn("markdown-body", className)}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
