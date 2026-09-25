/**
 * Alt Theory Core Layer
 *
 * Provides `createAltTheorySession(config)` — the unified API for all Alt Theory frontends.
 * Handles: system prompt assembly, role-preset injection, KB path binding, tool selection.
 *
 * @module alt-theory-core
 */

import {
  createAgentSession,
  createWriteToolDefinition,
  DefaultResourceLoader,
  type ExtensionFactory,
  getAgentDir,
  loadProjectContextFiles,
  loadSkills,
  loadSkillsFromDir,
  ModelRuntime,
  type ResourceDiagnostic,
  SessionManager,
  type Skill,
  type ToolDefinition,
  type WriteOperations,
} from "@earendil-works/pi-coding-agent";
import type { ThinkingLevel } from "@earendil-works/pi-agent-core";
import type { Model } from "@earendil-works/pi-ai/compat";
import { appendFileSync, existsSync, readFileSync } from "fs";
import { mkdir, writeFile } from "fs/promises";
import { dirname, join, resolve, sep } from "path";
import { createSecurityExtension } from "./security-extension.js";
import {
  assertWritablePath,
  canonicalPathKey,
  isPathInside,
} from "./path-verdict.js";
import {
  sessionRoots,
  type Root,
  type SessionRootsInput,
} from "./root-policy.js";
import { createTurnContinuityExtension } from "./turn-continuity.js";
import { createPromptCacheContinuityExtension } from "./prompt-cache-continuity.js";
import { createModelRemindersExtension } from "./model-reminders.js";
import { createWebAccessToolDefinitions } from "./web-access-tools.js";
import {
  writeJsonAtomic,
  type SessionDirectories,
} from "./data-dir.js";
import {
  emptyFileRef,
  fileRef,
  readRequiredTextAsset,
  type LoadedAssetFileRef,
} from "./agent-assets.js";
import {
  findKbDomainMetadata,
  formatKbMetadataPrompt,
  type KbDomainMetadata,
} from "./kb-metadata.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface AssemblyManifest {
  sessionId: string;
  createdAt: string;
  openedFrom?: "new" | "existing";
  resumedFrom?: {
    sessionId: string | null;
    createdAt: string | null;
    rolePresetSlug: string | null;
    kbDomain: string | null;
    provider: string | null;
    model: string | null;
  };
  resumeWarnings?: string[];
  appContext: LoadedAssetFileRef;
  soul: LoadedAssetFileRef & {
    slug: string | null;
  };
  rolePreset: LoadedAssetFileRef & {
    slug: string | null;
  };
  customInstruction: LoadedAssetFileRef & {
    ref: string | null;
    /** This layer is an optional per-session extra; absent is the normal
     *  state, not a missing asset (owner decision 2026-07-23). */
    optional: true;
  };
  skills: Array<{
    name: string;
    path: string;
    sha256: string | null;
    /**
     * alt-theory = bundled; external = user-enabled via settings; workspace =
     * project skills from a work-capable session (spec §5.1). Ambient
     * dev-debug merges are deliberately not recorded: they are a
     * machine-dependent debug posture, not session provenance.
     */
    source: "alt-theory" | "external" | "workspace";
  }>;
  piAdapter: {
    promptTemplatesDir: string | null;
    promptTemplatesExist: boolean;
  };
  kbDomain: string;
  kb: {
    rootDir: string;
    domain: string;
    domainPath: string | null;
    domainExists: boolean;
    metadata: KbDomainMetadata | null;
  };
  sessionCwd: string;
  /**
   * Work/Native workspace (spec §5.1): the primary working directory is the
   * session cwd. Companion folders belong to the project (app settings),
   * read live through the folder-policy reader — not recorded per session.
   */
  workspace: {
    primaryDir: string;
  };
  piSessionDir: string;
  piSessionFile: string | null;
  recordsDir: string;
  writeDir: string | null;
  writableRoots: string[];
  model: string | null;
  provider: string | null;
  altMode: AltMode;
  resourceDiscovery: {
    mode: ResourceDiscoveryMode;
    skillsDir: string | null;
  };
  runLabel: string | null;
  testBatch: string | null;
}

export type ResourceDiscoveryMode = "clean" | "internal" | "dev-debug";
export type RuntimeMode = "alt-theory" | "native-pi";
/**
 * Per-session tool mode behind the permission control: "read-only" (no
 * shell; every agent write or edit asks once) or "work". The UI's three
 * permission modes are read-only / work (Ask) / work + Full Access.
 */
export type AltMode = "read-only" | "work";

/** A stored mode as the runtime reads it: anything but "read-only" is work. */
export function toAltMode(value: unknown): AltMode {
  return value === "read-only" ? "read-only" : "work";
}
export const KB_DISABLED_DOMAIN = "none";

