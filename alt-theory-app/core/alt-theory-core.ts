/**
 * Alt Theory Core Layer
 *
 * Provides `createAltTheorySession(config)` — the unified API for all Alt Theory frontends.
 * Handles: system prompt assembly, role-preset injection, KB path binding, tool selection.
 *
 * @module alt-theory-core
 */

import {
  AuthStorage,
  createAgentSession,
  createWriteToolDefinition,
  DefaultResourceLoader,
  getAgentDir,
  loadProjectContextFiles,
  loadSkills,
  loadSkillsFromDir,
  ModelRegistry,
  type ResourceDiagnostic,
  SessionManager,
  type Skill,
  type WriteOperations,
} from "@earendil-works/pi-coding-agent";
import type { ThinkingLevel } from "@earendil-works/pi-agent-core";
import { existsSync, readFileSync, statSync } from "fs";
import { mkdir, realpath, writeFile } from "fs/promises";
import { dirname, isAbsolute, join, relative, resolve } from "path";
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
  };
  skills: Array<{
    name: string;
    path: string;
    sha256: string | null;
    /**
     * alt-theory = bundled; external = user-enabled via settings; workspace =
     * project skills from a Full-mode working directory (spec §5.1). Ambient
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
   * Full-mode workspace (spec §5.1): the primary working directory is the
   * session cwd; additional directories are intentional user additions whose
   * context files and project skills join the assembly in Full.
   */
  workspace: {
    primaryDir: string;
    additionalDirs: string[];
  };
  piSessionDir: string;
  piSessionFile: string | null;
  recordsDir: string;
  writeDir: string | null;
  writableRoots: string[];
  model: string | null;
  provider: string | null;
  promptMode: PromptMode;
  resourceDiscovery: {
    mode: ResourceDiscoveryMode;
    skillsDir: string | null;
  };
  runLabel: string | null;
  testBatch: string | null;
}

export type ResourceDiscoveryMode = "clean" | "internal" | "dev-debug";
export type PromptMode = "pi-default" | "alt-only";
/**
 * Session capability mode (spec §4). Persisted via the existing manifest
 * `promptMode` field: pure ⟺ alt-only, full ⟺ pi-default.
 */
export type CapabilityMode = "pure" | "full";
export const KB_DISABLED_DOMAIN = "none";

export function capabilityModeFromPromptMode(promptMode: PromptMode): CapabilityMode {
  return promptMode === "alt-only" ? "pure" : "full";
}

export function promptModeFromCapabilityMode(mode: CapabilityMode): PromptMode {
  return mode === "pure" ? "alt-only" : "pi-default";
}

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
  /** Read-only mode: only read/search tools; coding mode: full read/write/edit/bash */
  readOnly: boolean;
  /** Optional custom Pi models.json path */
  modelsPath?: string;
  /** Explicit provider/model selection */
  modelProvider?: string;
  modelId?: string;
  /** Runtime-only API key; never persisted by Alt Theory */
  runtimeApiKey?: string;
  thinkingLevel?: ThinkingLevel;
  writableAssetDir?: string;
  runLabel?: string | null;
  testBatch?: string | null;
  promptMode?: PromptMode;
  resourceDiscovery?: ResourceDiscoveryMode;
  skillsDir?: string;
  /**
   * User-enabled external skill paths (files or directories) per capability
   * mode, resolved by the app settings layer (spec §6.1). Snapshot at session
   * open; settings changes apply on session reload. External skills are never
   * silently enabled: absent lists mean Alt bundled skills only.
   */
  externalSkillPaths?: { pure?: string[]; full?: string[] };
  /**
   * Additional workspace directories (spec §5.1), applied in Full mode only.
   * The primary working directory is sessionCwd. Each added directory
   * contributes its AGENTS.md/CLAUDE.md and project skills to the assembly
   * and joins the guarded-write roots.
   */
  workspaceDirs?: string[];
}

export interface AltTheoryOpenExistingConfig extends AltTheoryConfig {
  /** Existing Pi JSONL file to open */
  sessionFile: string;
  /** Original assembly manifest, when available, used for drift warnings */
  originalManifest?: AssemblyManifest | null;
  /** Override the Pi header cwd for a copied comparison workspace. */
  overrideSessionCwd?: boolean;
}

/** Read-only tool allowlist (no write/edit/bash) */
const READONLY_TOOLS = ["read", "ls", "grep", "find"];
/** Conference-stage note mode: read/search plus write, without edit or bash. */
const WRITE_ENABLED_TOOLS = [...READONLY_TOOLS, "write"];
/** Pi's own default active toolset — Full mode preserves Pi behavior. */
const PI_DEFAULT_TOOLS = ["read", "bash", "edit", "write"];

