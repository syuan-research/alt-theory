/**
 * Application-level settings (spec §6.1).
 *
 * Persisted immediately on change; sessions snapshot them at open, so a
 * change never mutates a running agent context — reopening or starting a
 * session applies the new selection.
 */
import { existsSync, readFileSync } from "fs";
import { join } from "path";
import { writeJsonAtomic } from "../core/data-dir.js";

export interface AppSettings {
  schemaVersion: 1;
  skills: {
    /**
     * User-enabled external skill paths per capability mode. null = default
     * policy: Pure enables no external skills (spec §3.4); Full enables every
     * discovered external skill (Pi's native posture).
     */
    pure: { enabledPaths: string[] | null };
    full: { enabledPaths: string[] | null };
  };
  /**
   * Install-level participant designation (M7 §3). Local carrier of the
   * study-designation primitive: set at handout, drives the sharing default
   * (designated → research, else private) and whether study surfaces render.
   * Absent = non-participant (the GitHub-download posture).
   */
  participant?: { designated: boolean; label: string | null };
  /**
   * Working folders the user added explicitly (M4). Lets an empty workspace
   * appear in the session list before any conversation exists in it; folders
   * that already host sessions are derived from session summaries instead.
   */
  knownWorkspaces?: string[];
  /**
   * Auto-naming of conversations (v1.2.1). Absent = enabled, using the session's
   * own model. A pinned `model` (recommended: a small one) overrides which model
   * writes the title; at call time an unusable pin falls back to the session
   * model, then to the first-words snippet. `enabled: false` turns it off.
   */
  autoTitle?: {
    enabled: boolean;
    model: { provider: string; modelId: string } | null;
  };
}

const DEFAULT_SETTINGS: AppSettings = {
  schemaVersion: 1,
  skills: {
    pure: { enabledPaths: null },
    full: { enabledPaths: null },
  },
};

function settingsPath(dataDir: string): string {
  return join(dataDir, "app-settings.json");
}

export function readAppSettings(dataDir: string): AppSettings {
  const path = settingsPath(dataDir);
  if (!existsSync(path)) return structuredClone(DEFAULT_SETTINGS);
  try {
    const parsed = JSON.parse(readFileSync(path, "utf-8")) as AppSettings;
    if (parsed?.schemaVersion !== 1) return structuredClone(DEFAULT_SETTINGS);
    return {
      schemaVersion: 1,
      skills: {
        pure: { enabledPaths: normalizePaths(parsed.skills?.pure?.enabledPaths) },
        full: { enabledPaths: normalizePaths(parsed.skills?.full?.enabledPaths) },
      },
      ...(parsed.participant
        ? {
            participant: {
              designated: Boolean(parsed.participant.designated),
              label:
                typeof parsed.participant.label === "string"
                  ? parsed.participant.label
                  : null,
            },
          }
        : {}),
      ...(Array.isArray(parsed.knownWorkspaces)
        ? {
            knownWorkspaces: parsed.knownWorkspaces.filter(
              (entry): entry is string => typeof entry === "string"
            ),
          }
        : {}),
    };
  } catch {
    return structuredClone(DEFAULT_SETTINGS);
  }
}

export function writeAppSettings(dataDir: string, settings: AppSettings): void {
  writeJsonAtomic(settingsPath(dataDir), settings);
}

/**
 * Resolve the per-mode external skill path lists a new session should load,
 * applying the null-means-default policy against the discovered externals.
 */
export function resolveExternalSkillPaths(
  settings: AppSettings,
  discoveredExternalPaths: string[]
): { pure: string[]; full: string[] } {
  return {
    pure: settings.skills.pure.enabledPaths ?? [],
    full: settings.skills.full.enabledPaths ?? [...discoveredExternalPaths],
  };
}

function normalizePaths(value: unknown): string[] | null {
  if (!Array.isArray(value)) return null;
  return value.filter((entry): entry is string => typeof entry === "string");
}
