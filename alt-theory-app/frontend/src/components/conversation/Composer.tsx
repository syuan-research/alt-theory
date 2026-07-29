import { useEffect, useMemo, useRef, useState } from "react";
import { useApp } from "@/context/AppProvider";
import { useShell } from "@/context/ShellContext";
import { ApprovalDock } from "@/components/conversation/ApprovalDock";
import { ModelChip } from "@/components/conversation/ModelChip";
import { ContextRing } from "@/components/conversation/ContextRing";
import { DEFAULT_KB_DOMAIN, KB_OFF_VALUE } from "@/lib/constants";
import { pickFiles } from "@/lib/native";
import { isWithheld } from "@/api/types";
import { fmtTime } from "@/lib/format";
import { t } from "@/i18n";

type MenuKey = "plus" | "model" | "role" | "kb" | null;

interface SlashCommand {
  name: string;
  description: string;
  run: (args: string) => void;
}

/** Composer variant: `empty` = new-conversation (mode via cards, no switch). */
export function Composer({ variant }: { variant: "empty" | "live" }) {
  const app = useApp();
  const shell = useShell();
  const [draft, setDraft] = useState("");
  const [slashIndex, setSlashIndex] = useState(0);
  const [menu, setMenu] = useState<MenuKey>(null);
  const rowRef = useRef<HTMLDivElement>(null);
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

  // Close menus on outside click (mirrors the prototype's body-click close).
  useEffect(() => {
    if (!menu) return;
    const onDoc = (e: MouseEvent) => {
      if (!rowRef.current?.contains(e.target as Node)) setMenu(null);
    };
    document.addEventListener("click", onDoc);
    return () => document.removeEventListener("click", onDoc);
  }, [menu]);

  const slashCommands = useMemo<SlashCommand[]>(
    () => [
      ...(variant === "live"
        ? [
            {
              name: "branch",
              description: t("Branch this conversation into a new direction"),
              run: () => app.forkCurrentSession("fork"),
            },
            {
              name: "btw",
              description: t("Start a side conversation without adding it to the list"),
              run: () => app.forkCurrentSession("side"),
            },
            {
              name: "compact",
              description: t("Compact this conversation to free context space"),
              run: () => app.compactCurrentSession(),
            },
          ]
        : []),
      {
        name: "new",
        description: t("Start a new conversation"),
        run: () => app.startNewSession(),
      },
      ...(app.discovery?.skills ?? []).map((skill) => ({
        name: skill.name,
        description: skill.description || t("Alt Theory skill"),
        run: (args: string) => app.invokeSkill(skill.name, args),
      })),
    ],
    [app],
  );

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
    setDraft("");
    if (app.reviseMode) app.cancelReviseMode();
    command.run(args);
  };

  const interactive = app.sessionReady && app.wsConnected;
  const hasText = draft.trim().length > 0;
  const [dragActive, setDragActive] = useState(false);

  // Drag a file onto the composer to attach it (item D, text/doc): the agent
  // reads it from disk, so we stage the path — same mechanism as "Import
  // reference". Needs the absolute path, which the Electron bundle exposes on
  // dropped File objects; in a plain browser `path` is empty and we no-op.
  const canAttach = app.appMode === "local" && interactive;
  const handleDropFiles = (event: React.DragEvent) => {
    event.preventDefault();
    setDragActive(false);
    if (!canAttach) return;
    const paths = Array.from(event.dataTransfer.files)
      .map((file) => (file as File & { path?: string }).path)
      .filter((p): p is string => !!p);
    for (const path of paths) app.stageWorkspacePath(path);
  };
  const canSend =
    interactive &&
    !app.isRunning &&
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
  const pureMode =
    variant === "empty" ? shell.newMode === "pure" : app.sessionMode === "pure";

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
    <div
      className={`composer-wrap${dragActive ? " drag-active" : ""}`}
      onDragOver={
        canAttach
          ? (e) => {
              if (e.dataTransfer.types.includes("Files")) {
                e.preventDefault();
                setDragActive(true);
              }
            }
          : undefined
      }
      onDragLeave={canAttach ? () => setDragActive(false) : undefined}
      onDrop={canAttach ? handleDropFiles : undefined}
    >
      <div className="composer-col">
        {app.approvals.length > 0 ? (
          <ApprovalDock
            request={app.approvals[0]}
            onRespond={app.respondApproval}
            onSessionAllow={app.addApprovalMarker}
          />
        ) : null}

        {app.toolStatus ||
        (app.isRunning && app.runPhaseLabel) ||
        app.composerNotice ||
        app.runHint ||
        app.canRetryFailed ||
        app.attachmentHint ? (
          <div className="composer-notes">
            {app.isRunning && app.runPhaseLabel ? (
              <span
                className={`run-phase${
                  app.runPhaseLabel === "Processing…" ? " processing" : ""
                }`}
              >
                <i className="ph ph-circle-notch" aria-hidden="true" />
                {app.runPhaseLabel}
              </span>
            ) : app.toolStatus ? (
              <span>{app.toolStatus}</span>
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
            {app.attachmentHint ? <span>{app.attachmentHint}</span> : null}
          </div>
        ) : null}

        <div className="ctx-line">
          <CtxPicker
            icon="ph-user-circle"
            label={roleLabel}
            open={menu === "role"}
            onToggle={() => toggle("role")}
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
            {(app.discovery?.rolePresets ?? [])
              .filter((r) => !r.snapshot)
              .map((r) => (
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
            {app.viewMode === "researcher" &&
            (app.discovery?.rolePresets ?? []).some((r) => r.snapshot) ? (
              <details className="menu-history">
                <summary>{t("History")}</summary>
                {(app.discovery?.rolePresets ?? [])
                  .filter((r) => r.snapshot)
                  .map((r) => (
                    <div
                      key={r.slug}
                      className="mi"
                      onClick={() => (
                        app.switchRolePreset(r.slug),
                        setMenu(null)
                      )}
                    >
                      <span>{r.userLabel || r.displayName}</span>
                      {app.selectors.rolePresetSlug === r.slug ? (
                        <i className="ph ph-check check" />
                      ) : null}
                    </div>
                  ))}
              </details>
            ) : null}
          </CtxPicker>

          <CtxPicker
            icon="ph-books"
            label={kbLabel}
            open={menu === "kb"}
            onToggle={() => toggle("kb")}
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

        <div className="composer">
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder={
              !interactive
                ? t("Connecting…")
                : app.reviseMode
                  ? t("Editing your latest message. Send to update.")
                  : t("Message Alt. Type / for commands.")
            }
            disabled={!interactive || (app.isRunning && !app.reviseMode)}
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
                if (!app.isRunning || app.reviseMode) handleSubmit();
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
            {canAttach ? (
              <button
                className="flat"
                title={t("Attach a file to this message")}
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
            <div
              className={`menu${menu === "plus" ? " on" : ""}`}
              style={{ left: 0 }}
              onClick={(e) => e.stopPropagation()}
            >
              {variant === "live" ? (
                <div
                  className="mi"
                  onClick={() => (
                    app.forkCurrentSession("helper"),
                    setMenu(null)
                  )}
                >
                  <i className="ph ph-lifebuoy" />
                  {t("Ask how Alt works")}
                </div>
              ) : null}
              <div
                className="mi"
                onClick={() => (
                  app.invokeSkill("adaptive-aligning"),
                  setMenu(null)
                )}
              >
                <i className="ph ph-chats-circle" />
                {t("Align on a plan or decision")}
              </div>
              <div
                className="mi"
                onClick={() => (
                  app.invokeSkill("adaptive-plan-record"),
                  setMenu(null)
                )}
              >
                <i className="ph ph-list-checks" />
                {t("Plan & record")}
              </div>
              {/* web-search is FULL_ONLY_BUNDLED_SKILLS (alt-theory-core.ts:464) —
                  in Understand mode say why rather than greying out a "soon". */}
              {pureMode ? (
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
                  onClick={() => (app.invokeSkill("web-search"), setMenu(null))}
                >
                  <i className="ph ph-globe" />
                  {t("Look something up online")}
                </div>
              )}
              <div className="sep" />
              {pureMode && app.sessionId ? (
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

            {/* morph mode switch (live only; empty state uses the cards) */}
            {variant === "live" ? (
              <button
                className="flat mode-switch"
                role="switch"
                aria-checked={app.sessionMode === "full"}
                title={
                  app.sessionMode === "full"
                    ? t("Work mode: research, analyze data, and create or update files while keeping the same careful thinking. Switch to Understand.")
                    : t("Understand mode: clarify questions, compare explanations, and develop ideas with your materials. Switch to Work.")
                }
                onClick={() =>
                  app.switchMode(app.sessionMode === "full" ? "pure" : "full")
                }
              >
                <i
                  className={
                    app.sessionMode === "full"
                      ? "ph ph-hammer"
                      : "ph ph-book-open"
                  }
                />
                {app.sessionMode === "full" ? t("Work") : t("Understand")}
                <span
                  className={`toggle mode-toggle${
                    app.sessionMode === "full" ? " on" : ""
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
              <button
                className="send"
                style={{ background: "var(--danger)" }}
                onClick={app.abortRun}
                title={t("Stop")}
              >
                <i className="ph ph-square" />
              </button>
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
  children,
}: {
  icon: string;
  label: string;
  open: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  return (
    <span className="ctx-picker">
      <button
        className="ctx-item"
        title={label}
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
