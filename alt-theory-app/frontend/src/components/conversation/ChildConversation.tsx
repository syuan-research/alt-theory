import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ServerMessage, SessionSnapshot } from "@/api/types";
import {
  fetchSessionDetail,
  promoteToMainline as promoteToMainlineRequest,
  retractQueuedText,
} from "@/api/sessions";
import { useApp } from "@/context/AppProvider";
import { useWebSocket, type WsConnStatus } from "@/hooks/useWebSocket";
import { useConversationEngine } from "@/hooks/useConversationEngine";
import { useStickToBottom } from "@/hooks/useStickToBottom";
import { appendDraft } from "@/lib/draft";
import { failureText } from "@/lib/failure";
import { runPhaseLabels, runStateView } from "@/lib/runState";
import { canTakeMainline, isListMember } from "@/lib/sessionList";
import { t } from "@/i18n";
import { ApprovalDock } from "@/components/conversation/ApprovalDock";
import { SettledMessages, StreamPartsView } from "@/components/conversation/MessageList";
import { ModelChip } from "@/components/conversation/ModelChip";

/**
 * A conversation other than the one in the center: a branch shown beside it for
 * comparison, a BTW/Helper side chat, or a subagent. Same bubbles, same
 * composer, same send button as the main conversation — only the width and the
 * header line differ. Per-message branching stays with the center conversation;
 * open this one from the list if you want to branch off it.
 */
