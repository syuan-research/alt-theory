import type { Lang } from "@/i18n";
import { currentLang } from "@/i18n";
import zhHans from "@/i18n/zh-Hans";
import zhHant from "@/i18n/zh-Hant-HK";

export type TipCondition =
  | { kind: "general" }
  | { kind: "after-action"; action: "branch" | "retry" };

export interface ProductTip {
  id: string;
  condition: TipCondition;
  text: Record<Lang, string>;
}

const localized = (en: string): Record<Lang, string> => ({
  en,
  "zh-Hans": zhHans[en] ?? en,
  "zh-Hant-HK": zhHant[en] ?? en,
});

const general: ProductTip[] = [
  { id: "repeat-question", condition: { kind: "general" }, text: localized("Ask the same question again to see what stays put and what was just one framing.") },
  { id: "edit-question", condition: { kind: "general" }, text: localized("Edit an earlier question of yours — the answer often moves more than you'd expect, and this conversation stays whole.") },
  { id: "adjust-model-role", condition: { kind: "general" }, text: localized("When you edit a question, “Adjust model or role…” asks it again under a different model or role and compares.") },
  { id: "branch-reading", condition: { kind: "general" }, text: localized("Branch from any answer to follow a second reading without losing the first.") },
  { id: "align-first", condition: { kind: "general" }, text: localized("Say “align with me first” before a big piece of work and Alt interviews you instead of guessing.") },
  { id: "plan-record", condition: { kind: "general" }, text: localized("Ask for a plan record when the work spans days — decisions written there survive compaction.") },
  { id: "read-vs-infer", condition: { kind: "general" }, text: localized("Ask “what did you actually read?” — Alt separates what it found from what it inferred.") },
  { id: "state-question-back", condition: { kind: "general" }, text: localized("Not sure it understood? Ask it to state the question back before answering.") },
  { id: "stop-keeps-work", condition: { kind: "general" }, text: localized("Stop a long answer any time; what finished is kept, not thrown away.") },
  { id: "attach-file", condition: { kind: "general" }, text: localized("Attach a file from the toolbox and ask Alt to work from it rather than from memory.") },
  { id: "switch-model", condition: { kind: "general" }, text: localized("Switch models mid-conversation from the model chip — the conversation continues.") },
  { id: "knowledge-set", condition: { kind: "general" }, text: localized("Pick a knowledge set above the composer to ground answers in your own material.") },
  { id: "role", condition: { kind: "general" }, text: localized("A role changes who Alt speaks as; you can change or clear it at any point.") },
  { id: "btw", condition: { kind: "general" }, text: localized("BTW opens a side question that doesn't clutter this conversation.") },
  { id: "helper", condition: { kind: "general" }, text: localized("Open Helper from Help or Related — it answers from the current documentation, in its own conversation.") },
  { id: "work-mode", condition: { kind: "general" }, text: localized("In Work mode Alt can act in your working folders; boundary crossings still ask you first.") },
  { id: "understand-mode", condition: { kind: "general" }, text: localized("Understand mode keeps Alt to what you brought into the conversation.") },
  { id: "compact", condition: { kind: "general" }, text: localized("If a conversation gets long, /compact summarizes the early turns and shows you the summary.") },
  { id: "handoff", condition: { kind: "general" }, text: localized("Ask for a summary or handoff note and it lands as a file you can share.") },
  { id: "deny-approval", condition: { kind: "general" }, text: localized("Denying an approval is safe — Alt takes another route or says what it can't do.") },
  { id: "citations", condition: { kind: "general" }, text: localized("Alt would rather say it can't verify something than invent a citation.") },
  { id: "delegate", condition: { kind: "general" }, text: localized("Long answers can be delegated: Alt can hand a bounded piece to a subagent and keep going.") },
  { id: "message-subagent", condition: { kind: "general" }, text: localized("You can message a subagent directly while it runs — it sees you at its next step.") },
];

export const PRODUCT_TIPS: ProductTip[] = [
  ...general,
  {
    id: "after-branch",
    condition: { kind: "after-action", action: "branch" },
    text: localized("Both takes are kept — the branch is in Related conversations on the right."),
  },
  {
    id: "after-retry",
    condition: { kind: "after-action", action: "retry" },
    text: localized("Same question, fresh answer. What repeats is probably solid; what changes was a choice."),
  },
];

export const GENERAL_TIPS = PRODUCT_TIPS.filter(
  (tip) => tip.condition.kind === "general",
);

export function productTipText(tip: ProductTip, lang = currentLang()): string {
  return tip.text[lang];
}

export function actionTipText(action: "branch" | "retry"): string {
  const tip = PRODUCT_TIPS.find(
    (item) =>
      item.condition.kind === "after-action" &&
      item.condition.action === action,
  );
  return tip ? productTipText(tip) : "";
}
