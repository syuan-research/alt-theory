import { useEffect, useMemo, useRef, useState } from "react";
import { PRESET_TURNS, useApp } from "@/context/AppProvider";
import { useConversationContext } from "@/context/ConversationContext";
import { useMainView } from "@/context/MainView";
import { useShell } from "@/context/ShellContext";
import { PendingMark } from "@/components/ui/PendingMark";
import { ApprovalDock } from "@/components/conversation/ApprovalDock";
import { ModelChip } from "@/components/conversation/ModelChip";
import { ContextRing } from "@/components/conversation/ContextRing";
import { QueuedCards } from "@/components/conversation/QueuedCards";
import { ContinueButton, hasRunNotes, NoticeLine, RunStatusSlot } from "@/components/conversation/RunNotes";
import { RunTips } from "@/components/conversation/RunTips";
import { SlashPalette, useSlashCommands, useSlashPalette } from "@/components/conversation/SlashPalette";
import { DEFAULT_KB_DOMAIN, KB_OFF_VALUE } from "@/lib/constants";
import { hasNativeBridge, pathsFromDroppedFiles, pickFiles } from "@/lib/native";
import { WORKSPACE_PATH_MIME } from "@/lib/workspace";
import { isWithheld, type SessionVisibility } from "@/api/types";
import { fmtTime } from "@/lib/format";
import { t } from "@/i18n";
import { autosizeTextarea } from "@/lib/autosizeTextarea";
import { runPhaseLabels } from "@/lib/runState";

type MenuKey = "plus" | "model" | "role" | "kb" | "presetcfg" | "perm" | null;
const SHOW_HELP_STARTERS = false;

