import { useEffect, useMemo, useRef } from "react";
import type { TranscriptMessage } from "@/api/types";
import { useApp } from "@/context/AppProvider";
import { renderMarkdown } from "@/lib/markdown";
import { toolLabel } from "@/lib/tools";
import { cn } from "@/lib/cn";

export function MessageList() {
  const app = useApp();
  const containerRef = useRef<HTMLDivElement>(null);
  const developer = app.transcriptView === "developer";

  const latestUserIndex = useMemo(() => {
    for (let i = app.messages.length - 1; i >= 0; i -= 1) {
      if (app.messages[i]?.role === "user") return i;
    }
    return -1;
  }, [app.messages]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 120;
    if (nearBottom) el.scrollTop = el.scrollHeight;
  }, [app.messages, app.streamingText, app.activeTools]);

  const renderedToolCallIds = new Set<string>();

  return (
    <div className="msgs" ref={containerRef}>
      {app.messages.map((message, index) => (
        <TranscriptEntry
          key={`${index}-${message.timestamp ?? message.text.slice(0, 12)}`}
          message={message}
          developer={developer}
          isLatestUser={index === latestUserIndex}
          renderedToolCallIds={renderedToolCallIds}
          isRunning={app.isRunning}
          hasSession={Boolean(app.sessionId)}
          onEditLatest={app.startReviseMode}
          onDeleteLatest={() =>
            app.requestConfirm({
              message: "Remove the latest message and its reply?",
              confirmLabel: "Delete",
              onConfirm: app.deleteLatest,
            })
          }
        />
      ))}

      {app.approvalMarkers.map((marker) => (
        <SysLine key={marker}>
          <i className="ph ph-check" />
          {marker} — allowed for this conversation
        </SysLine>
      ))}

      {app.streamingText ? (
        <AssistantBubble text={app.streamingText} streaming />
      ) : null}

      {app.activeTools.map((tool) => (
        <SysLine key={tool.callId}>
          <i
            className={
              tool.status === "running"
                ? "ph ph-circle-notch"
                : tool.success === false
                  ? "ph ph-x"
                  : "ph ph-check"
            }
          />
          {toolLabel(tool.toolName, tool.path)}
          {tool.progressText ? ` — ${tool.progressText}` : ""}
        </SysLine>
      ))}
    </div>
  );
}

function TranscriptEntry({
  message,
  developer,
  isLatestUser,
  renderedToolCallIds,
  isRunning,
  hasSession,
  onEditLatest,
  onDeleteLatest,
}: {
  message: TranscriptMessage;
  developer: boolean;
  isLatestUser: boolean;
  renderedToolCallIds: Set<string>;
  isRunning: boolean;
  hasSession: boolean;
  onEditLatest: (text: string) => void;
  onDeleteLatest: () => void;
}) {
  if (message.role === "user") {
    return (
      <UserBubble
        text={message.text}
        isLatest={isLatestUser}
        isRunning={isRunning}
        hasSession={hasSession}
        onEditLatest={onEditLatest}
        onDeleteLatest={onDeleteLatest}
      />
    );
  }

  if (message.role === "assistant") {
    return (
      <>
        {developer && message.thinking ? (
          <SysLine>
            <i className="ph ph-brain" />
            {message.thinking}
          </SysLine>
        ) : null}
        <AssistantBubble text={message.text} />
      </>
    );
  }

  if (message.role === "tool") {
    const callId = message.toolCallId;
    if (callId && renderedToolCallIds.has(callId)) return null;
    if (callId) renderedToolCallIds.add(callId);
    const success = message.success !== false;
    return (
      <SysLine tone={success ? undefined : "danger"}>
        <i className={success ? "ph ph-check" : "ph ph-x"} />
        {toolLabel(message.toolName || message.text || "tool", message.toolPath)}
      </SysLine>
    );
  }

  if (message.role === "system") {
    return (
      <SysLine>
        <i className="ph ph-info" />
        {message.text}
      </SysLine>
    );
  }

  return <AssistantBubble text={message.text} />;
}

function UserBubble({
  text,
  isLatest,
  isRunning,
  hasSession,
  onEditLatest,
  onDeleteLatest,
}: {
  text: string;
  isLatest: boolean;
  isRunning: boolean;
  hasSession: boolean;
  onEditLatest: (text: string) => void;
  onDeleteLatest: () => void;
}) {
  const trimmed = (text || "").trim();
  if (!trimmed) return null;
  return (
    <div className="msg user">
      <div className="who">You</div>
      <div className="bubble">
        <div
          className="markdown-body"
          dangerouslySetInnerHTML={{ __html: renderMarkdown(trimmed) }}
        />
      </div>
      <div className="msg-actions">
        <button
          title="Copy"
          aria-label="Copy message"
          onClick={() => void navigator.clipboard?.writeText(trimmed)}
        >
          <i className="ph ph-copy" aria-hidden="true" />
        </button>
        {isLatest ? (
          <>
            <button
              title="Edit"
              aria-label="Edit message"
              disabled={isRunning}
              onClick={() => onEditLatest(trimmed)}
            >
              <i className="ph ph-pencil-simple" aria-hidden="true" />
            </button>
            <button
              title="Delete"
              aria-label="Delete message and reply"
              disabled={isRunning || !hasSession}
              onClick={onDeleteLatest}
            >
              <i className="ph ph-trash" aria-hidden="true" />
            </button>
          </>
        ) : null}
      </div>
    </div>
  );
}

function AssistantBubble({
  text,
  streaming,
}: {
  text: string;
  streaming?: boolean;
}) {
  const trimmed = (text || "").trim();
  if (!trimmed) return null;
  return (
    <div className="msg assistant">
      <div className="who">Alt{streaming ? " · typing…" : ""}</div>
      <div className="bubble">
        <div
          className="markdown-body"
          dangerouslySetInnerHTML={{ __html: renderMarkdown(trimmed) }}
        />
      </div>
    </div>
  );
}

function SysLine({
  children,
  tone,
}: {
  children: React.ReactNode;
  tone?: "danger";
}) {
  return (
    <div className={cn("sys-line", tone === "danger" && "sys-danger")}>
      {children}
    </div>
  );
}