export interface AltTheoryConfig extends SessionDirectories {
  /** Application/session context loaded into the system prompt */
  appContextPath: string;
  /** Durable agent stance/personality seed */
  soulPath?: string | null;
  /** Durable agent stance/personality seed slug */
  soulSlug?: string | null;
  /** Agent role/style preset file */
  rolePresetPath?: string | null;
  /** Agent role/style preset slug */
  rolePresetSlug?: string | null;
  /** Optional independent text instruction asset */
  customInstructionPath?: string | null;
  /** Stable reference inside the configured instruction root */
  customInstructionRef?: string | null;
  /** KB root directory (search path for read-only/coding tools) */
  kbDir: string;
  /** Active KB domain recorded in the session manifest */
  kbDomain?: string;
  /** Pi adapter prompt templates */
  piPromptTemplatesDir?: string;
  /** Optional custom Pi models.json path */
  modelsPath?: string;
  /** Optional Pi auth.json path; paired with modelsPath in local mode. */
  authPath?: string;
  /** Explicit provider/model selection */
  modelProvider?: string;
  modelId?: string;
  /** Runtime-only API key; never persisted by Alt Theory */
  runtimeApiKey?: string;
  thinkingLevel?: ThinkingLevel;
  writableAssetDir?: string;
  runLabel?: string | null;
  testBatch?: string | null;
  /** App-wide behavior runtime. Never persisted as a per-session override. */
  runtimeMode?: RuntimeMode;
  /** Per-session Alt Theory mode, preserved while Native Pi is active. */
  altMode?: AltMode;
  /** Native Pi keeps Pi discovery; this only adds Alt Theory's bundled skills. */
  nativePiScanAltSkills?: boolean;
  /**
   * Full Access this conversation holds (its header). Taken as-is, without
   * the enable check: in a mode that cannot use it the value is dormant.
   */
  fullAccess?: boolean;
  resourceDiscovery?: ResourceDiscoveryMode;
  skillsDir?: string;
  /** Read-only product/agent resource roots that should not prompt. */
  trustedReadRoots?: string[];
  /**
   * Alt Theory's data folder. The agent writes only its own workspace
   * there; other conversations and the app's records are refused.
   */
  dataDir?: string;
  /** The user's command-prefix allowlist (app settings), read live. */
  readCommandAllowlist?: () => string[];
  /**
   * User-enabled external skill paths (files or directories), resolved by the
   * app settings layer (spec §6.1). Snapshot at session open; settings
   * changes apply on session reload. External skills are never silently
   * enabled: an absent list means Alt bundled skills only.
   */
  externalSkillPaths?: string[];
  /** App setting (§6.1) deciding bundled-vs-user skill precedence in the prompt. */
  skillPrecedence?: "prefer-bundled" | "prefer-user" | "ask";
  /**
   * Working folders page (v1.5 part 2): the global folder list and the
   * project's companion folders, read live at every root check so a tick on
   * the page applies to open conversations too. Absent = none.
   */
  readFolderPolicy?: () => {
    globalFolders: Array<{ path: string; writable: boolean }>;
    projectSecondaryDirs: string[];
  };
  /**
   * Inline Pi extension factories, loaded explicitly by the app (M4 policy
   * layer, tests). Ambient extension discovery stays off in every mode
   * (noExtensions, spec §3.4/§4.2); this is the only extension entry point.
   */
  extensionFactories?: ExtensionFactory[];
  /**
   * Per-session custom tools active in both application runtimes (alpha.5 M2:
   * the agent-team tool surface). Unlike the web-access tools, these join
   * the active set — they carry their own policy in their implementations.
   */
  extraTools?: ToolDefinition[];
  /** Extra semantic system-prompt sections (alpha.5 M2: delegation contract). */
  extraPromptSections?: string[];
  /**
   * Experiment arm (v1.4 round 1): in Alt Theory Work mode, strip the
   * "expert coding assistant" identity line and the "Be concise" style
   * directive from Pi's base prompt, leaving its tool facts intact.
   */
  trimmedPiBasePrompt?: boolean;
/** Per-model reminder sections; absent = enabled. */
  modelHooks?: boolean;
}

/** Static per-model reminder for non-GPT models. GPT reminders are per-turn. */
const MODEL_HOOKS: Array<{ match: RegExp; section: string }> = [
  {
    match: /deepseek-v4-flash/i,
    section: [
      "## Model Reminder",
      "NON-COMMAND DISCIPLINE REMINDER — A correction, observation, judgement, or agreement is not an instruction. Preserve the user's wider purpose and earlier decisions while you clarify the next small move. Do not treat a non-command as permission to choose a route and start broad work.",
    ].join("\n"),
  },
];

export function modelHookSection(modelId: string | undefined): string | null {
  if (!modelId) return null;
  for (const hook of MODEL_HOOKS) {
    if (hook.match.test(modelId)) return hook.section;
  }
  return null;
}

/**
 * Bridges Pi's harness prompt to the Alt Theory sections in Work mode.
 * Verified assembly order (pi system-prompt.js): pi base → these appended
 * sections → project context files → skills list → cwd; the wording scopes
 * its claims to exactly that order.
 */
const WORK_MODE_PREFACE = [
  "## Alt Theory governs from here",
  "The harness description above is technical environment background: the tools and how to operate them. The Alt Theory sections that follow define who you are in this product — your behavior, priorities, and persona; material after them (project instructions, skills, working directory) is task context, not identity. Where the technical background pulls against these sections about how to act with the user, the Alt Theory sections govern.",
].join("\n");

