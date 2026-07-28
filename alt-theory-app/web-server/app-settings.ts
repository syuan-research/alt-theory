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

/**
 * Which skill wins when a bundled skill and a user-installed skill cover the
 * same job (v1.3.0-alpha.3). Default flipped to the bundled one: Alt's skills
 * carry the product's stance, and a user skill of the same name is usually a
 * generic import rather than a deliberate replacement.
 */
export type SkillPrecedence = "prefer-bundled" | "prefer-user" | "ask";

export const SKILL_PRECEDENCE_VALUES: SkillPrecedence[] = [
  "prefer-bundled",
  "prefer-user",
  "ask",
];

export interface AppSettings {
  schemaVersion: 1;
  /** Absent = "prefer-bundled". */
  skillPrecedence?: SkillPrecedence;
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
  /**
   * Which capability mode a new conversation starts in (alpha.5). Absent =
   * "pure" (Understand), the established default. The per-conversation
   * toggle is unaffected — this only seeds new drafts.
   */
  defaultMode?: "pure" | "full";
  /**
   * User-added role-preset directories (alpha.5, add-only). The bundled
   * role-presets dir and the data-dir upload folder are always included and
   * never change; these are extra scanned locations.
   */
  extraRolePresetDirs?: string[];
  /** User-added knowledge-base directories (alpha.5, add-only). */
  extraKbDirs?: string[];
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
      // This normalizer whitelists fields, so anything not listed here is
      // silently dropped on read — autoTitle was, which made the auto-naming
      // settings write-only until alpha.3.
      ...(parsed.autoTitle
        ? {
            autoTitle: {
              enabled: parsed.autoTitle.enabled !== false,
              model:
                parsed.autoTitle.model &&
                typeof parsed.autoTitle.model.provider === "string" &&
                typeof parsed.autoTitle.model.modelId === "string"
                  ? parsed.autoTitle.model
                  : null,
            },
          }
        : {}),
      ...(SKILL_PRECEDENCE_VALUES.includes(parsed.skillPrecedence as SkillPrecedence)
        ? { skillPrecedence: parsed.skillPrecedence }
        : {}),
      ...(parsed.defaultMode === "pure" || parsed.defaultMode === "full"
        ? { defaultMode: parsed.defaultMode }
        : {}),
      ...(Array.isArray(parsed.extraRolePresetDirs)
        ? {
            extraRolePresetDirs: parsed.extraRolePresetDirs.filter(
              (entry): entry is string => typeof entry === "string"
            ),
          }
        : {}),
      ...(Array.isArray(parsed.extraKbDirs)
        ? {
            extraKbDirs: parsed.extraKbDirs.filter(
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
