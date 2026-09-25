import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  deleteSession as deleteSessionRequest,
  deleteSessionFamily as deleteSessionFamilyRequest,
  normalizeSessionAlias,
  promoteRelatedSession as promoteRelatedSessionRequest,
  saveSessionAlias,
} from "@/api/sessions";
import type { ServerMessage } from "@/api/types";
import { useApp, type SessionAlert } from "@/context/AppProvider";
import { alertsFor, type ActivityChange } from "@/lib/listActivity";
import { ConversationScope } from "@/context/ConversationContext";
import { useShell } from "@/context/ShellContext";
import { useConversation, type Conversation } from "@/hooks/useConversation";
import { t } from "@/i18n";
import { notifyBackground } from "@/lib/notify";
import { discardDraft } from "@/lib/draft";

/**
 * The main view: which conversation the center shows, and what follows from
 * that — its navigation (open, new, branch, helper, copy, delete), the list
 * highlight, the right-pane seeds, and the list's attention marks. The
 * conversation itself is a plain useConversation, bound to the subtree.
 */
export interface MainViewValue {
  conversation: Conversation;
  /** The list highlight: the conversation being opened, else the one shown. */
  selectedCatalogSessionId: string | null;
  /** Conversations that changed state while you were looking elsewhere. */
  sessionAlerts: Record<string, SessionAlert>;
  /** False when nothing was sent (same session, cannot open, socket down). */
  openCatalogSession: (sessionId: string) => boolean;
  startNewSession: () => void;
  compactCurrentSession: () => void;
  forkCurrentSession: (purpose: "fork" | "side" | "helper" | "ab-arm", seedPrompt?: string) => void;
  openHelper: (question?: string, attachToCenter?: boolean) => void;
  duplicateSession: (sessionId: string) => void;
  branchRevision: (text: string, entryId?: string) => boolean;
  prepareBranchRevision: (text: string, entryId: string) => boolean;
  /** Draft for a just-created child; helper sends immediately, compare waits. */
  childSeed: { sessionId: string; text: string; autoSend: boolean } | null;
  clearChildSeed: () => void;
  promoteRelatedSession: (sessionId: string) => Promise<void>;
  renameSession: (sessionId: string, name: string) => Promise<boolean>;
  deleteSession: (sessionId: string) => void;
  deleteSessionFamily: (sessionId: string) => void;
  /** Conversation allowances granted in this view (M7 §3), for the inspector. */
  approvalMarkers: string[];
  addApprovalMarker: (text: string) => void;
}

const MainViewContext = createContext<MainViewValue | null>(null);

