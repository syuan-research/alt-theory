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
  DefaultResourceLoader,
  getAgentDir,
  ModelRegistry,
  SessionManager,
} from "@mariozechner/pi-coding-agent";
import type { ThinkingLevel } from "@mariozechner/pi-agent-core";
import { existsSync } from "fs";
import { join, resolve } from "path";
import {
  writeJsonAtomic,
  type SessionDirectories,
} from "./data-dir.js";
import { assembleCoreSoul } from "./core-soul.js";
import {
  fileRef,
  readRequiredTextAsset,
  type LoadedAssetFileRef,
} from "./agent-assets.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface CoreSoulModule {
  slug: string;
  variable: string;
  value: string;
  path: string;
}

export interface AssemblyManifest {
  sessionId: string;
  createdAt: string;
  appContext: LoadedAssetFileRef;
  soul: LoadedAssetFileRef;
  rolePreset: LoadedAssetFileRef & {
    slug: string;
  };
  coreSoul: {
    basePath: string | null;
    modules: CoreSoulModule[];
  };
  /** Deprecated compatibility field; use rolePreset.path instead. */
  profilePath: string | null;
  runtimeDir: string | null;
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
  };
  sessionCwd: string;
  piSessionDir: string;
  piSessionFile: string | null;
  recordsDir: string;
  writeDir: string | null;
  model: string | null;
  provider: string | null;
}

export interface AltTheoryConfig extends SessionDirectories {
  /** Application/session context loaded into the system prompt */
  appContextPath: string;
  /** Durable agent stance/personality seed */
  soulPath: string;
  /** Agent role/style preset file */
  rolePresetPath: string;
  /** Agent role/style preset slug */
  rolePresetSlug: string;
  /** KB root directory (search path for read-only/coding tools) */
  kbDir: string;
  /** Active KB domain recorded in the session manifest */
  kbDomain?: string;
  /** Pi adapter prompt templates */
  piPromptTemplatesDir?: string;
  /** Deprecated compatibility field for older runtimeDir callers */
  runtimeDir?: string;
  /** Deprecated compatibility field; use rolePresetPath */
  profilePath?: string;
  /** Core-soul base file path */
  coreSoulPath?: string;
  /** Selected core-soul module slugs */
  coreSoulModules?: string[];
  /** Directory containing core-soul module files */
  coreSoulModulesDir?: string;
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
}

/** Read-only tool allowlist (no write/edit/bash) */
const READONLY_TOOLS = ["read", "ls", "grep", "find"];
/** Conference-stage note mode: read/search plus write, without edit or bash. */
const WRITE_ENABLED_TOOLS = [...READONLY_TOOLS, "write"];

// ---------------------------------------------------------------------------
// Implementation
// ---------------------------------------------------------------------------

