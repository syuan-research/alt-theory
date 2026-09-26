import type { TranscriptView, ViewMode } from "@/api/types";

/**
 * Presentation mode. Exactly two modes exist: `user` and `researcher`. The
 * app starts in user mode; the mode-switch door flips it into researcher
 * mode.
 */
export function defaultTranscriptView(viewMode: ViewMode): TranscriptView {
  return viewMode === "user" ? "user" : "developer";
}

export function showAdvancedConfig(viewMode: ViewMode): boolean {
  return viewMode === "researcher";
}
