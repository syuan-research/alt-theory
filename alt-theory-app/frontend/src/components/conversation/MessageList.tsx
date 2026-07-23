import { useEffect, useMemo, useRef, useState } from "react";
import type { ActiveToolState, TranscriptMessage } from "@/api/types";
import { useApp } from "@/context/AppProvider";
import { useShell } from "@/context/ShellContext";
import { renderMarkdown } from "@/lib/markdown";
import { toolLabel } from "@/lib/tools";
import { cn } from "@/lib/cn";

export function MessageList() {
  const app = useApp();
  const shell = useShell();
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
  }, [app.messages, app.streamParts]);

  const renderedToolCallIds = new Set<string>();

  return (
    <div className="msgs" ref={containerRef}>
      {app.sessionId && !app.selectors.soulSlug ? (
        <SysLine>
          <i className="ph ph-warning" />
          Soul not loaded — this conversation runs without Alt&apos;s persona.
        </SysLine>
      ) : null}
      {app.messages.map((message, index) => (
        <TranscriptEntry
          key={`${index}-${message.timestamp ?? message.text.slice(0, 12)}`}
          message={message}
          developer={developer}
          isLatestUser={index === latestUserIndex}
          renderedToolCallIds={renderedToolCallIds}
          isRunning={app.isRunning}
          onEditLatest={app.startReviseMode}
        />
      ))}

      {app.approvalMarkers.map((marker) => (
        <SysLine key={marker}>
          <i className="ph ph-check" />
          {marker} — allowed for this conversation
        </SysLine>
      ))}

      {app.streamParts.map((part, index) => {
        if (part.kind === "text") {
          return <AssistantBubble key={`sp-${index}`} text={part.text} streaming />;
        }
        if (part.kind === "thinking") {
          if (!developer) return null;
          return (
            <ThinkingBlock
              key={`sp-${index}`}
              text={part.text}
              defaultOpen={shell.thinkingExpanded}
            />
          );
        }
        return <ToolLine key={part.tool.callId} tool={part.tool} />;
      })}
    </div>
  );
}

function ToolLine({ tool }: { tool: ActiveToolState }) {
  return (
    <SysLine
      tone={
        tool.status === "failed"
          ? "danger"
          : tool.status === "finished"
            ? "ok"
            : "running"
      }
    >
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
  );
}

function ThinkingBlock({
  text,
  defaultOpen,
}: {
  text: string;
  defaultOpen: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <details
      className="think-block"
      open={open}
      onToggle={(event) => setOpen(event.currentTarget.open)}
    >
      <summary>
        <i className="ph ph-brain" aria-hidden="true" /> Thinking
      </summary>
      <div className="think-body">{text}</div>
    </details>
  );
}

function TranscriptEntry({
  message,
  developer,
  isLatestUser,
  renderedToolCallIds,
  isRunning,
  onEditLatest,
}: {
  message: TranscriptMessage;
  developer: boolean;
  isLatestUser: boolean;
  renderedToolCallIds: Set<string>;
  isRunning: boolean;
  onEditLatest: (text: string) => void;
}) {
  const { thinkingExpanded } = useShell();
  if (message.role === "user") {
    return (
      <UserBubble
        text={message.text}
        isLatest={isLatestUser}
        isRunning={isRunning}
        onEditLatest={onEditLatest}
      />
    );
  }

  if (message.role === "assistant") {
    return (
      <>
        {developer && message.thinking ? (
          <ThinkingBlock text={message.thinking} defaultOpen={thinkingExpanded} />
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
      <SysLine tone={success ? "ok" : "danger"}>
        <i className={success ? "ph ph-check" : "ph ph-x"} />
        {toolLabel(message.toolName || message.text || "tool", message.toolPath)}
      </SysLine>
    );
  }

  if (message.role === "system") {
    if (message.marker === "compaction") {
      return (
        <div className="compact-line" title={message.text}>
          <span>Conversation compressed here</span>
        </div>
      );
    }
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
  onEditLatest,
}: {
  text: string;
  isLatest: boolean;
  isRunning: boolean;
  onEditLatest: (text: string) => void;
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
          <button
            title="Edit"
            aria-label="Edit message"
            disabled={isRunning}
            onClick={() => onEditLatest(trimmed)}
          >
            <i className="ph ph-pencil-simple" aria-hidden="true" />
          </button>
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
  tone?: "danger" | "ok" | "running";
}) {
  return (
    <div
      className={cn(
        "sys-line",
        tone === "danger" && "sys-danger",
        tone === "ok" && "sys-ok",
        tone === "running" && "sys-running"
      )}
    >
      {children}
    </div>
  );
}
