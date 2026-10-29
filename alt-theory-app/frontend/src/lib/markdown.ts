import { t } from "@/i18n";
import { marked } from "marked";
import { contentLink } from "@/lib/contentLinks";

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
      const link = contentLink(href);
      if (!link) {
        node.removeAttribute("href");
      } else {
        // Only web links may open a window; the click handler routes the rest.
        if (link.kind === "web" || link.kind === "page") node.setAttribute("target", "_blank");
        else node.removeAttribute("target");
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

/** Escape raw HTML tokens without changing Markdown link destinations or code. */
export function renderMarkdown(text: string): string {
  const renderer = new marked.Renderer();
  renderer.image = ({ href, text, title }) => {
    const source = escapeHtml(href);
    const remote = /^https?:\/\//i.test(href) || /^data:image\//i.test(href);
    const src = remote ? ' src="' + source + '"' : '';
    const tooltip = title ? ' title="' + escapeHtml(title) + '"' : '';
    const open = contentLink(href)
      ? ' <a data-image-open="true" href="' + source + '">' + escapeHtml(t("Open image")) + '</a>'
      : '';
    return '<span class="markdown-image">'
      + '<img data-image-source="' + source + '"' + src + ' alt="' + escapeHtml(text) + '"' + tooltip + ' loading="lazy" />'
      + '<span class="image-caption">' + escapeHtml(text) + open + '</span></span>';
  };
  renderer.html = ({ text }) => escapeHtml(text);
  const rawHtml = marked.parse(text, { renderer }) as string;
  return sanitizeRenderedHtml(rawHtml);
}