export function MainViewProvider({ children }: { children: ReactNode }) {
  const app = useApp();
  // Conversation events that open a side conversation go straight to the
  // navigation owner (ShellProvider is outside this provider).
  const shell = useShell();
  const [childSeed, setChildSeed] = useState<MainViewValue["childSeed"]>(null);
  /** A root Helper opened in the center with a question: ask it once open. */
  const [rootSeed, setRootSeed] = useState<{ sessionId: string; text: string } | null>(null);
  const [sessionAlerts, setSessionAlerts] = useState<Record<string, SessionAlert>>({});
  const [approvalMarkers, setApprovalMarkers] = useState<string[]>([]);

  const onMessageRef = useRef<(message: ServerMessage) => void>(() => {});
  const { conversation: conv, parts } = useConversation({
    sessionId: null,
    enabled: !app.loading && !app.loginRequired,
    onMessage: (message) => onMessageRef.current(message),
  });
  const sessionId = conv.sessionId;

  // The list highlight follows what the user opened or created, nothing
  // else: a fresh app shows none (owner 2026-09-24); an open in flight shows
  // its target, a refused open falls back to what is shown.
  const selectedCatalogSessionId = conv.opening ?? sessionId;

  // Conversation allowances belong to the conversation they were granted in.
  useEffect(() => setApprovalMarkers([]), [sessionId]);

  // The seed of a created conversation rides on the request that creates
  // it; a refused or lost request takes its seed with it.
  const creatingSeed = () =>
    conv.requests.find(
      (request) =>
        request.status === "sent" &&
        request.seed &&
        (request.message.type === "fork_session" ||
          request.message.type === "create_related_session" ||
          request.message.type === "create_helper_session" ||
          request.message.type === "prepare_branch_revision"),
    )?.seed;

  useEffect(() => {
    if (!rootSeed || rootSeed.sessionId !== sessionId || !conv.sessionReady) return;
    setRootSeed(null);
    conv.prompt(rootSeed.text);
  }, [conv, rootSeed, sessionId]);

  onMessageRef.current = (message) => {
    switch (message.type) {
      case "session_opened": {
        void app.refreshSessions();
        const seed = creatingSeed();
        if (seed && conv.requests.some((r) => r.status === "sent" && r.message.type === "create_helper_session")) {
          setRootSeed({ sessionId: message.payload.sessionId, text: seed.text });
        }
        break;
      }
      case "session_draft":
        void app.refreshSessions();
        break;
      case "activity_snapshot":
      case "session_activity":
        raiseAlerts(app.applyActivity(message));
        break;
      case "session_updated": {
        // The list shows tag and role (its run state is pushed): refresh
        // when they moved.
        const row = app.sessions.find((item) => item.sessionId === message.payload.sessionId);
        if (
          row &&
          (row.rolePresetSlug !== message.payload.rolePresetSlug ||
            JSON.stringify(row.studyTag ?? null) !== JSON.stringify(message.payload.studyTag ?? null))
        ) {
          void app.refreshSessions();
        }
        break;
      }
      case "related_session_created":
        // btw / helper: keep the original compact default (~480), not 50%.
        // A spawned subagent never opens the rail (owner 2026-09-18); the
        // Related row is its feedback, and seeds belong to user creations.
        if (message.payload.purpose !== "subagent") {
          shell.openTarget({ kind: "conversation", sessionId: message.payload.sessionId }, { size: "default" });
          const seed = creatingSeed();
          if (seed) setChildSeed({ sessionId: message.payload.sessionId, ...seed });
        }
        void app.refreshSessions();
        break;
      case "branch_created":
        // Main conversation stays in the center. Branched edit work opens in
        // the right Related rail at ~50% width.
        shell.openTarget({ kind: "conversation", sessionId: message.payload.sessionId }, { size: "half" });
        {
          const seed = creatingSeed();
          if (seed) setChildSeed({ sessionId: message.payload.sessionId, ...seed });
        }
        void app.refreshSessions();
        break;
      case "error":
        if (message.payload.code === "auth_required") app.requireLogin();
        break;
      default:
        break;
    }
  };

  // Background visibility (alpha.3). A conversation that finished, failed,
  // or stopped for an approval while you were elsewhere leaves a mark that
  // survives until it is opened. From the pushed activity's transitions (WP-4).
  const raiseAlerts = (changes: ActivityChange[]) => {
    const raised: Record<string, SessionAlert> = alertsFor(changes, sessionId);
    for (const [id, alert] of Object.entries(raised)) {
      const name = app.sessionDisplayNames[id]?.alias || t("A conversation");
      if (alert === "done") notifyBackground(t("Work finished"), t("{name} finished its turn.", { name }));
      else if (alert === "failed") notifyBackground(t("Work stopped"), t("{name} ran into an error.", { name }));
      else notifyBackground(t("Waiting for you"), t("{name} needs your approval.", { name }));
    }
    if (Object.keys(raised).length > 0) setSessionAlerts((prev) => ({ ...prev, ...raised }));
  };

  // Opening a conversation is reading it.
  useEffect(() => {
    if (!sessionId) return;
    setSessionAlerts((prev) => {
      if (!(sessionId in prev)) return prev;
      const next = { ...prev };
      delete next[sessionId];
      return next;
    });
  }, [sessionId]);

  const openCatalogSession = useCallback(
    (target: string): boolean => {
      if (!target || target === sessionId) return false;
      const summary = app.sessions.find((item) => item.sessionId === target);
      // A conversation still in its first turn has no file yet but is live
      // on the server, so it opens; an idle one without a file does not.
      if (summary && !summary.hasSessionFile && (summary.runStatus ?? "idle") === "idle") {
        conv.notify({ kind: "text", text: t("Conversation cannot be opened.") });
        return false;
      }
      return conv.open(target);
    },
    [app.sessions, conv, sessionId],
  );

  const startNewSession = useCallback(() => {
    conv.startNew();
  }, [conv]);

  const compactCurrentSession = useCallback(() => {
    if (!sessionId || conv.isRunning) return;
    conv.compact();
  }, [conv, sessionId]);

  const forkCurrentSession = useCallback(
    (purpose: "fork" | "side" | "helper" | "ab-arm", seedPrompt?: string) => {
      if (!sessionId || conv.isRunning) return;
      // The child asks the question the user already typed, instead of
      // opening with "what can I help with?".
      conv.fork(purpose, seedPrompt?.trim() ? { text: seedPrompt.trim(), autoSend: true } : undefined);
    },
    [conv, sessionId],
  );

  const openHelper = useCallback(
    (question?: string, attachToCenter = true) => {
      const text = question?.trim();
      const current = app.sessions.find((item) => item.sessionId === sessionId);
      const currentIsHelper = current?.helper || current?.forkedFrom?.purpose === "helper";
      const parent = attachToCenter && sessionId && !currentIsHelper ? sessionId : undefined;
      conv.createHelper(parent, text ? { text, autoSend: true } : undefined);
    },
    [app.sessions, conv, sessionId],
  );

  // Duplicate straight from the session list — no need to open the source
  // first. The server attaches to the copy, so the view follows it.
  const duplicateSession = useCallback((target: string) => {
    conv.duplicate(target);
  }, [conv]);

  const branchRevision = useCallback(
    (text: string, entryId?: string) => {
      if (!text.trim() || conv.isRunning || !sessionId) return false;
      if (!conv.branchRevision(text, entryId)) return false;
      // This conversation keeps running its own life — the branch opens in
      // the right Related panel on `branch_created`.
      conv.notify({
        kind: "text",
        text: entryId
          ? t("Same question, fresh answer. What repeats is probably solid; what changes was a choice.")
          : t("Both takes are kept — the branch is in Related conversations on the right."),
      });
      return true;
    },
    [conv, sessionId],
  );

  const prepareBranchRevision = useCallback(
    (text: string, entryId: string) => {
      const trimmed = text.trim();
      if (!trimmed || !entryId || conv.isRunning || !sessionId) return false;
      return conv.prepareBranchRevision(entryId, { text: trimmed, autoSend: false });
    },
    [conv, sessionId],
  );

  const clearChildSeed = useCallback(() => setChildSeed(null), []);

  const promoteRelatedSession = useCallback(
    async (target: string) => {
      await promoteRelatedSessionRequest(target);
      await app.refreshSessions();
      openCatalogSession(target);
    },
    [app, openCatalogSession],
  );

  const renameSession = useCallback(
    async (target: string, name: string) => {
      const alias = normalizeSessionAlias(name);
      try {
        await saveSessionAlias(target, alias);
        app.setSessionDisplayName(target, alias);
        return true;
      } catch (err) {
        conv.notify({
          kind: "text",
          text: `Rename failed: ${err instanceof Error ? err.message : String(err)}`,
          warn: true,
        });
        return false;
      }
    },
    [app, conv],
  );

  const deleteSessions = useCallback(
    async (target: string, wholeFamily: boolean) => {
      try {
        const deletedIds = wholeFamily
          ? await deleteSessionFamilyRequest(target)
          : (await deleteSessionRequest(target), [target]);
        // A deleted conversation takes its draft with it.
        deletedIds.forEach(discardDraft);
        if (sessionId && deletedIds.includes(sessionId)) conv.startNew();
        // Nothing of a deleted conversation stays on show or comes back.
        shell.forgetConversations(deletedIds);
        await app.refreshSessions();
      } catch (err) {
        conv.notify({
          kind: "text",
          text: `Delete failed: ${err instanceof Error ? err.message : String(err)}`,
          warn: true,
        });
      }
    },
    [app, conv, sessionId, shell.forgetConversations],
  );

  const addApprovalMarker = useCallback((text: string) => {
    setApprovalMarkers((prev) => (prev.includes(text) ? prev : [...prev, text]));
  }, []);

  const value = useMemo<MainViewValue>(
    () => ({
      conversation: conv,
      selectedCatalogSessionId,
      sessionAlerts,
      openCatalogSession,
      startNewSession,
      compactCurrentSession,
      forkCurrentSession,
      openHelper,
      duplicateSession,
      branchRevision,
      prepareBranchRevision,
      childSeed,
      clearChildSeed,
      promoteRelatedSession,
      renameSession,
      deleteSession: (target) => void deleteSessions(target, false),
      deleteSessionFamily: (target) => void deleteSessions(target, true),
      approvalMarkers,
      addApprovalMarker,
    }),
    [
      conv,
      selectedCatalogSessionId,
      sessionAlerts,
      openCatalogSession,
      startNewSession,
      compactCurrentSession,
      forkCurrentSession,
      openHelper,
      duplicateSession,
      branchRevision,
      prepareBranchRevision,
      childSeed,
      clearChildSeed,
      promoteRelatedSession,
      renameSession,
      deleteSessions,
      approvalMarkers,
      addApprovalMarker,
    ],
  );

  return (
    <MainViewContext.Provider value={value}>
      <ConversationScope conversation={conv} parts={parts}>
        {children}
      </ConversationScope>
    </MainViewContext.Provider>
  );
}

export function useMainView(): MainViewValue {
  const value = useContext(MainViewContext);
  if (!value) throw new Error("useMainView must be used within MainViewProvider");
  return value;
}
