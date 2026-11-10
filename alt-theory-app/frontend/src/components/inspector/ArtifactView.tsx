import { WebPageView } from "./WebPageView";
import { useEffect, useState } from "react";
import { sessionArtifactUrl, type FileOwner } from "@/api/session-files";
import type { FileRef } from "@/lib/fileContent";
import { isImagePath } from "../../../../shared/artifact-types";
import { t } from "@/i18n";

export function ArtifactView({ owner, file, controlsHost }: { owner: FileOwner; file: FileRef; controlsHost?: HTMLElement | null }) {
  const [url, setUrl] = useState("");
  const [error, setError] = useState("");
  useEffect(() => {
    let cancelled = false;
    setUrl(""); setError("");
    sessionArtifactUrl(owner, file.root, file.path).then(value => {
      if (!cancelled) setUrl(value);
    }).catch(e => { if (!cancelled) setError(String(e)); });
    return () => { cancelled = true; };
  }, [typeof owner === "string" ? owner : owner.primaryDir, typeof owner, file.root, file.path]);
  if (error) return <div className="rp-empty">{error}</div>;
  if (!url) return <div className="rp-empty">{t("Loading…")}</div>;
  return isImagePath(file.path)
    ? <img className="artifact-image" src={url} alt={file.path} onError={() => setError(t("The current file is not available."))} />
    : <WebPageView url={url} title={file.path} controlsHost={controlsHost} />;
}
