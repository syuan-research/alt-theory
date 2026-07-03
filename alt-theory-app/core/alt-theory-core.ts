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
  loadSkillsFromDir,
  ModelRegistry,
  type ResourceDiagnostic,
  SessionManager,
  type Skill,
  type WriteOperations,
} from "@mariozechner/pi-coding-agent";
import type { ThinkingLevel } from "@mariozechner/pi-agent-core";
import { existsSync } from "fs";
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
    source: "alt-theory";
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

  // --- 2. Assemble appendSystemPromptOverride ---
  //    Order: app context -> optional soul -> optional role -> optional instruction -> KB path declaration
  const appendContent: string[] = [];
  appendContent.push(`## Alt Theory Application Context\n${appContextContent}`);
  if (soulContent) {
    appendContent.push(`## Soul\n${soulContent}`);
  }
  if (rolePresetContent) {
    appendContent.push(`## Role\n${rolePresetContent}`);
  }
  if (customInstructionContent) {
    appendContent.push(`## Custom Instruction\n${customInstructionContent}`);
  }
  const kbDomain = config.kbDomain ?? "all";
  const kbEnabled = kbDomain !== KB_DISABLED_DOMAIN;
  const kbMetadata =
    kbEnabled && kbDomain !== "all"
      ? findKbDomainMetadata(resolvedKbDir, kbDomain)
      : null;
  const kbMetadataPrompt = formatKbMetadataPrompt(kbMetadata);
  if (kbEnabled) {
    appendContent.push(
      `## Knowledge Base\nYour knowledge base is at: ${resolvedKbDir}`
    );
    if (kbMetadataPrompt) {
      appendContent.push(`## Knowledge Base Metadata\n${kbMetadataPrompt}`);
    }
  } else {
    appendContent.push(
      "## Knowledge Base\nKnowledge-base folder retrieval is disabled for this session. You may still read user workspace files when requested."
    );
  }
  appendContent.push(
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
    appendContent.push(
      [
        "## Write Policy",
        "The write tool is hard-limited to these writable roots:",
        ...writableRoots.map((root) => `- ${root}`),
        "Treat the knowledge base, role presets, prompts, and system files as read-only.",
      ].join("\n")
    );
  }
  const altTheorySystemPrompt = appendContent.join("\n\n");
  const altTheorySkills =
    resourceDiscovery !== "clean" && resolvedSkillsDir
      ? loadSkillsFromDir({
          dir: resolvedSkillsDir,
          source: "alt-theory",
        })
      : { skills: [], diagnostics: [] };

  const loader = new DefaultResourceLoader({
    cwd,
    agentDir,
    additionalPromptTemplatePaths: resolvedPiPromptTemplatesDir
      ? [resolvedPiPromptTemplatesDir]
      : [],
    noContextFiles: resourceDiscovery !== "dev-debug",
    systemPromptOverride:
      promptMode === "alt-only" ? () => altTheorySystemPrompt : undefined,
    skillsOverride:
      resourceDiscovery === "clean"
        ? () => ({ skills: [], diagnostics: [] })
        : resourceDiscovery === "internal"
          ? () => altTheorySkills
          : (current) => mergeSkills(current, altTheorySkills),
    appendSystemPromptOverride:
      promptMode === "alt-only"
        ? () => []
        : (base: string[]) => [...base, ...appendContent],
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

  sessionOpts.noTools = "all";
  sessionOpts.tools = readOnly ? READONLY_TOOLS : WRITE_ENABLED_TOOLS;
  if (!readOnly) {
    const writableRoots = [resolvedWriteDir, resolvedWritableAssetDir];
    await Promise.all(writableRoots.map((root) => mkdir(root, { recursive: true })));
    sessionOpts.customTools = [
      createWriteToolDefinition(cwd, {
        operations: createGuardedWriteOperations(writableRoots),
      }),
    ];
  }

  const { session } = await createAgentSession(sessionOpts);
  const createdAt = new Date().toISOString();
  if (openMode.openedFrom === "new") {
    session.sessionManager.appendCustomEntry("alt-theory-session-created", {
      createdAt,
    });
  }

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
      .skills.filter((skill) =>
        resolvedSkillsDir
          ? isPathInside(resolvedSkillsDir, skill.filePath)
          : false
      )
      .map((skill) => ({
        name: skill.name,
        path: resolve(skill.filePath),
        sha256: fileRef(skill.filePath).sha256,
        source: "alt-theory" as const,
      })),
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
    },
    sessionCwd: cwd,
    piSessionDir: resolvedPiSessionDir,
    piSessionFile: session.sessionFile ?? null,
    recordsDir: resolvedRecordsDir,
    writeDir: readOnly ? null : resolvedWriteDir,
    writableRoots: readOnly ? [] : [resolvedWriteDir, resolvedWritableAssetDir],
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

  return { session, manifest, resumeWarnings };
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

function createGuardedWriteOperations(writableRoots: string[]): WriteOperations {
  const roots = writableRoots.map((root) => resolve(root));
  return {
    async mkdir(dir: string): Promise<void> {
      await assertWritablePath(dir, roots);
      await mkdir(dir, { recursive: true });
    },
    async writeFile(path: string, content: string): Promise<void> {
      await assertWritablePath(path, roots);
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

