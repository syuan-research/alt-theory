import { useApp } from "@/context/AppProvider";
import { useShell } from "@/context/ShellContext";
import { t } from "@/i18n";
import { approvalTarget } from "@/lib/approvalTarget";

export function ApprovalNotice() {
  const app = useApp();
  const shell = useShell();
  const request = app.approvals.find(
    ({ sessionId }) =>
      shell.surface !== "app" ||
      (sessionId !== app.sessionId && sessionId !== app.activeRelatedSessionId),
  );
  if (!request) return null;

  const name =
    app.sessionDisplayNames[request.sessionId]?.alias || t("A conversation");
  const count = app.approvals.length;
  const open = () => {
    const target = approvalTarget(request.sessionId, app.sessions);
    shell.openApp();
    app.openCatalogSession(target.center);
    if (target.related) {
      app.setActiveRelatedSessionId(target.related, { size: "default" });
    }
  };

  return (
    <button type="button" className="global-approval-notice" onClick={open}>
      <i className="ph ph-hand-palm" aria-hidden="true" />
      <span>{t("{name} needs your approval.", { name })}</span>
      {count > 1 ? <b>{count}</b> : null}
      <span>{t("Open conversation")}</span>
    </button>
  );
}
