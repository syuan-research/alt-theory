import { useEffect } from "react";
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

  // Draft mode must reach the server before the first prompt materializes.
  // Reopened conversations bypass this path and retain their persisted mode.
  useEffect(() => {
    if (
      !app.sessionId &&
      app.sessionReady &&
      app.sessionMode !== shell.newMode
    ) {
      app.switchMode(shell.newMode);
    }
  }, [
    app.sessionId,
    app.sessionMode,
    app.sessionReady,
    app.switchMode,
    shell.newMode,
  ]);

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
            className={`mode-card understand${shell.newMode === "pure" ? " on" : ""}`}
            onClick={() => shell.setNewMode("pure")}
            aria-pressed={shell.newMode === "pure"}
            title="For clarifying questions, comparing explanations, and developing ideas with your materials."
          >
            <div className="t">
              <i className="ph ph-book-open" />
              Understand
              <span className="def">default</span>
            </div>
            <ul>
              <li>Clarify questions, compare explanations, and develop ideas.</li>
              <li>Read and discuss your materials and selected knowledge.</li>
              <li>Create notes or drafts while keeping understanding at the center.</li>
            </ul>
          </button>
          <button
            className={`mode-card work${shell.newMode === "full" ? " on" : ""}`}
            onClick={() => shell.setNewMode("full")}
            aria-pressed={shell.newMode === "full"}
            title="For the same careful thinking plus research, data analysis, and direct work across files."
          >
            <div className="t">
              <i className="ph ph-hammer" />
              Work
            </div>
            <ul>
              <li>Keep the same careful thinking while advancing a concrete task.</li>
              <li>Research and verify information, analyze data, and work across documents.</li>
              <li>Create or update documents, spreadsheets, presentations, and other files in your working folders.</li>
            </ul>
          </button>
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
