export type ToolOutcome = "running" | "finished" | "failed" | "pending";

/**
 * One reading of a tool row's state, for the streaming row, the stored row
 * and the Markdown export alike (v1.5.1 M1 rule 2: live and reload derive
 * the same way). A call with no result — Pi never runs the calls of an
 * aborted or failed message — is "pending": neither a success nor a failure
 * of the tool itself.
 */
export function toolOutcome(input: { running?: boolean; success?: boolean }): ToolOutcome {
  if (input.running) return "running";
  if (input.success === true) return "finished";
  if (input.success === false) return "failed";
  return "pending";
}
