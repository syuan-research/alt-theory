import type { TranscriptMessage } from "@/api/types";
import { t } from "@/i18n";
import { toolOutcome } from "@/lib/toolOutcome";
import { toolLabel } from "@/lib/tools";
import { selectRows, viewToMarkdown } from "@/lib/sessionView";

/** The download: localized labels, the tool line the conversation shows,
 *  thinking kept, tool results left out. */
export function sessionTranscriptToMarkdown(
  title: string,
  transcript: TranscriptMessage[],
): string {
  const { rows } = selectRows(transcript, {
    kinds: ["user", "assistant", "thinking", "tool", "mail", "system"],
  });
  return viewToMarkdown(title, rows, {
    labels: {
      conversation: t("Conversation"),
      user: t("You"),
      assistant: t("Alt"),
      thinking: t("Thinking complete"),
      answer: t("Answer"),
      tool: t("Tool"),
    },
    toolLine: (row) =>
      toolLabel(
        row.toolName || row.text || "tool",
        row.toolPath,
        row.toolDetail,
        toolOutcome({ success: row.success }),
      ),
  });
}

export function markdownFileName(title: string): string {
  const safe = title
    .trim()
    .replace(/[<>:"/\\|?*\x00-\x1f]/g, "-")
    .replace(/[. ]+$/g, "")
    .slice(0, 100);
  return `${safe || "conversation"}.md`;
}

export function downloadMarkdown(fileName: string, markdown: string): void {
  const url = URL.createObjectURL(
    new Blob([markdown], { type: "text/markdown;charset=utf-8" }),
  );
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  link.hidden = true;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}
