import { useMemo } from "react";
import type { SessionSummary } from "@/api/types";
import { useApp } from "@/context/AppProvider";
import { Button } from "@/components/ui/Button";
import { TextInput } from "@/components/ui/Field";
import { HintText, MonoText } from "@/components/ui/Typography";
import {
  fmtTime,
  formatCountLabel,
  formatProviderModel,
  shortId,
} from "@/lib/format";
import { isSimpleViewMode } from "@/lib/viewMode";
import { cn } from "@/lib/cn";

function sessionTitle(
  session: SessionSummary,
  displayNames: Record<string, { alias: string; snippet: string }>
): string {
  const cached = displayNames[session.sessionId];
  if (cached?.alias) return cached.alias;
  if (cached?.snippet) return cached.snippet;
  return shortId(session.sessionId);
}

function sessionMatchesSearch(
  session: SessionSummary,
  query: string,
  projectNames: Map<string, string>
): boolean {
  if (!query) return true;
  const haystack = [
    session.sessionId,
    session.rolePresetSlug,
    session.kbDomain,
    session.provider,
    session.model,
    projectNames.get(session.projectId || "") || session.projectId,
    session.status,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  return haystack.includes(query);
}

function compareSessionsByRecency(a: SessionSummary, b: SessionSummary): number {
  const aTime = new Date(a.updatedAt || a.createdAt || 0).getTime();
  const bTime = new Date(b.updatedAt || b.createdAt || 0).getTime();
  return bTime - aTime;
}

export function SessionBrowser() {
  const app = useApp();
  const isParticipant = isSimpleViewMode(app.viewMode);

  const projectNames = useMemo(
    () =>
      new Map(
        (app.discovery?.projects ?? []).map((project) => [
          project.projectId,
          project.displayName,
        ])
      ),
    [app.discovery?.projects]
  );

  const visibleSessions = useMemo(() => {
    const query = app.sessionSearch.trim().toLowerCase();
    return app.sessions
      .filter((session) => sessionMatchesSearch(session, query, projectNames))
      .sort(compareSessionsByRecency);
  }, [app.sessionSearch, app.sessions, projectNames]);

  // Children render indented under their live parent; a child whose parent
  // is filtered out (or deleted) falls back to a top-level row.
  const { topLevelSessions, childrenByParent } = useMemo(() => {
    const ids = new Set(visibleSessions.map((session) => session.sessionId));
    const children = new Map<string, SessionSummary[]>();
    const topLevel: SessionSummary[] = [];
    for (const session of visibleSessions) {
      const parentId = session.forkedFrom?.sessionId;
      if (parentId && ids.has(parentId)) {
        if (!children.has(parentId)) children.set(parentId, []);
        children.get(parentId)?.push(session);
      } else {
        topLevel.push(session);
      }
    }
    return { topLevelSessions: topLevel, childrenByParent: children };
  }, [visibleSessions]);

  const groupedSessions = useMemo(() => {
    if (isParticipant) return null;
    const groups = new Map<string, SessionSummary[]>();
    for (const session of topLevelSessions) {
      const projectId = session.projectId || "";
      if (!groups.has(projectId)) groups.set(projectId, []);
      groups.get(projectId)?.push(session);
    }
    return [...groups.entries()].sort(([a], [b]) => {
      if (!a) return 1;
      if (!b) return -1;
      return (projectNames.get(a) || a).localeCompare(projectNames.get(b) || b);
    });
  }, [isParticipant, projectNames, topLevelSessions]);

  const canInteract = app.sessionReady && app.wsConnected && !app.isRunning;

  const renderSessionWithChildren = (
    session: SessionSummary,
    participant: boolean
  ) => (
    <div key={session.sessionId} className="space-y-1">
      <SessionRow
        session={session}
        title={sessionTitle(session, app.sessionDisplayNames)}
        selected={app.selectedCatalogSessionId === session.sessionId}
        isParticipant={participant}
        onOpen={() => app.openCatalogSession(session.sessionId)}
      />
      {(childrenByParent.get(session.sessionId) ?? []).map((child) => (
        <div key={child.sessionId} className="pl-3">
          {renderSessionWithChildren(child, participant)}
        </div>
      ))}
    </div>
  );

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <Button
          variant="primary"
          className="flex-1"
          disabled={!canInteract}
          onClick={app.startNewSession}
        >
          + New
        </Button>
        <Button
          variant="secondary"
          disabled={!app.wsConnected}
          onClick={() => void app.refreshSessions()}
          title="Refresh sessions"
        >
          ↻
        </Button>
      </div>

      <TextInput
        type="search"
        placeholder="Search sessions"
        value={app.sessionSearch}
        onChange={(event) => app.setSessionSearch(event.target.value)}
        autoComplete="off"
      />

      <div className="max-h-56 space-y-1 overflow-auto rounded-md border border-hairline bg-surface p-1">
        {app.sessionsLoading ? (
          <HintText className="p-2">Loading sessions…</HintText>
        ) : app.sessionsError ? (
          <p className="p-2 text-[0.75rem] text-danger">{app.sessionsError}</p>
        ) : visibleSessions.length === 0 ? (
          <HintText className="p-2">No saved sessions.</HintText>
        ) : isParticipant ? (
          topLevelSessions.map((session) =>
            renderSessionWithChildren(session, true)
          )
        ) : (
          groupedSessions?.map(([projectId, items]) => (
            <section key={projectId || "unassigned"} className="space-y-1">
              <p className="px-2 pt-1 text-[0.6875rem] font-semibold uppercase tracking-wide text-text-muted">
                {projectId
                  ? projectNames.get(projectId) || projectId
                  : "Unassigned"}
              </p>
              {items.map((session) =>
                renderSessionWithChildren(session, false)
              )}
            </section>
          ))
        )}
      </div>

      <div className="flex gap-2">
        <Button
          variant="secondary"
          className="flex-1"
          disabled={!app.selectedSessionDetail?.session?.sessionId || !app.wsConnected}
          onClick={() => void app.renameSelectedSession()}
        >
          Rename
        </Button>
        <Button
          variant="secondary"
          className="flex-1 text-danger"
          disabled={!app.selectedSessionDetail?.session?.sessionId || !app.wsConnected}
          onClick={() => void app.deleteSelectedSession()}
        >
          Delete
        </Button>
      </div>

      {app.selectedSessionDetail && !isParticipant ? (
        <SessionDetail detail={app.selectedSessionDetail} projectNames={projectNames} />
      ) : null}
    </div>
  );
}

