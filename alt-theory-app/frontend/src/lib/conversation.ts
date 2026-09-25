/**
 * One conversation's client state and its only transition function (M1,
 * state-architecture plan 2026-09-24).
 *
 * Owned here, by lifetime:
 * - server mirror: the latest snapshot, kept whole. Run state, recovery,
 *   queue and pending switches are read from it and nothing else;
 * - the transcript rows and the in-flight turn, handed over in one step when
 *   the turn ends (the terminal event carries the settled rows);
 * - requests of this client in flight (request receipts): busy and the
 *   optimistic user bubble derive from them; nothing is cleared by hand;
 * - what the drafts must take in (M2): text and files handed back by Stop, a
 *   refused or lost send — addressed to the conversation they came from —
 *   and "the new-conversation draft was used". The drafts themselves live in
 *   lib/draft.ts (one per conversation, on this device); the hook applies
 *   these operations there.
 *
 * Nothing here knows where the conversation is displayed. Pure: types only
 * (relative imports, so the backend replay tests import it as-is), no i18n —
 * labels live in lib/runState.ts.
 */
import type {
  ActiveToolState,
  ApprovalRequestPayload,
  AltMode,
  Permission,
  AssemblyManifest,
  ClientMessageBody,
  Failure,
  PendingChanges,
  NewConversationSettings,
  ServerMessage,
  SessionDraftSnapshot,
  SessionMetrics,
  SessionModelOverride,
  SessionSelectors,
  SessionSnapshot,
  StreamPart,
  StudyTag,
  TranscriptMessage,
} from "../api/types";

export type SocketStatus = "connecting" | "open" | "closed" | "error";

type RunPhasePayload = Extract<ServerMessage, { type: "run_phase" }>["payload"];

/** What the in-flight turn is doing, for the one-line detail label. */
export type TurnActivity =
  | { kind: "phase"; phase: RunPhasePayload["phase"]; retry?: RunPhasePayload["retry"] }
  | { kind: "tool"; tool: ActiveToolState }
  | null;

/** The streaming turn: parts in arrival order, tools still running, detail. */
export interface LiveTurn {
  parts: StreamPart[];
  tools: Record<string, ActiveToolState>;
  activity: TurnActivity;
}

/**
 * The request table: every client message kind and whether it holds the
 * conversation busy until answered. Adding a request kind is one entry here
 * (the compiler asks for it); nothing ever clears a busy flag by hand.
 */
export const REQUEST_BUSY: Record<ClientMessageBody["type"], boolean> = {
  prompt: true,
  invoke_skill: true,
  continue_latest: true,
  retry_latest: true,
  revise_latest: true,
  // The run happens in the new branch, not here.
  branch_revision: false,
  prepare_branch_revision: true,
  compact: true,
  send_queued_now: true,
  abort: true,
  open_session: true,
  new_session: true,
  fork_session: true,
  create_related_session: true,
  create_helper_session: true,
  switch_role_preset: true,
  switch_soul: true,
  switch_instruction: true,
  switch_kb: false,
  switch_visibility: false,
  switch_mode: false,
  set_full_access: false,
  set_study_tag: false,
  set_session_model: false,
  describe_draft: false,
  delete_latest: false,
  respond_approval: false,
  get_session_metadata: false,
  get_session_metrics: false,
};

export interface PendingRequest {
  id: string;
  message: ClientMessageBody;
  /** The conversation it was sent from (null = the new-conversation draft). */
  from: string | null;
  /** sent → answer pending; accepted → only its bubble waits for the rows;
   *  unknown → the socket dropped before the answer. */
  status: "sent" | "accepted" | "unknown";
  /** The text as sent: matched against rows and queue if the answer is lost. */
  sentText?: string;
  /** Show the sent text as an optimistic user bubble until its row lands. */
  bubble?: boolean;
  /** Text the conversation this request creates starts with (a child seed). */
  seed?: { text: string; autoSend: boolean };
  /** What goes back to the editor if the send is refused or lost. */
  draftText?: string;
  attachments?: string[];
  /** A re-open after reconnect, not a user navigation. */
  restore?: boolean;
}

