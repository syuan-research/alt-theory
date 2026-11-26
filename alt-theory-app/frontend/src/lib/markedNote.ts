import type { MarkedItem, MarkedScope } from "@/api/sessions";
import type { MarkedArrangement, MarkedGroup } from "@/lib/markedItems";
import { t } from "@/i18n";

/**
 * The collection written as a note (owner 2026-11-26, format A; Zotero's
 * "note from annotations"): a title with the date, the scope and order it was
 * made from, then per conversation its entries — the marked words first, the
 * user's note under them, a link back to the row — divided by rules. A whole
 * bookmarked message is quoted in full. Written once; it does not follow
 * later changes.
 */

const COLOR_SIGN: Record<string, string> = { "hl-1": "🟨", "hl-2": "🟩", "hl-3": "🟧", "hl-4": "🟦", "hl-5": "🟥" };

/** A conversation as a heading: its name, or its opening words marked as a fragment when it has none. */
export function conversationLabel(name: string | null, opening: string): string {
  if (name?.trim()) return name.trim();
  const words = opening.replace(/\s+/g, " ").trim();
  const cut = words.length > 40 ? `${words.slice(0, 40).trimEnd()}…` : words;
  return t("“{opening}”", { opening: cut || t("Untitled") });
}

const SCOPE_LABEL = (scope: MarkedScope) =>
  scope === "family" ? t("This conversation and its family")
    : scope === "project" ? t("This conversation and its project")
      : scope === "all" ? t("All conversations")
        : t("This conversation");

function entry(item: MarkedItem, source: string | null): string {
  const who = item.role === "user" ? t("You") : item.role === "assistant" ? t("Alt") : t("Message");
  const where = `${who}${item.thinking ? ` (${t("Thinking")})` : ""}${source ? ` · ${source}` : ""}`;
  const link = `[↗](conversation:${item.sessionId}#${item.row})`;
  const note = item.note?.trim() ? `\n\n${t("Note: {note}", { note: item.note.trim() })}` : "";
  const quoted = (text: string) => text.trim().split("\n").map((line) => `> ${line}`.trimEnd()).join("\n");
  if (item.kind === "bookmark") return `🔖 **${where}** ${link}\n\n${quoted(item.text)}${note}`;
  const sign = COLOR_SIGN[item.kind] ?? (item.kind === "under" ? t("Underlined") : t("Struck through"));
  return `${sign} **${where}**${t(": ")}“${item.text.trim()}” ${link}${note}`;
}

export function markedNote(
  groups: readonly MarkedGroup[],
  options: { date: string; scope: MarkedScope; arrangement: MarkedArrangement; labelOf: (sessionId: string) => string },
): string {
  const order = options.arrangement === "time" ? t("By time") : t("By source");
  const out = [`# ${t("Bookmarks and marks · {date}", { date: options.date })}`, t("Scope: {scope}", { scope: `${SCOPE_LABEL(options.scope)} · ${order}` })];
  for (const group of groups) {
    const sources = new Set(group.items.map((item) => item.sessionId));
    // One conversation gets its heading; a mixed stream names the source on each entry.
    const single = group.sessionId ?? (sources.size === 1 ? [...sources][0] : null);
    if (single) out.push(`## ${t("Conversation: {name}", { name: options.labelOf(single) })}`);
    out.push(group.items.map((item) => entry(item, single ? null : options.labelOf(item.sessionId))).join("\n\n---\n\n"));
  }
  return `${out.join("\n\n")}\n`;
}
