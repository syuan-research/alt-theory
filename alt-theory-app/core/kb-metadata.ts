import { existsSync, readdirSync, readFileSync } from "fs";
import { basename, extname, join, relative, resolve } from "path";
import { parseFrontmatter } from "@earendil-works/pi-coding-agent";

/**
 * A knowledge base is a folder holding `at-kb.md`: its frontmatter `name` and
 * `description` are what a conversation carries (like a skill's description);
 * the body and the agent-written `at-kb-index.tsv` are read when it is used.
 */
export const KB_CARD_FILE = "at-kb.md";
export const KB_INDEX_FILE = "at-kb-index.tsv";
/** The selection that reads no knowledge base. */
export const KB_DISABLED_DOMAIN = "none";

export interface KbLibrary {
  slug: string;
  name: string;
  description?: string;
  dir: string;
  /** Present when the library comes from a user-added location. */
  source?: "added";
}

export function readKbCard(dir: string): { name?: string; description?: string } {
  const path = join(dir, KB_CARD_FILE);
  if (!existsSync(path)) return {};
  try {
    const { frontmatter } = parseFrontmatter<Record<string, unknown>>(readFileSync(path, "utf-8"));
    const text = (value: unknown) =>
      typeof value === "string" && value.trim() ? value.trim() : undefined;
    return { name: text(frontmatter.name), description: text(frontmatter.description) };
  } catch {
    return {};
  }
}

/** Entry files of a library: its Markdown, minus the card and nested libraries. */
function entryFiles(dir: string, root = dir): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    if (entry.name.startsWith(".")) return [];
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      return existsSync(join(path, KB_CARD_FILE)) ? [] : entryFiles(path, root);
    }
    if (!entry.isFile() || extname(entry.name).toLowerCase() !== ".md") return [];
    if (dir === root && entry.name === KB_CARD_FILE) return [];
    return [relative(root, path).split("\\").join("/")];
  });
}

/**
 * Item-level check only: does the index's first column list exactly the
 * library's entry files? Field contents are the agent's to keep right.
 */
export function checkKbIndex(dir: string): { unlisted: number; missing: number } | "no-index" {
  const path = join(dir, KB_INDEX_FILE);
  if (!existsSync(path)) return "no-index";
  const listed = new Set(
    readFileSync(path, "utf-8")
      .split(/\r?\n/)
      .slice(1)
      .map((line) => line.split("\t")[0].trim().split("\\").join("/").replace(/^\.\//, ""))
      .filter(Boolean),
  );
  const files = entryFiles(dir);
  return {
    unlisted: files.filter((file) => !listed.delete(file)).length,
    missing: listed.size,
  };
}

function indexNote(library: KbLibrary): string | null {
  const check = checkKbIndex(library.dir);
  if (check === "no-index") {
    return `${library.name} has no ${KB_INDEX_FILE} yet; when you use it, tell the user and offer to write one.`;
  }
  if (!check.unlisted && !check.missing) return null;
  return `${library.name}'s index does not match its summaries (${check.unlisted} not listed, ${check.missing} listed but absent); when you use it, tell the user and offer to update the index.`;
}

export function formatKbPrompt(libraries: KbLibrary[], settingsPath: string | null): string {
  const registration = settingsPath
    ? `Knowledge-base locations are the \`extraKbDirs\` list in ${settingsPath}.`
    : null;
  if (!libraries.length) {
    return [
      "Knowledge-base folder retrieval is disabled for this session. You may still read user workspace files when requested.",
      registration,
    ].filter(Boolean).join("\n");
  }
  return [
    libraries.length === 1 ? "Selected knowledge base:" : "Selected knowledge bases:",
    ...libraries.map((library) =>
      [`- ${library.name} — ${library.dir}`, library.description ? `  ${library.description}` : null]
        .filter(Boolean)
        .join("\n"),
    ),
    `Each knowledge base's ${KB_CARD_FILE} describes it, and its ${KB_INDEX_FILE} lists its summaries. When you use one, locate summaries through its index; when the index cannot place a fine-grained question, read the Summary sections of candidate summaries. After a Summary section, read on as far as the user's question needs, down to the original material a summary links.`,
    ...libraries.map(indexNote).filter((note): note is string => Boolean(note)),
    registration,
  ].filter(Boolean).join("\n");
}

export function libraryName(dir: string): string {
  return readKbCard(dir).name ?? basename(resolve(dir));
}