/** Transient message for the composer area; the UI turns it into words. */
export type NoticeBody =
  | { kind: "text"; text: string; icon?: "warning" | "bookmark" | "eject"; warn?: boolean }
  | { kind: "run-failed"; failure: Failure; interrupted: boolean }
  | { kind: "refused"; failure: Failure; code?: string }
  | {
      kind: "extension";
      message: string;
      level: "info" | "warning" | "error";
      failure?: Failure;
      code?: "compacted";
    }
  | { kind: "unsent" };

export interface Notice {
  id: number;
  body: NoticeBody;
  /** 0 = stays until replaced. */
  ttlMs: number;
}

/**
 * What a draft must take in. `return`: text and paths handed back (Stop's
 * unsent queue, a refused or lost send) to the draft of the conversation
 * they came from — null is the new-conversation draft. `created`: the
 * new-conversation draft became this conversation, so its settings are used.
 */
export type DraftOp =
  | { id: number; kind: "return"; to: string | null; text: string; attachments: string[]; once?: string }
  | { id: number; kind: "created"; sessionId: string };

export interface ConversationState {
  /** The conversation this socket follows; null = the new-conversation draft. */
  sessionId: string | null;
  snapshot: SessionSnapshot | null;
  /** The server's new-conversation defaults (the draft itself is lib/draft). */
  draft: SessionDraftSnapshot | null;
  manifest: AssemblyManifest | null;
  metrics: SessionMetrics | null;
  warnings: string[];
  messages: TranscriptMessage[];
  turn: LiveTurn;
  /** Every pending approval this window may see (connection-wide registry). */
  approvals: ApprovalRequestPayload[];
  requests: PendingRequest[];
  socket: SocketStatus;
  notice: Notice | null;
  /** For the drafts, oldest first; the hook applies and acknowledges them. */
  draftOps: DraftOp[];
  /** Bumps whenever a run ends — completed, failed, or stopped. */
  settledRuns: number;
  seq: number;
}

export type ConversationInput =
  | { type: "server"; message: ServerMessage }
  | { type: "socket"; status: SocketStatus }
  | { type: "request"; request: Omit<PendingRequest, "status"> }
  | { type: "notice"; body: NoticeBody; ttlMs?: number }
  | { type: "dismiss_notice"; id: number }
  | { type: "draft_ops_taken"; upTo: number };

const EMPTY_TURN: LiveTurn = { parts: [], tools: {}, activity: null };

export function initialConversationState(): ConversationState {
  return {
    sessionId: null,
    snapshot: null,
    draft: null,
    manifest: null,
    metrics: null,
    warnings: [],
    messages: [],
    turn: EMPTY_TURN,
    approvals: [],
    requests: [],
    socket: "connecting",
    notice: null,
    draftOps: [],
    settledRuns: 0,
    seq: 0,
  };
}

const NOTICE_TTL = 4500;

function withNotice(state: ConversationState, body: NoticeBody | null, ttlMs = NOTICE_TTL): ConversationState {
  if (!body) return state.notice ? { ...state, notice: null } : state;
  const seq = state.seq + 1;
  return { ...state, seq, notice: { id: seq, body, ttlMs } };
}

function withReturned(
  state: ConversationState,
  to: string | null,
  text: string,
  attachments: string[] = [],
  once?: string,
): ConversationState {
  if (!text.trim() && !attachments.length) return state;
  const seq = state.seq + 1;
  const op: DraftOp = { id: seq, kind: "return", to, text, attachments, ...(once ? { once } : {}) };
  return { ...state, seq, draftOps: [...state.draftOps, op] };
}

function appendText(parts: StreamPart[], kind: "thinking" | "text", delta: string): StreamPart[] {
  const last = parts.at(-1);
  return last?.kind === kind
    ? [...parts.slice(0, -1), { kind, text: last.text + delta }]
    : [...parts, { kind, text: delta }];
}

