/**
 * Alt Theory Web Server
 *
 * Express + WebSocket backend. Static discovery uses REST; live session state
 * is owned by SessionService and WebSocket connections attach as clients.
 */

import "dotenv/config";
import express, { type Response } from "express";
import multer from "multer";
import { copyFileSync, existsSync, mkdirSync, statSync } from "fs";
import { createServer } from "http";
import { basename, resolve } from "path";
import { fileURLToPath } from "url";
import WebSocket, { WebSocketServer } from "ws";
import type { ThinkingLevel } from "@earendil-works/pi-agent-core";
import {
  type AltMode,
  type ResourceDiscoveryMode,
  type RuntimeMode,
  KB_DISABLED_DOMAIN,
} from "../core/alt-theory-core.js";
import { resolveDataDir } from "../core/data-dir.js";
import {
  resolveAgentAssetPaths,
  type AgentAssetPaths,
} from "../core/agent-assets.js";
import {
  isKnownKbDomain,
  listKbDomains,
  listRolePresets,
  listSouls,
  resolveRolePresetSlug,
  resolveSoulSlug,
  setExtraAssetDirs,
} from "./asset-registry.js";
import { setBackendLang, t } from "./i18n.js";
import type {
  ClientMessage,
  ServerMessage
} from "./websocket-protocol.js";
import {
  getSessionRootForRequest,
  listDeletedSessionSummaries,
  listSessionTextFiles,
  listSessionSummaries,
  permanentlyDeleteSession,
  restoreDeletedSession,
  readSessionTextFile,
  healFamilyInvariants,
  readSessionAccessSummary,
  readSessionDetail,
  readSessionChanges,
  type SessionSummary,
  sessionsAttachedToDeletion,
  softDeleteSession,
  sweepExpiredDeletedSessions,
  writeSessionTextFile,
} from "./session-store.js";
import {
  deleteWorkspaceFile,
  isWorkspaceDownloadAllowed,
  listWorkspaceFiles,
  retryWorkspaceExtraction,
  uploadWorkspaceFile,
} from "./workspace-files.js";
import {
  appendAbComparisonRecord,
  currentAbComparisonRecords,
  type AbComparisonCandidate,
  type AbComparisonInput,
  type AbComparisonScore,
} from "./ab-records.js";
import {
  SessionBusyError,
  SessionService,
  type SessionModelOverride,
  type SessionSelectors,
  type SessionServiceEvent,
  type StudyTag,
} from "./session-service.js";
import { listInstructionAssets } from "./instruction-assets.js";
import { listAltTheorySkills } from "./skill-assets.js";
import {
  agentConfigDir,
  ConfigValidationError,
  testProviderConnectionFromDraft,
  deleteProvider,
  fetchProviderModels,
  fetchProviderModelsFromDraft,
  getRuntimeModelConfig,
  getVerifiedConfigStatus,
  initialThinkingLevelForModel,
  listProviders,
  setActive,
  upsertProvider,
  type ApiType,
  type RuntimeModelConfig,
} from "./config-store.js";
import { refreshModelsDevMetadata } from "./models-dev-metadata.js";
import {
  AuthSessionManager,
  anonymousAuthContext,
  clearAuthCookie,
  setAuthCookie,
} from "./auth-session.js";
import { readAccountStore } from "./auth-accounts.js";
import type { AuthContext } from "./auth-session.js";
import { ensureLocalModeDefaults } from "./local-mode-paths.js";
import {
  isVisibilityForMode,
  withholdsFromResearch,
  type SessionVisibility,
} from "./session-records.js";
import { sweepExpiredPrivateSessions } from "./session-retention.js";
import { getAgentDir } from "@earendil-works/pi-coding-agent";
import {
  cancelProviderAuth,
  getProviderAuthFlow,
  isProviderAuthId,
  listProviderAuthStatus,
  logoutProviderAuth,
  respondToProviderAuth,
  startProviderAuth,
} from "./provider-auth.js";
import {
  IMPORT_HARNESSES,
  ImportHarnessNotImplementedError,
  discoverImportSessions,
  isImportHarness,
  preflightCodexImport,
  preflightClaudeCodeImport,
  preflightGrokImport,
  preflightOpenCodeImport,
  registerCodexImport,
  registerClaudeCodeImport,
  registerGrokImport,
  registerOpenCodeImport,
  registerPiImport,
} from "./session-import.js";
import { ImportRefusalError } from "./session-import-shared.js";
import {
  readAppSettings,
  resolveExternalSkillPaths,
  writeAppSettings,
  SKILL_PRECEDENCE_VALUES,
  type SkillPrecedence,
} from "./app-settings.js";
import { discoverSkillResources } from "./resource-discovery.js";
import {
  listWorkingFolderFiles,
  readWorkingFolderTextFile,
} from "./workspace-files.js";

ensureLocalModeDefaults();

const PROJECT_ROOT = process.cwd();
const PUBLIC_DIR = resolve(
  PROJECT_ROOT,
  process.env.ALT_THEORY_PUBLIC_DIR ?? "alt-theory-app/web-server/public-v6",
);

const DEFAULT_ROLE_CONDITION_PRESETS: Record<string, string> = {
  "conceptual-theory": "role-conceptual-theory-companion-latest",
  "metatheory-oriented": "role-metatheory-oriented",
};
// Points at the MUTABLE -latest asset by convention (agent-assets/README.md):
// the name is stable while its content evolves, so this constant never needs
// to change again — no config indirection required.
const DEFAULT_ROLE_PRESET_SLUG = "role-conceptual-theory-companion-latest";
const DEFAULT_SOUL_SLUG = "soul-latest";
const DEFAULT_INSTRUCTION_REF = "default.md";

export interface AltTheoryServerOptions {
  agentAssetsDir?: string;
  appContextPath?: string;
  instructionsDir?: string;
  skillsDir?: string;
  soulDir?: string;
  soulPath?: string;
  dataDir?: string;
  kbDir?: string;
  rolePresetsDir?: string;
  piPromptTemplatesDir?: string;
  publicDir?: string;
  understandReadOnly?: boolean;
  modelProvider?: string;
  modelId?: string;
  modelsPath?: string;
  authPath?: string;
  runtimeApiKey?: string;
  thinkingLevel?: ThinkingLevel;
  resourceDiscovery?: ResourceDiscoveryMode;
  runLabel?: string | null;
  testBatch?: string | null;
}

function parseResourceDiscoveryMode(
  value: string | undefined,
): ResourceDiscoveryMode {
  if (value === "clean" || value === "internal" || value === "dev-debug") {
    return value;
  }
  if (value) {
    console.warn(
      `Unknown ALT_THEORY_RESOURCE_DISCOVERY '${value}', using internal`,
    );
  }
  // internal = Alt bundled skills plus explicitly user-enabled externals.
  // dev-debug (ambient Pi merge + context files) is an explicit dev knob:
  // external skills must never be silently enabled in Understand.
  return "internal";
}

