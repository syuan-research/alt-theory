/**
 * Alt Theory web-access custom tools (v1.3 W5).
 *
 * SHIPPED DISABLED: these tools are registered in the session's full tool
 * registry (customTools) but named in NO mode's active-tool set — see
 * activeToolsForMode in alt-theory-core.ts, the single policy chokepoint.
 * Enablement (including the deferred Understand-mode lookup decision) is a
 * config flip there, paired with the maturing of the search-policy skill
 * layer; see the 2026-07-24 v1.3 swe plan, workstream W5.
 *
 * Shape follows pi-web-access (nicopreme, MIT) — tools `web_search` and
 * `fetch_content` — but this is a zero-dependency thin implementation, not
 * a fork: plain fetch() plus minimal HTML-to-text.
 * ponytail: tag-strip readability; vendor @mozilla/readability + turndown
 * (with a dependency audit) when these tools are actually enabled.
 *
 * The parameter is named `url` on purpose: the security extension
 * SSRF-checks `url`/`uri`/`endpoint` inputs of custom tools, so both tools
 * inherit cloud-metadata/internal-host blocking automatically.
 */

import { Type } from "typebox";
import type { ToolDefinition } from "@earendil-works/pi-coding-agent";

const fetchContentSchema = Type.Object({
  url: Type.String({ description: "The http(s) URL to fetch" }),
});

const webSearchSchema = Type.Object({
  query: Type.String({ description: "The search query" }),
});

/** Minimal HTML → readable text: drop script/style, strip tags, unescape. */
export function htmlToText(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<(br|\/p|\/div|\/h[1-6]|\/li|\/tr)[^>]*>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

const MAX_CONTENT_CHARS = 60_000;

export function createWebAccessToolDefinitions(): ToolDefinition<any, any>[] {
  const fetchContent: ToolDefinition<typeof fetchContentSchema, undefined> = {
    name: "fetch_content",
    label: "Fetch web content",
    description:
      "Fetch a web page over http(s) and return its readable text. Use for reading a specific URL; follow the search-policy skill for provenance (cite the URL; quote only what the page returned).",
    parameters: fetchContentSchema,
    async execute(_id, params, signal) {
      const response = await fetch(params.url, {
        signal,
        redirect: "follow",
        headers: { "user-agent": "alt-theory/1.3 (research companion)" },
      });
      if (!response.ok) {
        return {
          content: [
            {
              type: "text",
              text: `Fetch failed: HTTP ${response.status} for ${params.url}. Report this to the user rather than filling the gap from memory.`,
            },
          ],
          details: undefined,
        };
      }
      const contentType = response.headers.get("content-type") ?? "";
      const body = await response.text();
      const text = contentType.includes("html") ? htmlToText(body) : body;
      const clipped =
        text.length > MAX_CONTENT_CHARS
          ? `${text.slice(0, MAX_CONTENT_CHARS)}\n\n[truncated at ${MAX_CONTENT_CHARS} characters]`
          : text;
      return {
        content: [{ type: "text", text: `Source: ${params.url}\n\n${clipped}` }],
        details: undefined,
      };
    },
  };

  const webSearch: ToolDefinition<typeof webSearchSchema, undefined> = {
    name: "web_search",
    label: "Web search",
    description:
      "Search the web. Requires a configured search provider; without one this tool reports that honestly instead of guessing.",
    parameters: webSearchSchema,
    async execute() {
      // ponytail: no provider wiring until the tool is enabled post-1.3 —
      // provider choice (plain-HTTP, keyless-first) is part of that decision.
      return {
        content: [
          {
            type: "text",
            text: "No search provider is configured for the built-in web_search tool. Tell the user live search is unavailable here; do not substitute remembered results.",
          },
        ],
        details: undefined,
      };
    },
  };

  return [fetchContent, webSearch];
}
