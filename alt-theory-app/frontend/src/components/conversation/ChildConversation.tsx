import { useEffect, useMemo, useRef, useState } from "react";
import type { ServerMessage } from "@/api/types";
import { promoteToMainline as promoteToMainlineRequest } from "@/api/sessions";
import { useApp } from "@/context/AppProvider";
import { useShell } from "@/context/ShellContext";
import { ConversationScope, useConversationContext, useTurnParts } from "@/context/ConversationContext";
import { useMainView } from "@/context/MainView";
import { useConversation } from "@/hooks/useConversation";
import { useStickToBottom } from "@/hooks/useStickToBottom";
import { useEarlierRows } from "@/hooks/useEarlierRows";
import { useFindTarget } from "@/lib/find";
import { runPhaseLabels } from "@/lib/runState";
import { useAutosizeTextarea } from "@/lib/autosizeTextarea";
import { canTakeMainline, isListMember } from "@/lib/sessionList";
import { t } from "@/i18n";
import { ApprovalDock } from "@/components/conversation/ApprovalDock";
import { SettledMessages, StreamPartsView } from "@/components/conversation/MessageList";
import { ModelChip } from "@/components/conversation/ModelChip";
import { QueuedCards } from "@/components/conversation/QueuedCards";
import { ContinueButton, hasRunNotes, NoticeLine, RunStatusSlot } from "@/components/conversation/RunNotes";
import { SlashPalette, useSlashCommands, useSlashPalette } from "@/components/conversation/SlashPalette";
import { PendingMark } from "@/components/ui/PendingMark";

/**
 * A conversation other than the one in the center: a branch shown beside it for
 * comparison, a BTW/Helper side chat, or a subagent. Same conversation module,
 * same bubbles and shared composer pieces as the main conversation — only the
 * width and the header line differ. Per-message branching stays with the
 * center conversation; open this one from the list if you want to branch off it.
 */
export function ChildConversation({
  sessionId,
  onClose,
}: {
  sessionId: string;
  onClose: () => void;
}) {
  const app = useApp();
  const shell = useShell();
  const { conversation, parts } = useConversation({
    sessionId,
    enabled: true,
    onMessage: (message: ServerMessage) => {
      switch (message.type) {
        case "branch_created":
          shell.openTarget({ kind: "conversation", sessionId: message.payload.sessionId }, { size: "half" });
          void app.refreshSessions();
          break;
        case "related_session_created":
          // A subagent spawned from this pane never opens the rail; its
          // Related row is the feedback. btw/helper keep taking over.
          if (message.payload.purpose !== "subagent") {
            shell.openTarget({ kind: "conversation", sessionId: message.payload.sessionId }, { size: "default" });
          }
          void app.refreshSessions();
          break;
        default:
          break;
      }
    },
  });
  return (
    <ConversationScope conversation={conversation} parts={parts}>
      <ChildPane sessionId={sessionId} onClose={onClose} />
    </ConversationScope>
  );
}

