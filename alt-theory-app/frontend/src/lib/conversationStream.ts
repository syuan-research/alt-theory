import type {
  ActiveToolState,
  ServerMessage,
  StreamPart,
} from "@/api/types";
import { t } from "@/i18n";
import { toolLabel } from "@/lib/tools";

export interface ConversationStreamControls {
  activeTools: { current: Record<string, ActiveToolState> };
  setParts: (update: (parts: StreamPart[]) => StreamPart[]) => void;
  setPhaseLabel: (label: string) => void;
}

function appendText(
  parts: StreamPart[],
  kind: "thinking" | "text",
  delta: string,
): StreamPart[] {
  const last = parts.at(-1);
  return last?.kind === kind
    ? [...parts.slice(0, -1), { kind, text: last.text + delta }]
    : [...parts, { kind, text: delta }];
}

function upsertTool(parts: StreamPart[], tool: ActiveToolState): StreamPart[] {
  const index = parts.findIndex(
    (part) => part.kind === "tool" && part.tool.callId === tool.callId,
  );
  return index === -1
    ? [...parts, { kind: "tool", tool }]
    : parts.map((part, item) =>
        item === index ? { kind: "tool" as const, tool } : part,
      );
}

/** Shared live-event projection for center and Related conversations. */
export function handleConversationStreamMessage(
  message: ServerMessage,
  controls: ConversationStreamControls,
): boolean {
  const { activeTools, setParts, setPhaseLabel } = controls;
  switch (message.type) {
    case "assistant_delta":
      setPhaseLabel("");
      setParts((parts) => appendText(parts, "text", message.payload.text));
      return true;
    case "thinking_delta":
      setParts((parts) => appendText(parts, "thinking", message.payload.text));
      return true;
    case "tool_started": {
      const { toolName, callId, path, detail } = message.payload;
      const tool: ActiveToolState = {
        callId,
        toolName,
        path,
        detail,
        status: "running",
      };
      activeTools.current[callId] = tool;
      setParts((parts) => upsertTool(parts, tool));
      setPhaseLabel(toolLabel(toolName, path, detail, "running"));
      return true;
    }
    case "tool_updated": {
      const current = activeTools.current[message.payload.callId];
      if (!current) return true;
      const tool = { ...current, progressText: message.payload.text };
      activeTools.current[message.payload.callId] = tool;
      setParts((parts) => upsertTool(parts, tool));
      if (message.payload.text) {
        setPhaseLabel(
          `${toolLabel(current.toolName, current.path, current.detail, "running")} — ${message.payload.text}`,
        );
      }
      return true;
    }
    case "tool_finished": {
      const current = activeTools.current[message.payload.callId];
      if (current) {
        const tool: ActiveToolState = {
          ...current,
          status: message.payload.success ? "finished" : "failed",
          success: message.payload.success,
        };
        const remaining = { ...activeTools.current };
        delete remaining[message.payload.callId];
        activeTools.current = remaining;
        setParts((parts) => upsertTool(parts, tool));
      }
      if (Object.keys(activeTools.current).length === 0) {
        setPhaseLabel(t("Processing…"));
      }
      return true;
    }
    case "run_phase": {
      const retry = message.payload.retry;
      if (message.payload.phase === "retrying" && retry) {
        setPhaseLabel(
          t("Connection issue — retrying ({attempt}/{maxAttempts})…", {
            attempt: retry.attempt,
            maxAttempts: retry.maxAttempts,
          }),
        );
        setParts((parts) =>
          parts.length === 0 || parts.at(-1)?.kind === "notice"
            ? parts
            : [
                ...parts,
                {
                  kind: "notice",
                  text: t("Connection dropped — continuing from where it left off"),
                },
              ],
        );
        return true;
      }
      setPhaseLabel(
        {
          connecting: t("Connecting…"),
          processing: t("Processing…"),
          thinking: t("Thinking…"),
          tool: t("Using a tool…"),
          compacting: t("Compacting conversation…"),
          retrying: t("Connection issue — retrying…"),
          "awaiting-user": t("Waiting for your approval…"),
          idle: "",
          error: "",
        }[message.payload.phase],
      );
      return true;
    }
    default:
      return false;
  }
}
