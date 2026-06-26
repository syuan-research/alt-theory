import { useEffect, useMemo, useRef } from "react";
import type { TranscriptMessage } from "@/api/types";
import { useApp } from "@/context/AppProvider";
import { Button } from "@/components/ui/Button";
import { HintText } from "@/components/ui/Typography";
import { renderMarkdown } from "@/lib/markdown";
import { toolLabel } from "@/lib/tools";
import { isSimpleViewMode } from "@/lib/viewMode";
import { cn } from "@/lib/cn";

export function MessageList() {
  const app = useApp();
  const containerRef = useRef<HTMLDivElement>(null);
  const showViewToggle = !isSimpleViewMode(app.viewMode);

  const latestUserIndex = useMemo(() => {
    for (let i = app.messages.length - 1; i >= 0; i -= 1) {
      if (app.messages[i]?.role === "user") return i;
    }
    return -1;
  }, [app.messages]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const threshold = 80;
    const nearBottom =
      el.scrollHeight - el.scrollTop - el.clientHeight < threshold;
    if (nearBottom) {
      el.scrollTop = el.scrollHeight;
    }
  }, [app.messages, app.streamingText, app.activeTools]);

  const renderedToolCallIds = new Set<string>();

  return (
    <section className="flex min-h-0 flex-1 flex-col">
      {showViewToggle ? (
        <div className="flex gap-1 border-b border-hairline px-4 py-2">
          <ViewToggleButton
            active={app.transcriptView === "user"}
            onClick={() => app.setTranscriptView("user")}
          >
            User
          </ViewToggleButton>
          <ViewToggleButton
            active={app.transcriptView === "developer"}
            onClick={() => app.setTranscriptView("developer")}
          >
            Developer
          </ViewToggleButton>
        </div>
      ) : null}

      <div
        ref={containerRef}
        className={cn(
          "min-h-0 flex-1 space-y-3 overflow-auto px-4 py-4",
          app.selectors.visibility === "private" && "bg-[#f3f2f4]"
        )}
      >
        {app.messages.length === 0 && !app.streamingText ? (
          app.sessionReady ? null : (
            <HintText>Waiting for session connection...</HintText>
          )
        ) : (
          app.messages.map((message, index) => (
            <TranscriptEntry
              key={`${index}-${message.timestamp ?? message.text.slice(0, 12)}`}
              message={message}
              view={app.transcriptView}
              isLatestUser={index === latestUserIndex}
              renderedToolCallIds={renderedToolCallIds}
              isRunning={app.isRunning}
              hasSession={Boolean(app.sessionId)}
              onEditLatest={app.startReviseMode}
              onDeleteLatest={() => {
                app.requestConfirm({
                  message:
                    "Please confirm you want to remove the latest message and its reply.",
                  confirmLabel: "Delete",
                  onConfirm: app.deleteLatest,
                });
              }}
            />
          ))
        )}

        {app.streamingText ? (
          <AssistantMessage text={app.streamingText} streaming />
        ) : null}

        {app.activeTools.map((tool) => (
          <ToolStatusMessage key={tool.callId} tool={tool} />
        ))}
      </div>
    </section>
  );
}

function ViewToggleButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "rounded-md px-2.5 py-1 text-[0.75rem] font-semibold transition-colors",
        active
          ? "bg-ink text-surface"
          : "bg-surface text-text-secondary hover:bg-hover"
      )}
    >
      {children}
    </button>
  );
}

function TranscriptEntry({
  message,
  view,
  isLatestUser,
  renderedToolCallIds,
  isRunning,
  hasSession,
  onEditLatest,
  onDeleteLatest,
}: {
  message: TranscriptMessage;
  view: "user" | "developer";
  isLatestUser: boolean;
  renderedToolCallIds: Set<string>;
  isRunning: boolean;
  hasSession: boolean;
  onEditLatest: (text: string) => void;
  onDeleteLatest: () => void;
}) {
  if (view === "user") {
    if (message.role === "user" || message.role === "assistant") {
      return (
        <ChatBubble
          role={message.role}
          text={message.text}
          isLatestUser={message.role === "user" && isLatestUser}
          isRunning={isRunning}
          hasSession={hasSession}
          onEditLatest={onEditLatest}
          onDeleteLatest={onDeleteLatest}
        />
      );
    }
    return null;
  }

  if (message.role === "assistant" && message.thinking) {
    return (
      <>
        <ThinkingMessage text={message.thinking} />
        <ChatBubble role="assistant" text={message.text} />
      </>
    );
  }

  if (message.role === "tool") {
    return (
      <>
        <ToolStatusFromTranscript
          message={message}
          renderedToolCallIds={renderedToolCallIds}
        />
        {message.toolType === "result" ? (
          <ToolResultMessage message={message} />
        ) : null}
      </>
    );
  }

  return (
    <ChatBubble
      role={message.role}
      text={message.text}
      isLatestUser={message.role === "user" && isLatestUser}
      isRunning={isRunning}
      hasSession={hasSession}
      onEditLatest={onEditLatest}
      onDeleteLatest={onDeleteLatest}
    />
  );
}

