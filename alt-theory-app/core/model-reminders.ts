import type { ExtensionFactory } from "@earendil-works/pi-coding-agent";

const WRITING_WORDS = /写|改稿|修改|草稿|段落|论文|文章|大纲|通信|写作|outline|draft|writ(?:e|ing)|revis(?:e|ion)|edit|manuscript|letter|report/i;

export const GPT_WRITING_REMINDER = [
  "## Model Reminder",
  "**SYSTEM REMINDER FOR GPT — STOP PILING.** GPT tends to stack loosely related points. **ONLY the 2–4 points that matter now.** Do not spray bullets. More than 3–5 bullets is a cue to cut. Three parallel claims already fill a sentence; do not cram four, five, or six. Show how the remaining points connect.",
  "**WRITE THE DRAFT, NOT YOUR DEFENSE.** In a manuscript passage, outline, report, letter, or research note, keep your process-level hedges, defensive ‘not X but Y’ turns, and unrequested ethical or risk commentary out of the text. Preserve qualifications required by the evidence. Put material unresolved issues in a minimal, separate note after the draft.",
  "For substantial text the user wants to use, offer a low- or medium-effort subagent review when density or structure remains hard to judge and a subagent is available. Do not turn ordinary exploratory chat into a review workflow.",
].join("\n");

export const POST_COMPACTION_REMINDER = [
  "## Context recovery reminder",
  "Context was just compacted. The summary is a partial map, not the whole of the user's current situation. Reconstruct their wider purpose, current request, earlier decisions, and live uncertainties before advancing. Show the working assumption your next move needs when understanding is incomplete. Reach for a relevant skill, especially adaptive-aligning when the direction needs shared understanding; do not silently treat a summary as confirmation.",
].join("\n");

export function shouldShowGptWritingReminder(prompt: string, turn: number): boolean {
  return turn === 1 || turn % 5 === 0 || WRITING_WORDS.test(prompt);
}

export function createModelRemindersExtension(
  isAltTheory: () => boolean,
  modelHooksEnabled: boolean,
): ExtensionFactory {
  return (pi) => {
    let turn = 0;
    let afterCompaction = false;

    pi.on("session_compact", () => {
      afterCompaction = true;
    });

    pi.on("before_agent_start", (event, ctx) => {
      if (!isAltTheory()) return;
      turn += 1;
      const sections: string[] = [];
      if (afterCompaction) {
        sections.push(POST_COMPACTION_REMINDER);
        afterCompaction = false;
      }
      if (
        modelHooksEnabled &&
        /^gpt-[56]/i.test(ctx.model?.id ?? "") &&
        shouldShowGptWritingReminder(event.prompt, turn)
      ) {
        sections.push(GPT_WRITING_REMINDER);
      }
      return sections.length
        ? { systemPrompt: `${event.systemPrompt}\n\n${sections.join("\n\n")}` }
        : undefined;
    });
  };
}
