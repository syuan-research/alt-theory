import { useEffect, useMemo, useRef, useState } from "react";
import { PRESET_TURNS, useApp } from "@/context/AppProvider";
import { useShell } from "@/context/ShellContext";
import { ApprovalDock } from "@/components/conversation/ApprovalDock";
import { ModelChip } from "@/components/conversation/ModelChip";
import { ContextRing } from "@/components/conversation/ContextRing";
import { RunTips } from "@/components/conversation/RunTips";
import { DEFAULT_KB_DOMAIN, KB_OFF_VALUE } from "@/lib/constants";
import { hasNativeBridge, pathsFromDroppedFiles, pickFiles } from "@/lib/native";
import { WORKSPACE_PATH_MIME } from "@/lib/workspace";
import { isWithheld } from "@/api/types";
import { fmtTime } from "@/lib/format";
import { t } from "@/i18n";
import { autosizeTextarea } from "@/lib/autosizeTextarea";

type MenuKey = "plus" | "model" | "role" | "kb" | "presetcfg" | "perm" | null;
const SHOW_HELP_STARTERS = false;

interface SlashCommand {
  name: string;
  description: string;
  run: (args: string) => void;
  /**
   * Runs on click with nothing typed. False for skills: a skill invoked with
   * no question makes the agent hunt for one. Those arm the composer instead —
   * `/name ` lands in the box and the user says what they want.
   */
  immediate?: boolean;
}

