/**
 * Alt Theory Core Layer
 *
 * Provides `createAltTheorySession(config)` — the unified API for all Alt Theory frontends.
 * Handles: system prompt assembly, profile injection, KB path binding, tool selection.
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
import { existsSync, readFileSync } from "fs";
import { join, resolve } from "path";
import {
  writeJsonAtomic,
  type SessionDirectories,
} from "./data-dir.js";
import { assembleCoreSoul } from "./core-soul.js";

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
  coreSoul: {
    basePath: string | null;
    modules: CoreSoulModule[];
  };
  profilePath: string | null;
  runtimeDir: string | null;
  kbDomain: string;
  sessionCwd: string;
  piSessionDir: string;
  piSessionFile: string | null;
  recordsDir: string;
  writeDir: string | null;
  model: string | null;
  provider: string | null;
}

export interface AltTheoryConfig extends SessionDirectories {
  /** KB root directory (search path for read-only/coding tools) */
  kbDir: string;
  /** Active KB domain recorded in the session manifest */
  kbDomain?: string;
  /** Pi-compatible runtime assets containing AGENTS.md and .pi/prompts */
  runtimeDir?: string;
  /** Profile file path (optional, appended to system prompt) */
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
  const resolvedRuntimeDir = config.runtimeDir
    ? resolve(config.runtimeDir)
    : null;
  const agentDir = getAgentDir();

  // --- 1. Read profile content (if any) ---
  const resolvedProfilePath = config.profilePath
    ? resolve(config.profilePath)
    : null;
  if (resolvedProfilePath && !existsSync(resolvedProfilePath)) {
    throw new Error(`Profile file not found: ${resolvedProfilePath}`);
  }
  const profileContent = resolvedProfilePath
    ? readFileSync(resolvedProfilePath, "utf-8")
    : "";

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
  //    Order: core-soul → profile → KB path declaration
  const appendContent: string[] = [];
  if (coreSoul) {
    appendContent.push(`## Core Soul\n${coreSoul.content}`);
  }
  if (profileContent) {
    appendContent.push(`## User Profile\n${profileContent}`);
  }
  appendContent.push(
    `## Knowledge Base\nYour knowledge base is at: ${resolvedKbDir}`
  );
  if (!readOnly) {
    appendContent.push(
      [
        "## Write Policy",
        `Write user-facing notes and summaries only under: ${resolvedWriteDir}`,
        "Treat the knowledge base, profiles, prompts, and system files as read-only.",
      ].join("\n")
    );
  }

  const loader = new DefaultResourceLoader({
    cwd,
    agentDir,
    additionalPromptTemplatePaths: resolvedRuntimeDir
      ? [resolve(resolvedRuntimeDir, ".pi", "prompts")]
      : [],
    agentsFilesOverride: (base) => {
      if (!resolvedRuntimeDir) return base;
      const runtimeAgentsPath = resolve(resolvedRuntimeDir, "AGENTS.md");
      if (!existsSync(runtimeAgentsPath)) {
        throw new Error(`Runtime AGENTS.md not found: ${runtimeAgentsPath}`);
      }
      return {
        agentsFiles: [
          ...base.agentsFiles,
          {
            path: runtimeAgentsPath,
            content: readFileSync(runtimeAgentsPath, "utf-8"),
          },
        ],
      };
    },
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
    coreSoul: {
      basePath: coreSoul?.basePath ?? null,
      modules: coreSoul?.modules ?? [],
    },
    profilePath: resolvedProfilePath,
    runtimeDir: resolvedRuntimeDir,
    kbDomain: config.kbDomain ?? "all",
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
