import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from "react";
import type {
  AltMode,
  ClientMessageBody,
  Permission,
  NewConversationSettings,
  ServerMessage,
  SessionModelOverride,
  SessionVisibility,
  StudyTag,
} from "@/api/types";
import { retractQueuedText } from "@/api/sessions";
import { missingAttachments } from "@/api/session-files";
import { useWebSocket } from "@/hooks/useWebSocket";
import { t } from "@/i18n";
import {
  allUserRows,
  displayMessages,
  earlierCursor,
  effectiveSettings,
  initialConversationState,
  isBusy,
  isReady,
  isRunning,
  loadingEarlier,
  openingTarget,
  pendingChanges,
  permissionOf,
  queuedTexts,
  recoveryOf,
  reduce,
  type ConversationState,
  type NoticeBody,
  type PendingRequest,
} from "@/lib/conversation";
import {
  appendToDraft,
  currentDraftScope,
  NEW_DRAFT,
  readDraft,
  stageInDraft,
  unstageInDraft,
  updateDraft,
  useDraft,
  type Draft,
} from "@/lib/draft";
import { runStateView } from "@/lib/runState";
import { buildOutgoingPrompt } from "@/lib/workspace";
import { TRANSCRIPT_PAGE_ROWS } from "@/lib/limits";

let requestCounter = 0;
const RUN_REQUESTS = new Set<ClientMessageBody["type"]>([
  "prompt",
  "invoke_skill",
  "continue_latest",
  "retry_latest",
  "revise_latest",
  "compact",
  "send_queued_now",
]);
const requestPrefix = Math.random().toString(36).slice(2, 8);
/** Drafts (scope:key) whose staged files were checked this run: once each. */
const checkedDrafts = new Set<string>();
/** Requests that create a conversation from the new-conversation draft. */
const CREATING = new Set<ClientMessageBody["type"]>(["prompt", "invoke_skill"]);

/**
 * Kept for the next new conversation once one was created: the folder. The
 * permission starts from the Settings default again (owner 2026-09-25).
 */
function stickySettings(settings: NewConversationSettings | undefined): NewConversationSettings | undefined {
  return settings?.workspacePrimaryDir
    ? { workspacePrimaryDir: settings.workspacePrimaryDir }
    : undefined;
}

export type StreamDelta = Extract<ServerMessage, { type: "assistant_delta" | "thinking_delta" }>;

interface ConversationOptions {
  /** Follow this conversation from the start (a side pane); null = the draft. */
  sessionId: string | null;
  enabled: boolean;
  /** Every server message, after the conversation applied it — for the
   *  display layer's navigation and list refresh. */
  onMessage?: (message: ServerMessage) => void;
}

/**
 * One conversation over its own socket: the pure transition (lib/conversation)
 * behind useReducer, the socket, and the commands. Used the same way by every
 * place that shows a conversation.
 */