function upsertTool(parts: StreamPart[], tool: ActiveToolState): StreamPart[] {
  const index = parts.findIndex((part) => part.kind === "tool" && part.tool.callId === tool.callId);
  return index === -1
    ? [...parts, { kind: "tool", tool }]
    : parts.map((part, item) => (item === index ? { kind: "tool" as const, tool } : part));
}

/** Rows of a transcript that a pending bubble can be matched against. */
function recentUserTexts(messages: TranscriptMessage[], count = 3): string[] {
  const texts: string[] = [];
  for (let index = messages.length - 1; index >= 0 && texts.length < count; index -= 1) {
    if (messages[index].role === "user") texts.push(messages[index].text.trim());
  }
  return texts;
}

const ATTACHMENT_LINE = /\s*\(Attachments: [^\n]*\)$/;

/**
 * Whether a sent text is in the rows or Pi's queue. The server moves staged
 * attached files into the conversation's folder and rewrites their paths,
 * so a message with files is matched without its attachment line.
 */
export function sentLanded(request: PendingRequest, users: string[], queued: string[]): boolean {
  const text = request.sentText?.trim() ?? "";
  if (users.includes(text) || queued.includes(request.sentText ?? "")) return true;
  if (!request.attachments?.length) return false;
  const bare = text.replace(ATTACHMENT_LINE, "");
  return [...users, ...queued].some((row) => row.trim().replace(ATTACHMENT_LINE, "") === bare);
}

/**
 * New rows arrived for this conversation. Accepted bubbles they now carry go;
 * a terminal hand-over (`final`) ends every accepted bubble — the turn is
 * over and the rows are the truth. Sends lost with the socket are settled:
 * in the rows → sent; otherwise → back to the editor with a notice.
 */
function withRows(state: ConversationState, messages: TranscriptMessage[], final: boolean): ConversationState {
  const users = recentUserTexts(messages);
  const queued = queuedTexts(state);
  let next: ConversationState = { ...state, messages };
  let lost = false;
  const requests: PendingRequest[] = [];
  for (const request of state.requests) {
    if (request.from !== state.sessionId || request.sentText === undefined || request.status === "sent") {
      requests.push(request);
      continue;
    }
    const landed = sentLanded(request, users, queued);
    if (request.status === "accepted" && (final || landed)) continue;
    if (request.status === "unknown") {
      if (!landed && (request.draftText?.trim() || request.attachments?.length)) {
        next = withReturned(next, state.sessionId, request.draftText ?? "", request.attachments);
        lost = true;
      }
      continue;
    }
    requests.push(request);
  }
  next = { ...next, requests };
  return lost ? withNotice(next, { kind: "unsent" }, 0) : next;
}

/** Leave the current conversation: its rows and turn go (its draft stays in lib/draft). */
function switchedTo(state: ConversationState, sessionId: string | null): ConversationState {
  return {
    ...state,
    // The server holds what it accepted; their bubbles stay with the rows.
    requests: state.requests.filter(
      (request) => !(request.status === "accepted" && request.from === state.sessionId),
    ),
    sessionId,
    messages: [],
    turn: EMPTY_TURN,
    manifest: null,
    metrics: null,
    warnings: [],
    notice: null,
  };
}

function removeRequest(state: ConversationState, id: string): ConversationState {
  return { ...state, requests: state.requests.filter((request) => request.id !== id) };
}

