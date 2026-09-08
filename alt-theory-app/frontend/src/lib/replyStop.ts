import type { TranscriptMessage } from "@/api/types";
import { t } from "@/i18n";

/**
 * The one line under a stopped or failed attempt (live and reload read the
 * same stop reason, set by the transcript builder). Aborted and error
 * messages are filtered from the model's context as a whole; a length cut
 * keeps everything — the model just ran out of room to finish.
 */
export function replyStopLine(
  stopReason: TranscriptMessage["stopReason"] | undefined,
): string | null {
  if (stopReason === "aborted") return t("Stopped. The model can't see this output.");
  if (stopReason === "error") return t("The reply failed. The model can't see this output.");
  if (stopReason === "length") {
    return t("Cut off here: the reply was too long. The model can see this part.");
  }
  return null;
}

/** Live only: the attempt Pi just dropped on auto-retry, before its replacement streams. */
export function retryDroppedLine(): string {
  return t("The previous attempt failed. The model can't see that output.");
}