function SessionRow({
  session,
  title,
  selected,
  isParticipant,
  onOpen,
}: {
  session: SessionSummary;
  title: string;
  selected: boolean;
  isParticipant: boolean;
  onOpen: () => void;
}) {
  const time = fmtTime(session.updatedAt || session.createdAt);
  const turns = formatCountLabel(session.turnCount, "turn", "turns");
  const messages = formatCountLabel(session.messageCount, "msg", "msgs");
  const model = formatProviderModel(session);

  return (
    <button
      type="button"
      onClick={onOpen}
      className={cn(
        "w-full rounded-md border px-2 py-2 text-left transition-colors",
        selected
          ? "border-ink-soft bg-selected"
          : "border-transparent hover:bg-hover",
        session.visibility === "private" && "border-l-2 border-l-warning"
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <span
          className="truncate text-[0.8125rem] font-semibold text-ink"
          title={isParticipant ? undefined : session.sessionId}
        >
          {session.forkedFrom ? (
            <span className="mr-1 text-text-muted" aria-hidden>
              ⑂
            </span>
          ) : null}
          {title}
        </span>
        <span
          className={cn(
            "shrink-0 text-[0.6875rem] uppercase text-text-muted",
            session.warnings?.length ? "text-warning" : ""
          )}
        >
          {session.status}
        </span>
      </div>
      <MonoText className="mt-1 block text-[0.6875rem]">
        {[time, turns, messages, isParticipant ? "" : model]
          .filter(Boolean)
          .join(" · ")}
        {session.visibility === "private" ? " · Private" : ""}
      </MonoText>
    </button>
  );
}

function SessionDetail({
  detail,
  projectNames,
}: {
  detail: NonNullable<ReturnType<typeof useApp>["selectedSessionDetail"]>;
  projectNames: Map<string, string>;
}) {
  const session = detail.session;
  const rows: Array<[string, string]> = [
    ["Updated", fmtTime(session.updatedAt || session.createdAt)],
    ["Turns", String(session.turnCount ?? "—")],
    ["Messages", String(session.messageCount ?? "—")],
    [
      "Project",
      session.projectId
        ? projectNames.get(session.projectId) || session.projectId
        : "Unassigned",
    ],
    ["KB", session.kbDomain || "—"],
    ["Role", session.rolePresetSlug || "—"],
    ["Model", formatProviderModel(session) || "—"],
    ["ID", session.sessionId || "—"],
  ];

  const warnings = [
    ...(session.warnings || []),
    ...(detail.warnings || []),
  ].filter((value, index, array) => value && array.indexOf(value) === index);

  const preview = (detail.transcriptPreview || [])
    .slice(-4)
    .map((message) => {
      const text = (message.text || "").trim();
      if (!text) return "";
      return `${message.role}: ${text}`;
    })
    .filter(Boolean)
    .join("\n\n");

  return (
    <div className="space-y-2 rounded-md border border-hairline bg-card p-2">
      {rows.map(([label, value]) => (
        <div key={label} className="grid grid-cols-[5.5rem_1fr] gap-2 text-[0.75rem]">
          <span className="font-semibold text-text-secondary">{label}</span>
          <span className="truncate text-ink">{value}</span>
        </div>
      ))}
      {warnings.length > 0 ? (
        <p className="text-[0.75rem] text-warning">{warnings.join(" | ")}</p>
      ) : null}
      {preview ? (
        <pre className="whitespace-pre-wrap rounded-md bg-surface p-2 text-[0.6875rem] text-text-secondary">
          {preview}
        </pre>
      ) : null}
    </div>
  );
}