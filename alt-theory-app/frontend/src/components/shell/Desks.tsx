import { useMemo, useRef, useState, useSyncExternalStore, type MouseEvent as ReactMouseEvent } from "react";
import { t } from "@/i18n";
import { useApp } from "@/context/AppProvider";
import { useMainView } from "@/context/MainView";
import { useShell } from "@/context/ShellContext";
import { folderLabel, sessionTitle } from "@/lib/sessionList";
import { useContextMenu, type ContextMenuItem } from "@/components/shell/ContextMenu";

/**
 * Desks (工作位, owner 2026-11-26): shown in the left list, as a card on the
 * composer's deck, or both — never neither, so they can always be found
 * again. The left block folds upward into a row of dots, one per desk.
 */

export const DESK_ICON = "ph-browsers";

type Place = "left" | "deck";
const PLACES_KEY = "alt-desk-places";
const FOLD_KEY = "alt-desks-folded";

function readPlaces(): Place[] {
  try {
    const value: unknown = JSON.parse(window.localStorage.getItem(PLACES_KEY) ?? "null");
    if (Array.isArray(value) && value.length && value.every((p) => p === "left" || p === "deck")) return value as Place[];
  } catch { /* fall back */ }
  return ["left"];
}
let places = readPlaces();
const placeListeners = new Set<() => void>();
const subscribePlaces = (listener: () => void) => { placeListeners.add(listener); return () => { placeListeners.delete(listener); }; };

export function useDeskPlaces(): Place[] {
  return useSyncExternalStore(subscribePlaces, () => places);
}

function togglePlace(place: Place) {
  const next = places.includes(place) ? places.filter((p) => p !== place) : [...places, place];
  if (!next.length) return;
  places = next;
  try { window.localStorage.setItem(PLACES_KEY, JSON.stringify(next)); } catch { /* per-device convenience */ }
  placeListeners.forEach((listener) => listener());
}

/** The desks with what each shows: its conversation's title and where it lives. */
export function useDeskRows() {
  const app = useApp();
  const main = useMainView();
  return useMemo(() => {
    const byId = new Map(app.sessions.map((session) => [session.sessionId, session]));
    const projectByDir = new Map(app.projects.map((project) => [project.primaryDir, project]));
    return main.workspaces.map((desk) => {
      const summary = desk.sessionId ? byId.get(desk.sessionId) : undefined;
      const dir = summary?.workspacePrimaryDir;
      return {
        id: desk.id,
        active: desk.active,
        title: summary ? sessionTitle(summary, app.sessionDisplayNames, app.sessions) : t("New conversation"),
        place: dir ? projectByDir.get(dir)?.name ?? folderLabel(dir) : t("Standalone"),
      };
    });
  }, [app.sessions, app.projects, app.sessionDisplayNames, main.workspaces]);
}

/** Right-click on desks anywhere: where they show, and (in the left list) fold. */
function useDeskMenu(fold?: { folded: boolean; toggle: () => void }) {
  const menu = useContextMenu();
  const shown = useDeskPlaces();
  const item = (place: Place, label: string): ContextMenuItem => {
    const on = shown.includes(place);
    return { label, icon: on ? "ph-check" : "menu-blank", disabled: on && shown.length === 1, onSelect: () => togglePlace(place) };
  };
  const open = (event: ReactMouseEvent) => menu.open(event, [
    item("left", t("Show in the list")),
    item("deck", t("Show on the composer")),
    ...(fold ? [{ label: fold.folded ? t("Unfold") : t("Fold"), icon: fold.folded ? "ph-caret-down" : "ph-caret-up", separator: true, onSelect: fold.toggle }] : []),
  ]);
  return { open, element: menu.element };
}

