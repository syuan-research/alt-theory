/**
 * Application-level settings (spec §6.1).
 *
 * Persisted immediately on change; sessions snapshot them at open, so a
 * change never mutates a running agent context — reopening or starting a
 * session applies the new selection.
 */
import { randomUUID } from "crypto";
import { existsSync, readFileSync } from "fs";
import { join } from "path";
import { writeJsonAtomic } from "../core/data-dir.js";
import { samePath } from "../core/path-verdict.js";
import type { AltMode, RuntimeMode } from "../core/alt-theory-core.js";

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
     * User-enabled external skill paths. null = default policy: every
     * discovered external skill. (The key predates the retirement of the
     * Understand/Work modes; one list now serves every conversation.)
     */
    work: { enabledPaths: string[] | null };
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
   *
   * Stored only by pre-v1.5.1 settings; since projects became entities the
   * list is derived (`knownWorkspacesOf`) and read-time migration folds these
   * into `workingFolders.projects`.
   */
  knownWorkspaces?: string[];
  sessionListSort?: {
    folders: "name" | "modified";
    conversations: "name" | "modified";
  };
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
   * Which permission a new conversation starts with (local only; hosted is
   * always read-only). Absent = Ask. The per-conversation control is
   * unaffected — this only seeds new drafts.
   */
  defaultPermission?: Permission;
  /**
   * Command prefixes that run without approval under Ask and smart approval
   * (exact, `prefix …`, or `prefix*`). Absent = none.
   */
  commandAllowlist?: string[];
  /** App-wide behavior runtime. Absent = Alt Theory. */
  runtimeMode?: RuntimeMode;
  /** Native Pi may add Alt Theory's bundled skills to Pi's own discovery. */
  nativePiScanAltSkills?: boolean;
  /**
   * Experiment arm (v1.4 round 1): trim Pi's identity/style lines from the
   * Work-mode base prompt. Compared against the preface-only default via
   * sim-user probes; absent = off.
   */
  experimentTrimmedPiPrompt?: boolean;
  /**
   * Per-model reminder sections (v1.4 round 1: gpt-5*, deepseek-v4-flash;
   * the table in alt-theory-core extends per model). Absent = enabled.
   */
  modelHooks?: boolean;
  /**
   * App UI (and backend user-visible text) language (alpha.6). Absent =
   * "auto": the frontend follows the system language; the backend treats
   * auto as English. Conversation language is unaffected — the assistant
   * follows the user's input language natively.
   */
  lang?: "auto" | "en" | "zh-Hans" | "zh-Hant-HK";
  /**
   * User-added role-preset directories (alpha.5, add-only). The bundled
   * role-presets dir and the data-dir upload folder are always included and
   * never change; these are extra scanned locations.
   */
  extraRolePresetDirs?: string[];
  /** User-added knowledge-base directories (alpha.5, add-only). */
  extraKbDirs?: string[];
  /**
   * Working folders page (v1.5 part 2). `global`: folders Alt may read in
   * every conversation, `writable` = the Edit tick (saves only in Work).
   * `projects` (v1.5.1): a project is its own entity — id, editable name
   * (absent = the main folder's name), a changeable main folder, and
   * companion folders joined to every conversation whose main folder matches.
   */
  workingFolders?: WorkingFoldersSettings;
  /**
   * Cached GitHub update check (desktop bundle). Last check time, latest
   * tag found, download URL, and the version the user dismissed on the rail.
   */
  updateCheck?: {
    lastCheckedAt?: string;
    latestVersion?: string | null;
    htmlUrl?: string | null;
    dismissedVersion?: string | null;
  };
}

export interface ProjectFolderSettings {
  /** Generated id (v1.5.1), stable across main-folder changes; never the path. */
  id: string;
  /** Absent = default: the main folder's basename. */
  name?: string;
  primaryDir: string;
  secondaryDirs: string[];
}

export interface WorkingFoldersSettings {
  global: Array<{ path: string; writable: boolean }>;
  projects: ProjectFolderSettings[];
}

/** The rail's explicit working folders: every project's main folder (v1.5.1). */
export function knownWorkspacesOf(
  settings: Pick<AppSettings, "workingFolders">,
): string[] {
  return (settings.workingFolders?.projects ?? []).map(
    (project) => project.primaryDir,
  );
}

/** The root policy a session gets from the Working folders page, for its main folder. */
export function folderPolicyFor(
  settings: Pick<AppSettings, "workingFolders">,
  primaryDir: string | null | undefined,
): { globalFolders: Array<{ path: string; writable: boolean }>; projectSecondaryDirs: string[] } {
  const folders = settings.workingFolders;
  const project =
    primaryDir && folders
      ? folders.projects.find((item) => samePath(item.primaryDir, primaryDir))
      : undefined;
  return {
    globalFolders: folders?.global ?? [],
    projectSecondaryDirs: project?.secondaryDirs ?? [],
  };
}

