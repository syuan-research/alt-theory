import type { ConversationState as State } from "@/lib/listActivity";
import { t } from "@/i18n";

export function ConversationState({ state }: { state: State | null }) {
  if (!state || state === "running") return null;
  const appearance = {
    approval: { icon: "ph-shield-check", tone: "warn", title: t("Waiting for your approval before it can continue") },
    failed: { icon: "ph-warning", tone: "danger", title: t("This conversation ran into an error") },
    done: { icon: "ph-check", tone: "ok", title: t("Finished while you were elsewhere") },
  }[state];
  return <span className={`conversation-state ${appearance.tone}`} data-tip={appearance.title} aria-label={appearance.title}>
    <i className={`ph ${appearance.icon}`} aria-hidden="true" />
  </span>;
}
