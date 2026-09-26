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
            {t("Native Pi uses its normal tools and project and global folder access.")}
          </div>
        ) : null}
        <button
          className="import-link"
          onClick={() => shell.setImportOpen(true)}
        >
          {t("Or continue a conversation from another app…")}
        </button>
      </div>
      <div className="empty-composer">
        <Composer variant="empty" />
      </div>
    </div>
  );
}
