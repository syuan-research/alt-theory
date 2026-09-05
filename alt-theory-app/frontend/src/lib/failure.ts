import type { Failure } from "@/api/types";
import { t } from "@/i18n";

/**
 * The one renderer for the failure envelope (card 2): plain words for the
 * kind, the producer's own text beside it for diagnosis.
 */
export function failureText(failure: Failure): string {
  const wording = {
    network: t("Could not reach the provider (network)."),
    "auth-refresh": t("OAuth login could not be refreshed. Open Settings → Models and reconnect this account."),
    auth: t("The provider rejected the credentials."),
    "rate-limit": t("The provider is limiting requests."),
    provider: t("The provider returned an error."),
    busy: t("The conversation is still running."),
    aborted: t("Stopped."),
    not_found: "",
    unknown: "",
  }[failure.kind];
  if (!wording) return failure.message;
  // Busy is the kind wording only: the producer text is "Session is busy: <id>".
  if (failure.kind === "busy" || failure.kind === "auth-refresh") return wording;
  return failure.message ? `${wording} ${failure.message}` : wording;
}

/**
 * A refusal because the turn is still running is not a run outcome: the run
 * goes on and the client must not flip to not-running (cards 1 and 2).
 */
export function isBusyRefusal(failure: Failure): boolean {
  return failure.kind === "busy";
}
