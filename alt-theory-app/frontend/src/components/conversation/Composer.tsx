import { useEffect, useMemo, useRef, useState } from "react";
import { useApp } from "@/context/AppProvider";
import { useShell } from "@/context/ShellContext";
import { ApprovalDock } from "@/components/conversation/ApprovalDock";
import { ModelChip } from "@/components/conversation/ModelChip";
import { DEFAULT_KB_DOMAIN, KB_OFF_VALUE } from "@/lib/constants";

type MenuKey = "plus" | "mode" | "model" | "role" | "kb" | null;

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
      {
        name: "branch",
        description: "Branch this conversation into a new direction",
        run: () => app.forkCurrentSession("fork"),
      },
      {
        name: "btw",
        description: "Start a side conversation without adding it to the list",
        run: () => app.forkCurrentSession("side"),
      },
      {
        name: "new",
        description: "Start a new conversation",
        run: () => app.startNewSession(),
      },
      ...(app.discovery?.skills ?? []).map((skill) => ({
        name: skill.name,
        description: skill.description || "Alt Theory skill",
        run: (args: string) => app.invokeSkill(skill.name, args),
      })),
    ],
    [app]
  );

  const slashQuery =
    !app.reviseMode && draft.startsWith("/") && !draft.startsWith("//")
      ? draft.slice(1)
      : null;
  const slashMatches = useMemo(() => {
    if (slashQuery === null) return [];
    const token = slashQuery.split(/\s+/, 1)[0].toLowerCase();
    return slashCommands.filter((c) => c.name.toLowerCase().startsWith(token));
  }, [slashCommands, slashQuery]);
  useEffect(() => setSlashIndex(0), [slashMatches.length]);

  const runSlash = (command: SlashCommand) => {
    const args = slashQuery?.split(/\s+/).slice(1).join(" ") ?? "";
    setDraft("");
    command.run(args);
  };

  const interactive = app.sessionReady && app.wsConnected;
  const hasText = draft.trim().length > 0;
  const canSend =
    interactive && !app.isRunning && (hasText || app.stagedWorkspacePaths.length > 0);
  const showVisibility =
    app.participant?.designated === true || app.viewMode === "researcher";
  const pureMode = variant === "empty" ? shell.newMode === "pure" : app.sessionMode === "pure";

  const handleSubmit = () => {
    if (app.reviseMode) {
      if (app.reviseLatest(draft)) setDraft("");
      return;
    }
    if (app.sendPrompt(draft)) setDraft("");
  };

  // ctx-line labels
  const roleLabel = app.selectors.rolePresetSlug
    ? app.discovery?.rolePresets.find(
        (r) => r.slug === app.selectors.rolePresetSlug
      )?.userLabel ??
      app.discovery?.rolePresets.find(
        (r) => r.slug === app.selectors.rolePresetSlug
      )?.displayName ??
      app.selectors.rolePresetSlug
    : "Default role";
  const kbOff = app.selectors.currentDomain === KB_OFF_VALUE;
  const kbLabel = kbOff
    ? "No knowledge base"
    : app.discovery?.kbDomains.find(
        (k) => k.slug === app.selectors.currentDomain
      )?.displayName ?? "Knowledge base";

  const toggle = (key: MenuKey) => setMenu((prev) => (prev === key ? null : key));

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

        {app.toolStatus || app.composerNotice || app.runHint || app.attachmentHint ? (
          <div className="composer-notes">
            {app.toolStatus ? <span>{app.toolStatus}</span> : null}
            {app.composerNotice ? (
              <span className={app.composerNotice.warn ? "warn" : ""}>
                {app.composerNotice.prefix ? `${app.composerNotice.prefix} ` : ""}
                {app.composerNotice.text}
              </span>
            ) : null}
            {app.runHint ? <span>{app.runHint}</span> : null}
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
              <span>Default role</span>
              {!app.selectors.rolePresetSlug ? <i className="ph ph-check check" /> : null}
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
          >
            <div
              className="mi"
              onClick={() => (app.switchKb(DEFAULT_KB_DOMAIN), setMenu(null))}
            >
              <span>EP knowledge base</span>
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
              <span>No knowledge base</span>
              {kbOff ? <i className="ph ph-check check" /> : null}
            </div>
          </CtxPicker>

          {showVisibility ? (
            <button
              className="ctx-item"
              onClick={() =>
                app.switchVisibility(
                  app.selectors.visibility === "private" ? "research" : "private"
                )
              }
              title="Private conversations are marked and auto-deleted after 7 inactive days."
            >
              <i
                className={
                  app.selectors.visibility === "private"
                    ? "ph ph-lock-simple"
                    : "ph ph-share-network"
                }
              />
              {app.selectors.visibility === "private" ? "Private" : "Shared"}
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
              app.reviseMode
                ? "Editing your latest message. Send to update."
                : "Message Alt. Type / for commands."
            }
            disabled={!interactive || (app.isRunning && !app.reviseMode)}
            onKeyDown={(e) => {
              if (slashMatches.length > 0) {
                if (e.key === "ArrowDown" || e.key === "ArrowUp") {
                  e.preventDefault();
                  const step = e.key === "ArrowDown" ? 1 : -1;
                  setSlashIndex(
                    (p) => (p + step + slashMatches.length) % slashMatches.length
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
            {/* plus / actions */}
            <button
              className="flat"
              title="More actions"
              onClick={(e) => {
                e.stopPropagation();
                toggle("plus");
              }}
            >
              <i className="ph ph-plus" />
            </button>
            <div
              className={`menu${menu === "plus" ? " on" : ""}`}
              style={{ left: 0 }}
              onClick={(e) => e.stopPropagation()}
            >
              {pureMode ? (
                <>
                  <div
                    className="mi"
                    onClick={() => (shell.openRail("workspace"), setMenu(null))}
                  >
                    <i className="ph ph-paperclip" />
                    Import reference
                  </div>
                  <div className="sep" />
                </>
              ) : null}
              <div
                className="mi"
                onClick={() => (app.forkCurrentSession("helper"), setMenu(null))}
              >
                <i className="ph ph-lifebuoy" />
                Ask how Alt works
              </div>
            </div>

            {/* morph mode switch (live only; empty state uses the cards) */}
            {variant === "live" ? (
              <>
                <button
                  className="flat"
                  onClick={(e) => {
                    e.stopPropagation();
                    toggle("mode");
                  }}
                >
                  <i
                    className={
                      app.sessionMode === "full" ? "ph ph-hammer" : "ph ph-book-open"
                    }
                  />
                  {app.sessionMode === "full" ? "Work" : "Understand"}
                  <i className="ph ph-caret-down caret" />
                </button>
                <div
                  className={`menu${menu === "mode" ? " on" : ""}`}
                  style={{ left: 40 }}
                  onClick={(e) => e.stopPropagation()}
                >
                  <div
                    className="mi"
                    onClick={() => (app.switchMode("pure"), setMenu(null))}
                  >
                    <i className="ph ph-book-open" />
                    <span>
                      Understand
                      <span className="d">
                        Reads and discusses. Asks before touching anything.
                      </span>
                    </span>
                    {app.sessionMode === "pure" ? (
                      <i className="ph ph-check check" />
                    ) : null}
                  </div>
                  <div
                    className="mi"
                    onClick={() => (app.switchMode("full"), setMenu(null))}
                  >
                    <i className="ph ph-hammer" />
                    <span>
                      Work
                      <span className="d">Can act on files in your working folders.</span>
                    </span>
                    {app.sessionMode === "full" ? (
                      <i className="ph ph-check check" />
                    ) : null}
                  </div>
                </div>
              </>
            ) : null}

            <ModelChip open={menu === "model"} onToggle={() => toggle("model")} />

            {app.reviseMode ? (
              <>
                <button className="flat" onClick={() => (setDraft(""), app.cancelReviseMode())}>
                  Cancel
                </button>
                <button className="send" disabled={!canSend} onClick={handleSubmit} title="Save edit">
                  <i className="ph ph-check" />
                </button>
              </>
            ) : app.isRunning ? (
              <button
                className="send"
                style={{ background: "var(--danger)" }}
                onClick={app.abortRun}
                title="Stop"
              >
                <i className="ph ph-square" />
              </button>
            ) : (
              <button className="send" disabled={!canSend} onClick={handleSubmit} title="Send">
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