export function useConversation({ sessionId, enabled, onMessage }: ConversationOptions) {
  const [state, dispatch] = useReducer(reduce, undefined, initialConversationState);
  const stateRef = useRef(state);
  stateRef.current = state;
  const onMessageRef = useRef(onMessage);
  onMessageRef.current = onMessage;
  const targetRef = useRef(sessionId);
  targetRef.current = sessionId;
  // The draft of the conversation this hook follows — a side pane's own
  // even before its open has answered; only the center's detached state is
  // the new-conversation draft.
  const draftKey = state.sessionId ?? sessionId ?? NEW_DRAFT;
  const { draft, saveFailed, ready: draftsLoaded } = useDraft(draftKey);
  const newDraft = useDraft(NEW_DRAFT).draft;
  const [draftReturns, setDraftReturns] = useState(0);
  // What New inherited from the conversation it was pressed in (knowledge,
  // role, soul, instruction): this run only — not a user choice, so it is
  // not kept on the device, and a restart starts from the defaults.
  const [inherited, setInherited] = useState<NewConversationSettings | undefined>(undefined);
  const inheritedRef = useRef(inherited);
  inheritedRef.current = inherited;

  // Streaming text arrives a token at a time; the view needs it once a
  // frame (perf plan WP 1.9). Deltas of one kind merge until the next frame,
  // and any other message flushes them first, so order holds and approvals,
  // tool results and run ends are never held back.
  const pendingDeltaRef = useRef<StreamDelta | null>(null);
  const deltaFrameRef = useRef<number | null>(null);
  const deliver = (message: ServerMessage) => {
    dispatch({ type: "server", message });
    onMessageRef.current?.(message);
  };
  const flushDelta = () => {
    if (deltaFrameRef.current !== null) cancelAnimationFrame(deltaFrameRef.current);
    deltaFrameRef.current = null;
    const pending = pendingDeltaRef.current;
    pendingDeltaRef.current = null;
    if (pending) deliver(pending);
  };
  useEffect(() => () => {
    if (deltaFrameRef.current !== null) cancelAnimationFrame(deltaFrameRef.current);
  }, []);

  const socket = useWebSocket({
    enabled,
    onMessage: (message) => {
      if (message.type === "assistant_delta" || message.type === "thinking_delta") {
        const pending = pendingDeltaRef.current;
        if (pending?.type === message.type) {
          pendingDeltaRef.current = { ...pending, payload: { text: pending.payload.text + message.payload.text } };
        } else {
          flushDelta();
          pendingDeltaRef.current = message;
        }
        deltaFrameRef.current ??= requestAnimationFrame(flushDelta);
        return;
      }
      flushDelta();
      deliver(message);
    },
    onStatus: (status) => {
      // A dropped socket clears the live turn; a held delta must not
      // repaint a fragment of it afterwards.
      if (status !== "open") {
        if (deltaFrameRef.current !== null) cancelAnimationFrame(deltaFrameRef.current);
        deltaFrameRef.current = null;
        pendingDeltaRef.current = null;
      }
      dispatch({ type: "socket", status });
      if (status !== "open") return;
      // A (re)connect re-opens what this conversation follows, as a request
      // like any other: its answer ends the "Restoring…" state.
      const current = stateRef.current.sessionId;
      const target = current ?? targetRef.current;
      if (target) {
        sendRequest({ type: "open_session", payload: { sessionId: target } }, { restore: Boolean(current) });
      }
    },
  });
  const socketRef = useRef(socket);
  socketRef.current = socket;

  /** Send with a receipt; false when the socket is down (nothing recorded). */
  function sendRequest(
    message: ClientMessageBody,
    extra: Partial<Omit<PendingRequest, "id" | "message" | "status">> = {},
  ): boolean {
    const id = `${requestPrefix}-${++requestCounter}`;
    if (!socketRef.current.send({ ...message, requestId: id })) {
      dispatch({
        type: "notice",
        body: { kind: "text", text: t("Not connected"), icon: "warning", warn: true },
      });
      socketRef.current.reconnect();
      return false;
    }
    dispatch({
      type: "request",
      request: { id, message, from: stateRef.current.sessionId, ...extra },
    });
    return true;
  }
  const send = useCallback(sendRequest, []);

  // The drafts take in what the conversation hands them: text back to the
  // conversation it came from, and "the new-conversation draft was used".
  const appliedOpRef = useRef(0);
  useEffect(() => {
    const ops = state.draftOps;
    if (!ops.length) return;
    for (const op of ops) {
      if (op.id <= appliedOpRef.current) continue;
      appliedOpRef.current = op.id;
      if (op.kind === "return") {
        appendToDraft(op.to ?? NEW_DRAFT, op.text, op.attachments, "before", op.once);
        if (op.to === stateRef.current.sessionId) setDraftReturns((count) => count + 1);
      } else {
        // The draft became this conversation: its settings start over (the
        // folder carries), and anything typed while it was being created
        // moves with the user into the new conversation.
        const leftover = readDraft(NEW_DRAFT);
        updateDraft(NEW_DRAFT, (current) => ({
          ...current,
          text: "",
          attachments: [],
          settings: stickySettings(current.settings),
        }));
        appendToDraft(op.sessionId, leftover.text, leftover.attachments, "after");
      }
    }
    dispatch({ type: "draft_ops_taken", upTo: ops[ops.length - 1].id });
  }, [state.draftOps]);

  // A draft restored on this device drops what is gone, once per run: staged
  // files, and the new-conversation draft's folder. Checked once the
  // conversation it belongs to is the one open (relative paths need it).
  const owned = (state.sessionId ?? NEW_DRAFT) === draftKey;
  useEffect(() => {
    const checkKey = `${currentDraftScope()}:${draftKey}`;
    if (!draftsLoaded || !owned || state.socket !== "open" || checkedDrafts.has(checkKey)) return;
    const restored = readDraft(draftKey);
    const folder = draftKey === NEW_DRAFT ? restored.settings?.workspacePrimaryDir : null;
    const paths = [...restored.attachments, ...(folder ? [folder] : [])];
    checkedDrafts.add(checkKey);
    if (!paths.length) return;
    const owner = stateRef.current.sessionId;
    const warn = (text: string) =>
      dispatch({ type: "notice", body: { kind: "text", text, icon: "warning", warn: true } });
    missingAttachments(owner, paths)
      .then((missing) => {
        const files = restored.attachments.filter((path) => missing.includes(path));
        const folderGone = Boolean(folder && missing.includes(folder));
        if (!files.length && !folderGone) return;
        updateDraft(draftKey, (current) => ({
          ...current,
          attachments: current.attachments.filter((path) => !files.includes(path)),
          ...(folderGone ? { settings: { ...current.settings, workspacePrimaryDir: null } } : {}),
        }));
        if (stateRef.current.sessionId !== owner) return;
        if (files.length) warn(t("Some attached files are no longer there and were taken out of the draft."));
        if (folderGone) {
          warn(t("The folder chosen for the new conversation is gone; it will start as an independent conversation."));
        }
      })
      .catch(() => {
        // Offline: try again next time.
        checkedDrafts.delete(checkKey);
      });
  }, [draftKey, draftsLoaded, owned, state.socket]);

  // The model chip's thinking level for the draft's model is the server's
  // answer: ask again whenever the draft names another model.
  const detached = state.sessionId === null;
  const draftModelKey = detached ? JSON.stringify(newDraft.settings?.modelOverride ?? null) : null;
  // Once per (model, defaults received): the answer echoes the model, so it
  // settles in one round trip.
  const describedRef = useRef<{ key: string; defaults: unknown } | null>(null);
  useEffect(() => {
    if (draftModelKey === null || state.socket !== "open" || !state.draft) return;
    if (JSON.stringify(state.draft.modelOverride ?? null) === draftModelKey) return;
    const last = describedRef.current;
    if (last?.key === draftModelKey && last.defaults === state.draft) return;
    describedRef.current = { key: draftModelKey, defaults: state.draft };
    sendRequest({ type: "describe_draft", payload: { modelOverride: JSON.parse(draftModelKey) } });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draftModelKey, state.socket, state.draft]);

  // A turn's rows that did not line up with the window: take the tail again.
  useEffect(() => {
    if (state.stale && state.socket === "open" && state.sessionId) {
      sendRequest({ type: "transcript_page", payload: {} });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.stale, state.socket]);

  // Timed notices clear themselves; a newer one replaces the timer.
  useEffect(() => {
    const notice = state.notice;
    if (!notice || notice.ttlMs <= 0) return;
    const timer = window.setTimeout(() => dispatch({ type: "dismiss_notice", id: notice.id }), notice.ttlMs);
    return () => window.clearTimeout(timer);
  }, [state.notice]);

  const commands = useMemo(() => {
    const current = () => stateRef.current;
    /** On the new-conversation draft: the center, detached, following nothing. */
    const onNewDraft = () => !current().sessionId && !targetRef.current;
    const key = () => current().sessionId ?? targetRef.current ?? NEW_DRAFT;
    /** A setting: sent to the conversation, or kept in the new-conversation draft. */
    const setting = (patch: NewConversationSettings, message: ClientMessageBody): boolean => {
      if (!onNewDraft()) return send(message);
      updateDraft(NEW_DRAFT, (draft) => ({ ...draft, settings: { ...draft.settings, ...patch } }));
      return true;
    };
    /** Creating requests from the new-conversation draft carry its settings. */
    const create = () =>
      onNewDraft() ? { create: { ...inheritedRef.current, ...readDraft(NEW_DRAFT).settings } } : {};
    /** The draft's first send is still creating its conversation: one is enough. */
    const creating = () =>
      onNewDraft() &&
      current().requests.some(
        (request) => request.status === "sent" && request.from === null && CREATING.has(request.message.type),
      );
    // A run request still unanswered counts as running for how the next
    // message goes: a second send in those milliseconds is queued by the
    // server, so it must not show as an ordinary bubble.
    const runningNow = () =>
      isRunning(current()) ||
      current().requests.some(
        (request) => request.status === "sent" && RUN_REQUESTS.has(request.message.type),
      );
    return {
      send,
      /** A user message: runs now, or joins Pi's queue while a turn runs. */
      prompt(text: string, attachments: string[] = [], draftText = text): boolean {
        const outgoing = buildOutgoingPrompt(text.trim(), attachments);
        if (!outgoing || creating()) return false;
        const queued = runningNow();
        const body: ClientMessageBody = {
          type: "prompt",
          payload: outgoing,
          ...(attachments.length ? { attachments } : {}),
          ...(queued ? { deliverAs: "steer" as const } : {}),
          ...create(),
        };
        return send(body, {
          sentText: outgoing,
          // Pi owns the queue (card 11): a queued text shows as a card and
          // becomes a bubble when Pi delivers it (user_steered).
          bubble: !queued,
          draftText,
          attachments,
        });
      },
      /** `draftText` is what the editor gets back if refused (the typed text). */
      invokeSkill(skillName: string, userText?: string, draftText = userText?.trim() ?? ""): boolean {
        if (!skillName || runningNow() || creating()) return false;
        const text = userText?.trim() ?? "";
        return send(
          { type: "invoke_skill", payload: { skillName, ...(text ? { userText: text } : {}) }, ...create() },
          { sentText: text || t("Invoke {skillName}", { skillName }), bubble: true, draftText },
        );
      },
      continueLatest: () => send({ type: "continue_latest" }),
      retryLatest: () => send({ type: "retry_latest" }),
      reviseLatest: (text: string, entryId: string) =>
        send({ type: "revise_latest", payload: { text: text.trim(), entryId } }),
      branchRevision: (text: string, entryId?: string) =>
        send({ type: "branch_revision", payload: entryId ? { text: text.trim(), entryId } : { text: text.trim() } }),
      /** A compare branch; `seed` waits in its editor. */
      prepareBranchRevision: (entryId: string, seed?: PendingRequest["seed"]) =>
        send({ type: "prepare_branch_revision", payload: { entryId } }, { seed }),
      compact: () => send({ type: "compact" }),
      abort: () => send({ type: "abort" }),
      sendQueuedNow: (text: string) => send({ type: "send_queued_now", payload: { text } }),
      /** Take one queued message back (to its conversation's draft when
       *  `toDraft`); null when Pi already sent it. */
      async retractQueued(text: string, toDraft: boolean) {
        const id = current().sessionId;
        if (!id) return null;
        const retracted = await retractQueuedText(id, text);
        if (retracted && toDraft) appendToDraft(id, retracted.text, retracted.attachments, "after");
        return retracted;
      },
      respondApproval: (
        approvalId: string,
        response: { accept?: boolean; choice?: string | null; text?: string | null },
      ) => send({ type: "respond_approval", payload: { approvalId, ...response } }),
      switchKb: (domain: string) => setting({ kbDomain: domain }, { type: "switch_kb", payload: { domain } }),
      switchRolePreset: (rolePresetSlug: string | null) =>
        setting({ rolePresetSlug }, { type: "switch_role_preset", payload: { rolePresetSlug } }),
      switchVisibility: (visibility: SessionVisibility) =>
        setting({ visibility }, { type: "switch_visibility", payload: { visibility } }),
      /** One permission choice = the stored mode, Full Access and smart approval, each sent only when it changes. */
      setPermission(permission: Permission) {
        const now = effectiveSettings(current(), {
          settings: readDraft(NEW_DRAFT).settings,
          inherited: inheritedRef.current,
        });
        const mode: AltMode = permission === "read-only" ? "read-only" : "work";
        const fullAccess = permission === "full";
        const smartApproval = permission === "smart";
        if (mode !== now.mode) setting({ mode }, { type: "switch_mode", payload: { mode } });
        if (fullAccess !== now.fullAccess) {
          setting({ fullAccess }, { type: "set_full_access", payload: { enabled: fullAccess } });
        }
        // Going to Full mid-run, Full waits for the turn's end: keep smart
        // approval stored meanwhile (Full wins once it applies) instead of
        // dropping to Ask for the rest of the turn.
        if (smartApproval !== now.smartApproval && !(fullAccess && now.smartApproval)) {
          setting({ smartApproval }, { type: "set_smart_approval", payload: { enabled: smartApproval } });
        }
      },
      setSessionModel: (override: SessionModelOverride | null) =>
        setting({ modelOverride: override }, { type: "set_session_model", payload: { override } }),
      setStudyTag: (studyTag: StudyTag | null) =>
        setting({ studyTag }, { type: "set_study_tag", payload: { studyTag } }),
      /** Where the next new conversation goes (the new-conversation draft's folder). */
      setDraftWorkspace: (primaryDir: string | null) =>
        updateDraft(NEW_DRAFT, (draft) => ({
          ...draft,
          settings: { ...draft.settings, workspacePrimaryDir: primaryDir },
        })),
      open: (target: string) => send({ type: "open_session", payload: { sessionId: target } }),
      /** To the new-conversation draft. Pressed in a conversation, the draft
       *  inherits its knowledge, role, soul and instruction (its own choices win). */
      startNew: () => {
        const from = current();
        if (from.sessionId && from.snapshot) {
          const { selectors } = effectiveSettings(from);
          setInherited({
            kbDomain: selectors.currentDomain,
            rolePresetSlug: selectors.rolePresetSlug,
            soulSlug: selectors.soulSlug,
            customInstructionRef: selectors.customInstructionRef ?? null,
          });
        }
        return send({ type: "new_session" });
      },
      /** Branch / BTW / Helper off this conversation; `seed` is what the child starts with. */
      fork: (purpose: "fork" | "side" | "helper" | "ab-arm", seed?: PendingRequest["seed"]) =>
        purpose === "side" || purpose === "helper"
          ? send({ type: "create_related_session", payload: { purpose } }, { seed })
          : send({ type: "fork_session", payload: { purpose } }, { seed }),
      duplicate: (sourceSessionId: string) =>
        send({ type: "fork_session", payload: { purpose: "fork", sourceSessionId } }),
      createHelper: (parentSessionId?: string, seed?: PendingRequest["seed"]) =>
        send(
          { type: "create_helper_session", payload: parentSessionId ? { parentSessionId } : {}, ...create() },
          { seed },
        ),
      /** The next page above the loaded rows — or everything from the row
       *  `from` ("start" = all); false when there is none to ask for. */
      loadEarlier: (from?: string) => {
        const before = earlierCursor(current());
        return before
          ? send({ type: "transcript_page", payload: from ? { before, from } : { before, limit: TRANSCRIPT_PAGE_ROWS } })
          : false;
      },
      requestMetadata: () => send({ type: "get_session_metadata" }),
      requestMetrics: () => send({ type: "get_session_metrics" }),
      /** Change this conversation's draft (any field of its lifetime, lib/draft). */
      editDraft: (change: (draft: Draft) => Draft) => updateDraft(key(), change),
      /** The editor's text (this conversation's draft). */
      setDraftText: (next: string | ((current: string) => string)) =>
        updateDraft(key(), (draft) => {
          const text = typeof next === "function" ? next(draft.text) : next;
          return text === draft.text ? draft : { ...draft, text };
        }),
      /** After a send: the text, and the files that went with it. */
      clearDraft: (sent: string[] = []) =>
        updateDraft(key(), (draft) => ({
          ...draft,
          text: "",
          attachments: draft.attachments.filter((path) => !sent.includes(path)),
        })),
      stage: (...paths: string[]) => stageInDraft(key(), paths),
      unstage: (paths: string[]) => unstageInDraft(key(), paths),
      notify: (body: NoticeBody, ttlMs?: number) => dispatch({ type: "notice", body, ttlMs }),
    };
  }, [send]);

  // A side pane takes input only once the conversation it follows is open:
  // before that (or after a refused open) it must not act as a draft.
  const onTarget = sessionId === null || state.sessionId === sessionId;
  const view = useConversationView(state, draft, newDraft, inherited, draftsLoaded && onTarget, saveFailed, draftReturns);
  const conversation = useMemo(() => ({ ...view, ...commands }), [view, commands]);
  // The streaming parts travel apart: a token must not re-render every
  // reader of the conversation, only the stream view (perf backlog item 3).
  return { conversation, parts: state.turn.parts };
}

/** Everything but the streaming parts, stable while only the stream moves. */
function useConversationView(
  state: ConversationState,
  draft: Draft,
  newDraft: Draft,
  inherited: NewConversationSettings | undefined,
  inputReady: boolean,
  draftSaveFailed: boolean,
  draftReturns: number,
) {
  const { turn, ...rest } = state;
  const core = useShallowStable({
    ...rest,
    activity: turn.activity,
    draft,
    newDraft,
    inherited,
    inputReady,
    draftSaveFailed,
    draftReturns,
  });
  return useMemo(() => {
    const newSettings = { settings: newDraft.settings, inherited };
    const settings = effectiveSettings(state, newSettings);
    const running = isRunning(state);
    const recovery = recoveryOf(state);
    const runState = runStateView(state);
    return {
      sessionId: state.sessionId,
      /** Connected, opened (the followed conversation, for a side pane), drafts loaded. */
      sessionReady: isReady(state) && inputReady,
      wsConnected: state.socket === "open",
      /** Server run or a request in flight (one projection, runState). */
      isRunning: runState.phase === "running",
      /** The server's run fact alone. */
      serverRunning: running,
      busy: isBusy(state),
      /** This client's requests still waiting (or bubbles waiting for rows). */
      requests: state.requests,
      /** The conversation a user open is heading to, while it is in flight. */
      opening: openingTarget(state),
      runState,
      recovery,
      /** After the user's own Stop, editing won't branch. */
      stoppedByUser: !running && recovery?.interruptionCause === "user_abort",
      queuedTexts: queuedTexts(state),
      pendingChanges: pendingChanges(state),
      selectors: settings.selectors,
      sessionMode: settings.mode,
      permission: permissionOf(settings),
      fullAccess: settings.fullAccess,
      modelOverride: settings.modelOverride,
      studyTag: settings.studyTag,
      workspacePrimaryDir: settings.workspacePrimaryDir,
      thinking: (state.sessionId ? state.snapshot?.thinking : state.draft?.thinking) ?? null,
      currentSessionModel: state.sessionId ? (state.snapshot?.currentModel ?? null) : null,
      manifest: state.manifest,
      metrics: state.metrics,
      sessionWarnings: state.warnings,
      messages: displayMessages(state),
      /** Older rows exist above the loaded ones. */
      hasEarlier: state.hasMore,
      loadingEarlier: loadingEarlier(state),
      /** Every user row, loaded or not (scrub rail). */
      userRows: allUserRows(state),
      approvals: state.approvals,
      notice: state.notice,
      /** This conversation's draft, kept on this device (lib/draft). */
      draft,
      draftText: draft.text,
      stagedWorkspacePaths: draft.attachments,
      draftSaveFailed,
      /** Bumps when text is handed back to this conversation's draft (the editor takes focus). */
      draftReturns,
      runSettledCount: state.settledRuns,
    };
    // `core` changes exactly when a field the view reads changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [core]);
}

function useShallowStable<T extends object>(value: T): T {
  const ref = useRef(value);
  const previous = ref.current;
  const keys = Object.keys(value) as (keyof T)[];
  if (
    keys.length !== Object.keys(previous).length ||
    keys.some((key) => previous[key] !== value[key])
  ) {
    ref.current = value;
  }
  return ref.current;
}

export type Conversation = ReturnType<typeof useConversation>["conversation"];
