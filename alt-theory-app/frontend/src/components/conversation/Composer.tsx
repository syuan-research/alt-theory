import { useEffect, useState } from "react";
import { useApp } from "@/context/AppProvider";
import { Button } from "@/components/ui/Button";
import { Select, TextArea } from "@/components/ui/Field";
import { HintText, MonoText } from "@/components/ui/Typography";
import { cn } from "@/lib/cn";
import { DEFAULT_KB_DOMAIN, KB_OFF_VALUE } from "@/lib/constants";

export function Composer() {
  const app = useApp();
  const [draft, setDraft] = useState("");
  const [selectedSkill, setSelectedSkill] = useState("");

  useEffect(() => {
    if (app.reviseMode) {
      setDraft(app.reviseDraft);
    }
  }, [app.reviseMode, app.reviseDraft]);

  const interactive = app.sessionReady && app.wsConnected;
  const hasText = draft.trim().length > 0;
  const hasAttachments = app.stagedWorkspacePaths.length > 0;
  const canSend =
    interactive && !app.isRunning && (hasText || hasAttachments);
  const showVisibility =
    app.viewMode === "participant" ||
    app.viewMode === "researcher" ||
    app.viewMode === "debug";
  const showSkills = (app.discovery?.skills.length ?? 0) > 0;
  const kbEnabled = app.selectors.currentDomain !== KB_OFF_VALUE;
  const canSwitchKb = interactive && !app.isRunning;

  const handleSubmit = () => {
    if (app.reviseMode) {
      if (app.reviseLatest(draft)) {
        setDraft("");
      }
      return;
    }
    if (app.sendPrompt(draft)) {
      setDraft("");
    }
  };

  return (
    <footer
      className={cn(
        "bg-canvas px-5 pb-4 pt-2",
        app.selectors.visibility === "private" && "bg-[#f0eff1]"
      )}
    >
      {app.toolStatus ? (
        <MonoText className="mb-2 block text-[0.75rem]">{app.toolStatus}</MonoText>
      ) : null}

      {app.composerNotice ? (
        <MonoText
          className={cn(
            "mb-2 block text-[0.75rem]",
            app.composerNotice.warn ? "text-danger" : "text-text-secondary"
          )}
        >
          {app.composerNotice.prefix ? `${app.composerNotice.prefix} ` : ""}
          {app.composerNotice.text}
        </MonoText>
      ) : null}

      {app.runHint ? (
        <p className="mb-2 text-[0.75rem] text-text-muted" title={app.runHint}>
          {app.runHint}
        </p>
      ) : null}

      {app.attachmentHint ? (
        <HintText className="mb-2">{app.attachmentHint}</HintText>
      ) : null}

      <div className="mb-3 flex flex-wrap items-center gap-3">
        <label
          className="inline-flex items-center gap-2 text-[0.8125rem] text-ink"
          title="Uses the environmental psychology theory and concepts knowledge base. Turn it off for conversations unrelated to environmental psychology."
        >
          <input
            type="checkbox"
            checked={kbEnabled}
            disabled={!canSwitchKb}
            onChange={(event) =>
              app.switchKb(event.target.checked ? DEFAULT_KB_DOMAIN : KB_OFF_VALUE)
            }
          />
          <span>Use EP knowledge base</span>
        </label>

        {showVisibility ? (
          <>
            <label className="inline-flex items-center gap-2 text-[0.8125rem] text-ink">
              <input
                type="checkbox"
                checked={app.selectors.visibility === "private"}
                disabled={!interactive}
                onChange={(event) =>
                  app.switchVisibility(event.target.checked ? "private" : "research")
                }
              />
              <span>Private session</span>
            </label>
            {app.selectors.visibility === "private" ? (
              <span
                className="rounded-md bg-warning/15 px-2 py-0.5 text-[0.75rem] font-semibold text-warning"
                title="Private sessions and files are deleted after 7 inactive days. Download anything you want to keep."
              >
                Private
              </span>
            ) : null}
          </>
        ) : null}
      </div>

      <div className="flex items-end gap-2 rounded-xl bg-surface px-3 py-2 shadow-[0_1px_2px_rgba(20,18,12,0.05)]">
        <TextArea
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          placeholder={
            app.reviseMode
              ? "Editing your latest message. Send to update."
              : "Ask Alt Theory..."
          }
          disabled={!interactive || (app.isRunning && !app.reviseMode)}
          className="min-h-10 flex-1 resize-none border-transparent bg-transparent px-0 py-1 shadow-none focus:border-transparent"
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault();
              if (app.reviseMode) {
                handleSubmit();
              } else if (!app.isRunning) {
                handleSubmit();
              }
            }
            if (event.key === "Escape" && app.reviseMode) {
              setDraft("");
              app.cancelReviseMode();
            }
          }}
        />
        {app.reviseMode ? (
          <>
            <Button variant="ghost" className="shrink-0" disabled={!canSend} onClick={handleSubmit}>
              Send edited message
            </Button>
            <Button
              variant="ghost"
              className="shrink-0"
              onClick={() => {
                setDraft("");
                app.cancelReviseMode();
              }}
            >
              Cancel edit
            </Button>
          </>
        ) : (
          <>
            <Button
              variant="ghost"
              className="h-9 w-9 shrink-0 rounded-lg px-0 text-base text-ink"
              disabled={!canSend}
              onClick={handleSubmit}
              title="Send"
              aria-label="Send"
            >
              ↑
            </Button>
            {app.isRunning ? (
              <Button
                variant="ghost"
                className="h-9 w-9 shrink-0 rounded-lg px-0 text-danger"
                onClick={app.abortRun}
                title="Stop"
                aria-label="Stop"
              >
                ■
              </Button>
            ) : null}
          </>
        )}
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-2">
        {showSkills ? (
          <>
            <Select
              className="w-auto min-w-32 bg-surface/80 text-[0.8125rem]"
              disabled={!interactive || app.isRunning}
              value={selectedSkill}
              onChange={(event) => setSelectedSkill(event.target.value)}
              title="Alt Theory skill"
            >
              <option value="">Skill</option>
              {(app.discovery?.skills ?? []).map((skill) => (
                <option key={skill.name} value={skill.name} title={skill.description}>
                  {skill.name}
                </option>
              ))}
            </Select>
            <Button
              variant="ghost"
              className="h-8 w-8 px-0 text-base"
              disabled={!interactive || app.isRunning || !selectedSkill}
              onClick={() => {
                if (app.invokeSkill(selectedSkill, draft)) {
                  setDraft("");
                  setSelectedSkill("");
                }
              }}
              title="Invoke selected skill"
              aria-label="Invoke selected skill"
            >
              ↵
            </Button>
          </>
        ) : null}
      </div>
    </footer>
  );
}
