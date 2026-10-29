import { WebPageView } from "./WebPageView";
import { useShell } from "@/context/ShellContext";
import { useContentLinks } from "@/components/conversation/useContentLinks";
import { t } from "@/i18n";

export function LocalPage() {
  const shell = useShell();
  const target = shell.target;
  const links = useContentLinks(target?.sessionId ?? null);
  if (target?.kind !== "page") return null;
  const openDefault = () => links.openDefault(target.url);
  const actions = <button className="flat" onClick={openDefault} onContextMenu={event => links.context(event, target.url)}>{t("Open with default app")}</button>;
  return <div className="local-page">
    {target.image ? <><div className="local-page-actions">{actions}</div><img className="artifact-image" src={target.url} alt={target.url} /></>
      : <WebPageView key={target.url + ":" + (target.revision ?? 0)} url={target.url} title={target.url} actions={actions} onError={openDefault} />}
    {links.menu}
  </div>;
}