/** Experiment arm (b): neutralize Pi's identity/style lines, keep tool facts. */
function trimPiBasePrompt(base: string): string {
  return base
    .replace(
      "You are an expert coding assistant operating inside pi, a coding agent harness. You help users by reading files, executing commands, editing code, and writing new files.",
      "You are operating inside pi, an agent harness that provides your tools for reading files, executing commands, and editing or writing files. Who you are and how you work with the user are defined by the Alt Theory sections below.",
    )
    .replace("- Be concise in your responses\n", "");
}

/** Prompt text for the app-settings skill-precedence choice (default bundled). */
export function skillPrecedenceGuidance(
  precedence?: "prefer-bundled" | "prefer-user" | "ask"
): string {
  if (precedence === "prefer-user") {
    return "Bundled skills are a floor, not the authority. Before auto-invoking a bundled skill, check whether the user has installed a skill of the same category (for example lookup, doc-conversion, summary); if so, prefer the user's skill.";
  }
  if (precedence === "ask") {
    return "When a bundled skill and a user-installed skill of the same category (for example lookup, doc-conversion, summary) both fit the task, do not choose silently: name both and ask which to use.";
  }
  return "Alt Theory's bundled skills carry this product's stance and are the default choice. When a user-installed skill covers the same category (for example lookup, doc-conversion, summary), still prefer the bundled one unless the user asked for theirs by name or the bundled skill plainly does not cover the task.";
}

export interface AltTheoryOpenExistingConfig extends AltTheoryConfig {
  /** Existing Pi JSONL file to open */
  sessionFile: string;
  /** Original assembly manifest, when available, used for drift warnings */
  originalManifest?: AssemblyManifest | null;
  /** Override the Pi header cwd for a copied comparison workspace. */
  overrideSessionCwd?: boolean;
}

/** Read-only permission: search tools stand in for the shell; writes ask each time. */
const READ_ONLY_TOOLS = ["read", "ls", "grep", "find", "edit", "write"];
/** Pi's own default active toolset for Work and Native Pi. */
const PI_DEFAULT_TOOLS = ["read", "bash", "edit", "write"];
/** Bundled skills that need the shell, so read-only does not list them. */
const SHELL_BUNDLED_SKILLS = new Set(["web-search", "page-fetch", "doc-convert"]);

const READ_ONLY_PROMPT_SECTION = [
  "## Permission: Read-only",
  "The user chose read-only permission for this conversation. There is no shell. Every file write or edit asks the user for approval before it happens; a denied write is the user's choice, not an error to route around. Live web lookup is unavailable here; files the user attached are already converted to text you can read.",
].join("\n");

const NO_MODEL_PROVIDER = "__alt_theory_no_model__";
const NO_MODEL_ID = "__no_model_selected__";
const NO_MODEL_PLACEHOLDER: Model<any> = {
  id: NO_MODEL_ID,
  name: "No model selected",
  api: "openai-completions",
  provider: NO_MODEL_PROVIDER,
  baseUrl: "http://127.0.0.1",
  reasoning: false,
  input: ["text"],
  cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
  contextWindow: 1,
  maxTokens: 1,
};

export function isNoModelPlaceholder(model: Model<any> | undefined): boolean {
  return model?.provider === NO_MODEL_PROVIDER && model.id === NO_MODEL_ID;
}

function activeToolsForMode(readOnly: boolean): string[] {
  return readOnly ? READ_ONLY_TOOLS : PI_DEFAULT_TOOLS;
}

// ---------------------------------------------------------------------------
// Implementation
// ---------------------------------------------------------------------------

export async function createAltTheorySession(config: AltTheoryConfig) {
  const sessionManager = SessionManager.create(
    resolve(config.sessionCwd),
    resolve(config.piSessionDir)
  );
  sessionManager.newSession({ id: config.sessionId });
  return createAltTheorySessionWithManager(config, sessionManager, {
    openedFrom: "new",
    manifestFileName: "assembly-manifest.json",
    originalManifest: null,
    initialWarnings: [],
  });
}

export async function openAltTheorySession(
  config: AltTheoryOpenExistingConfig
) {
  const sessionManager = SessionManager.open(
    resolve(config.sessionFile),
    resolve(config.piSessionDir),
    config.overrideSessionCwd ? resolve(config.sessionCwd) : undefined
  );
  return createAltTheorySessionWithManager(config, sessionManager, {
    openedFrom: "existing",
    manifestFileName: "resume-manifest.json",
    originalManifest: config.originalManifest ?? null,
    initialWarnings: [],
  });
}

