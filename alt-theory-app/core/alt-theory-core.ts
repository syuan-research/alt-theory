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
import { appendFileSync, existsSync, readFileSync, statSync } from "fs";
import { mkdir, writeFile } from "fs/promises";
import { dirname, join, resolve } from "path";
import {
  assertWritablePath,
  createSecurityExtension,
  isPathInside,
} from "./security-extension.js";
import { createTurnContinuityExtension } from "./turn-continuity.js";
import { createPromptCacheContinuityExtension } from "./prompt-cache-continuity.js";
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
   * session cwd; additional directories are intentional user additions whose
   * context files and project skills join the work-capable assembly.
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
export type AltMode = "understand" | "work";
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
  /** Understand-only policy: omit even its bounded note-writing tool. */
  understandReadOnly: boolean;
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
  resourceDiscovery?: ResourceDiscoveryMode;
  skillsDir?: string;
  /**
   * User-enabled external skill paths (files or directories) per Alt mode
   * mode, resolved by the app settings layer (spec §6.1). Snapshot at session
   * open; settings changes apply on session reload. External skills are never
   * silently enabled: absent lists mean Alt bundled skills only.
   */
  externalSkillPaths?: { understand?: string[]; work?: string[] };
  /** App setting (§6.1) deciding bundled-vs-user skill precedence in the prompt. */
  skillPrecedence?: "prefer-bundled" | "prefer-user" | "ask";
  /**
   * Additional workspace directories (spec §5.1), applied in Work/Native only.
   * The primary working directory is sessionCwd. Each added directory
   * contributes its AGENTS.md/CLAUDE.md and project skills to the assembly
   * and joins the guarded-write roots.
   */
  workspaceDirs?: string[];
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
}

/**
 * Per-model reminders (v1.4 round 1). Leading words only: they cite the
 * concepts ALTTHEORY.md defines (whole-problem continuity, half-step
 * advance) rather than restating them — single source of truth.
 */
