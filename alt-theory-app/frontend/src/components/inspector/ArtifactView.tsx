import { WebPageView } from "./WebPageView";
import { useEffect, useState } from "react";
import { sessionArtifactUrl } from "@/api/session-files";
import type { FileRef } from "@/lib/fileContent";
import { isImagePath } from "../../../../shared/artifact-types";
import { t } from "@/i18n";

export function ArtifactView({ sessionId, file }: { sessionId: string; file: FileRef }) {
  const [url, setUrl] = useState("");
  const [error, setError] = useState("");
  useEffect(() => {
    let cancelled = false;
    setUrl(""); setError("");
    sessionArtifactUrl(sessionId, file.root, file.path).then(value => {
      if (!cancelled) setUrl(value);
    }).catch(e => { if (!cancelled) setError(String(e)); });
    return () => { cancelled = true; };
  }, [sessionId, file.root, file.path]);
  if (error) return <div className="rp-empty">{error}</div>;
  if (!url) return <div className="rp-empty">{t("Loading…")}</div>;
  return isImagePath(file.path)
    ? <img className="artifact-image" src={url} alt={file.path} onError={() => setError(t("The current file is not available."))} />
    : <WebPageView url={url} title={file.path} />;
}
