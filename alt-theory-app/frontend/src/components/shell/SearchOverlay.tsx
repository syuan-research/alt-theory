import { useEffect, useMemo, useState } from "react";
import { useApp } from "@/context/AppProvider";
import { useShell } from "@/context/ShellContext";
import { isListMember, matchesQuery, sessionTitle } from "@/lib/sessionList";

export function SearchOverlay() {
  const app = useApp();
  const shell = useShell();
  const [query, setQuery] = useState("");

  useEffect(() => {
    if (!shell.searchOpen) setQuery("");
  }, [shell.searchOpen]);

  useEffect(() => {
    if (!shell.searchOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") shell.setSearchOpen(false);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [shell.searchOpen, shell]);

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    return app.sessions
      .filter(isListMember)
      .map((s) => ({ session: s, title: sessionTitle(s, app.sessionDisplayNames) }))
      .filter(({ session, title }) => matchesQuery(session, q, title))
      .slice(0, 12);
  }, [app.sessions, app.sessionDisplayNames, query]);

  if (!shell.searchOpen) return null;

  return (
    <div
      className="search-overlay on"
      onClick={(e) => {
        if (e.target === e.currentTarget) shell.setSearchOpen(false);
      }}
    >
      <div className="search-box">
        <input
          autoFocus
          placeholder="Search conversations"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        {query.trim() ? (
          <div className="s-results">
            {results.length === 0 ? (
              <div className="recent">No matches.</div>
            ) : (
              results.map(({ session, title }) => (
                <button
                  key={session.sessionId}
                  className="s-result"
                  onClick={() => {
                    shell.openApp();
                    app.openCatalogSession(session.sessionId);
                    shell.setSearchOpen(false);
                  }}
                >
                  <i className="ph ph-chat-circle" />
                  <span className="s-title">{title}</span>
                </button>
              ))
            )}
          </div>
        ) : (
          <div className="recent">Type to search your conversations.</div>
        )}
      </div>
    </div>
  );
}
