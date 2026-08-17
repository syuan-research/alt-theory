import { memo, useEffect, useMemo, useRef, useState } from "react";
import type {
  ActiveToolState,
  StreamPart,
  ToolDetail,
  TranscriptMessage,
} from "@/api/types";
import { useApp, useStreamParts } from "@/context/AppProvider";
import { useShell } from "@/context/ShellContext";
import { MarkdownBody } from "@/components/conversation/MarkdownBody";
import { fileName, toolLabel } from "@/lib/tools";
import { cn } from "@/lib/cn";
import { hasNativeBridge, pickDirectory, revealPath } from "@/lib/native";
import { t } from "@/i18n";
import { autosizeTextarea } from "@/lib/autosizeTextarea";
import { useStickToBottom } from "@/hooks/useStickToBottom";
import { useContextMenu, type ContextMenuItem } from "@/components/shell/ContextMenu";
import { copyText } from "@/lib/clipboard";

export function MessageList() {
  const app = useApp();
  const streamParts = useStreamParts();
  const {
    containerRef,
    stickRef: stickToBottomRef,
    onScroll,
  } = useStickToBottom([app.messages, streamParts]);
  const railRef = useRef<HTMLDivElement>(null);
  const [scrubbing, setScrubbing] = useState(false);
  const developer = app.transcriptView === "developer";

  const latestUserIndex = useMemo(() => {
    for (let i = app.messages.length - 1; i >= 0; i -= 1) {
      if (app.messages[i]?.role === "user") return i;
    }
    return -1;
  }, [app.messages]);
  const latestAssistantIndex = useMemo(() => {
    for (let i = app.messages.length - 1; i >= 0; i -= 1) {
      if (app.messages[i]?.role === "assistant") return i;
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

  const actions: TranscriptActions = useMemo(
    () => ({
      onEdit: (text, entryId) =>
        entryId && app.recovery?.userEntryId === entryId
          ? app.reviseLatestInPlace(text, entryId)
          : app.branchRevision(text, entryId ?? undefined),
      onPrepareCompare: (text, entryId) =>
        entryId ? app.prepareBranchRevision(text, entryId) : false,
      onRetry: app.retryLatest,
      isReplacementEdit: (entryId) =>
        Boolean(entryId && app.recovery?.userEntryId === entryId),
    }),
    [
      app.branchRevision,
      app.prepareBranchRevision,
      app.recovery,
      app.retryLatest,
      app.reviseLatestInPlace,
    ],
  );

  return (
    <div className="msgs-wrap">
    <div className="msgs" ref={containerRef} onScroll={onScroll}>
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
      <SettledMessages
        messages={app.messages}
        developer={developer}
        latestUserIndex={latestUserIndex}
        latestAssistantIndex={latestAssistantIndex}
        isRunning={app.isRunning}
        actions={actions}
      />

      <StreamPartsView parts={streamParts} developer={developer} />

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
 * The settled transcript, memoized as a whole: `messages` keeps its array
 * reference while an answer streams (deltas live in StreamContext), so the
 * token tick re-renders only the streaming tail below, never these rows
 * (perf backlog item 3 — the pattern cherry studio/openwebui use).
 */
export const SettledMessages = memo(function SettledMessages({
  messages,
  developer,
  latestUserIndex,
  latestAssistantIndex,
  isRunning,
  actions,
}: {
  messages: TranscriptMessage[];
  developer: boolean;
  latestUserIndex: number;
  latestAssistantIndex: number;
  isRunning: boolean;
  /** Absent in the right pane — bubbles render identically, no branching. */
  actions?: TranscriptActions;
}) {
  // Tool call/result dedupe, precomputed from the data: a render-time
  // mutable Set broke under memoization — a panel resize re-rendered the
  // entries (ShellContext consumers) without re-running this component,
  // so every tool row matched the stale Set and vanished.
  const duplicateToolCall = useMemo(() => {
    const seen = new Set<string>();
    return messages.map((message) => {
      const callId = message.role === "tool" ? message.toolCallId : undefined;
      if (!callId) return false;
      if (seen.has(callId)) return true;
      seen.add(callId);
      return false;
    });
  }, [messages]);
  let userOrdinal = -1;
  return messages.map((message, index) => {
    if (message.role === "user") userOrdinal += 1;
    return (
      <TranscriptEntry
        key={`${index}-${message.timestamp ?? message.text.slice(0, 12)}`}
        message={message}
        developer={developer}
        isLatestUser={index === latestUserIndex}
        isLatestAssistant={index === latestAssistantIndex}
        isDuplicateToolCall={duplicateToolCall[index]}
        userIndex={message.role === "user" ? userOrdinal : undefined}
        isRunning={isRunning}
        actions={actions}
      />
    );
  });
});

export function StreamPartsView({
  parts,
  developer,
}: {
  parts: StreamPart[];
  developer: boolean;
}) {
  const shell = useShell();
  return parts.map((part, index) => {
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
    if (part.kind === "notice") {
      return (
        <SysLine key={`sp-${index}`}>
          <i className="ph ph-arrows-clockwise" />
          {part.text}
        </SysLine>
      );
    }
    return <ToolLine key={part.tool.callId} tool={part.tool} />;
  });
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
  const menu = useContextMenu();

  const files = useMemo(() => {
    const totals = new Map<string, { added: number; removed: number }>();
    for (let i = app.messages.length - 1; i >= 0; i -= 1) {
      const message = app.messages[i];
      if (message.role === "user") break;
      if (message.role !== "tool" || !message.toolPath) continue;
      if (message.success === false) continue;
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
          onContextMenu={(event) => {
            const path = absoluteOrWorkspacePath(file.path, app.workspacePrimaryDir);
            menu.open(event, fileContextItems(path, shell));
          }}
          onKeyDown={(event) => {
            if (event.key !== "ContextMenu" && !(event.shiftKey && event.key === "F10")) return;
            event.preventDefault();
            const path = absoluteOrWorkspacePath(file.path, app.workspacePrimaryDir);
            const rect = event.currentTarget.getBoundingClientRect();
            menu.openAt(rect.left + 18, rect.bottom, fileContextItems(path, shell), event.currentTarget);
          }}
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
      {menu.element}
    </div>
  );
}

function absoluteOrWorkspacePath(path: string, workspace: string | null): string {
  if (/^(?:[A-Za-z]:[\\/]|\/)/.test(path) || !workspace) return path;
  const separator = workspace.includes("\\") ? "\\" : "/";
  return `${workspace.replace(/[\\/]+$/, "")}${separator}${path.replace(/[\\/]/g, separator)}`;
}

function fileContextItems(path: string, shell: ReturnType<typeof useShell>): ContextMenuItem[] {
  return [
    { label: t("Copy path"), icon: "ph-copy", onSelect: () => void copyText(path) },
    { label: t("Show in file tree"), icon: "ph-tree-structure", onSelect: () => shell.revealWorkspacePath(path) },
    ...(hasNativeBridge() ? [{ label: t("Show in file manager"), icon: "ph-folder-open", onSelect: () => void revealPath(path) }] : []),
  ];
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
      {toolLabel(
        tool.toolName,
        tool.path,
        tool.detail,
        tool.status === "running" ? "running" : tool.success === false ? "failed" : "finished",
      )}
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
 * Per-message actions. Absent in a side / comparison pane, where the bubbles
 * render identically but branching stays with the conversation in the center.
 */
export interface TranscriptActions {
  onEdit: (text: string, entryId: string | null) => boolean;
  onPrepareCompare: (text: string, entryId: string | null) => boolean;
  onRetry: () => boolean;
  isReplacementEdit: (entryId: string | null) => boolean;
}

export function TranscriptEntry({
  message,
  developer,
  isLatestUser,
  isDuplicateToolCall = false,
  userIndex,
  isRunning,
  actions,
}: {
  message: TranscriptMessage;
  developer: boolean;
  isLatestUser: boolean;
  isLatestAssistant?: boolean;
  /** Precomputed by SettledMessages: a later row for an already-shown call. */
  isDuplicateToolCall?: boolean;
  userIndex?: number;
  isRunning: boolean;
  actions?: TranscriptActions;
}) {
  const shell = useShell();
  const { thinkingExpanded, showThinking } = shell;

  if (message.role === "user") {
    const replacementEdit = actions?.isReplacementEdit(message.entryId ?? null) ?? false;
    return (
      <UserBubble
        text={message.text}
        entryId={message.entryId ?? null}
        isLatest={isLatestUser}
        isRunning={isRunning}
        onEdit={actions?.onEdit}
        onPrepareCompare={replacementEdit ? undefined : actions?.onPrepareCompare}
        onRetry={isLatestUser ? actions?.onRetry : undefined}
        replacementEdit={replacementEdit}
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
        <AssistantBubble text={message.text} />
      </>
    );
  }

  if (message.role === "tool") {
    if (isDuplicateToolCall) return null;
    const success = message.success !== false;
    return (
      <SysLine tone={success ? "ok" : "danger"} detail={message.toolDetail}>
        <i className={success ? "ph ph-check" : "ph ph-x"} />
        {toolLabel(
          message.toolName || message.text || "tool",
          message.toolPath,
          message.toolDetail,
          success ? "finished" : "failed",
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
  onPrepareCompare,
  onRetry,
  replacementEdit,
  userIndex,
}: {
  text: string;
  entryId: string | null;
  isLatest: boolean;
  isRunning: boolean;
  onEdit?: (text: string, entryId: string | null) => boolean;
  onPrepareCompare?: (text: string, entryId: string | null) => boolean;
  onRetry?: () => boolean;
  replacementEdit: boolean;
  userIndex?: number;
}) {
  const trimmed = (text || "").trim();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(trimmed);
  const [editWidth, setEditWidth] = useState<number | null>(null);
  const bubbleRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    if (editing) {
      autosizeTextarea(textareaRef.current);
      textareaRef.current?.focus();
    }
  }, [draft, editing]);
  if (!trimmed) return null;
  const canEdit = isLatest || Boolean(entryId);
  return (
    <div className="msg user" data-uidx={userIndex}>
      <div className="who">{t("You")}</div>
      <div
        ref={bubbleRef}
        className="bubble"
        style={editing && editWidth ? { width: editWidth, boxSizing: "border-box" } : undefined}
      >
        {editing ? (
          <textarea
            ref={textareaRef}
            className="inline-edit-textarea"
            rows={1}
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
          />
        ) : <MarkdownBody text={trimmed} />}
      </div>
      {editing ? (
        <div className="inline-edit-actions">
          <button className="flat" onClick={() => (setDraft(trimmed), setEditing(false))}>
            {t("Cancel")}
          </button>
          {entryId && onPrepareCompare ? (
            <button
              className="flat"
              onClick={() => onPrepareCompare(draft, entryId) && setEditing(false)}
            >
              {t("Adjust model or role…")}
            </button>
          ) : null}
          <button
            className="send"
            disabled={!draft.trim() || isRunning}
            onClick={() => onEdit?.(draft, entryId) && setEditing(false)}
          >
            {t("Send")}
          </button>
        </div>
      ) : null}
      <div className="msg-actions">
        <button
          title={t("Copy")}
          aria-label={t("Copy message")}
          onClick={() => void navigator.clipboard?.writeText(trimmed)}
        >
          <i className="ph ph-copy" aria-hidden="true" />
        </button>
        {onRetry ? (
          <button
            title={t("Retry latest message")}
            aria-label={t("Retry latest message")}
            disabled={isRunning}
            onClick={onRetry}
          >
            <i className="ph ph-arrow-clockwise" aria-hidden="true" />
          </button>
        ) : null}
        {canEdit && onEdit ? (
          <span className="edit-action-cluster">
            <button
              title={
                replacementEdit
                  ? t("Edit and retry")
                  : t("Edit and compare")
              }
              aria-label={replacementEdit ? t("Edit and retry") : t("Edit and compare")}
              disabled={isRunning}
              onClick={() => {
                setEditWidth(bubbleRef.current?.getBoundingClientRect().width ?? null);
                setEditing(true);
              }}
            >
              <i className="ph ph-pencil-simple" aria-hidden="true" />
            </button>
            {entryId && onPrepareCompare ? (
              <button
                className="edit-setup-action"
                title={t("Adjust model or role before comparing")}
                aria-label={t("Adjust model or role before comparing")}
                disabled={isRunning}
                onClick={() => onPrepareCompare(trimmed, entryId)}
              >
                {t("Adjust model or role…")}
              </button>
            ) : null}
          </span>
        ) : null}
      </div>
    </div>
  );
}

export function AssistantBubble({
  text,
  streaming,
}: {
  text: string;
  streaming?: boolean;
}) {
  // v0.5 streams raw text (no trim) so trailing newlines do not thrash layout.
  const raw = text || "";
  const trimmed = raw.trim();
  if (streaming ? !raw : !trimmed) return null;
  const body = streaming ? raw : trimmed;
  return (
    <div className="msg assistant">
      <div className="who">{streaming ? t("Alt · typing…") : t("Alt")}</div>
      <div className="bubble">
        <MarkdownBody
          text={body}
          renderMermaid={!streaming}
          streaming={Boolean(streaming)}
        />
      </div>
      {!streaming ? (
        <div className="msg-actions">
          <button
            title={t("Copy")}
            aria-label={t("Copy message")}
            onClick={() => void navigator.clipboard?.writeText(trimmed)}
          >
            <i className="ph ph-copy" aria-hidden="true" />
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
