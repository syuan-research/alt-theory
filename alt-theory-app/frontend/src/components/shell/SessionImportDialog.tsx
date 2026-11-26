import { useEffect, useMemo, useState } from "react";
import {
  fetchImportHarnesses,
  fetchImportSessions,
  submitSessionImport,
  type ImportHarnessInfo,
  type ImportableHarness,
  type ImportResult,
  type ImportSourceSession,
} from "@/api/session-import";
import { Button } from "@/components/ui/Button";
import { MenuSelect } from "@/components/ui/MenuSelect";
import { useMainView } from "@/context/MainView";
import { useApp } from "@/context/AppProvider";
import { folderLabel } from "@/lib/sessionList";
import { t } from "@/i18n";
import { quickFindScore, quickFindTerms } from "../../../../shared/quick-find";

// Literals keep the i18n key extraction working; the served list decides
// which entries appear.
function harnessLabel(harness: string): string {
  switch (harness as ImportableHarness) {
    case "pi":
      return t("Pi");
    case "codex":
      return t("Codex (ChatGPT)");
    case "opencode":
      return t("OpenCode");
    case "grok-build":
      return t("Grok Build");
    case "claude-code":
      return t("Claude Code");
    default:
      return harness;
  }
}

const importDetailMessages: Array<[string | RegExp, string]> = [
  ["Source compaction detected:", "Earlier messages remain visible. The imported conversation continues from after the original compaction."],
  ["Current history is selected with OpenCode compaction semantics.", "The original summary and retained messages provide the context for continuing."],
  ["Claude Code plaintext compact summaries", "The original summary is used when continuing. Earlier messages remain visible."],
  ["Current Grok compaction metadata", "Earlier compaction records are saved separately."],
  ["Child agent sessions are indexed", "Subagent records are saved separately from the main conversation."],
  ["Claude Code subagent JSONL", "Subagent records are saved separately from the main conversation."],
  ["Codex inter-agent messages", "Messages between agents outside the main conversation are saved separately."],
  ["Only the current root conversation lineage", "The current branch is imported. Other branches are saved separately."],
  ["Current chat_history.jsonl", "The current branch is imported. Other branches are saved separately."],
  ["Some source content could not be replayed", "Some content appears as placeholders. The original records are saved separately."],
  ["Non-image attached files", "Non-image attachments appear as placeholders."],
  ["Tool-result attachments are replayed", "Embedded images in tool results are imported. Other attachments appear as placeholders."],
  ["The exact Grok tool_result image schema", "Some images from tool results appear as placeholders."],
  ["Compacted tool output uses", "Tool output cleared in the original conversation appears as a placeholder."],
  ["Provider-side backend tool calls", "Some tool activity is shown without its original results."],
  [/^\d+ Codex turn\(s\) were removed/, "Turns undone in the original conversation are saved separately."],
];

function ImportDetails({ items }: { items: string[] }) {
  const details = items.flatMap((item) => {
    const match = importDetailMessages.find(([pattern]) =>
      typeof pattern === "string" ? item.startsWith(pattern) : pattern.test(item)
    );
    return match ? [t(match[1])] : [];
  });
  const unique = [...new Set(details)];
  if (!unique.length) return null;
  return (
    <details className="mt-2 text-text-secondary">
      <summary className="cursor-pointer">
        {t("Import details ({count})", { count: unique.length })}
      </summary>
      <ul className="mt-2 list-disc space-y-1 pl-5">
        {unique.map((item) => <li key={item}>{item}</li>)}
      </ul>
    </details>
  );
}

