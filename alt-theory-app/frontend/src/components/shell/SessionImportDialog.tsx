import { useEffect, useMemo, useState } from "react";
import {
  fetchImportSessions,
  submitSessionImport,
  type ImportableHarness,
  type ImportResult,
  type ImportSourceSession,
} from "@/api/session-import";
import { Button } from "@/components/ui/Button";
import { useApp } from "@/context/AppProvider";

export function SessionImportDialog({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const app = useApp();
  const [harness, setHarness] = useState<ImportableHarness>("opencode");
  const [sessions, setSessions] = useState<ImportSourceSession[]>([]);
  const [sourceId, setSourceId] = useState("");
  const [mode, setMode] = useState<"pure" | "full">("full");
  const [result, setResult] = useState<ImportResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open) return;
    setBusy(true);
    setError("");
    setResult(null);
    void fetchImportSessions(harness)
      .then((next) => {
        setSessions(next);
        setSourceId((current) =>
          next.some((session) => session.sourceId === current)
            ? current
            : next[0]?.sourceId || ""
        );
      })
      .catch((reason) => setError(reason instanceof Error ? reason.message : String(reason)))
      .finally(() => setBusy(false));
  }, [open, harness]);

  const selected = useMemo(
    () => sessions.find((session) => session.sourceId === sourceId) ?? null,
    [sessions, sourceId]
  );

  if (!open) return null;

  const run = async (preflightOnly: boolean) => {
    if (!sourceId) return;
    setBusy(true);
    setError("");
    try {
      const next = await submitSessionImport({ harness, sourceId, mode, preflightOnly });
      setResult(next);
      if (!preflightOnly && next.sessionId) {
        await app.refreshSessions();
        app.openCatalogSession(next.sessionId);
        onClose();
      }
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      setBusy(false);
    }
  };

  const canImport = result?.status === "ready";
  const alreadyImported = result?.status === "unchanged" && result.sessionId;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-ink/30 p-4"
      role="presentation"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="session-import-title"
        className="w-full max-w-2xl rounded-lg border border-hairline bg-surface p-5 shadow-lg"
        onClick={(event) => event.stopPropagation()}
      >
        <h2 id="session-import-title" className="text-lg font-semibold text-ink">
          Import a conversation
        </h2>
        <p className="mt-1 text-sm text-text-secondary">
          Alt Theory checks the whole selected conversation before writing anything.
        </p>

        <label className="mt-4 block text-sm font-medium text-ink">
          Source
          <select
            className="mt-1 w-full rounded-md border border-hairline bg-canvas px-3 py-2 text-sm"
            value={harness}
            disabled={busy}
            onChange={(event) => {
              setHarness(event.target.value as ImportableHarness);
              setSessions([]);
              setSourceId("");
              setResult(null);
            }}
          >
            <option value="opencode">OpenCode</option>
            <option value="codex">Codex</option>
            <option value="grok-build">Grok Build</option>
          </select>
        </label>

        <label className="mt-3 block text-sm font-medium text-ink">
          Conversation
          <select
            className="mt-1 w-full rounded-md border border-hairline bg-canvas px-3 py-2 text-sm"
            value={sourceId}
            disabled={busy}
            onChange={(event) => {
              setSourceId(event.target.value);
              setResult(null);
            }}
          >
            {sessions.map((session) => (
              <option key={session.sourceId} value={session.sourceId}>
                {(session.name || session.preview || session.sourceSessionId).slice(0, 100)} · {session.messageCount} messages
              </option>
            ))}
          </select>
        </label>

        {selected ? (
          <p className="mt-2 text-xs text-text-muted">
            Updated {new Date(selected.updatedAt).toLocaleString()} · {selected.repeat}
            {!selected.cwdAvailable ? " · original workspace is unavailable" : ""}
          </p>
        ) : null}

        <fieldset className="mt-4">
          <legend className="text-sm font-medium text-ink">Continue in</legend>
          <div className="mt-2 flex gap-5 text-sm">
            <label className="flex items-center gap-2">
              <input type="radio" checked={mode === "full"} onChange={() => setMode("full")} />
              Work mode (tools and workspace)
            </label>
            <label className="flex items-center gap-2">
              <input type="radio" checked={mode === "pure"} onChange={() => setMode("pure")} />
              Pure mode
            </label>
          </div>
        </fieldset>

        {result?.status === "ready" ? (
          <div className="mt-4 rounded-md border border-hairline bg-canvas p-3 text-sm">
            <p className="font-medium text-ink">Ready to import with these declared transformations:</p>
            <ul className="mt-2 list-disc space-y-1 pl-5 text-text-secondary">
              {(result.transformations ?? []).map((item) => <li key={item}>{item}</li>)}
            </ul>
          </div>
        ) : null}
        {result?.status === "refused" ? (
          <p className="mt-4 rounded-md border border-danger/30 bg-danger/5 p-3 text-sm text-danger">
            Refused before import: {result.count} {result.recordType} record(s). {result.reason}
          </p>
        ) : null}
        {result && !["ready", "refused"].includes(result.status) ? (
          <p className="mt-4 text-sm text-text-secondary">
            {result.status === "unchanged"
              ? "This exact source version is already imported."
              : result.error || `Import status: ${result.status}`}
          </p>
        ) : null}
        {error ? <p className="mt-4 text-sm text-danger">{error}</p> : null}

        <div className="mt-5 flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          {alreadyImported ? (
            <Button
              variant="primary"
              onClick={() => {
                app.openCatalogSession(String(result.sessionId));
                onClose();
              }}
            >
              Open imported conversation
            </Button>
          ) : canImport ? (
            <Button variant="primary" disabled={busy} onClick={() => void run(false)}>
              Import and open
            </Button>
          ) : (
            <Button
              variant="primary"
              disabled={busy || !sourceId || !selected?.cwdAvailable}
              onClick={() => void run(true)}
            >
              {busy ? "Checking…" : "Check full conversation"}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
