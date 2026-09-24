export interface QuickFindField {
  text: string | null | undefined;
  weight: number;
}

const isAbsolutePath = (text: string) => /^[a-z]:\//.test(text) || text.startsWith("/");
const lastSegment = (path: string) => path.split("/").filter(Boolean).at(-1) ?? "";

export function quickFindTerms(query: string): string[] {
  // Explorer's "Copy as path" wraps the path in quotes.
  const text = query.trim().replace(/^"(.*)"$/s, "$1").trim().toLocaleLowerCase().replace(/\\/g, "/");
  // A whole pasted path may contain spaces ("OneDrive - Org", "My Notes").
  if (isAbsolutePath(text)) return [lastSegment(text)].filter(Boolean);
  return text.split(/\s+/)
    .map((term) => isAbsolutePath(term) ? lastSegment(term) : term)
    .filter(Boolean);
}

/** The query names a path, so full folder paths may match (not just labels). */
export function isPathQuery(query: string): boolean {
  return /[\\/]/.test(query);
}

/** All words must occur, in any order and across any supplied fields. */
export function quickFindScore(terms: string[], fields: QuickFindField[]): number {
  if (!terms.length) return 0;
  const normalized = fields.map(({ text, weight }) => ({
    text: (text ?? "").toLocaleLowerCase().replace(/\\/g, "/"),
    weight,
  }));
  let total = 0;
  for (const term of terms) {
    let best = 0;
    for (const field of normalized) {
      const at = field.text.indexOf(term);
      if (at < 0) continue;
      const quality = field.text === term ? 3 : at === 0 ? 2 : 1;
      best = Math.max(best, field.weight * quality);
    }
    if (!best) return 0;
    total += best;
  }
  return total;
}
