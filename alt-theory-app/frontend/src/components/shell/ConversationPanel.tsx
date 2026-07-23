import { useEffect, useRef } from "react";
import { useApp } from "@/context/AppProvider";
import { useShell } from "@/context/ShellContext";
import { Composer } from "@/components/conversation/Composer";
import { MessageList } from "@/components/conversation/MessageList";
import { ArmSplit } from "@/components/shell/ArmSplit";
import { Comparison } from "@/components/shell/Comparison";

export function ConversationPanel() {
  const app = useApp();
  const shell = useShell();
  const live = Boolean(app.sessionId);
  const prevSessionId = useRef<string | null>(null);

  // When a brand-new conversation opens with Work selected, apply full mode.
  // Only for sessions created here: reopening an existing Pure conversation
  // must never silently expand its tools (Codex review 2026-07-24).
  useEffect(() => {
    if (
      app.sessionId &&
      app.sessionId !== prevSessionId.current &&
      app.sessionReady &&
      app.sessionCreatedHere &&
      shell.newMode === "full" &&
      app.sessionMode !== "full"
    ) {
      app.switchMode("full");
    }
    prevSessionId.current = app.sessionId;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [app.sessionId, app.sessionReady]);

  return (
    <main className="center">
      {shell.compareOpen ? <Comparison /> : null}
      {shell.armsComparisonId ? (
        <ArmSplit />
      ) : live ? (
        <div className="live-state">
          <MessageList />
          <Composer variant="live" />
        </div>
      ) : (
        <EmptyState />
      )}
    </main>
  );
}

function EmptyState() {
  const app = useApp();
  const shell = useShell();
  return (
    <div className="empty-state">
      <div className="empty-intro">
        <div className="greet">Where shall we begin?</div>
        <div className="mode-pick">
          <button
            className={`mode-card${shell.newMode === "pure" ? " on" : ""}`}
            onClick={() => shell.setNewMode("pure")}
          >
            <div className="t">
              <i className="ph ph-book-open" />
              Understand
              <span className="def">default</span>
            </div>
            <div className="d">Reads and discusses. Asks before touching anything.</div>
          </button>
          <button
            className={`mode-card${shell.newMode === "full" ? " on" : ""}`}
            onClick={() => shell.setNewMode("full")}
          >
            <div className="t">
              <i className="ph ph-hammer" />
              Work
            </div>
            <div className="d">Can act on files in your working folders.</div>
          </button>
        </div>
        <div className="mode-note">
          {shell.newMode === "pure"
            ? "Alt reads, thinks, and talks things through with you. It will not change anything on your computer."
            : "Alt can read, edit, and create files in the working folders you choose. Anything risky asks for your approval first."}
        </div>
        {app.appMode === "local" ? (
          <button
            className="import-link"
            onClick={() => shell.setImportOpen(true)}
          >
            Or continue a conversation from another app…
          </button>
        ) : null}
      </div>
      <div className="empty-composer">
        <Composer variant="empty" />
      </div>
    </div>
  );
}
