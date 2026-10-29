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
import { discardDraft, NEW_DRAFT, updateDraft } from "@/lib/draft";

/**
 * The main view: which conversation the center shows, and what follows from
 * that — its navigation (open, new, branch, copy, delete), the list
 * highlight, the right-pane seeds, and the list's attention marks. The
 * conversation itself is a plain useConversation, bound to the subtree.
 */
export interface MainViewValue {
  conversation: Conversation;
  /** The list highlight: the conversation being opened, else the one shown. */
  selectedCatalogSessionId: string | null;
  /** Conversations that changed state while you were looking elsewhere. */
  sessionAlerts: Record<string, SessionAlert>;
  markSessionRead: (sessionId: string) => void;
  /** False when nothing was sent (same session, cannot open, socket down). */
  openCatalogSession: (sessionId: string) => boolean;
  startNewSession: () => void;
  compactCurrentSession: () => void;
  forkCurrentSession: (purpose: "fork" | "side" | "ab-arm", seedPrompt?: string) => void;
  askAboutAlt: () => void;
  duplicateSession: (sessionId: string) => void;
  /** Draft for a just-created child; helper sends immediately, compare waits. */
  childSeed: { sessionId: string; text: string; autoSend: boolean } | null;
  clearChildSeed: () => void;
  promoteRelatedSession: (sessionId: string) => Promise<void>;
  renameSession: (sessionId: string, name: string) => Promise<boolean>;
  deleteSession: (sessionId: string) => void;
  deleteSessionFamily: (sessionId: string) => void;
}

const MainViewContext = createContext<MainViewValue | null>(null);

export function MainViewProvider({ children }: { children: ReactNode }) {
  const app = useApp();
  // Conversation events that open a side conversation go straight to the
  // navigation owner (ShellProvider is outside this provider).
  const shell = useShell();
  const [childSeed, setChildSeed] = useState<MainViewValue["childSeed"]>(null);
  const [sessionAlerts, setSessionAlerts] = useState<Record<string, SessionAlert>>({});

  const onMessageRef = useRef<(message: ServerMessage) => void>(() => {});
  const { conversation: conv, parts } = useConversation({
    sessionId: null,
    enabled: !app.loading,
    onMessage: (message) => onMessageRef.current(message),
  });
  const sessionId = conv.sessionId;

  // The list highlight follows what the user opened or created, nothing
  // else: a fresh app shows none (owner 2026-09-24); an open in flight shows
  // its target, a refused open falls back to what is shown.
  const selectedCatalogSessionId = conv.opening ?? sessionId;

  // The seed of a created conversation rides on the request that creates
  // it; a refused or lost request takes its seed with it.
  const creatingSeed = () =>
    conv.requests.find(
      (request) =>
        request.status === "sent" &&
        request.seed &&
        (request.message.type === "fork_session" ||
          request.message.type === "create_related_session" ||
          request.message.type === "prepare_branch_revision"),
    )?.seed;

  onMessageRef.current = (message) => {
    switch (message.type) {
      case "session_opened": {
        void app.refreshSessions();
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
        // BTW keeps the original compact default (~480), not 50%.
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
      default:
        break;
    }
  };

  // Unseen failures survive idle snapshots; approval ends when no longer pending.
  const raiseAlerts = (changes: ActivityChange[]) => {
    // An open conversation can still finish while the app is in the background.
    for (const [id, alert] of Object.entries(alertsFor(changes, null))) {
      const name = app.sessionDisplayNames[id]?.alias || t("A conversation");
      if (alert === "done") notifyBackground(t("Work finished"), t("{name} finished its turn.", { name }));
      else if (alert === "failed") notifyBackground(t("Work stopped"), t("{name} ran into an error.", { name }));
      else notifyBackground(t("Waiting for you"), t("{name} needs your approval.", { name }));
    }
    const raised: Record<string, SessionAlert> = alertsFor(changes, sessionId);
    setSessionAlerts((prev) => {
      const next = { ...prev };
      for (const { sessionId: id, now } of changes) {
        if (now !== "idle" || next[id] !== "failed") delete next[id];
      }
      return { ...next, ...raised };
    });
  };

  const markSessionRead = useCallback((id: string) => {
    setSessionAlerts((prev) => {
      if (!(id in prev)) return prev;
      const next = { ...prev };
      delete next[id];
      return next;
    });
  }, []);

  // Reading clears the completion mark, not the conversation's live state.
  useEffect(() => {
    if (sessionId) markSessionRead(sessionId);
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
    (purpose: "fork" | "side" | "ab-arm", seedPrompt?: string) => {
      if (!sessionId) return;
      // The child asks the question the user already typed, instead of
      // opening with "what can I help with?".
      conv.fork(purpose, seedPrompt?.trim() ? { text: seedPrompt.trim(), autoSend: true } : undefined);
    },
    [conv, sessionId],
  );

  const askAboutAlt = useCallback(() => {
    if (!conv.startNew()) return;
    updateDraft(NEW_DRAFT, (draft) => ({
      ...draft,
      text: draft.text.startsWith("/skill:at-alt-theory-help")
        ? draft.text
        : `/skill:at-alt-theory-help ${draft.text}`,
    }));
  }, [conv]);

  // Duplicate straight from the session list — no need to open the source
  // first. The server attaches to the copy, so the view follows it.
  const duplicateSession = useCallback((target: string) => {
    conv.duplicate(target);
  }, [conv]);

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

  const value = useMemo<MainViewValue>(
    () => ({
      conversation: conv,
      selectedCatalogSessionId,
      sessionAlerts,
      markSessionRead,
      openCatalogSession,
      startNewSession,
      compactCurrentSession,
      forkCurrentSession,
      askAboutAlt,
      duplicateSession,
      childSeed,
      clearChildSeed,
      promoteRelatedSession,
      renameSession,
      deleteSession: (target) => void deleteSessions(target, false),
      deleteSessionFamily: (target) => void deleteSessions(target, true),
    }),
    [
      conv,
      selectedCatalogSessionId,
      sessionAlerts,
      markSessionRead,
      openCatalogSession,
      startNewSession,
      compactCurrentSession,
      forkCurrentSession,
      askAboutAlt,
      duplicateSession,
      childSeed,
      clearChildSeed,
      promoteRelatedSession,
      renameSession,
      deleteSessions,
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
