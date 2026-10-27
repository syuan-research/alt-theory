import { useEffect, useMemo, useRef, useState } from "react";
import type { ChangeGroup, FileChange } from "@/api/types";
import { fetchSessionChanges } from "@/api/session-files";
import { t } from "@/i18n";
import { useConversationContext } from "@/context/ConversationContext";
import { useShell } from "@/context/ShellContext";
import { useApp } from "@/context/AppProvider";
import { FilePreview } from "@/components/inspector/FilePreview";
import { FolderHead, ListTools, MenuButton } from "@/components/inspector/FolderList";
import { useContextMenu, type ContextMenuItem } from "@/components/shell/ContextMenu";
import { fileMenuItems } from "@/lib/fileMenu";
import { fmtTime } from "@/lib/format";
import { familyMembersOf, sessionTitle } from "@/lib/sessionList";
import { agentMatches, changeAuthors, changeSections, passesAgentFilter, type AgentFilter, type ChangeSort } from "@/lib/changeList";
import { CHANGES_KEPT_MAX } from "@/lib/limits";
import { paneMemory, usePaneMemory } from "@/lib/paneMemory";
import { targetKey } from "@/lib/viewTarget";
import { useFindTarget } from "@/lib/find";
import type { PreviewMode } from "@/lib/fileContent";
import { fileQueryScore, parseFileQuery } from "../../../../shared/quick-find";

/**
 * Files the conversation family changed (M7 §2; card 7). The default order
 * groups the way prototype D does — each project folder is one group,
 * everything outside groups by containing folder under the depth cap — with
 * the newest change first in each group; time, agent and name orders and an
 * agent filter sit above (issue 2026-10-12). A new file opens in Rendered
 * when available; the viewer control follows the file type.
 */
/** Conversations holding loaded diffs, oldest first: a remount shows its
 *  last list at once (the fetch refreshes it), and diffs can be large. */
const changesKept: string[] = [];
function keepChanges(sessionId: string) {
  const at = changesKept.indexOf(sessionId);
  if (at >= 0) changesKept.splice(at, 1);
  changesKept.push(sessionId);
  while (changesKept.length > CHANGES_KEPT_MAX) {
    paneMemory.delete(`${changesKept.shift()}:changes:groups`);
  }
}

/** While a family member runs, its writes land between turn ends: re-read this often. */
const RUNNING_REFRESH_MS = 10_000;

