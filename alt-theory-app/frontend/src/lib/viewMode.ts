import type { AuthContext, TranscriptView, ViewMode } from "@/api/types";

/**
 * Default presentation mode. Exactly two modes exist: `user` and `researcher`.
 * Local installs and participants start in user mode (the mode-switch door
 * below flips a local/researcher install into researcher mode); hosted
 * researcher/admin accounts land in researcher mode.
 */
export function viewModeForRole(
  role: AuthContext["role"],
  appMode: "local" | "hosted"
): ViewMode {
  if (appMode === "local") return "user";
  if (role === "researcher" || role === "admin" || role === "debug") {
    return "researcher";
  }
  return "user";
}

/**
 * Whether the mode-switch door (former debug button) is available: researcher
 * accounts and any local install (the owner's own machine).
 */
export function researcherDoorOpen(
  role: AuthContext["role"],
  appMode: "local" | "hosted"
): boolean {
  return (
    appMode === "local" ||
    role === "researcher" ||
    role === "admin" ||
    role === "debug"
  );
}

export function isSimpleViewMode(viewMode: ViewMode): boolean {
  return viewMode === "user";
}

export function defaultTranscriptView(viewMode: ViewMode): TranscriptView {
  return viewMode === "user" ? "user" : "developer";
}

export function showAdvancedConfig(viewMode: ViewMode): boolean {
  return viewMode === "researcher";
}

/** Records / Provenance / Paths / Runtime inspector tabs — researcher only. */
export function showAdvancedInspectorTabs(viewMode: ViewMode): boolean {
  return viewMode === "researcher";
}
