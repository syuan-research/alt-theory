import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ApprovalRequestPayload, ServerMessage, TranscriptMessage } from "@/api/types";
import { fetchSessionDetail } from "@/api/sessions";
import { useApp } from "@/context/AppProvider";
import { useShell, type RailKey } from "@/context/ShellContext";
import { useWebSocket } from "@/hooks/useWebSocket";
import { sessionTitle } from "@/lib/sessionList";
import { renderMarkdown } from "@/lib/markdown";
import { ApprovalDock } from "@/components/conversation/ApprovalDock";
import { RecordsPanel } from "@/components/inspector/RecordsPanel";
import { ProvenancePanel } from "@/components/inspector/ProvenancePanel";
import { RuntimePanel } from "@/components/inspector/RuntimePanel";
import { WorkspaceTree } from "@/components/inspector/WorkspaceTree";
import { ChangesPanel } from "@/components/inspector/ChangesPanel";

const RAIL_META: Record<RailKey, { title: string; icon: string; adv?: boolean }> = {
  chats: { title: "Related conversations", icon: "ph-arrows-split" },
  changes: { title: "Changes", icon: "ph-pencil-simple-line" },
  workspace: { title: "Files", icon: "ph-folder" },
  records: { title: "Records", icon: "ph-scroll", adv: true },
  provenance: { title: "Provenance", icon: "ph-tree-structure", adv: true },
  runtime: { title: "Runtime", icon: "ph-pulse", adv: true },
};

const PRIMARY: RailKey[] = ["chats", "changes", "workspace"];
const ADVANCED: RailKey[] = ["records", "provenance", "runtime"];

export function InspectorPanel() {
  const app = useApp();
  const shell = useShell();
  const advanced = app.viewMode === "researcher";
  const open = shell.rightPanel !== null;
  const active = shell.rightPanel;

  // Side-chat notification dot: any live child hanging off this conversation.
  const hasSideChats = useMemo(
    () =>
      app.sessions.some(
        (s) =>
          s.forkedFrom?.sessionId === app.sessionId &&
          s.forkedFrom.purpose !== "ab-arm" &&
          !s.deletedAt
      ),
    [app.sessions, app.sessionId]
  );

  const title = shell.rightSub?.title ?? (active ? RAIL_META[active].title : "");

  useEffect(() => {
    const childId = app.activeRelatedSessionId;
    if (!childId) return;
    const child = app.sessions.find((item) => item.sessionId === childId);
    shell.openRail("chats");
    shell.openSub({
      key: `related:${childId}`,
      title: child ? sessionTitle(child, app.sessionDisplayNames) : "Related conversation",
    });
  }, [
    app.activeRelatedSessionId,
    app.sessionDisplayNames,
    app.sessions,
    shell.openRail,
    shell.openSub,
  ]);

  return (
    <aside className={`right${open ? " open" : ""}`}>
      <div className="rpanel">
        {active ? (
          <div className={`head${shell.rightSub ? " sub" : ""}`}>
            <button className="back" onClick={shell.closeSub} title="Back">
              <i className="ph ph-arrow-left" />
            </button>
            <span>{title}</span>
            <button className="rp-close" onClick={shell.closeRight} title="Collapse">
              <i className="ph ph-sidebar-simple" style={{ transform: "scaleX(-1)" }} />
            </button>
          </div>
        ) : null}
        <div className="body">
          {active === "chats" ? <RelatedConversations /> : null}
          {active === "changes" ? <ChangesPanel /> : null}
          {active === "workspace" ? <WorkspaceTree /> : null}
          {active === "records" ? (
            <RecordsPanel
              sessionId={app.sessionId}
              sessionReady={app.sessionReady}
              tabActive
            />
          ) : null}
          {active === "provenance" ? (
            <ProvenancePanel
              sessionId={app.sessionId}
              sessionReady={app.sessionReady}
              discovery={app.discovery}
              tabActive
            />
          ) : null}
          {active === "runtime" ? (
            <RuntimePanel
              sessionId={app.sessionId}
              connStatus={app.connStatus}
              connLabel={app.connLabel}
              manifest={app.manifest}
              currentDomain={app.selectors.currentDomain}
              metrics={app.metrics}
              discovery={app.discovery}
              onRefresh={() => {
                app.requestMetadata();
                app.requestMetrics();
              }}
              disabled={!app.sessionReady || !app.wsConnected}
            />
          ) : null}
        </div>
      </div>
      <div className="rail">
        {PRIMARY.map((key) => (
          <button
            key={key}
            className={active === key ? "on" : ""}
            title={RAIL_META[key].title}
            onClick={() => shell.toggleRail(key)}
          >
            <i className={`ph ${RAIL_META[key].icon}`} />
            {key === "chats" && hasSideChats ? <span className="dot" /> : null}
          </button>
        ))}
        {advanced
          ? ADVANCED.map((key) => (
              <button
                key={key}
                className={active === key ? "on" : ""}
                title={RAIL_META[key].title}
                onClick={() => shell.toggleRail(key)}
              >
                <i className={`ph ${RAIL_META[key].icon}`} />
              </button>
            ))
          : null}
      </div>
    </aside>
  );
}

