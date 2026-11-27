import { useConversationContext } from "@/context/ConversationContext";
import { useApp } from "@/context/AppProvider";
import { useShell } from "@/context/ShellContext";
import { t } from "@/i18n";
import { Composer } from "@/components/conversation/Composer";
import { MessageList } from "@/components/conversation/MessageList";
import { ArmSplit } from "@/components/shell/ArmSplit";
import { Comparison } from "@/components/shell/Comparison";
import { ApprovalNotice } from "@/components/shell/ApprovalNotice";
import { OpenFileReader } from "@/components/inspector/OpenFilesPanel";
import { useMainView } from "@/context/MainView";
import { sessionTitle } from "@/lib/sessionList";
import { targetTitle, type OpenFile } from "@/lib/viewTarget";
import { useState } from "react";

export function ConversationPanel() {
  const conv = useConversationContext();
  const shell = useShell();
  const main = useMainView();
  const live = Boolean(conv.sessionId);

  return (
    <main className="center">
      <div className="workcard">
        <ApprovalNotice />
        {shell.compareOpen ? <Comparison /> : null}
        {main.centerFile ? (
          <CenterFile key={main.centerFile.key} file={main.centerFile} />
        ) : shell.armsComparisonId ? (
          <ArmSplit />
        ) : live ? (
          <div className="live-state">
            {main.centerBack ? <div className="center-head"><CenterBack /></div> : null}
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

/** The center's one step back (owner 2026-11-27): to the conversation under
 *  a file, or to the one shown before a conversation was sent here. */
function CenterBack() {
  const app = useApp();
  const main = useMainView();
  const back = main.centerBack;
  const summary = back ? app.sessions.find((item) => item.sessionId === back) : undefined;
  const name = summary ? sessionTitle(summary, app.sessionDisplayNames, app.sessions) : t("Back");
  return (
    <button type="button" className="center-back" onClick={main.backFromCenter} data-tip={t("Back to {name}", { name })}>
      <i className="ph ph-arrow-left" aria-hidden="true" />
      <span>{name}</span>
    </button>
  );
}

/** A file sent to the center: it covers the conversation until Back. */
function CenterFile({ file }: { file: OpenFile }) {
  const [view, setView] = useState(file.view);
  const name = (file.file ? targetTitle(file.file) ?? file.file.path : file.change?.title ?? "").split(/[\\/]/).at(-1);
  return (
    <div className="center-file">
      <div className="center-head">
        <CenterBack />
        <span className="center-file-name"><i className="ph ph-file-text" aria-hidden="true" />{name}</span>
      </div>
      <OpenFileReader file={{ ...file, view }} active onViewChange={setView} />
    </div>
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
          data-tip={t("Import conversations from OpenCode, Codex (ChatGPT), Claude Code, Grok Build, and Pi. The original conversations are unaffected.")}
          onClick={() => shell.setImportOpen(true)}
        >
          <i className="ph ph-arrow-square-in" aria-hidden="true" />
          {t("Or continue a conversation from another app…")}
        </button>
      </div>
      <div className="empty-composer">
        <Composer variant="empty" />
      </div>
    </div>
  );
}
