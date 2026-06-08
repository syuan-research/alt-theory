import { createHash } from "crypto";
import { existsSync, readFileSync } from "fs";
import { resolve } from "path";

export interface AgentAssetPaths {
  rootDir: string;
  appContextPath: string;
  soulPath: string;
  rolePresetsDir: string;
  kbDir: string;
  piPromptTemplatesDir: string;
  modelsPath: string | null;
}

export interface AgentAssetPathOverrides {
  agentAssetsDir?: string;
  appContextPath?: string;
  soulPath?: string;
  rolePresetsDir?: string;
  kbDir?: string;
  piPromptTemplatesDir?: string;
  modelsPath?: string;
}

export interface LoadedAssetFileRef {
  path: string;
  exists: boolean;
  sha256: string | null;
}

export function resolveAgentAssetPaths(
  projectRoot: string,
  overrides: AgentAssetPathOverrides = {}
): AgentAssetPaths {
  const modelsPath =
    overrides.modelsPath ?? process.env.ALT_THEORY_MODELS_PATH ?? null;
  const rootDir = resolve(
    overrides.agentAssetsDir ??
      process.env.ALT_THEORY_AGENT_ASSETS_DIR ??
      resolve(projectRoot, "agent-assets")
  );

  return {
    rootDir,
    appContextPath: resolve(
      overrides.appContextPath ??
        process.env.ALT_THEORY_APP_CONTEXT_PATH ??
        resolve(rootDir, "ALTTHEORY.md")
    ),
    soulPath: resolve(
      overrides.soulPath ??
        process.env.ALT_THEORY_SOUL_PATH ??
        resolve(rootDir, "soul.md")
    ),
    rolePresetsDir: resolve(
      overrides.rolePresetsDir ??
        process.env.ALT_THEORY_ROLE_PRESETS_DIR ??
        resolve(rootDir, "role-presets")
    ),
    kbDir: resolve(
      overrides.kbDir ??
        process.env.ALT_THEORY_KB_DIR ??
        resolve(rootDir, "kb")
    ),
    piPromptTemplatesDir: resolve(
      overrides.piPromptTemplatesDir ??
        process.env.ALT_THEORY_PI_PROMPTS_DIR ??
        resolve(rootDir, "prompts", "pi")
    ),
    modelsPath: modelsPath ? resolve(modelsPath) : null,
  };
}

export function fileRef(path: string): LoadedAssetFileRef {
  const resolved = resolve(path);
  if (!existsSync(resolved)) {
    return { path: resolved, exists: false, sha256: null };
  }
  const content = readFileSync(resolved);
  return {
    path: resolved,
    exists: true,
    sha256: createHash("sha256").update(content).digest("hex"),
  };
}

export function readRequiredTextAsset(path: string, label: string): string {
  const resolved = resolve(path);
  if (!existsSync(resolved)) {
    throw new Error(`${label} not found: ${resolved}`);
  }
  return readFileSync(resolved, "utf-8");
}
