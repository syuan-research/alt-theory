import { WebPageView } from "./WebPageView";
import { useEffect, useState } from "react";
import { sessionArtifactUrl, type FileOwner } from "@/api/session-files";
import type { FileRef } from "@/lib/fileContent";
import { isImagePath } from "../../../../shared/artifact-types";
import { t } from "@/i18n";
import { desktopFiles, openPath } from "@/lib/native";

export function PreviewOpenError({ error, absolutePath }: { error: string; absolutePath?: string }) {
  const [openError, setOpenError] = useState("");
  return (
    <div className="rp-empty">
      <div>{openError || error}</div>
      {absolutePath && (
        <button className="flat" onClick={() => void openPath(absolutePath).catch((e) => setOpenError(String(e)))}>
          {t("Open with default app")}
        </button>
      )}
    </div>
  );
}

export function ArtifactView({ owner, file, absolutePath, controlsHost }: {
  owner: FileOwner | null;
  file: FileRef | null;
  absolutePath?: string;
  controlsHost?: HTMLElement | null;
}) {
  const [url, setUrl] = useState("");
  const [error, setError] = useState("");
  const path = absolutePath ?? file?.path ?? "";
  useEffect(() => {
    let cancelled = false;
    setUrl(""); setError("");
    const load = async () => {
      const local = desktopFiles();
      if (local && absolutePath) return local.artifactUrl(absolutePath, owner !== null && file ? { owner, ...file } : undefined);
      if (owner !== null && file) return sessionArtifactUrl(owner, file.root, file.path);
      throw new Error(t("The current file is not available."));
    };
    load().then(value => {
      if (!cancelled) setUrl(value);
    }).catch(e => { if (!cancelled) setError(String(e)); });
    return () => { cancelled = true; };
  }, [typeof owner === "string" ? owner : owner?.primaryDir, typeof owner, file?.root, file?.path, absolutePath]);
  if (error) return <PreviewOpenError error={error} absolutePath={absolutePath} />;
  if (!url) return <div className="rp-empty">{t("Loading…")}</div>;
  const onError = () => setError(t("The current file is not available."));
  // An image gets the same reading controls as a page: zoom and the expanded
  // view (owner 2026-11-25).
  return isImagePath(path)
    ? <WebPageView image={url} title={path} controlsHost={controlsHost} onError={onError} />
    : <WebPageView url={url} title={path} controlsHost={controlsHost} />;
}
