export interface QuickFindField {
  text: string | null | undefined;
  weight: number;
}

export function quickFindTerms(query: string): string[] {
  return query.trim().toLocaleLowerCase().replace(/\\/g, "/").split(/\s+/)
    .map((term) => /^[a-z]:\//.test(term) || term.startsWith("/") ? term.split("/").filter(Boolean).at(-1) ?? "" : term)
    .filter(Boolean);
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