async function createAltTheorySessionWithManager(
  config: AltTheoryConfig,
  sessionManager: SessionManager,
  openMode: {
    openedFrom: "new" | "existing";
    manifestFileName: string;
    originalManifest: AssemblyManifest | null;
    initialWarnings: string[];
  }
) {
  const {
    sessionId,
    sessionCwd,
    piSessionDir,
    recordsDir,
    writeDir,
    kbDir,
  } = config;

  // Resolve paths
  const cwd = resolve(sessionCwd);
  const resolvedPiSessionDir = resolve(piSessionDir);
  const resolvedWriteDir = resolve(writeDir);
  const resolvedRecordsDir = resolve(recordsDir);
  const resolvedKbDir = resolve(kbDir);
  const resolvedWritableAssetDir = resolve(
    config.writableAssetDir ?? "runs/local-assets"
  );
  const resolvedAppContextPath = resolve(config.appContextPath);
  const resolvedSoulPath = config.soulPath ? resolve(config.soulPath) : null;
  const resolvedRolePresetPath = config.rolePresetPath
    ? resolve(config.rolePresetPath)
    : null;
  const resolvedCustomInstructionPath = config.customInstructionPath
    ? resolve(config.customInstructionPath)
    : null;
  const resolvedPiPromptTemplatesDir = config.piPromptTemplatesDir
    ? resolve(config.piPromptTemplatesDir)
    : null;
  const agentDir = getAgentDir();
  const sessionHeader = sessionManager.getHeader() as
    | { id: string; promptCacheFamilyId?: unknown }
    | null;
  const promptCacheFamilyId =
    typeof sessionHeader?.promptCacheFamilyId === "string"
      ? sessionHeader.promptCacheFamilyId
      : (sessionHeader?.id ?? sessionId);
  const runtimeState = {
    runtimeMode: config.runtimeMode ?? ("alt-theory" as RuntimeMode),
    altMode: config.altMode ?? ("work" as AltMode),
    nativePiScanAltSkills: config.nativePiScanAltSkills !== false,
    // Full Access follows the conversation (M2, 2026-09-24): the session
    // service persists it in the header and hands it back on every assembly.
    fullAccess: config.fullAccess === true,
    // A switch to read-only waiting for the turn to end already mediates
    // like read-only (turning permissions down mid-run is always safe).
    readOnlyHeld: false,
  };
  const resourceDiscovery = config.resourceDiscovery ?? "dev-debug";
  const resolvedSkillsDir = config.skillsDir ? resolve(config.skillsDir) : null;

  // --- 1. Read semantic assets ---
  const appContextContent = readRequiredTextAsset(
    resolvedAppContextPath,
    "ALTTHEORY.md"
  );
  const soulContent = resolvedSoulPath
    ? readRequiredTextAsset(resolvedSoulPath, "soul")
    : null;
  const rolePresetContent = resolvedRolePresetPath
    ? readRequiredTextAsset(resolvedRolePresetPath, "role preset")
    : null;
  const customInstructionContent = resolvedCustomInstructionPath
    ? readRequiredTextAsset(resolvedCustomInstructionPath, "custom instruction")
    : null;

  // --- 2. Assemble prompt layers ---
  // Alt Theory owns its behavior assets. Native Pi is subtractive: Pi's base
  // prompt plus only app infrastructure instructions and Custom Instruction.
  const altSections: string[] = [];
  altSections.push(`## Alt Theory Application Context\n${appContextContent}`);
  if (soulContent) {
    altSections.push(`## Soul\n${soulContent}`);
  }
  if (rolePresetContent) {
    altSections.push(`## Role\n${rolePresetContent}`);
  }
  const kbDomain = config.kbDomain ?? "all";
  const kbEnabled = kbDomain !== KB_DISABLED_DOMAIN;
  const kbMetadata =
    kbEnabled && kbDomain !== "all"
      ? findKbDomainMetadata(resolvedKbDir, kbDomain)
      : null;
  const kbMetadataPrompt = formatKbMetadataPrompt(kbMetadata);
  if (kbEnabled) {
    altSections.push(
      `## Knowledge Base\nYour knowledge base is at: ${resolvedKbDir}`
    );
    if (kbMetadataPrompt) {
      altSections.push(`## Knowledge Base Metadata\n${kbMetadataPrompt}`);
    }
  } else {
    altSections.push(
      "## Knowledge Base\nKnowledge-base folder retrieval is disabled for this session. You may still read user workspace files when requested."
    );
  }
  altSections.push(
    ["## Skill Precedence", skillPrecedenceGuidance(config.skillPrecedence)].join("\n")
  );
  // Non-GPT hooks are currently chosen at assembly. GPT uses the live model.
  const modelHook =
    runtimeState.runtimeMode === "alt-theory" && config.modelHooks !== false
      ? modelHookSection(config.modelId)
      : null;
  if (modelHook) altSections.push(modelHook);
  const sharedSections: string[] = [];
  if (customInstructionContent) {
    sharedSections.push(`## Custom Instruction\n${customInstructionContent}`);
  }
  for (const section of config.extraPromptSections ?? []) {
    sharedSections.push(section);
  }
  const isReadOnly = () => runtimeState.altMode === "read-only";
  const mediatesReadOnly = () => isReadOnly() || runtimeState.readOnlyHeld;
  // Full Access stays stored across permission switches but is only
  // effective outside read-only; read-only keeps it dormant, not cleared.
  const isFullAccessEffective = () => runtimeState.fullAccess && !mediatesReadOnly();
  // Writable/readable roots are computed by the one root-policy module,
  // evaluated per call: the Alt writable roots plus the workspace (primary +
  // the project's companion folders, both read live from the folder policy).
  // Read-only keeps the same roots; the security extension asks before every
  // write there. Shared by the guarded write tool, the security extension,
  // and the assembly manifest.
  const altWritableRoots = [resolvedWriteDir, resolvedWritableAssetDir];
  const approvedWritableRoots = new Set<string>();
  // Read-only "Allow once" outside the roots: one path, consumed by the
  // guarded write that follows the approval.
  const onceWritablePaths = new Set<string>();
  const projectSecondaryDirs = () =>
    config.readFolderPolicy?.().projectSecondaryDirs ?? [];
  const sessionRootsForMode = (): { readable: Root[]; writable: Root[] } => {
    const folderPolicy = config.readFolderPolicy?.();
    return sessionRoots({
      writeDir: resolvedWriteDir,
      assetDir: resolvedWritableAssetDir,
      cwd,
      approvedDirs: [...approvedWritableRoots],
      kbDir: resolvedKbDir,
      trustedReadRoots: config.trustedReadRoots ?? [],
      skillsDir: resolvedSkillsDir,
      globalFolders: folderPolicy?.globalFolders ?? [],
      projectSecondaryDirs: folderPolicy?.projectSecondaryDirs ?? [],
    });
  };
  const writableRootsForMode = () => sessionRootsForMode().writable;
  // One scan of the skills root. Pi's loader already descends into
  // subdirectories, so optional skills are just skills that a packaged build
  // does not carry.
  const altTheorySkills =
    resourceDiscovery !== "clean" && resolvedSkillsDir
      ? loadSkillsFromDir({
          dir: resolvedSkillsDir,
          source: "alt-theory",
        })
      : { skills: [], diagnostics: [] };
  const bundledSkillsForMode = () =>
    isReadOnly()
      ? {
          skills: altTheorySkills.skills.filter(
            (skill) => !SHELL_BUNDLED_SKILLS.has(skill.name)
          ),
          diagnostics: altTheorySkills.diagnostics,
        }
      : altTheorySkills;
  // User-enabled external skills, snapshot at session open (spec §6.1).
  // Loaded through Pi's own resolver so files, directories, and skill
  // packages all behave exactly as they would in Pi.
  const externalSkills =
    resourceDiscovery !== "clean" && config.externalSkillPaths?.length
      ? loadSkills({
          cwd,
          agentDir,
          skillPaths: config.externalSkillPaths,
          includeDefaults: false,
        })
      : { skills: [], diagnostics: [] };
  // Project skills from the work-capable workspace (spec §5.1): the primary
  // directory and each of the project's companion folders contribute their
  // standard project skill locations. Re-read at every loader reload so
  // companions added on the Working folders page apply.
  const workspaceSkillRoots = () =>
    [cwd, ...projectSecondaryDirs()].flatMap((dir) =>
      [".pi/skills", ".agents/skills"].map((sub) => join(dir, sub))
    );
  const loadWorkspaceSkills = () =>
    resourceDiscovery !== "clean"
      ? workspaceSkillRoots()
          .filter((dir) => existsSync(dir))
          .map((dir) => loadSkillsFromDir({ dir, source: "workspace" }))
          .reduce(mergeSkills, { skills: [], diagnostics: [] })
      : { skills: [], diagnostics: [] };

  const loader = new DefaultResourceLoader({
    cwd,
    agentDir,
    additionalPromptTemplatePaths: resolvedPiPromptTemplatesDir
      ? [resolvedPiPromptTemplatesDir]
      : [],
    // Ambient extension discovery stays off: app infrastructure extensions are
    // explicit in both runtimes.
    // Only explicit factories load. The security extension registers last so
    // it evaluates tool input as finally mutated by earlier handlers — a
    // block from any handler short-circuits execution regardless of order.
    noExtensions: true,
    extensionFactories: [
      ...(config.extensionFactories ?? []),
      createModelRemindersExtension(
        () => runtimeState.runtimeMode === "alt-theory",
        config.modelHooks !== false,
      ),
      // Strips orphaned toolCall blocks from errored/aborted partial
      // assistant messages so preserved break-point context never sends a
      // tool_use without its tool_result (alpha.5 M0 continuity repair).
      createTurnContinuityExtension(),
      createPromptCacheContinuityExtension(
        promptCacheFamilyId,
        // ADR 0004 D3: without a project and without a shell, the copied
        // session cwd is incidental, so parent and branch share the prefix.
        () =>
          runtimeState.runtimeMode === "alt-theory" &&
          isReadOnly() &&
          cwd === resolvedWriteDir,
      ),
      createSecurityExtension({
        sessionCwd: cwd,
        getWritableRoots: writableRootsForMode,
        getReadableRoots: () => sessionRootsForMode().readable,
        addWritableRoot: (root) => approvedWritableRoots.add(resolve(root)),
        isReadOnly: mediatesReadOnly,
        allowWriteOnce: (path) => onceWritablePaths.add(path),
        recordAudit: (entry) =>
          appendFileSync(
            join(resolvedRecordsDir, "security-audit.jsonl"),
            `${JSON.stringify(entry)}\n`
          ),
        isFullAccess: isFullAccessEffective,
        protectedDirs: config.dataDir ? [resolve(config.dataDir)] : [],
        getCommandAllowlist: config.readCommandAllowlist,
      }),
    ],
    noContextFiles: resourceDiscovery !== "dev-debug",
    systemPromptOverride: (base) =>
      runtimeState.runtimeMode === "alt-theory" && config.trimmedPiBasePrompt
        ? trimPiBasePrompt(base)
        : base,
    skillsOverride: (current) => {
      if (resourceDiscovery === "clean") {
        return { skills: [], diagnostics: [] };
      }
      if (runtimeState.runtimeMode === "native-pi") {
        return !runtimeState.nativePiScanAltSkills
          ? current
          : mergeSkills(current, altTheorySkills);
      }
      const selected = mergeSkills(
        mergeSkills(bundledSkillsForMode(), externalSkills),
        loadWorkspaceSkills()
      );
      return resourceDiscovery === "internal"
        ? selected
        : mergeSkills(current, selected);
    },
    // Workspace context: the primary directory and Pi's own discovery
    // (global + ancestor AGENTS.md/CLAUDE.md chain); each of the project's
    // companion folders contributes its own context file.
    agentsFilesOverride: (base) => {
      const files = [...base.agentsFiles];
      const seen = new Set(files.map((file) => file.path));
      const add = (file: { path: string; content: string } | undefined) => {
        if (file && !seen.has(file.path)) {
          files.push(file);
          seen.add(file.path);
        }
      };
      for (const file of loadProjectContextFiles({ cwd, agentDir })) {
        add(file);
      }
      for (const dir of projectSecondaryDirs()) {
        add(readWorkspaceContextFile(dir));
      }
      return { agentsFiles: files };
    },
    appendSystemPromptOverride: (base: string[]) => [
      ...base,
      ...(runtimeState.runtimeMode === "native-pi"
        ? sharedSections
        : [WORK_MODE_PREFACE, ...altSections, ...sharedSections]),
      ...(isReadOnly() ? [READ_ONLY_PROMPT_SECTION] : []),
    ],
  });
  await loader.reload();

  // --- 3. Create session ---
  const sessionOpts: Parameters<typeof createAgentSession>[0] = {
    cwd,
    resourceLoader: loader,
    sessionManager,
  };

  // Pi otherwise waits while searching provider defaults. The inert model is
  // never sent: the app blocks prompts until the user chooses a real model.
  if (!config.modelProvider && !config.modelId) {
    sessionOpts.model = NO_MODEL_PLACEHOLDER;
  }

  if (config.modelProvider || config.modelId) {
    if (!config.modelProvider || !config.modelId) {
      throw new Error("modelProvider and modelId must be configured together");
    }
    const modelRuntime = await ModelRuntime.create({
      authPath: config.authPath ? resolve(config.authPath) : undefined,
      modelsPath: config.modelsPath ? resolve(config.modelsPath) : undefined,
    });
    if (config.runtimeApiKey) {
      // Offline by design in Pi 0.84: setRuntimeApiKey synchronizes without
      // network (the 0.82 allowNetwork:false option became the default).
      await modelRuntime.setRuntimeApiKey(
        config.modelProvider,
        config.runtimeApiKey
      );
    }
    const model = modelRuntime.getModel(config.modelProvider, config.modelId);
    if (!model) {
      const loadError = modelRuntime.getError();
      throw new Error(
        `Unknown model: ${config.modelProvider}/${config.modelId}${
          loadError ? ` (${loadError})` : ""
        }`
      );
    }
    sessionOpts.modelRuntime = modelRuntime;
    sessionOpts.model = model;
  }
  if (config.thinkingLevel) {
    sessionOpts.thinkingLevel = config.thinkingLevel;
  }

  // Keep the full Pi tool registry (no allowlist — an allowlist is a hard
  // registry filter for the session's lifetime, which would block a later
  // in-session mode switch). The per-mode restriction is the ACTIVE tool set,
  // applied below via setActiveToolsByName. The guarded write tool is always
  // registered so it shadows Pi's builtin write in every mode.
  await Promise.all(altWritableRoots.map((root) => mkdir(root, { recursive: true })));
  sessionOpts.customTools = [
    createWriteToolDefinition(cwd, {
      operations: createGuardedWriteOperations(
        writableRootsForMode,
        isFullAccessEffective,
        onceWritablePaths,
      ),
    }),
    // Web-access tools ship DISABLED: registered here so the plumbing and
    // security-extension SSRF coverage exist, but absent from every mode's
    // active set (activeToolsForMode). Enablement is a post-1.3 decision.
    ...createWebAccessToolDefinitions(),
    ...(config.extraTools ?? []),
  ];

  // Extra tools (agent team) are shared application infrastructure.
  const extraToolNames = (config.extraTools ?? []).map((tool) => tool.name);
  const activeTools = () => [
    ...activeToolsForMode(isReadOnly()),
    ...extraToolNames,
  ];

  const { session } = await createAgentSession(sessionOpts);
  session.setActiveToolsByName(activeTools());
  const createdAt = new Date().toISOString();
  if (openMode.openedFrom === "new") {
    session.sessionManager.appendCustomEntry("alt-theory-session-created", {
      createdAt,
    });
  }

  const externalPaths = new Set(
    externalSkills.skills.map((s) => resolve(s.filePath))
  );
  const manifest: AssemblyManifest = {
    sessionId: config.sessionId,
    createdAt,
    openedFrom: openMode.openedFrom,
    appContext: fileRef(resolvedAppContextPath),
    soul: {
      ...(resolvedSoulPath ? fileRef(resolvedSoulPath) : emptyFileRef()),
      slug: config.soulSlug ?? null,
    },
    rolePreset: {
      ...(resolvedRolePresetPath
        ? fileRef(resolvedRolePresetPath)
        : emptyFileRef()),
      slug: config.rolePresetSlug ?? null,
    },
    customInstruction: {
      ...(resolvedCustomInstructionPath
        ? fileRef(resolvedCustomInstructionPath)
        : emptyFileRef()),
      ref: config.customInstructionRef ?? null,
      optional: true,
    },
    skills: loader
      .getSkills()
      .skills.flatMap((skill) => {
        const path = resolve(skill.filePath);
        const source =
          resolvedSkillsDir && isPathInside(resolvedSkillsDir, path)
            ? ("alt-theory" as const)
            : externalPaths.has(path)
              ? ("external" as const)
              : workspaceSkillRoots().some((root) => isPathInside(root, path))
                ? ("workspace" as const)
                : null;
        if (!source) return [];
        return [
          {
            name: skill.name,
            path,
            sha256: fileRef(skill.filePath).sha256,
            source,
          },
        ];
      }),
    piAdapter: {
      promptTemplatesDir: resolvedPiPromptTemplatesDir,
      promptTemplatesExist: resolvedPiPromptTemplatesDir
        ? existsSync(resolvedPiPromptTemplatesDir)
        : false,
    },
    kbDomain,
    kb: {
      rootDir: resolvedKbDir,
      domain: kbDomain,
      domainPath:
        kbDomain === "all" || kbDomain === KB_DISABLED_DOMAIN
          ? null
          : resolve(resolvedKbDir, kbDomain),
      domainExists:
        kbDomain === "all"
          ? true
          : kbDomain === KB_DISABLED_DOMAIN
            ? false
            : existsSync(resolve(resolvedKbDir, kbDomain)),
      metadata: kbMetadata,
    },
    sessionCwd: cwd,
    workspace: {
      primaryDir: cwd,
    },
    piSessionDir: resolvedPiSessionDir,
    piSessionFile: session.sessionFile ?? null,
    recordsDir: resolvedRecordsDir,
    writeDir: resolvedWriteDir,
    writableRoots: writableRootsForMode().map((root) => root.path),
    model: isNoModelPlaceholder(session.model) ? null : (session.model?.id ?? null),
    provider: isNoModelPlaceholder(session.model)
      ? null
      : (session.model?.provider ?? null),
    altMode: runtimeState.altMode,
    resourceDiscovery: {
      mode: resourceDiscovery,
      skillsDir: resolvedSkillsDir,
    },
    runLabel: config.runLabel ?? null,
    testBatch: config.testBatch ?? null,
  };

  const resumeWarnings =
    openMode.openedFrom === "existing"
      ? uniqueWarnings([
          ...openMode.initialWarnings,
          ...compareResumeManifest(
            openMode.originalManifest,
            manifest,
            sessionManager.getCwd(),
            cwd
          ),
        ])
      : [];
  if (openMode.openedFrom === "existing") {
    manifest.resumedFrom = summarizeOriginalManifest(openMode.originalManifest);
    manifest.resumeWarnings = resumeWarnings;
  }


  writeJsonAtomic(join(resolvedRecordsDir, openMode.manifestFileName), manifest);

  return {
    session,
    manifest,
    resumeWarnings,
    getAltMode: () => runtimeState.altMode,
    setAltMode: async (next: AltMode): Promise<void> => {
      runtimeState.readOnlyHeld = false;
      if (next === runtimeState.altMode) return;
      runtimeState.altMode = next;
      manifest.altMode = next;
      await loader.reload();
      session.setActiveToolsByName(activeTools());
    },
    getRuntimeMode: () => runtimeState.runtimeMode,
    setRuntimeMode: async (next: RuntimeMode): Promise<void> => {
      if (next === runtimeState.runtimeMode) return;
      runtimeState.runtimeMode = next;
      await loader.reload();
      session.setActiveToolsByName(activeTools());
    },
    setNativePiScanAltSkills: async (enabled: boolean): Promise<void> => {
      if (enabled === runtimeState.nativePiScanAltSkills) return;
      runtimeState.nativePiScanAltSkills = enabled;
      await loader.reload();
    },
    /** A pending switch to read-only mediates at once (see readOnlyHeld). */
    holdReadOnly: (held: boolean): void => {
      runtimeState.readOnlyHeld = held;
    },
    getFullAccess: () => runtimeState.fullAccess,
    isFullAccessEffective,
    setFullAccess: (enabled: boolean): void => {
      // The server rejects non-local enables. Under read-only the value is
      // dormant (isFullAccessEffective), so the order of the two switches
      // behind one permission choice does not matter.
      runtimeState.fullAccess = enabled;
    },
    getWorkspace: () => ({
      primaryDir: cwd,
    }),
  };
}