function onServer(state: ConversationState, message: ServerMessage): ConversationState {
  switch (message.type) {
    case "session_draft": {
      const leaving = state.requests.some(
        (request) => request.status === "sent" && request.message.type === "new_session",
      );
      // A reconnect greets with the draft before the re-open answers; that
      // greeting does not detach a conversation the user is in.
      if (state.sessionId !== null && !leaving) return { ...state, draft: message.payload };
      let next: ConversationState = state.sessionId === null ? state : switchedTo(state, null);
      next = { ...next, draft: message.payload, snapshot: null };
      // Draft sends lost with the socket never reached a conversation.
      return withRows(next, [], false);
    }

    case "session_opened": {
      const opened = message.payload.sessionId;
      let next = state;
      if (state.sessionId !== opened) {
        const openTarget = state.requests.some(
          (request) =>
            request.message.type === "open_session" && request.message.payload.sessionId === opened,
        );
        const materialized = state.sessionId === null && !openTarget;
        next = switchedTo(state, opened);
        if (materialized) {
          // The draft's first send created this conversation: its requests
          // (and bubble) now belong to it, and — unless it was a root Helper
          // — the new-conversation draft's settings were used.
          const used = state.requests.some(
            (request) => request.from === null && request.message.type !== "create_helper_session" && "create" in request.message,
          );
          const seq = next.seq + 1;
          next = {
            ...next,
            seq,
            draftOps: used ? [...next.draftOps, { id: seq, kind: "created", sessionId: opened }] : next.draftOps,
            requests: state.requests.map((request) =>
              request.from === null ? { ...request, from: opened } : request,
            ),
          };
        }
      }
      return {
        ...next,
        snapshot: message.payload,
        warnings: message.payload.resumeWarnings ?? [],
        turn: state.sessionId === opened ? next.turn : EMPTY_TURN,
      };
    }

    case "session_updated": {
      if (message.payload.sessionId !== state.sessionId) return state;
      // A new run begins: whatever the previous turn left streaming is over.
      const begins = message.payload.status !== "idle" && (state.snapshot?.status ?? "idle") === "idle";
      return {
        ...state,
        snapshot: message.payload,
        warnings: message.payload.resumeWarnings ?? state.warnings,
        turn: begins ? EMPTY_TURN : state.turn,
      };
    }

    case "session_metadata":
      return !message.payload.sessionId || message.payload.sessionId === state.sessionId
        ? { ...state, manifest: message.payload }
        : state;

    case "session_metrics":
      return { ...state, metrics: message.payload };

    case "session_transcript":
      return withRows({ ...state, turn: EMPTY_TURN }, message.payload.messages, false);

    case "run_completed":
      return {
        ...withRows(
          { ...state, snapshot: message.payload.snapshot, turn: EMPTY_TURN, notice: null },
          message.payload.messages,
          true,
        ),
        settledRuns: state.settledRuns + 1,
      };

    case "run_failed": {
      const recovery = message.payload.snapshot.recovery;
      const next = {
        ...withRows(
          { ...state, snapshot: message.payload.snapshot, turn: EMPTY_TURN },
          message.payload.messages,
          true,
        ),
        settledRuns: state.settledRuns + 1,
      };
      // The user's own Stop needs no words; anything else says what happened.
      if (recovery?.interruptionCause === "user_abort") return withNotice(next, null);
      const authRefresh = message.payload.failure.kind === "auth-refresh";
      return withNotice(
        next,
        { kind: "run-failed", failure: message.payload.failure, interrupted: recovery?.outcome === "interrupted" },
        authRefresh ? 0 : NOTICE_TTL,
      );
    }

    case "user_steered":
      return {
        ...state,
        messages: [
          ...state.messages,
          { role: "user", text: message.payload.text, timestamp: null, rowId: `steered:${state.messages.length}` },
        ],
      };

    case "queue_updated": {
      const { steering, followUp, restored, restoredAttachments, restoredId } = message.payload;
      const next = state.snapshot ? { ...state, snapshot: { ...state.snapshot, queue: { steering, followUp } } } : state;
      return restored?.length
        ? withReturned(next, state.sessionId, restored.join("\n"), restoredAttachments, restoredId)
        : next;
    }

    case "assistant_delta":
      return {
        ...state,
        turn: { ...state.turn, activity: null, parts: appendText(state.turn.parts, "text", message.payload.text) },
      };

    case "thinking_delta":
      return { ...state, turn: { ...state.turn, parts: appendText(state.turn.parts, "thinking", message.payload.text) } };

    case "tool_started": {
      const { toolName, callId, path, detail } = message.payload;
      const tool: ActiveToolState = { callId, toolName, path, detail, status: "running" };
      return {
        ...state,
        turn: {
          parts: upsertTool(state.turn.parts, tool),
          tools: { ...state.turn.tools, [callId]: tool },
          activity: { kind: "tool", tool },
        },
      };
    }

    case "tool_updated": {
      const current = state.turn.tools[message.payload.callId];
      if (!current) return state;
      const tool = { ...current, progressText: message.payload.text };
      return {
        ...state,
        turn: {
          parts: upsertTool(state.turn.parts, tool),
          tools: { ...state.turn.tools, [tool.callId]: tool },
          activity: message.payload.text ? { kind: "tool", tool } : state.turn.activity,
        },
      };
    }

    case "tool_finished": {
      const current = state.turn.tools[message.payload.callId];
      const tools = { ...state.turn.tools };
      delete tools[message.payload.callId];
      const parts = current
        ? upsertTool(state.turn.parts, {
            ...current,
            status: message.payload.success ? "finished" : "failed",
            success: message.payload.success,
            progressText: undefined,
          })
        : state.turn.parts;
      return {
        ...state,
        turn: {
          parts,
          tools,
          activity: Object.keys(tools).length === 0 ? { kind: "phase", phase: "processing" } : state.turn.activity,
        },
      };
    }

    case "run_phase": {
      const { phase, retry } = message.payload;
      let parts = state.turn.parts;
      // Only the server knows whether the dropped attempt produced text (it
      // reads Pi's state before the retry drops the message); without that
      // fact the parts above are just as likely completed steps.
      if (phase === "retrying" && retry?.droppedPartialText && parts.length > 0 && parts.at(-1)?.kind !== "notice") {
        parts = [...parts, { kind: "notice", notice: "retry-dropped" }];
      }
      const activity: TurnActivity = phase === "idle" || phase === "error" ? null : { kind: "phase", phase, retry };
      return { ...state, turn: { ...state.turn, parts, activity } };
    }

    case "approval_snapshot":
      return { ...state, approvals: message.payload };

    case "approval_requested":
      return state.approvals.some((entry) => entry.approvalId === message.payload.approvalId)
        ? state
        : { ...state, approvals: [...state.approvals, message.payload] };

    case "approval_resolved":
      return {
        ...state,
        approvals: state.approvals.filter((entry) => entry.approvalId !== message.payload.approvalId),
      };

    case "extension_notice":
      return withNotice(state, {
        kind: "extension",
        message: message.payload.message,
        level: message.payload.level,
        failure: message.payload.failure,
        code: message.payload.code,
      });

    case "request_done": {
      const request = state.requests.find((entry) => entry.id === message.payload.requestId);
      if (!request) return state;
      if (request.bubble && request.status !== "accepted") {
        return {
          ...state,
          requests: state.requests.map((entry) =>
            entry.id === request.id ? { ...entry, status: "accepted" as const } : entry,
          ),
        };
      }
      return removeRequest(state, request.id);
    }

    case "error": {
      const { failure, code, requestId } = message.payload;
      const request = requestId ? state.requests.find((entry) => entry.id === requestId) : undefined;
      let next = request ? removeRequest(state, request.id) : state;
      if (request) next = withReturned(next, request.from, request.draftText ?? "", request.attachments);
      // A conversation that cannot be re-opened after a reconnect is gone
      // from this window: fall back to the new-conversation draft.
      if (request?.restore) next = { ...switchedTo(next, null), snapshot: null };
      return withNotice(next, { kind: "refused", failure, code });
    }

    case "related_session_created":
    case "branch_created":
      // Navigation for the display layer; its request answer follows.
      return state;

    case "activity_snapshot":
    case "session_activity":
      // The conversation list's (app level), not this conversation's.
      return state;

    default: {
      const unhandled: never = message;
      return unhandled;
    }
  }
}

