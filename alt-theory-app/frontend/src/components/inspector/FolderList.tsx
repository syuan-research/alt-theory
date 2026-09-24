import type { RefObject } from "react";
import { t } from "@/i18n";
import { hasNativeBridge, revealPath } from "@/lib/native";

/**
 * Shared chrome for the right pane's folder lists, Changes and Files (owner
 * 2026-09-24): one always-visible filter plus Expand all / Collapse all on
 * top, and one folder header — name + quiet role on the first line (click
 * folds the folder), the full path on the second (click reveals it in the
 * file manager).
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
}) {
  return (
    <>
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
      {onExpandAll && onCollapseAll ? (
        <div className="files-tree-toolbar">
          <button className="flat" onClick={onExpandAll}>
            <i className="ph ph-arrows-out-line-vertical" aria-hidden="true" />
            {t("Expand all")}
          </button>
          <button className="flat" onClick={onCollapseAll}>
            <i className="ph ph-arrows-in-line-vertical" aria-hidden="true" />
            {t("Collapse all")}
          </button>
        </div>
      ) : null}
    </>
  );
}

export function FolderHead({
  path,
  role,
  closed = false,
  onToggle,
  available = true,
}: {
  /** Full folder path; the name is its last segment. */
  path: string;
  role: string;
  closed?: boolean;
  /** Omitted when the folder has nothing under it to fold. */
  onToggle?: () => void;
  /** False = the folder is missing on this device: path shown, not revealable. */
  available?: boolean;
}) {
  const name = path.split(/[\\/]/).filter(Boolean).at(-1) ?? path;
  const head = (
    <>
      <i className="ph ph-folder" aria-hidden="true" />
      <span className="group-name">{name}</span>
      <span className="folder-head-role">{role}</span>
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
      {available && hasNativeBridge() ? (
        <button
          type="button"
          className="folder-head-path"
          data-tip={t("Show in file manager")}
          onClick={() => void revealPath(path)}
        >
          {path}
        </button>
      ) : (
        <div className="folder-head-path" data-tip={path}>{path}</div>
      )}
    </div>
  );
}