export function ChangesPanel() {
  const app = useApp();
  const conv = useConversationContext();
  const shell = useShell();
  const menu = useContextMenu();

  // While a change is open the panel is its conversation's (the center may
  // have moved on); otherwise the center conversation's list.
  const changeTarget = shell.target?.kind === "change" ? shell.target : null;
  const sessionId = changeTarget?.sessionId ?? conv.sessionId;
  const runCount = conv.runSettledCount;
  const [closed, setClosed] = usePaneMemory<string[]>(`${sessionId}:changes:closed`, []);
  const [mode, setMode] = usePaneMemory<PreviewMode>(
    `${sessionId}:changes:${changeTarget ? targetKey(changeTarget) : ""}:mode`,
    "rendered",
  );
  const [groups, setGroups] = usePaneMemory<ChangeGroup[] | null>(`${sessionId}:changes:groups`, null);
  const [error, setError] = usePaneMemory<string | null>(`${sessionId}:changes:error`, null);
  // The same always-visible filter as Files (owner 2026-09-24: lists of
  // things to open filter; opened content gets the Ctrl+F find bar).
  const [query, setQuery] = usePaneMemory(`${sessionId}:changes:query`, "");
  const [toolsOpen, setToolsOpen] = usePaneMemory("changes:toolsOpen", true);
  const [showDetails, setShowDetails] = usePaneMemory("changes:details", true);
  const [sort, setSort] = usePaneMemory<ChangeSort>(`${sessionId}:changes:sort`, "folder");
  const [agentFilter, setAgentFilter] = usePaneMemory<AgentFilter>(`${sessionId}:changes:agents`, { kind: "all" });
  // The family's activity: a member's turn ending (or starting) re-reads the
  // list — subagents run in the background, past the center's own turn end.
  const self = app.sessions.find((s) => s.sessionId === sessionId) ?? null;
  const family = useMemo(() => (self ? familyMembersOf(self, app.sessions) : []), [self, app.sessions]);
  const running = useMemo(
    () => new Set(family.filter((s) => s.runStatus === "running" || s.runStatus === "awaiting-approval").map((s) => s.sessionId)),
    [family],
  );
  const familyActivity = family.map((s) => `${s.sessionId}:${s.runStatus ?? ""}:${s.updatedAt ?? ""}`).join(",");
  const [poll, setPoll] = useState(0);
  useEffect(() => {
    if (running.size === 0) return;
    const timer = window.setInterval(() => setPoll((n) => n + 1), RUNNING_REFRESH_MS);
    return () => window.clearInterval(timer);
  }, [running.size, setPoll]);
  const filterRef = useRef<HTMLDivElement>(null);
  useFindTarget(filterRef, {
    focus: () => {
      const input = filterRef.current?.querySelector("input");
      input?.focus();
      input?.select();
    },
  });

  useEffect(() => {
    if (!sessionId) {
      setGroups([]);
      return;
    }
    let cancelled = false;
    fetchSessionChanges(sessionId)
      .then((res) => {
        if (cancelled) return;
        setGroups(res.groups);
        setError(null);
        keepChanges(sessionId);
      })
      .catch((e) => !cancelled && setError(e?.message ?? "Failed to load changes"));
    return () => {
      cancelled = true;
    };
  }, [sessionId, runCount, familyActivity, poll]);

  // The open file is the view's change target — set here, by the turn-end
  // card in the conversation, or restored by the shell after a collapse —
  // so the drill-in survives a remount.
  const selected = changeTarget
    ? (groups
        ?.flatMap((group) => group.files)
        .find((file) => file.resolvedPath === changeTarget.path || file.path === changeTarget.path) ?? null)
    : null;

  if (selected) {
    return (
      <FilePreview
        sessionId={sessionId}
        path={selected.displayPath}
        fileRef={selected.contentRef ?? null}
        diff={selected.diff}
        mode={mode}
        onModeChange={setMode}
      />
    );
  }

  if (error) return <div className="rp-empty">{error}</div>;
  if (!groups) return <div className="rp-empty">{t("Loading…")}</div>;
  if (groups.length === 0) {
    return <div className="rp-empty">{t("No file changes in this conversation yet.")}</div>;
  }

  const fileItems = (file: FileChange): ContextMenuItem[] => fileMenuItems(
    file.resolvedPath, file.contentRef ? () => shell.revealWorkspacePath(file.resolvedPath) : undefined,
  );
  const nameOf = (id: string) => {
    const member = family.find((s) => s.sessionId === id);
    return member ? sessionTitle(member, app.sessionDisplayNames, app.sessions) : id.slice(0, 8);
  };
  const authors = changeAuthors(groups);
  // Who changed a file only says something when more than one member did.
  const showAuthors = authors.length > 1;
  const agentFilterLabel =
    agentFilter.kind === "current" ? t("This conversation")
      : agentFilter.kind === "running" ? t("Running agents")
        : agentFilter.kind === "agents"
          ? agentFilter.ids.length === 1 ? nameOf(agentFilter.ids[0]) : t("{count} agents", { count: agentFilter.ids.length })
          : t("All agents");
  const pickAgent = (id: string) => setAgentFilter((prev) => {
    const ids = prev.kind === "agents" ? prev.ids : [];
    const next = ids.includes(id) ? ids.filter((item) => item !== id) : [...ids, id];
    return next.length ? { kind: "agents", ids: next } : { kind: "all" };
  });
  const sortLabels: Record<ChangeSort, string> = {
    folder: t("Folder"), time: t("Changed"), agent: t("Agent"), name: t("Name"),
  };
  const sortMenuLabels: Record<ChangeSort, string> = {
    folder: t("By folder"), time: t("Recently changed"), agent: t("By agent"), name: t("Name"),
  };
  const sortTips: Record<ChangeSort, string> = {
    folder: t("Sort by folder"), time: t("Sort by most recent change"),
    agent: t("Sort by agent"), name: t("Sort by name"),
  };
  const controls = (
    <>
      <MenuButton
        icon="ph-sort-ascending"
        label={sortLabels[sort]}
        tip={sortTips[sort]}
        choices={(Object.keys(sortLabels) as ChangeSort[]).map((key) => ({
          label: sortMenuLabels[key], on: sort === key, onSelect: () => setSort(key),
        }))}
      />
      {/* Also while a filter is on: an author gone since must not leave it stuck. */}
      {showAuthors || agentFilter.kind !== "all" ? (
        <MenuButton
          icon="ph-funnel"
          label={agentFilterLabel}
          active={agentFilter.kind !== "all"}
          choices={[
            { label: t("All agents"), on: agentFilter.kind === "all", onSelect: () => setAgentFilter({ kind: "all" }) },
            { label: t("This conversation"), on: agentFilter.kind === "current", onSelect: () => setAgentFilter({ kind: "current" }) },
            { label: t("Running agents"), on: agentFilter.kind === "running", onSelect: () => setAgentFilter({ kind: "running" }) },
            ...authors.map(({ id, count }, index) => ({
              label: `${running.has(id) ? "● " : ""}${nameOf(id)} · ${count}`,
              on: agentFilter.kind === "agents" && agentFilter.ids.includes(id),
              separator: index === 0,
              onSelect: () => pickAgent(id),
            })),
          ]}
        />
      ) : null}
    </>
  );
  const roleText = (group: ChangeGroup) =>
    group.role === "primary" ? t("Main folder") : group.role === "companion" ? t("Companion folder") : t("Outside");
  const normalizedQuery = query.trim();
  const fileQuery = parseFileQuery(normalizedQuery);
  const agentContext = { currentId: sessionId, running };
  const shown = changeSections(
    groups,
    sort,
    (file) =>
      passesAgentFilter(file, agentFilter, agentContext) &&
      (!normalizedQuery || fileQueryScore(
        fileQuery, file.displayPath.split(/[\\/]/).at(-1) ?? "", file.resolvedPath,
      ) > 0),
    (id) => agentMatches(id, agentFilter, agentContext),
  );
  const filtered = Boolean(normalizedQuery) || agentFilter.kind !== "all";
  const toggle = (path: string) =>
    setClosed((prev) => (prev.includes(path) ? prev.filter((item) => item !== path) : [...prev, path]));

  return (
    <div onKeyDown={(event) => {
      if (event.key !== "Escape" || event.nativeEvent.isComposing || !query.trim()) return;
      event.preventDefault();
      event.stopPropagation();
      setQuery("");
    }}>
      <ListTools
        filterRef={filterRef}
        query={query}
        onQuery={setQuery}
        onEscape={() => setQuery("")}
        placeholder={t("Filter files")}
        controls={controls}
        endControls={
          <button
            type="button"
            className={`fcard${showDetails ? " on" : ""}`}
            aria-pressed={showDetails}
            data-tip={t("Show folder and editor details")}
            onClick={() => setShowDetails((shown) => !shown)}
          >
            <i className="ph ph-list-dashes" aria-hidden="true" />
            <span className="details-label">{t("Details")}</span>
          </button>
        }
        toolsOpen={toolsOpen}
        onToggleTools={() => setToolsOpen((open) => !open)}
        {...(sort === "folder" || sort === "agent"
          ? {
              onExpandAll: () => setClosed([]),
              onCollapseAll: () => setClosed(shown.map((section) => section.group?.path ?? section.key)),
            }
          : {})}
      />
      {filtered && shown.length === 0 ? (
        <div className="rp-empty">{t("No matching files.")}</div>
      ) : null}
      {shown.map((section) => {
        const { group, agentId } = section;
        const foldKey = group?.path ?? section.key;
        // Filtering shows matches even inside a collapsed group.
        const isClosed = !normalizedQuery && closed.includes(foldKey);
        return (
          <div key={section.key} className="changes-group">
            {group ? (
              <FolderHead
                path={group.title}
                role={roleText(group)}
                showMeta={showDetails}
                closed={isClosed}
                onToggle={() => toggle(foldKey)}
              />
            ) : agentId ? (
              <button type="button" className="sect-head" onClick={() => toggle(foldKey)}>
                <i className={`ph ph-caret-${isClosed ? "right" : "down"}`} />
                {running.has(agentId) ? <span className="dot" /> : null}
                {nameOf(agentId)}
                <span className="n">{section.files.length}</span>
              </button>
            ) : null}
            {isClosed
              ? null
              : section.files.map((file) => (
                  <button
                    key={file.resolvedPath}
                    className="file-item"
                    onContextMenu={(event) => menu.open(event, fileItems(file))}
                    onKeyDown={(event) => {
                      if (event.key !== "ContextMenu" && !(event.shiftKey && event.key === "F10")) return;
                      event.preventDefault();
                      const rect = event.currentTarget.getBoundingClientRect();
                      menu.openAt(rect.left + 18, rect.bottom, fileItems(file), event.currentTarget);
                    }}
                    onClick={() => {
                      if (!sessionId) return;
                      shell.openTarget({ kind: "change", sessionId, path: file.resolvedPath, title: file.displayPath });
                    }}
                  >
                    <i className="ph ph-file-text" />
                    {/* The name wraps in full; who wrote it sits on its own line under it. */}
                    <span className="change-name" data-tip={file.touchedAt ? `${file.resolvedPath} · ${fmtTime(file.touchedAt)}` : file.resolvedPath}>
                      <span className="s-title">{file.displayPath}</span>
                      {showDetails && showAuthors && !agentId ? (
                        <span className="change-authors">
                          {file.sessionIds.map((id) => (
                            <span key={id} className={`change-author${id === sessionId ? " own" : ""}`}>{nameOf(id)}</span>
                          ))}
                        </span>
                      ) : null}
                    </span>
                    <span className="delta">
                      {file.added ? `+${file.added}` : ""}
                      {file.added && file.removed ? " " : ""}
                      {file.removed ? `-${file.removed}` : ""}
                    </span>
                  </button>
                ))}
            {!isClosed && group?.capped ? (
              <div className="wb-note">{t("Deeper folders are grouped here.")}</div>
            ) : null}
          </div>
        );
      })}
      <div className="wb-note">{t("Files directly edited by agents are shown here.")}</div>
      {menu.element}
    </div>
  );
}
