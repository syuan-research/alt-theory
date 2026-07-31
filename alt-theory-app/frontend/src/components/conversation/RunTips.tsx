import { useEffect, useState } from "react";
import { t } from "@/i18n";

/**
 * Tips above the composer while a turn runs (alpha.6). Waiting is when a user
 * has attention to spare, so this is where the app says what it can do — but
 * only things that already exist and that the user drives themselves. Nothing
 * here describes behavior that switches itself on.
 */
const GENERAL_TIPS = (): string[] => [
  t("Ask the same question again to see what stays put and what was just one framing."),
  t("Edit an earlier question of yours — the answer often moves more than you'd expect, and this conversation stays whole."),
  t("Branch from any answer to follow a second reading without losing the first."),
  t("Say “align with me first” before a big piece of work and Alt interviews you instead of guessing."),
  t("Ask for a plan record when the work spans days — decisions written there survive compaction."),
  t("Ask “what did you actually read?” — Alt separates what it found from what it inferred."),
  t("Not sure it understood? Ask it to state the question back before answering."),
  t("Stop a long answer any time; what finished is kept, not thrown away."),
  t("Attach a file from the toolbox and ask Alt to work from it rather than from memory."),
  t("Switch models mid-conversation from the model chip — the conversation continues."),
  t("Pick a knowledge set above the composer to ground answers in your own material."),
  t("A role changes who Alt speaks as; you can change or clear it at any point."),
  t("BTW opens a side question that doesn't clutter this conversation."),
  t("Ask how Alt works from the toolbox — it answers from the current documentation, in its own conversation."),
  t("In Work mode Alt can act in your working folders; boundary crossings still ask you first."),
  t("Understand mode keeps Alt to what you brought into the conversation."),
  t("If a conversation gets long, /compact summarizes the early turns and shows you the summary."),
  t("Ask for a summary or handoff note and it lands as a file you can share."),
  t("Denying an approval is safe — Alt takes another route or says what it can't do."),
  t("Alt would rather say it can't verify something than invent a citation."),
  t("Long answers can be delegated: Alt can hand a bounded piece to a subagent and keep going."),
  t("You can message a subagent directly while it runs — it sees you at its next step."),
];

/** Shown right after the action that produced it, then rotation takes over. */
export const SITUATIONAL_TIPS = {
  branch: () =>
    t("Both takes are kept — the branch is in Related conversations on the right."),
  retry: () =>
    t("Same question, fresh answer. What repeats is probably solid; what changes was a choice."),
};

const FIRST_DELAY_MS = 2000;
/** Owner: +3s so tips are readable while a turn runs (was 7s). */
const ROTATE_MS = 10000;

export function RunTips({
  running,
  seedTip,
}: {
  running: boolean;
  seedTip?: string | null;
}) {
  const [index, setIndex] = useState(0);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!running) {
      setVisible(false);
      return;
    }
    // Short turns should not flash a tip at all.
    const start = window.setTimeout(() => {
      setIndex(Math.floor(Math.random() * GENERAL_TIPS().length));
      setVisible(true);
    }, FIRST_DELAY_MS);
    return () => window.clearTimeout(start);
  }, [running]);

  useEffect(() => {
    if (!visible) return;
    const timer = window.setInterval(() => {
      setIndex((current) => (current + 1) % GENERAL_TIPS().length);
    }, ROTATE_MS);
    return () => window.clearInterval(timer);
  }, [visible]);

  const text = seedTip ?? (visible ? GENERAL_TIPS()[index] : null);
  if (!text) return null;

  // Stable key: remounting on every tip change re-ran tip-in and could nudge
  // the composer-notes band. Swap text in place instead.
  return (
    <span className="run-tip">
      <i className="ph ph-lightbulb" aria-hidden="true" />
      {text}
    </span>
  );
}