export function createAltTheoryServer(options: AltTheoryServerOptions = {}) {
  const dataDir = resolve(options.dataDir ?? resolveDataDir());
  const assetPaths: AgentAssetPaths = resolveAgentAssetPaths(PROJECT_ROOT, {
    agentAssetsDir: options.agentAssetsDir,
    appContextPath: options.appContextPath,
    instructionsDir: options.instructionsDir,
    skillsDir: options.skillsDir,
    soulDir: options.soulDir,
    soulPath: options.soulPath,
    rolePresetsDir: options.rolePresetsDir,
    kbDir: options.kbDir,
    piPromptTemplatesDir: options.piPromptTemplatesDir,
    modelsPath: options.modelsPath,
  });
  const kbDir = assetPaths.kbDir;
  const rolePresetsDir = assetPaths.rolePresetsDir;
  // User-added asset locations (alpha.5, add-only): the data-dir upload
  // folder for roles is always scanned; Settings can add more directories.
  const userRolePresetsDir = resolve(dataDir, "role-presets");
  const applyExtraAssetDirs = () => {
    const settings = readAppSettings(dataDir);
    setExtraAssetDirs({
      roleDirs: [userRolePresetsDir, ...(settings.extraRolePresetDirs ?? [])],
      kbDirs: settings.extraKbDirs ?? [],
    });
  };
  applyExtraAssetDirs();
  setBackendLang(readAppSettings(dataDir).lang ?? null);
  // One pass before any session opens: older builds could leave a fork tree
  // split across working folders or with no listed representative (v1.4.1).
  try {
    healFamilyInvariants(dataDir);
  } catch (error) {
    console.warn("[alt-theory] family-invariant heal failed:", error);
  }
  const soulDir = assetPaths.soulDir;
  const legacySoulPath = assetPaths.soulPath;
  const publicDir = resolve(options.publicDir ?? PUBLIC_DIR);
  const understandReadOnly = options.understandReadOnly ?? false;
  const modelProvider =
    options.modelProvider ?? process.env.ALT_THEORY_MODEL_PROVIDER;
  const modelId = options.modelId ?? process.env.ALT_THEORY_MODEL_ID;
  const modelsPath = assetPaths.modelsPath;
  const resourceDiscovery = parseResourceDiscoveryMode(
    options.resourceDiscovery ?? process.env.ALT_THEORY_RESOURCE_DISCOVERY,
  );
  const skillsDir =
    options.skillsDir ??
    process.env.ALT_THEORY_SKILLS_DIR ??
    (resourceDiscovery === "clean"
      ? undefined
      : ( assetPaths.skillsDir ?? resolve(assetPaths.rootDir, "skills")));
  const instructionsDir =
    options.instructionsDir ??
    assetPaths.instructionsDir ??
    resolve(assetPaths.rootDir, "instructions");
  const runLabel =
    options.runLabel ?? process.env.ALT_THEORY_RUN_LABEL ?? null;
  const testBatch =
    options.testBatch ?? process.env.ALT_THEORY_TEST_BATCH ?? null;
  /**
   * DEFAULT IS LOCAL — the downloadable app must never inherit study
   * semantics. A hosted deployment MUST set `ALT_THEORY_MODE=hosted`
   * explicitly.
   *
   * !! WHEN THE VPS PILOT MOVES TO 1.x, SET `ALT_THEORY_MODE=hosted` ON THE
   * SERVER FIRST. !! Without it a multi-user deployment silently loses
   * participant/researcher access control, and conversations a participant
   * marked "private" stop being deleted — both promises broken quietly.
   * Deployment-mode notes: development/architecture/core-session-engine.md.
   */
  const appMode = process.env.ALT_THEORY_MODE === "hosted" ? "hosted" : "local";
  const localMode = appMode === "local";

  const discoverConfiguredSkills = () => {
    const discovered = discoverSkillResources({
      altSkillsDir: skillsDir,
      agentDir: getAgentDir(),
    });
    const externalPaths = discovered.skills
      .filter((skill) => skill.source !== "alt-theory")
      .map((skill) => skill.path);
    const enabled = resolveExternalSkillPaths(readAppSettings(dataDir), externalPaths);
    const enabledUnderstand = new Set(enabled.understand);
    const enabledWork = new Set(enabled.work);
    return {
      ...discovered,
      skills: discovered.skills.map((skill) => ({
        ...skill,
        enabled:
          skill.source === "alt-theory"
            ? { understand: true, work: true }
            : {
                understand: enabledUnderstand.has(skill.path),
                work: enabledWork.has(skill.path),
              },
      })),
    };
  };

  const app = express();
  const httpServer = createServer(app);
  const wss = new WebSocketServer({ server: httpServer });
  const authSessions = new AuthSessionManager(dataDir);
  const heartbeatInterval = setInterval(() => {
    for (const client of wss.clients) {
      const socket = client as WebSocket & { isAlive?: boolean };
      if (socket.isAlive === false) {
        socket.terminate();
        continue;
      }
      socket.isAlive = false;
      socket.ping();
    }
  }, 30_000);

  httpServer.on("close", () => {
    clearInterval(heartbeatInterval);
  });

  const workspaceUpload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 20 * 1024 * 1024 },
  });

  app.use(express.json({ limit: "600kb" }));
  app.use(
    express.static(publicDir, {
      etag: false,
      lastModified: false,
      setHeaders: (res) => {
        res.setHeader("Cache-Control", "no-store");
      },
    }),
  );
  // --- Config GUI (Pi-native model/key management) ---
  // Local-mode only. Hosted/online deployments must not expose server-side
  // model/key management through this UI or REST surface.
  app.get("/config", (_req, res) => {
    if (!requireLocalConfigMode(res)) return;
    res.sendFile(resolve(publicDir, "index.html"));
  });
  app.get("/api/config/status", async (_req, res) => {
    if (!requireLocalConfigMode(res)) return;
    res.json(await getVerifiedConfigStatus(agentConfigDir()));
  });
  // --- Resource discovery + per-mode skill enablement (spec §6.1) ---
  app.get("/api/resources", (_req, res) => {
    if (!requireLocalConfigMode(res)) return;
    const discovered = discoverConfiguredSkills();
    res.json({
      skills: discovered.skills,
      diagnostics: discovered.diagnostics,
      note: "Settings apply to new and reopened sessions, not running ones.",
    });
  });
  app.put("/api/resources/skills", (req, res) => {
    if (!requireLocalConfigMode(res)) return;
    const body = req.body as {
      understand?: { enabledPaths?: unknown };
      work?: { enabledPaths?: unknown };
    };
    const parseList = (value: unknown): string[] | null =>
      Array.isArray(value)
        ? value.filter((entry): entry is string => typeof entry === "string")
        : null;
    const current = readAppSettings(dataDir);
    const next = {
      ...current,
      skills: {
        understand: {
          enabledPaths: parseList(body.understand?.enabledPaths),
        },
        work: { enabledPaths: parseList(body.work?.enabledPaths) },
      },
    };
    writeAppSettings(dataDir, next);
    res.json({ ok: true, settings: next });
  });
  // Data folder location, for "reveal in file manager" (local mode; v1.2.1 #5).
  app.get("/api/local/data-folder", (_req, res) => {
    if (!requireLocalConfigMode(res)) return;
    res.json({ dataDir });
  });

  // --- Auto-naming of conversations (v1.2.1) ---
  app.get("/api/settings/auto-title", (_req, res) => {
    if (!requireLocalConfigMode(res)) return;
    const s = readAppSettings(dataDir).autoTitle;
    res.json({ enabled: s?.enabled !== false, model: s?.model ?? null });
  });
  app.put("/api/settings/auto-title", (req, res) => {
    if (!requireLocalConfigMode(res)) return;
    const body = req.body as { enabled?: unknown; model?: unknown };
    const raw = body.model as { provider?: unknown; modelId?: unknown } | null;
    const model =
      raw && typeof raw.provider === "string" && typeof raw.modelId === "string"
        ? { provider: raw.provider, modelId: raw.modelId }
        : null;
    const current = readAppSettings(dataDir);
    const next = {
      ...current,
      autoTitle: { enabled: body.enabled !== false, model },
    };
    writeAppSettings(dataDir, next);
    res.json({ ok: true, autoTitle: next.autoTitle });
  });
  // --- Bundled-vs-user skill precedence (v1.3.0-alpha.3) ---
  app.get("/api/settings/skill-precedence", (_req, res) => {
    if (!requireLocalConfigMode(res)) return;
    res.json({
      precedence: readAppSettings(dataDir).skillPrecedence ?? "prefer-bundled",
    });
  });
  app.put("/api/settings/skill-precedence", (req, res) => {
    if (!requireLocalConfigMode(res)) return;
    const value = (req.body as { precedence?: unknown }).precedence;
    if (!SKILL_PRECEDENCE_VALUES.includes(value as SkillPrecedence)) {
      res.status(400).json({ error: "Unknown skill precedence" });
      return;
    }
    writeAppSettings(dataDir, {
      ...readAppSettings(dataDir),
      skillPrecedence: value as SkillPrecedence,
    });
    res.json({ ok: true, precedence: value });
  });

  // --- User-added role/KB locations (v1.3.0-alpha.5, add-only) ---
  app.get("/api/settings/asset-dirs", (_req, res) => {
    if (!requireLocalConfigMode(res)) return;
    const settings = readAppSettings(dataDir);
    res.json({
      userRolePresetsDir,
      extraRolePresetDirs: settings.extraRolePresetDirs ?? [],
      extraKbDirs: settings.extraKbDirs ?? [],
    });
  });
  app.put("/api/settings/asset-dirs", (req, res) => {
    if (!requireLocalConfigMode(res)) return;
    const body = req.body as { roleDirs?: unknown; kbDirs?: unknown };
    const clean = (value: unknown): string[] | null =>
      Array.isArray(value)
        ? value
            .filter((entry): entry is string => typeof entry === "string")
            .map((entry) => resolve(entry))
            .filter((entry) => existsSync(entry))
        : null;
    const roleDirs = clean(body.roleDirs);
    const kbDirs = clean(body.kbDirs);
    const current = readAppSettings(dataDir);
    writeAppSettings(dataDir, {
      ...current,
      ...(roleDirs ? { extraRolePresetDirs: roleDirs } : {}),
      ...(kbDirs ? { extraKbDirs: kbDirs } : {}),
    });
    applyExtraAssetDirs();
    const saved = readAppSettings(dataDir);
    res.json({
      ok: true,
      extraRolePresetDirs: saved.extraRolePresetDirs ?? [],
      extraKbDirs: saved.extraKbDirs ?? [],
    });
  });
  // Copy a picked .md file into the user's role folder — never touches the
  // bundled role-presets directory.
  app.post("/api/role-presets/upload", (req, res) => {
    if (!requireLocalConfigMode(res)) return;
    const source = (req.body as { path?: unknown }).path;
    if (typeof source !== "string" || !source.trim()) {
      res.status(400).json({ error: "path is required" });
      return;
    }
    const resolved = resolve(source.trim());
    if (!existsSync(resolved) || !statSync(resolved).isFile()) {
      res.status(400).json({ error: "File not found" });
      return;
    }
    if (!resolved.toLowerCase().endsWith(".md")) {
      res.status(400).json({ error: "A role preset is a Markdown (.md) file" });
      return;
    }
    try {
      mkdirSync(userRolePresetsDir, { recursive: true });
      const target = resolve(userRolePresetsDir, basename(resolved));
      copyFileSync(resolved, target);
      res.json({ ok: true, slug: basename(resolved, ".md"), path: target });
    } catch (error) {
      res.status(500).json({
        error: error instanceof Error ? error.message : String(error),
      });
    }
  });

  // --- Behavior settings ---
  app.get("/api/settings/default-alt-mode", (_req, res) => {
    if (!requireLocalConfigMode(res)) return;
    res.json({ mode: readAppSettings(dataDir).defaultAltMode ?? null });
  });
  app.put("/api/settings/default-alt-mode", (req, res) => {
    if (!requireLocalConfigMode(res)) return;
    const mode = (req.body as { mode?: unknown }).mode as
      | "understand"
      | "work"
      | null
      | undefined;
    if (mode !== "understand" && mode !== "work" && mode !== null) {
      res.status(400).json({ error: "Unknown mode" });
      return;
    }
    const settings = readAppSettings(dataDir);
    if (mode === null) delete settings.defaultAltMode;
    else settings.defaultAltMode = mode;
    writeAppSettings(dataDir, settings);
    res.json({ ok: true, mode });
  });
  app.get("/api/settings/model-hooks", (_req, res) => {
    if (!requireLocalConfigMode(res)) return;
    res.json({ enabled: readAppSettings(dataDir).modelHooks !== false });
  });
  app.put("/api/settings/model-hooks", (req, res) => {
    if (!requireLocalConfigMode(res)) return;
    const enabled = (req.body as { enabled?: unknown }).enabled;
    if (typeof enabled !== "boolean") {
      res.status(400).json({ error: "enabled must be a boolean" });
      return;
    }
    const settings = readAppSettings(dataDir);
    if (enabled) delete settings.modelHooks;
    else settings.modelHooks = false;
    writeAppSettings(dataDir, settings);
    res.json({ ok: true, enabled });
  });
  app.get("/api/settings/runtime", (_req, res) => {
    if (!requireLocalConfigMode(res)) return;
    const settings = readAppSettings(dataDir);
    res.json({
      mode: settings.runtimeMode ?? "alt-theory",
      nativePiScanAltSkills: settings.nativePiScanAltSkills !== false,
    });
  });
  app.put("/api/settings/runtime", async (req, res) => {
    if (!requireLocalConfigMode(res)) return;
    const body = req.body as {
      mode?: unknown;
      nativePiScanAltSkills?: unknown;
    };
    if (body.mode !== "alt-theory" && body.mode !== "native-pi") {
      res.status(400).json({ error: "Unknown runtime mode" });
      return;
    }
    if (typeof body.nativePiScanAltSkills !== "boolean") {
      res.status(400).json({ error: "nativePiScanAltSkills must be boolean" });
      return;
    }
    const settings = readAppSettings(dataDir);
    settings.runtimeMode = body.mode as RuntimeMode;
    settings.nativePiScanAltSkills = body.nativePiScanAltSkills;
    writeAppSettings(dataDir, settings);
    await sessionService.setRuntimeSettings(
      settings.runtimeMode,
      settings.nativePiScanAltSkills,
    );
    res.json({
      ok: true,
      mode: settings.runtimeMode,
      nativePiScanAltSkills: settings.nativePiScanAltSkills,
    });
  });

  // --- App language (v1.3.0-alpha.6) ---
  app.get("/api/settings/lang", (_req, res) => {
    if (!requireLocalConfigMode(res)) return;
    res.json({ lang: readAppSettings(dataDir).lang ?? null });
  });
  app.put("/api/settings/lang", (req, res) => {
    if (!requireLocalConfigMode(res)) return;
    const lang = (req.body as { lang?: unknown }).lang as
      | "auto"
      | "en"
      | "zh-Hans"
      | "zh-Hant-HK"
      | null
      | undefined;
    if (
      lang !== "auto" &&
      lang !== "en" &&
      lang !== "zh-Hans" &&
      lang !== "zh-Hant-HK" &&
      lang !== null
    ) {
      res.status(400).json({ error: "Unknown language" });
      return;
    }
    const settings = readAppSettings(dataDir);
    if (lang === null) delete settings.lang;
    else settings.lang = lang;
    writeAppSettings(dataDir, settings);
    setBackendLang(lang);
    res.json({ ok: true, lang });
  });

  app.get("/api/config/providers", (_req, res) => {
    if (!requireLocalConfigMode(res)) return;
    // Answer from what is on disk and let models.dev catch up in the
    // background: awaiting a third-party host here made opening the model
    // settings page wait seconds on a stale cache or a slow network.
    void refreshModelsDevMetadata(agentConfigDir());
    res.json({ providers: listProviders(agentConfigDir()) });
  });
  app.get("/api/config/auth/providers", (_req, res) => {
    if (!requireLocalConfigMode(res)) return;
    res.json({ providers: listProviderAuthStatus(agentConfigDir()) });
  });
  app.post("/api/config/auth/providers/:provider/login", (req, res) => {
    if (!requireLocalConfigMode(res)) return;
    if (!isProviderAuthId(req.params.provider)) {
      res.status(400).json({ error: "Unsupported OAuth provider" });
      return;
    }
    res
      .status(202)
      .json(startProviderAuth(agentConfigDir(), req.params.provider));
  });
  app.post("/api/config/auth/providers/:provider/logout", async (req, res) => {
    if (!requireLocalConfigMode(res)) return;
    if (!isProviderAuthId(req.params.provider)) {
      res.status(400).json({ error: "Unsupported OAuth provider" });
      return;
    }
    try {
      await logoutProviderAuth(agentConfigDir(), req.params.provider);
      res.json({ ok: true });
    } catch (error) {
      res.status(500).json({
        error: error instanceof Error ? error.message : String(error),
      });
    }
  });
  app.get("/api/config/auth/flows/:flowId", (req, res) => {
    if (!requireLocalConfigMode(res)) return;
    const flow = getProviderAuthFlow(req.params.flowId);
    if (!flow) {
      res.status(404).json({ error: "Unknown auth flow" });
      return;
    }
    res.json(flow);
  });
  app.post("/api/config/auth/flows/:flowId/respond", (req, res) => {
    if (!requireLocalConfigMode(res)) return;
    const body = req.body as { promptId?: unknown; value?: unknown };
    if (typeof body.promptId !== "string" || typeof body.value !== "string") {
      res.status(400).json({ error: "promptId and value are required" });
      return;
    }
    const flow = respondToProviderAuth(
      req.params.flowId,
      body.promptId,
      body.value,
    );
    if (!flow) {
      res.status(409).json({ error: "Auth prompt is no longer active" });
      return;
    }
    res.json(flow);
  });
  app.delete("/api/config/auth/flows/:flowId", (req, res) => {
    if (!requireLocalConfigMode(res)) return;
    const flow = cancelProviderAuth(req.params.flowId);
    if (!flow) {
      res.status(404).json({ error: "Unknown auth flow" });
      return;
    }
    res.json(flow);
  });
  app.post("/api/config/fetch-models", async (req, res) => {
    if (!requireLocalConfigMode(res)) return;
    const body = req.body as {
      provider?: unknown;
      baseUrl?: unknown;
      api?: unknown;
      apiKey?: unknown;
    };
    try {
      res.json({
        models: await fetchProviderModelsFromDraft(agentConfigDir(), {
          provider: typeof body.provider === "string" ? body.provider : "",
          baseUrl: typeof body.baseUrl === "string" ? body.baseUrl : undefined,
          api: typeof body.api === "string" ? (body.api as ApiType) : undefined,
          apiKey: typeof body.apiKey === "string" ? body.apiKey : undefined,
        }),
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      res.status(error instanceof ConfigValidationError ? 400 : 500).json({
        error: message,
      });
    }
  });
  app.post("/api/config/test-connection", async (req, res) => {
    if (!requireLocalConfigMode(res)) return;
    const body = req.body as {
      provider?: unknown;
      baseUrl?: unknown;
      api?: unknown;
      apiKey?: unknown;
      keyStorage?: unknown;
      modelId?: unknown;
    };
    try {
      res.json(
        await testProviderConnectionFromDraft(agentConfigDir(), {
          provider: typeof body.provider === "string" ? body.provider : "",
          baseUrl: typeof body.baseUrl === "string" ? body.baseUrl : undefined,
          api: typeof body.api === "string" ? (body.api as ApiType) : undefined,
          apiKey: typeof body.apiKey === "string" ? body.apiKey : undefined,
          keyStorage:
            body.keyStorage === "env" || body.keyStorage === "literal"
              ? body.keyStorage
              : undefined,
          modelId: typeof body.modelId === "string" ? body.modelId : undefined,
        }),
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      res.status(error instanceof ConfigValidationError ? 400 : 500).json({
        error: message,
      });
    }
  });
  app.post("/api/config/providers/:provider/fetch-models", async (req, res) => {
    if (!requireLocalConfigMode(res)) return;
    try {
      res.json({
        models: await fetchProviderModels(agentConfigDir(), req.params.provider,),
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      res.status(error instanceof ConfigValidationError ? 400 : 500).json({
        error: message,
      });
    }
  });
  app.put("/api/config/providers/:provider", async (req, res) => {
    if (!requireLocalConfigMode(res)) return;
    const provider = req.params.provider;
    const body = req.body as {
      baseUrl?: unknown;
      api?: unknown;
      apiKey?: unknown;
      keyStorage?: unknown;
      clearKey?: unknown;
      options?: unknown;
      models?: unknown;
    };
    try {
      const view = await upsertProvider(
        agentConfigDir(),
        {
          name: provider,
          baseUrl: typeof body.baseUrl === "string" ? body.baseUrl : undefined,
          api: typeof body.api === "string" ? (body.api as ApiType) : undefined,
          options:
            body.options &&
            typeof body.options === "object" &&
            !Array.isArray(body.options)
              ? (body.options as Record<string, unknown>)
              : undefined,
          apiKey: typeof body.apiKey === "string" ? body.apiKey : undefined,
          models: Array.isArray(body.models) ? (body.models as never[]) : [],
        },
        {
          keyStorage:
            body.keyStorage === "env"
              ? "env"
              : body.keyStorage === "literal"
                ? "literal"
                : body.apiKey
                  ? "literal"
                  : undefined,
          clearKey: body.clearKey === true,
        },
      );
      res.json(view);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      res.status(error instanceof ConfigValidationError ? 400 : 500).json({
        error: message,
      });
    }
  });
  app.delete("/api/config/providers/:provider", async (req, res) => {
    if (!requireLocalConfigMode(res)) return;
    try {
      await
      deleteProvider(agentConfigDir(), req.params.provider);
      res.json({ ok: true });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      res.status(error instanceof ConfigValidationError ? 400 : 500).json({
        error: message,
      });
    }
  });
  app.put("/api/config/active", async (req, res) => {
    if (!requireLocalConfigMode(res)) return;
    const body = req.body as { provider?: unknown; model?: unknown };
    if (typeof body.provider !== "string" || typeof body.model !== "string") {
      res.status(400).json({ error: "provider and model are required" });
      return;
    }
    try {
      await setActive(agentConfigDir(), body.provider, body.model);
      res.json(await getVerifiedConfigStatus(agentConfigDir()));
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      res.status(error instanceof ConfigValidationError ? 400 : 500).json({
        error: message,
      });
    }
  });
  app.get("/api/role-presets", (_req, res) => {
    res.json({ rolePresets: listRolePresets(rolePresetsDir) });
  });
  app.get("/api/souls", (_req, res) => {
    res.json({ souls: listSouls(soulDir, legacySoulPath) });
  });
  app.get("/api/kb-domains", (_req, res) => {
    const selectableDomains = [
      { slug: KB_DISABLED_DOMAIN, displayName: "Off" },
      { slug: "all", displayName: "All" },
      ...listKbDomains(kbDir),
    ].filter(
      (domain, index, allDomains) =>
        allDomains.findIndex((candidate) => candidate.slug === domain.slug) ===
        index,
    );
    res.json({ domains: selectableDomains });
  });
  app.get("/api/instruction-assets", (_req, res) => {
    res.json({ instructions: listInstructionAssets(instructionsDir) });
  });
  app.get("/api/skills", (_req, res) => {
    res.json({
      skills: localMode
        ? discoverConfiguredSkills().skills
        : resourceDiscovery === "clean" || !skillsDir
          ? []
          : listAltTheorySkills(skillsDir),
    });
  });
  app.post("/api/auth/login", (req, res) => {
    const body = req.body as { accountId?: unknown; loginCode?: unknown };
    if (typeof body?.accountId !== "string" || typeof body.loginCode !== "string") {
      res.status(400).json({ error: "accountId and loginCode are required" });
      return;
    }
    const login = authSessions.login(body.accountId, body.loginCode);
    if (!login.ok) {
      res.status(login.status).json({ error: login.error });
      return;
    }
    setAuthCookie(res, login.token);
    res.json({ account: login.account });
  });
  app.post("/api/auth/logout", (req, res) => {
    authSessions.logoutFromRequest(req);
    clearAuthCookie(res);
    res.json({ ok: true });
  });
  app.get("/api/auth/me", async (req, res) => {
    const auth = authSessions.resolveRequest(req);
    // Study designation (M7 §3): hosted = the account role; local = the
    // install-level flag. Non-designated users get zero study surfaces.
    const participant = hasConfiguredAccounts()
      ? auth.role === "participant"
        ? { designated: true, label: null }
        : null
      : (readAppSettings(dataDir).participant ?? null);
    const settings = readAppSettings(dataDir);
    res.json({
      auth,
      app: {
        mode: appMode,
        runtimeMode: settings.runtimeMode ?? "alt-theory",
        nativePiScanAltSkills: settings.nativePiScanAltSkills !== false,
      },
      participant,
      localConfig: localMode
        ? await getVerifiedConfigStatus(agentConfigDir())
        : null,
    });
  });
  app.get("/api/session-import/harnesses", (_req, res) => {
    if (!localMode) {
      res.status(404).json({ error: "Session import is available only in local mode" });
      return;
    }
    res.json({
      harnesses: IMPORT_HARNESSES.map((harness) => ({
        harness,
        status: "ready",
      })),
    });
  });
  app.get("/api/session-import/:harness/sessions", async (req, res) => {
    if (!localMode) {
      res.status(404).json({ error: "Session import is available only in local mode" });
      return;
    }
    const harness = req.params.harness;
    if (!isImportHarness(harness)) {
      res.status(400).json({ error: `Unknown import harness: ${harness}` });
      return;
    }
    try {
      const sessions = await discoverImportSessions({ harness, dataDir });
      res.json({ harness, sessions });
    } catch (error) {
      if (error instanceof ImportHarnessNotImplementedError) {
        res.status(501).json({ error: error.message, harness });
        return;
      }
      const message = error instanceof Error ? error.message : String(error);
      res.status(500).json({ error: message });
    }
  });
  app.post("/api/session-import/:harness", async (req, res) => {
    if (!localMode) {
      res.status(404).json({ error: "Session import is available only in local mode" });
      return;
    }
    const auth = resolveSessionRestAuth(req, res);
    if (!auth) return;
    const harness = req.params.harness;
    if (!isImportHarness(harness)) {
      res.status(400).json({ error: `Unknown import harness: ${harness}` });
      return;
    }
    const body = (req.body ?? {}) as {
      selection?: unknown;
      sourceIds?: unknown;
      mode?: unknown;
      changedSourcePolicy?: unknown;
      workspaceOverrides?: unknown;
      visibility?: unknown;
      preflightOnly?: unknown;
    };
    const selection = body.selection ?? "selected";
    const mode = body.mode ?? "understand";
    const changedSourcePolicy = body.changedSourcePolicy ?? "skip";
    if (selection !== "all" && selection !== "selected") {
      res.status(400).json({ error: "selection must be 'all' or 'selected'" });
      return;
    }
    if (mode !== "understand" && mode !== "work") {
      res.status(400).json({ error: "mode must be 'understand' or 'work'" });
      return;
    }
    if (changedSourcePolicy !== "skip" && changedSourcePolicy !== "copy") {
      res.status(400).json({
        error: "changedSourcePolicy must be 'skip' or 'copy' in this backend slice",
      });
      return;
    }
    const sourceIds = Array.isArray(body.sourceIds)
      ? body.sourceIds.filter((value): value is string => typeof value === "string",)
      : [];
    if (selection === "selected" && sourceIds.length === 0) {
      res.status(400).json({ error: "sourceIds are required for selected import" });
      return;
    }
    const workspaceOverrides =
      body.workspaceOverrides && typeof body.workspaceOverrides === "object"
        ? (body.workspaceOverrides as Record<string, unknown>)
        : {};
    // Import is local-only, so this is the local vocabulary: imported
    // conversations are withheld from a future export unless asked otherwise.
    const visibility =
      body.visibility === "exportable" ? "exportable" : "no-export";
    const preflightOnly = body.preflightOnly === true;
    if (preflightOnly && harness === "pi") {
      res.status(400).json({ error: "preflightOnly is currently supported only for converted external sessions", });
      return;
    }

    try {
      const discovered = await discoverImportSessions({ harness, dataDir });
      const selected =
        selection === "all"
          ? discovered
          : discovered.filter((source) => sourceIds.includes(source.sourceId));
      const missingSourceIds =
        selection === "selected"
          ? sourceIds.filter(
              (sourceId) => !selected.some((source) => source.sourceId === sourceId),
            )
          : [];
      if (missingSourceIds.length > 0) {
        res.status(400).json({
          error: "One or more sourceIds are not present in current discovery",
          missingSourceIds,
        });
        return;
      }
      const metadata = sessionCreationMetadataForAuth(auth, visibility);
      const importSelectors = createDraftSelectorsForAuth(auth);
      const results = selected.map((source) => {
        if (source.repeat === "unchanged" && changedSourcePolicy !== "copy") {
          return {
            sourceId: source.sourceId,
            status: "unchanged" as const,
            sessionId: source.importedSessionId,
          };
        }
        if (source.repeat === "changed" && changedSourcePolicy === "skip") {
          return {
            sourceId: source.sourceId,
            status: "conflict" as const,
            sessionId: source.importedSessionId,
          };
        }
        const override = workspaceOverrides[source.sourceId];
        const workspacePrimaryDir =
          typeof override === "string" && override.trim() ? override : undefined;
        if (!source.cwdAvailable && !workspacePrimaryDir) {
          return {
            sourceId: source.sourceId,
            status: "needs_workspace" as const,
            sessionId: null,
          };
        }
        try {
          if (harness === "grok-build") {
            const preflight = preflightGrokImport(source);
            if (preflightOnly) {
              return {
                sourceId: source.sourceId,
                status: "ready" as const,
                sessionId: null,
                transformations: preflight.transformations,
              };
            }
            const registered = registerGrokImport({
              dataDir,
              source,
              preflight,
              mode,
              workspacePrimaryDir,
              rolePresetSlug: importSelectors.rolePresetSlug,
              soulSlug: importSelectors.soulSlug,
              ...metadata,
            });
            return {
              sourceId: source.sourceId,
              status: preflight.transformations.length
                ? ("imported_with_transformations" as const)
                : ("imported" as const),
              sessionId: registered.sessionId,
              transformations: preflight.transformations,
            };
          }
          if (
            harness === "opencode" ||
            harness === "codex" ||
            harness === "claude-code"
          ) {
            const preflight = harness === "opencode"
              ? preflightOpenCodeImport(source)
              : harness === "codex"
                ? preflightCodexImport(source)
                : preflightClaudeCodeImport(source);
            if (preflightOnly) {
              return {
                sourceId: source.sourceId,
                status: "ready" as const,
                sessionId: null,
                transformations: preflight.transformations,
              };
            }
            const common = {
              dataDir,
              source,
              mode: mode as AltMode,
              workspacePrimaryDir,
              rolePresetSlug: importSelectors.rolePresetSlug,
              soulSlug: importSelectors.soulSlug,
              ...metadata,
            };
            const registered = harness === "opencode"
              ? registerOpenCodeImport({ ...common, preflight })
              : harness === "codex"
                ? registerCodexImport({ ...common, preflight })
                : registerClaudeCodeImport({ ...common, preflight });
            return {
              sourceId: source.sourceId,
              status: preflight.transformations.length
                ? ("imported_with_transformations" as const)
                : ("imported" as const),
              sessionId: registered.sessionId,
              transformations: preflight.transformations,
            };
          }
          const registered = registerPiImport({
            dataDir,
            source,
            mode,
            workspacePrimaryDir,
            rolePresetSlug: importSelectors.rolePresetSlug,
            soulSlug: importSelectors.soulSlug,
            ...metadata,
          });
          return {
            sourceId: source.sourceId,
            status: "imported" as const,
            sessionId: registered.sessionId,
          };
        } catch (error) {
          if (error instanceof ImportRefusalError) {
            return {
              sourceId: source.sourceId,
              status: "refused" as const,
              sessionId: null,
              recordType: error.recordType,
              count: error.count,
              reason: error.reason,
            };
          }
          return {
            sourceId: source.sourceId,
            status: "failed" as const,
            sessionId: null,
            error: error instanceof Error ? error.message : String(error),
          };
        }
      });
      res.json({ harness, results });
    } catch (error) {
      if (error instanceof ImportHarnessNotImplementedError) {
        res.status(501).json({ error: error.message, harness });
        return;
      }
      const message = error instanceof Error ? error.message : String(error);
      res.status(500).json({ error: message });
    }
  });
  app.get("/api/sessions", (req, res) => {
    const auth = resolveSessionRestAuth(req, res);
    if (!auth) return;
    const list = listSessionSummaries(dataDir);
    const activity = sessionService.sessionActivity();
    res.json({
      ...list,
      sessions: list.sessions.filter((session) =>
        canAccessSessionSummary(auth, session),
      ).map((session) => ({
        ...session,
        runStatus: activity.get(session.sessionId) ?? "idle",
      })),
    });
  });
  app.get("/api/sessions/trash", (req, res) => {
    const auth = resolveSessionRestAuth(req, res);
    if (!auth) return;
    const list = listDeletedSessionSummaries(dataDir);
    res.json({
      ...list,
      sessions: list.sessions.filter((session) =>
        canAccessSessionSummary(auth, session),
      ),
    });
  });
  app.get("/api/sessions/:sessionId", (req, res) => {
    const sessionId = req.params.sessionId;
    const root = getSessionRootForRequest(dataDir, sessionId);
    if (root.status === "invalid") {
      res.status(400).json({ error: `Invalid session id: ${sessionId}` });
      return;
    }
    if (root.status === "missing") {
      res.status(404).json({ error: `Unknown session id: ${sessionId}` });
      return;
    }

    const auth = resolveSessionRestAuth(req, res);
    if (!auth) return;
    const detail = readSessionDetail(dataDir, sessionId);
    if (!detail) {
      res.status(404).json({ error: `Unknown session id: ${sessionId}` });
      return;
    }
    if (!canAccessSessionSummary(auth, detail.session)) {
      res.status(404).json({ error: `Unknown session id: ${sessionId}` });
      return;
    }
    if (!canAccessSessionContent(auth, detail.session)) {
      res.status(403).json({ error: "Session content is private" });
      return;
    }
    res.json(detail);
  });
  app.get("/api/sessions/:sessionId/changes", (req, res) => {
    const sessionId = req.params.sessionId;
    const root = getSessionRootForRequest(dataDir, sessionId);
    if (root.status === "invalid") {
      res.status(400).json({ error: `Invalid session id: ${sessionId}` });
      return;
    }
    if (root.status === "missing") {
      res.status(404).json({ error: `Unknown session id: ${sessionId}` });
      return;
    }
    const auth = resolveSessionRestAuth(req, res);
    if (!auth) return;
    const detail = readSessionDetail(dataDir, sessionId);
    if (!detail || !canAccessSessionSummary(auth, detail.session)) {
      res.status(404).json({ error: `Unknown session id: ${sessionId}` });
      return;
    }
    if (!canAccessSessionContent(auth, detail.session)) {
      res.status(403).json({ error: "Session content is private" });
      return;
    }
    const changes = readSessionChanges(dataDir, sessionId);
    if (!changes) {
      res.status(404).json({ error: `Unknown session id: ${sessionId}` });
      return;
    }
    res.json(changes);
  });
  app.delete("/api/sessions/:sessionId", async (req, res) => {
    const sessionId = req.params.sessionId;
    const root = getSessionRootForRequest(dataDir, sessionId);
    if (root.status === "invalid") {
      res.status(400).json({ error: `Invalid session id: ${sessionId}` });
      return;
    }
    if (root.status === "missing") {
      res.status(404).json({ error: `Unknown session id: ${sessionId}` });
      return;
    }
    const auth = resolveSessionRestAuth(req, res);
    if (!auth) return;
    const detail = readSessionDetail(dataDir, sessionId);
    if (!detail || !canAccessSessionSummary(auth, detail.session)) {
      res.status(404).json({ error: `Unknown session id: ${sessionId}` });
      return;
    }
    if (!canAccessSessionContent(auth, detail.session)) {
      res.status(403).json({ error: "Session content is private" });
      return;
    }
    try {
      // Delete means stop. A deleted conversation leaves the list, and with it
      // the only Stop button the user had, so a run left alive here would keep
      // writing and spending with nothing left to interrupt it.
      const activity = sessionService.sessionActivity();
      for (const attached of sessionsAttachedToDeletion(dataDir, sessionId)) {
        const state = activity.get(attached);
        if (state === "running" || state === "awaiting-approval") {
          await sessionService.abort(attached, "session_deleted");
        }
      }
      res.json({ deleted: softDeleteSession(dataDir, sessionId) });
    } catch (error) {
      res.status(409).json({
        error: error instanceof Error ? error.message : String(error),
      });
    }
  });
  app.post("/api/sessions/:sessionId/restore", (req, res) => {
    const sessionId = req.params.sessionId;
    if (!requireSessionRestContentAccess(req, res, sessionId)) return;
    try {
      res.json({ restored: restoreDeletedSession(dataDir, sessionId) });
    } catch (error) {
      res.status(409).json({
        error: error instanceof Error ? error.message : String(error),
      });
    }
  });
  app.delete("/api/sessions/:sessionId/permanent", (req, res) => {
    const sessionId = req.params.sessionId;
    if (!requireSessionRestContentAccess(req, res, sessionId)) return;
    try {
      res.json({
        deleted: permanentlyDeleteSession(
          dataDir,
          sessionId,
          (id) => sessionService.isOpen(id),
        ),
      });
    } catch (error) {
      res.status(409).json({
        error: error instanceof Error ? error.message : String(error),
      });
    }
  });
  app.post("/api/sessions/:sessionId/promote", (req, res) => {
    const sessionId = req.params.sessionId;
    if (!requireSessionRestContentAccess(req, res, sessionId)) return;
    try {
      const snapshot = sessionService.promoteRelatedSession(sessionId);
      res.json({ sessionId, snapshot });
    } catch (error) {
      res.status(409).json({
        error: error instanceof Error ? error.message : String(error),
      });
    }
  });
  // M4b: role swap — this conversation becomes the tree's listed
  // representative; the current one steps down.
  app.post("/api/sessions/:sessionId/promote-mainline", (req, res) => {
    const sessionId = req.params.sessionId;
    if (!requireSessionRestContentAccess(req, res, sessionId)) return;
    try {
      res.json({ sessionId, ...sessionService.promoteToMainline(sessionId) });
    } catch (error) {
      res.status(409).json({
        error: error instanceof Error ? error.message : String(error),
      });
    }
  });
  // M4: re-point a session's working folder (local form only, like
  // add_workspace_dir). primaryDir null = back to the managed default.
  app.put("/api/sessions/:sessionId/workspace", async (req, res) => {
    if (!localMode) {
      res.status(403).json({ error: "Workspace changes are local-mode only" });
      return;
    }
    const sessionId = req.params.sessionId;
    if (!requireSessionRestContentAccess(req, res, sessionId)) return;
    const body = req.body as { primaryDir?: unknown };
    const primaryDir =
      typeof body.primaryDir === "string" && body.primaryDir.trim()
        ? body.primaryDir
        : null;
    try {
      const snapshot = await sessionService.setSessionWorkspace(
        sessionId,
        primaryDir,
      );
      res.json({ sessionId, snapshot });
    } catch (error) {
      res.status(409).json({
        error: error instanceof Error ? error.message : String(error),
      });
    }
  });
  // M4: explicit working-folder registry so empty workspaces can appear in
  // the list before any conversation exists in them.
  app.get("/api/workspaces", (_req, res) => {
    if (!localMode) {
      res.json({ workspaces: [] });
      return;
    }
    res.json({
      workspaces: readAppSettings(dataDir).knownWorkspaces ?? [],
    });
  });
  app.post("/api/workspaces", (req, res) => {
    if (!localMode) {
      res.status(403).json({ error: "Workspaces are local-mode only" });
      return;
    }
    const body = req.body as { path?: unknown };
    const raw = typeof body.path === "string" ? body.path.trim() : "";
    if (!raw) {
      res.status(400).json({ error: "path is required" });
      return;
    }
    const resolved = resolve(raw);
    const stat = statSync(resolved, { throwIfNoEntry: false });
    if (!stat?.isDirectory()) {
      res.status(400).json({ error: `Folder does not exist: ${resolved}` });
      return;
    }
    const settings = readAppSettings(dataDir);
    const known = settings.knownWorkspaces ?? [];
    if (!known.includes(resolved)) {
      writeAppSettings(dataDir, {
        ...settings,
        knownWorkspaces: [...known, resolved],
      });
    }
    res.json({ workspaces: readAppSettings(dataDir).knownWorkspaces ?? [] });
  });
  app.delete("/api/workspaces", (req, res) => {
    if (!localMode) {
      res.status(403).json({ error: "Workspaces are local-mode only" });
      return;
    }
    const body = req.body as { path?: unknown };
    const raw = typeof body.path === "string" ? body.path.trim() : "";
    if (!raw) {
      res.status(400).json({ error: "path is required" });
      return;
    }
    const target = resolve(raw);
    const settings = readAppSettings(dataDir);
    writeAppSettings(dataDir, {
      ...settings,
      knownWorkspaces: (settings.knownWorkspaces ?? []).filter(
        (workspace) => workspace !== target,
      ),
    });
    res.json({ workspaces: readAppSettings(dataDir).knownWorkspaces ?? [] });
  });
  app.post("/api/sessions/:sessionId/ab-comparisons", (req, res) => {
    const sessionId = req.params.sessionId;
    if (!requireSessionRestContentAccess(req, res, sessionId)) return;
    try {
      const detail = readSessionDetail(dataDir, sessionId);
      if (!detail) {
        res.status(404).json({ error: `Unknown session id: ${sessionId}` });
        return;
      }
      const input = parseAbComparisonBody(sessionId, req.body);
      const record = appendAbComparisonRecord(
        resolve(dataDir, "sessions", sessionId, "records"),
        input,
      );
      res.json({ record });
    } catch (error) {
      res.status(400).json({
        error: error instanceof Error ? error.message : String(error),
      });
    }
  });
  // Continue-from-choice is PRELIM (owner decision 2026-07-16, round 3):
  // choosing = append the choice under the same comparisonId (latest wins)
  // + the client switches to the chosen arm session. No id rewriting.
  app.post(
    "/api/sessions/:sessionId/ab-comparisons/:comparisonId/choice",
    (req, res) => {
      const sessionId = req.params.sessionId;
      if (!requireSessionRestContentAccess(req, res, sessionId)) return;
      try {
        const recordsDir = resolve(dataDir, "sessions", sessionId, "records");
        const existing = currentAbComparisonRecords(recordsDir).find(
          (record) => record.comparisonId === req.params.comparisonId,
        );
        if (!existing) {
          res.status(404).json({
            error: `Unknown comparison id: ${req.params.comparisonId}`,
          });
          return;
        }
        const body = asObject(req.body);
        const selectedCandidateId = optionalString(body.selectedCandidateId);
        if (!selectedCandidateId) {
          throw new Error("selectedCandidateId is required");
        }
        const record = appendAbComparisonRecord(recordsDir, {
          ...existing,
          selectedCandidateId,
          decidedAt: new Date().toISOString(),
          notes: optionalString(body.notes) ?? existing.notes ?? null,
        });
        res.json({ record });
      } catch (error) {
        res.status(400).json({
          error: error instanceof Error ? error.message : String(error),
        });
      }
    },
  );
  app.post(
    "/api/sessions/:sessionId/ab-comparisons/generate",
    async (req, res) => {
      const sessionId = req.params.sessionId;
      if (!requireSessionRestContentAccess(req, res, sessionId)) return;
      const body = req.body ?? {};
      const prompt = typeof body.prompt === "string" ? body.prompt : "";
      const arms = Array.isArray(body.arms) ? body.arms : [];
      try {
        const record = await sessionService.generateAbComparison(
          sessionId,
          prompt,
          arms,
        );
        res.json({ record });
      } catch (error) {
        res.status(400).json({
          error: error instanceof Error ? error.message : String(error),
        });
      }
    },
  );
  app.get("/api/sessions/:sessionId/files", (req, res) => {
    const sessionId = req.params.sessionId;
    const rootName =
      typeof req.query.root === "string" ? req.query.root : undefined;
    if (!requireSessionRestContentAccess(req, res, sessionId)) return;
    try {
      if (rootName === "workspace") {
        const auth = authSessions.resolveRequest(req);
        const workspace = listWorkspaceFiles(
          dataDir,
          sessionId,
          auth.accountId,
        );
        const legacy = listSessionTextFiles(dataDir, sessionId, "workspace");
        res.json({
          files: legacy.files,
          entries: workspace.files,
          workingFolders: workspace.workingFolders,
          usage: workspace.usage,
        });
        return;
      }
      if (rootName === "working") {
        if (!localMode) {
          res.status(403).json({ error: "Working-folder browsing is local-only" });
          return;
        }
        res.json(listWorkingFolderFiles(dataDir, sessionId));
        return;
      }
      res.json(listSessionTextFiles(dataDir, sessionId, rootName));
    } catch (error) {
      sendFileApiError(res, error);
    }
  });
  app.post(
    "/api/sessions/:sessionId/files/upload",
    workspaceUpload.single("file"),
    async (req, res) => {
      const sessionId = req.params.sessionId;
      if (!requireSessionRestContentAccess(req, res, sessionId)) return;
      const auth = authSessions.resolveRequest(req);
      const uploadOwner = auth.accountId ?? (localMode ? "__local__" : null);
      if (!uploadOwner) {
        res.status(403).json({ error: "Upload requires an authenticated owner" });
        return;
      }
      const file = req.file;
      if (!file) {
        res.status(400).json({ error: "file is required" });
        return;
      }
      try {
        const result = await uploadWorkspaceFile(
          dataDir,
          sessionId,
          uploadOwner,
          file.originalname,
          file.buffer,
        );
        res.json(result);
      } catch (error) {
        sendFileApiError(res, error);
      }
    },
  );
  app.post("/api/sessions/:sessionId/files/retry-extract", async (req, res) => {
    const sessionId = req.params.sessionId;
    if (!requireSessionRestContentAccess(req, res, sessionId)) return;
    const body = req.body as { path?: unknown };
    if (typeof body?.path !== "string" || !body.path.trim()) {
      res.status(400).json({ error: "path is required" });
      return;
    }
    try {
      const result = await retryWorkspaceExtraction(
        dataDir,
        sessionId,
        body.path,
      );
      res.json(result);
    } catch (error) {
      sendFileApiError(res, error);
    }
  });
  app.get("/api/sessions/:sessionId/files/content", (req, res) => {
    const sessionId = req.params.sessionId;
    const rootName = typeof req.query.root === "string" ? req.query.root : "";
    const requestedPath =
      typeof req.query.path === "string" ? req.query.path : "";
    if (!requireSessionRestContentAccess(req, res, sessionId)) return;
    try {
      if (rootName === "working") {
        if (!localMode) {
          res.status(403).json({ error: "Working-folder browsing is local-only" });
          return;
        }
        res.json(readWorkingFolderTextFile(dataDir, sessionId, requestedPath));
        return;
      }
      res.json(readSessionTextFile(dataDir, sessionId, rootName, requestedPath),);
    } catch (error) {
      sendFileApiError(res, error);
    }
  });
  app.put("/api/sessions/:sessionId/files/content", (req, res) => {
    const sessionId = req.params.sessionId;
    const body = req.body as {
      root?: unknown;
      path?: unknown;
      content?: unknown;
    };
    if (
      typeof body?.root !== "string" ||
      typeof body.path !== "string" ||
      typeof body.content !== "string"
    ) {
      res.status(400).json({ error: "root, path, and content are required" });
      return;
    }
    if (!requireSessionRestContentAccess(req, res, sessionId)) return;
    try {
      res.json(
        writeSessionTextFile(
          dataDir,
          sessionId,
          body.root,
          body.path,
          body.content,
        ),
      );
    } catch (error) {
      sendFileApiError(res, error);
    }
  });
  app.get("/api/sessions/:sessionId/files/download", (req, res) => {
    const sessionId = req.params.sessionId;
    const rootName = typeof req.query.root === "string" ? req.query.root : "";
    const requestedPath =
      typeof req.query.path === "string" ? req.query.path : "";
    if (rootName !== "workspace") {
      res.status(400).json({ error: "Only workspace files can be downloaded" });
      return;
    }
    if (!requireSessionRestContentAccess(req, res, sessionId)) return;
    if (!isWorkspaceDownloadAllowed(requestedPath)) {
      res.status(400).json({ error: "This file cannot be downloaded" });
      return;
    }
    try {
      const file = readSessionTextFile(
        dataDir,
        sessionId,
        rootName,
        requestedPath,
      );
      res.attachment(file.path);
      res.type("text/plain").send(file.content);
    } catch (error) {
      sendFileApiError(res, error);
    }
  });
  app.delete("/api/sessions/:sessionId/files/content", (req, res) => {
    const sessionId = req.params.sessionId;
    const rootName =
      typeof req.query.root === "string"
        ? req.query.root
        : typeof req.body?.root === "string"
          ? req.body.root
          : "";
    const requestedPath =
      typeof req.query.path === "string"
        ? req.query.path
        : typeof req.body?.path === "string"
          ? req.body.path
          : "";
    if (rootName !== "workspace") {
      res.status(400).json({ error: "Only workspace files can be deleted" });
      return;
    }
    if (!requireSessionRestContentAccess(req, res, sessionId)) return;
    try {
      res.json(deleteWorkspaceFile(dataDir, sessionId, requestedPath));
    } catch (error) {
      sendFileApiError(res, error);
    }
  });

  function defaultRolePresetSlug(): string | null {
    return resolveRolePresetSlug(rolePresetsDir, DEFAULT_ROLE_PRESET_SLUG)
      ? DEFAULT_ROLE_PRESET_SLUG
      : null;
  }

  function defaultSoulSlug(): string | null {
    return resolveSoulSlug(soulDir, DEFAULT_SOUL_SLUG, legacySoulPath)
      ? DEFAULT_SOUL_SLUG
      : null;
  }

  function defaultInstructionRef(): string | null {
    return listInstructionAssets(instructionsDir).some(
      (asset) => asset.ref === DEFAULT_INSTRUCTION_REF,
    )
      ? DEFAULT_INSTRUCTION_REF
      : null;
  }

  function optionalSlug(value: string | null | undefined): string | null {
    return value && value.trim() ? value : null;
  }

  function resolveSessionRestAuth(
    req: express.Request,
    res: Response,
  ): AuthContext | null {
    const auth = authSessions.resolveRequest(req);
    if (!localMode && auth.role === "anonymous" && hasConfiguredAccounts()) {
      res.status(401).json({ error: "Authentication required" });
      return null;
    }
    return auth;
  }

  function requireLocalConfigMode(res: Response): boolean {
    if (localMode) return true;
    res.status(404).json({ error: "Not found" });
    return false;
  }

  function hasConfiguredAccounts(): boolean {
    return readAccountStore(dataDir).accounts.length > 0;
  }

  function canAccessSessionSummary(
    auth: AuthContext,
    session: SessionSummary,
  ): boolean {
    if (localMode) return true;
    if (auth.role === "participant") {
      return ( Boolean(auth.accountId) && session.ownerAccountId === auth.accountId
      );
    }
    return true;
  }

  function canAccessSessionContent(
    auth: AuthContext,
    session: SessionSummary,
  ): boolean {
    if (localMode) return true;
    if (session.visibility === "private") {
      return ( Boolean(auth.accountId) && session.ownerAccountId === auth.accountId
      );
    }
    if (auth.role === "participant") {
      return ( Boolean(auth.accountId) && session.ownerAccountId === auth.accountId
      );
    }
    return true;
  }

  function requireSessionRestContentAccess(
    req: express.Request,
    res: Response,
    sessionId: string,
  ): boolean {
    const root = getSessionRootForRequest(dataDir, sessionId);
    if (root.status === "invalid") {
      res.status(400).json({ error: `Invalid session id: ${sessionId}` });
      return false;
    }
    if (root.status === "missing") {
      res.status(404).json({ error: `Unknown session id: ${sessionId}` });
      return false;
    }
    const auth = resolveSessionRestAuth(req, res);
    if (!auth) return false;
    const detail = readSessionDetail(dataDir, sessionId);
    if (!detail || !canAccessSessionSummary(auth, detail.session)) {
      res.status(404).json({ error: `Unknown session id: ${sessionId}` });
      return false;
    }
    if (!canAccessSessionContent(auth, detail.session)) {
      res.status(403).json({ error: "Session content is private" });
      return false;
    }
    return true;
  }


  const sessionService = new SessionService({
    dataDir,
    assetPaths,
    kbDir,
    rolePresetsDir,
    soulDir,
    legacySoulPath,
    understandReadOnly,
    localMode,
    modelProvider,
    modelId,
    modelsPath: modelsPath ?? undefined,
    authPath: options.authPath,
    runtimeApiKey:
      options.runtimeApiKey ?? process.env.ALT_THEORY_MODEL_API_KEY,
    thinkingLevel: options.thinkingLevel,
    resourceDiscovery,
    skillsDir,
    instructionsDir,
    runLabel,
    testBatch,
    resolveRuntimeModelConfig: localMode
      ? () => requireLocalRuntimeModelConfig()
      : undefined,
    resolveInitialThinkingLevel: localMode
      ? (provider, selectedModelId) =>
          initialThinkingLevelForModel(
            agentConfigDir(),
            provider,
            selectedModelId,
          )
      : undefined,
    // Discovery of machine-local resources is a local-app capability; hosted
    // deployments never read the server's ~/.pi or ~/.agents directories.
    resolveExternalSkillPaths: localMode
      ? () => {
          const discovered = discoverSkillResources({
            altSkillsDir: skillsDir,
            agentDir: getAgentDir(),
          });
          return resolveExternalSkillPaths(
            readAppSettings(dataDir),
            discovered.skills
              .filter((skill) => skill.source !== "alt-theory")
              .map((skill) => skill.path),
          );
        }
      : undefined,
    modelFallbackConfigPath:
      process.env.ALT_THEORY_MODEL_FALLBACK_PATH ?? null,
  });

  // Hosted only. A participant marking a conversation "private" means "don't
  // keep this"; deleting it after 7 inactive days is how that is kept. Local
  // installs never reach this — they cannot produce a "private" conversation.
  if (!localMode) {
    const stopRetentionSweep = sweepExpiredPrivateSessions(
      dataDir,
      (sessionId) => sessionService.isOpen(sessionId),
      (result) => {
        console.log(
          `Private retention: deleted ${result.deleted.length} expired conversation(s).`,
        );
      },
    );
    httpServer.on("close", stopRetentionSweep);
  }
  const stopTrashSweep = sweepExpiredDeletedSessions(
    dataDir,
    (sessionId) => sessionService.isOpen(sessionId),
  );
  httpServer.on("close", stopTrashSweep);

  function requireLocalRuntimeModelConfig(): RuntimeModelConfig {
    const runtimeConfig = getRuntimeModelConfig(agentConfigDir());
    if (!runtimeConfig.modelProvider || !runtimeConfig.modelId) {
      throw new ConfigValidationError(
        "No usable local model is active. Open Model setup, save a provider key, choose a model, and set it active.",
      );
    }
    return runtimeConfig;
  }

  function parseAbComparisonBody(
    sessionId: string,
    body: unknown,
  ): AbComparisonInput {
    const value = asObject(body);
    const trigger = optionalString(value.trigger) ?? "manual";
    if (!isAbTrigger(trigger)) {
      throw new Error("invalid A/B trigger");
    }
    const candidates = asArray(value.candidates).map(parseAbCandidate);
    return {
      sessionId,
      trigger,
      promptEntryId: optionalString(value.promptEntryId),
      responseEntryId: optionalString(value.responseEntryId),
      selectedCandidateId: optionalString(value.selectedCandidateId),
      candidates,
      scores:
        value.scores === undefined
          ? undefined
          : asArray(value.scores).map(parseAbScore),
      notes: optionalString(value.notes),
      source:
        value.source === undefined ? undefined : parseAbSource(value.source),
    };
  }

  function parseAbCandidate(value: unknown): AbComparisonCandidate {
    const candidate = asObject(value);
    const candidateId = optionalString(candidate.candidateId);
    if (!candidateId) throw new Error("candidateId is required");
    return {
      candidateId,
      label: optionalString(candidate.label),
      provider: optionalString(candidate.provider),
      model: optionalString(candidate.model),
      role: optionalString(candidate.role),
      promptRef: optionalString(candidate.promptRef),
      instructionRef: optionalString(candidate.instructionRef),
      kbDomain: optionalString(candidate.kbDomain),
      outputText: optionalString(candidate.outputText),
      artifact:
        candidate.artifact === undefined
          ? undefined
          : parseAbArtifact(candidate.artifact),
    };
  }

  function parseAbScore(value: unknown): AbComparisonScore {
    const score = asObject(value);
    const candidateId = optionalString(score.candidateId);
    const metric = optionalString(score.metric);
    if (!candidateId || !metric) {
      throw new Error("score candidateId and metric are required");
    }
    if (typeof score.value !== "number") {
      throw new Error("score value must be a number");
    }
    return { candidateId, metric, value: score.value };
  }

  function parseAbSource(value: unknown,): NonNullable<AbComparisonInput["source"]> {
    const source = asObject(value);
    return {
      package: optionalString(source.package),
      artifactVersion:
        typeof source.artifactVersion === "string" ||
        typeof source.artifactVersion === "number"
          ? source.artifactVersion
          : null,
      runId: optionalString(source.runId),
      asyncDir: optionalString(source.asyncDir),
      resultFile: optionalString(source.resultFile),
      eventsFile: optionalString(source.eventsFile),
    };
  }

  function parseAbArtifact(
    value: unknown,
  ): NonNullable<AbComparisonCandidate["artifact"]> {
    const artifact = asObject(value);
    return {
      runId: optionalString(artifact.runId),
      sessionId: optionalString(artifact.sessionId),
      asyncDir: optionalString(artifact.asyncDir),
      resultFile: optionalString(artifact.resultFile),
      statusFile: optionalString(artifact.statusFile),
      eventsFile: optionalString(artifact.eventsFile),
      outputFile: optionalString(artifact.outputFile),
      sessionFile: optionalString(artifact.sessionFile),
    };
  }

  function isAbTrigger(
    value: string
  ): value is AbComparisonInput["trigger"] {
    return [
      "manual",
      "backend_request",
      "config_rule",
      "pi_subagents",
      "imported",
    ].includes(value);
  }

  function asArray(value: unknown): unknown[] {
    if (!Array.isArray(value)) throw new Error("expected array");
    return value;
  }

  function asObject(value: unknown): Record<string, unknown> {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      throw new Error("expected object");
    }
    return value as Record<string, unknown>;
  }

  function optionalString(value: unknown): string | null {
    return typeof value === "string" && value.trim() ? value : null;
  }

  function forwardServiceEvent(
    send: (msg: ServerMessage) => void,
    event: SessionServiceEvent,
  ): void {
    switch (event.type) {
      case "snapshot":
        send({ type: "session_updated", payload: event.payload });
        break;
      case "assistant_delta":
        send({ type: "assistant_delta", payload: event.payload });
        break;
      case "thinking_delta":
        send({ type: "thinking_delta", payload: event.payload });
        break;
      case "run_phase":
        send({ type: "run_phase", payload: event.payload });
        break;
      case "tool_started":
        send({ type: "tool_started", payload: event.payload });
        break;
      case "tool_updated":
        send({ type: "tool_updated", payload: event.payload });
        break;
      case "tool_finished":
        send({ type: "tool_finished", payload: event.payload });
        break;
      case "run_completed":
        send({ type: "run_completed", payload: event.payload });
        break;
      case "run_failed":
        send({ type: "run_failed", payload: event.payload });
        break;
      case "user_steered":
        send({ type: "user_steered", payload: event.payload });
        break;
      case "session_transcript":
        send({ type: "session_transcript", payload: event.payload });
        break;
      case "session_metrics":
        send({ type: "session_metrics", payload: event.payload });
        break;
      case "approval_requested":
        send({ type: "approval_requested", payload: event.payload });
        break;
      case "approval_resolved":
        send({ type: "approval_resolved", payload: event.payload });
        break;
      case "extension_notice":
        send({ type: "extension_notice", payload: event.payload });
        break;
    }
  }

  function sendError(
    send: (msg: ServerMessage) => void,
    error: unknown,
    code?: string,
  ): void {
    send({
      type: "error",
      payload: {
        error: error instanceof Error ? error.message : String(error),
        ...(code ? { code } : {}),
      },
    });
  }

  function sendServiceError(send: (msg: ServerMessage) => void, error: unknown,) {
    if (error instanceof SessionBusyError) {
      sendError(send, error, error.code);
      return;
    }
    sendError(send, error);
  }

  function createDraftSelectors(): SessionSelectors {
    return {
      rolePresetSlug: defaultRolePresetSlug(),
      kbDomain: "ep-core",
      soulSlug: defaultSoulSlug(),
      customInstructionRef: defaultInstructionRef(),
    };
  }

  function createDraftSelectorsForAuth(auth: AuthContext): SessionSelectors {
    const selectors = createDraftSelectors();
    if (auth.role !== "participant" || !auth.defaultRoleCondition) {
      return selectors;
    }
    return {
      ...selectors,
      rolePresetSlug: rolePresetSlugForCondition(auth.defaultRoleCondition),
    };
  }

  function rolePresetSlugForCondition(conditionId: string): string {
    const rolePresetSlug =
      DEFAULT_ROLE_CONDITION_PRESETS[conditionId] ?? conditionId;
    if (!resolveRolePresetSlug(rolePresetsDir, rolePresetSlug)) {
      throw new Error(
        `Role condition '${conditionId}' maps to missing role preset: ${rolePresetSlug}`,
      );
    }
    return rolePresetSlug;
  }

  function sessionCreationMetadataForAuth(
    auth: AuthContext,
    visibility: SessionVisibility,
  ) {
    const withheld = withholdsFromResearch(visibility);
    if (auth.role !== "participant" || !auth.accountId) {
      return {
        visibility,
        consentSnapshot: withheld
          ? {
              researcherReadable: false,
              quoteAfterAnonymization: false,
              privateOverride: true,
            }
          : null,
      };
    }
    return {
      ownerAccountId: auth.accountId,
      roleCondition: auth.defaultRoleCondition,
      visibility,
      consentSnapshot: {
        researcherReadable: withheld
          ? false
          : Boolean(auth.defaultConsent?.researcherReadable),
        quoteAfterAnonymization: withheld
          ? false
          : Boolean(auth.defaultConsent?.quoteAfterAnonymization),
        privateOverride: withheld,
      },
    };
  }

  function canMaterializeSession(auth: AuthContext): boolean {
    return auth.role !== "anonymous" || !hasConfiguredAccounts();
  }

  /**
   * Sharing default follows study designation (M7 §4), stated in the
   * deployment's own vocabulary. Hosted keeps the pre-existing default
   * (participants consented). A local install withholds by default unless it
   * was designated at handout — and locally that is a marker for a future
   * export filter, never an expiry.
   */
  function defaultDraftVisibility(): SessionVisibility {
    if (!localMode) return "research";
    return readAppSettings(dataDir).participant?.designated
      ? "exportable"
      : "no-export";
  }

  function sendDraft(
    send: (msg: ServerMessage) => void,
    selectors: SessionSelectors,
    visibility: SessionVisibility,
    mode: AltMode,
    modelOverride: SessionModelOverride | null = null,
    studyTag: StudyTag | null = null,
    workspacePrimaryDir: string | null = null,
    resetComposer = false,
  ): void {
    send({
      type: "session_draft",
      payload: {
        status: "draft",
        visibility,
        currentDomain: selectors.kbDomain,
        rolePresetSlug: selectors.rolePresetSlug,
        soulSlug: selectors.soulSlug,
        customInstructionRef: selectors.customInstructionRef ?? null,
        mode,
        modelOverride,
        studyTag,
        workspacePrimaryDir,
        resetComposer,
      },
    });
  }

  wss.on("connection", async (ws: WebSocket, req) => {
    const heartbeatSocket = ws as WebSocket & { isAlive?: boolean };
    heartbeatSocket.isAlive = true;
    heartbeatSocket.on("pong", () => {
      heartbeatSocket.isAlive = true;
    });

    let auth = authSessions.resolveRequest(req);
    let attachedSessionId: string | null = null;
    let detach = () => {};
    let closed = false;
    let draftSelectors: SessionSelectors;
    let draftVisibility: SessionVisibility = defaultDraftVisibility();
    let draftMode: AltMode =
      readAppSettings(dataDir).defaultAltMode ?? "understand";
    let draftModelOverride: SessionModelOverride | null = null;
    let draftStudyTag: StudyTag | null = null;
    // Sticky across new_session: the workspace selector chooses where NEW
    // conversations go until the user changes it (M4).
    let draftWorkspace: string | null = null;
    let initialError: unknown = null;
    try {
      draftSelectors = createDraftSelectorsForAuth(auth);
    } catch (error) {
      auth = anonymousAuthContext();
      draftSelectors = createDraftSelectors();
      initialError = error;
    }

    const send = (msg: ServerMessage) => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify(msg));
      }
    };
    const sendCurrentDraft = (resetComposer = false) => {
      sendDraft(
        send,
        draftSelectors,
        draftVisibility,
        draftMode,
        draftModelOverride,
        draftStudyTag,
        draftWorkspace,
        resetComposer,
      );
    };

    const requireSessionWsContentAccess = (sessionId: string): SessionSummary => {
      const summary = readSessionAccessSummary(dataDir, sessionId);
      if (!summary || !canAccessSessionSummary(auth, summary)) {
        throw new Error(`Unknown session id: ${sessionId}`);
      }
      if (!canAccessSessionContent(auth, summary)) {
        throw new Error("Session content is private");
      }
      if (summary.deletedAt) {
        throw new Error("Conversation is in Trash");
      }
      return summary;
    };

    const attachToSession = (sessionId: string) => {
      detach();
      attachedSessionId = sessionId;
      detach = sessionService.attach(sessionId, (event) => {
        forwardServiceEvent(send, event);
      });
      send({ type: "session_opened", payload: sessionService.getSnapshot(sessionId), });
      send({ type: "session_metadata", payload: sessionService.getManifest(sessionId), });
      send({ type: "session_metrics", payload: sessionService.getMetrics(sessionId), });
    };

    // Transcript + in-flight turn (v1.4.3): records land at turn end, so a
    // pane opened mid-run would otherwise be blank until the run finishes.
    // Append the running prompt's bubble and replay the buffered stream.
    const sendTranscriptWithLiveReplay = (sessionId: string) => {
      const messages = sessionService.getTranscript(sessionId);
      const live = sessionService.getLiveRun(sessionId);
      const last = messages.at(-1);
      if (
        live?.userText &&
        !(last?.role === "user" && last.text === live.userText)
      ) {
        messages.push({ role: "user", text: live.userText, timestamp: null });
      }
      send({ type: "session_transcript", payload: { messages } });
      for (const event of live?.events ?? []) {
        forwardServiceEvent(send, event);
      }
    };

    ws.on("close", () => {
      closed = true;
      detach();
      detach = () => {};
      attachedSessionId = null;
    });

    if (initialError) {
      sendServiceError(send, initialError);
    }
    sendCurrentDraft(true);

    ws.on("message", async (data) => {
      let msg: ClientMessage;
      try {
        msg = JSON.parse(data.toString()) as ClientMessage;
      } catch {
        send({ type: "error", payload: { error: "Invalid JSON" } });
        return;
      }
      if (
        readAppSettings(dataDir).runtimeMode === "native-pi" &&
        ["switch_kb", "switch_role_preset", "switch_soul", "switch_mode"].includes(
          msg.type,
        )
      ) {
        sendError(
          send,
          new Error("This Alt Theory control is inactive while Native Pi is on"),
        );
        return;
      }
      if (attachedSessionId && msg.type !== "new_session") {
        try {
          requireSessionWsContentAccess(attachedSessionId);
        } catch (error) {
          detach();
          detach = () => {};
          attachedSessionId = null;
          sendError(send, error);
          return;
        }
      }

      switch (msg.type) {
        case "prompt": {
          try {
            if (!attachedSessionId) {
              if (!canMaterializeSession(auth)) {
                sendError(
                  send,
                  new Error("Authentication required"),
                  "auth_required",
                );
                break;
              }
              const initial = await sessionService.createSession(
                draftSelectors,
                {
                  ...sessionCreationMetadataForAuth(auth, draftVisibility),
                  mode: draftMode,
                  modelOverride: draftModelOverride,
                  studyTag: draftStudyTag,
                  workspace: draftWorkspace
                    ? { primaryDir: draftWorkspace }
                    : null,
                },
              );
              if (closed) return;
              attachToSession(initial.sessionId);
            }
            const currentSessionId = attachedSessionId;
            const run = sessionService.runPrompt(
              currentSessionId,
              msg.payload,
              msg.attachments,
            );
            await run.completion;
          } catch (error) {
            if (error instanceof SessionBusyError) {
              // Pi TUI behavior: typing while a turn runs steers the turn
              // instead of erroring — required for messaging running
              // subagents directly (alpha.5 M2).
              if (
                attachedSessionId &&
                sessionService.steerRunningSession(attachedSessionId, msg.payload)
              ) {
                send({
                  type: "extension_notice",
                  payload: {
                    message: t(
                      "Delivered to the running turn — Alt sees it at its next step.",
                    ),
                    level: "info",
                  },
                });
              } else {
                sendError(send, error, error.code);
              }
            } else {
              send({
                type: "run_failed",
                payload: {
                  error: error instanceof Error ? error.message : String(error),
                  // A preflight failure (no API key, unknown model) records no
                  // user entry; offering Retry there errors on click.
                  canRetry: attachedSessionId
                    ? sessionService.canRetryFailed(attachedSessionId)
                    : false,
                },
              });
            }
          }
          break;
        }
        case "abort":
          if (!attachedSessionId) {
            sendCurrentDraft();
            break;
          }
          try {
            await sessionService.abort(attachedSessionId);
          } catch (error) {
            sendError(send, error);
          }
          break;
        case "compact":
          if (!attachedSessionId) {
            sendError(
              send,
              new Error("Open a conversation before compacting it"),
            );
            break;
          }
          try {
            await sessionService.compact(attachedSessionId);
            send({
              type: "extension_notice",
              payload: { message: "Conversation compacted", level: "info" },
            });
          } catch (error) {
            send({
              type: "extension_notice",
              payload: {
                message: `Compaction failed: ${
                  error instanceof Error ? error.message : String(error)
                }`,
                level: "warning",
              },
            });
          }
          break;
        case "switch_kb":
          if (!attachedSessionId) {
            if (
              msg.payload.domain !== KB_DISABLED_DOMAIN &&
              !isKnownKbDomain(kbDir, msg.payload.domain)
            ) {
              sendError(send, new Error(`Unknown KB domain: ${msg.payload.domain}`),);
              break;
            }
            draftSelectors = { ...draftSelectors, kbDomain: msg.payload.domain, };
            sendCurrentDraft();
            break;
          }
          try {
            sessionService.setKbDomain(attachedSessionId, msg.payload.domain);
          } catch (error) {
            sendServiceError(send, error);
          }
          break;
        case "switch_role_preset": {
          const rolePresetSlug = optionalSlug(msg.payload.rolePresetSlug);
          if (!attachedSessionId) {
            draftSelectors = { ...draftSelectors, rolePresetSlug };
            sendCurrentDraft();
            break;
          }
          const selectors = sessionService.getSelectors(attachedSessionId);
          try {
            const replacement = await sessionService.replaceSession(
              attachedSessionId,
              { ...selectors, rolePresetSlug },
              "role_preset_switch",
            );
            if (!closed) attachToSession(replacement.sessionId);
          } catch (error) {
            sendServiceError(send, error);
          }
          break;
        }
        case "switch_soul": {
          const soulSlug = optionalSlug(msg.payload.soulSlug);
          if (!attachedSessionId) {
            draftSelectors = { ...draftSelectors, soulSlug };
            sendCurrentDraft();
            break;
          }
          const selectors = sessionService.getSelectors(attachedSessionId);
          try {
            const replacement = await sessionService.replaceSession(
              attachedSessionId,
              { ...selectors, soulSlug },
              "soul_switch",
            );
            if (!closed) attachToSession(replacement.sessionId);
          } catch (error) {
            sendServiceError(send, error);
          }
          break;
        }
        case "switch_instruction": {
          const customInstructionRef = optionalSlug(
            msg.payload.customInstructionRef,
          );
          if (!attachedSessionId) {
            draftSelectors = { ...draftSelectors, customInstructionRef };
            sendCurrentDraft();
            break;
          }
          const selectors = sessionService.getSelectors(attachedSessionId);
          try {
            const replacement = await sessionService.replaceSession(
              attachedSessionId,
              { ...selectors, customInstructionRef },
              "instruction_switch",
            );
            if (!closed) attachToSession(replacement.sessionId);
          } catch (error) {
            sendServiceError(send, error);
          }
          break;
        }
        case "switch_visibility": {
          // The guard that keeps the deployments apart: a local install can
          // never write "private" (the only retention-bearing value), and a
          // hosted one can never write the local export markers.
          if (!isVisibilityForMode(msg.payload.visibility, localMode)) {
            sendError(send, new Error("Invalid visibility"));
            break;
          }
          if (attachedSessionId) {
            try {
              const metadata = sessionCreationMetadataForAuth(
                auth,
                msg.payload.visibility,
              );
              send({
                type: "session_updated",
                payload: sessionService.setVisibility(
                  attachedSessionId,
                  msg.payload.visibility,
                  metadata.consentSnapshot,
                ),
              });
            } catch (error) {
              sendServiceError(send, error);
            }
            break;
          }
          draftVisibility = msg.payload.visibility;
          sendCurrentDraft();
          break;
        }
        case "set_study_tag": {
          if (!attachedSessionId) {
            draftStudyTag = msg.payload.studyTag ?? null;
            sendCurrentDraft();
            break;
          }
          try {
            send({
              type: "session_updated",
              payload: sessionService.setStudyTag(
                attachedSessionId,
                msg.payload.studyTag ?? null,
              ),
            });
          } catch (error) {
            sendServiceError(send, error);
          }
          break;
        }
        case "set_draft_workspace": {
          if (!localMode) {
            sendError(send, new Error("Workspaces are local-mode only"));
            break;
          }
          const raw = msg.payload.primaryDir;
          if (raw) {
            const resolved = resolve(raw);
            const stat = statSync(resolved, { throwIfNoEntry: false });
            if (!stat?.isDirectory()) {
              sendError(
                send,
                new Error(`Working folder does not exist: ${resolved}`),
              );
              break;
            }
            draftWorkspace = resolved;
          } else {
            draftWorkspace = null;
          }
          // The selector chooses where the NEXT conversation goes (sticky
          // draft); re-pointing an existing session goes through the HTTP
          // route instead. No echo needed while attached — a session_draft
          // here would reset the client's live-session state.
          if (!attachedSessionId) {
            sendCurrentDraft();
          }
          break;
        }
        case "set_session_model": {
          if (!attachedSessionId) {
            // Draft state: remember the choice and apply it on materialization.
            draftModelOverride = msg.payload.override ?? null;
            sendCurrentDraft();
            break;
          }
          try {
            send({
              type: "session_updated",
              payload: await sessionService.setSessionModel(
                attachedSessionId,
                msg.payload.override ?? null,
              ),
            });
          } catch (error) {
            sendServiceError(send, error);
          }
          break;
        }
        case "invoke_skill": {
          try {
            if (!attachedSessionId) {
              if (!canMaterializeSession(auth)) {
                sendError(
                  send,
                  new Error("Authentication required"),
                  "auth_required",
                );
                break;
              }
              const initial = await sessionService.createSession(
                draftSelectors,
                {
                  ...sessionCreationMetadataForAuth(auth, draftVisibility),
                  mode: draftMode,
                  modelOverride: draftModelOverride,
                  studyTag: draftStudyTag,
                  workspace: draftWorkspace
                    ? { primaryDir: draftWorkspace }
                    : null,
                },
              );
              if (closed) return;
              attachToSession(initial.sessionId);
            }
            const run = sessionService.invokeSkill(
              attachedSessionId,
              msg.payload.skillName,
              msg.payload.userText,
            );
            await run.completion;
          } catch (error) {
            sendServiceError(send, error);
          }
          break;
        }
        case "revise_latest": {
          if (!attachedSessionId) {
            sendError(send, new Error("A materialized session is required"));
            break;
          }
          try {
            const run = msg.payload.entryId
              ? sessionService.reviseAt(
                  attachedSessionId,
                  msg.payload.entryId,
                  msg.payload.text,
                )
              : sessionService.reviseLatest(
                  attachedSessionId,
                  msg.payload.text,
                );
            await run.completion;
          } catch (error) {
            sendServiceError(send, error);
          }
          break;
        }
        case "branch_revision": {
          if (!attachedSessionId) {
            sendError(send, new Error("A materialized session is required"));
            break;
          }
          try {
            const sourceSessionId = attachedSessionId;
            const targetEntryId =
              msg.payload.entryId ??
              sessionService
                .getTranscript(sourceSessionId)
                .filter((message) => message.role === "user")
                .at(-1)?.entryId;
            if (!targetEntryId) {
              throw new Error("No user prompt is available to edit");
            }
            const forked = await sessionService.forkSession(
              sourceSessionId,
              "fork",
            );
            if (closed) break;
            // The branch is a comparison, not a destination: this connection
            // stays on the source conversation and the client opens the fork
            // in its own pane (own socket). Re-attaching here is what used to
            // swallow the typed text and glue the new answer under the old.
            send({
              type: "branch_created",
              payload: {
                sessionId: forked.sessionId,
                sourceSessionId,
              },
            });
            const run = sessionService.reviseAt(
              forked.sessionId,
              targetEntryId,
              msg.payload.text,
            );
            await run.completion;
          } catch (error) {
            sendServiceError(send, error);
          }
          break;
        }
        case "prepare_branch_revision": {
          if (!attachedSessionId) {
            sendError(send, new Error("A materialized session is required"));
            break;
          }
          try {
            const sourceSessionId = attachedSessionId;
            const forked = await sessionService.prepareRevisionBranch(
              sourceSessionId,
              msg.payload.entryId,
            );
            if (closed) break;
            send({
              type: "branch_created",
              payload: { sessionId: forked.sessionId, sourceSessionId },
            });
          } catch (error) {
            sendServiceError(send, error);
          }
          break;
        }
        case "retry_latest": {
          if (!attachedSessionId) {
            sendError(send, new Error("A materialized session is required"));
            break;
          }
          try {
            const run = sessionService.retryLatestFromStart(attachedSessionId);
            await run.completion;
          } catch (error) {
            sendServiceError(send, error);
          }
          break;
        }
        case "delete_latest": {
          if (!attachedSessionId) {
            sendError(send, new Error("A materialized session is required"));
            break;
          }
          try {
            const snapshot = sessionService.deleteLatest(attachedSessionId);
            send({ type: "session_updated", payload: snapshot });
            send({
              type: "session_transcript",
              payload: {
                messages: sessionService.getTranscript(attachedSessionId),
              },
            });
          } catch (error) {
            sendServiceError(send, error);
          }
          break;
        }
        case "switch_mode": {
          if (msg.payload.mode !== "understand" && msg.payload.mode !== "work") {
            sendError(send, new Error("Unknown mode"));
            break;
          }
          if (!attachedSessionId) {
            draftMode = msg.payload.mode;
            sendCurrentDraft();
            break;
          }
          try {
            const snapshot = await sessionService.switchMode(
              attachedSessionId,
              msg.payload.mode,
            );
            send({ type: "session_updated", payload: snapshot });
          } catch (error) {
            sendServiceError(send, error);
          }
          break;
        }
        case "add_workspace_dir": {
          if (!attachedSessionId) {
            sendError(send, new Error("A materialized session is required"));
            break;
          }
          // Workspace directories are available in Work and Native Pi:
          // machine-local paths only make sense in the local form.
          if (!localMode) {
            sendError(
              send,
              new Error("Workspace directories are not enabled on this server"),
            );
            break;
          }
          if (
            typeof msg.payload?.dir !== "string" ||
            !msg.payload.dir.trim()
          ) {
            sendError(send, new Error("A workspace directory is required"));
            break;
          }
          try {
            const snapshot = await sessionService.addWorkspaceDir(
              attachedSessionId,
              msg.payload.dir,
            );
            send({ type: "session_updated", payload: snapshot });
          } catch (error) {
            sendServiceError(send, error);
          }
          break;
        }
        case "respond_approval": {
          if (!attachedSessionId) {
            sendError(send, new Error("A materialized session is required"));
            break;
          }
          if (typeof msg.payload?.approvalId !== "string") {
            sendError(send, new Error("An approvalId is required"));
            break;
          }
          try {
            const { approvalId, accept, choice, text } = msg.payload;
            sessionService.respondApproval(attachedSessionId, approvalId, {
              accept,
              choice,
              text,
            });
          } catch (error) {
            sendServiceError(send, error);
          }
          break;
        }
        case "fork_session": {
          const forkSource = msg.payload.sourceSessionId ?? attachedSessionId;
          if (!forkSource) {
            sendError(send, new Error("A materialized session is required"));
            break;
          }
          try {
            requireSessionWsContentAccess(forkSource);
            const forked = await sessionService.forkSession(
              forkSource,
              msg.payload.purpose,
              msg.payload.forkPointEntryId,
            );
            if (!closed) {
              if (msg.payload.sourceSessionId) {
                // Session-list Duplicate intentionally follows its copy.
                attachToSession(forked.sessionId);
                send({
                  type: "session_transcript",
                  payload: {
                    messages: sessionService.getTranscript(forked.sessionId),
                  },
                });
              } else {
                // `/branch` is an idle Related conversation; keep this socket
                // attached to its source just like edit comparison.
                send({
                  type: "branch_created",
                  payload: { sessionId: forked.sessionId, sourceSessionId: forkSource },
                });
              }
            }
          } catch (error) {
            sendServiceError(send, error);
          }
          break;
        }
        case "create_related_session": {
          if (!attachedSessionId) {
            sendError(send, new Error("A materialized session is required"));
            break;
          }
          try {
            const related = await sessionService.createRelatedSession(
              attachedSessionId,
              msg.payload.purpose,
              msg.payload.forkPointEntryId,
            );
            if (!closed) {
              send({
                type: "related_session_created",
                payload: {
                  sessionId: related.sessionId,
                  purpose: msg.payload.purpose,
                },
              });
            }
          } catch (error) {
            sendServiceError(send, error);
          }
          break;
        }
        case "new_session": {
          if (attachedSessionId) {
            draftSelectors = sessionService.getSelectors(attachedSessionId);
          }
          detach();
          detach = () => {};
          attachedSessionId = null;
          draftVisibility = defaultDraftVisibility();
          // Model override is a per-conversation choice; workspace stays
          // sticky for the next conversation.
          draftMode =
            readAppSettings(dataDir).defaultAltMode ?? "understand";
          draftModelOverride = null;
          draftStudyTag = null;
          sendCurrentDraft(true);
          break;
        }
        case "open_session": {
          const selectors = attachedSessionId
            ? sessionService.getSelectors(attachedSessionId)
            : draftSelectors;
          try {
            requireSessionWsContentAccess(msg.payload.sessionId);
            const opened = await sessionService.openSession(
              msg.payload.sessionId,
              selectors,
            );
            if (closed) return;
            attachToSession(opened.sessionId);
            sendTranscriptWithLiveReplay(opened.sessionId);
          } catch (error) {
            sendError(send, error);
          }
          break;
        }
        case "get_session_metadata":
          if (!attachedSessionId) {
            sendCurrentDraft();
            break;
          }
          send({
            type: "session_metadata",
            payload: sessionService.getManifest(attachedSessionId),
          });
          break;
        case "get_session_metrics":
          if (!attachedSessionId) {
            sendCurrentDraft();
            break;
          }
          send({
            type: "session_metrics",
            payload: sessionService.getMetrics(attachedSessionId),
          });
          break;
      }
    });
  });
  return {
    app,
    httpServer,
    wss,
    config: {
      dataDir,
      assetPaths,
      kbDir,
      rolePresetsDir,
      soulDir,
      publicDir,
      understandReadOnly,
      modelProvider,
      modelId,
      modelsPath,
      resourceDiscovery,
      skillsDir,
      instructionsDir,
      runLabel,
      testBatch,
      appMode,
    },
  };
}