const DEFAULT_SETTINGS: AppSettings = {
  schemaVersion: 1,
  skills: {
    work: { enabledPaths: null },
  },
};

function settingsPath(dataDir: string): string {
  return join(dataDir, "app-settings.json");
}

/**
 * Last settings each dataDir parsed successfully. When a settings file goes
 * unreadable (corruption, bad schema version), reads fall back to this
 * instead of pristine defaults — otherwise the next read-modify-write in any
 * handler would overwrite the user's file with defaults (WP3 item 1).
 */
const lastGoodSettings = new Map<string, AppSettings>();

function unreadableWarning(
  path: string,
  reason: string,
): { settings: AppSettings; warning: string } {
  return {
    settings: structuredClone(lastGoodSettings.get(path) ?? DEFAULT_SETTINGS),
    warning: `Could not read app settings (${reason}); keeping the last known settings. Fix or remove ${path} before changing settings.`,
  };
}

/** Read with the failure state exposed (mirrors readSubagentConfig). */
export function readAppSettingsWithWarning(dataDir: string): {
  settings: AppSettings;
  warning: string | null;
} {
  const path = settingsPath(dataDir);
  if (!existsSync(path)) {
    return { settings: structuredClone(DEFAULT_SETTINGS), warning: null };
  }
  let parsed: AppSettings;
  try {
    parsed = JSON.parse(readFileSync(path, "utf-8")) as AppSettings;
  } catch (error) {
    return unreadableWarning(
      path,
      error instanceof Error ? error.message : String(error),
    );
  }
  if (parsed?.schemaVersion !== 1) {
    return unreadableWarning(path, `schema version ${parsed?.schemaVersion}`);
  }
  // v1.5.1 migration: compute once — the same result feeds the normalized
  // settings below and the id-persisting write-through after.
  const migrated =
    parsed.workingFolders || Array.isArray(parsed.knownWorkspaces)
      ? normalizeProjects(parsed)
      : null;
  const settings: AppSettings = {
      schemaVersion: 1,
      skills: {
        work: { enabledPaths: normalizePaths(parsed.skills?.work?.enabledPaths) },
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
      ...(parsed.sessionListSort &&
      (parsed.sessionListSort.folders === "name" ||
        parsed.sessionListSort.folders === "modified") &&
      (parsed.sessionListSort.conversations === "name" ||
        parsed.sessionListSort.conversations === "modified")
        ? { sessionListSort: parsed.sessionListSort }
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
      ...(PERMISSIONS.includes(parsed.defaultPermission as Permission)
        ? { defaultPermission: parsed.defaultPermission }
        : {}),
      ...(Array.isArray(parsed.commandAllowlist)
        ? { commandAllowlist: normalizeCommandAllowlist(parsed.commandAllowlist) }
        : {}),
      ...(parsed.runtimeMode === "alt-theory" || parsed.runtimeMode === "native-pi"
        ? { runtimeMode: parsed.runtimeMode }
        : {}),
      ...(typeof parsed.nativePiScanAltSkills === "boolean"
        ? { nativePiScanAltSkills: parsed.nativePiScanAltSkills }
        : {}),
      ...(parsed.lang === "auto" ||
      parsed.lang === "en" ||
      parsed.lang === "zh-Hans" ||
      parsed.lang === "zh-Hant-HK"
        ? { lang: parsed.lang }
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
              (entry): entry is string => typeof entry === "string",
            ),
          }
        : {}),
      ...(parsed.workingFolders || Array.isArray(parsed.knownWorkspaces)
        ? {
            workingFolders: {
              global: (Array.isArray(parsed.workingFolders?.global) ? parsed.workingFolders.global : [])
                .filter((entry) => entry && typeof entry.path === "string")
                .map((entry) => ({ path: entry.path, writable: entry.writable === true })),
              projects: migrated ? migrated.projects : [],
            },
          }
        : {}),
      ...(parsed.updateCheck && typeof parsed.updateCheck === "object"
        ? {
            updateCheck: {
              ...(typeof parsed.updateCheck.lastCheckedAt === "string"
                ? { lastCheckedAt: parsed.updateCheck.lastCheckedAt }
                : {}),
              ...(typeof parsed.updateCheck.latestVersion === "string" ||
              parsed.updateCheck.latestVersion === null
                ? { latestVersion: parsed.updateCheck.latestVersion }
                : {}),
              ...(typeof parsed.updateCheck.htmlUrl === "string" ||
              parsed.updateCheck.htmlUrl === null
                ? { htmlUrl: parsed.updateCheck.htmlUrl }
                : {}),
              ...(typeof parsed.updateCheck.dismissedVersion === "string" ||
              parsed.updateCheck.dismissedVersion === null
                ? { dismissedVersion: parsed.updateCheck.dismissedVersion }
                : {}),
            },
          }
        : {}),
    };
  lastGoodSettings.set(path, structuredClone(settings));
  if (migrated?.migrated) {
    // Persist the generated ids right away: they are not stable across
    // reads, and every id-addressed action (change a project's main folder)
    // reads settings again. A failed write keeps the pre-migration behavior
    // (regenerate on the next read) instead of breaking the read itself.
    try {
      writeAppSettings(dataDir, settings);
    } catch {
      /* transient write failure; the next read retries */
    }
  }
  return { settings, warning: null };
}

