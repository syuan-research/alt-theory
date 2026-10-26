import { useMainView } from "@/context/MainView";
import { useShell } from "@/context/ShellContext";
import { t } from "@/i18n";

export function HelpMenu({
  compact = false,
}: {
  compact?: boolean;
}) {
  const main = useMainView();
  const shell = useShell();
  const close = (target: HTMLElement) =>
    target.closest("details")?.removeAttribute("open");

  return (
    <details
      className={"help-menu" + (compact ? " compact" : "")}
    >
      <summary data-tip={t("Help")} aria-label={t("Help")}>
        <i className="ph ph-question" aria-hidden="true" />
      </summary>
      <div className="help-popover">
        <button
          onClick={(event) => {
            close(event.currentTarget);
            shell.openApp();
            main.askAboutAlt();
          }}
        >
          <i className="ph ph-chats-circle" />
          <span>
            {t("Ask Alt")}
            <small>{t("A fresh conversation about Alt and setup")}</small>
          </span>
        </button>
        <button
          onClick={(event) => {
            close(event.currentTarget);
            shell.openSettings("features");
          }}
        >
          <i className="ph ph-question" aria-hidden="true" />
          <span>{t("Help center")}</span>
        </button>
      </div>
    </details>
  );
}