export function ChildConversation({
  sessionId,
  variant = "panel",
  onClose,
}: {
  sessionId: string;
  /** @deprecated Only "panel" remains; center compare pane was removed (A/B uses Comparison/ArmSplit). */
  variant?: "panel" | "compare";
  onClose: () => void;
}) {
  const app = useApp();
  const [draft, setDraft] = useState("");
  const [error, setError] = useState("");
  // This pane's own socket state, set only by the socket; info notices ride
  // as the idle label. The header label is runStateView's (rule 3).
  const [socketStatus, setSocketStatus] = useState<WsConnStatus>("connecting");
  const [notice, setNotice] = useState("");
  const connected = socketStatus === "open";
  const [snapshot, setSnapshot] = useState<SessionSnapshot | null>(null);
  const [menu, setMenu] = useState<"role" | "model" | null>(null);
  const [slashIndex, setSlashIndex] = useState(0);
  const [slashDismissed, setSlashDismissed] = useState(false);
  const ctxLineRef = useRef<HTMLDivElement>(null);
  const developer = app.transcriptView === "developer";

  const refreshTranscript = useCallback(async () => {
    const detail = await fetchSessionDetail(sessionId);
    engine.setMessages(detail.transcript ?? []);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId]);

  const startPromptRef = useRef<(text: string, attachments: string[]) => boolean>(() => false);
  // Pi's queue for this conversation (card 11), mirrored from the server.
  const [queued, setQueued] = useState<string[]>([]);

  // Same recall as the main composer: edit puts the text back in the editor,
  // delete drops it; the card goes even when Pi already sent it. This pane's
  // editor stages no attachments, so retracted paths are dropped here.
  const recallQueued = async (text: string, toEditor: boolean) => {
    const retracted = await retractQueuedText(sessionId, text);
    setQueued((current) => {
      const index = current.indexOf(text);
      return index < 0
        ? current
        : [...current.slice(0, index), ...current.slice(index + 1)];
    });
    if (toEditor && retracted !== null) {
      setDraft((current) => appendDraft(current, retracted.text));
    }
  };

  // The ONE conversation engine, shared with the center pane; only this
  // pane's snapshot/status handling stays local.
  const engine = useConversationEngine({
    onRunCompleted: (payload) => {
      setSnapshot(payload);
      setNotice("");
      void refreshTranscript();
      void app.refreshSessions();
    },
    onRunFailed: ({ failure, recovery }) => {
      void refreshTranscript();
      const interrupted = recovery?.outcome === "interrupted";
      if (!interrupted) setError(failureText(failure));
    },
  });
  const { messages, streamParts, running } = engine;
  const approvals = app.approvals.filter(
    (request) => request.sessionId === sessionId,
  );
  const { containerRef: messagesRef, onScroll } = useStickToBottom([
    messages,
    streamParts,
  ]);

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

  const onMessage = useCallback(
    (message: ServerMessage) => {
      if (engine.handleMessage(message)) return;
      switch (message.type) {
        case "session_opened":
        case "session_updated":
          setSnapshot(message.payload);
          engine.applySnapshot(message.payload);
          setQueued([
            ...(message.payload.queue?.steering ?? []),
            ...(message.payload.queue?.followUp ?? []),
          ]);
          break;
        case "queue_updated":
          setQueued([...message.payload.steering, ...message.payload.followUp]);
          if (message.payload.restored?.length) {
            const restored = message.payload.restored.join("\n");
            setDraft((current) =>
              [restored, current].filter((part) => part.trim()).join("\n"),
            );
          }
          break;
        case "branch_created":
          app.setActiveRelatedSessionId(message.payload.sessionId, { size: "half" });
          void app.refreshSessions();
          break;
        case "related_session_created":
          app.setActiveRelatedSessionId(message.payload.sessionId, { size: "default" });
          void app.refreshSessions();
          break;
        case "extension_notice":
          if (message.payload.level === "info") {
            setNotice(message.payload.message);
            setError("");
          } else {
            setError(message.payload.message);
          }
          break;
        case "error":
          // A refused request is not a run outcome (card 2).
          setError(failureText(message.payload.failure));
          break;
        default:
          break;
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [app, engine.handleMessage, engine.applySnapshot],
  );

  const socket = useWebSocket({
    enabled: true,
    reconnectSessionId: sessionId,
    onMessage,
    onStatus: setSocketStatus,
  });

  // A Helper/BTW opened with a question already typed asks it straight away
  // instead of greeting the user with "what can I help with?".
  const seed = app.childSeed;
  const seedSentRef = useRef(false);
  useEffect(() => {
    if (!seed || seed.sessionId !== sessionId || seedSentRef.current) return;
    if (!connected) return;
    if (!seed.autoSend) {
      seedSentRef.current = true;
      setDraft(seed.text);
      app.clearChildSeed();
      return;
    }
    if (startPromptRef.current(seed.text, [])) {
      seedSentRef.current = true;
      app.clearChildSeed();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [app, connected, seed, sessionId, socket]);

  // Direct send (idle only — the queue flush also lands here).
  startPromptRef.current = (text: string) => {
    if (!socket.send({ type: "prompt", payload: text })) return false;
    engine.setMessages((current) => [...current, { role: "user", text, timestamp: null }]);
    engine.setRunning(true);
    return true;
  };

  // A message during a run joins Pi's steer queue (card 11): delivered at
  // the next API call, shown as a bubble when Pi hands it to the model.
  const send = () => {
    const text = draft.trim();
    if (!text) return;
    if (running) {
      if (socket.send({ type: "prompt", payload: text, deliverAs: "steer" })) {
        setDraft("");
        setError("");
      }
      return;
    }
    if (startPromptRef.current(text, [])) {
      setDraft("");
      setError("");
    }
  };


  const slashCommands = useMemo(() => [
    { name: "helper", description: t("Ask how Alt works, or get setup fixed — in a fresh Helper conversation"), run: () => app.openHelper(undefined, true), immediate: true },
    { name: "branch", description: t("Branch this conversation into a new direction"), run: () => socket.send({ type: "fork_session", payload: { purpose: "fork" } }), immediate: true },
    { name: "btw", description: t("Start a side conversation without adding it to the list"), run: () => socket.send({ type: "create_related_session", payload: { purpose: "side" } }), immediate: true },
    { name: "compact", description: t("Compact this conversation to free context space"), run: () => socket.send({ type: "compact" }), immediate: true },
    { name: "new", description: t("Start a new conversation"), run: () => app.startNewSession(), immediate: true },
    ...(app.discovery?.skills ?? []).filter((skill) => skill.enabled?.[snapshot?.mode ?? "understand"] !== false).map((skill) => ({
      name: skill.name,
      description: skill.description || t("Alt Theory skill"),
      run: (args: string) => socket.send({ type: "invoke_skill", payload: { skillName: skill.name, ...(args.trim() ? { userText: args.trim() } : {}) } }),
      immediate: false,
    })),
  ], [app, socket]);
  const slashQuery = draft.startsWith("/") && !draft.startsWith("//") ? draft.slice(1) : null;
  const slashMatches = useMemo(() => {
    if (slashQuery === null) return [];
    const token = slashQuery.split(/\s+/, 1)[0].toLowerCase();
    return slashCommands.filter((command) => command.name.toLowerCase().startsWith(token));
  }, [slashCommands, slashQuery]);
  const slashOpen = !slashDismissed && slashMatches.length > 0;
  useEffect(() => setSlashIndex(0), [slashMatches.length]);
  const runSlash = (command: (typeof slashCommands)[number]) => {
    const args = slashQuery?.split(/\s+/).slice(1).join(" ") ?? "";
    if (!command.immediate && !args.trim()) {
      setDraft(`/${command.name} `);
      return;
    }
    setDraft("");
    command.run(args);
  };

  const respondApproval = (
    approvalId: string,
    response: { accept?: boolean; choice?: string | null; text?: string | null },
  ) => {
    socket.send({ type: "respond_approval", payload: { approvalId, ...response } });
  };

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

  return (
    <div className={`child-conv ${variant}`}>
      <div className="child-head">
        <button className="flat" onClick={onClose} data-tip={t("Close")}>
          <i className="ph ph-arrow-left" aria-hidden="true" />
        </button>
        <span className="child-what">{childBlurb(purpose, variant)}</span>
        <span className="child-status">
          {
            runStateView({
              socket: socketStatus,
              running,
              busy: false,
              phaseLabel: engine.phaseLabel,
              toolStatus: notice,
              pending: snapshot?.pending ?? {},
            }).label
          }
        </span>
        {mainlineAction ? (
          <button
            className="flat promote-action"
            data-tip={t("This conversation takes the list spot; the current one stays available from its Related rail.")}
            onClick={() => {
              void promoteToMainlineRequest(sessionId)
                .then(() => app.refreshSessions())
                .catch((reason) =>
                  setError(
                    reason instanceof Error ? reason.message : String(reason),
                  ),
                );
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
              void app.promoteRelatedSession(sessionId).catch((reason) =>
                setError(reason instanceof Error ? reason.message : String(reason)),
              );
            }}
          >
            <i className="ph ph-arrow-line-up" aria-hidden="true" />{" "}
            {t("Add to conversation list")}
          </button>
        )}
      </div>

      <div className="msgs child-msgs" ref={messagesRef} onScroll={onScroll}>
        <SettledMessages
          messages={messages}
          developer={developer}
          latestUserIndex={latestUserIndex}
          latestAssistantIndex={latestAssistantIndex}
          isRunning={running}
        />
        <StreamPartsView parts={streamParts} developer={developer} />
      </div>

      {approvals[0] ? (
        <ApprovalDock
          request={approvals[0]}
          onRespond={respondApproval}
          onSessionAllow={() => undefined}
        />
      ) : null}
      {error ? <div className="related-error">{error}</div> : null}

      {queued.length > 0 ? (
        <div className="queued-prompts" aria-label={t("Queued messages")}>
          {queued.map((text, index) => (
            <div className="queued-prompt" key={`${index}:${text}`}>
              <i className="ph ph-clock" aria-hidden="true" />
              <span className="queued-prompt-text" data-tip={text}>
                {text}
              </span>
              <button
                type="button"
                className="queued-prompt-action"
                onClick={() => void recallQueued(text, true)}
              >
                {t("Edit")}
              </button>
              <button
                type="button"
                className="queued-prompt-action"
                onClick={() => void recallQueued(text, false)}
                data-tip={t("Delete")}
                aria-label={t("Delete")}
              >
                <i className="ph ph-trash" aria-hidden="true" />
              </button>
            </div>
          ))}
        </div>
      ) : null}

      <div className="ctx-line child-ctx-line" ref={ctxLineRef}>
        <div className="ctx-picker">
          <button className="ctx-item" onClick={() => setMenu(menu === "role" ? null : "role")}>
            <i className="ph ph-user-circle" />
            {snapshot?.rolePresetSlug
              ? (app.discovery?.rolePresets.find((role) => role.slug === snapshot.rolePresetSlug)?.userLabel ?? snapshot.rolePresetSlug)
              : t("No role")}
          </button>
          <div className={`menu${menu === "role" ? " on" : ""}`}>
            <div className="mi" onClick={() => (socket.send({ type: "switch_role_preset", payload: { rolePresetSlug: null } }), setMenu(null))}>
              <span>{t("No role")}</span>
            </div>
            {(app.discovery?.rolePresets ?? []).map((role) => (
              <div key={role.slug} className="mi" onClick={() => (socket.send({ type: "switch_role_preset", payload: { rolePresetSlug: role.slug } }), setMenu(null))}>
                <span>{role.userLabel || role.displayName}</span>
              </div>
            ))}
          </div>
        </div>
        <ModelChip
          open={menu === "model"}
          onToggle={() => setMenu(menu === "model" ? null : "model")}
          session={{
            ready: connected && Boolean(snapshot),
            modelOverride:
              snapshot?.pending?.model !== undefined
                ? snapshot.pending.model
                : (snapshot?.modelOverride ?? null),
            currentModel: snapshot?.currentModel ?? null,
            thinking: snapshot?.thinking ?? null,
            pendingModel: snapshot?.pending?.model !== undefined,
            setModel: (override) => socket.send({ type: "set_session_model", payload: { override } }),
          }}
        />
      </div>
      {slashOpen ? (
        <div className="slash-palette child-slash-palette">
          {slashMatches.map((command, index) => (
            <button key={command.name} className={`slash-item${index === slashIndex ? " on" : ""}`} onMouseEnter={() => setSlashIndex(index)} onClick={() => runSlash(command)}>
              <span className="cmd">/{command.name}</span>
              <span className="desc">{command.description}</span>
            </button>
          ))}
        </div>
      ) : null}
      <div className="composer child-composer">
        <textarea
          rows={1}
          value={draft}
          placeholder={t("Reply here")}
          onChange={(event) => {
            setDraft(event.target.value);
            setSlashDismissed(false);
          }}
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              event.preventDefault();
              if (menu) setMenu(null);
              else if (slashOpen) setSlashDismissed(true);
              else if (running) {
                socket.send({ type: "abort" });
                engine.setPhaseLabel(runPhaseLabels().stopping);
              }
              return;
            }
            if (slashOpen) {
              if (event.key === "ArrowDown" || event.key === "ArrowUp") {
                event.preventDefault();
                const step = event.key === "ArrowDown" ? 1 : -1;
                setSlashIndex((index) => (index + step + slashMatches.length) % slashMatches.length);
                return;
              }
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                runSlash(slashMatches[slashIndex]);
                return;
              }
            }
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault();
              send();
            }
          }}
        />
        <div className="row">
          <button
            className="send"
            disabled={!draft.trim()}
            onClick={send}
            data-tip={running ? runPhaseLabels().queued : t("Send")}
          >
            <i className="ph ph-arrow-up" aria-hidden="true" />
          </button>
          {running ? (
            <button
              className="send"
              style={{ background: "var(--danger)" }}
              onClick={() => {
                socket.send({ type: "abort" });
                engine.setPhaseLabel(runPhaseLabels().stopping);
              }}
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
function childBlurb(purpose: string, _variant?: "panel" | "compare"): string {
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