export function readAppSettings(dataDir: string): AppSettings {
  return readAppSettingsWithWarning(dataDir).settings;
}

export function writeAppSettings(dataDir: string, settings: AppSettings): void {
  const path = settingsPath(dataDir);
  // Never overwrite an unparsable file: it may still be recoverable, and the
  // normal write path is a read-modify-write that would silently replace it
  // with whatever the (degraded) read returned.
  if (existsSync(path)) {
    try {
      const parsed = JSON.parse(readFileSync(path, "utf-8")) as AppSettings;
      if (parsed?.schemaVersion !== 1) {
        throw new Error(`schema version ${parsed?.schemaVersion}`);
      }
    } catch (error) {
      throw new Error(
        `Refusing to overwrite unreadable app settings at ${path} ` +
          `(${error instanceof Error ? error.message : String(error)}). ` +
          "Fix or remove the file, then save again.",
      );
    }
  }
  writeJsonAtomic(path, settings);
  lastGoodSettings.set(path, structuredClone(settings));
}

/**
 * Resolve the external skill paths a new session should load, applying the
 * null-means-default policy against the discovered externals.
 */
export function resolveExternalSkillPaths(
  settings: AppSettings,
  discoveredExternalPaths: string[]
): string[] {
  return settings.skills.work.enabledPaths ?? [...discoveredExternalPaths];
}

/** The permission control's three choices (UI term; stored as mode + Full Access). */
export type Permission = "read-only" | "ask" | "full";
export const PERMISSIONS: Permission[] = ["read-only", "ask", "full"];

/**
 * The settings a new conversation starts from. Hosted deployments are
 * read-only regardless of the setting (owner 2026-09-25).
 */
export function defaultSessionPermission(
  settings: AppSettings,
  localMode: boolean,
): { mode: AltMode; fullAccess: boolean } {
  const permission = localMode ? (settings.defaultPermission ?? "ask") : "read-only";
  return {
    mode: permission === "read-only" ? "read-only" : "work",
    fullAccess: permission === "full",
  };
}

/** Trimmed, non-empty, de-duplicated prefixes, in the user's order. */
export function normalizeCommandAllowlist(value: unknown[]): string[] {
  return [
    ...new Set(
      value
        .filter((entry): entry is string => typeof entry === "string")
        .map((entry) => entry.replace(/\s+/g, " ").trim())
        .filter(Boolean),
    ),
  ];
}

function normalizePaths(value: unknown): string[] | null {
  if (!Array.isArray(value)) return null;
  return value.filter((entry): entry is string => typeof entry === "string");
}

/**
 * Read-time migration (v1.5.1): projects gain generated ids and an optional
 * name; a pre-v1.5.1 file's explicitly added folders (`knownWorkspaces`,
 * which only became projects once they gained second folders) fold in as
 * projects with no companions. Generating an id is not stable across reads,
 * so `migrated` tells the caller to persist the normalized list at once —
 * otherwise a project handed to the client with id X is read back as id Y
 * and every id-addressed action (change main folder) misses.
 */
function normalizeProjects(parsed: AppSettings): {
  projects: ProjectFolderSettings[];
  migrated: boolean;
} {
  let migrated = false;
  const projects: ProjectFolderSettings[] = (
    Array.isArray(parsed.workingFolders?.projects)
      ? parsed.workingFolders.projects
      : []
  )
    .filter(
      (entry) =>
        entry && typeof entry.primaryDir === "string" && entry.primaryDir.trim(),
    )
    .map((entry) => {
      if (!(typeof entry.id === "string" && entry.id.trim())) {
        migrated = true;
      }
      return {
        id:
          typeof entry.id === "string" && entry.id.trim()
            ? entry.id
            : randomUUID(),
        ...(typeof entry.name === "string" && entry.name.trim()
          ? { name: entry.name }
          : {}),
        primaryDir: entry.primaryDir,
        secondaryDirs: (Array.isArray(entry.secondaryDirs)
          ? entry.secondaryDirs
          : []
        ).filter((dir): dir is string => typeof dir === "string"),
      };
    });
  const legacyKnown = Array.isArray(parsed.knownWorkspaces)
    ? parsed.knownWorkspaces.filter(
        (entry): entry is string => typeof entry === "string",
      )
    : [];
  for (const dir of legacyKnown) {
    if (!projects.some((project) => samePath(project.primaryDir, dir))) {
      migrated = true;
      projects.push({ id: randomUUID(), primaryDir: dir, secondaryDirs: [] });
    }
  }
  return { projects, migrated };
}
