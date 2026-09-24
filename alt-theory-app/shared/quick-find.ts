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

/** File lists search names by default; a slash makes the query a path tail. */
export function parseFileQuery(query: string): { terms: string[]; path: boolean } {
  const text = query.trim().replace(/^"(.*)"$/s, "$1").trim().toLocaleLowerCase().replace(/\\/g, "/");
  const path = text.includes("/");
  return { terms: path ? text.split("/").filter(Boolean) : text.split(/\s+/).filter(Boolean), path };
}

export function fileQueryScore(query: ReturnType<typeof parseFileQuery>, name: string, fullPath: string): number {
  if (!query.terms.length) return 0;
  if (!query.path) return quickFindScore(query.terms, [{ text: name, weight: 10 }]);
  const parts = fullPath.toLocaleLowerCase().replace(/\\/g, "/").split("/").filter(Boolean);
  if (parts.length < query.terms.length) return 0;
  let score = 0;
  for (let i = 0; i < query.terms.length; i += 1) {
    const part = parts[parts.length - query.terms.length + i];
    const term = query.terms[i];
    const at = part.indexOf(term);
    if (at < 0) return 0;
    score += part === term ? 30 : at === 0 ? 20 : 10;
  }
  return score;
}