export function SessionImportDialog({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const app = useApp();
  const main = useMainView();
  const [harness, setHarness] = useState<ImportableHarness>("opencode");
  const [harnessOptions, setHarnessOptions] = useState<ImportHarnessInfo[]>([]);
  const [sessions, setSessions] = useState<ImportSourceSession[]>([]);
  const [sourceId, setSourceId] = useState("");
  const [query, setQuery] = useState("");
  const [workspaceOverride, setWorkspaceOverride] = useState("");
  const [projectOverride, setProjectOverride] = useState("");
  const [result, setResult] = useState<ImportResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open) return;
    setQuery("");
    setWorkspaceOverride("");
    setProjectOverride("");
    void fetchImportHarnesses()
      .then((next) => {
        setHarnessOptions(next);
        setHarness((current) =>
          next.some((info) => info.harness === current)
            ? current
            : ((next[0]?.harness as ImportableHarness | undefined) ?? current),
        );
      })
      .catch(() => setHarnessOptions([]));
  }, [open]);

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
            : next[0]?.sourceId || "",
        );
      })
      .catch((reason) => setError(reason instanceof Error ? reason.message : String(reason)),)
      .finally(() => setBusy(false));
  }, [open, harness]);

  const visibleSessions = useMemo(() => {
    const terms = quickFindTerms(query);
    if (!terms.length) return sessions;
    return sessions.filter((session) => quickFindScore(terms, [
      { text: session.name, weight: 1 },
      { text: session.preview, weight: 1 },
      { text: session.cwd, weight: 1 },
      { text: session.sourceSessionId, weight: 1 },
    ]) > 0);
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
        label: cwd ? folderLabel(cwd) : t("Standalone conversations"),
        sessions: group,
      }));
  }, [visibleSessions]);

  useEffect(() => {
    if (!open || visibleSessions.some((session) => session.sourceId === sourceId)) {
      return;
    }
    setSourceId(visibleSessions[0]?.sourceId ?? "");
    setWorkspaceOverride("");
    setProjectOverride("");
    setResult(null);
  }, [open, sourceId, visibleSessions]);

  const selected = useMemo(
    () => sessions.find((session) => session.sourceId === sourceId) ?? null,
    [sessions, sourceId],
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
        preflightOnly,
        workspaceOverride: workspaceOverride || undefined,
        projectId: preflightOnly ? undefined : projectOverride || result?.projectId || undefined,
      });
      setResult(next);
      if (!preflightOnly && next.sessionId) {
        await app.refreshSessions();
        await app.refreshWorkingFolders();
        main.openCatalogSession(next.sessionId);
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
        className="ui-dialog max-h-[calc(100vh-2rem)] w-full max-w-2xl overflow-y-auto p-5"
        onClick={(event) => event.stopPropagation()}
      >
        <h2 id="session-import-title" className="text-[length:var(--fs-title)] font-semibold text-ink">
          {t("Import a conversation")}
        </h2>
        <label className="mt-4 block text-sm font-medium text-ink">
          {t("Source")}
          <span className="mt-1 block">
            <MenuSelect
              ariaLabel={t("Source")}
              value={harness}
              disabled={busy}
              options={harnessOptions.map((info) => ({
                value: info.harness,
                label: harnessLabel(info.harness),
              }))}
              onChange={(value) => {
                setHarness(value as ImportableHarness);
                setSessions([]);
                setSourceId("");
                setQuery("");
                setWorkspaceOverride("");
                setResult(null);
                setProjectOverride("");
              }}
            />
          </span>
        </label>

        <label className="mt-3 block text-sm font-medium text-ink">
          {t("Search")}
          <input
            type="search"
            className="ui-field mt-1"
            placeholder={t("Title, main folder, or conversation text")}
            value={query}
            disabled={busy}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key !== "Escape" || event.nativeEvent.isComposing) return;
              event.preventDefault();
              event.stopPropagation();
              setQuery("");
            }}
          />
        </label>

        <label className="mt-3 block text-sm font-medium text-ink">
          {t("Conversation")}
          <select
            className="ui-field ui-listbox mt-1"
            size={8}
            value={sourceId}
            disabled={busy}
            onChange={(event) => {
              setSourceId(event.target.value);
              setWorkspaceOverride("");
              setResult(null);
              setProjectOverride("");
            }}
          >
            {workspaceGroups.length === 0 ? (
              <option value="">{t("No matching conversations")}</option>
            ) : ( workspaceGroups.map((group) => (
              <optgroup key={group.cwd || "no-folder"} label={group.label}>
                {group.sessions.map((session) => (
                  <option key={session.sourceId} value={session.sourceId}>
                    {harness !== "codex" && session.messageCount !== null && `${session.messageCount} messages · `}
                    {(session.name || session.preview || session.sourceSessionId).trim().replace(/\s+/g, " ").slice(0, 56)}
                  </option>
                ))}
              </optgroup>
            ))
            )}
          </select>
        </label>

        {selected ? (
          <div className="mt-2 space-y-1 text-xs text-text-muted">
            <p>
              {t("Updated {date}", { date: new Date(selected.updatedAt).toLocaleString() })}
            </p>
            <p className="break-all" data-tip={selected.cwd}>
              {t("Main folder: {cwd}", { cwd: selected.cwd || t("not recorded") })}
            </p>
          </div>
        ) : null}

        {selected?.repeat === "changed" ? (
          <p className="mt-2 text-sm text-ink">
            {t("This conversation has new activity. Import it as a separate copy.")}
          </p>
        ) : null}
        {selected?.repeat === "unchanged" ? (
          <p className="mt-2 text-sm text-ink">
            {t("This version has already been imported. You can import another copy.")}
          </p>
        ) : null}
        {selected && !result ? (
          <p className="mt-2 text-sm text-ink">
            {t("Use Import check to see whether this conversation can be imported and what will be kept.")}
          </p>
        ) : null}

        {selected && !selected.cwdAvailable ? (
          <div className="mt-3 rounded-md border border-warning/30 bg-warning/5 p-3 text-sm text-text-secondary">
            <p>{t("The original main folder is unavailable. Choose its current location to continue.")}</p>
            {workspaceOverride ? (
              <p className="mt-1 break-all text-xs text-text-muted">
                {t("Replacement: {path}", { path: workspaceOverride })}
              </p>
            ) : null}
            <Button
              variant="secondary"
              className="mt-2"
              disabled={busy}
              onClick={() => {
                const path = window.prompt(
                  t("Full path of the replacement main folder:"),
                  workspaceOverride,
                );
                if (!path?.trim()) return;
                setWorkspaceOverride(path.trim());
                setResult(null);
                setProjectOverride("");
              }}
            >
              {workspaceOverride ? t("Change folder…") : t("Choose replacement folder…")}
            </Button>
          </div>
        ) : null}

        {result?.status === "ready" ? (
          <div className="mt-4 text-sm">
            <p className="font-semibold text-ink">{t("Can be imported")}</p>
            {result.transformations?.length ? (
              <p className="mt-1 text-ink">
                {t("Some source records cannot be added directly to the context. You can ask the agent to look them up and read them.")}
              </p>
            ) : null}
            <ImportDetails items={result.transformations ?? []} />
            {(result.projectCandidates?.length ?? 0) > 1 ? (
              <label className="mt-3 block">
                {t("Destination project")}
                <MenuSelect
                  ariaLabel={t("Destination project")}
                  value={projectOverride || result.projectId || ""}
                  disabled={busy}
                  options={result.projectCandidates!.map((project) => ({
                    value: project.id,
                    label: `${project.name || folderLabel(project.primaryDir)} · ${project.primaryDir}`,
                  }))}
                  onChange={setProjectOverride}
                />
              </label>
            ) : result.workspacePrimaryDir ? (
              <p className="mt-3 text-text-secondary" data-tip={result.workspacePrimaryDir}>
                {t("Project: {name}", { name: result.projectCandidates?.[0]?.name || folderLabel(result.workspacePrimaryDir) })}
              </p>
            ) : null}
          </div>
        ) : null}
        {result?.status === "refused" ? (
          <div className="mt-4 rounded-md border border-danger/30 bg-danger/5 p-3 text-sm text-danger">
            <p>{t("Alt Theory cannot import this conversation safely yet.")}</p>
            <details className="mt-2">
              <summary className="cursor-pointer">{t("Technical reason")}</summary>
              <p className="mt-1">
                {result.count} {result.recordType} {t("record(s). {reason}", { reason: result.reason || "" })}
              </p>
            </details>
          </div>
        ) : null}
        {result && !["ready", "refused"].includes(result.status) ? (
          <p className="mt-4 text-sm text-text-secondary">
            {result.status === "unchanged"
              ? t("This exact source version is already imported.")
              : result.error || t("Import status: {status}", { status: result.status })}
          </p>
        ) : null}
        {error ? <p className="mt-4 text-sm text-danger">{error}</p> : null}

        <div className="mt-5 flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>{t("Cancel")}</Button>
          {alreadyImported ? (
            <Button
              variant="primary"
              onClick={() => {
                main.openCatalogSession(String(result.sessionId));
                onClose();
              }}
            >
              {t("Open imported conversation")}
            </Button>
          ) : canImport ? (
            <Button variant="primary" disabled={busy} onClick={() => void run(false)}>
              {busy ? t("Importing…") : t("Import and open")}
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
              {busy ? t("Checking…") : t("Import check")}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
