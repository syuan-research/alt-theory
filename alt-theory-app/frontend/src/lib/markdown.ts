import { marked } from "marked";

marked.setOptions({
  breaks: true,
  gfm: true,
});

function escapeHtml(value: string): string {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function sanitizeRenderedHtml(html: string): string {
  const template = document.createElement("template");
  template.innerHTML = html;
  template.content.querySelectorAll("*").forEach((node) => {
    if (node.tagName === "A") {
      const href = node.getAttribute("href") || "";
      if (!/^(https?:|mailto:|#)/i.test(href)) {
        node.removeAttribute("href");
      } else {
        node.setAttribute("target", "_blank");
        node.setAttribute("rel", "noreferrer noopener");
      }
      return;
    }
    for (const attr of [...node.attributes]) {
      if (/^on/i.test(attr.name) || attr.name === "style") {
        node.removeAttribute(attr.name);
      }
    }
  });
  return template.innerHTML;
}

export function renderMarkdown(text: string): string {
  const escaped = escapeHtml(text);
  const rawHtml = marked.parse(escaped) as string;
  return sanitizeRenderedHtml(rawHtml);
}