export async function createAltTheorySession(config: AltTheoryConfig) {
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
  const resolvedAppContextPath = resolve(config.appContextPath);
  const resolvedSoulPath = resolve(config.soulPath);
  const resolvedRolePresetPath = resolve(
    config.rolePresetPath ?? config.profilePath ?? ""
  );
  const resolvedPiPromptTemplatesDir = config.piPromptTemplatesDir
    ? resolve(config.piPromptTemplatesDir)
    : config.runtimeDir
      ? resolve(config.runtimeDir, ".pi", "prompts")
      : null;
  const resolvedRuntimeDir = config.runtimeDir
    ? resolve(config.runtimeDir)
    : null;
  const agentDir = getAgentDir();

  // --- 1. Read semantic assets ---
  const appContextContent = readRequiredTextAsset(
    resolvedAppContextPath,
    "ALTTHEORY.md"
  );
  const soulContent = readRequiredTextAsset(resolvedSoulPath, "soul.md");
  const rolePresetContent = readRequiredTextAsset(
    resolvedRolePresetPath,
    "role preset"
  );

  if (config.coreSoulPath && !config.coreSoulModulesDir) {
    throw new Error("coreSoulModulesDir is required when coreSoulPath is set");
  }
  const coreSoul = config.coreSoulPath
    ? assembleCoreSoul({
        basePath: config.coreSoulPath,
        modulesDir: config.coreSoulModulesDir!,
        activeModules: config.coreSoulModules,
      })
    : null;

  // --- 2. Assemble appendSystemPromptOverride ---
  //    Order: app context -> soul -> optional core-soul modules -> role preset -> KB path declaration
  const appendContent: string[] = [];
  appendContent.push(`## Alt Theory Application Context\n${appContextContent}`);
  appendContent.push(`## Soul\n${soulContent}`);
  if (coreSoul) {
    appendContent.push(`## Core Soul\n${coreSoul.content}`);
  }
  appendContent.push(`## Role Preset\n${rolePresetContent}`);
  appendContent.push(
    `## Knowledge Base\nYour knowledge base is at: ${resolvedKbDir}`
  );
  if (!readOnly) {
    appendContent.push(
      [
        "## Write Policy",
        `Write user-facing notes and summaries only under: ${resolvedWriteDir}`,
        "Treat the knowledge base, role presets, prompts, and system files as read-only.",
      ].join("\n")
    );
  }

  const loader = new DefaultResourceLoader({
    cwd,
    agentDir,
    additionalPromptTemplatePaths: resolvedPiPromptTemplatesDir
      ? [resolvedPiPromptTemplatesDir]
      : [],
    agentsFilesOverride: (base) => base,
    appendSystemPromptOverride: (base: string[]) => [...base, ...appendContent],
  });
  await loader.reload();

  // --- 3. Create session ---
  //    readOnly: use tool name allowlist (only read/ls/grep/find)
  //    coding: default tools (all built-in enabled)
  const sessionManager = SessionManager.create(cwd, resolvedPiSessionDir);
  sessionManager.newSession({ id: sessionId });

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
      throw new Error(
        `Unknown model: ${config.modelProvider}/${config.modelId}`
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

  const { session } = await createAgentSession(sessionOpts);
  const createdAt = new Date().toISOString();
  session.sessionManager.appendCustomEntry("alt-theory-session-created", {
    createdAt,
  });

  const manifest: AssemblyManifest = {
    sessionId: session.sessionId,
    createdAt,
    appContext: fileRef(resolvedAppContextPath),
    soul: fileRef(resolvedSoulPath),
    rolePreset: {
      ...fileRef(resolvedRolePresetPath),
      slug: config.rolePresetSlug,
    },
    coreSoul: {
      basePath: coreSoul?.basePath ?? null,
      modules: coreSoul?.modules ?? [],
    },
    profilePath: resolvedRolePresetPath,
    runtimeDir: resolvedRuntimeDir,
    piAdapter: {
      promptTemplatesDir: resolvedPiPromptTemplatesDir,
      promptTemplatesExist: resolvedPiPromptTemplatesDir
        ? existsSync(resolvedPiPromptTemplatesDir)
        : false,
    },
    kbDomain: config.kbDomain ?? "all",
    kb: {
      rootDir: resolvedKbDir,
      domain: config.kbDomain ?? "all",
      domainPath:
        (config.kbDomain ?? "all") === "all"
          ? null
          : resolve(resolvedKbDir, config.kbDomain ?? "all"),
      domainExists:
        (config.kbDomain ?? "all") === "all"
          ? true
          : existsSync(resolve(resolvedKbDir, config.kbDomain ?? "all")),
    },
    sessionCwd: cwd,
    piSessionDir: resolvedPiSessionDir,
    piSessionFile: session.sessionFile ?? null,
    recordsDir: resolvedRecordsDir,
    writeDir: readOnly ? null : resolvedWriteDir,
    model: session.model?.id ?? null,
    provider: session.model?.provider ?? null,
  };

  writeJsonAtomic(join(resolvedRecordsDir, "assembly-manifest.json"), manifest);

  return { session, manifest };
}
