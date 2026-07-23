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
  const railRef = useRef<HTMLDivElement>(null);
  const [scrubbing, setScrubbing] = useState(false);
  const developer = app.transcriptView === "developer";

  const latestUserIndex = useMemo(() => {
    for (let i = app.messages.length - 1; i >= 0; i -= 1) {
      if (app.messages[i]?.role === "user") return i;
    }
    return -1;
  }, [app.messages]);

  const userMessageCount = useMemo(
    () => app.messages.filter((message) => message.role === "user").length,
    [app.messages]
  );

  // Map a pointer position on the rail to a user message and scroll to it.
  const scrubTo = (clientY: number) => {
    const rail = railRef.current;
    const container = containerRef.current;
    if (!rail || !container || userMessageCount === 0) return;
    const rect = rail.getBoundingClientRect();
    const ratio = Math.min(
      1,
      Math.max(0, (clientY - rect.top) / Math.max(1, rect.height))
    );
    const index = Math.round(ratio * (userMessageCount - 1));
    const target = container.querySelector(`[data-uidx="${index}"]`);
    if (target instanceof HTMLElement) {
      container.scrollTop = target.offsetTop - container.offsetTop - 8;
    }
  };

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 120;
    if (nearBottom) el.scrollTop = el.scrollHeight;
  }, [app.messages, app.streamParts]);

  const renderedToolCallIds = new Set<string>();
  let userOrdinal = -1;

  return (
    <div className="msgs-wrap">
    <div className="msgs" ref={containerRef}>
      {app.sessionId && !app.selectors.soulSlug ? (
        <SysLine>
          <i className="ph ph-warning" />
          Soul not loaded — this conversation runs without Alt&apos;s persona.
        </SysLine>
      ) : null}
      {app.sessionWarnings.map((warning) => (
        <SysLine key={warning}>
          <i className="ph ph-warning" />
          {warning}
        </SysLine>
      ))}
      {app.messages.map((message, index) => {
        if (message.role === "user") userOrdinal += 1;
        return (
          <TranscriptEntry
            key={`${index}-${message.timestamp ?? message.text.slice(0, 12)}`}
            message={message}
            developer={developer}
            isLatestUser={index === latestUserIndex}
            renderedToolCallIds={renderedToolCallIds}
            userIndex={message.role === "user" ? userOrdinal : undefined}
          />
        );
      })}

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
          if (!developer && !shell.showThinking) return null;
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
    {userMessageCount > 1 ? (
      <div
        className={cn("scrub-rail", scrubbing && "dragging")}
        ref={railRef}
        onPointerDown={(event) => {
          event.preventDefault();
          event.currentTarget.setPointerCapture?.(event.pointerId);
          setScrubbing(true);
          scrubTo(event.clientY);
        }}
        onPointerMove={(event) => {
          if (scrubbing) scrubTo(event.clientY);
        }}
        onPointerUp={() => setScrubbing(false)}
        onPointerCancel={() => setScrubbing(false)}
      >
        {Array.from({ length: userMessageCount }, (_, tick) => (
          <span key={tick} className="tick" />
        ))}
      </div>
    ) : null}
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

/**
 * One-time explanation before a history-rewriting action. Shown once per
 * action kind (localStorage flag), then the action runs directly.
 */
function confirmOnce(
  app: ReturnType<typeof useApp>,
  key: string,
  message: string,
  action: () => void
) {
  let seen = false;
  try {
    seen = Boolean(localStorage.getItem(key));
  } catch {
    seen = true;
  }
  if (seen) return action();
  app.requestConfirm({
    message,
    confirmLabel: "Continue",
    onConfirm: () => {
      try {
        localStorage.setItem(key, "1");
      } catch {
        /* ignore */
      }
      action();
    },
  });
}

function TranscriptEntry({
  message,
  developer,
  isLatestUser,
  renderedToolCallIds,
  userIndex,
}: {
  message: TranscriptMessage;
  developer: boolean;
  isLatestUser: boolean;
  renderedToolCallIds: Set<string>;
  userIndex?: number;
}) {
  const app = useApp();
  const { thinkingExpanded, showThinking } = useShell();

  const editMessage = (text: string, entryId: string | null) => {
    const start = () => app.startReviseMode(text, entryId ?? undefined);
    if (isLatestUser) return start();
    confirmOnce(
      app,
      "alt-theory-hint-edit",
      `Editing rewrites the conversation from this message: Alt answers again, and everything after it becomes a previous version — kept, not deleted.${
        app.sessionMode === "full"
          ? " Files already changed on disk are not reverted."
          : ""
      }`,
      start
    );
  };

  const branchMessage = (entryId: string) => {
    confirmOnce(
      app,
      "alt-theory-hint-branch",
      "This starts a new conversation branching from this point. The current conversation stays unchanged.",
      () => app.branchFromEntry(entryId)
    );
  };

  if (message.role === "user") {
    return (
      <UserBubble
        text={message.text}
        entryId={message.entryId ?? null}
        isLatest={isLatestUser}
        isRunning={app.isRunning}
        onEdit={editMessage}
        onBranch={branchMessage}
        userIndex={userIndex}
      />
    );
  }

  if (message.role === "assistant") {
    return (
      <>
        {(developer || showThinking) && message.thinking ? (
          <ThinkingBlock text={message.thinking} defaultOpen={thinkingExpanded} />
        ) : null}
        <AssistantBubble
          text={message.text}
          entryId={message.entryId ?? null}
          isRunning={app.isRunning}
          onBranch={branchMessage}
        />
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
    if (message.marker === "imported-context") {
      return (
        <details className="think-block">
          <summary>
            <i className="ph ph-file-text" aria-hidden="true" /> Imported{" "}
            {message.sourceRole || "instruction"} context
          </summary>
          <div className="think-body">{message.text}</div>
        </details>
      );
    }
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
  entryId,
  isLatest,
  isRunning,
  onEdit,
  onBranch,
  userIndex,
}: {
  text: string;
  entryId: string | null;
  isLatest: boolean;
  isRunning: boolean;
  onEdit: (text: string, entryId: string | null) => void;
  onBranch: (entryId: string) => void;
  userIndex?: number;
}) {
  const trimmed = (text || "").trim();
  if (!trimmed) return null;
  // Latest turn can always be edited (reviseLatest path); earlier turns need
  // their Pi entry id, which old transcripts may not carry.
  const canEdit = isLatest || Boolean(entryId);
  return (
    <div className="msg user" data-uidx={userIndex}>
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
        {canEdit ? (
          <button
            title="Edit"
            aria-label="Edit message and rewrite from here"
            disabled={isRunning}
            onClick={() => onEdit(trimmed, entryId)}
          >
            <i className="ph ph-pencil-simple" aria-hidden="true" />
          </button>
        ) : null}
        {entryId ? (
          <button
            title="Branch from here"
            aria-label="Branch a new conversation from here"
            disabled={isRunning}
            onClick={() => onBranch(entryId)}
          >
            <i className="ph ph-git-branch" aria-hidden="true" />
          </button>
        ) : null}
      </div>
    </div>
  );
}

function AssistantBubble({
  text,
  streaming,
  entryId,
  isRunning,
  onBranch,
}: {
  text: string;
  streaming?: boolean;
  entryId?: string | null;
  isRunning?: boolean;
  onBranch?: (entryId: string) => void;
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
      {onBranch && entryId ? (
        <div className="msg-actions">
          <button
            title="Copy"
            aria-label="Copy message"
            onClick={() => void navigator.clipboard?.writeText(trimmed)}
          >
            <i className="ph ph-copy" aria-hidden="true" />
          </button>
          <button
            title="Branch from here"
            aria-label="Branch a new conversation from here"
            disabled={isRunning}
            onClick={() => onBranch(entryId)}
          >
            <i className="ph ph-git-branch" aria-hidden="true" />
          </button>
        </div>
      ) : null}
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
