/**
 * Conversation-list membership — the ONE predicate, imported by both trees
 * (the backend reads this file directly, so keep it free of `@/` imports).
 * Roots are members (a delisted root stays one, demoted); branches and
 * other children only when the user listed them
 * (alpha.6 — they keep their purpose so the row can say where they came
 * from). Everything else is reachable from its parent's panel.
 */
export interface ListMemberInput {
  forkedFrom?: { purpose: string; listed?: boolean } | null;
}

export function isListMember(session: ListMemberInput): boolean {
  const fork = session.forkedFrom;
  if (!fork) return true;
  return fork.purpose === "fork" || fork.listed === true;
}