/** The one transition. Exhaustive over server messages (see `never` above). */
export function reduce(state: ConversationState, input: ConversationInput): ConversationState {
  switch (input.type) {
    case "server":
      return onServer(state, input.message);

    case "socket": {
      if (input.status === "open" || input.status === "connecting") return { ...state, socket: input.status };
      // Answers can no longer arrive: every pending send's fate is unknown
      // until the re-open's rows say. Stream and approvals are replayed on
      // reconnect, so the local copies go.
      return {
        ...state,
        socket: input.status,
        turn: EMPTY_TURN,
        approvals: [],
        requests: state.requests.flatMap((request) =>
          request.status !== "sent"
            ? [request]
            : request.sentText !== undefined
              ? [{ ...request, status: "unknown" as const }]
              : [],
        ),
      };
    }

    case "request":
      return {
        ...state,
        requests: [...state.requests, { ...input.request, status: "sent" }],
        notice: input.request.sentText !== undefined ? null : state.notice,
      };

    case "notice":
      return withNotice(state, input.body, input.ttlMs);

    case "dismiss_notice":
      return state.notice?.id === input.id ? { ...state, notice: null } : state;

    case "draft_ops_taken":
      return state.draftOps.some((op) => op.id <= input.upTo)
        ? { ...state, draftOps: state.draftOps.filter((op) => op.id > input.upTo) }
        : state;

    default: {
      const unhandled: never = input;
      return unhandled;
    }
  }
}

