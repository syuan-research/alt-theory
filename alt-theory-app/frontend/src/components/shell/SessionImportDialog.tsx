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
import { useShell } from "@/context/ShellContext";
import { folderLabel } from "@/lib/sessionList";

export function SessionImportDialog({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const app = useApp();
  const shell = useShell();
  const [harness, setHarness] = useState<ImportableHarness>("opencode");
  const [sessions, setSessions] = useState<ImportSourceSession[]>([]);
  const [sourceId, setSourceId] = useState("");
  const [query, setQuery] = useState("");
  const [workspaceOverride, setWorkspaceOverride] = useState("");
  const [mode, setMode] = useState<"pure" | "full">(shell.newMode);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open) return;
    setMode(shell.newMode);
    setQuery("");
    setWorkspaceOverride("");
  }, [open, shell.newMode]);

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

  const visibleSessions = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return sessions;
    return sessions.filter((session) =>
      [
        session.name,
        session.preview,
        session.cwd,
        session.sourceSessionId,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(needle)
    );
  }, [query, sessions]);

  const workspaceGroups = useMemo(() => {
    const groups = new Map<string, ImportSourceSession[]>();
    for (const session of visibleSessions) {
      const key = session.cwd || "";
      const group = groups.get(key) ?? [];
      group.push(session);
      groups.set(key, group);
    }
    return [...groups.entries()]
      .sort(([, a], [, b]) => b[0]!.updatedAt.localeCompare(a[0]!.updatedAt))
      .map(([cwd, group]) => ({
        cwd,
        label: cwd ? folderLabel(cwd) : "No working folder",
        sessions: group,
      }));
  }, [visibleSessions]);

  useEffect(() => {
    if (!open || visibleSessions.some((session) => session.sourceId === sourceId)) {
      return;
    }
    setSourceId(visibleSessions[0]?.sourceId ?? "");
    setWorkspaceOverride("");
    setResult(null);
  }, [open, sourceId, visibleSessions]);

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
      const next = await submitSessionImport({
        harness,
        sourceId,
        mode,
        preflightOnly,
        workspaceOverride: workspaceOverride || undefined,
      });
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
        className="max-h-[calc(100vh-2rem)] w-full max-w-2xl overflow-y-auto rounded-lg border border-hairline bg-surface p-5 shadow-lg"
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
              setQuery("");
              setWorkspaceOverride("");
              setResult(null);
            }}
          >
            <option value="opencode">OpenCode</option>
            <option value="codex">Codex</option>
            <option value="grok-build">Grok Build</option>
          </select>
        </label>

        <label className="mt-3 block text-sm font-medium text-ink">
          Search
          <input
            type="search"
            className="mt-1 w-full rounded-md border border-hairline bg-canvas px-3 py-2 text-sm"
            placeholder="Title, working folder, or conversation text"
            value={query}
            disabled={busy}
            onChange={(event) => setQuery(event.target.value)}
          />
        </label>

        <label className="mt-3 block text-sm font-medium text-ink">
          Conversation
          <select
            className="mt-1 w-full rounded-md border border-hairline bg-canvas px-3 py-1 text-sm"
            size={8}
            value={sourceId}
            disabled={busy}
            onChange={(event) => {
              setSourceId(event.target.value);
              setWorkspaceOverride("");
              setResult(null);
            }}
          >
            {workspaceGroups.length === 0 ? (
              <option value="">No matching conversations</option>
            ) : workspaceGroups.map((group) => (
              <optgroup key={group.cwd || "no-folder"} label={group.label}>
                {group.sessions.map((session) => (
                  <option key={session.sourceId} value={session.sourceId}>
                    {(session.name || session.preview || session.sourceSessionId).slice(0, 100)} · {session.messageCount} messages
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
        </label>

        {selected ? (
          <div className="mt-2 space-y-1 text-xs text-text-muted">
            <p>
              Updated {new Date(selected.updatedAt).toLocaleString()} · {selected.repeat}
            </p>
            <p className="break-all" title={selected.cwd}>
              Working folder: {selected.cwd || "not recorded"}
            </p>
          </div>
        ) : null}

        {selected && !selected.cwdAvailable ? (
          <div className="mt-3 rounded-md border border-warning/30 bg-warning/5 p-3 text-sm text-text-secondary">
            <p>The original working folder is unavailable. Choose its current location to continue.</p>
            {workspaceOverride ? (
              <p className="mt-1 break-all text-xs text-text-muted">
                Replacement: {workspaceOverride}
              </p>
            ) : null}
            <Button
              variant="secondary"
              className="mt-2"
              disabled={busy}
              onClick={() => {
                const path = window.prompt(
                  "Full path of the replacement working folder:",
                  workspaceOverride
                );
                if (!path?.trim()) return;
                setWorkspaceOverride(path.trim());
                setResult(null);
              }}
            >
              {workspaceOverride ? "Change folder…" : "Choose replacement folder…"}
            </Button>
          </div>
        ) : null}

        {selected?.repeat === "changed" ? (
          <p className="mt-3 rounded-md border border-warning/30 bg-warning/5 p-3 text-sm text-text-secondary">
            The source conversation has new activity. Importing it creates a new
            conversation; it does not overwrite or merge your earlier Alt Theory continuation.
          </p>
        ) : null}

        <fieldset className="mt-4">
          <legend className="text-sm font-medium text-ink">Continue in</legend>
          <div className="mt-2 flex gap-5 text-sm">
            <label className="flex items-center gap-2">
              <input type="radio" checked={mode === "full"} onChange={() => setMode("full")} />
              Work (tools and working folder)
            </label>
            <label className="flex items-center gap-2">
              <input type="radio" checked={mode === "pure"} onChange={() => setMode("pure")} />
              Understand (conversation only)
            </label>
          </div>
        </fieldset>

        {result?.status === "ready" ? (
          <div className="mt-4 rounded-md border border-hairline bg-canvas p-3 text-sm">
            <p className="font-medium text-ink">Ready to continue this conversation.</p>
            <p className="mt-1 text-text-secondary">
              The main conversation becomes active history. Preserved supporting records
              remain available when the agent needs to search them.
            </p>
            {(result.transformations?.length ?? 0) > 0 ? (
              <details className="mt-2 text-text-secondary">
                <summary className="cursor-pointer">
                  Import details ({result.transformations?.length})
                </summary>
                <ul className="mt-2 list-disc space-y-1 pl-5">
                  {result.transformations?.map((item) => <li key={item}>{item}</li>)}
                </ul>
              </details>
            ) : null}
          </div>
        ) : null}
        {result?.status === "refused" ? (
          <div className="mt-4 rounded-md border border-danger/30 bg-danger/5 p-3 text-sm text-danger">
            <p>Alt Theory cannot import this conversation safely yet.</p>
            <details className="mt-2">
              <summary className="cursor-pointer">Technical reason</summary>
              <p className="mt-1">
                {result.count} {result.recordType} record(s). {result.reason}
              </p>
            </details>
          </div>
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
              {busy ? "Importing…" : "Import and open"}
            </Button>
          ) : (
            <Button
              variant="primary"
              disabled={
                busy ||
                !sourceId ||
                (!selected?.cwdAvailable && !workspaceOverride)
              }
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