function RelatedConversations() {
  const app = useApp();
  const shell = useShell();
  const activeChildId = shell.rightSub?.key.startsWith("related:")
    ? shell.rightSub.key.slice("related:".length)
    : null;
  const children = useMemo(
    () =>
      app.sessions.filter(
        (s) =>
          s.forkedFrom?.sessionId === app.sessionId &&
          s.forkedFrom.purpose !== "ab-arm" &&
          !s.deletedAt
      ),
    [app.sessions, app.sessionId]
  );

  const PURPOSE_ICON: Record<string, string> = {
    side: "ph-arrows-split",
    helper: "ph-lifebuoy",
    "ab-arm": "ph-git-fork",
    fork: "ph-git-branch",
  };

  if (activeChildId) {
    return <RelatedConversation sessionId={activeChildId} />;
  }

  if (children.length === 0) {
    return (
      <div className="rp-empty">
        No related conversations. Use <b>/branch</b> or <b>/btw</b>, or open Helper.
      </div>
    );
  }

  return (
    <>
      {children.map((child) => (
        <button
          key={child.sessionId}
          className="sc-item"
          onClick={() => {
            shell.openApp();
            if (child.forkedFrom?.purpose === "fork") {
              app.setActiveRelatedSessionId(null);
              app.openCatalogSession(child.sessionId);
            } else {
              app.setActiveRelatedSessionId(child.sessionId);
            }
          }}
        >
          <div className="t">
            <i className={`ph ${PURPOSE_ICON[child.forkedFrom?.purpose ?? "side"]}`} />
            {sessionTitle(child, app.sessionDisplayNames)}
            {child.status === "incomplete" ? (
              <span className="badge-run">running</span>
            ) : null}
          </div>
          <div className="d">
            {child.forkedFrom?.purpose === "helper"
              ? "Ask how Alt works · fresh context"
              : child.forkedFrom?.purpose === "fork"
                ? `Branch · ${child.messageCount ?? 0} messages`
                : `Side conversation · ${child.messageCount ?? 0} messages`}
          </div>
        </button>
      ))}
    </>
  );
}

