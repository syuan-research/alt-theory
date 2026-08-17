import type { TranscriptMessage } from "@/api/types";
import { t } from "@/i18n";
import { toolLabel } from "@/lib/tools";

function quote(text: string): string {
  return text.split("\n").map((line) => `> ${line}`).join("\n");
}

export function sessionTranscriptToMarkdown(
  title: string,
  transcript: TranscriptMessage[],
): string {
  const sections = [`# ${title.trim().replace(/\s+/g, " ") || t("Conversation")}`];
  const renderedToolCalls = new Set<string>();
  const toolStates = new Map(
    transcript
      .filter((message) => message.toolType === "result" && message.toolCallId)
      .map((message) => [
        message.toolCallId!,
        message.success === false ? "failed" as const : "finished" as const,
      ]),
  );

  for (const message of transcript) {
    const text = message.text.trim();
    if (message.role === "user" && text) {
      sections.push(`## ${t("You")}\n\n${text}`);
    } else if (message.role === "assistant" && (message.thinking?.trim() || text)) {
      const parts = [`## ${t("Alt")}`];
      if (message.thinking?.trim()) {
        parts.push(`### ${t("Thinking")}\n\n${message.thinking.trim()}`);
      }
      if (text) parts.push(`### ${t("Answer")}\n\n${text}`);
      sections.push(parts.join("\n\n"));
    } else if (message.role === "tool" && message.toolType !== "result") {
      if (message.toolCallId && renderedToolCalls.has(message.toolCallId)) continue;
      if (message.toolCallId) renderedToolCalls.add(message.toolCallId);
      sections.push(
        `> **${t("Tool")}:** ${toolLabel(
          message.toolName || message.text || "tool",
          message.toolPath,
          message.toolDetail,
          message.toolCallId ? toolStates.get(message.toolCallId) : undefined,
        )}`,
      );
    } else if (message.role === "system" && text) {
      sections.push(quote(text));
    }
  }

  return `${sections.join("\n\n---\n\n")}\n`;
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