/**
 * Read a companion folder's own context file (spec §5.1; v1.5.1: companions
 * belong to the project). Matches Pi's candidate names; unlike the primary
 * directory, companion folders do not climb their ancestor chain — the user
 * added this folder, not its parents.
 */
function readWorkspaceContextFile(
  dir: string
): { path: string; content: string } | undefined {
  for (const name of ["AGENTS.md", "AGENTS.MD", "CLAUDE.md", "CLAUDE.MD"]) {
    const path = join(dir, name);
    if (existsSync(path)) {
      return { path, content: readFileSync(path, "utf-8") };
    }
  }
  return undefined;
}

function summarizeOriginalManifest(
  manifest: AssemblyManifest | null
): AssemblyManifest["resumedFrom"] {
  if (!manifest) {
    return {
      sessionId: null,
      createdAt: null,
      rolePresetSlug: null,
      kbDomain: null,
      provider: null,
      model: null,
    };
  }
  return {
    sessionId: manifest.sessionId ?? null,
    createdAt: manifest.createdAt ?? null,
    rolePresetSlug: manifest.rolePreset?.slug ?? null,
    kbDomain: manifest.kb?.domain ?? manifest.kbDomain ?? null,
    provider: manifest.provider ?? null,
    model: manifest.model ?? null,
  };
}

