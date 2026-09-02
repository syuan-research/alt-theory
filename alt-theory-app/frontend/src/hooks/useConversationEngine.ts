import { useCallback, useRef, useState } from "react";
import type {
  ActiveToolState,
  ApprovalRequestPayload,
  Failure,
  ServerMessage,
  SessionSnapshot,
  StreamPart,
  TranscriptMessage,
  TurnRecovery,
} from "@/api/types";
import { handleConversationStreamMessage } from "@/lib/conversationStream";

export interface ConversationEngineOptions {
  /** Center/child extras after the shared core handling (queue flush, refreshes …). */
  onRunCompleted?: (payload: SessionSnapshot) => void;
  onRunFailed?: (payload: {
    failure: Failure;
    canRetry?: boolean;
    recovery?: TurnRecovery | null;
  }) => void;
  onTranscript?: (messages: TranscriptMessage[]) => void;
}

/**
 * The ONE conversation engine (v1.4.3, owner ruling): message + stream +
 * approval state and their server-message handling, shared by the center
 * conversation (AppProvider) and the right-pane ChildConversation. Pane
 * -specific behavior stays in the pane, wired through the options
 * callbacks — never duplicate these transitions per pane again.
 */
export function useConversationEngine(options?: ConversationEngineOptions) {
  const [messages, setMessages] = useState<TranscriptMessage[]>([]);
  const [streamParts, setStreamParts] = useState<StreamPart[]>([]);
  const [running, setRunning] = useState(false);
  const [phaseLabel, setPhaseLabel] = useState("");
  const [approvals, setApprovals] = useState<ApprovalRequestPayload[]>([]);
  const activeToolsRef = useRef<Record<string, ActiveToolState>>({});
  const optionsRef = useRef(options);
  optionsRef.current = options;

  const clearStream = useCallback(() => {
    setStreamParts([]);
    activeToolsRef.current = {};
  }, []);

  /** Returns true when the message was conversation-scoped and consumed. */
  const handleMessage = useCallback(
    (message: ServerMessage): boolean => {
      if (
        handleConversationStreamMessage(message, {
          activeTools: activeToolsRef,
          setParts: setStreamParts,
          setPhaseLabel,
        })
      ) {
        setRunning(
          message.type !== "run_phase" ||
            (message.payload.phase !== "idle" && message.payload.phase !== "error"),
        );
        return true;
      }
      switch (message.type) {
        case "approval_snapshot":
          setApprovals(message.payload);
          return true;
        case "session_transcript":
          setMessages(message.payload.messages);
          clearStream();
          optionsRef.current?.onTranscript?.(message.payload.messages);
          return true;
        case "run_completed":
          setRunning(false);
          clearStream();
          setPhaseLabel("");
          optionsRef.current?.onRunCompleted?.(message.payload);
          return true;
        case "run_failed":
          setRunning(false);
          clearStream();
          setPhaseLabel("");
          optionsRef.current?.onRunFailed?.(message.payload);
          return true;
        case "user_steered":
          // Server-broadcast bubble (senders do NOT append optimistically).
          setMessages((current) => [
            ...current,
            { role: "user", text: message.payload.text, timestamp: null },
          ]);
          return true;
        case "approval_requested":
          setApprovals((prev) =>
            prev.some((entry) => entry.approvalId === message.payload.approvalId)
              ? prev
              : [...prev, message.payload],
          );
          return true;
        case "approval_resolved":
          setApprovals((prev) =>
            prev.filter(
              (entry) => entry.approvalId !== message.payload.approvalId,
            ),
          );
          return true;
        default:
          return false;
      }
    },
    [clearStream],
  );

  return {
    messages,
    setMessages,
    streamParts,
    setStreamParts,
    running,
    setRunning,
    phaseLabel,
    setPhaseLabel,
    approvals,
    setApprovals,
    activeToolsRef,
    clearStream,
    handleMessage,
  };
}
