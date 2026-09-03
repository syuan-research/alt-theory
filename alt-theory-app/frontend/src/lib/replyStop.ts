import type { TranscriptMessage } from "@/api/types";
import { t } from "@/i18n";

/**
 * The one line under a reply that did not finish, by Pi's stored stopReason
 * (live and after reload read the same field). `aborted` = the user stopped
 * it and the partial stays in the model's context; `error` = the provider
 * failed and Pi drops the partial from the model's context (kept in history).
 */
export function replyStopLine(stopReason: TranscriptMessage["stopReason"] | undefined): string | null {
  if (stopReason === "aborted") return t("Stopped here. The model keeps this part.");
  if (stopReason === "error") return t("Failed here. The model does not keep this part.");
  return null;
}
