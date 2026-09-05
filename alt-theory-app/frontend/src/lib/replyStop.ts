import type { TranscriptMessage } from "@/api/types";
import { t } from "@/i18n";

/**
 * The one line under a text block that did not finish (live and reload read
 * the same two fields, set by the transcript builder). It speaks only about
 * the text above it: what stopped it, and whether the model still sees it.
 */
export function replyStopLine(
  stopReason: TranscriptMessage["stopReason"] | undefined,
  kept: boolean | undefined,
): string | null {
  if (stopReason === "aborted") return t("Stopped here. The model can see this part.");
  if (stopReason === "error") {
    return kept
      ? t("Failed here. The model can see this part.")
      : t("Failed here. This part was not sent to the model.");
  }
  if (stopReason === "length") {
    return kept
      ? t("Cut off here: the reply was too long. The model can see this part.")
      : t("Cut off here: the reply was too long. This part was not sent to the model.");
  }
  return null;
}