export function modelHookSection(modelId: string | undefined): string | null {
  if (!modelId) return null;
  if (/^gpt-5/i.test(modelId)) {
    return [
      "## Model Reminder",
      "WHOLE-PROBLEM CONTINUITY REMINDER — Apply whole-problem continuity and half-step advance, as defined in the Alt Theory Application Context, with one emphasis: do not stop at acknowledgement, apology, or analysis. Connect every reply to the user's nearer sub-goal and wider purpose, and unless the user asked a closed question, end with two or three concrete next-direction options, marking your recommendation. Passivity is the failure mode to avoid here — a grounded half-step forward is always available.",
    ].join("\n");
  }
  if (/deepseek-v4-flash/i.test(modelId)) {
    return [
      "## Model Reminder",
      "NON-COMMAND DISCIPLINE REMINDER — Apply whole-problem continuity and half-step advance, as defined in the Alt Theory Application Context, with one emphasis: never treat a non-command as a command. A correction, observation, judgement, or agreement is not an instruction. When uncertain whether the user instructed an action, treat it as not instructed: acknowledge briefly and reply with concrete next-step options rather than proactively proceeding.",
    ].join("\n");
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

/** Read-only tool allowlist (no write/edit/bash) */
const READONLY_TOOLS = ["read", "ls", "grep", "find"];
/** Conference-stage note mode: read/search plus write, without edit or bash. */
const WRITE_ENABLED_TOOLS = [...READONLY_TOOLS, "write"];
/** Pi's own default active toolset for Work and Native Pi. */
const PI_DEFAULT_TOOLS = ["read", "bash", "edit", "write"];

function activeToolsForMode(workCapable: boolean, understandReadOnly: boolean): string[] {
  if (workCapable) return PI_DEFAULT_TOOLS;
  return understandReadOnly ? READONLY_TOOLS : WRITE_ENABLED_TOOLS;
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
    understandReadOnly,
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
    altMode: config.altMode ?? ("understand" as AltMode),
    nativePiScanAltSkills: config.nativePiScanAltSkills !== false,
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
  // ponytail: hook chosen at assembly; a mid-session model switch keeps the
  // old hook until the session reopens. Re-derive per turn if that bites.
  const modelHook =
    runtimeState.runtimeMode === "alt-theory"
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
  const understandOnlySections: string[] = [];
  understandOnlySections.push(
    [
      "## Alt Theory Tool Harness",
      "Current mode: Understand. Live lookup, attached working folders, edit, and shell need Work mode; the user switches mode in the UI. Session-workspace notes may still be writable here.",
      "You are operating inside the Pi harness as the tool runtime for Alt Theory.",
      "This describes your tool environment, not your identity; do not describe yourself as Pi.",
      "Available tools:",
      "- read: read file contents",
      "- ls: list directory contents",
      "- grep: search file contents for patterns",
      "- find: find files by glob pattern",
      ...(understandReadOnly
        ? []
        : [
            "- write: create or overwrite files only inside Alt Theory writable roots",
          ]),
    ].join("\n")
  );
  if (!understandReadOnly) {
    const writableRoots = [resolvedWriteDir, resolvedWritableAssetDir];
    understandOnlySections.push(
      [
        "## Write Policy",
        "The write tool is hard-limited to these writable roots:",
        ...writableRoots.map((root) => `- ${root}`),
        "Treat the knowledge base, role presets, prompts, and system files as read-only.",
      ].join("\n")
    );
  }
  const altTheorySystemPrompt = [...altSections, ...sharedSections, ...understandOnlySections].join(
    "\n\n"
  );

  const isWorkCapable = () =>
    runtimeState.runtimeMode === "native-pi" || runtimeState.altMode === "work";
  const hasWriteCapability = () =>
    isWorkCapable() || !understandReadOnly;
  // Mutable workspace state (spec §5.1). The primary working directory is the
  // session cwd; additional directories are intentional user additions.
  // Adding one mutates this state and reloads the loader — the overrides
  // below re-read it, so the new directory's context files and project
  // skills apply from the next turn.
  const workspaceState = {
    additionalDirs: (config.workspaceDirs ?? []).map((dir) => resolve(dir)),
  };
  // Writable roots are evaluated per call: Understand stays bounded to the
  // Alt writable roots; Work and Native Pi additionally write within the
  // workspace (primary + added directories). Shared by the guarded write
  // tool and the security extension.
  const altWritableRoots = [resolvedWriteDir, resolvedWritableAssetDir];
  const approvedWritableRoots = new Set<string>();
  const writableRootsForMode = () =>
    isWorkCapable()
      ? [
          ...altWritableRoots,
          cwd,
          ...workspaceState.additionalDirs,
          ...approvedWritableRoots,
        ]
      : [...altWritableRoots, ...approvedWritableRoots];
  // Readable roots: everything writable, plus the workspace primary and the
  // knowledge base (which legitimately lives outside cwd). Reads outside these
  // escalate to approval; reading is not the security boundary (spec §5.3),
  // this only matches the OpenCode/Claude Code external-directory prompt.
  const readableRootsForMode = () => [
    ...writableRootsForMode(),
    cwd,
    resolvedKbDir,
    // Bundled skills are runtime-read assets like the KB; without this,
    // every skill invocation prompts "read outside your workspace"
    // (found by the v1.3.0-alpha.1 walkthrough acceptance).
    ...(resolvedSkillsDir ? [resolvedSkillsDir] : []),
  ];
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
  const WORK_ONLY_BUNDLED_SKILLS = new Set([
    "web-search",
    "page-fetch",
    "doc-convert",
  ]);
  const bundledSkillsForMode = () =>
    runtimeState.altMode === "work"
      ? altTheorySkills
      : {
          skills: altTheorySkills.skills.filter(
            (skill) => !WORK_ONLY_BUNDLED_SKILLS.has(skill.name)
          ),
          diagnostics: altTheorySkills.diagnostics,
        };
  // User-enabled external skills, snapshot per mode at session open (spec
  // §6.1). Loaded through Pi's own resolver so files, directories, and skill
  // packages all behave exactly as they would in Pi.
  const loadExternalSkills = (paths?: string[]) =>
    resourceDiscovery !== "clean" && paths?.length
      ? loadSkills({ cwd, agentDir, skillPaths: paths, includeDefaults: false })
      : { skills: [], diagnostics: [] };
  const externalSkillsByMode: Record<
    AltMode,
    ReturnType<typeof loadExternalSkills>
  > = {
    understand: loadExternalSkills(config.externalSkillPaths?.understand),
    work: loadExternalSkills(config.externalSkillPaths?.work),
  };
  // Project skills from the work-capable workspace (spec §5.1): the primary and each
  // added directory contribute their standard project skill locations.
  // Re-read at every loader reload so directories added mid-session apply.
  const workspaceSkillRoots = () =>
    [cwd, ...workspaceState.additionalDirs].flatMap((dir) =>
      [".pi/skills", ".agents/skills"].map((sub) => join(dir, sub))
    );
  const loadWorkspaceSkills = () =>
    resourceDiscovery !== "clean" && isWorkCapable()
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
      // Strips orphaned toolCall blocks from errored/aborted partial
      // assistant messages so preserved break-point context never sends a
      // tool_use without its tool_result (alpha.5 M0 continuity repair).
      createTurnContinuityExtension(),
      createPromptCacheContinuityExtension(
        promptCacheFamilyId,
        () =>
          runtimeState.runtimeMode === "alt-theory" &&
          runtimeState.altMode === "understand" &&
          cwd === resolvedWriteDir,
      ),
      createSecurityExtension({
        sessionCwd: cwd,
        getWritableRoots: writableRootsForMode,
        getReadableRoots: readableRootsForMode,
        addWritableRoot: (root) => approvedWritableRoots.add(resolve(root)),
        recordAudit: (entry) =>
          appendFileSync(
            join(resolvedRecordsDir, "security-audit.jsonl"),
            `${JSON.stringify(entry)}\n`
          ),
      }),
    ],
    noContextFiles: resourceDiscovery !== "dev-debug",
    systemPromptOverride: (base) =>
      runtimeState.runtimeMode !== "alt-theory"
        ? base
        : runtimeState.altMode === "understand"
          ? altTheorySystemPrompt
          : config.trimmedPiBasePrompt
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
        mergeSkills(
          bundledSkillsForMode(),
          externalSkillsByMode[runtimeState.altMode]
        ),
        loadWorkspaceSkills()
      );
      return resourceDiscovery === "internal"
        ? selected
        : mergeSkills(current, selected);
    },
    // Workspace context: Work and Native Pi get the primary directory and
    // Pi's own discovery (global + ancestor AGENTS.md/CLAUDE.md chain); each
    // added directory contributes its own context file. Understand stays bounded
    // to the session workspace and receives none of this.
    agentsFilesOverride: (base) => {
      if (!isWorkCapable()) {
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
      runtimeState.runtimeMode === "native-pi"
        ? [...base, ...sharedSections]
        : runtimeState.altMode === "understand"
          ? []
          : [...base, WORK_MODE_PREFACE, ...altSections, ...sharedSections],
  });
  await loader.reload();

  // --- 3. Create session ---
  // Understand may be read-only or allow bounded note writing. Work and Native
  // Pi use the normal coding tools regardless of that Understand-only policy.
  const sessionOpts: Parameters<typeof createAgentSession>[0] = {
    cwd,
    resourceLoader: loader,
    sessionManager,
  };

  if (config.modelProvider || config.modelId) {
    if (!config.modelProvider || !config.modelId) {
      throw new Error("modelProvider and modelId must be configured together");
    }
    const modelRuntime = await ModelRuntime.create({
      authPath: config.authPath ? resolve(config.authPath) : undefined,
      modelsPath: config.modelsPath ? resolve(config.modelsPath) : undefined,
    });
    if (config.runtimeApiKey) {
      await modelRuntime.setRuntimeApiKey(
        config.modelProvider,
        config.runtimeApiKey,
        { allowNetwork: false }
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
  if (hasWriteCapability()) {
    await Promise.all(altWritableRoots.map((root) => mkdir(root, { recursive: true })));
  }
  sessionOpts.customTools = [
    createWriteToolDefinition(cwd, {
      operations: createGuardedWriteOperations(writableRootsForMode),
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
    ...activeToolsForMode(isWorkCapable(), understandReadOnly),
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
    externalSkillsByMode[runtimeState.altMode].skills.map((s) => resolve(s.filePath))
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
      additionalDirs: [...workspaceState.additionalDirs],
    },
    piSessionDir: resolvedPiSessionDir,
    piSessionFile: session.sessionFile ?? null,
    recordsDir: resolvedRecordsDir,
    writeDir: hasWriteCapability() ? resolvedWriteDir : null,
    writableRoots: hasWriteCapability() ? writableRootsForMode() : [],
    model: session.model?.id ?? null,
    provider: session.model?.provider ?? null,
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

  const syncManifestActionPolicy = () => {
    manifest.writeDir = hasWriteCapability() ? resolvedWriteDir : null;
    manifest.writableRoots = hasWriteCapability() ? writableRootsForMode() : [];
  };

  writeJsonAtomic(join(resolvedRecordsDir, openMode.manifestFileName), manifest);

  return {
    session,
    manifest,
    resumeWarnings,
    getAltMode: () => runtimeState.altMode,
    setAltMode: async (next: AltMode): Promise<void> => {
      if (next === runtimeState.altMode) return;
      runtimeState.altMode = next;
      manifest.altMode = next;
      await loader.reload();
      session.setActiveToolsByName(activeTools());
      syncManifestActionPolicy();
    },
    getRuntimeMode: () => runtimeState.runtimeMode,
    setRuntimeMode: async (next: RuntimeMode): Promise<void> => {
      if (next === runtimeState.runtimeMode) return;
      runtimeState.runtimeMode = next;
      await loader.reload();
      session.setActiveToolsByName(activeTools());
      syncManifestActionPolicy();
    },
    setNativePiScanAltSkills: async (enabled: boolean): Promise<void> => {
      if (enabled === runtimeState.nativePiScanAltSkills) return;
      runtimeState.nativePiScanAltSkills = enabled;
      await loader.reload();
    },
    getWorkspace: () => ({
      primaryDir: cwd,
      additionalDirs: [...workspaceState.additionalDirs],
    }),
    /**
     * Add a workspace directory to the live session (spec §5.1). Its context
     * files and project skills apply from the next turn via loader reload;
     * it also joins the Work/Native guarded-write roots.
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
        syncManifestActionPolicy();
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

