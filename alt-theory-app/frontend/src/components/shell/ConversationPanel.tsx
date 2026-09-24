import { useEffect } from "react";
import { useConversationContext } from "@/context/ConversationContext";
import { useApp } from "@/context/AppProvider";
import { useShell } from "@/context/ShellContext";
import { t } from "@/i18n";
import { Composer } from "@/components/conversation/Composer";
import { MessageList } from "@/components/conversation/MessageList";
import { ArmSplit } from "@/components/shell/ArmSplit";
import { Comparison } from "@/components/shell/Comparison";
import { ApprovalNotice } from "@/components/shell/ApprovalNotice";

export function ConversationPanel() {
  const conv = useConversationContext();
  const shell = useShell();
  const live = Boolean(conv.sessionId);

  // Draft mode must reach the server before the first prompt materializes.
  // Reopened conversations bypass this path and retain their persisted mode.
  useEffect(() => {
    if (
      !conv.sessionId &&
      conv.sessionReady &&
      conv.sessionMode !== shell.newMode
    ) {
      conv.switchMode(shell.newMode);
    }
  }, [
    conv.sessionId,
    conv.sessionMode,
    conv.sessionReady,
    conv.switchMode,
    shell.newMode,
  ]);

  return (
    <main className="center">
      <div className="workcard">
        <ApprovalNotice />
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
      </div>
    </main>
  );
}

function EmptyState() {
  const app = useApp();
  const shell = useShell();
  return (
    <div className="empty-state">
      <div className="empty-intro">
        <div className="greet">{t("Where shall we begin?")}</div>
        {app.runtimeMode === "native-pi" ? (
          <div className="native-pi-empty-note">
            {t("Native Pi uses its normal work-capable tools and project and global folder access.")}
          </div>
        ) : (
          <div className="mode-pick">
            <button
              className={`mode-card understand${shell.newMode === "understand" ? " on" : ""}`}
              onClick={() => shell.setNewMode("understand")}
              aria-pressed={shell.newMode === "understand"}
              data-tip={t("For clarifying questions, comparing explanations, and developing ideas with your materials.")}
            >
              <div className="t">
                <i className="ph ph-book-open" />
                {t("Understand")}
              </div>
              <ul>
                <li>{t("Clarify questions, compare explanations, and develop ideas.")}</li>
                <li>{t("Read and discuss your materials and selected knowledge.")}</li>
                <li>{t("Create notes or drafts while keeping understanding at the center.")}</li>
              </ul>
            </button>
            <button
              className={`mode-card work${shell.newMode === "work" ? " on" : ""}`}
              onClick={() => shell.setNewMode("work")}
              aria-pressed={shell.newMode === "work"}
              data-tip={t("For the same careful thinking plus research, data analysis, and direct work across files.")}
            >
              <div className="t">
                <i className="ph ph-hammer" />
                {t("Work")}
              </div>
              <ul>
                <li>{t("Keep the same careful thinking while advancing a concrete task.")}</li>
                <li>{t("Research and verify information, analyze data, and work across documents.")}</li>
                <li>{t("Create or update documents, spreadsheets, presentations, and other files in your project and global folders.")}</li>
              </ul>
            </button>
          </div>
        )}
        {app.appMode === "local" ? (
          <button
            className="import-link"
            onClick={() => shell.setImportOpen(true)}
          >
            {t("Or continue a conversation from another app…")}
          </button>
        ) : null}
      </div>
      <div className="empty-composer">
        <Composer variant="empty" />
      </div>
    </div>
  );
}