function activeToolsForMode(mode: CapabilityMode, readOnly: boolean): string[] {
  if (mode === "full") return PI_DEFAULT_TOOLS;
  return readOnly ? READONLY_TOOLS : WRITE_ENABLED_TOOLS;
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
    readOnly,
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
  const promptMode = config.promptMode ?? "alt-only";
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

  // --- 2. Assemble the Alt Theory prompt layers ---
  //    Semantic sections (both modes): app context -> optional soul -> optional
  //    role -> optional instruction -> KB path declaration.
  //    Pure-only sections: tool harness + write policy (in Full, Pi's own
  //    default prompt documents the tool environment).
  const semanticSections: string[] = [];
  semanticSections.push(`## Alt Theory Application Context\n${appContextContent}`);
  if (soulContent) {
    semanticSections.push(`## Soul\n${soulContent}`);
  }
  if (rolePresetContent) {
    semanticSections.push(`## Role\n${rolePresetContent}`);
  }
  if (customInstructionContent) {
    semanticSections.push(`## Custom Instruction\n${customInstructionContent}`);
  }
  const kbDomain = config.kbDomain ?? "all";
  const kbEnabled = kbDomain !== KB_DISABLED_DOMAIN;
  const kbMetadata =
    kbEnabled && kbDomain !== "all"
      ? findKbDomainMetadata(resolvedKbDir, kbDomain)
      : null;
  const kbMetadataPrompt = formatKbMetadataPrompt(kbMetadata);
  if (kbEnabled) {
    semanticSections.push(
      `## Knowledge Base\nYour knowledge base is at: ${resolvedKbDir}`
    );
    if (kbMetadataPrompt) {
      semanticSections.push(`## Knowledge Base Metadata\n${kbMetadataPrompt}`);
    }
  } else {
    semanticSections.push(
      "## Knowledge Base\nKnowledge-base folder retrieval is disabled for this session. You may still read user workspace files when requested."
    );
  }
  const pureOnlySections: string[] = [];
  pureOnlySections.push(
    [
      "## Alt Theory Tool Harness",
      "You are operating inside the Pi harness as the tool runtime for Alt Theory.",
      "This describes your tool environment, not your identity; do not describe yourself as Pi.",
      "Available tools:",
      "- read: read file contents",
      "- ls: list directory contents",
      "- grep: search file contents for patterns",
      "- find: find files by glob pattern",
      ...(readOnly
        ? []
        : [
            "- write: create or overwrite files only inside Alt Theory writable roots",
          ]),
    ].join("\n")
  );
  if (!readOnly) {
    const writableRoots = [resolvedWriteDir, resolvedWritableAssetDir];
    pureOnlySections.push(
      [
        "## Write Policy",
        "The write tool is hard-limited to these writable roots:",
        ...writableRoots.map((root) => `- ${root}`),
        "Treat the knowledge base, role presets, prompts, and system files as read-only.",
      ].join("\n")
    );
  }
  const altTheorySystemPrompt = [...semanticSections, ...pureOnlySections].join(
    "\n\n"
  );

  // Mutable capability-mode state, read by the loader overrides at each
  // reload. Switching mode = update state + loader.reload() +
  // setActiveToolsByName(); Pi applies both from the next turn (spec §3.2).
  const modeState = { mode: capabilityModeFromPromptMode(promptMode) };
  // Mutable workspace state (spec §5.1). The primary working directory is the
  // session cwd; additional directories are intentional user additions.
  // Adding one mutates this state and reloads the loader — the overrides
  // below re-read it, so the new directory's context files and project
  // skills apply from the next turn.
  const workspaceState = {
    additionalDirs: (config.workspaceDirs ?? []).map((dir) => resolve(dir)),
  };
  const altTheorySkills =
    resourceDiscovery !== "clean" && resolvedSkillsDir
      ? loadSkillsFromDir({
          dir: resolvedSkillsDir,
          source: "alt-theory",
        })
      : { skills: [], diagnostics: [] };
  // User-enabled external skills, snapshot per mode at session open (spec
  // §6.1). Loaded through Pi's own resolver so files, directories, and skill
  // packages all behave exactly as they would in Pi.
  const loadExternalSkills = (paths?: string[]) =>
    resourceDiscovery !== "clean" && paths?.length
      ? loadSkills({ cwd, agentDir, skillPaths: paths, includeDefaults: false })
      : { skills: [], diagnostics: [] };
  const externalSkillsByMode: Record<
    CapabilityMode,
    ReturnType<typeof loadExternalSkills>
  > = {
    pure: loadExternalSkills(config.externalSkillPaths?.pure),
    full: loadExternalSkills(config.externalSkillPaths?.full),
  };
  // Project skills from the Full workspace (spec §5.1): the primary and each
  // added directory contribute their standard project skill locations.
  // Re-read at every loader reload so directories added mid-session apply.
  const workspaceSkillRoots = () =>
    [cwd, ...workspaceState.additionalDirs].flatMap((dir) =>
      [".pi/skills", ".agents/skills"].map((sub) => join(dir, sub))
    );
  const loadWorkspaceSkills = () =>
    resourceDiscovery !== "clean" && modeState.mode === "full"
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
    // Extensions stay off in every mode until the M3/M4 approval bridge and
    // policy layer exist: loading an extension executes its code, which Pure
    // must never do silently (spec §3.4) and Full may only do behind the
    // policy boundary (spec §4.2).
    noExtensions: true,
    noContextFiles: resourceDiscovery !== "dev-debug",
    // Pure replaces Pi's prompt with the Alt assembly; Full preserves Pi's
    // default prompt (base) and appends the semantic Alt sections (spec §3.3).
    systemPromptOverride: (base) =>
      modeState.mode === "pure" ? altTheorySystemPrompt : base,
    // The enabled set — Alt bundled plus the current mode's user-enabled
    // external skills — is the source of truth. Pi's own discovery feeds the
    // settings page listing, not the session (one-way discovery, spec §6.1);
    // only dev-debug merges the ambient Pi-discovered set for debugging.
    skillsOverride: (current) => {
      if (resourceDiscovery === "clean") {
        return { skills: [], diagnostics: [] };
      }
      const selected = mergeSkills(
        mergeSkills(altTheorySkills, externalSkillsByMode[modeState.mode]),
        loadWorkspaceSkills()
      );
      return resourceDiscovery === "internal"
        ? selected
        : mergeSkills(current, selected);
    },
    // Workspace context (spec §5.1), Full only: the primary directory gets
    // Pi's own discovery (global + ancestor AGENTS.md/CLAUDE.md chain); each
    // added directory contributes its own context file. Pure stays bounded
    // to the session workspace and receives none of this.
    agentsFilesOverride: (base) => {
      if (modeState.mode !== "full") {
        return base;
      }
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
      for (const dir of workspaceState.additionalDirs) {
        add(readWorkspaceContextFile(dir));
      }
      return { agentsFiles: files };
    },
    appendSystemPromptOverride: (base: string[]) =>
      modeState.mode === "pure" ? [] : [...base, ...semanticSections],
  });
  await loader.reload();

  // --- 3. Create session ---
  //    readOnly: use tool name allowlist (only read/ls/grep/find)
  //    coding: default tools (all built-in enabled)
  const sessionOpts: Parameters<typeof createAgentSession>[0] = {
    cwd,
    resourceLoader: loader,
    sessionManager,
  };

  if (config.modelProvider || config.modelId) {
    if (!config.modelProvider || !config.modelId) {
      throw new Error("modelProvider and modelId must be configured together");
    }
    const authStorage = AuthStorage.create();
    if (config.runtimeApiKey) {
      authStorage.setRuntimeApiKey(config.modelProvider, config.runtimeApiKey);
    }
    const modelRegistry = config.modelsPath
      ? ModelRegistry.create(authStorage, resolve(config.modelsPath))
      : ModelRegistry.create(authStorage);
    const model = modelRegistry.find(config.modelProvider, config.modelId);
    if (!model) {
      const loadError = modelRegistry.getError();
      throw new Error(
        `Unknown model: ${config.modelProvider}/${config.modelId}${
          loadError ? ` (${loadError})` : ""
        }`
      );
    }
    sessionOpts.authStorage = authStorage;
    sessionOpts.modelRegistry = modelRegistry;
    sessionOpts.model = model;
  }
  if (config.thinkingLevel) {
    sessionOpts.thinkingLevel = config.thinkingLevel;
  }

  // Keep the full Pi tool registry (no allowlist — an allowlist is a hard
  // registry filter for the session's lifetime, which would block a later
  // in-session mode switch). The per-mode restriction is the ACTIVE tool set,
  // applied below via setActiveToolsByName. The guarded write tool is always
  // registered so it shadows Pi's builtin write in every mode. Its roots are
  // evaluated per call: Pure stays bounded to the Alt writable roots; Full
  // additionally writes within its workspace (primary + added directories).
  const altWritableRoots = [resolvedWriteDir, resolvedWritableAssetDir];
  const writableRootsForMode = () =>
    modeState.mode === "full"
      ? [...altWritableRoots, cwd, ...workspaceState.additionalDirs]
      : altWritableRoots;
  if (!readOnly) {
    await Promise.all(altWritableRoots.map((root) => mkdir(root, { recursive: true })));
  }
  sessionOpts.customTools = [
    createWriteToolDefinition(cwd, {
      operations: createGuardedWriteOperations(writableRootsForMode),
    }),
  ];

  const { session } = await createAgentSession(sessionOpts);
  session.setActiveToolsByName(activeToolsForMode(modeState.mode, readOnly));
  const createdAt = new Date().toISOString();
  if (openMode.openedFrom === "new") {
    session.sessionManager.appendCustomEntry("alt-theory-session-created", {
      createdAt,
    });
  }

  const externalPaths = new Set(
    externalSkillsByMode[modeState.mode].skills.map((s) => resolve(s.filePath))
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
      additionalDirs: [...workspaceState.additionalDirs],
    },
    piSessionDir: resolvedPiSessionDir,
    piSessionFile: session.sessionFile ?? null,
    recordsDir: resolvedRecordsDir,
    writeDir: readOnly ? null : resolvedWriteDir,
    writableRoots: readOnly ? [] : writableRootsForMode(),
    model: session.model?.id ?? null,
    provider: session.model?.provider ?? null,
    promptMode,
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
    getMode: () => modeState.mode,
    /**
     * Switch capability mode on the live session (spec §3.2). Re-evaluates the
     * prompt layers and swaps the active tool set; Pi applies both from the
     * next turn. No session rebuild, no new session row.
     */
    setMode: async (next: CapabilityMode): Promise<void> => {
      if (next === modeState.mode) return;
      modeState.mode = next;
      await loader.reload();
      session.setActiveToolsByName(activeToolsForMode(next, readOnly));
    },
    getWorkspace: () => ({
      primaryDir: cwd,
      additionalDirs: [...workspaceState.additionalDirs],
    }),
    /**
     * Add a workspace directory to the live session (spec §5.1). Its context
     * files and project skills apply from the next turn via loader reload;
     * it also joins the Full guarded-write roots.
     */
    addWorkspaceDir: async (dir: string): Promise<string[]> => {
      const resolved = resolve(dir);
      if (!statSync(resolved, { throwIfNoEntry: false })?.isDirectory()) {
        throw new Error(`Workspace directory does not exist: ${resolved}`);
      }
      if (
        resolved !== cwd &&
        !workspaceState.additionalDirs.includes(resolved)
      ) {
        workspaceState.additionalDirs.push(resolved);
        manifest.workspace.additionalDirs = [...workspaceState.additionalDirs];
        // session.reload() (not a bare loader.reload()) so Pi rebuilds the
        // runtime and system prompt from the reloaded resources.
        await session.reload();
      }
      return [...workspaceState.additionalDirs];
    },
  };
}

