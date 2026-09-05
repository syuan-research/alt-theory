export type ToolOutcome = "running" | "finished" | "failed";

/**
 * One reading of a tool row's state, for the streaming row and the stored
 * row alike (v1.5.1 M1 rule 2: live and reload derive the same way).
 */
export function toolOutcome(input: { running?: boolean; success?: boolean }): ToolOutcome {
  if (input.running) return "running";
  return input.success === false ? "failed" : "finished";
}