function ChildPane({ sessionId, onClose }: { sessionId: string; onClose: () => void }) {
  const app = useApp();
  const main = useMainView();
  const conversation = useConversationContext();
  const parts = useTurnParts();
  // This child's own draft (lib/draft): closing and reopening keeps it.
  const draft = conversation.draftText;
  const setDraft = conversation.setDraftText;
  // Grow with content like the main composer (CSS max-height caps it).
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  useAutosizeTextarea(textareaRef, draft);
  const [menu, setMenu] = useState<"role" | "model" | null>(null);
  const ctxLineRef = useRef<HTMLDivElement>(null);
  const developer = app.transcriptView === "developer";
  const { messages, isRunning: running } = conversation;
  // A role chosen mid-run renders as the chosen value plus the pending mark
  // (same rule as the main composer).
  const childRoleSlug = conversation.selectors.rolePresetSlug;
  const pendingChildRole = conversation.pendingChanges.rolePresetSlug !== undefined;
  const approval = conversation.approvals.find((request) => request.sessionId === sessionId);
  const { containerRef: messagesRef, onScroll } = useStickToBottom([messages, parts]);
  const onScrollEarlier = useEarlierRows(messagesRef, messages, conversation);
  useFindTarget(messagesRef, {});

  // Role/model menus close on any click outside the context line (same
  // pattern as the main Composer).
  useEffect(() => {
    if (!menu) return;
    const onDoc = (event: MouseEvent) => {
      if (!ctxLineRef.current?.contains(event.target as Node)) setMenu(null);
    };
    document.addEventListener("click", onDoc);
    return () => document.removeEventListener("click", onDoc);
  }, [menu]);
  useEffect(() => {
    if (!menu) return;
    const onEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      setMenu(null);
    };
    document.addEventListener("keydown", onEscape);
    return () => document.removeEventListener("keydown", onEscape);
  }, [menu]);

  const summary = app.sessions.find((item) => item.sessionId === sessionId);
  const purpose = summary?.forkedFrom?.purpose ?? "side";
  const inList = summary ? isListMember(summary) : true;
  // M4b role swap entry points: a branch can take the list spot; a delisted
  // origin can take it back. Hidden when promotion would change nothing.
  const mainlineAction =
    summary && canTakeMainline(summary, app.sessions)
      ? summary.forkedFrom
        ? t("Make this the main conversation")
        : t("Make this the main conversation again")
      : null;
  const reportError = (reason: unknown) =>
    conversation.notify({
      kind: "text",
      text: reason instanceof Error ? reason.message : String(reason),
      icon: "warning",
      warn: true,
    });

  // A Helper/BTW opened with a question already typed asks it straight away
  // instead of greeting the user with "what can I help with?".
  const seed = main.childSeed;
  const seedSentRef = useRef(false);
  useEffect(() => {
    if (!seed || seed.sessionId !== sessionId || seedSentRef.current) return;
    if (!conversation.sessionReady) return;
    seedSentRef.current = true;
    main.clearChildSeed();
    if (seed.autoSend) conversation.prompt(seed.text);
    else setDraft(seed.text);
  }, [conversation, main, seed, sessionId]);

  const send = () => {
    // Nothing goes out before this conversation is open (or re-opened after
    // a reconnect): the socket would be on its draft and create a new one.
    if (!conversation.sessionReady) return;
    const text = draft.trim();
    // Files handed back to this draft (Stop) go out with the text.
    const attachments = [...conversation.stagedWorkspacePaths];
    // While a turn runs the text joins Pi's steer queue (card 11): delivered
    // at the next API call, a bubble when Pi hands it to the model.
    if ((text || attachments.length) && conversation.prompt(text, attachments)) {
      conversation.clearDraft(attachments);
    }
  };

  const helper = useMemo(
    () => ({
      name: "helper",
      description: t("Ask how Alt works, or get setup fixed — in a fresh Helper conversation"),
      run: () => main.openHelper(undefined, true),
      immediate: true,
    }),
    [main],
  );
  const commands = useSlashCommands({ live: true, helper });
  const palette = useSlashPalette({ draft, commands, setDraft });

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

  const abort = () => conversation.abort();

  return (
    <div className="child-conv panel">
      <div className="child-head">
        <button className="flat" onClick={onClose} data-tip={t("Close")}>
          <i className="ph ph-arrow-left" aria-hidden="true" />
        </button>
        <span className="child-what">{childBlurb(purpose)}</span>
        {mainlineAction ? (
          <button
            className="flat promote-action"
            data-tip={t("This conversation takes the list spot; the current one stays available from its Related rail.")}
            onClick={() => {
              void promoteToMainlineRequest(sessionId)
                .then(() => app.refreshSessions())
                .catch(reportError);
            }}
          >
            <i className="ph ph-crown-simple" aria-hidden="true" />{" "}
            {mainlineAction}
          </button>
        ) : inList || purpose === "helper" ? null : (
          <button
            className="flat promote-action"
            data-tip={t("Keep this conversation in your list, with where it came from.")}
            onClick={() => {
              void main.promoteRelatedSession(sessionId).catch(reportError);
            }}
          >
            <i className="ph ph-arrow-line-up" aria-hidden="true" />{" "}
            {t("Add to conversation list")}
          </button>
        )}
      </div>

      <div
        className="msgs child-msgs"
        ref={messagesRef}
        onScroll={(event) => {
          onScroll(event);
          onScrollEarlier();
        }}
      >
        <SettledMessages
          messages={messages}
          developer={developer}
          latestUserIndex={latestUserIndex}
          latestAssistantIndex={latestAssistantIndex}
          isRunning={running}
        />
        <StreamPartsView parts={parts} developer={developer} />
      </div>

      {approval ? (
        <ApprovalDock
          request={approval}
          onRespond={conversation.respondApproval}
          onSessionAllow={() => undefined}
        />
      ) : null}

      <QueuedCards />

      <div className="ctx-line child-ctx-line" ref={ctxLineRef}>
        <div className="ctx-picker">
          <button className="ctx-item" onClick={() => setMenu(menu === "role" ? null : "role")}>
            <i className="ph ph-user-circle" />
            {childRoleSlug
              ? (app.discovery?.rolePresets.find((role) => role.slug === childRoleSlug)?.userLabel ?? childRoleSlug)
              : t("No role")}
            <PendingMark when={pendingChildRole} />
          </button>
          <div className={`menu${menu === "role" ? " on" : ""}`}>
            <div className="mi" onClick={() => (conversation.switchRolePreset(null), setMenu(null))}>
              <span>{t("No role")}</span>
              {!childRoleSlug ? <i className="ph ph-check check" /> : null}
            </div>
            {(app.discovery?.rolePresets ?? []).map((role) => (
              <div key={role.slug} className="mi" onClick={() => (conversation.switchRolePreset(role.slug), setMenu(null))}>
                <span>{role.userLabel || role.displayName}</span>
                {childRoleSlug === role.slug ? <i className="ph ph-check check" /> : null}
              </div>
            ))}
          </div>
        </div>
        <ModelChip open={menu === "model"} onToggle={() => setMenu(menu === "model" ? null : "model")} />
      </div>
      <SlashPalette palette={palette} className="slash-palette child-slash-palette" />
      {hasRunNotes(conversation) ? (
        <div className="composer-notes">
          <RunStatusSlot />
          <NoticeLine />
          <ContinueButton />
        </div>
      ) : null}
      <div className="composer child-composer">
        <textarea
          ref={textareaRef}
          rows={1}
          value={draft}
          disabled={!conversation.sessionReady}
          placeholder={conversation.sessionReady ? t("Reply here") : t("Connecting…")}
          onChange={(event) => {
            setDraft(event.target.value);
            palette.reset();
          }}
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              event.preventDefault();
              if (menu) setMenu(null);
              else if (palette.open) palette.dismiss();
              else if (running) abort();
              return;
            }
            if (palette.onKeyDown(event)) return;
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault();
              send();
            }
          }}
        />
        <div className="row">
          <button
            className="send"
            disabled={!(draft.trim() || conversation.stagedWorkspacePaths.length) || !conversation.sessionReady}
            onClick={send}
            data-tip={running ? runPhaseLabels().queued : t("Send")}
          >
            <i className="ph ph-arrow-up" aria-hidden="true" />
          </button>
          {running ? (
            <button
              className="send"
              style={{ background: "var(--danger)" }}
              onClick={abort}
              data-tip={t("Stop")}
            >
              <i className="ph ph-square" aria-hidden="true" />
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}

/** One lowkey line saying what this pane is — not a repeat of the title. */
function childBlurb(purpose: string): string {
  if (purpose === "helper") {
    return t("Questions about Alt itself, and setup fixes — fresh context.");
  }
  if (purpose === "subagent") {
    return t("A subagent working on its own — you can join in.");
  }
  if (purpose === "fork") {
    return t("A branch of this conversation.");
  }
  return t("A related question, kept out of the main conversation.");
}
