import { Composer } from "@/components/conversation/Composer";
import { MessageList } from "@/components/conversation/MessageList";
import { Button } from "@/components/ui/Button";
import { useApp } from "@/context/AppProvider";
import { shortId } from "@/lib/format";

/**
 * Lineage bar for the multi-conversation slice (M5/M7): shows when the
 * active conversation is a branch, jumps back to its main conversation,
 * lists its own branches, and starts a new branch. Floor version — the
 * presentation hierarchy is an open design pass (see round-2 observations B1).
 */
function ConversationLineageBar() {
  const app = useApp();
  const active = app.sessions.find(
    (session) => session.sessionId === app.sessionId
  );
  const children = app.sessions.filter(
    (session) =>
      session.forkedFrom?.sessionId === app.sessionId && !session.deletedAt
  );
  if (!active && children.length === 0) return null;

  const title = (sessionId: string) =>
    app.sessionDisplayNames[sessionId]?.alias ||
    app.sessionDisplayNames[sessionId]?.snippet ||
    shortId(sessionId);
  const canSwitch = app.wsConnected && !app.isRunning;

  return (
    <div className="flex flex-wrap items-center gap-2 border-b border-hairline bg-surface px-3 py-1.5 text-[0.75rem] text-text-secondary">
      {active?.forkedFrom ? (
        <>
          <span aria-hidden>⑂</span>
          <span>
            Branch of{" "}
            <button
              type="button"
              className="font-semibold text-ink underline-offset-2 hover:underline disabled:opacity-50"
              disabled={!canSwitch}
              onClick={() => app.openCatalogSession(active.forkedFrom!.sessionId)}
              title="Back to the main conversation"
            >
              {title(active.forkedFrom.sessionId)}
            </button>
          </span>
        </>
      ) : (
        <span>Main conversation</span>
      )}
      {children.length > 0 ? (
        <span className="flex flex-wrap items-center gap-1">
          · branches:
          {children.map((child) => (
            <button
              key={child.sessionId}
              type="button"
              className="rounded border border-hairline px-1.5 py-0.5 text-ink hover:bg-hover disabled:opacity-50"
              disabled={!canSwitch || !child.hasSessionFile}
              onClick={() => app.openCatalogSession(child.sessionId)}
            >
              ⑂ {title(child.sessionId)}
            </button>
          ))}
        </span>
      ) : null}
      <Button
        variant="secondary"
        className="ml-auto px-2 py-0.5 text-[0.75rem]"
        disabled={!canSwitch || !app.sessionId}
        onClick={() => app.forkCurrentSession("collaboration")}
        title="Branch this conversation into a side conversation; this one stays as it is"
      >
        ⑂ Branch
      </Button>
    </div>
  );
}

export function ConversationPanel() {
  return (
    <section className="flex h-full min-h-0 flex-col bg-canvas">
      <ConversationLineageBar />
      <MessageList />
      <Composer />
    </section>
  );
}
