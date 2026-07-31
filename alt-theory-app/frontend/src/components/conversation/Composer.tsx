import { useEffect, useMemo, useRef, useState } from "react";
import { useApp } from "@/context/AppProvider";
import { useShell } from "@/context/ShellContext";
import { ApprovalDock } from "@/components/conversation/ApprovalDock";
import { ModelChip } from "@/components/conversation/ModelChip";
import { ContextRing } from "@/components/conversation/ContextRing";
import { RunTips } from "@/components/conversation/RunTips";
import { DEFAULT_KB_DOMAIN, KB_OFF_VALUE } from "@/lib/constants";
import { hasNativeBridge, pathsFromDroppedFiles, pickFiles } from "@/lib/native";
import { isWithheld } from "@/api/types";
import { fmtTime } from "@/lib/format";
import { t } from "@/i18n";
import { autosizeTextarea } from "@/lib/autosizeTextarea";

type MenuKey = "plus" | "model" | "role" | "kb" | null;

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
  const [menu, setMenu] = useState<MenuKey>(null);
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

  useEffect(() => {
    if (app.reviseMode) setDraft(app.reviseDraft);
  }, [app.reviseMode, app.reviseDraft]);

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

  // Helper is a child of a real conversation; from a blank screen the same
  // request starts one and invokes the help skill in it.
  const openHelper = (question: string) => {
    if (app.sessionId) app.forkCurrentSession("helper", question);
    else app.invokeSkill("alt-theory-help", question);
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
  useEffect(() => setSlashIndex(0), [slashMatches.length]);

  const runSlash = (command: SlashCommand) => {
    const args = slashQuery?.split(/\s+/).slice(1).join(" ") ?? "";
    // A skill with no question sends the agent looking for one. Arm the
    // composer and let the user say what they want first.
    if (!command.immediate && !args.trim()) return armCommand(command.name);
    setDraft("");
    if (app.reviseMode) app.cancelReviseMode();
    command.run(args);
  };

  const interactive = app.sessionReady && app.wsConnected;
  const hasText = draft.trim().length > 0;
  const canAttach = app.appMode === "local" && interactive;
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
    if (app.reviseMode) {
      if (app.reviseLatest(draft)) {
        setDraft("");
        shell.openRail("chats");
      }
      return;
    }
    if (app.sendPrompt(draft)) setDraft("");
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

  return (
    <div className="composer-wrap">
      <div className="composer-col">
        {app.approvals.length > 0 ? (
          <ApprovalDock
            request={app.approvals[0]}
            onRespond={app.respondApproval}
            onSessionAllow={app.addApprovalMarker}
          />
        ) : null}

        {app.toolStatus ||
        app.isRunning ||
        app.composerNotice ||
        app.runHint ||
        app.canRetryFailed ? (
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
            {app.canRetryFailed ? (
              <button
                className="flat retry-run"
                onClick={app.retryFailed}
                title={t("Completed work is kept; the answer resumes from the break point")}
              >
                <i className="ph ph-arrow-clockwise" aria-hidden="true" />
                {t("Continue from break point")}
              </button>
            ) : null}
            <RunTips running={app.isRunning} />
          </div>
        ) : null}

        {app.stagedWorkspacePaths.length > 0 ? (
          <div className="staged-attachments" aria-label={t("Attached files")}>
            {app.stagedWorkspacePaths.map((path) => (
              <span className="attachment-chip" key={path} title={path}>
                <i className="ph ph-paperclip" aria-hidden="true" />
                <span>{path.split(/[\\/]/).pop() || path}</span>
                <button
                  type="button"
                  onClick={() => app.unstageWorkspacePaths([path])}
                  title={t("Remove attached file")}
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
                <span className="queued-prompt-text" title={item.text}>
                  {item.text}
                </span>
                {item.attachments.length > 0 ? (
                  <span title={item.attachments.join("\n")}>
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
                  title={t("Edit queued message")}
                  aria-label={t("Edit queued message")}
                >
                  <i className="ph ph-pencil-simple" aria-hidden="true" />
                </button>
                <button
                  type="button"
                  className="queued-prompt-action"
                  onClick={() => app.deleteQueuedPrompt(item.id)}
                  title={t("Delete queued message")}
                  aria-label={t("Delete queued message")}
                >
                  <i className="ph ph-trash" aria-hidden="true" />
                </button>
              </div>
            ))}
          </div>
        ) : null}

        <div className="ctx-line">
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
              title={
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
        </div>

        {slashMatches.length > 0 ? (
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

        <div
          className={`composer${fileDragOver ? " file-drag-over" : ""}`}
          onDragEnter={(e) => {
            if (!canAttach || !hasNativeBridge()) return;
            if (![...e.dataTransfer.types].includes("Files")) return;
            e.preventDefault();
            setFileDragOver(true);
          }}
          onDragOver={(e) => {
            if (!canAttach || !hasNativeBridge()) return;
            if (![...e.dataTransfer.types].includes("Files")) return;
            e.preventDefault();
            e.dataTransfer.dropEffect = "copy";
          }}
          onDragLeave={(e) => {
            if (e.currentTarget.contains(e.relatedTarget as Node)) return;
            setFileDragOver(false);
          }}
          onDrop={(e) => {
            setFileDragOver(false);
            if (!canAttach || !hasNativeBridge()) return;
            e.preventDefault();
            const paths = pathsFromDroppedFiles(e.dataTransfer.files);
            paths.forEach((p) => app.stageWorkspacePath(p));
          }}
        >
          <textarea
            ref={textareaRef}
            rows={1}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder={
              !interactive
                ? t("Connecting…")
                : app.reviseMode
                  ? t("Editing your latest message. Send to update.")
                  : t("Message Alt. Type / for commands.")
            }
            disabled={!interactive}
            onKeyDown={(e) => {
              if (slashMatches.length > 0) {
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
              if (e.key === "Escape" && app.reviseMode) {
                setDraft("");
                app.cancelReviseMode();
              }
            }}
          />
          <div className="row" ref={rowRef}>
            {/* toolbox: featured skills + actions */}
            <button
              className="flat toolbox-btn"
              title={t("Toolbox")}
              onClick={(e) => {
                e.stopPropagation();
                markToolboxSeen();
                toggle("plus");
              }}
            >
              <i className="ph ph-toolbox" />
              {!toolboxSeen ? <span className="badge-dot" /> : null}
            </button>
            <div
              className={`menu${menu === "plus" ? " on" : ""}`}
              style={{ left: 0 }}
              onClick={(e) => e.stopPropagation()}
            >
              {/* Always here: help that comes and goes with the screen you are
                  on is help you cannot rely on. In a conversation it opens a
                  Helper child; on a blank screen it starts one. */}
              <div
                className="mi"
                title={t("Opens a separate conversation beside this one, with fresh context. It answers questions about Alt and can fix setup — providers, keys, models, missing tools.")}
                onClick={() => armCommand("helper")}
              >
                <i className="ph ph-lifebuoy" />
                {t("Ask how Alt works, or fix setup")}
                <span className="mi-note">{t("new conversation on the side")}</span>
              </div>
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
                onClick={() => armCommand("adaptive-aligning")}
              >
                <i className="ph ph-chats-circle" />
                {t("Align on a plan or decision")}
              </div>
              <div
                className="mi"
                onClick={() => armCommand("adaptive-plan-record")}
              >
                <i className="ph ph-list-checks" />
                {t("Plan & record")}
              </div>
              {/* web-search is FULL_ONLY_BUNDLED_SKILLS (alt-theory-core.ts:464) —
                  in Understand mode say why rather than greying out a "soon". */}
              {understandMode ? (
                <div
                  className="mi disabled"
                  title={t("Switch to Work when you want Alt to look up current information.")}
                >
                  <i className="ph ph-globe" />
                  {t("Looking things up online needs Work mode")}
                </div>
              ) : (
                <div
                  className="mi"
                  onClick={() => armCommand("web-search")}
                >
                  <i className="ph ph-globe" />
                  {t("Look something up online")}
                </div>
              )}
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
                title={t("Attach a file")}
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
                title={
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

            {app.reviseMode ? (
              <>
                <button
                  className="flat"
                  onClick={() => (setDraft(""), app.cancelReviseMode())}
                >
                  {t("Cancel")}
                </button>
                <button
                  className="send"
                  disabled={!canSend}
                  onClick={handleSubmit}
                  title={t("Save edit")}
                >
                  <i className="ph ph-check" />
                </button>
              </>
            ) : app.isRunning ? (
              <>
                <button
                  className="send"
                  disabled={!canSend}
                  onClick={handleSubmit}
                  title={t("Queue message")}
                >
                  <i className="ph ph-arrow-up" />
                </button>
                <button
                  className="send"
                  style={{ background: "var(--danger)" }}
                  onClick={app.abortRun}
                  title={t("Stop")}
                >
                  <i className="ph ph-square" />
                </button>
              </>
            ) : (
              <button
                className="send"
                disabled={!canSend}
                onClick={handleSubmit}
                title={t("Send")}
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
        title={label}
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
