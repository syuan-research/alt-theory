import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ActiveToolState, ApprovalRequestPayload, ServerMessage, SessionSnapshot, StreamPart, TranscriptMessage } from "@/api/types";
import {
  fetchSessionDetail,
  promoteToMainline as promoteToMainlineRequest,
} from "@/api/sessions";
import { useApp } from "@/context/AppProvider";
import { useWebSocket } from "@/hooks/useWebSocket";
import { isListMember } from "@/lib/sessionList";
import { t } from "@/i18n";
import { ApprovalDock } from "@/components/conversation/ApprovalDock";
import { StreamPartsView, TranscriptEntry } from "@/components/conversation/MessageList";
import { handleConversationStreamMessage } from "@/lib/conversationStream";
import { ModelChip } from "@/components/conversation/ModelChip";

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
  const [streamParts, setStreamParts] = useState<StreamPart[]>([]);
  const [draft, setDraft] = useState("");
  const [running, setRunning] = useState(false);
  const [status, setStatus] = useState(t("Connecting…"));
  const [error, setError] = useState("");
  const [approvals, setApprovals] = useState<ApprovalRequestPayload[]>([]);
  const [connected, setConnected] = useState(false);
  const [snapshot, setSnapshot] = useState<SessionSnapshot | null>(null);
  const [menu, setMenu] = useState<"role" | "model" | null>(null);
  const [slashIndex, setSlashIndex] = useState(0);
  const activeToolsRef = useRef<Record<string, ActiveToolState>>({});
  const messagesRef = useRef<HTMLDivElement>(null);
  const developer = app.transcriptView === "developer";

  const summary = app.sessions.find((item) => item.sessionId === sessionId);
  const purpose = summary?.forkedFrom?.purpose ?? "side";
  const inList = summary ? isListMember(summary) : true;
  // M4b role swap entry points: a branch can take the list spot; a delisted
  // origin can take it back.
  const mainlineAction = summary
    ? summary.forkedFrom?.purpose === "fork"
      ? t("Make this the main conversation")
      : !summary.forkedFrom && summary.delisted
        ? t("Make this the main conversation again")
        : null
    : null;

  const refreshTranscript = useCallback(async () => {
    const detail = await fetchSessionDetail(sessionId);
    setMessages(detail.transcript ?? []);
  }, [sessionId]);

  const onMessage = useCallback(
    (message: ServerMessage) => {
      if (handleConversationStreamMessage(message, {
        activeTools: activeToolsRef,
        setParts: setStreamParts,
        setPhaseLabel: setStatus,
      })) {
        if (message.type !== "run_phase" || message.payload.phase !== "idle") setRunning(true);
        return;
      }
      switch (message.type) {
        case "session_opened":
        case "session_updated":
          setSnapshot(message.payload);
          setRunning(message.payload.status === "running");
          break;
        case "session_transcript":
          setMessages(message.payload.messages);
          setStreamParts([]);
          activeToolsRef.current = {};
          setRunning(false);
          setStatus(t("Ready"));
          break;
        case "run_completed":
          setSnapshot((current) => current ? {
            ...current,
            status: "idle",
            currentModel: message.payload.currentModel ?? current.currentModel,
          } : current);
          setRunning(false);
          setStreamParts([]);
          activeToolsRef.current = {};
          setStatus(t("Ready"));
          void refreshTranscript();
          void app.refreshSessions();
          break;
        case "run_failed":
          setRunning(false);
          setStreamParts([]);
          activeToolsRef.current = {};
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
        case "branch_created":
          app.setActiveRelatedSessionId(message.payload.sessionId, { size: "half" });
          void app.refreshSessions();
          break;
        case "related_session_created":
          app.setActiveRelatedSessionId(message.payload.sessionId, { size: "default" });
          void app.refreshSessions();
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
  }, [messages, streamParts]);

  // A Helper/BTW opened with a question already typed asks it straight away
  // instead of greeting the user with "what can I help with?".
  const seed = app.childSeed;
  const seedSentRef = useRef(false);
  useEffect(() => {
    if (!seed || seed.sessionId !== sessionId || seedSentRef.current) return;
    if (!connected) return;
    if (!seed.autoSend) {
      seedSentRef.current = true;
      setDraft(seed.text);
      app.clearChildSeed();
      return;
    }
    if (socket.send({ type: "prompt", payload: seed.text })) {
      seedSentRef.current = true;
      setMessages((current) => [...current, { role: "user", text: seed.text, timestamp: null }]);
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
      setMessages((current) => [...current, { role: "user", text, timestamp: null }]);
      setDraft("");
      setError("");
      if (!running) {
        setRunning(true);
        setStatus(t("Working…"));
      }
    }
  };

  const slashCommands = useMemo(() => [
    { name: "helper", description: t("Ask how Alt works, or get setup fixed — in a new conversation on the side"), run: () => socket.send({ type: "create_related_session", payload: { purpose: "helper" } }), immediate: true },
    { name: "branch", description: t("Branch this conversation into a new direction"), run: () => socket.send({ type: "fork_session", payload: { purpose: "fork" } }), immediate: true },
    { name: "btw", description: t("Start a side conversation without adding it to the list"), run: () => socket.send({ type: "create_related_session", payload: { purpose: "side" } }), immediate: true },
    { name: "compact", description: t("Compact this conversation to free context space"), run: () => socket.send({ type: "compact" }), immediate: true },
    { name: "new", description: t("Start a new conversation"), run: () => app.startNewSession(), immediate: true },
    ...(app.discovery?.skills ?? []).filter((skill) => skill.enabled?.[snapshot?.mode ?? "understand"] !== false).map((skill) => ({
      name: skill.name,
      description: skill.description || t("Alt Theory skill"),
      run: (args: string) => socket.send({ type: "invoke_skill", payload: { skillName: skill.name, ...(args.trim() ? { userText: args.trim() } : {}) } }),
      immediate: false,
    })),
  ], [app, socket]);
  const slashQuery = draft.startsWith("/") && !draft.startsWith("//") ? draft.slice(1) : null;
  const slashMatches = useMemo(() => {
    if (slashQuery === null) return [];
    const token = slashQuery.split(/\s+/, 1)[0].toLowerCase();
    return slashCommands.filter((command) => command.name.toLowerCase().startsWith(token));
  }, [slashCommands, slashQuery]);
  useEffect(() => setSlashIndex(0), [slashMatches.length]);
  const runSlash = (command: (typeof slashCommands)[number]) => {
    const args = slashQuery?.split(/\s+/).slice(1).join(" ") ?? "";
    if (!command.immediate && !args.trim()) {
      setDraft(`/${command.name} `);
      return;
    }
    setDraft("");
    command.run(args);
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
        {mainlineAction ? (
          <button
            className="flat promote-action"
            title={t("This conversation takes the list spot; the current one stays available from its Related rail.")}
            onClick={() => {
              void promoteToMainlineRequest(sessionId)
                .then(() => app.refreshSessions())
                .catch((reason) =>
                  setError(
                    reason instanceof Error ? reason.message : String(reason),
                  ),
                );
            }}
          >
            <i className="ph ph-crown-simple" aria-hidden="true" />{" "}
            {mainlineAction}
          </button>
        ) : inList ? null : (
          <button
            className="flat promote-action"
            title={t("Keep this conversation in your list, with where it came from.")}
            onClick={() => {
              void app.promoteRelatedSession(sessionId).catch((reason) =>
                setError(reason instanceof Error ? reason.message : String(reason)),
              );
            }}
          >
            <i className="ph ph-arrow-line-up" aria-hidden="true" />{" "}
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
        <StreamPartsView parts={streamParts} developer={developer} />
      </div>

      {approvals[0] ? (
        <ApprovalDock
          request={approvals[0]}
          onRespond={respondApproval}
          onSessionAllow={() => undefined}
        />
      ) : null}
      {error ? <div className="related-error">{error}</div> : null}

      <div className="ctx-line child-ctx-line">
        <div className="ctx-picker">
          <button className="ctx-item" onClick={() => setMenu(menu === "role" ? null : "role")}>
            <i className="ph ph-user-circle" />
            {snapshot?.rolePresetSlug
              ? (app.discovery?.rolePresets.find((role) => role.slug === snapshot.rolePresetSlug)?.userLabel ?? snapshot.rolePresetSlug)
              : t("No role")}
          </button>
          <div className={`menu${menu === "role" ? " on" : ""}`}>
            <div className="mi" onClick={() => (socket.send({ type: "switch_role_preset", payload: { rolePresetSlug: null } }), setMenu(null))}>
              <span>{t("No role")}</span>
            </div>
            {(app.discovery?.rolePresets ?? []).map((role) => (
              <div key={role.slug} className="mi" onClick={() => (socket.send({ type: "switch_role_preset", payload: { rolePresetSlug: role.slug } }), setMenu(null))}>
                <span>{role.userLabel || role.displayName}</span>
              </div>
            ))}
          </div>
        </div>
        <ModelChip
          open={menu === "model"}
          onToggle={() => setMenu(menu === "model" ? null : "model")}
          session={{
            ready: connected && Boolean(snapshot),
            modelOverride: snapshot?.modelOverride ?? null,
            currentModel: snapshot?.currentModel ?? null,
            setModel: (override) => socket.send({ type: "set_session_model", payload: { override } }),
          }}
        />
      </div>
      {slashMatches.length > 0 ? (
        <div className="slash-palette child-slash-palette">
          {slashMatches.map((command, index) => (
            <button key={command.name} className={`slash-item${index === slashIndex ? " on" : ""}`} onMouseEnter={() => setSlashIndex(index)} onClick={() => runSlash(command)}>
              <span className="cmd">/{command.name}</span>
              <span className="desc">{command.description}</span>
            </button>
          ))}
        </div>
      ) : null}
      <div className="composer child-composer">
        <textarea
          rows={1}
          value={draft}
          placeholder={
            running
              ? t("Message the running agent — it sees it at its next step")
              : t("Reply here")
          }
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (slashMatches.length > 0) {
              if (event.key === "ArrowDown" || event.key === "ArrowUp") {
                event.preventDefault();
                const step = event.key === "ArrowDown" ? 1 : -1;
                setSlashIndex((index) => (index + step + slashMatches.length) % slashMatches.length);
                return;
              }
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                runSlash(slashMatches[slashIndex]);
                return;
              }
            }
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
