import { useCallback, useEffect, useMemo, useReducer, useRef } from "react";
import type {
  AltMode,
  ClientMessageBody,
  ServerMessage,
  SessionModelOverride,
  SessionVisibility,
  StudyTag,
} from "@/api/types";
import { retractQueuedText } from "@/api/sessions";
import { useWebSocket } from "@/hooks/useWebSocket";
import { t } from "@/i18n";
import {
  displayMessages,
  effectiveSettings,
  initialConversationState,
  isBusy,
  isReady,
  isRunning,
  openingTarget,
  pendingChanges,
  queuedTexts,
  recoveryOf,
  reduce,
  type ConversationState,
  type NoticeBody,
  type PendingRequest,
} from "@/lib/conversation";
import { runStateView } from "@/lib/runState";
import { buildOutgoingPrompt } from "@/lib/workspace";

let requestCounter = 0;
const requestPrefix = Math.random().toString(36).slice(2, 8);

export interface ConversationOptions {
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

  const socket = useWebSocket({
    enabled,
    onMessage: (message) => {
      dispatch({ type: "server", message });
      onMessageRef.current?.(message);
    },
    onStatus: (status) => {
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

  // Timed notices clear themselves; a newer one replaces the timer.
  useEffect(() => {
    const notice = state.notice;
    if (!notice || notice.ttlMs <= 0) return;
    const timer = window.setTimeout(() => dispatch({ type: "dismiss_notice", id: notice.id }), notice.ttlMs);
    return () => window.clearTimeout(timer);
  }, [state.notice]);

  const commands = useMemo(() => {
    const current = () => stateRef.current;
    return {
      send,
      /** A user message: runs now, or joins Pi's queue while a turn runs. */
      prompt(text: string, attachments: string[] = [], draftText = text): boolean {
        const outgoing = buildOutgoingPrompt(text.trim(), attachments);
        if (!outgoing) return false;
        const body: ClientMessageBody = {
          type: "prompt",
          payload: outgoing,
          ...(attachments.length ? { attachments } : {}),
          ...(isRunning(current()) ? { deliverAs: "steer" as const } : {}),
        };
        return send(body, {
          sentText: outgoing,
          // Pi owns the queue (card 11): a queued text shows as a card and
          // becomes a bubble when Pi delivers it (user_steered).
          bubble: !isRunning(current()),
          draftText,
          attachments,
        });
      },
      invokeSkill(skillName: string, userText?: string): boolean {
        if (!skillName || isRunning(current())) return false;
        const text = userText?.trim() ?? "";
        return send(
          { type: "invoke_skill", payload: { skillName, ...(text ? { userText: text } : {}) } },
          { sentText: text || t("Invoke {skillName}", { skillName }), bubble: true, draftText: text },
        );
      },
      continueLatest: () => send({ type: "continue_latest" }),
      retryLatest: () => send({ type: "retry_latest" }),
      reviseLatest: (text: string, entryId: string) =>
        send({ type: "revise_latest", payload: { text: text.trim(), entryId } }),
      branchRevision: (text: string, entryId?: string) =>
        send({ type: "branch_revision", payload: entryId ? { text: text.trim(), entryId } : { text: text.trim() } }),
      prepareBranchRevision: (entryId: string) =>
        send({ type: "prepare_branch_revision", payload: { entryId } }),
      compact: () => send({ type: "compact" }),
      abort: () => send({ type: "abort" }),
      sendQueuedNow: (text: string) => send({ type: "send_queued_now", payload: { text } }),
      /** Take one queued message back; null when Pi already sent it. */
      async retractQueued(text: string) {
        const id = current().sessionId;
        return id ? retractQueuedText(id, text) : null;
      },
      respondApproval: (
        approvalId: string,
        response: { accept?: boolean; choice?: string | null; text?: string | null },
      ) => send({ type: "respond_approval", payload: { approvalId, ...response } }),
      switchKb: (domain: string) => send({ type: "switch_kb", payload: { domain } }),
      switchRolePreset: (rolePresetSlug: string | null) =>
        send({ type: "switch_role_preset", payload: { rolePresetSlug } }),
      switchVisibility: (visibility: SessionVisibility) =>
        send({ type: "switch_visibility", payload: { visibility } }),
      switchMode: (mode: AltMode) => send({ type: "switch_mode", payload: { mode } }),
      setFullAccess: (enabled: boolean) => send({ type: "set_full_access", payload: { enabled } }),
      setSessionModel: (override: SessionModelOverride | null) =>
        send({ type: "set_session_model", payload: { override } }),
      setStudyTag: (studyTag: StudyTag | null) => send({ type: "set_study_tag", payload: { studyTag } }),
      setDraftWorkspace: (primaryDir: string | null) =>
        send({ type: "set_draft_workspace", payload: { primaryDir } }),
      open: (target: string) => send({ type: "open_session", payload: { sessionId: target } }),
      startNew: () => send({ type: "new_session" }),
      fork: (purpose: "fork" | "side" | "helper" | "ab-arm") =>
        purpose === "side" || purpose === "helper"
          ? send({ type: "create_related_session", payload: { purpose } })
          : send({ type: "fork_session", payload: { purpose } }),
      duplicate: (sourceSessionId: string) =>
        send({ type: "fork_session", payload: { purpose: "fork", sourceSessionId } }),
      createHelper: (parentSessionId?: string) =>
        send({ type: "create_helper_session", payload: parentSessionId ? { parentSessionId } : {} }),
      requestMetadata: () => send({ type: "get_session_metadata" }),
      requestMetrics: () => send({ type: "get_session_metrics" }),
      stage: (...paths: string[]) => dispatch({ type: "stage", paths }),
      unstage: (paths: string[]) => dispatch({ type: "unstage", paths }),
      /** The editor took the handed-back text. */
      takeReturned: (id: number) => dispatch({ type: "returned_taken", id }),
      notify: (body: NoticeBody, ttlMs?: number) => dispatch({ type: "notice", body, ttlMs }),
    };
  }, [send]);

  const view = useConversationView(state);
  const conversation = useMemo(() => ({ ...view, ...commands }), [view, commands]);
  // The streaming parts travel apart: a token must not re-render every
  // reader of the conversation, only the stream view (perf backlog item 3).
  return { conversation, parts: state.turn.parts };
}

/** Everything but the streaming parts, stable while only the stream moves. */
function useConversationView(state: ConversationState) {
  const { turn, ...rest } = state;
  const core = useShallowStable({ ...rest, activity: turn.activity });
  return useMemo(() => {
    const settings = effectiveSettings(state);
    const running = isRunning(state);
    const recovery = recoveryOf(state);
    const runState = runStateView(state);
    return {
      sessionId: state.sessionId,
      sessionReady: isReady(state),
      wsConnected: state.socket === "open",
      /** Server run or a request in flight (one projection, runState). */
      isRunning: runState.phase === "running",
      /** The server's run fact alone. */
      serverRunning: running,
      busy: isBusy(state),
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
      fullAccess: settings.fullAccess,
      modelOverride: settings.modelOverride,
      studyTag: settings.studyTag,
      workspacePrimaryDir: settings.workspacePrimaryDir,
      thinking: (state.sessionId ? state.snapshot?.thinking : state.draft?.thinking) ?? null,
      currentSessionModel: state.sessionId ? (state.snapshot?.currentModel ?? null) : null,
      retentionDueAt: state.snapshot?.retentionDueAt ?? null,
      manifest: state.manifest,
      metrics: state.metrics,
      sessionWarnings: state.warnings,
      messages: displayMessages(state),
      approvals: state.approvals,
      notice: state.notice,
      returned: state.returned,
      stagedWorkspacePaths: state.attachments,
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
