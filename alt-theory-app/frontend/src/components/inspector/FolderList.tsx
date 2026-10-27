import type { ReactNode, RefObject } from "react";
import { t } from "@/i18n";
import { hasNativeBridge, revealPath } from "@/lib/native";
import { useContextMenu, type ContextMenuItem } from "@/components/shell/ContextMenu";

/**
 * Shared chrome for the right pane's folder lists, Changes and Files (owner
 * 2026-09-24): one always-visible filter with a disclosure for the default-
 * expanded tool row. Each folder header has name + quiet role on the first
 * line (click folds the folder), the full path on the second (click reveals
 * it in the file manager). `controls` (sort / filter menus) sit on the left
 * of the Expand / Collapse row.
 */
export function ListTools({
  filterRef,
  query,
  onQuery,
  onEscape,
  onBack,
  onClear,
  placeholder,
  onExpandAll,
  onCollapseAll,
  controls,
  endControls,
  toolsOpen,
  onToggleTools,
}: {
  filterRef: RefObject<HTMLDivElement | null>;
  query: string;
  onQuery: (query: string) => void;
  onEscape?: () => void;
  onBack?: () => void;
  onClear?: () => void;
  placeholder: string;
  /** Omitted when there is nothing to fold. */
  onExpandAll?: () => void;
  onCollapseAll?: () => void;
  controls?: ReactNode;
  endControls?: ReactNode;
  toolsOpen?: boolean;
  onToggleTools?: () => void;
}) {
  return (
    <>
      <div className={`files-tools-search-row${onBack ? " browsing" : ""}`}>
        <div className={`files-search${onBack ? " browsing" : ""}`} ref={filterRef}>
          <i className="ph ph-magnifying-glass" aria-hidden="true" />
          <input
            type="search"
            value={query}
            placeholder={placeholder}
            aria-label={placeholder}
            onFocus={() => onBack?.()}
            onChange={(event) => onQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key !== "Escape" || event.nativeEvent.isComposing) return;
              event.preventDefault();
              event.stopPropagation();
              onEscape?.();
            }}
          />
          {onBack ? <button type="button" className="files-search-action" aria-label={t("Back to search results")} data-tip={t("Back to search results")} onClick={onBack}><i className="ph ph-arrow-left" aria-hidden="true" /></button> : null}
          {query ? <button type="button" className="files-search-action" aria-label={t("Clear")} data-tip={t("Clear")} onClick={() => onClear ? onClear() : onQuery("")}><i className="ph ph-x" aria-hidden="true" /></button> : null}
        </div>
        {onToggleTools ? (
          <button
            type="button"
            className="files-tools-toggle"
            aria-label={t("Sort and filter")}
            data-tip={t("Sort and filter")}
            aria-expanded={toolsOpen}
            onClick={onToggleTools}
          >
            <i className={`ph ph-caret-${toolsOpen ? "up" : "down"}`} aria-hidden="true" />
          </button>
        ) : null}
      </div>
      {(toolsOpen ?? true) && (controls || (onExpandAll && onCollapseAll)) ? (
        <div className="files-tree-toolbar">
          {controls}
          <span className="fspacer" />
          {endControls}
          {onExpandAll && onCollapseAll ? (
            <>
              <button type="button" className="flat" aria-label={t("Expand all")} data-tip={t("Expand all")} onClick={onExpandAll}>
                <i className="ph ph-arrows-out-line-vertical" aria-hidden="true" />
                <span className="batch-label">{t("Expand all")}</span>
              </button>
              <button type="button" className="flat" aria-label={t("Collapse all")} data-tip={t("Collapse all")} onClick={onCollapseAll}>
                <i className="ph ph-arrows-in-line-vertical" aria-hidden="true" />
                <span className="batch-label">{t("Collapse all")}</span>
              </button>
            </>
          ) : null}
        </div>
      ) : null}
    </>
  );
}

export function FolderHead({
  name: nameOverride,
  path,
  role,
  closed = false,
  onToggle,
  available = true,
  showMeta = true,
}: {
  /** Shown instead of the path's last segment (a conversation's title). */
  name?: string;
  /** Full folder path; the name is its last segment. */
  path: string;
  role: string;
  closed?: boolean;
  /** Omitted when the folder has nothing under it to fold. */
  onToggle?: () => void;
  /** False = the folder is missing on this device: path shown, not revealable. */
  available?: boolean;
  /** False hides the role and path while keeping the structural folder title. */
  showMeta?: boolean;
}) {
  const name = nameOverride ?? path.split(/[\\/]/).filter(Boolean).at(-1) ?? path;
  const head = (
    <>
      <i className="ph ph-folder" aria-hidden="true" />
      <span className="group-name">{name}</span>
      {showMeta ? <span className="folder-head-role">{role}</span> : null}
      {onToggle ? <i className="ph ph-caret-down tw" aria-hidden="true" /> : null}
    </>
  );
  return (
    <div className="folder-head">
      {onToggle ? (
        <button
          type="button"
          className={`group-label folder-head-title${closed ? " closed" : ""}`}
          aria-expanded={!closed}
          onClick={onToggle}
        >
          {head}
        </button>
      ) : (
        <div className="group-label folder-head-title">{head}</div>
      )}
      {showMeta && available && hasNativeBridge() ? (
        <button
          type="button"
          className="folder-head-path"
          data-tip={t("Show in file manager")}
          onClick={() => void revealPath(path)}
        >
          {path}
        </button>
      ) : showMeta ? (
        <div className="folder-head-path" data-tip={path}>{path}</div>
      ) : null}
    </div>
  );
}

/** One choice of a list menu; `on` draws the check. */
export interface MenuChoice {
  label: string;
  on: boolean;
  separator?: boolean;
  onSelect: () => void;
}

/**
 * A sort or filter control of the right pane's lists: a small card that
 * opens its choices under itself. `active` marks a filter that hides rows.
 */
export function MenuButton({ icon, label, tip, active = false, choices }: {
  icon: string;
  label: string;
  tip?: string;
  active?: boolean;
  choices: MenuChoice[];
}) {
  const menu = useContextMenu();
  const items: ContextMenuItem[] = choices.map((choice) => ({
    label: choice.label,
    icon: choice.on ? "ph-check" : "menu-blank",
    separator: choice.separator,
    onSelect: choice.onSelect,
  }));
  return (
    <>
      <button
        type="button"
        className={`fcard${active ? " on" : ""}`}
        aria-haspopup="menu"
        data-tip={tip}
        onClick={(event) => {
          const rect = event.currentTarget.getBoundingClientRect();
          menu.openAt(rect.left, rect.bottom + 4, items, event.currentTarget);
        }}
      >
        <i className={`ph ${icon}`} aria-hidden="true" />
        {label}
      </button>
      {menu.element}
    </>
  );
}
