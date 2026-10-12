import { useShell } from "@/context/ShellContext";
import { useContentLinks } from "@/components/conversation/useContentLinks";
import { t } from "@/i18n";

export function LocalPage() {
  const shell = useShell();
  const target = shell.target;
  const links = useContentLinks(target?.sessionId ?? null);
  if (target?.kind !== "page") return null;
  const openDefault = () => links.openDefault(target.url);
  return (
    <div className="local-page">
      <div className="local-page-actions" onContextMenu={event => links.context(event, target.url)}>
        <button className="flat" onClick={openDefault}>{t("Open with default app")}</button>
      </div>
      <iframe key={target.url} src={target.url} title={target.url}
        sandbox="allow-scripts allow-forms allow-same-origin allow-downloads allow-popups"
        onError={openDefault} />
      {links.menu}
    </div>
  );
}