function RelatedConversation({ sessionId }: { sessionId: string }) {
  const app = useApp();
  const shell = useShell();
  const [messages, setMessages] = useState<TranscriptMessage[]>([]);
  const [streaming, setStreaming] = useState("");
  const [draft, setDraft] = useState("");
  const [running, setRunning] = useState(false);
  const [status, setStatus] = useState("Connecting…");
  const [error, setError] = useState("");
  const [approvals, setApprovals] = useState<ApprovalRequestPayload[]>([]);
  const messagesRef = useRef<HTMLDivElement>(null);

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
          setStatus("Ready");
          break;
        case "assistant_delta":
          setStreaming((current) => current + message.payload.text);
          break;
        case "run_phase":
          setStatus(message.payload.phase === "idle" ? "Ready" : "Working…");
          break;
        case "run_completed":
          setRunning(false);
          setStreaming("");
          setStatus("Ready");
          void refreshTranscript();
          void app.refreshSessions();
          break;
        case "run_failed":
          setRunning(false);
          setStreaming("");
          setError(message.payload.error);
          setStatus("Error");
          void refreshTranscript();
          break;
        case "approval_requested":
          setApprovals((current) => [...current, message.payload]);
          break;
        case "approval_resolved":
          setApprovals((current) =>
            current.filter((item) => item.approvalId !== message.payload.approvalId)
          );
          break;
        case "extension_notice":
          setError(message.payload.message);
          break;
        case "error":
          setRunning(false);
          setError(message.payload.error);
          setStatus("Error");
          break;
        default:
          break;
      }
    },
    [app, refreshTranscript]
  );

  const socket = useWebSocket({
    enabled: true,
    reconnectSessionId: sessionId,
    onMessage,
    onStatus: (next) => {
      if (next === "open") setStatus("Opening…");
      else if (next === "connecting") setStatus("Connecting…");
      else if (next === "closed") setStatus("Reconnecting…");
      else setStatus("Connection error");
    },
  });

  useEffect(() => {
    const el = messagesRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, streaming]);

  const send = () => {
    const text = draft.trim();
    if (!text || running) return;
    if (socket.send({ type: "prompt", payload: text })) {
      setDraft("");
      setError("");
      setRunning(true);
      setStatus("Working…");
    }
  };

  const respondApproval = (
    approvalId: string,
    response: { accept?: boolean; choice?: string | null; text?: string | null }
  ) => {
    socket.send({ type: "respond_approval", payload: { approvalId, ...response } });
    setApprovals((current) => current.filter((item) => item.approvalId !== approvalId));
  };

  return (
    <div className="related-live">
      <div className="related-actions">
        <span>{status}</span>
        <button
          onClick={() => {
            void app.promoteRelatedSession(sessionId).catch((reason) =>
              setError(reason instanceof Error ? reason.message : String(reason))
            );
          }}
        >
          <i className="ph ph-arrow-square-out" /> Promote to branch
        </button>
      </div>
      <div className="child-msgs" ref={messagesRef}>
        {messages.map((message, index) => (
          <div className="cm" key={`${index}-${message.timestamp ?? "message"}`}>
            <div className="w">{message.role === "user" ? "You" : message.role}</div>
            <div
              className="markdown-body"
              dangerouslySetInnerHTML={{ __html: renderMarkdown(message.text) }}
            />
          </div>
        ))}
        {streaming ? (
          <div className="cm"><div className="w">Alt · typing…</div>{streaming}</div>
        ) : null}
      </div>
      {approvals[0] ? (
        <ApprovalDock
          request={approvals[0]}
          onRespond={respondApproval}
          onSessionAllow={() => undefined}
        />
      ) : null}
      {error ? <div className="related-error">{error}</div> : null}
      <div className="mini-composer">
        <input
          value={draft}
          disabled={running}
          placeholder="Reply in this related conversation"
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey) send();
          }}
        />
        <button disabled={!draft.trim() || running} onClick={send} title="Send">
          <i className="ph ph-arrow-up" />
        </button>
        {running ? (
          <button onClick={() => socket.send({ type: "abort" })} title="Stop">
            <i className="ph ph-stop" />
          </button>
        ) : null}
      </div>
      <button
        className="related-back"
        onClick={() => {
          app.setActiveRelatedSessionId(null);
          shell.closeSub();
        }}
      >
        Back to related conversations
      </button>
    </div>
  );
}
