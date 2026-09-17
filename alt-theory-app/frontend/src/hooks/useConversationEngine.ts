import { useCallback, useRef, useState, type Dispatch, type SetStateAction } from "react";
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
import { fetchSessionDetail } from "@/api/sessions";
import { conversationSnapshotView } from "@/lib/runState";

export interface ConversationEngineOptions {
  /** Center/child extras after the shared core handling (queue flush, refreshes …). */
  onRunCompleted?: (payload: SessionSnapshot) => void;
  onRunFailed?: (payload: {
    failure: Failure;
    canRetry?: boolean;
    recovery?: TurnRecovery | null;
  }) => void;
  onTranscript?: (messages: TranscriptMessage[]) => void;
  onQueueRestored?: (payload: Extract<ServerMessage, { type: "queue_updated" }>["payload"]) => void;
}

/**
 * Per-conversation messages, stream, run, queue, recovery, and approvals,
 * shared by the center conversation and the right-pane ChildConversation.
 * Drafts, restored attachments, and pane layout remain with their owners.
 */
export function useConversationEngine(options?: ConversationEngineOptions) {
  const [messages, setMessageState] = useState<TranscriptMessage[]>([]);
  const [streamParts, setStreamParts] = useState<StreamPart[]>([]);
  const [running, setRunning] = useState(false);
  const [queuedTexts, setQueuedTexts] = useState<string[]>([]);
  const [recovery, setRecovery] = useState<TurnRecovery | null>(null);
  const [phaseLabel, setPhaseLabel] = useState("");
  const [approvals, setApprovals] = useState<ApprovalRequestPayload[]>([]);
  const activeToolsRef = useRef<Record<string, ActiveToolState>>({});
  const messageRevisionRef = useRef(0);
  const sessionIdRef = useRef<string | null>(null);
  const runningRef = useRef(false);
  const optionsRef = useRef(options);
  optionsRef.current = options;

  const setMessages = useCallback<Dispatch<SetStateAction<TranscriptMessage[]>>>(
    (update) => {
      messageRevisionRef.current++;
      setMessageState(update);
    },
    [],
  );

  const clearStream = useCallback(() => {
    setStreamParts([]);
    activeToolsRef.current = {};
  }, []);

  /** The server's snapshot is the run fact; anything but idle is a run. */
  const applySnapshot = useCallback((snapshot: SessionSnapshot) => {
    const { running: nextRunning, queuedTexts: nextQueue, recovery: nextRecovery } =
      conversationSnapshotView(snapshot);
    if (sessionIdRef.current !== snapshot.sessionId || runningRef.current !== nextRunning) {
      messageRevisionRef.current++;
    }
    sessionIdRef.current = snapshot.sessionId;
    runningRef.current = nextRunning;
    setRunning(nextRunning);
    setQueuedTexts(nextQueue);
    setRecovery(nextRecovery);
  }, []);

  const beginLocalRun = useCallback(() => {
    messageRevisionRef.current++;
    runningRef.current = true;
    setRunning(true);
    setRecovery(null);
  }, []);

  const beginLocalPrompt = useCallback((text: string) => {
    setMessages((current) => [...current, { role: "user", text, timestamp: null }]);
    beginLocalRun();
  }, [beginLocalRun, setMessages]);

  const dropQueuedText = useCallback((text: string) => {
    setQueuedTexts((current) => {
      const index = current.indexOf(text);
      return index < 0 ? current : [...current.slice(0, index), ...current.slice(index + 1)];
    });
  }, []);

  const refreshTranscript = useCallback(async (sessionId: string) => {
    const revision = messageRevisionRef.current;
    try {
      const detail = await fetchSessionDetail(sessionId);
      // A preceding run's REST response must not replace a newer live bubble.
      if (revision !== messageRevisionRef.current || sessionIdRef.current !== sessionId) return;
      if (Array.isArray(detail.transcript)) {
        setMessages(detail.transcript);
      }
    } catch {
      // WebSocket transcript and the next refresh remain available.
    }
  }, [setMessages]);

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
        const nextRunning = message.type !== "run_phase" ||
          (message.payload.phase !== "idle" && message.payload.phase !== "error");
        runningRef.current = nextRunning;
        setRunning(nextRunning);
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
          applySnapshot(message.payload);
          clearStream();
          setPhaseLabel("");
          optionsRef.current?.onRunCompleted?.(message.payload);
          return true;
        case "run_failed":
          runningRef.current = false;
          setRunning(false);
          setRecovery(message.payload.recovery ?? null);
          messageRevisionRef.current++;
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
        case "queue_updated":
          setQueuedTexts([...message.payload.steering, ...message.payload.followUp]);
          if (message.payload.restored?.length) {
            optionsRef.current?.onQueueRestored?.(message.payload);
          }
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
    [applySnapshot, clearStream, setMessages],
  );

  return {
    messages,
    setMessages,
    streamParts,
    setStreamParts,
    running,
    setRunning,
    beginLocalRun,
    beginLocalPrompt,
    queuedTexts,
    setQueuedTexts,
    dropQueuedText,
    recovery,
    setRecovery,
    refreshTranscript,
    applySnapshot,
    phaseLabel,
    setPhaseLabel,
    approvals,
    setApprovals,
    activeToolsRef,
    clearStream,
    handleMessage,
  };
}
