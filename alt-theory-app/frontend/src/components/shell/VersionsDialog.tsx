import { useEffect, useRef, useState } from "react";
import { useShell } from "@/context/ShellContext";
import { currentLang, t } from "@/i18n";
import { hasNativeBridge, openExternal } from "@/lib/native";
import { releaseNotes } from "@/lib/versions";
import { renderMarkdown } from "@/lib/markdown";
import en from "../../../../../CHANGELOG.md?raw";
import hans from "../../../../../CHANGELOG.zh-Hans.md?raw";
import hant from "../../../../../CHANGELOG.zh-Hant-HK.md?raw";

export function VersionsEntry({ compact = false }: { compact?: boolean }) {
  const { versions } = useShell();
  return <button className={compact ? "versions-entry" : "gear versions-entry"}
    data-tip={compact ? t("Versions") : undefined} aria-label={t("Versions")}
    onClick={() => versions.setOpen(true)}>
    <i className="ph ph-info" aria-hidden="true" />
    {!compact ? t("Versions") : null}
    {versions.status?.newer ? <span className="version-update" aria-label={t("Update available")}>
      <i className="ph ph-arrow-up" aria-hidden="true" />{!compact ? t("Update available") : null}
    </span> : null}
  </button>;
}

export function VersionsDialog() {
  const { versions } = useShell();
  const { status, open, close } = versions;
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [latest, setLatest] = useState(false);
  useEffect(() => {
    if (open) {
      setLatest(Boolean(status?.newer && !status.showReleaseNotes));
      dialogRef.current?.showModal();
    } else dialogRef.current?.close();
  }, [open]);
  const version = latest && status?.latestVersion ? status.latestVersion : status?.currentVersion || __ALT_THEORY_VERSION__;
  const local = { en, "zh-Hans": hans, "zh-Hant-HK": hant }[currentLang()];
  const notes = releaseNotes(latest ? status?.releaseNotes ?? "" : local, version);
  return <dialog ref={dialogRef} className="ui-dialog versions-dialog" aria-labelledby="versions-title"
    onCancel={(event) => { event.preventDefault(); close(); }}
    onClick={(event) => { if (event.target === dialogRef.current) {
      const rect = dialogRef.current.getBoundingClientRect();
      if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) close();
    } }}>
    <header><h2 id="versions-title">Alt Theory {version}</h2>
      <button className="flat" onClick={close} aria-label={t("Close")}><i className="ph ph-x" /></button></header>
    <nav>
      {status?.newer ? <button className={latest ? "on" : ""} onClick={() => setLatest(true)}>{t("New version")}</button> : null}
      <button className={!latest ? "on" : ""} onClick={() => setLatest(false)}>{t("What's new")}</button>
    </nav>
    {notes ? <div className="markdown-body version-notes" dangerouslySetInnerHTML={{ __html: renderMarkdown(notes) }}
      onClick={(event) => {
        const link = (event.target as HTMLElement).closest("a");
        if (link) { event.preventDefault(); if (/^https?:\/\//i.test(link.href)) void openExternal(link.href); }
      }} /> : <p>{t("Release notes are available on the release page.")}</p>}
    {versions.error ? <p>{t("Could not check for updates.")}</p> : versions.checked && !status?.newer ? <p>{t("No newer version.")}</p> : null}
    <footer>
      {hasNativeBridge() ? <button className="flat" disabled={versions.checking} onClick={() => void versions.check()}>{t("Check for updates")}</button> : null}
      {latest && status?.htmlUrl ? <button className="flat" onClick={() => void openExternal(status.htmlUrl!)}>{t("Open download page")}</button> : null}
      <button className="flat" onClick={close}>{t("Close")}</button>
    </footer>
  </dialog>;
}