function createGuardedWriteOperations(
  getWritableRoots: () => Root[],
  skipBoundaryCheck?: () => boolean,
  oncePaths?: Set<string>,
): WriteOperations {
  const roots = () => getWritableRoots();
  // A read-only "Allow once" names one physical file (canonicalPathKey, so
  // a symlinked parent cannot redirect it): the file write must be exactly
  // it and consumes it; mkdir may create the folders on the way to it.
  const approvedOnce = (path: string, folder: boolean) => {
    const target = canonicalPathKey(path);
    for (const once of oncePaths ?? []) {
      if (once === target || (folder && once.startsWith(target + sep))) return true;
    }
    return false;
  };
  // Full Access skips only the writable-root assertion; the filesystem
  // operation itself is unchanged (v1.4.8).
  const assertWritable = (path: string, folder: boolean) => {
    if (skipBoundaryCheck?.() || approvedOnce(path, folder)) return;
    assertWritablePath(path, roots());
  };
  return {
    async mkdir(dir: string): Promise<void> {
      await assertWritable(dir, true);
      await mkdir(dir, { recursive: true });
    },
    async writeFile(path: string, content: string): Promise<void> {
      await assertWritable(path, false);
      oncePaths?.delete(canonicalPathKey(path));
      await writeFile(path, content, "utf-8");
    },
  };
}

