import { memo, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type {
  ActiveToolState,
  StreamPart,
  ToolDetail,
} from "@/api/types";
import { useApp } from "@/context/AppProvider";
import { useConversationContext, useTurnParts } from "@/context/ConversationContext";
import { useMainView } from "@/context/MainView";
import { PendingMark } from "@/components/ui/PendingMark";
import type { DisplayMessage } from "@/lib/conversation";
import { useShell } from "@/context/ShellContext";
import { MarkdownBody } from "@/components/conversation/MarkdownBody";
import { fileName, toolLabel, toolResultText } from "@/lib/tools";
import { fetchToolResult } from "@/api/sessions";
import { cn } from "@/lib/cn";
import { hasNativeBridge, pickDirectory, revealPath } from "@/lib/native";
import { shouldToggleCollapseOnClick } from "@/lib/collapseAnywhere";
import { replyStopLine, retryDroppedLine } from "@/lib/replyStop";
import { toolOutcome, type ToolOutcome } from "@/lib/toolOutcome";
import { t } from "@/i18n";
import { autosizeTextarea } from "@/lib/autosizeTextarea";
import { useStickToBottom } from "@/hooks/useStickToBottom";
import { useEarlierRows } from "@/hooks/useEarlierRows";
import { useContextMenu, type ContextMenuItem } from "@/components/shell/ContextMenu";
import { copyText } from "@/lib/clipboard";
import { useFindTarget } from "@/lib/find";

export function MessageList() {
  const app = useApp();
  const main = useMainView();
  const conv = useConversationContext();
  const streamParts = useTurnParts();
  const messages = conv.messages;
  const {
    containerRef,
    stickRef: stickToBottomRef,
    onScroll,
  } = useStickToBottom([messages, streamParts]);
  const earlier = useEarlierRows(containerRef, messages, conv);
  useFindTarget(containerRef, earlier.findSpec);
  const railRef = useRef<HTMLDivElement>(null);
  const [scrubbing, setScrubbing] = useState(false);
  /** The user row under the pointer while dragging the rail: its preview shows at `y`. */
  const [scrubTip, setScrubTip] = useState<{ rowId: string; preview: string; y: number } | null>(null);
  /** A released rail jump to a row not loaded yet: loads down to it, then scrolls. */
  const [jumpTo, setJumpTo] = useState<string | null>(null);
  const developer = app.transcriptView === "developer";

  const latestUserIndex = useMemo(() => {
    for (let i = messages.length - 1; i >= 0; i -= 1) {
      if (messages[i]?.role === "user") return i;
    }
    return -1;
  }, [messages]);
  const latestAssistantIndex = useMemo(() => {
    for (let i = messages.length - 1; i >= 0; i -= 1) {
      if (messages[i]?.role === "assistant") return i;
    }
    return -1;
  }, [messages]);

  // Every user row of the conversation, loaded or not (WP 2.2 ii).
  const userRows = conv.userRows;
  const scrollToRow = (rowId: string) => {
    const container = containerRef.current;
    const target = container?.querySelector(`[data-row="${CSS.escape(rowId)}"]`);
    if (!container || !(target instanceof HTMLElement)) return false;
    stickToBottomRef.current = false;
    container.scrollTop = target.offsetTop - container.offsetTop - 8;
    return true;
  };

  // Map a pointer position on the rail to a user message: a loaded one
  // scrolls into view while dragging; one not loaded yet shows only its
  // preview, and loads (everything down to it) on release.
  const scrubTo = (clientY: number, release = false) => {
    const rail = railRef.current;
    const container = containerRef.current;
    if (!rail || !container || userRows.length === 0) return;
    const rect = rail.getBoundingClientRect();
    const ratio = Math.min(
      1,
      Math.max(0, (clientY - rect.top) / Math.max(1, rect.height)),
    );
    if (ratio >= 0.9) {
      setScrubTip(null);
      stickToBottomRef.current = true;
      container.scrollTop = container.scrollHeight;
      return;
    }
    const row = userRows[Math.round(ratio * (userRows.length - 1))];
    setScrubTip(release ? null : { ...row, y: clientY - rect.top + rail.offsetTop });
    if (scrollToRow(row.rowId)) return;
    if (release) {
      setJumpTo(row.rowId);
      conv.loadEarlier(row.rowId);
    }
  };
  // The jump's rows landed (after the anchor kept the view): go there. A
  // page already in flight when the jump was asked delays it one round.
  // A jump the server refuses (the row is gone) is not asked again.
  const jumpRetried = useRef(false);
  useLayoutEffect(() => {
    if (!jumpTo) {
      jumpRetried.current = false;
      return;
    }
    if (scrollToRow(jumpTo)) setJumpTo(null);
    else if (!conv.loadingEarlier && (jumpRetried.current || !conv.loadEarlier(jumpTo))) setJumpTo(null);
    else if (!conv.loadingEarlier) jumpRetried.current = true;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jumpTo, messages, conv.loadingEarlier]);

  // The callbacks read the latest conversation through a ref, so the settled
  // list's memo holds while the composer, run phase or queue move (perf plan
  // WP 1.9); only what the rows render from is a dependency.
  const latestRef = useRef({ conv, main });
  latestRef.current = { conv, main };
  const recoveryEntryId = conv.recovery?.userEntryId ?? null;
  const actions: TranscriptActions = useMemo(
    () => ({
      onEdit: (text, entryId) => {
        const { conv, main } = latestRef.current;
        return entryId && conv.recovery?.userEntryId === entryId
          ? Boolean(text.trim()) && !conv.isRunning && conv.reviseLatest(text, entryId)
          : main.branchRevision(text, entryId ?? undefined);
      },
      onPrepareCompare: (text, entryId) =>
        entryId ? latestRef.current.main.prepareBranchRevision(text, entryId) : false,
      onRetry: () => {
        const { conv } = latestRef.current;
        return Boolean(conv.sessionId) && !conv.isRunning && conv.retryLatest();
      },
      isReplacementEdit: (entryId) => Boolean(entryId && recoveryEntryId === entryId),
    }),
    [recoveryEntryId],
  );

  return (
    <div className="msgs-wrap">
    <div
      className="msgs"
      ref={containerRef}
      onScroll={(event) => {
        onScroll(event);
        earlier.onScroll();
      }}
    >
      {conv.sessionId && !conv.selectors.soulSlug ? (
        <SysLine>
          <i className="ph ph-warning" />
          {t("Soul not loaded — this conversation runs without Alt's persona.")}
        </SysLine>
      ) : null}
      {conv.sessionWarnings.map((warning) =>
        // ponytail: the dead-folder notice is matched by its distinctive phrase
        // (backend session-service pushes it verbatim). Keep the strings in sync.
        /main folder .* no longer exists/.test(warning) ? (
          <StaleWorkspaceNotice key={warning} warning={warning} />
        ) : (
          <SysLine key={warning}>
            <i className="ph ph-warning" />
            {warning}
          </SysLine>
        ),
      )}
      <SettledMessages
        messages={messages}
        developer={developer}
        latestUserIndex={latestUserIndex}
        latestAssistantIndex={latestAssistantIndex}
        isRunning={conv.isRunning}
        actions={actions}
      />

      <StreamPartsView parts={streamParts} developer={developer} />

      <TurnChangesCard />
    </div>
    {userRows.length > 1 ? (
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
        onPointerUp={(event) => {
          setScrubbing(false);
          scrubTo(event.clientY, true);
        }}
        onPointerCancel={() => {
          setScrubbing(false);
          setScrubTip(null);
        }}
      >
        {userRows.map((row) => (
          <span key={row.rowId} className="tick" />
        ))}
      </div>
    ) : null}
    {scrubbing && scrubTip?.preview ? (
      <div className="scrub-tip" style={{ top: scrubTip.y }}>
        {scrubTip.preview}
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
  messages: DisplayMessage[];
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
  // A stopped/failed assistant is filtered from the model's context as a
  // whole message, so its consecutive rows (same entryId + stop reason) form
  // one tinted range with a single line at the end — not one line per block.
  const segments = useMemo(() => {
    const result: (
      | { kind: "solo"; index: number }
      | { kind: "range"; cause: "aborted" | "error"; indexes: number[] }
    )[] = [];
    let index = 0;
    while (index < messages.length) {
      const { stopReason, entryId } = messages[index];
      if (stopReason !== "aborted" && stopReason !== "error") {
        result.push({ kind: "solo", index });
        index += 1;
        continue;
      }
      const indexes: number[] = [];
      while (
        index < messages.length &&
        messages[index].stopReason === stopReason &&
        messages[index].entryId === entryId
      ) {
        indexes.push(index);
        index += 1;
      }
      result.push({ kind: "range", cause: stopReason, indexes });
    }
    return result;
  }, [messages]);
  const entryAt = (index: number) => {
    const message = messages[index];
    return (
      <TranscriptEntry
        // The server's stable row id (one entry can make several rows); a
        // pending bubble keys by its request, so the swap to the settled row
        // is one replacement, not a reshuffle.
        key={message.rowId ?? `${index}-${message.timestamp ?? message.text.slice(0, 12)}`}
        message={message}
        developer={developer}
        isLatestUser={index === latestUserIndex}
        isLatestAssistant={index === latestAssistantIndex}
        isDuplicateToolCall={duplicateToolCall[index]}
        isRunning={isRunning}
        actions={actions}
      />
    );
  };
  return segments.map((segment) => {
    if (segment.kind === "solo") return entryAt(segment.index);
    return (
      <div
        key={`range-${messages[segment.indexes[0]].rowId ?? segment.indexes[0]}`}
        className={`reply-range ${segment.cause}`}
      >
        {segment.indexes.map(entryAt)}
        <div className="reply-range-line" data-find-skip="">{replyStopLine(segment.cause)}</div>
      </div>
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
      return <div key={`sp-${index}`} className="reply-stop" data-find-skip="">{retryDroppedLine()}</div>;
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
  const conv = useConversationContext();
  const shell = useShell();
  const menu = useContextMenu();

  const files = useMemo(() => {
    const totals = new Map<string, { added: number; removed: number }>();
    for (let i = conv.messages.length - 1; i >= 0; i -= 1) {
      const message = conv.messages[i];
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
  }, [conv.messages]);

  if (conv.isRunning || files.length === 0) return null;

  return (
    <div className="turn-changes" data-find-skip="">
      <span className="tc-head">
        <i className="ph ph-pencil-simple-line" aria-hidden="true" />
        {files.length === 1 ? t("1 file changed") : t("{count} files changed", { count: files.length })}
      </span>
      {files.map((file) => (
        <button
          key={file.path}
          className="tc-file"
          onContextMenu={(event) => {
            const path = absoluteOrWorkspacePath(file.path, conv.workspacePrimaryDir);
            menu.open(event, fileContextItems(path, shell));
          }}
          onKeyDown={(event) => {
            if (event.key !== "ContextMenu" && !(event.shiftKey && event.key === "F10")) return;
            event.preventDefault();
            const path = absoluteOrWorkspacePath(file.path, conv.workspacePrimaryDir);
            const rect = event.currentTarget.getBoundingClientRect();
            menu.openAt(rect.left + 18, rect.bottom, fileContextItems(path, shell), event.currentTarget);
          }}
          onClick={() => {
            // The change of the conversation drawn here (center or side).
            if (conv.sessionId) {
              shell.openTarget({ kind: "change", sessionId: conv.sessionId, path: file.path, title: file.path });
            }
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

/** A tool row's mark and tone follow its outcome; pending stays neutral —
 * the reason the call never ran is said by the reply's own range line. */
const TOOL_ICON: Record<ToolOutcome, string> = {
  running: "ph ph-circle-notch",
  finished: "ph ph-check",
  failed: "ph ph-x",
  pending: "ph ph-minus",
};
const TOOL_TONE: Record<ToolOutcome, "danger" | "ok" | "running" | "pending"> = {
  running: "running",
  finished: "ok",
  failed: "danger",
  pending: "pending",
};

function ToolLine({ tool }: { tool: ActiveToolState }) {
  const outcome = toolOutcome({ running: tool.status === "running", success: tool.success });
  return (
    <SysLine tool detail={outcome === "running" ? null : tool.detail} tone={TOOL_TONE[outcome]}>
      <i className={TOOL_ICON[outcome]} />
      {toolLabel(tool.toolName, tool.path, tool.detail, outcome)}
      {tool.progressText ? ` — ${tool.progressText}` : ""}
    </SysLine>
  );
}

function CollapseAnywhereDetails({
  className,
  summary,
  children,
  defaultOpen = false,
  findSkip = false,
  whenOpen,
}: {
  className?: string;
  summary: ReactNode;
  children: ReactNode;
  /** Drawn only while open (content that is not in the DOM otherwise). */
  whenOpen?: () => ReactNode;
  defaultOpen?: boolean;
  /** Keep this block out of Ctrl+F (a thinking stream still growing). */
  findSkip?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const down = useRef<{ x: number; y: number } | null>(null);
  return (
    <details
      className={className}
      data-find-skip={findSkip ? "" : undefined}
      open={open}
      onToggle={(event) => setOpen(event.currentTarget.open)}
      onMouseDown={(event) => {
        down.current = { x: event.clientX, y: event.clientY };
      }}
      onClick={(event) => {
        if (!open) return;
        const target = event.target as HTMLElement | null;
        // Interactive content inside the open block (links, the rendered /
        // source toggle) keeps its own click; collapsing is the click on
        // plain block content.
        if (target?.closest("summary, a, button")) return;
        if (
          !shouldToggleCollapseOnClick({
            selectionCollapsed: window.getSelection()?.isCollapsed !== false,
            down: down.current,
            up: { x: event.clientX, y: event.clientY },
          })
        ) {
          return;
        }
        event.preventDefault();
        setOpen(false);
      }}
    >
      <summary>{summary}</summary>
      {children}
      {open && whenOpen ? whenOpen() : null}
    </details>
  );
}

function ThinkingBlock({
  text,
  defaultOpen,
  complete,
}: {
  text: string;
  defaultOpen: boolean;
  complete?: boolean;
}) {
  return (
    <CollapseAnywhereDetails
      className={complete ? "think-block think-done" : "think-block"}
      defaultOpen={defaultOpen}
      findSkip={!complete}
      summary={
        <>
          <i className="ph ph-brain" aria-hidden="true" />{" "}
          {complete ? t("Thinking complete") : t("Thinking in progress")}
        </>
      }
    >
      <MarkdownBody className="think-body" text={text} renderMermaid={false} streaming={!complete} />
    </CollapseAnywhereDetails>
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
  isRunning,
  actions,
}: {
  message: DisplayMessage;
  developer: boolean;
  isLatestUser: boolean;
  isLatestAssistant?: boolean;
  /** Precomputed by SettledMessages: a later row for an already-shown call. */
  isDuplicateToolCall?: boolean;
  isRunning: boolean;
  actions?: TranscriptActions;
}) {
  const shell = useShell();
  const { thinkingExpanded, showThinking } = shell;

  if (message.role === "user") {
    const replacementEdit = actions?.isReplacementEdit(message.entryId ?? null) ?? false;
    return (
      <UserBubble
        rowId={message.rowId}
        text={message.text}
        pending={Boolean(message.pending)}
        entryId={message.entryId ?? null}
        isLatest={isLatestUser}
        isRunning={isRunning}
        onEdit={actions?.onEdit}
        onPrepareCompare={replacementEdit ? undefined : actions?.onPrepareCompare}
        onRetry={isLatestUser ? actions?.onRetry : undefined}
        replacementEdit={replacementEdit}
      />
    );
  }

  if (message.role === "assistant") {
    // Range rows (aborted/error) get their line from the range wrapper; a
    // length cut is not dropped, so it stays a plain line under the text.
    const stopLine = message.stopReason === "length" ? replyStopLine("length") : null;
    return (
      <>
        {(developer || showThinking) && message.thinking ? (
          <ThinkingBlock
            text={message.thinking}
            defaultOpen={thinkingExpanded}
            complete
          />
        ) : null}
        <AssistantBubble text={message.text} />
        {stopLine ? <div className="reply-stop" data-find-skip="">{stopLine}</div> : null}
      </>
    );
  }

  if (message.role === "tool") {
    if (isDuplicateToolCall) return null;
    const outcome = toolOutcome({ success: message.success });
    const approval = message.approval;
    const resultText = toolResultText(message);
    return (
      <SysLine
        tool
        tone={TOOL_TONE[outcome]}
        detail={message.toolDetail}
        result={
          resultText
            ? { text: resultText, truncated: Boolean(message.truncated), toolCallId: message.toolCallId, entryId: message.entryId }
            : undefined
        }
      >
        <i className={TOOL_ICON[outcome]} />
        {toolLabel(
          message.toolName || message.text || "tool",
          message.toolPath,
          message.toolDetail,
          outcome,
        )}
        {approval ? (
          <span className="approval-note" data-tip={approval.reason}>
            {approval.outcome === "allow"
              ? t("Smart approval: allowed · {reason}", { reason: approval.reason })
              : t("Smart approval: denied · {reason}", { reason: approval.reason })}
          </span>
        ) : null}
      </SysLine>
    );
  }

  if (message.role === "system") {
    if (message.marker === "imported-context") {
      return (
        <CollapseAnywhereDetails
          className="think-block"
          summary={
            <>
              <i className="ph ph-file-text" aria-hidden="true" /> {t("Imported {role} context", { role: message.sourceRole || "instruction" })}
            </>
          }
        >
          <div className="think-body">{message.text}</div>
        </CollapseAnywhereDetails>
      );
    }
    if (message.marker === "compaction") {
      return (
        <CollapseAnywhereDetails
          className="compact-summary"
          summary={<span>{t("Conversation compressed here")}</span>}
        >
          <div className="compact-summary-body">{message.text}</div>
        </CollapseAnywhereDetails>
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
  rowId,
  text,
  pending,
  entryId,
  isLatest,
  isRunning,
  onEdit,
  onPrepareCompare,
  onRetry,
  replacementEdit,
}: {
  rowId?: string;
  text: string;
  /** Sent, not yet confirmed by the server (placeholder mark; design TBD). */
  pending: boolean;
  entryId: string | null;
  isLatest: boolean;
  isRunning: boolean;
  onEdit?: (text: string, entryId: string | null) => boolean;
  onPrepareCompare?: (text: string, entryId: string | null) => boolean;
  onRetry?: () => boolean;
  replacementEdit: boolean;
}) {
  const trimmed = (text || "").trim();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(trimmed);
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
    <div className="msg user" data-row={rowId}>
      <div className="who" data-find-skip="">
        {t("You")}
        <PendingMark when={pending} />
      </div>
      <div
        ref={bubbleRef}
        className="bubble"
        style={editing ? { width: "100%", maxWidth: "82%", boxSizing: "border-box" } : undefined}
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
          data-tip={t("Copy")}
          aria-label={t("Copy message")}
          onClick={() => void navigator.clipboard?.writeText(trimmed)}
        >
          <i className="ph ph-copy" aria-hidden="true" />
        </button>
        {onRetry ? (
          <button
            data-tip={t("Retry latest message")}
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
              data-tip={
                replacementEdit
                  ? t("Edit and retry")
                  : t("Edit and compare")
              }
              aria-label={replacementEdit ? t("Edit and retry") : t("Edit and compare")}
              disabled={isRunning}
              onClick={() => {
                setEditing(true);
              }}
            >
              <i className="ph ph-pencil-simple" aria-hidden="true" />
            </button>
            {entryId && onPrepareCompare ? (
              <button
                className="edit-setup-action"
                data-tip={t("Adjust model or role before comparing")}
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
    // A reply still streaming is not searchable yet; it counts once settled.
    <div className="msg assistant" data-find-skip={streaming ? "" : undefined}>
      <div className="who" data-find-skip="">{streaming ? t("Alt · typing…") : t("Alt")}</div>
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
            data-tip={t("Copy")}
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
  const { sessionId } = useConversationContext();
  const [dismissed, setDismissed] = useState(false);
  if (dismissed) return null;

  const choose = () => {
    if (!sessionId) return;
    void pickDirectory(
      t("Full path of the main folder for this conversation:"),
    ).then((path) => {
      if (!path) return;
      void app.repointSession(sessionId, path).catch((error) => {
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
  result,
  tool = false,
}: {
  children: React.ReactNode;
  tone?: "danger" | "ok" | "running" | "pending";
  /** When present the line becomes expandable — see ToolDetailBody. */
  detail?: ToolDetail | null;
  /** The call's result (B3): shown under the detail once expanded. */
  result?: { text: string; truncated: boolean; toolCallId?: string; entryId?: string | null };
  /** Tool rows are searchable with Ctrl+F; system lines (warnings,
   *  notices) are chrome and stay out (owner 2026-09-24). */
  tool?: boolean;
}) {
  const className = cn(
    "sys-line",
    tone === "danger" && "sys-danger",
    tone === "ok" && "sys-ok",
    tone === "running" && "sys-running",
    tone === "pending" && "sys-pending",
  );
  const shownDetail = detail && detail.kind !== "skill" ? detail : null;
  if (!shownDetail && !result) {
    return <div className={className} data-find-skip={tool ? undefined : ""}>{children}</div>;
  }
  return (
    <CollapseAnywhereDetails
      className={cn(className, "sys-detail")}
      summary={children}
      findSkip={!tool}
      whenOpen={result ? () => <ToolResultBody {...result} /> : undefined}
    >
      {shownDetail ? <ToolDetailBody detail={shownDetail} /> : null}
    </CollapseAnywhereDetails>
  );
}

/**
 * What the tool returned: the row's bounded head and tail, and the whole
 * text from the history on request (B3, following ZCode / PI-Desktop).
 */
function ToolResultBody({
  text,
  truncated,
  toolCallId,
  entryId,
}: {
  text: string;
  truncated: boolean;
  toolCallId?: string;
  entryId?: string | null;
}) {
  const { sessionId } = useConversationContext();
  const [full, setFull] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  return (
    <div className="tool-result">
      <pre className="tool-detail cmd">{full ?? text}</pre>
      {truncated && full === null && sessionId && toolCallId ? (
        <button
          className="link-btn"
          onClick={() =>
            void fetchToolResult(sessionId, toolCallId, entryId).then(setFull, () => setFailed(true))
          }
        >
          {failed ? t("Could not load the full result") : t("View full result")}
        </button>
      ) : null}
    </div>
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
