/**
 * Alt Theory Core Layer
 *
 * Provides `createAltTheorySession(config)` — the unified API for all Alt Theory frontends.
 * Handles: system prompt assembly, agent profile injection, KB path binding, tool selection.
 *
 * @module alt-theory-core
 */

import {
  createAgentSession,
  DefaultResourceLoader,
  getAgentDir,
  SessionManager,
} from "@mariozechner/pi-coding-agent";
import { existsSync, readFileSync } from "fs";
import { resolve } from "path";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface AltTheoryConfig {
  /** Root directory containing runtime agent files — used as session cwd */
  rootDir: string;
  /** KB root directory (search path for read-only/coding tools) */
  kbDir: string;
  /** Agent profile/soul file path (optional, appended to system prompt) */
  profilePath?: string;
  /** Read-only mode: only read/search tools; coding mode: full read/write/edit/bash */
  readOnly: boolean;
}

/** Read-only tool allowlist (no write/edit/bash) */
const READONLY_TOOLS = ["read", "ls", "grep", "find"];

// ---------------------------------------------------------------------------
// Implementation
// ---------------------------------------------------------------------------

export async function createAltTheorySession(config: AltTheoryConfig) {
  const { rootDir, kbDir, readOnly } = config;

  // Resolve paths
  const cwd = resolve(rootDir);
  const resolvedKbDir = resolve(kbDir);
  const agentDir = getAgentDir();

  // --- 1. Read agent profile content (if any) ---
  const profileContent =
    config.profilePath && existsSync(config.profilePath)
      ? readFileSync(config.profilePath, "utf-8")
      : "";

  // --- 2. Assemble appendSystemPromptOverride ---
  //    Order: agent profile → KB path declaration
  const appendContent: string[] = [];
  if (profileContent) {
    appendContent.push(`## Agent Profile\n${profileContent}`);
  }
  appendContent.push(
    `## Knowledge Base\nYour knowledge base is at: ${resolvedKbDir}`
  );

  const loader = new DefaultResourceLoader({
    cwd,
    agentDir,
    appendSystemPromptOverride: (base: string[]) => [...base, ...appendContent],
  });
  await loader.reload();

  // --- 3. Create session ---
  //    readOnly: use tool name allowlist (only read/ls/grep/find)
  //    coding: default tools (all built-in enabled)
  const sessionOpts: Parameters<typeof createAgentSession>[0] = {
    cwd,
    resourceLoader: loader,
    sessionManager: SessionManager.inMemory(),
  };

  if (readOnly) {
    sessionOpts.noTools = "all";
    sessionOpts.tools = READONLY_TOOLS;
  }

  const { session } = await createAgentSession(sessionOpts);

  return { session };
}