/** The left list's desks block. */
export function DesksBlock() {
  const main = useMainView();
  const shell = useShell();
  const rows = useDeskRows();
  const [folded, setFoldedState] = useState(() => { try { return window.localStorage.getItem(FOLD_KEY) === "1"; } catch { return false; } });
  const setFolded = (next: boolean) => {
    setFoldedState(next);
    try { window.localStorage.setItem(FOLD_KEY, next ? "1" : "0"); } catch { /* per-device convenience */ }
  };
  const toggle = () => setFolded(!folded);
  const menu = useDeskMenu({ folded, toggle });
  const drag = useRef<number | null>(null);
  const open = (id: number) => { shell.openApp(); main.switchWorkspace(id); };

  return (
    <div className="workspaces-pinned" onContextMenu={menu.open}>
      <div className={`workspaces-box${folded ? " folded" : ""}`}>
        {folded ? (
          <div className="desk-strip" onClick={(event) => { if (event.target === event.currentTarget) setFolded(false); }}>
            <i className={`ph ${DESK_ICON} section-icon`} aria-hidden="true" />
            {rows.map((row) => (
              <button
                key={row.id}
                type="button"
                className={`desk-dot${row.active ? " on" : ""}`}
                aria-label={row.title}
                aria-current={row.active || undefined}
                data-tip={`${row.title} · ${row.place}`}
                onClick={() => open(row.id)}
              />
            ))}
            <span className="ws-count">{rows.length}</span>
          </div>
        ) : (
          <>
            <div className="workspace-list-head"><span className="workspace-list-title"><i className={`ph ${DESK_ICON} section-icon`} aria-hidden="true" /><span className="lbl">{t("Desks")}</span></span><span className="ws-count">{rows.length}</span></div>
            {rows.map((row) => (
              <div className="session-row workspace-row" key={row.id}>
                <button type="button" className={`sess${row.active ? " active" : ""}`} data-tip={`${row.title} · ${row.place}`} onClick={() => open(row.id)}>
                  <span className="s-title">{row.title}</span>
                  <span className="workspace-place">{row.place}</span>
                </button>
                <button type="button" className="workspace-close" aria-label={t("Close desk")} data-tip={t("Close desk")} onClick={() => main.closeWorkspace(row.id)}>
                  <i className="ph ph-x" aria-hidden="true" />
                </button>
              </div>
            ))}
          </>
        )}
        {/* The grabber: the composer deck's handle turned on its side. Click, or drag up to fold / down to unfold. */}
        <span
          className="desk-grab"
          role="button"
          tabIndex={0}
          aria-label={folded ? t("Unfold") : t("Fold")}
          aria-expanded={!folded}
          data-tip={folded ? t("Unfold") : t("Fold")}
          onPointerDown={(event) => { drag.current = event.clientY; event.currentTarget.setPointerCapture(event.pointerId); }}
          onPointerUp={(event) => {
            const from = drag.current;
            drag.current = null;
            if (from === null) return;
            const dy = event.clientY - from;
            if (Math.abs(dy) < 4) toggle();
            else if (dy < -8) setFolded(true);
            else if (dy > 8) setFolded(false);
          }}
          onPointerCancel={() => { drag.current = null; }}
          onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); toggle(); } }}
        />
      </div>
      {menu.element}
    </div>
  );
}

/** The desks card's contents on the composer deck: one chip per desk. */
export function DeskChips({ chipsRef }: { chipsRef?: React.Ref<HTMLDivElement> }) {
  const main = useMainView();
  const shell = useShell();
  const rows = useDeskRows();
  const menu = useDeskMenu();
  return (
    <>
      <span className="steer-lead desk-lead" data-tip={t("Desks")} onContextMenu={menu.open}>
        <i className={`ph ${DESK_ICON}`} aria-hidden="true" />
      </span>
      <div className="steer-chips desk-chips" ref={chipsRef} onContextMenu={menu.open}>
        {rows.map((row) => (
          <button
            key={row.id}
            type="button"
            className={`steer-chip desk-chip${row.active ? " on" : ""}`}
            aria-current={row.active || undefined}
            data-tip={`${row.title} · ${row.place}`}
            onClick={() => { shell.openApp(); main.switchWorkspace(row.id); }}
          >
            <span className="steer-label">{row.title}</span>
          </button>
        ))}
      </div>
      {menu.element}
    </>
  );
}
