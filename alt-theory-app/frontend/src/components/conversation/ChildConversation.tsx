import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ApprovalRequestPayload, ServerMessage, TranscriptMessage } from "@/api/types";
import { fetchSessionDetail } from "@/api/sessions";
import { useApp } from "@/context/AppProvider";
import { useWebSocket } from "@/hooks/useWebSocket";
import { isListMember } from "@/lib/sessionList";
import { t } from "@/i18n";
import { ApprovalDock } from "@/components/conversation/ApprovalDock";
import { AssistantBubble, TranscriptEntry } from "@/components/conversation/MessageList";

/**
 * A conversation other than the one in the center: a branch shown beside it for
 * comparison, a BTW/Helper side chat, or a subagent. Same bubbles, same
 * composer, same send button as the main conversation — only the width and the
 * header line differ. Per-message branching stays with the center conversation;
 * open this one from the list if you want to branch off it.
 */
export function ChildConversation({
  sessionId,
  variant = "panel",
  onClose,
}: {
  sessionId: string;
  /** @deprecated Only "panel" remains; center compare pane was removed (A/B uses Comparison/ArmSplit). */
  variant?: "panel" | "compare";
  onClose: () => void;
}) {
  const app = useApp();
  const [messages, setMessages] = useState<TranscriptMessage[]>([]);
  const [streaming, setStreaming] = useState("");
  const [draft, setDraft] = useState("");
  const [running, setRunning] = useState(false);
  const [status, setStatus] = useState(t("Connecting…"));
  const [error, setError] = useState("");
  const [approvals, setApprovals] = useState<ApprovalRequestPayload[]>([]);
  const [connected, setConnected] = useState(false);
  const messagesRef = useRef<HTMLDivElement>(null);
  const developer = app.transcriptView === "developer";

  const summary = app.sessions.find((item) => item.sessionId === sessionId);
  const purpose = summary?.forkedFrom?.purpose ?? "side";
  const inList = summary ? isListMember(summary) : true;

  const refreshTranscript = useCallback(async () => {
    const detail = await fetchSessionDetail(sessionId);
    setMessages(detail.transcript ?? []);
  }, [sessionId]);

  const onMessage = useCallback(
    (message: ServerMessage) => {
      switch (message.type) {
        case "session_transcript":
          setMessages(message.payload.messages);
          setStreaming("");
          setRunning(false);
          setStatus(t("Ready"));
          break;
        case "assistant_delta":
          setStreaming((current) => current + message.payload.text);
          setRunning(true);
          break;
        case "run_phase":
          setStatus({
            connecting: t("Connecting…"),
            processing: t("Processing…"),
            thinking: t("Thinking…"),
            tool: t("Using a tool…"),
            compacting: t("Compacting…"),
            retrying: t("Retrying…"),
            "awaiting-user": t("Waiting for approval…"),
            idle: t("Ready"),
            error: t("Error"),
          }[message.payload.phase]);
          break;
        case "run_completed":
          setRunning(false);
          setStreaming("");
          setStatus(t("Ready"));
          void refreshTranscript();
          void app.refreshSessions();
          break;
        case "run_failed":
          setRunning(false);
          setStreaming("");
          setError(message.payload.error);
          setStatus(t("Error"));
          void refreshTranscript();
          break;
        case "approval_requested":
          setApprovals((current) => [...current, message.payload]);
          break;
        case "approval_resolved":
          setApprovals((current) =>
            current.filter((item) => item.approvalId !== message.payload.approvalId),
          );
          break;
        case "extension_notice":
          if (message.payload.level === "info") {
            setStatus(message.payload.message);
            setError("");
          } else {
            setError(message.payload.message);
          }
          break;
        case "error":
          setRunning(false);
          setError(message.payload.error);
          setStatus(t("Error"));
          break;
        default:
          break;
      }
    },
    [app, refreshTranscript],
  );

  const socket = useWebSocket({
    enabled: true,
    reconnectSessionId: sessionId,
    onMessage,
    onStatus: (next) => {
      setConnected(next === "open");
      if (next === "open") setStatus(t("Opening…"));
      else if (next === "connecting") setStatus(t("Connecting…"));
      else if (next === "closed") setStatus(t("Reconnecting…"));
      else setStatus(t("Connection error"));
    },
  });

  useEffect(() => {
    const el = messagesRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, streaming]);

  // A Helper/BTW opened with a question already typed asks it straight away
  // instead of greeting the user with "what can I help with?".
  const seed = app.childSeed;
  const seedSentRef = useRef(false);
  useEffect(() => {
    if (!seed || seed.sessionId !== sessionId || seedSentRef.current) return;
    if (!connected) return;
    if (socket.send({ type: "prompt", payload: seed.text })) {
      seedSentRef.current = true;
      setRunning(true);
      setStatus(t("Working…"));
      app.clearChildSeed();
    }
  }, [app, connected, seed, sessionId, socket]);

  const send = () => {
    const text = draft.trim();
    if (!text) return;
    // Sending while it runs steers the running turn (Pi behavior); the server
    // confirms with an extension notice.
    if (socket.send({ type: "prompt", payload: text })) {
      setDraft("");
      setError("");
      if (!running) {
        setRunning(true);
        setStatus(t("Working…"));
      }
    }
  };

  const respondApproval = (
    approvalId: string,
    response: { accept?: boolean; choice?: string | null; text?: string | null },
  ) => {
    socket.send({ type: "respond_approval", payload: { approvalId, ...response } });
    setApprovals((current) => current.filter((item) => item.approvalId !== approvalId));
  };

  const latestUserIndex = useMemo(() => {
    for (let i = messages.length - 1; i >= 0; i -= 1) {
      if (messages[i]?.role === "user") return i;
    }
    return -1;
  }, [messages]);

  const renderedToolCallIds = new Set<string>();

  return (
    <div className={`child-conv ${variant}`}>
      <div className="child-head">
        <button className="flat" onClick={onClose} title={t("Close")}>
          <i className="ph ph-arrow-left" aria-hidden="true" />
        </button>
        <span className="child-what">{childBlurb(purpose, variant)}</span>
        <span className="child-status">{status}</span>
        {inList ? null : (
          <button
            className="flat"
            title={t("Keep this conversation in your list, with where it came from.")}
            onClick={() => {
              void app.promoteRelatedSession(sessionId).catch((reason) =>
                setError(reason instanceof Error ? reason.message : String(reason)),
              );
            }}
          >
            <i className="ph ph-list-plus" aria-hidden="true" />{" "}
            {t("Add to conversation list")}
          </button>
        )}
      </div>

      <div className="msgs child-msgs" ref={messagesRef}>
        {messages.map((message, index) => (
          <TranscriptEntry
            key={`${index}-${message.timestamp ?? message.text.slice(0, 12)}`}
            message={message}
            developer={developer}
            isLatestUser={index === latestUserIndex}
            renderedToolCallIds={renderedToolCallIds}
            isRunning={running}
          />
        ))}
        {streaming ? <AssistantBubble text={streaming} streaming /> : null}
      </div>

      {approvals[0] ? (
        <ApprovalDock
          request={approvals[0]}
          onRespond={respondApproval}
          onSessionAllow={() => undefined}
        />
      ) : null}
      {error ? <div className="related-error">{error}</div> : null}

      <div className="composer child-composer">
        <textarea
          value={draft}
          placeholder={
            running
              ? t("Message the running agent — it sees it at its next step")
              : t("Reply here")
          }
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault();
              send();
            }
          }}
        />
        <div className="row">
          <button
            className="send"
            disabled={!draft.trim()}
            onClick={send}
            title={t("Send")}
          >
            <i className="ph ph-arrow-up" aria-hidden="true" />
          </button>
          {running ? (
            <button
              className="send"
              style={{ background: "var(--danger)" }}
              onClick={() => socket.send({ type: "abort" })}
              title={t("Stop")}
            >
              <i className="ph ph-square" aria-hidden="true" />
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}

/** One lowkey line saying what this pane is — not a repeat of the title. */
function childBlurb(purpose: string, _variant?: "panel" | "compare"): string {
  if (purpose === "helper") {
    return t("Questions about Alt itself, and setup fixes — fresh context.");
  }
  if (purpose === "subagent") {
    return t("A subagent working on its own — you can join in.");
  }
  if (purpose === "fork") {
    return t("A branch of this conversation.");
  }
  return t("A related question, kept out of the main conversation.");
}