/** Composer variant: `empty` = new-conversation (mode via cards, no switch). */
export function Composer({ variant }: { variant: "empty" | "live" }) {
  const app = useApp();
  const shell = useShell();
  const [draft, setDraft] = useState("");
  const [slashIndex, setSlashIndex] = useState(0);
  const [slashDismissed, setSlashDismissed] = useState(false);
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

  const openHelper = (question: string) => {
    app.openHelper(question, variant === "live");
  };
  const slashMode = variant === "empty" ? shell.newMode : app.sessionMode;

  const slashCommands = useMemo<SlashCommand[]>(
    () => [
      {
        name: "helper",
        description: t("Ask how Alt works, or get setup fixed — in a new conversation on the side"),
        run: (args: string) => openHelper(args),
      },
      ...(variant === "live"
        ? [
            {
              name: "branch",
              description: t("Branch this conversation into a new direction"),
              run: () => app.forkCurrentSession("fork"),
              immediate: true,
            },
            {
              name: "btw",
              description: t("Start a side conversation without adding it to the list"),
              run: () => app.forkCurrentSession("side"),
              immediate: true,
            },
            {
              name: "compact",
              description: t("Compact this conversation to free context space"),
              run: () => app.compactCurrentSession(),
              immediate: true,
            },
          ]
        : []),
      {
        name: "new",
        description: t("Start a new conversation"),
        run: () => app.startNewSession(),
        immediate: true,
      },
      ...(app.discovery?.skills ?? [])
        .filter((skill) => skill.enabled?.[slashMode] !== false)
        .map((skill) => ({
          name: skill.name,
          description: skill.description || t("Alt Theory skill"),
          run: (args: string) => app.invokeSkill(skill.name, args),
        })),
    ],
    [app],
  );

  /** Put `/name ` in the box, focused, waiting for the user's actual request. */
  const armCommand = (name: string) => {
    setDraft(`/${name} `);
    setMenu(null);
    window.setTimeout(() => textareaRef.current?.focus(), 0);
  };

  const restoreQueuedPrompt = (id: string) => {
    const text = app.restoreQueuedPrompt(id);
    if (text === null) return;
    setDraft((current) => [text, current].filter((part) => part.trim()).join("\n"));
    window.setTimeout(() => textareaRef.current?.focus(), 0);
  };

  const slashQuery =
    draft.startsWith("/") && !draft.startsWith("//") ? draft.slice(1) : null;
  const slashMatches = useMemo(() => {
    if (slashQuery === null) return [];
    const token = slashQuery.split(/\s+/, 1)[0].toLowerCase();
    return slashCommands.filter((c) => c.name.toLowerCase().startsWith(token));
  }, [slashCommands, slashQuery]);
  const slashOpen = !slashDismissed && slashMatches.length > 0;
  useEffect(() => setSlashIndex(0), [slashMatches.length]);

  const runSlash = (command: SlashCommand) => {
    const args = slashQuery?.split(/\s+/).slice(1).join(" ") ?? "";
    // A skill with no question sends the agent looking for one. Arm the
    // composer and let the user say what they want first.
    if (!command.immediate && !args.trim()) return armCommand(command.name);
    setDraft("");
    command.run(args);
  };

  const interactive = app.sessionReady && app.wsConnected;
  const hasText = draft.trim().length > 0;
  const canAttach = app.appMode === "local" && interactive;
  // Full Access (v1.4.8): local-only, work-capable modes, and only on an
  // assembled live session — no draft permission state before one exists.
  const fullAccessVisible =
    app.appMode === "local" &&
    app.sessionId !== null &&
    (app.runtimeMode === "native-pi" || app.sessionMode === "work");
  const canSend =
    interactive &&
    (hasText || app.stagedWorkspacePaths.length > 0);
  const showVisibility =
    app.participant?.designated === true || app.viewMode === "researcher";
  // Only a hosted study deployment has a research team to withhold from — and
  // only there does "private" mean the conversation is eventually deleted.
  const hostedStudy = app.appMode === "hosted";
  const withheld = isWithheld(app.selectors.visibility);
  // The expiry is only real on hosted; say WHEN, not just "in 7 days".
  const expiresOn =
    hostedStudy && withheld && app.retentionDueAt
      ? fmtTime(app.retentionDueAt)
      : null;
  const altControlsDisabled = app.runtimeMode === "native-pi";
  const understandMode =
    !altControlsDisabled &&
    (variant === "empty"
      ? shell.newMode === "understand"
      : app.sessionMode === "understand");
  // First-level paperclip: Understand only. Work keeps attach in the toolbox.
  const attachFirstLevel = canAttach && understandMode;

  const handleSubmit = () => {
    const sent = helpQuestionArmed
      ? app.invokeSkill("alt-theory-help", draft)
      : app.sendPrompt(draft);
    if (sent) {
      setDraft("");
      setHelpQuestionArmed(false);
    }
  };
  const approval = app.approvals.find(
    (request) => request.sessionId === app.sessionId,
  );

  const stageHelpQuestion = (question: string) => {
    shell.setNewMode("understand");
    app.switchMode("understand");
    setHelpQuestionArmed(true);
    setDraft((current) =>
      current.trim() ? current.trimEnd() + "\n\n" + question : question,
    );
    window.setTimeout(() => textareaRef.current?.focus(), 0);
  };

  const applyGeneralKnowledgeWork = () => {
    if (app.runtimeMode !== "alt-theory") return;
    shell.setNewMode("work");
    app.switchMode("work");
    app.switchRolePreset(null);
    app.switchKb(KB_OFF_VALUE);
    window.setTimeout(() => textareaRef.current?.focus(), 0);
  };

  // ctx-line labels
  const roleLabel = app.selectors.rolePresetSlug
    ? (app.discovery?.rolePresets.find(
        (r) => r.slug === app.selectors.rolePresetSlug,
      )?.userLabel ??
      app.discovery?.rolePresets.find(
        (r) => r.slug === app.selectors.rolePresetSlug,
      )?.displayName ??
      app.selectors.rolePresetSlug)
    : "No role";
  const kbOff = app.selectors.currentDomain === KB_OFF_VALUE;
  const kbLabel = kbOff
    ? "No knowledge base"
    : (app.discovery?.kbDomains.find(
        (k) => k.slug === app.selectors.currentDomain,
      )?.displayName ?? "Knowledge base");

  const toggle = (key: MenuKey) =>
    setMenu((prev) => (prev === key ? null : key));
  const needsModel =
    app.appMode === "local" &&
    app.localConfig !== null &&
    !app.localConfig.activeUsable &&
    !app.modelOverride &&
    !app.currentSessionModel;

  return (
    <div className="composer-wrap">
      <div className="composer-col">
        {approval ? (
          <ApprovalDock
            request={approval}
            onRespond={app.respondApproval}
            onSessionAllow={app.addApprovalMarker}
          />
        ) : null}

        {app.toolStatus ||
        app.isRunning ||
        app.composerNotice ||
        app.runHint ||
        app.recovery ||
        cardHint ||
        needsModel ? (
          <div className="composer-notes">
            {/* One stable status row while a turn runs. Clearing the label on
                each assistant_delta used to collapse this strip and reflow the
                whole column — a fixed screen band just above the composer
                flashed over user and assistant text alike. */}
            {app.isRunning || app.toolStatus ? (
              <span className="run-phase-slot">
                {app.isRunning && app.runPhaseLabel ? (
                  <span className="run-phase">
                    <i className="ph ph-circle-notch" aria-hidden="true" />
                    {app.runPhaseLabel}
                  </span>
                ) : app.toolStatus ? (
                  <span>{app.toolStatus}</span>
                ) : (
                  <span className="run-phase-slot-fill" aria-hidden="true">
                    &nbsp;
                  </span>
                )}
              </span>
            ) : null}
            {app.composerNotice ? (
              <span className={app.composerNotice.warn ? "warn" : ""}>
                {app.composerNotice.prefix
                  ? `${app.composerNotice.prefix} `
                  : ""}
                {app.composerNotice.text}
              </span>
            ) : null}
            {app.runHint ? <span>{app.runHint}</span> : null}
            {app.recovery?.canContinue ? (
              <button className="flat retry-run" onClick={app.continueLatest}>
                <i className="ph ph-play" aria-hidden="true" />
                {t("Continue")}
              </button>
            ) : null}
            {needsModel ? (
              <span className="warn">
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
            <RunTips running={app.isRunning} seedTip={cardHint} />
          </div>
        ) : null}

        {app.stagedWorkspacePaths.length > 0 ? (
          <div className="staged-attachments" aria-label={t("Attached files")}>
            {app.stagedWorkspacePaths.map((path) => (
              <span className="attachment-chip" key={path} data-tip={path}>
                <i className="ph ph-paperclip" aria-hidden="true" />
                <span>{path.split(/[\\/]/).pop() || path}</span>
                <button
                  type="button"
                  onClick={() => app.unstageWorkspacePaths([path])}
                  data-tip={t("Remove attached file")}
                  aria-label={t("Remove attached file")}
                >
                  <i className="ph ph-x" aria-hidden="true" />
                </button>
              </span>
            ))}
          </div>
        ) : null}

        {app.queuedPrompts.length > 0 ? (
          <div className="queued-prompts" aria-label={t("Queued messages")}>
            {app.queuedPrompts.map((item) => (
              <div className="queued-prompt" key={item.id}>
                <i className="ph ph-clock" aria-hidden="true" />
                <span className="queued-prompt-text" data-tip={item.text}>
                  {item.text}
                </span>
                {item.attachments.length > 0 ? (
                  <span data-tip={item.attachments.join("\n")}>
                    <i className="ph ph-paperclip" aria-hidden="true" />
                    {item.attachments.length}
                  </span>
                ) : null}
                <button
                  type="button"
                  className="queued-prompt-action primary"
                  onClick={() =>
                    app.isRunning
                      ? app.interruptAndSendQueuedPrompt(item.id)
                      : app.sendQueuedPromptNow(item.id)
                  }
                >
                  {app.isRunning ? t("Interrupt & send") : t("Send")}
                </button>
                <button
                  type="button"
                  className="queued-prompt-action"
                  onClick={() => restoreQueuedPrompt(item.id)}
                  data-tip={t("Edit queued message")}
                  aria-label={t("Edit queued message")}
                >
                  <i className="ph ph-pencil-simple" aria-hidden="true" />
                </button>
                <button
                  type="button"
                  className="queued-prompt-action"
                  onClick={() => app.deleteQueuedPrompt(item.id)}
                  data-tip={t("Delete queued message")}
                  aria-label={t("Delete queued message")}
                >
                  <i className="ph ph-trash" aria-hidden="true" />
                </button>
              </div>
            ))}
          </div>
        ) : null}

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
                  app.presetState.sessionId === app.sessionId &&
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
                    onClick={() => app.pressPreset(name)}
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
                icon="ph-gear-six"
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
                      <div
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
                      </div>
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
          >
            <div
              className="mi"
              onClick={() => (app.switchRolePreset(null), setMenu(null))}
            >
              <span>{t("No role")}</span>
              {!app.selectors.rolePresetSlug ? (
                <i className="ph ph-check check" />
              ) : null}
            </div>
            {(app.discovery?.rolePresets ?? []).map((r) => (
              <div
                key={r.slug}
                className="mi"
                onClick={() => (app.switchRolePreset(r.slug), setMenu(null))}
              >
                <span>{r.userLabel || r.displayName}</span>
                {app.selectors.rolePresetSlug === r.slug ? (
                  <i className="ph ph-check check" />
                ) : null}
              </div>
            ))}
          </CtxPicker>

          <CtxPicker
            icon="ph-books"
            label={kbLabel}
            open={menu === "kb"}
            onToggle={() => toggle("kb")}
            disabled={altControlsDisabled}
          >
            <div
              className="mi"
              onClick={() => (app.switchKb(DEFAULT_KB_DOMAIN), setMenu(null))}
            >
              <span>{t("EP knowledge base")}</span>
              {!kbOff ? <i className="ph ph-check check" /> : null}
            </div>
            {(app.discovery?.kbDomains ?? [])
              .filter((k) => k.slug !== DEFAULT_KB_DOMAIN)
              .map((k) => (
                <div
                  key={k.slug}
                  className="mi"
                  onClick={() => (app.switchKb(k.slug), setMenu(null))}
                >
                  <span>{k.displayName}</span>
                  {app.selectors.currentDomain === k.slug ? (
                    <i className="ph ph-check check" />
                  ) : null}
                </div>
              ))}
            <div className="sep" />
            <div
              className="mi"
              onClick={() => (app.switchKb(KB_OFF_VALUE), setMenu(null))}
            >
              <span>{t("No knowledge base")}</span>
              {kbOff ? <i className="ph ph-check check" /> : null}
            </div>
          </CtxPicker>

          {showVisibility ? (
            <button
              className="ctx-item"
              onClick={() =>
                app.switchVisibility(
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

        {slashOpen ? (
          <div className="slash-palette">
            {slashMatches.map((command, index) => (
              <button
                key={command.name}
                className={`slash-item${index === slashIndex ? " on" : ""}`}
                onMouseEnter={() => setSlashIndex(index)}
                onClick={() => runSlash(command)}
              >
                <span className="cmd">/{command.name}</span>
                <span className="desc">{command.description}</span>
              </button>
            ))}
          </div>
        ) : null}

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
              app.stageWorkspacePath(internal);
              return;
            }
            if (!hasNativeBridge()) return;
            e.preventDefault();
            const paths = pathsFromDroppedFiles(e.dataTransfer.files);
            paths.forEach((p) => app.stageWorkspacePath(p));
          }}
        >
          <textarea
            ref={textareaRef}
            rows={1}
            value={draft}
            onChange={(e) => {
              setDraft(e.target.value);
              setSlashDismissed(false);
            }}
            placeholder={!interactive ? t("Connecting…") : t("Message Alt. Type / for commands.")}
            disabled={!interactive}
            onKeyDown={(e) => {
              if (e.key === "Escape") {
                e.preventDefault();
                if (menu) setMenu(null);
                else if (slashOpen) setSlashDismissed(true);
                else if (app.isRunning) app.abortRun();
                return;
              }
              if (slashOpen) {
                if (e.key === "ArrowDown" || e.key === "ArrowUp") {
                  e.preventDefault();
                  const step = e.key === "ArrowDown" ? 1 : -1;
                  setSlashIndex(
                    (p) =>
                      (p + step + slashMatches.length) % slashMatches.length,
                  );
                  return;
                }
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  if (!app.isRunning) runSlash(slashMatches[slashIndex]);
                  return;
                }
              }
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
                  className={`flat${app.fullAccess ? " perm-on" : ""}`}
                  data-tip={
                    app.fullAccess
                      ? t("Permission mode: full access")
                      : t("Permission mode: ask for approval")
                  }
                  onClick={(e) => {
                    e.stopPropagation();
                    toggle("perm");
                  }}
                >
                  <i
                    className={`ph ${app.fullAccess ? "ph-shield-warning" : "ph-shield"}`}
                  />
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
                      if (app.fullAccess) app.setFullAccess(false);
                    }}
                  >
                    <i className="ph ph-shield-check" />
                    <span>
                      {t("Ask for approval")}
                      <span className="d">
                        {t("Tool calls need per-action approval; the default mode")}
                      </span>
                    </span>
                    {!app.fullAccess ? (
                      <i className="ph ph-check check" />
                    ) : null}
                  </div>
                  <div
                    className="mi"
                    onClick={() => {
                      setMenu(null);
                      if (app.fullAccess) return;
                      // Enabling goes through the standard confirm window.
                      app.requestConfirm({
                        message: t("Enable full access?"),
                        details: [
                          t("Bypasses the security extension's command blocks and approvals"),
                          t("Bypasses credential-path access limits"),
                          t("Approval prompts and writable-folder checks for external reads and writes are skipped"),
                          t("Network access limits are skipped"),
                          t("These decisions are no longer written to the security audit log"),
                          t("Applies to this conversation only; reopening it or restarting the app turns it off"),
                        ],
                        confirmLabel: t("Enable full access"),
                        onConfirm: () => app.setFullAccess(true),
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
                    {app.fullAccess ? (
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
                      (paths) => paths.forEach((p) => app.stageWorkspacePath(p)),
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
              {understandMode && app.sessionId ? (
                <div
                  className="mi"
                  onClick={() => (shell.openRail("workspace"), setMenu(null))}
                >
                  <i className="ph ph-folder-open" />
                  {t("Browse working folder")}
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
                    (paths) => paths.forEach((p) => app.stageWorkspacePath(p)),
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
                aria-checked={app.sessionMode === "work"}
                disabled={altControlsDisabled}
                data-tip={
                  altControlsDisabled
                    ? t("Understand and Work are preserved but inactive while Native Pi is on.")
                    : app.sessionMode === "work"
                    ? t("Work mode: research, analyze data, and create or update files while keeping the same careful thinking. Switch to Understand.")
                    : t("Understand mode: clarify questions, compare explanations, and develop ideas with your materials. Switch to Work.")
                }
                onClick={() =>
                  app.switchMode(app.sessionMode === "work" ? "understand" : "work")
                }
              >
                <i
                  className={
                    app.sessionMode === "work"
                      ? "ph ph-hammer"
                      : "ph ph-book-open"
                  }
                />
                {app.sessionMode === "work" ? t("Work") : t("Understand")}
                <span
                  className={`toggle mode-toggle${
                    app.sessionMode === "work" ? " on" : ""
                  }`}
                  aria-hidden="true"
                />
              </button>
            ) : null}

            <ModelChip
              open={menu === "model"}
              onToggle={() => toggle("model")}
            />
            <ContextRing />

            {app.isRunning ? (
              <>
                <button
                  className="send"
                  disabled={!canSend}
                  onClick={handleSubmit}
                  data-tip={t("Queued — the agent sees it at its next step")}
                >
                  <i className="ph ph-arrow-up" />
                </button>
                <button
                  className="send"
                  style={{ background: "var(--danger)" }}
                  onClick={app.abortRun}
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
  children,
}: {
  icon: string;
  label: string;
  open: boolean;
  onToggle: () => void;
  disabled?: boolean;
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