/**
 * Read an added workspace directory's own context file (spec §5.1). Matches
 * Pi's candidate names; unlike the primary directory, added directories do
 * not climb their ancestor chain — the user added this directory, not its
 * parents.
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
  getWritableRoots: () => string[]
): WriteOperations {
  const roots = () => getWritableRoots().map((root) => resolve(root));
  return {
    async mkdir(dir: string): Promise<void> {
      await assertWritablePath(dir, roots());
      await mkdir(dir, { recursive: true });
    },
    async writeFile(path: string, content: string): Promise<void> {
      await assertWritablePath(path, roots());
      await writeFile(path, content, "utf-8");
    },
  };
}

async function assertWritablePath(path: string, writableRoots: string[]): Promise<void> {
  const resolvedPath = resolve(path);
  const lexicalRoot = writableRoots.find((root) => isPathInside(root, resolvedPath));
  if (!lexicalRoot) {
    throw new Error(
      `Write blocked: ${resolvedPath} is outside Alt Theory writable roots.`
    );
  }

  const realRoots = await Promise.all(writableRoots.map((root) => realpath(root)));
  const realRoot = realRoots.find((root) => isPathInside(root, resolvedPath));
  if (!realRoot) {
    const lexicalIndex = writableRoots.indexOf(lexicalRoot);
    const fallbackRoot = realRoots[lexicalIndex];
    if (!fallbackRoot) {
      throw new Error(`Write blocked: writable root is unavailable: ${lexicalRoot}`);
    }
  }

  const existingPath = await nearestExistingPath(resolvedPath);
  const realExistingPath = await realpath(existingPath);
  if (!realRoots.some((root) => isPathInside(root, realExistingPath))) {
    throw new Error(
      `Write blocked: ${resolvedPath} resolves outside Alt Theory writable roots.`
    );
  }
}

async function nearestExistingPath(path: string): Promise<string> {
  let current = resolve(path);
  while (!existsSync(current)) {
    const parent = dirname(current);
    if (parent === current) return current;
    current = parent;
  }
  return current;
}

function isPathInside(root: string, target: string): boolean {
  const resolvedRoot = normalizePath(resolve(root));
  const resolvedTarget = normalizePath(resolve(target));
  const relativePath = relative(resolvedRoot, resolvedTarget);
  return (
    relativePath === "" ||
    (!relativePath.startsWith("..") && !isAbsolute(relativePath))
  );
}

function normalizePath(path: string): string {
  return process.platform === "win32" ? path.toLowerCase() : path;
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