function ChatBubble({
  role,
  text,
  streaming,
  isLatestUser,
  isRunning,
  hasSession,
  onEditLatest,
  onDeleteLatest,
}: {
  role: TranscriptMessage["role"];
  text: string;
  streaming?: boolean;
  isLatestUser?: boolean;
  isRunning?: boolean;
  hasSession?: boolean;
  onEditLatest?: (text: string) => void;
  onDeleteLatest?: () => void;
}) {
  const trimmed = (text || "").trim();
  if (!trimmed && role !== "tool") return null;

  if (role === "user") {
    return (
      <article className="ml-auto max-w-[82%] rounded-md bg-card-2 px-3 py-2 shadow-[0_1px_2px_rgba(20,18,12,0.04)]">
        <div
          className="markdown-body text-[0.9375rem] leading-[1.48] text-ink"
          dangerouslySetInnerHTML={{ __html: renderMarkdown(trimmed) }}
        />
        <div className="mt-2 flex flex-wrap gap-2">
          <MessageAction onClick={() => void navigator.clipboard?.writeText(trimmed)}>
            Copy
          </MessageAction>
          {isLatestUser ? (
            <>
              <MessageAction
                disabled={isRunning}
                onClick={() => onEditLatest?.(trimmed)}
              >
                Edit
              </MessageAction>
              <MessageAction
                disabled={isRunning || !hasSession}
                onClick={onDeleteLatest}
              >
                Delete
              </MessageAction>
            </>
          ) : null}
        </div>
      </article>
    );
  }

  if (role === "assistant") {
    return (
      <article className="max-w-[880px] px-3 py-2">
        <div
          className="markdown-body text-[0.9375rem] leading-[1.48] text-ink"
          dangerouslySetInnerHTML={{ __html: renderMarkdown(trimmed) }}
        />
        <div className="mt-2">
          <MessageAction onClick={() => void navigator.clipboard?.writeText(trimmed)}>
            Copy
          </MessageAction>
          {streaming ? (
            <span className="ml-2 text-[0.75rem] text-text-muted">streaming</span>
          ) : null}
        </div>
      </article>
    );
  }

  return (
    <article className="max-w-[92%] rounded-md bg-card px-3 py-2 text-[0.8125rem] text-text-secondary">
      {trimmed}
    </article>
  );
}

function AssistantMessage({
  text,
  streaming,
}: {
  text: string;
  streaming?: boolean;
}) {
  return <ChatBubble role="assistant" text={text} streaming={streaming} />;
}

function ThinkingMessage({ text }: { text: string }) {
  return (
    <article className="max-w-[880px] border-l-2 border-hairline px-3 py-2 text-[0.8125rem] text-text-secondary">
      <span className="mr-2 font-semibold uppercase tracking-wide text-text-muted">
        Thinking
      </span>
      {text}
    </article>
  );
}

function ToolStatusFromTranscript({
  message,
  renderedToolCallIds,
}: {
  message: TranscriptMessage;
  renderedToolCallIds: Set<string>;
}) {
  const callId = message.toolCallId;
  if (callId && renderedToolCallIds.has(callId)) return null;
  if (callId) renderedToolCallIds.add(callId);
  const success = message.success !== false;
  return (
    <p
      className={cn(
        "pl-3 text-[0.8125rem]",
        success ? "text-success" : "text-danger"
      )}
    >
      {success ? "✓" : "✗"}{" "}
      {toolLabel(message.toolName || message.text || "tool", message.toolPath)}
    </p>
  );
}

function ToolStatusMessage({
  tool,
}: {
  tool: {
    callId: string;
    toolName: string;
    path?: string | null;
    status: "running" | "finished" | "failed";
    progressText?: string;
    success?: boolean;
  };
}) {
  const label = toolLabel(tool.toolName, tool.path);
  const prefix =
    tool.status === "running"
      ? "⏳"
      : tool.success === false
        ? "✗"
        : "✓";
  const suffix = tool.progressText ? ` — ${tool.progressText}` : "";

  return (
    <p
      className={cn(
        "pl-3 text-[0.8125rem]",
        tool.status === "failed" || tool.success === false
          ? "text-danger"
          : tool.status === "finished"
            ? "text-success"
            : "text-text-secondary"
      )}
    >
      {prefix} {label}
      {suffix}
    </p>
  );
}

function ToolResultMessage({ message }: { message: TranscriptMessage }) {
  return (
    <details className="max-w-[880px] rounded-md border border-hairline bg-surface px-3 py-2 text-[0.8125rem]">
      <summary className="cursor-pointer font-semibold text-text-secondary">
        Tool result: {toolLabel(message.toolName || "tool", message.toolPath)}
      </summary>
      <pre className="mt-2 whitespace-pre-wrap text-ink">{message.text || ""}</pre>
    </details>
  );
}

function MessageAction({
  children,
  onClick,
  disabled,
}: {
  children: string;
  onClick?: () => void;
  disabled?: boolean;
}) {
  return (
    <Button variant="ghost" className="min-h-7 px-2 py-1 text-[0.75rem]" disabled={disabled} onClick={onClick}>
      {children}
    </Button>
  );
}