// ---------------------------------------------------------------- selectors

/** The server says a run owns the conversation (anything but idle). */
export function isRunning(state: ConversationState): boolean {
  return Boolean(state.snapshot && state.snapshot.status !== "idle");
}

/** Requests of this conversation still waiting for their answer. */
export function busyRequests(state: ConversationState): PendingRequest[] {
  return state.requests.filter((request) => request.status === "sent" && REQUEST_BUSY[request.message.type]);
}

/** Where a user open (not a reconnect's re-open) is heading, while in flight. */
export function openingTarget(state: ConversationState): string | null {
  for (let index = state.requests.length - 1; index >= 0; index -= 1) {
    const { message, status, restore } = state.requests[index];
    if (status === "sent" && !restore && message.type === "open_session") return message.payload.sessionId;
  }
  return null;
}

export function isBusy(state: ConversationState): boolean {
  return busyRequests(state).length > 0;
}

/** Continue/retry eligibility: from the snapshot, and only when nothing is under way. */
export function recoveryOf(state: ConversationState) {
  if (isRunning(state) || isBusy(state)) return null;
  return state.snapshot?.recovery ?? null;
}

export function queuedTexts(state: ConversationState): string[] {
  const queue = state.snapshot?.queue;
  return [...(queue?.steering ?? []), ...(queue?.followUp ?? [])];
}

/** Switches accepted mid-run; the controls show them as chosen + pending. */
export function pendingChanges(state: ConversationState): PendingChanges {
  return state.snapshot?.pending ?? {};
}

/**
 * Ready to take input: connected, no open or New in flight, and something to
 * show. Leaving a conversation (open another, or New) blocks input until the
 * server answers, so a send cannot land in the conversation being left — or,
 * for a side pane, on the connection's draft greeting.
 */
const LEAVING = new Set<ClientMessageBody["type"]>(["open_session", "new_session"]);

export function isReady(state: ConversationState): boolean {
  if (state.socket !== "open") return false;
  if (state.requests.some((request) => LEAVING.has(request.message.type) && request.status === "sent")) {
    return false;
  }
  return state.sessionId ? state.snapshot !== null : state.draft !== null;
}

/** Transcript rows plus this conversation's bubbles still waiting for their row. */
export type DisplayMessage = TranscriptMessage & { pending?: boolean };

