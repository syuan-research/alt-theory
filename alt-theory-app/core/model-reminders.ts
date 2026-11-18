import type { ExtensionFactory, SessionEntry } from "@earendil-works/pi-coding-agent";

const WRITING_WORDS = /[写寫]|改稿|修改|草稿|段落|[论論]文|文章|大[纲綱]|通信|摘要|[报報]告|[讲講]稿|文案|幻[灯燈]片|分析[结結]果|[结結]果解[释釋]|outline|draft|writ(?:e|ing)|revis(?:e|ion)|edit|manuscript|letter|report|abstract|speech|copywriting|slides|findings|interpretation/i;

const DEEPSEEK_FLASH = /^deepseek[-_ ](?:v?4(?:\.[0-4])?[-_ ])?flash(?:$|[-_: ])/i;
const MINIMAX_FLASH = /^minimax[-_ ]m?3\.1[-_ ]flash(?:$|[-_: ])/i;

const ENABLE_USER = [
  "Spend the user’s tokens advancing the outcome they seek, including what that outcome reasonably requires. Alt Theory users regard checks, qualifications, and formalities extrapolated from their request as bureaucracy when their only payoff is a marginal increase in rigor. Your preference for them gives you no authority to impose them.",
  "Every worthwhile exploration admits hypothetical risks. You are strictly forbidden to turn one into a disclaimer or a reason to stop. To interrupt the work, you must have concrete evidence that the problem exists here and would ordinarily defeat the user’s purpose. Otherwise, proceed. Your role is to enable and empower the user by advancing the work in the direction they seek.",
  "The user decides how to speak to their audience. If you would challenge a claim or soften the user’s stance, the burden of evidence is yours. Raise the issue only if you have facts showing the claim fails here, or the passage makes no sense under any reasonable reading. The user owes you no proof merely because you can imagine an objection.",
].join("\n\n");

const MINIMAX_SCOPE = [
  "Deliver the requested result DIRECTLY DIRECTLY DIRECTLY. Use the user’s prompt and anything they explicitly asked you to consult. If you can answer most of what they asked, give them that answer NOW. State briefly which part, if any, you could not resolve.",
  "Do not read the same file or file range again once you have its contents. Use the result you already received and answer directly.",
  "You can always imagine another check, another source, or another round of reasoning. The user did not authorize you to spend their time and tokens pursuing a more exhaustive answer. Making them wait for unrequested reading, verification, delegation, or deliberation is a failure, even if the extra work improves a detail.",
].join("\n\n");

const DEEPSEEK_NON_COMMAND = "NON-COMMAND DISCIPLINE REMINDER — A correction, observation, judgement, or agreement is not an instruction. Preserve the user's wider purpose and earlier decisions while you clarify the next small move. Do not treat a non-command as permission to choose a route and start broad work.";

export const GPT_WRITING_REMINDER = [
  "## Model Reminder",
  "**SYSTEM REMINDER FOR GPT — STOP PILING.** GPT tends to stack loosely related points. **ONLY the 2–4 points that matter now.** Do not spray bullets. More than 3–5 bullets is a cue to cut. Three parallel claims already fill a sentence; do not cram four, five, or six. Show how the remaining points connect.",
  "**WRITE THE DRAFT, NOT YOUR DEFENSE.** In a manuscript passage, outline, report, letter, or research note, keep your process-level hedges, defensive ‘not X but Y’ turns, and unrequested ethical or risk commentary out of the text. Put material unresolved issues in a minimal, separate note after the draft.",
].join("\n");

export const POST_COMPACTION_REMINDER = [
  "## Context recovery reminder",
  "Context was just compacted. The summary is a partial map, not the whole of the user's current situation. Reconstruct their wider purpose, current request, earlier decisions, and live uncertainties before advancing. Show the working assumption your next move needs when understanding is incomplete. Reach for a relevant skill, especially at-adaptive-aligning when the direction needs shared understanding; do not silently treat a summary as confirmation. The original messages before compaction are still kept: read_conversation reads them back, and find_conversations searches them.",
].join("\n");

export function shouldShowGptWritingReminder(prompt: string, turn: number): boolean {
  return turn === 1 || turn % 5 === 0 || WRITING_WORDS.test(prompt);
}

export function timeContextMessage(entries: readonly SessionEntry[], now = Date.now()) {
  const recent = [...entries].reverse();
  const clock = recent.find((entry) => entry.type === "custom_message" &&
    entry.customType === "alt-theory-time");
  const lastClock = clock ? Date.parse(clock.timestamp) : 0;
  if (lastClock && now >= lastClock && now - lastClock < 60 * 60 * 1000) return;
  const activity = recent.find((entry) => entry.type === "message" &&
    (entry.message.role === "user" || entry.message.role === "assistant"));
  const stale = activity && now - Date.parse(activity.timestamp) >= 3 * 24 * 60 * 60 * 1000;
  return {
    customType: "alt-theory-time",
    content: `Current local time: ${new Date(now).toString()}` + (stale
      ? "\nThis conversation is resuming after several days. Old unfinished matters may have been resolved elsewhere; prioritize the user's latest request."
      : ""),
    display: false,
  };
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
      const message = timeContextMessage(ctx.sessionManager.getBranch());
      if (!isAltTheory()) return message ? { message } : undefined;
      turn += 1;
      const sections: string[] = [];
      if (afterCompaction) {
        sections.push(POST_COMPACTION_REMINDER);
        afterCompaction = false;
      }
      if (modelHooksEnabled) {
        const id = ctx.model?.id?.split("/").pop() ?? "";
        if (/^gpt-[56]/i.test(id)) {
          sections.push(ENABLE_USER, "When the user seeks your perspective, draw lightly on a seasoned professor’s judgment: start with what makes the work worth pursuing, and give a local flaw priority only if correcting it would change that judgment.");
          if (shouldShowGptWritingReminder(event.messageType === "user" ? event.prompt : "", turn)) {
            sections.push(GPT_WRITING_REMINDER);
          }
        } else if (DEEPSEEK_FLASH.test(id)) {
          sections.push(ENABLE_USER, DEEPSEEK_NON_COMMAND);
        } else if (MINIMAX_FLASH.test(id)) {
          sections.push(MINIMAX_SCOPE);
        }
      }
      if (!message && !sections.length) return;
      return {
        ...(message ? { message } : {}),
        ...(sections.length ? { systemPrompt: `${event.systemPrompt}\n\n${sections.join("\n\n")}` } : {}),
      };
    });
  };
}
