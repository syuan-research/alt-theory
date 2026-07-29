import { useLayoutEffect, useMemo, useRef, useState } from "react";
import type { ActiveToolState, ToolDetail, TranscriptMessage } from "@/api/types";
import { useApp } from "@/context/AppProvider";
import { useShell } from "@/context/ShellContext";
import { MarkdownBody } from "@/components/conversation/MarkdownBody";
import { fileName, toolLabel } from "@/lib/tools";
import { cn } from "@/lib/cn";
import { pickDirectory } from "@/lib/native";
import { t } from "@/i18n";

export function MessageList() {
  const app = useApp();
  const shell = useShell();
  const containerRef = useRef<HTMLDivElement>(null);
  const railRef = useRef<HTMLDivElement>(null);
  const stickToBottomRef = useRef(true);
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
    [app.messages],
  );

  // Map a pointer position on the rail to a user message and scroll to it.
  const scrubTo = (clientY: number) => {
    const rail = railRef.current;
    const container = containerRef.current;
    if (!rail || !container || userMessageCount === 0) return;
    const rect = rail.getBoundingClientRect();
    const ratio = Math.min(
      1,
      Math.max(0, (clientY - rect.top) / Math.max(1, rect.height)),
    );
    if (ratio >= 0.9) {
      stickToBottomRef.current = true;
      container.scrollTop = container.scrollHeight;
      return;
    }
    stickToBottomRef.current = false;
    const index = Math.round(ratio * (userMessageCount - 1));
    const target = container.querySelector(`[data-uidx="${index}"]`);
    if (target instanceof HTMLElement) {
      container.scrollTop = target.offsetTop - container.offsetTop - 8;
    }
  };

  useLayoutEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    if (stickToBottomRef.current) el.scrollTop = el.scrollHeight;
  }, [app.messages, app.streamParts]);

  const renderedToolCallIds = new Set<string>();
  let userOrdinal = -1;

  return (
    <div className="msgs-wrap">
    <div className="msgs" ref={containerRef}
        onScroll={(event) => {
          const el = event.currentTarget;
          stickToBottomRef.current =
            el.scrollHeight - el.scrollTop - el.clientHeight < 120;
        }}>
      {app.sessionId && !app.selectors.soulSlug ? (
        <SysLine>
          <i className="ph ph-warning" />
          {t("Soul not loaded — this conversation runs without Alt's persona.")}
        </SysLine>
      ) : null}
      {app.sessionWarnings.map((warning) =>
        // ponytail: the dead-folder notice is matched by its distinctive phrase
        // (backend session-service pushes it verbatim). Keep the strings in sync.
        /working folder .* no longer exists/.test(warning) ? (
          <StaleWorkspaceNotice key={warning} warning={warning} />
        ) : (
          <SysLine key={warning}>
            <i className="ph ph-warning" />
            {warning}
          </SysLine>
        ),
      )}
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

      {app.streamParts.map((part, index) => {
        if (part.kind === "text") {
          return ( <AssistantBubble key={`sp-${index}`} text={part.text} streaming />
            );
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
        if (part.kind === "notice") {
          return (
            <SysLine key={`sp-${index}`}>
              <i className="ph ph-arrows-clockwise" />
              {part.text}
            </SysLine>
          );
        }
        return <ToolLine key={part.tool.callId} tool={part.tool} />;
      })}

      <TurnChangesCard />
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

/**
 * What the last turn changed on disk (v1.3.0-alpha.3).
 *
 * Machine facts only — file names and line counts, no interpretation and no
 * claim about sources. Counted from the turn's own tool calls rather than the
 * session-wide changes projection, so the numbers belong to this turn.
 * Imported history carries no tool log, so nothing renders there.
 */
function TurnChangesCard() {
  const app = useApp();
  const shell = useShell();

  const files = useMemo(() => {
    const totals = new Map<string, { added: number; removed: number }>();
    for (let i = app.messages.length - 1; i >= 0; i -= 1) {
      const message = app.messages[i];
      if (message.role === "user") break;
      if (message.role !== "tool" || !message.toolPath) continue;
      const detail = message.toolDetail;
      if (!detail || detail.kind === "command" || detail.kind === "skill") continue;
      const entry = totals.get(message.toolPath) ?? { added: 0, removed: 0 };
      if (detail.passages) {
        for (const passage of detail.passages) {
          entry.removed += countLines(passage.before);
          entry.added += countLines(passage.after);
        }
      } else if (detail.kind === "prose") {
        entry.added += countLines(detail.body);
      } else {
        for (const line of detail.body.split("\n")) {
          if (line.startsWith("+")) entry.added += 1;
          else if (line.startsWith("-")) entry.removed += 1;
        }
      }
      totals.set(message.toolPath, entry);
    }
    return [...totals.entries()].map(([path, counts]) => ({ path, ...counts }));
  }, [app.messages]);

  if (app.isRunning || files.length === 0) return null;

  return (
    <div className="turn-changes">
      <span className="tc-head">
        <i className="ph ph-pencil-simple-line" aria-hidden="true" />
        {files.length === 1 ? t("1 file changed") : t("{count} files changed", { count: files.length })}
      </span>
      {files.map((file) => (
        <button
          key={file.path}
          className="tc-file"
          onClick={() => {
            shell.openRail("changes");
            shell.openSub({ key: `changes:${file.path}`, title: file.path });
          }}
        >
          <span className="tc-name">{fileName(file.path)}</span>
          {file.added ? <span className="tc-add">+{file.added}</span> : null}
          {file.removed ? <span className="tc-del">−{file.removed}</span> : null}
        </button>
      ))}
    </div>
  );
}

function countLines(text: string): number {
  return text.trim() ? text.split(/\r?\n/).length : 0;
}

function ToolLine({ tool }: { tool: ActiveToolState }) {
  return (
    <SysLine
      detail={tool.status === "running" ? null : tool.detail}
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
      {toolLabel(tool.toolName, tool.path, tool.detail)}
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
        <i className="ph ph-brain" aria-hidden="true" /> {t("Thinking")}
      </summary>
      <MarkdownBody className="think-body" text={text} renderMermaid={false} />
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
  action: () => void,
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
    confirmLabel: t("Continue"),
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
  const shell = useShell();
  const { thinkingExpanded, showThinking } = shell;

  const editMessage = (text: string, entryId: string | null) => {
    const start = () => app.startReviseMode(text, entryId ?? undefined);
    if (isLatestUser) return start();
    const msg = app.sessionMode === "full"
      ? t("Rewording a question often changes the answer more than you'd expect. Your edit opens a new branch from this point and Alt answers there — this conversation stays whole, so you can compare the two. Files already changed on disk are not reverted.")
      : t("Rewording a question often changes the answer more than you'd expect. Your edit opens a new branch from this point and Alt answers there — this conversation stays whole, so you can compare the two.");
    confirmOnce(
      app,
      "alt-theory-hint-edit",
      msg,
      start,
    );
  };

  const branchMessage = (entryId: string) => {
    confirmOnce(
      app,
      "alt-theory-hint-branch",
      t("This starts a new conversation branching from this point. The current conversation stays unchanged."),
      () => app.branchFromEntry(entryId),
    );
  };

  const trySamePrompt = (text: string, entryId: string | null) => {
    confirmOnce(
      app,
      "alt-theory-hint-try-same",
      t("The same question can get a genuinely different answer — comparing a second take shows what holds steady and what was one framing among several. This opens a new branch; the answer here stays."),
      () => {
        if (app.branchRevision(text, entryId ?? undefined)) {
          shell.openRail("chats");
        }
      },
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
        onTrySame={trySamePrompt}
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
      <SysLine tone={success ? "ok" : "danger"} detail={message.toolDetail}>
        <i className={success ? "ph ph-check" : "ph ph-x"} />
        {toolLabel(
          message.toolName || message.text || "tool",
          message.toolPath,
          message.toolDetail,
        )}
      </SysLine>
    );
  }

  if (message.role === "system") {
    if (message.marker === "imported-context") {
      return (
        <details className="think-block">
          <summary>
            <i className="ph ph-file-text" aria-hidden="true" /> {t("Imported {role} context", { role: message.sourceRole || "instruction" })}
          </summary>
          <div className="think-body">{message.text}</div>
        </details>
      );
    }
    if (message.marker === "compaction") {
      return (
        <details className="compact-summary">
          <summary>
            <span>{t("Conversation compressed here")}</span>
          </summary>
          <div className="compact-summary-body">{message.text}</div>
        </details>
      );
    }
    if (message.marker === "retry-boundary") {
      return (
        <SysLine>
          <i className="ph ph-arrows-clockwise" />
          {message.text}
        </SysLine>
      );
    }
    if (message.marker === "agent-team") {
      return (
        <SysLine>
          <i className="ph ph-users-three" />
          {message.text}
        </SysLine>
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
  onTrySame,
  userIndex,
}: {
  text: string;
  entryId: string | null;
  isLatest: boolean;
  isRunning: boolean;
  onEdit: (text: string, entryId: string | null) => void;
  onTrySame: (text: string, entryId: string | null) => void;
  userIndex?: number;
}) {
  const trimmed = (text || "").trim();
  if (!trimmed) return null;
  // Latest turn can always be edited (reviseLatest path); earlier turns need
  // their Pi entry id, which old transcripts may not carry.
  const canEdit = isLatest || Boolean(entryId);
  return (
    <div className="msg user" data-uidx={userIndex}>
      <div className="who">{t("You")}</div>
      <div className="bubble">
        <MarkdownBody text={trimmed} />
      </div>
      <div className="msg-actions">
        <button
          title={t("Copy")}
          aria-label={t("Copy message")}
          onClick={() => void navigator.clipboard?.writeText(trimmed)}
        >
          <i className="ph ph-copy" aria-hidden="true" />
        </button>
        {canEdit ? (
          <button
            title={t("Edit and ask again (opens a new branch; this conversation stays)")}
            aria-label={t("Edit message and ask again in a new branch")}
            disabled={isRunning}
            onClick={() => onEdit(trimmed, entryId)}
          >
            <i className="ph ph-pencil-simple" aria-hidden="true" />
          </button>
        ) : null}
        <button
          title={t("Ask the same question again (opens a new branch; this answer stays)")}
          aria-label={t("Ask the same question again in a new branch")}
          disabled={isRunning}
          onClick={() => onTrySame(trimmed, entryId)}
        >
          <i className="ph ph-arrow-counter-clockwise" aria-hidden="true" />
        </button>
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
      <div className="who">{streaming ? t("Alt · typing…") : t("Alt")}</div>
      <div className="bubble">
        <MarkdownBody text={trimmed} renderMermaid={!streaming} />
      </div>
      {onBranch && entryId ? (
        <div className="msg-actions">
          <button
            title={t("Copy")}
            aria-label={t("Copy message")}
            onClick={() => void navigator.clipboard?.writeText(trimmed)}
          >
            <i className="ph ph-copy" aria-hidden="true" />
          </button>
          <button
            title={t("Branch from here")}
            aria-label={t("Branch a new conversation from here")}
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

// Actionable version of the stale-workspace resume warning (item 4): the
// backend opens the session without a dead cwd; this gives the user the two
// decided choices right in the conversation — re-pick a folder, or dismiss and
// continue without one — instead of a passive notice.
function StaleWorkspaceNotice({ warning }: { warning: string }) {
  const app = useApp();
  const [dismissed, setDismissed] = useState(false);
  if (dismissed) return null;

  const choose = () => {
    if (!app.sessionId) return;
    void pickDirectory(
      t("Full path of the working folder for this conversation:"),
    ).then((path) => {
      if (!path || !app.sessionId) return;
      void app.repointSession(app.sessionId, path).catch((error) => {
        window.alert(error instanceof Error ? error.message : String(error));
      });
    });
  };

  return (
    <SysLine tone="danger">
      <i className="ph ph-warning" />
      <span style={{ flex: 1 }}>{warning}</span>
      <button className="link-btn" onClick={choose}>
        {t("Choose folder…")}
      </button>
      <button className="link-btn" onClick={() => setDismissed(true)}>
        {t("Continue without")}
      </button>
    </SysLine>
  );
}

function SysLine({
  children,
  tone,
  detail,
}: {
  children: React.ReactNode;
  tone?: "danger" | "ok" | "running";
  /** When present the line becomes expandable — see ToolDetailBody. */
  detail?: ToolDetail | null;
}) {
  const className = cn(
    "sys-line",
    tone === "danger" && "sys-danger",
    tone === "ok" && "sys-ok",
    tone === "running" && "sys-running",
  );
  if (!detail || detail.kind === "skill") {
    return <div className={className}>{children}</div>;
  }
  return (
    <details className={cn(className, "sys-detail")}>
      <summary>{children}</summary>
      <ToolDetailBody detail={detail} />
    </details>
  );
}

/**
 * The expandable half of a tool line, layered by the KIND of change rather
 * than by depth: prose is read as prose, code as a diff, a command as itself.
 * A researcher checking whether a plan document says the right thing should
 * not have to read "+120 −3".
 */
function ToolDetailBody({ detail }: { detail: ToolDetail }) {
  if (detail.kind === "command") {
    return <pre className="tool-detail cmd">{detail.body}</pre>;
  }
  if (detail.kind === "prose") {
    if (detail.passages?.length) {
      return (
        <div className="tool-detail">
          {detail.passages.map((passage, index) => (
            <div className="passage" key={index}>
              <div className="passage-before">{passage.before}</div>
              <div className="passage-after">{passage.after}</div>
            </div>
          ))}
        </div>
      );
    }
    return (
      <MarkdownBody className="tool-detail" text={detail.body} />
    );
  }
  return (
    <div className="tool-detail">
      {detail.body.split("\n").map((line, index) => (
        <div
          key={index}
          className={cn(
            "diffline",
            line.startsWith("+") && "add",
            line.startsWith("-") && "del",
          )}
        >
          {line}
        </div>
      ))}
    </div>
  );
}