/** Composer variant: `empty` = new-conversation (mode via cards, no switch). */
export function Composer({ variant }: { variant: "empty" | "live" }) {
  const app = useApp();
  const main = useMainView();
  const conv = useConversationContext();
  const shell = useShell();
  // The editor shows this conversation's draft (lib/draft, kept on this device).
  const draft = conv.draftText;
  const setDraft = conv.setDraftText;
  const [menu, setMenu] = useState<MenuKey>(null);
  // Preset toolbar (v1.4 round 1): open state survives reloads; the active
  // press/lock state lives in AppProvider so it survives pane switches.
  const [presetOpen, setPresetOpen] = useState<boolean>(
    () => window.localStorage.getItem("alt-preset-open") === "1",
  );
  const [moreHelpStarters, setMoreHelpStarters] = useState(false);
  const [helpQuestionArmed, setHelpQuestionArmed] = useState(false);
  // One-line hint in the tips slot when the card area switches (owner
  // 2026-08-05): each direction gets its own line, cleared after a beat.
  const [cardHint, setCardHint] = useState<string | null>(null);
  const cardHintTimer = useRef<number | null>(null);
  const togglePresetOpen = () => {
    const next = !presetOpen;
    setPresetOpen(next);
    window.localStorage.setItem("alt-preset-open", next ? "1" : "0");
    setCardHint(
      next
        ? t("Steer is for this moment: press a way of working and it rides your next few messages.")
        : t("Role and knowledge shape the whole conversation — they stay with it from the start."),
    );
    if (cardHintTimer.current) window.clearTimeout(cardHintTimer.current);
    cardHintTimer.current = window.setTimeout(() => setCardHint(null), 10000);
  };
  const [fileDragOver, setFileDragOver] = useState(false);
  const rowRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [toolboxSeen, setToolboxSeen] = useState(() => {
    try {
      return localStorage.getItem("alt-theory-toolbox-seen") === "1";
    } catch {
      return true;
    }
  });
  const markToolboxSeen = () => {
    if (toolboxSeen) return;
    setToolboxSeen(true);
    try {
      localStorage.setItem("alt-theory-toolbox-seen", "1");
    } catch {
      /* ignore */
    }
  };

  // Grow with content up to the CSS max-height (~8 lines), then scroll.
  useEffect(() => {
    autosizeTextarea(textareaRef.current);
  }, [draft]);

  // Close menus on outside click (mirrors the prototype's body-click close).
  useEffect(() => {
    if (!menu) return;
    const onDoc = (e: MouseEvent) => {
      if (!rowRef.current?.contains(e.target as Node)) setMenu(null);
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

  const slashMode = conv.sessionMode;
  const helper = useMemo(
    () => ({
      name: "helper",
      description: t("Ask how Alt works, or get setup fixed — in a new conversation on the side"),
      run: (args: string) => main.openHelper(args, variant === "live"),
    }),
    [main, variant],
  );
  const slashCommands = useSlashCommands({ live: variant === "live", mode: slashMode, helper });

  /** Put `/name ` in the box, focused, waiting for the user's actual request. */
  const armCommand = (name: string) => {
    setDraft(`/${name} `);
    setMenu(null);
    window.setTimeout(() => textareaRef.current?.focus(), 0);
  };
  const palette = useSlashPalette({ draft, commands: slashCommands, setDraft, onArm: armCommand });

  // Text handed back — Stop's unsent queue (card 11), a refused or lost
  // send — is already in this conversation's draft; the editor takes focus.
  useEffect(() => {
    if (conv.draftReturns) window.setTimeout(() => textareaRef.current?.focus(), 0);
  }, [conv.draftReturns]);

  const interactive = conv.sessionReady;
  const hasText = draft.trim().length > 0;
  const canAttach = app.appMode === "local" && interactive;
  // Full Access (v1.4.8): local-only and work-capable modes. On the draft
  // (new conversation) screen the choice applies once the first message
  // materializes the session.
  const fullAccessVisible =
    app.appMode === "local" &&
    (app.runtimeMode === "native-pi" || conv.sessionMode === "work");
  const canSend =
    interactive &&
    (hasText || conv.stagedWorkspacePaths.length > 0);
  const showVisibility =
    app.participant?.designated === true || app.viewMode === "researcher";
  // Only a hosted study deployment has a research team to withhold from — and
  // only there does "private" mean the conversation is eventually deleted.
  const hostedStudy = app.appMode === "hosted";
  const withheld = isWithheld(conv.selectors.visibility);
  // The expiry is only real on hosted; say WHEN, not just "in 7 days".
  const expiresOn =
    hostedStudy && withheld && conv.retentionDueAt
      ? fmtTime(conv.retentionDueAt)
      : null;
  const altControlsDisabled = app.runtimeMode === "native-pi";
  const understandMode = !altControlsDisabled && conv.sessionMode === "understand";
  // First-level paperclip: Understand only. Work keeps attach in the toolbox.
  const attachFirstLevel = canAttach && understandMode;

  /**
   * Send what is typed plus the staged files. An armed Steer preset of this
   * conversation rides along: its announcements lead the text, and an armed
   * press goes as the actual /skill: invoke (owner 2026-08-04).
   */
  const sendDraft = (): boolean => {
    const typed = draft.trim();
    const attachments = [...conv.stagedWorkspacePaths];
    if (!typed && attachments.length === 0) return false;
    const pending = app.pendingPreset(conv.sessionId);
    // Merge AFTER the empty-guard, and also for attachment-only sends (opus
    // B4: the announcement must never be silently discarded while the
    // button still claims to be active).
    const text = pending?.texts.length ? [...pending.texts, typed].filter(Boolean).join("\n\n") : typed;
    // ponytail: a message sent during a run can't ride the /skill: invoke
    // path, and invoke_skill carries no attachments — both degrade to the
    // wrapper text, which names the skill.
    const sent =
      pending?.invoke && attachments.length === 0 && !conv.isRunning
        ? conv.invokeSkill(pending.invoke, text, typed)
        : conv.prompt(text, attachments, typed);
    if (sent) app.presetSent(conv.sessionId);
    return sent;
  };

  const handleSubmit = () => {
    const sent = helpQuestionArmed
      ? conv.invokeSkill("alt-theory-help", draft)
      : sendDraft();
    if (sent) {
      conv.clearDraft();
      setHelpQuestionArmed(false);
    }
  };
  const approval = conv.approvals.find(
    (request) => request.sessionId === conv.sessionId,
  );

  const stageHelpQuestion = (question: string) => {
    conv.switchMode("understand");
    setHelpQuestionArmed(true);
    setDraft((current) =>
      current.trim() ? current.trimEnd() + "\n\n" + question : question,
    );
    window.setTimeout(() => textareaRef.current?.focus(), 0);
  };

  const applyGeneralKnowledgeWork = () => {
    if (app.runtimeMode !== "alt-theory") return;
    conv.switchMode("work");
    conv.switchRolePreset(null);
    conv.switchKb(KB_OFF_VALUE);
    window.setTimeout(() => textareaRef.current?.focus(), 0);
  };

  // ctx-line labels
  // A switch chosen mid-run renders as the chosen value plus the pending
  // mark (same rule as deferred mode/model switches).
  const roleSlug = conv.selectors.rolePresetSlug;
  const roleLabel = roleSlug
    ? (app.discovery?.rolePresets.find(
        (r) => r.slug === roleSlug,
      )?.userLabel ??
      app.discovery?.rolePresets.find(
        (r) => r.slug === roleSlug,
      )?.displayName ??
      roleSlug)
    : "No role";
  const kbDomain = conv.selectors.currentDomain;
  const kbOff = kbDomain === KB_OFF_VALUE;
  const kbLabel = kbOff
    ? "No knowledge base"
    : (app.discovery?.kbDomains.find(
        (k) => k.slug === kbDomain,
      )?.displayName ?? "Knowledge base");

  // Hosted "private" is the one value that really deletes — say so, and say
  // when. Local markers change nothing about what is kept.
  const switchVisibility = (visibility: SessionVisibility) => {
    if (!conv.switchVisibility(visibility)) return;
    if (visibility === "private") {
      conv.notify({
        kind: "text",
        icon: "eject",
        text: t("Private conversations and their files are deleted 7 days after you last use them. Download anything you want to keep."),
      });
    } else if (visibility === "no-export") {
      conv.notify({
        kind: "text",
        icon: "bookmark",
        text: t("Marked as not for export. Nothing is deleted or sent anywhere — this only affects what a future export includes."),
      });
    }
  };

  const toggle = (key: MenuKey) =>
    setMenu((prev) => (prev === key ? null : key));
  const needsModel =
    app.appMode === "local" &&
    app.localConfig !== null &&
    !app.localConfig.activeUsable &&
    !conv.modelOverride &&
    !conv.currentSessionModel;

  return (
    <div className="composer-wrap">
      <div className="composer-col">
        {approval ? (
          <ApprovalDock
            request={approval}
            onRespond={conv.respondApproval}
            onSessionAllow={main.addApprovalMarker}
          />
        ) : null}

        {hasRunNotes(conv) ||
        conv.stoppedByUser ||
        conv.recovery ||
        cardHint ||
        needsModel ? (
          <div className="composer-notes">
            <RunStatusSlot />
            <NoticeLine />
            {conv.stoppedByUser ? (
              <span>{t("Editing after Stop won't branch. Use /branch if needed.")}</span>
            ) : null}
            <ContinueButton />
            {needsModel ? (
              <span className="danger">
                {app.localConfig?.anyUsable
                  ? t("Choose a model for this conversation, or set a default in Settings.")
                  : t("No usable model is configured.")}{" "}
                <button
                  type="button"
                  className="flat"
                  onClick={() => shell.openSettings("models")}
                >
                  {t("Open Settings → Models")}
                </button>
                {" · "}
                <button
                  type="button"
                  className="flat"
                  onClick={shell.openExternalAiSetup}
                >
                  {t("Ask another AI to help configure it")}
                </button>
              </span>
            ) : null}
            <RunTips running={conv.isRunning} seedTip={cardHint} />
          </div>
        ) : null}

        {conv.stagedWorkspacePaths.length > 0 ? (
          <div className="staged-attachments" aria-label={t("Attached files")}>
            {conv.stagedWorkspacePaths.map((path) => (
              <span className="attachment-chip" key={path} data-tip={path}>
                <i className="ph ph-paperclip" aria-hidden="true" />
                <span>{path.split(/[\\/]/).pop() || path}</span>
                <button
                  type="button"
                  onClick={() => conv.unstage([path])}
                  data-tip={t("Remove attached file")}
                  aria-label={t("Remove attached file")}
                >
                  <i className="ph ph-x" aria-hidden="true" />
                </button>
              </span>
            ))}
          </div>
        ) : null}

        <QueuedCards onEdit={() => window.setTimeout(() => textareaRef.current?.focus(), 0)} />

        <div className="ctx-line">
          {/* Owner design: the Steer bar REPLACES the role/KB controls while
              open — they rarely change mid-conversation, and stacking rows
              is the thing to avoid. The toggle stays visible to bring them
              back. */}
          {presetOpen && variant === "live" ? (
            <div className="preset-bar">
              {app.presetButtons.map((name, index) => {
                const active =
                  app.presetState &&
                  app.presetState.sessionId === conv.sessionId &&
                  app.presetState.name === name
                    ? app.presetState
                    : null;
                // Tooltip = this skill's own job (owner 2026-08-05); what
                // "steer" means lives on the Steer toggle, not on every chip.
                const description = (app.discovery?.skills ?? []).find(
                  (skill) => skill.name === name,
                )?.description;
                const skillLine = description
                  ? `${name} — ${description}`
                  : name;
                return (
                  <button
                    key={name}
                    className={`preset-btn${active ? (active.locked ? " locked" : " on") : ""}`}
                    style={
                      active && !active.locked
                        ? {
                            opacity:
                              0.5 + 0.5 * (active.turnsLeft / PRESET_TURNS),
                          }
                        : undefined
                    }
                    disabled={!interactive}
                    data-tip={
                      active
                        ? `${skillLine}\n${
                            active.locked
                              ? t("Locked — click to release on your next message")
                              : t("Active for {count} more turns — click to lock", { count: active.turnsLeft })
                          }`
                        : skillLine
                    }
                    onClick={() => conv.sessionId && app.pressPreset(conv.sessionId, name)}
                  >
                    <span className="preset-num">{index + 1}</span>
                    <span className="preset-label">{name}</span>
                    {active?.locked ? (
                      <i className="ph ph-lock-simple" aria-hidden="true" />
                    ) : null}
                  </button>
                );
              })}
              <CtxPicker
                icon="ph-gear"
                label={t("Choose buttons")}
                open={menu === "presetcfg"}
                onToggle={() => toggle("presetcfg")}
              >
                {(app.discovery?.skills ?? [])
                  // Steer offers bundled skills only for now (owner 2026-08-05,
                  // tentative): steer semantics are written for them; most
                  // users don't author their own skills yet.
                  .filter((skill) => skill.source === "alt-theory")
                  .filter((skill) => skill.enabled?.[slashMode] !== false)
                  .map((skill) => {
                    const picked = app.presetButtons.includes(skill.name);
                    return (
                      <button
                        type="button"
                        key={skill.name}
                        className={`mi${!picked && app.presetButtons.length >= 5 ? " disabled" : ""}`}
                        onClick={() =>
                          app.setPresetButtons(
                            picked
                              ? app.presetButtons.filter((n) => n !== skill.name)
                              : app.presetButtons.length >= 5
                                ? app.presetButtons
                                : [...app.presetButtons, skill.name],
                          )
                        }
                      >
                        <span>{skill.name}</span>
                        {picked ? <i className="ph ph-check check" /> : null}
                      </button>
                    );
                  })}
              </CtxPicker>
            </div>
          ) : (
          <>
          <CtxPicker
            icon="ph-user-circle"
            label={roleLabel}
            open={menu === "role"}
            onToggle={() => toggle("role")}
            disabled={altControlsDisabled}
            pending={conv.pendingChanges.rolePresetSlug !== undefined}
          >
            <button
              type="button"
              className="mi"
              onClick={() => (conv.switchRolePreset(null), setMenu(null))}
            >
              <span>{t("No role")}</span>
              {!roleSlug ? (
                <i className="ph ph-check check" />
              ) : null}
            </button>
            {(app.discovery?.rolePresets ?? []).map((r) => (
              <button
                type="button"
                key={r.slug}
                className="mi"
                onClick={() => (conv.switchRolePreset(r.slug), setMenu(null))}
              >
                <span>{r.userLabel || r.displayName}</span>
                {roleSlug === r.slug ? (
                  <i className="ph ph-check check" />
                ) : null}
              </button>
            ))}
          </CtxPicker>

          <CtxPicker
            icon="ph-book-open"
            label={kbLabel}
            open={menu === "kb"}
            onToggle={() => toggle("kb")}
            disabled={altControlsDisabled}
            pending={conv.pendingChanges.kbDomain !== undefined}
          >
            <button
              type="button"
              className="mi"
              onClick={() => (conv.switchKb(DEFAULT_KB_DOMAIN), setMenu(null))}
            >
              <span>{t("EP knowledge base")}</span>
              {!kbOff ? <i className="ph ph-check check" /> : null}
            </button>
            {(app.discovery?.kbDomains ?? [])
              .filter((k) => k.slug !== DEFAULT_KB_DOMAIN)
              .map((k) => (
                <button
                  type="button"
                  key={k.slug}
                  className="mi"
                  onClick={() => (conv.switchKb(k.slug), setMenu(null))}
                >
                  <span>{k.displayName}</span>
                  {kbDomain === k.slug ? (
                    <i className="ph ph-check check" />
                  ) : null}
                </button>
              ))}
            <div className="sep" />
            <button
              type="button"
              className="mi"
              onClick={() => (conv.switchKb(KB_OFF_VALUE), setMenu(null))}
            >
              <span>{t("No knowledge base")}</span>
              {kbOff ? <i className="ph ph-check check" /> : null}
            </button>
          </CtxPicker>

          {showVisibility ? (
            <button
              className="ctx-item"
              onClick={() =>
                switchVisibility(
                  withheld
                    ? hostedStudy
                      ? "research"
                      : "exportable"
                    : hostedStudy
                      ? "private"
                      : "no-export",
                )
              }
              data-tip={
                hostedStudy
                  ? expiresOn
                    ? t("Kept from the research team. Unless you use it again, this conversation and its files are deleted on {date}.", { date: expiresOn })
                    : t("Private conversations are kept from the research team and deleted 7 days after you last use them.")
                  : t("A marker only: nothing here is hidden, sent anywhere, or deleted. It sets whether a future export includes this conversation.")
              }
            >
              <i
                className={withheld ? "ph ph-lock-simple" : "ph ph-share-network"}
              />
              {hostedStudy
                ? withheld
                  ? expiresOn
                    ? t("Private · until {date}", { date: expiresOn })
                    : t("Private")
                  : t("Shared")
                : withheld
                  ? t("Not for export")
                  : t("Exportable")}
              <PendingMark when={conv.pendingChanges.visibility !== undefined} />
            </button>
          ) : null}
          </>
          )}
          {variant === "live" ? (
            <button
              className={`ctx-item preset-toggle${presetOpen ? " on" : ""}`}
              data-tip={t("Steer — ask Alt to work a certain way for the next few turns")}
              onClick={togglePresetOpen}
            >
              <i className="ph ph-lightning" aria-hidden="true" />
              {t("Steer")}
            </button>
          ) : null}
        </div>

        <SlashPalette palette={palette} />

        {variant === "empty" && SHOW_HELP_STARTERS ? (
          <div className="empty-help-starters">
            <div className="starter-grid">
              {[
                t("Help me connect a model or API provider."),
                t("What can Alt Theory do, and when should I use Understand or Work?"),
                t("What Skills are available, and what words trigger them?"),
                t("What are subagents, and when will Alt use one?"),
                ...(moreHelpStarters
                  ? [
                      t("How do Branch and BTW differ?"),
                      t("How do roles and knowledge sets change a conversation?"),
                    ]
                  : []),
              ].map((question) => (
                <button key={question} onClick={() => stageHelpQuestion(question)}>
                  {question}
                </button>
              ))}
            </div>
            <div className="starter-foot">
              <button
                className="starter-more"
                onClick={() => setMoreHelpStarters((open) => !open)}
              >
                {moreHelpStarters ? t("Fewer questions") : t("More questions")}
              </button>
              <button
                className="general-work-preset"
                disabled={app.runtimeMode !== "alt-theory"}
                data-tip={t("Temporary preset: Work mode, no role, and no knowledge base. You can edit every choice before Send.")}
                onClick={applyGeneralKnowledgeWork}
              >
                <i className="ph ph-briefcase" />
                {t("General knowledge work")}
              </button>
            </div>
          </div>
        ) : null}

        <div
          className={`composer${fileDragOver ? " file-drag-over" : ""}`}
          onDragEnter={(e) => {
            if (!canAttach) return;
            const types = [...e.dataTransfer.types];
            if (types.includes(WORKSPACE_PATH_MIME)) {
              e.preventDefault();
              setFileDragOver(true);
              return;
            }
            if (!hasNativeBridge() || !types.includes("Files")) return;
            e.preventDefault();
            setFileDragOver(true);
          }}
          onDragOver={(e) => {
            if (!canAttach) return;
            const types = [...e.dataTransfer.types];
            if (
              !types.includes(WORKSPACE_PATH_MIME) &&
              (!hasNativeBridge() || !types.includes("Files"))
            ) {
              return;
            }
            e.preventDefault();
            e.dataTransfer.dropEffect = "copy";
          }}
          onDragLeave={(e) => {
            if (e.currentTarget.contains(e.relatedTarget as Node)) return;
            setFileDragOver(false);
          }}
          onDrop={(e) => {
            setFileDragOver(false);
            if (!canAttach) return;
            // Internal drag from the right-hand file tree.
            const internal = e.dataTransfer.getData(WORKSPACE_PATH_MIME);
            if (internal) {
              e.preventDefault();
              conv.stage(internal);
              return;
            }
            if (!hasNativeBridge()) return;
            e.preventDefault();
            const paths = pathsFromDroppedFiles(e.dataTransfer.files);
            paths.forEach((p) => conv.stage(p));
          }}
        >
          <textarea
            ref={textareaRef}
            rows={1}
            value={draft}
            onChange={(e) => {
              setDraft(e.target.value);
              palette.reset();
            }}
            placeholder={!interactive ? t("Connecting…") : t("Message Alt. Type / for commands.")}
            disabled={!interactive}
            onKeyDown={(e) => {
              if (e.key === "Escape") {
                e.preventDefault();
                if (menu) setMenu(null);
                else if (palette.open) palette.dismiss();
                else if (conv.isRunning) conv.abort();
                return;
              }
              if (palette.onKeyDown(e, !conv.isRunning)) return;
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                handleSubmit();
              }
            }}
          />
          <div className="row" ref={rowRef}>
            {/* toolbox: featured skills + actions */}
            <button
              className="flat toolbox-btn"
              data-tip={t("Toolbox")}
              onClick={(e) => {
                e.stopPropagation();
                markToolboxSeen();
                toggle("plus");
              }}
            >
              <i className="ph ph-toolbox" />
              {!toolboxSeen ? <span className="badge-dot" /> : null}
            </button>
            {fullAccessVisible ? (
              <span className="perm-anchor">
                <button
                  className={`flat${conv.fullAccess ? " perm-on" : ""}`}
                  data-tip={
                    conv.fullAccess
                      ? t("Permission mode: full access")
                      : t("Permission mode: ask for approval")
                  }
                  onClick={(e) => {
                    e.stopPropagation();
                    toggle("perm");
                  }}
                >
                  <i
                    className={`ph ${conv.fullAccess ? "ph-shield-warning" : "ph-shield"}`}
                  />
                  <PendingMark when={conv.pendingChanges.fullAccess !== undefined} />
                </button>
                <div
                  className={`menu${menu === "perm" ? " on" : ""}`}
                  onClick={(e) => e.stopPropagation()}
                >
                  <div
                    className="mi"
                    onClick={() => {
                      setMenu(null);
                      // Disabling is immediate; no confirmation.
                      if (conv.fullAccess) conv.setFullAccess(false);
                    }}
                  >
                    <i className="ph ph-shield-check" />
                    <span>
                      {t("Ask for approval")}
                      <span className="d">
                        {t("Tool calls need per-action approval; the default mode")}
                      </span>
                    </span>
                    {!conv.fullAccess ? (
                      <i className="ph ph-check check" />
                    ) : null}
                  </div>
                  <div
                    className="mi"
                    onClick={() => {
                      setMenu(null);
                      if (conv.fullAccess) return;
                      // Enabling goes through the standard confirm window.
                      app.requestConfirm({
                        message: t("Enable full access?"),
                        details: [
                          t("Bypasses the security extension's command blocks and approvals"),
                          t("Bypasses credential-path access limits"),
                          t("Approval prompts and writable-folder checks for external reads and writes are skipped"),
                          t("Network access limits are skipped"),
                          t("These decisions are no longer written to the security audit log"),
                          t("Applies to this conversation only and stays on after reopening it or restarting the app; branches and side conversations start without it"),
                        ],
                        confirmLabel: t("Enable full access"),
                        onConfirm: () => conv.setFullAccess(true),
                      });
                    }}
                  >
                    <i className="ph ph-shield-warning perm-warn-icon" />
                    <span>
                      {t("Full access")}
                      <span className="d">
                        {t("Tools run without approval prompts this conversation")}
                      </span>
                    </span>
                    {conv.fullAccess ? (
                      <i className="ph ph-check check" />
                    ) : null}
                  </div>
                </div>
              </span>
            ) : null}
            <div
              className={`menu${menu === "plus" ? " on" : ""}`}
              style={{ left: 0 }}
              onClick={(e) => e.stopPropagation()}
            >
              {canAttach ? (
                <div
                  className="mi"
                  onClick={() => {
                    setMenu(null);
                    void pickFiles(t("Full path of the file to attach:")).then(
                      (paths) => paths.forEach((p) => conv.stage(p)),
                    );
                  }}
                >
                  <i className="ph ph-paperclip" />
                  {t("Attach a file")}
                </div>
              ) : null}
              <div
                className="mi"
                onClick={() => armCommand("adaptive-planning")}
              >
                <i className="ph ph-list-checks" />
                {t("Adaptive planning")}
              </div>
              <div className="sep" />
              {understandMode && conv.sessionId ? (
                <div
                  className="mi"
                  onClick={() => (shell.openRail("workspace"), setMenu(null))}
                >
                  <i className="ph ph-folder-open" />
                  {t("Browse folders")}
                </div>
              ) : null}
              <div
                className="mi"
                onClick={() => (setDraft("/"), setMenu(null))}
              >
                <i className="ph ph-slash-forward" />
                {t("All skills…")}
              </div>
            </div>

            {/* First-level attach: Understand only (Work uses toolbox). */}
            {attachFirstLevel ? (
              <button
                className="flat"
                data-tip={t("Attach a file")}
                aria-label={t("Attach a file")}
                onClick={() => {
                  void pickFiles(t("Full path of the file to attach:")).then(
                    (paths) => paths.forEach((p) => conv.stage(p)),
                  );
                }}
              >
                <i className="ph ph-paperclip" />
              </button>
            ) : null}

            {/* morph mode switch (live only; empty state uses the cards) */}
            {variant === "live" ? (
              <button
                className="flat mode-switch"
                role="switch"
                aria-checked={conv.sessionMode === "work"}
                disabled={altControlsDisabled}
                data-tip={
                  altControlsDisabled
                    ? t("Understand and Work are preserved but inactive while Native Pi is on.")
                    : conv.sessionMode === "work"
                    ? t("Work mode: research, analyze data, and create or update files while keeping the same careful thinking. Switch to Understand.")
                    : t("Understand mode: clarify questions, compare explanations, and develop ideas with your materials. Switch to Work.")
                }
                onClick={() =>
                  conv.switchMode(conv.sessionMode === "work" ? "understand" : "work")
                }
              >
                <i
                  className={
                    conv.sessionMode === "work"
                      ? "ph ph-hammer"
                      : "ph ph-book-open"
                  }
                />
                {conv.sessionMode === "work" ? t("Work") : t("Understand")}
                <span
                  className={`toggle mode-toggle${
                    conv.sessionMode === "work" ? " on" : ""
                  }`}
                  aria-hidden="true"
                />
                <PendingMark when={conv.pendingChanges.mode !== undefined} />
              </button>
            ) : null}

            <ModelChip
              open={menu === "model"}
              onToggle={() => toggle("model")}
            />
            <ContextRing />

            {conv.isRunning ? (
              <>
                <button
                  className="send"
                  disabled={!canSend}
                  onClick={handleSubmit}
                  data-tip={runPhaseLabels().queued}
                >
                  <i className="ph ph-arrow-up" />
                </button>
                <button
                  className="send"
                  style={{ background: "var(--danger)" }}
                  onClick={() => conv.abort()}
                  data-tip={t("Stop")}
                >
                  <i className="ph ph-square" />
                </button>
              </>
            ) : (
              <button
                className="send"
                disabled={!canSend}
                onClick={handleSubmit}
                data-tip={t("Send")}
              >
                <i className="ph ph-arrow-up" />
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function CtxPicker({
  icon,
  label,
  open,
  onToggle,
  disabled = false,
  pending = false,
  children,
}: {
  icon: string;
  label: string;
  open: boolean;
  onToggle: () => void;
  disabled?: boolean;
  /** Show the mid-run pending mark beside the label. */
  pending?: boolean;
  children: React.ReactNode;
}) {
  return (
    <span className="ctx-picker">
      <button
        className="ctx-item"
        data-tip={label}
        disabled={disabled}
        onClick={(e) => {
          e.stopPropagation();
          onToggle();
        }}
      >
        <i className={`ph ${icon}`} />
        <span className="ctx-label">{label}</span>
        <PendingMark when={pending} />
        <i className="ph ph-caret-down caret" />
      </button>
      <div
        className={`menu${open ? " on" : ""}`}
        style={{ left: 0, bottom: "auto", top: 22 }}
        onClick={(e) => e.stopPropagation()}
      >
        {children}
      </div>
    </span>
  );
}
