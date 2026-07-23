import { useMemo, useState } from "react";
import { useApp } from "@/context/AppProvider";
import { useShell } from "@/context/ShellContext";
import { sessionTitle } from "@/lib/sessionList";

/**
 * Researcher left pane (M7 §5). Setup = the auto-applied config + study tag +
 * researcher actions; Sessions = the study-tagged conversations. Hidden in user
 * mode via `.app-root.researcher .workbench` in index.css.
 */
export function Workbench() {
  const [tab, setTab] = useState<"setup" | "sessions">("setup");

  return (
    <div className="workbench">
      <div className="wb-tabs">
        <button
          className={tab === "setup" ? "on" : ""}
          onClick={() => setTab("setup")}
        >
          Setup
        </button>
        <button
          className={tab === "sessions" ? "on" : ""}
          onClick={() => setTab("sessions")}
        >
          Sessions
        </button>
      </div>
      {tab === "setup" ? <SetupView /> : <SessionsView />}
    </div>
  );
}

function labelFor(
  slug: string | null | undefined,
  assets: { slug: string; displayName: string }[] | undefined,
  fallback: string
): string {
  if (!slug) return fallback;
  return assets?.find((a) => a.slug === slug)?.displayName ?? slug;
}

function SetupView() {
  const app = useApp();
  const shell = useShell();

  const role = labelFor(
    app.selectors.rolePresetSlug,
    app.discovery?.rolePresets,
    "None"
  );
  const knowledge = labelFor(
    app.selectors.currentDomain === "__off__" ? null : app.selectors.currentDomain,
    app.discovery?.kbDomains,
    "None"
  );
  const model = app.modelOverride
    ? app.modelOverride.modelId
    : app.localConfig?.activeModel
      ? `Default · ${app.localConfig.activeModel}`
      : "Default";
  const study = app.studyTag
    ? `${app.studyTag.studyId}${app.studyTag.batch ? ` · ${app.studyTag.batch}` : ""}`
    : "Daily use";

  return (
    <div className="wb-view on">
      <div className="wb-card">
        <h4>Current setup</h4>
        <div className="wb-row">
          <span className="k">Role</span>
          <span className="v">{role}</span>
        </div>
        <div className="wb-row">
          <span className="k">Knowledge</span>
          <span className="v">{knowledge}</span>
        </div>
        <div className="wb-row">
          <span className="k">Model</span>
          <span className="v">{model}</span>
        </div>
        <div className="wb-row">
          <span className="k">Study</span>
          <span className="v">{study}</span>
        </div>
        <div className="wb-note">
          Applies to this conversation. Set the pickers above the composer.
        </div>
      </div>

      <StudyTagCard />

      <div className="wb-actions">
        <button
          disabled={!app.sessionId}
          onClick={() => shell.openCompare()}
          title="Branch the conversation into arms and compare their responses"
        >
          <i className="ph ph-git-fork" />
          Compare responses
        </button>
        <button onClick={() => app.toggleViewMode()}>
          <i className="ph ph-eye" />
          View as participant
        </button>
        <button onClick={() => shell.openReview()}>
          <i className="ph ph-table" />
          Open review
        </button>
      </div>
    </div>
  );
}

function StudyTagCard() {
  const app = useApp();
  const [studyId, setStudyId] = useState(app.studyTag?.studyId ?? "");
  const [batch, setBatch] = useState(app.studyTag?.batch ?? "");

  const dirty =
    studyId.trim() !== (app.studyTag?.studyId ?? "") ||
    batch.trim() !== (app.studyTag?.batch ?? "");

  const apply = () => {
    const id = studyId.trim();
    if (!id) {
      app.setStudyTag(null);
      return;
    }
    app.setStudyTag({ studyId: id, ...(batch.trim() ? { batch: batch.trim() } : {}) });
  };

  return (
    <div className="wb-card">
      <h4>Study tag</h4>
      <input
        type="text"
        className="wb-input"
        placeholder="Study id (blank = daily use)"
        value={studyId}
        onChange={(e) => setStudyId(e.target.value)}
        disabled={!app.sessionReady}
      />
      <input
        type="text"
        className="wb-input"
        placeholder="Batch (optional)"
        value={batch}
        onChange={(e) => setBatch(e.target.value)}
        disabled={!app.sessionReady}
      />
      <button
        className="wb-apply"
        disabled={!app.sessionReady || !dirty}
        onClick={apply}
      >
        Apply tag
      </button>
    </div>
  );
}

function SessionsView() {
  const app = useApp();
  const shell = useShell();
  const tagged = useMemo(
    () => app.sessions.filter((s) => s.studyTag),
    [app.sessions]
  );

  return (
    <div className="wb-view on">
      <div className="wb-sessions">
        <div className="group-label">This experiment</div>
        {tagged.length === 0 ? (
          <div className="rp-empty">No study-tagged conversations yet.</div>
        ) : (
          tagged.map((s) => (
            <button
              key={s.sessionId}
              className={`wb-sess${
                app.selectedCatalogSessionId === s.sessionId ? " active" : ""
              }`}
              onClick={() => {
                shell.openApp();
                app.openCatalogSession(s.sessionId);
              }}
            >
              <span className="s-title">
                {sessionTitle(s, app.sessionDisplayNames)}
              </span>
              <span className="tag">{s.studyTag?.batch ?? s.studyTag?.studyId}</span>
            </button>
          ))
        )}
      </div>
    </div>
  );
}
