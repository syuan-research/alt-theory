import { useCallback, useEffect, useState } from "react";
import { acknowledgeReleaseNotes, checkForUpdates, getUpdateStatus, hasNativeBridge,
  onUpdateStatus, type AppUpdateStatus } from "./native";

/** Kept once by the shell; every entry opens the same version window. */
export function useVersions() {
  const [status, setStatus] = useState<AppUpdateStatus | null>(null);
  const [open, setOpen] = useState(false);
  const [checking, setChecking] = useState(false);
  const [checked, setChecked] = useState(false);
  const [error, setError] = useState(false);
  useEffect(() => {
    if (!hasNativeBridge()) return;
    let alive = true;
    const receive = (next: AppUpdateStatus | null) => {
      if (!alive) return;
      setStatus(next);
      if (next?.showReleaseNotes) setOpen(true);
    };
    void getUpdateStatus().then(receive).catch(() => {});
    const stop = onUpdateStatus(receive);
    return () => { alive = false; stop(); };
  }, []);
  const close = useCallback(() => {
    setOpen(false);
    void acknowledgeReleaseNotes().then(setStatus).catch(() => {});
  }, []);
  const check = useCallback(async () => {
    setChecking(true); setError(false);
    try { setStatus(await checkForUpdates()); setChecked(true); }
    catch { setError(true); }
    finally { setChecking(false); }
  }, []);
  return { status, open, setOpen, close, check, checking, checked, error };
}

/** Release pages prepend installation notes; only the named release is shown. */
export function releaseNotes(markdown: string, version: string): string {
  const sections = markdown.split(/^## /m).slice(1);
  const section = sections.find((part) => part.startsWith(`v${version} —`) || part.startsWith(`${version} —`));
  return section ? section.slice(section.indexOf("\n") + 1).trim() : "";
}
