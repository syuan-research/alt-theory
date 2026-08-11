import type { SessionSummary } from "@/api/types";

export function approvalTarget(
  sessionId: string,
  sessions: SessionSummary[],
): { center: string; related?: string } {
  const session = sessions.find((item) => item.sessionId === sessionId);
  const parent = session?.forkedFrom;
  if (
    parent &&
    (parent.purpose === "side" ||
      parent.purpose === "helper" ||
      parent.purpose === "subagent")
  ) {
    return { center: parent.sessionId, related: sessionId };
  }
  return { center: sessionId };
}