function mergeSkills(
  current: { skills: Skill[]; diagnostics: ResourceDiagnostic[] },
  altTheory: { skills: Skill[]; diagnostics: ResourceDiagnostic[] }
) {
  const byName = new Map(current.skills.map((skill) => [skill.name, skill]));
  for (const skill of altTheory.skills) {
    byName.set(skill.name, skill);
  }
  return {
    skills: [...byName.values()],
    diagnostics: [...current.diagnostics, ...altTheory.diagnostics],
  };
}

function compareResumeManifest(
  original: AssemblyManifest | null,
  active: AssemblyManifest,
  originalCwd: string,
  activeCwd: string
): string[] {
  const warnings: string[] = [];
  if (!original) {
    warnings.push("original assembly manifest is missing");
    return warnings;
  }

  compareField(
    warnings,
    "provider",
    original.provider ?? null,
    active.provider ?? null
  );
  compareField(warnings, "model", original.model ?? null, active.model ?? null);
  compareField(
    warnings,
    "role preset",
    original.rolePreset?.slug ?? null,
    active.rolePreset?.slug ?? null
  );
  compareField(
    warnings,
    "KB domain",
    original.kb?.domain ?? original.kbDomain ?? null,
    active.kb?.domain ?? active.kbDomain ?? null
  );
  compareField(
    warnings,
    "app context hash",
    original.appContext?.sha256 ?? null,
    active.appContext?.sha256 ?? null
  );
  compareField(
    warnings,
    "custom instruction hash",
    original.customInstruction?.sha256 ?? null,
    active.customInstruction?.sha256 ?? null
  );
  compareField(
    warnings,
    "soul hash",
    original.soul?.sha256 ?? null,
    active.soul?.sha256 ?? null
  );
  compareField(
    warnings,
    "role preset hash",
    original.rolePreset?.sha256 ?? null,
    active.rolePreset?.sha256 ?? null
  );

  if (resolve(originalCwd) !== resolve(activeCwd)) {
    warnings.push("session cwd differs from current session workspace");
  }

  return warnings;
}

function compareField(
  warnings: string[],
  label: string,
  original: string | null,
  active: string | null
) {
  if (original !== active) {
    warnings.push(`${label} differs from original session`);
  }
}

function uniqueWarnings(warnings: string[]): string[] {
  return [...new Set(warnings)];
}

