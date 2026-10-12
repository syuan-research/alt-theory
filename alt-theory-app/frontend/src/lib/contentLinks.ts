import type { WorkingFolderDescriptor } from "@/api/types";
import type { FileRef } from "@/lib/fileContent";

export type ContentLink = { kind: "page" | "web"; address: string } | { kind: "file"; address: string } | { kind: "anchor"; address: string };

export function contentLink(href: string): ContentLink | null {
  if (href.startsWith("#")) return { kind: "anchor", address: href };
  if (/^https?:\/\//i.test(href)) {
    try {
      const url = new URL(href);
      const local = url.hostname === "localhost" || url.hostname === "127.0.0.1" || url.hostname === "[::1]";
      return { kind: local ? "page" : "web", address: url.href };
    } catch { return null; }
  }
  if (/^mailto:/i.test(href)) return { kind: "web", address: href };
  if (/^file:\/\//i.test(href)) {
    try {
      const url = new URL(href);
      let address = decodeURIComponent(url.pathname);
      if (/^\/[a-z]:\//i.test(address)) address = address.slice(1);
      // A network host would make the OS connect (and send credentials) on click.
      if (url.hostname) return null;
      return { kind: "file", address };
    } catch { return null; }
  }
  if (/^[a-z][a-z\d+.-]*:/i.test(href) && !/^[a-z]:[\\/]/i.test(href)) return null;
  const path = href.split("#", 1)[0];
  if (/^[\\/]{2}/.test(path)) return null;
  try { return { kind: "file", address: decodeURIComponent(path).replace(/\\/g, "/") }; }
  catch { return { kind: "file", address: path.replace(/\\/g, "/") }; }
}

function normalizePath(path: string): string {
  const prefix = path.startsWith("//") ? "//" : path.startsWith("/") ? "/" : "";
  const parts: string[] = [];
  for (const part of path.replace(/\\/g, "/").split("/")) {
    if (!part || part === ".") continue;
    if (part === "..") { if (parts.length && !/^[a-z]:$/i.test(parts.at(-1)!)) parts.pop(); }
    else parts.push(part);
  }
  return prefix + parts.join("/");
}

export function resolveFileLink(address: string, folders: WorkingFolderDescriptor[], base?: FileRef, baseFolderPath?: string | null): { address: string; ref: FileRef | null } {
  let target = address.replace(/:\d+(?::\d+)?$/, "");
  const managedRoot = folders.find(folder => folder.managed)?.path.replace(/\\/g, "/");
  const recordsRoot = managedRoot?.replace(/\/workspace\/?$/, "/records");
  const absolute = /^(?:[a-z]:[\\/]|\/)/i.test(target);
  if (!absolute) {
    const baseRoot = base?.root === "working"
      ? folders.find(folder => folder.id === base.path.split("/", 1)[0])
      : base?.root === "workspace" ? folders.find(folder => folder.managed)
      : folders.find(folder => folder.role === "primary") ?? folders.find(folder => folder.managed);
    const basePath = base?.root === "working" ? base.path.slice(base.path.indexOf("/") + 1) : base?.path;
    const dir = basePath?.includes("/") ? basePath.slice(0, basePath.lastIndexOf("/")) : "";
    const root = baseFolderPath ?? (base?.root === "records" ? recordsRoot : baseRoot?.path);
    if (!root) return { address: target, ref: null };
    target = `${root}/${dir}/${target}`;
  }
  target = normalizePath(target);
  const within = (root: string) => {
    const windows = /^[a-z]:|^\/\//i.test(root);
    return (windows ? target.toLowerCase() : target).startsWith((windows ? root.toLowerCase() : root) + "/");
  };
  if (recordsRoot && recordsRoot !== managedRoot && within(normalizePath(recordsRoot))) {
    return { address: target, ref: { root: "records", path: target.slice(normalizePath(recordsRoot).length + 1) } };
  }
  // Longest root wins when the managed folder is nested inside a project.
  const folder = [...folders].sort((a, b) => b.path.length - a.path.length)
    .find(item => within(normalizePath(item.path).replace(/\/$/, "")));
  if (!folder) return { address: target, ref: null };
  const path = target.slice(normalizePath(folder.path).replace(/\/$/, "").length + 1);
  return { address: target, ref: folder.managed ? { root: "workspace", path } : { root: "working", path: `${folder.id}/${path}` } };
}

/** The plain-text clipboard keeps link destinations even after rendering. */
export function selectionMarkdown(node: Node): string {
  if (node.nodeType === Node.TEXT_NODE) return node.textContent ?? "";
  const body = Array.from(node.childNodes).map(selectionMarkdown).join("");
  if (!(node instanceof Element)) return body;
  if (node.tagName === "A" && node.getAttribute("href")) return `[${body}](${node.getAttribute("href")})`;
  if (node.tagName === "BR") return "\n";
  return /^(P|DIV|LI|PRE|BLOCKQUOTE|H[1-6])$/.test(node.tagName) ? `${body}\n` : body;
}
