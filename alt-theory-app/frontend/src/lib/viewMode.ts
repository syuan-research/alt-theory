import type { AuthContext, TranscriptView, ViewMode } from "@/api/types";

export function viewModeForRole(
  role: AuthContext["role"],
  appMode: "local" | "hosted"
): ViewMode {
  if (appMode === "local") return "local";
  if (role === "participant") return "participant";
  if (role === "researcher" || role === "admin") return "researcher";
  return "researcher";
}

export function isSimpleViewMode(viewMode: ViewMode): boolean {
  return viewMode === "participant" || viewMode === "local";
}

export function defaultTranscriptView(viewMode: ViewMode): TranscriptView {
  return isSimpleViewMode(viewMode) ? "user" : "developer";
}

export function showAdvancedConfig(viewMode: ViewMode): boolean {
  return !isSimpleViewMode(viewMode);
}

export const DEBUG_STORAGE_KEY = "alt-theory-debug-expanded";

export function readDebugExpanded(): boolean {
  try {
    return localStorage.getItem(DEBUG_STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}

export function writeDebugExpanded(expanded: boolean): void {
  try {
    if (expanded) {
      localStorage.setItem(DEBUG_STORAGE_KEY, "1");
    } else {
      localStorage.removeItem(DEBUG_STORAGE_KEY);
    }
  } catch {
    /* ignore */
  }
}

/** Records / Provenance / Paths tabs — researcher always; participant when debug on. */
export function showAdvancedInspectorTabs(
  viewMode: ViewMode,
  debugExpanded: boolean
): boolean {
  if (viewMode === "researcher" || viewMode === "debug") return true;
  if (viewMode === "participant") return debugExpanded;
  return false;
}