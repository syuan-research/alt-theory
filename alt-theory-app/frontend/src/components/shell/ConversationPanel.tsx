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
  useEffect(() => {
    if (
      app.sessionId &&
      app.sessionId !== prevSessionId.current &&
      app.sessionReady &&
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
      </div>
      <div className="empty-composer">
        {app.sessionReady ? (
          <Composer variant="empty" />
        ) : (
          <div className="rp-empty">Connecting…</div>
        )}
      </div>
    </div>
  );
}