export function displayMessages(state: ConversationState): DisplayMessage[] {
  const bubbles = state.requests.filter((request) => request.bubble && request.from === state.sessionId);
  if (!bubbles.length) return state.messages;
  return [
    ...state.messages,
    ...bubbles.map((request) => ({
      role: "user" as const,
      text: request.sentText ?? "",
      timestamp: null,
      rowId: `local:${request.id}`,
      pending: request.status !== "accepted",
    })),
  ];
}

/**
 * The effective session settings — "pending first, else current" for a
 * switch accepted mid-run — from the snapshot; when detached, the new-
 * conversation draft's choices over what it inherited over the defaults.
 */
export interface EffectiveSettings {
  selectors: SessionSelectors;
  mode: AltMode;
  fullAccess: boolean;
  modelOverride: SessionModelOverride | null;
  studyTag: StudyTag | null;
  workspacePrimaryDir: string | null;
}

/** The permission control's reading of a conversation's two stored fields. */
export function permissionOf(settings: { mode: AltMode; fullAccess: boolean }): Permission {
  if (settings.mode === "read-only") return "read-only";
  return settings.fullAccess ? "full" : "ask";
}

export function effectiveSettings(
  state: ConversationState,
  newDraft?: { settings?: NewConversationSettings; inherited?: NewConversationSettings },
): EffectiveSettings {
  const source = state.sessionId ? state.snapshot : draftSource(state.draft, newDraft);
  const pending = state.sessionId ? (state.snapshot?.pending ?? {}) : {};
  const pick = <T,>(chosen: T | undefined, current: T): T => (chosen !== undefined ? chosen : current);
  return {
    selectors: {
      currentDomain: pick(pending.kbDomain, source?.currentDomain || "ep-core"),
      rolePresetSlug: pick(pending.rolePresetSlug, source?.rolePresetSlug ?? null),
      soulSlug: pick(pending.soulSlug, source?.soulSlug ?? null),
      customInstructionRef: pick(pending.customInstructionRef, source?.customInstructionRef ?? null),
      visibility: pick(pending.visibility?.visibility, source?.visibility ?? "research"),
      branchId: (state.snapshot && state.sessionId ? state.snapshot.branchId : undefined) || "main",
    },
    mode: pick(pending.mode, source?.mode ?? "work"),
    fullAccess: pick(pending.fullAccess, source?.fullAccess ?? false),
    modelOverride: pick(pending.model, source?.modelOverride ?? null),
    studyTag: source?.studyTag ?? null,
    workspacePrimaryDir: source?.workspacePrimaryDir ?? null,
  };
}

/** The new-conversation draft read as a snapshot: its choices, then what it inherited, then the defaults. */
function draftSource(
  defaults: SessionDraftSnapshot | null,
  newDraft: { settings?: NewConversationSettings; inherited?: NewConversationSettings } | undefined,
) {
  const chosen = { ...newDraft?.inherited, ...newDraft?.settings };
  const pick = <K extends keyof NewConversationSettings>(key: K) => (key in chosen ? chosen[key] : undefined);
  return {
    currentDomain: pick("kbDomain") ?? defaults?.currentDomain ?? "",
    rolePresetSlug: pick("rolePresetSlug") !== undefined ? (pick("rolePresetSlug") ?? null) : (defaults?.rolePresetSlug ?? null),
    soulSlug: pick("soulSlug") !== undefined ? (pick("soulSlug") ?? null) : (defaults?.soulSlug ?? null),
    customInstructionRef:
      pick("customInstructionRef") !== undefined
        ? (pick("customInstructionRef") ?? null)
        : (defaults?.customInstructionRef ?? null),
    visibility: pick("visibility") ?? defaults?.visibility,
    mode: pick("mode") ?? defaults?.mode,
    fullAccess: pick("fullAccess") ?? defaults?.fullAccess ?? false,
    modelOverride: pick("modelOverride") ?? null,
    studyTag: pick("studyTag") ?? null,
    workspacePrimaryDir: pick("workspacePrimaryDir") ?? null,
  };
}