function sendFileApiError(res: Response, error: unknown): void {
  const message = error instanceof Error ? error.message : String(error);
  const status = /Unknown session/.test(message)
    ? 404
    : /Invalid|inside|allowed|required|large/.test(message)
      ? 400
      : 500;
  res.status(status).json({ error: message });
}

const isMain = process.argv[1]
  ? resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))
  : false;

if (isMain) {
  const port = Number.parseInt(process.env.PORT ?? "3000", 10);
  const host = process.env.HOST ?? "127.0.0.1";
  const instance = createAltTheoryServer();
  instance.httpServer.listen(port, host, () => {
    const { assetPaths } = instance.config;
    const explicitModelSelection = Boolean(
      instance.config.modelProvider &&
        instance.config.modelId &&
        instance.config.modelsPath,
    );
    console.log(`Alt Theory server running on http://${host}:${port}`);
    console.log(`  Data dir:          ${instance.config.dataDir}`);
    console.log(`  Agent assets:      ${assetPaths.rootDir}`);
    console.log(
      `  App context:       ${assetPaths.appContextPath} (${existsSync(assetPaths.appContextPath) ? "found" : "missing"})`,
    );
    console.log(
      `  Soul dir:          ${assetPaths.soulDir} (${existsSync(assetPaths.soulDir) ? "found" : "missing"})`,
    );
    console.log(
      `  Default soul:      ${assetPaths.soulPath ?? "(none)"} (${assetPaths.soulPath && existsSync(assetPaths.soulPath) ? "found" : "not loaded"})`,
    );
    if (!assetPaths.soulPath || !existsSync(assetPaths.soulPath)) {
      console.warn(
        "  WARNING: default soul (soul-latest.md) is missing — new conversations will run WITHOUT a soul. Check agent-assets/soul/.",
      );
    }
    console.log(
      `  Role presets:      ${assetPaths.rolePresetsDir} (${existsSync(assetPaths.rolePresetsDir) ? "found" : "missing"})`,
    );
    console.log(
      `  KB root:           ${instance.config.kbDir} (${existsSync(instance.config.kbDir) ? "found" : "missing"})`,
    );
    console.log(
      `  Pi prompts:        ${assetPaths.piPromptTemplatesDir} (${existsSync(assetPaths.piPromptTemplatesDir) ? "found" : "missing"})`,
    );
    console.log(`  Models path:       ${instance.config.modelsPath ?? "(Pi default)"}`,);
    console.log(
      `  Provider/model:    ${instance.config.modelProvider ?? "(Pi default)"} / ${instance.config.modelId ?? "(Pi default)"}`,
    );
    console.log(
      `  Model selection:   ${explicitModelSelection ? "explicit" : "Pi default or incomplete"}`,
    );
    console.log(
      `  Behavior runtime:  ${readAppSettings(instance.config.dataDir).runtimeMode ?? "alt-theory"}`,
    );
    console.log(
      `  Resources:         ${instance.config.resourceDiscovery}${instance.config.skillsDir ? ` (${instance.config.skillsDir})` : ""}`,
    );
    console.log(`  Run label:         ${instance.config.runLabel ?? "(none)"}`);
    console.log(`  Test batch:        ${instance.config.testBatch ?? "(none)"}`,);
    if (
      (process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_BASE_URL) &&
      !explicitModelSelection
    ) {
      console.warn(
        "  Warning: ANTHROPIC_* env vars are set, but ALT_THEORY_MODEL_PROVIDER, ALT_THEORY_MODEL_ID, or ALT_THEORY_MODELS_PATH is missing. Alt Theory may launch with Pi defaults instead of the intended provider/model.",
      );
    }
  });
}
