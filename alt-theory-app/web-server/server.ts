/**
 * Alt Theory Web Server
 *
 * Express + WebSocket backend. Static discovery uses REST; live session state
 * is owned by SessionService and WebSocket connections attach as clients.
 */

import "dotenv/config";
import express, { type Response } from "express";
import multer from "multer";
import { existsSync } from "fs";
import { createServer } from "http";
import { resolve } from "path";
import { fileURLToPath } from "url";
import WebSocket, { WebSocketServer } from "ws";
import type { ThinkingLevel } from "@earendil-works/pi-agent-core";
import {
  type PromptMode,
  type ResourceDiscoveryMode,
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
} from "./asset-registry.js";
import type {
  ClientMessage,
  ServerMessage,
} from "./websocket-protocol.js";
import {
  getSessionRootForRequest,
  listSessionTextFiles,
  listSessionSummaries,
  readSessionTextFile,
  readSessionDetail,
  readSessionChanges,
  type SessionSummary,
  softDeleteSession,
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
  type SessionSelectors,
  type SessionServiceEvent,
} from "./session-service.js";
import { getProject, listProjects, upsertProject } from "./projects.js";
import { listInstructionAssets } from "./instruction-assets.js";
import { listAltTheorySkills } from "./skill-assets.js";
import {
  agentConfigDir,
  ConfigValidationError,
  deleteProvider,
  fetchProviderModels,
  fetchProviderModelsFromDraft,
  getRuntimeModelConfig,
  getConfigStatus,
  listProviders,
  setActive,
  upsertProvider,
  type ApiType,
  type RuntimeModelConfig,
} from "./config-store.js";
import {
  AuthSessionManager,
  anonymousAuthContext,
  clearAuthCookie,
  setAuthCookie,
} from "./auth-session.js";
import { readAccountStore } from "./auth-accounts.js";
import type { AuthContext } from "./auth-session.js";
import { resolveConfigGuiHtmlPath } from "./config-gui-path.js";
import { ensureLocalModeDefaults } from "./local-mode-paths.js";
import { getAgentDir } from "@earendil-works/pi-coding-agent";
import {
  IMPORT_HARNESSES,
  ImportHarnessNotImplementedError,
  discoverImportSessions,
  isImportHarness,
  preflightCodexImport,
  preflightOpenCodeImport,
  registerCodexImport,
  registerOpenCodeImport,
  registerPiImport,
} from "./session-import.js";
import { OpenCodeImportRefusalError } from "./opencode-session-import.js";
import { CodexImportRefusalError } from "./codex-session-import.js";
import {
  readAppSettings,
  resolveExternalSkillPaths,
  writeAppSettings,
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
  process.env.ALT_THEORY_PUBLIC_DIR ?? "alt-theory-app/web-server/public"
);

const DEFAULT_ROLE_CONDITION_PRESETS: Record<string, string> = {
  "conceptual-theory": "role-conceptual-theory-companion",
  "metatheory-oriented": "role-metatheory-oriented",
};
const DEFAULT_ROLE_PRESET_SLUG = "role-conceptual-theory-companion";
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
  readOnly?: boolean;
  modelProvider?: string;
  modelId?: string;
  modelsPath?: string;
  runtimeApiKey?: string;
  thinkingLevel?: ThinkingLevel;
  promptMode?: PromptMode;
  resourceDiscovery?: ResourceDiscoveryMode;
  runLabel?: string | null;
  testBatch?: string | null;
}

function parseResourceDiscoveryMode(
  value: string | undefined
): ResourceDiscoveryMode {
  if (value === "clean" || value === "internal" || value === "dev-debug") {
    return value;
  }
  if (value) {
    console.warn(
      `Unknown ALT_THEORY_RESOURCE_DISCOVERY '${value}', using internal`
    );
  }
  // internal = Alt bundled skills plus explicitly user-enabled externals.
  // dev-debug (ambient Pi merge + context files) is an explicit dev knob:
  // external skills must never be silently enabled in Pure (spec §3.4).
  return "internal";
}

function parsePromptMode(value: string | undefined): PromptMode {
  if (value === "pi-default" || value === "alt-only") {
    return value;
  }
  if (value) {
    console.warn(`Unknown ALT_THEORY_PROMPT_MODE '${value}', using alt-only`);
  }
  return "alt-only";
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
  const soulDir = assetPaths.soulDir;
  const legacySoulPath = assetPaths.soulPath;
  const publicDir = resolve(options.publicDir ?? PUBLIC_DIR);
  const readOnly = options.readOnly ?? false;
  const modelProvider =
    options.modelProvider ?? process.env.ALT_THEORY_MODEL_PROVIDER;
  const modelId = options.modelId ?? process.env.ALT_THEORY_MODEL_ID;
  const modelsPath = assetPaths.modelsPath;
  const promptMode = parsePromptMode(
    options.promptMode ?? process.env.ALT_THEORY_PROMPT_MODE
  );
  const resourceDiscovery = parseResourceDiscoveryMode(
    options.resourceDiscovery ?? process.env.ALT_THEORY_RESOURCE_DISCOVERY
  );
  const skillsDir =
    options.skillsDir ??
    process.env.ALT_THEORY_SKILLS_DIR ??
    (resourceDiscovery === "clean"
      ? undefined
      : assetPaths.skillsDir ?? resolve(assetPaths.rootDir, "skills"));
  const instructionsDir =
    options.instructionsDir ??
    assetPaths.instructionsDir ??
    resolve(assetPaths.rootDir, "instructions");
  const runLabel =
    options.runLabel ?? process.env.ALT_THEORY_RUN_LABEL ?? null;
  const testBatch =
    options.testBatch ?? process.env.ALT_THEORY_TEST_BATCH ?? null;
  const appMode = process.env.ALT_THEORY_MODE === "local" ? "local" : "hosted";
  const localMode = appMode === "local";

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
    })
  );
  app.get("/vendor/marked.js", (_req, res) => {
    res.sendFile(resolve(PROJECT_ROOT, "node_modules", "marked", "lib", "marked.umd.js"));
  });
  // --- Config GUI (Pi-native model/key management) ---
  // Local-mode only. Hosted/online deployments must not expose server-side
  // model/key management through this UI or REST surface.
  app.get("/config", (_req, res) => {
    if (!requireLocalConfigMode(res)) return;
    res.sendFile(resolveConfigGuiHtmlPath(publicDir));
  });
  app.get("/api/config/status", (_req, res) => {
    if (!requireLocalConfigMode(res)) return;
    res.json(getConfigStatus(agentConfigDir()));
  });
  // --- Resource discovery + per-mode skill enablement (spec §6.1) ---
  app.get("/api/resources", (_req, res) => {
    if (!requireLocalConfigMode(res)) return;
    const settings = readAppSettings(dataDir);
    const discovered = discoverSkillResources({
      altSkillsDir: skillsDir,
      agentDir: getAgentDir(),
    });
    const externalPaths = discovered.skills
      .filter((skill) => skill.source !== "alt-theory")
      .map((skill) => skill.path);
    const enabled = resolveExternalSkillPaths(settings, externalPaths);
    const enabledPure = new Set(enabled.pure);
    const enabledFull = new Set(enabled.full);
    res.json({
      skills: discovered.skills.map((skill) => ({
        ...skill,
        enabled:
          skill.source === "alt-theory"
            ? { pure: true, full: true }
            : {
                pure: enabledPure.has(skill.path),
                full: enabledFull.has(skill.path),
              },
      })),
      diagnostics: discovered.diagnostics,
      note: "Settings apply to new and reopened sessions, not running ones.",
    });
  });
  app.put("/api/resources/skills", (req, res) => {
    if (!requireLocalConfigMode(res)) return;
    const body = req.body as {
      pure?: { enabledPaths?: unknown };
      full?: { enabledPaths?: unknown };
    };
    const parseList = (value: unknown): string[] | null =>
      Array.isArray(value)
        ? value.filter((entry): entry is string => typeof entry === "string")
        : null;
    const current = readAppSettings(dataDir);
    const next = {
      ...current,
      skills: {
        pure: { enabledPaths: parseList(body.pure?.enabledPaths) },
        full: { enabledPaths: parseList(body.full?.enabledPaths) },
      },
    };
    writeAppSettings(dataDir, next);
    res.json({ ok: true, settings: next });
  });
  app.get("/api/config/providers", (_req, res) => {
    if (!requireLocalConfigMode(res)) return;
    res.json({ providers: listProviders(agentConfigDir()) });
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
  app.post("/api/config/providers/:provider/fetch-models", async (req, res) => {
    if (!requireLocalConfigMode(res)) return;
    try {
      res.json({
        models: await fetchProviderModels(agentConfigDir(), req.params.provider),
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      res.status(error instanceof ConfigValidationError ? 400 : 500).json({
        error: message,
      });
    }
  });
  app.put("/api/config/providers/:provider", (req, res) => {
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
      const view = upsertProvider(
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
        }
      );
      res.json(view);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      res.status(error instanceof ConfigValidationError ? 400 : 500).json({
        error: message,
      });
    }
  });
  app.delete("/api/config/providers/:provider", (req, res) => {
    if (!requireLocalConfigMode(res)) return;
    try {
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
      res.json(getConfigStatus(agentConfigDir()));
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
        index
    );
    res.json({ domains: selectableDomains });
  });
  app.get("/api/instruction-assets", (_req, res) => {
    res.json({ instructions: listInstructionAssets(instructionsDir) });
  });
  app.get("/api/skills", (_req, res) => {
    res.json({
      skills:
        resourceDiscovery === "clean" || !skillsDir
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
  app.get("/api/auth/me", (req, res) => {
    const auth = authSessions.resolveRequest(req);
    // Study designation (M7 §3): hosted = the account role; local = the
    // install-level flag. Non-designated users get zero study surfaces.
    const participant = hasConfiguredAccounts()
      ? auth.role === "participant"
        ? { designated: true, label: null }
        : null
      : (readAppSettings(dataDir).participant ?? null);
    res.json({
      auth,
      app: { mode: appMode },
      participant,
      localConfig: localMode ? getConfigStatus(agentConfigDir()) : null,
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
        status: ["pi", "opencode", "codex"].includes(harness) ? "ready" : "not_implemented",
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
    const mode = body.mode ?? "pure";
    const changedSourcePolicy = body.changedSourcePolicy ?? "skip";
    if (selection !== "all" && selection !== "selected") {
      res.status(400).json({ error: "selection must be 'all' or 'selected'" });
      return;
    }
    if (mode !== "pure" && mode !== "full") {
      res.status(400).json({ error: "mode must be 'pure' or 'full'" });
      return;
    }
    if (changedSourcePolicy !== "skip" && changedSourcePolicy !== "copy") {
      res.status(400).json({
        error: "changedSourcePolicy must be 'skip' or 'copy' in this backend slice",
      });
      return;
    }
    const sourceIds = Array.isArray(body.sourceIds)
      ? body.sourceIds.filter((value): value is string => typeof value === "string")
      : [];
    if (selection === "selected" && sourceIds.length === 0) {
      res.status(400).json({ error: "sourceIds are required for selected import" });
      return;
    }
    const workspaceOverrides =
      body.workspaceOverrides && typeof body.workspaceOverrides === "object"
        ? (body.workspaceOverrides as Record<string, unknown>)
        : {};
    const visibility = body.visibility === "research" ? "research" : "private";
    const preflightOnly = body.preflightOnly === true;
    if (preflightOnly && harness !== "opencode" && harness !== "codex") {
      res.status(400).json({ error: "preflightOnly is currently supported only for OpenCode and Codex" });
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
              (sourceId) => !selected.some((source) => source.sourceId === sourceId)
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
      const results = selected.map((source) => {
        if (source.repeat === "unchanged") {
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
          if (harness === "opencode" || harness === "codex") {
            const preflight = harness === "opencode"
              ? preflightOpenCodeImport(source)
              : preflightCodexImport(source);
            if (preflightOnly) {
              return {
                sourceId: source.sourceId,
                status: "ready" as const,
                sessionId: null,
                transformations: preflight.transformations,
              };
            }
            const common = { dataDir, source, mode, workspacePrimaryDir, ...metadata };
            const registered = harness === "opencode"
              ? registerOpenCodeImport({ ...common, preflight })
              : registerCodexImport({ ...common, preflight });
            return {
              sourceId: source.sourceId,
              status: preflight.transformations.length
                ? ("imported_with_transformations" as const)
                : ("imported" as const),
              sessionId: registered.sessionId,
              transformations: preflight.transformations,
            };
          }
          const registered = registerPiImport({ dataDir, source, mode, workspacePrimaryDir, ...metadata });
          return {
            sourceId: source.sourceId,
            status: "imported" as const,
            sessionId: registered.sessionId,
          };
        } catch (error) {
          if (
            error instanceof OpenCodeImportRefusalError ||
            error instanceof CodexImportRefusalError
          ) {
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
  app.get("/api/projects", (_req, res) => {
    res.json(listProjects(dataDir));
  });
  app.put("/api/projects/:projectId", (req, res) => {
    try {
      res.json(upsertProject(dataDir, req.params.projectId, req.body ?? {}));
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      res.status(/Invalid|required/.test(message) ? 400 : 500).json({
        error: message,
      });
    }
  });
  app.get("/api/sessions", (req, res) => {
    const auth = resolveSessionRestAuth(req, res);
    if (!auth) return;
    const list = listSessionSummaries(dataDir);
    res.json({
      ...list,
      sessions: list.sessions.filter((session) =>
        canAccessSessionSummary(auth, session)
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
  app.delete("/api/sessions/:sessionId", (req, res) => {
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
      res.json({ deleted: softDeleteSession(dataDir, sessionId) });
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
        input
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
          (record) => record.comparisonId === req.params.comparisonId
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
    }
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
          arms
        );
        res.json({ record });
      } catch (error) {
        res.status(400).json({
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
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
          auth.accountId
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
          file.buffer
        );
        res.json(result);
      } catch (error) {
        sendFileApiError(res, error);
      }
    }
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
        body.path
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
      res.json(readSessionTextFile(dataDir, sessionId, rootName, requestedPath));
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
          body.content
        )
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
        requestedPath
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
      (asset) => asset.ref === DEFAULT_INSTRUCTION_REF
    )
      ? DEFAULT_INSTRUCTION_REF
      : null;
  }

  function optionalSlug(value: string | null | undefined): string | null {
    return value && value.trim() ? value : null;
  }

  function resolveSessionRestAuth(
    req: express.Request,
    res: Response
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
    session: SessionSummary
  ): boolean {
    if (localMode) return true;
    if (auth.role === "participant") {
      return Boolean(auth.accountId) && session.ownerAccountId === auth.accountId;
    }
    return true;
  }

  function canAccessSessionContent(
    auth: AuthContext,
    session: SessionSummary
  ): boolean {
    if (localMode) return true;
    if (session.visibility === "private") {
      return Boolean(auth.accountId) && session.ownerAccountId === auth.accountId;
    }
    if (auth.role === "participant") {
      return Boolean(auth.accountId) && session.ownerAccountId === auth.accountId;
    }
    return true;
  }

  function requireSessionRestContentAccess(
    req: express.Request,
    res: Response,
    sessionId: string
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
    readOnly,
    modelProvider,
    modelId,
    modelsPath: modelsPath ?? undefined,
    runtimeApiKey:
      options.runtimeApiKey ?? process.env.ALT_THEORY_MODEL_API_KEY,
    thinkingLevel: options.thinkingLevel,
    promptMode,
    resourceDiscovery,
    skillsDir,
    instructionsDir,
    runLabel,
    testBatch,
    resolveRuntimeModelConfig: localMode
      ? () => requireLocalRuntimeModelConfig()
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
              .map((skill) => skill.path)
          );
        }
      : undefined,
    modelFallbackConfigPath:
      process.env.ALT_THEORY_MODEL_FALLBACK_PATH ?? null,
  });

  function requireLocalRuntimeModelConfig(): RuntimeModelConfig {
    const runtimeConfig = getRuntimeModelConfig(agentConfigDir());
    if (!runtimeConfig.modelProvider || !runtimeConfig.modelId) {
      throw new ConfigValidationError(
        "No usable local model is active. Open Model setup, save a provider key, choose a model, and set it active."
      );
    }
    return runtimeConfig;
  }

  function parseAbComparisonBody(
    sessionId: string,
    body: unknown
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

  function parseAbSource(value: unknown): NonNullable<AbComparisonInput["source"]> {
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
    value: unknown
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
    event: SessionServiceEvent
  ): void {
    switch (event.type) {
      case "snapshot":
        send({ type: "session_updated", payload: event.payload });
        break;
      case "assistant_delta":
        send({ type: "assistant_delta", payload: event.payload });
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
    code?: string
  ): void {
    send({
      type: "error",
      payload: {
        error: error instanceof Error ? error.message : String(error),
        ...(code ? { code } : {}),
      },
    });
  }

  function sendServiceError(send: (msg: ServerMessage) => void, error: unknown) {
    if (error instanceof SessionBusyError) {
      sendError(send, error, error.code);
      return;
    }
    sendError(send, error);
  }

  function createDraftSelectors(): SessionSelectors {
    return {
      projectId: null,
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
        `Role condition '${conditionId}' maps to missing role preset: ${rolePresetSlug}`
      );
    }
    return rolePresetSlug;
  }

  function sessionCreationMetadataForAuth(
    auth: AuthContext,
    visibility: "research" | "private"
  ) {
    if (auth.role !== "participant" || !auth.accountId) {
      return {
        visibility,
        consentSnapshot:
          visibility === "private"
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
        researcherReadable:
          visibility === "private"
            ? false
            : Boolean(auth.defaultConsent?.researcherReadable),
        quoteAfterAnonymization:
          visibility === "private"
            ? false
            : Boolean(auth.defaultConsent?.quoteAfterAnonymization),
        privateOverride: visibility === "private",
      },
    };
  }

  function canMaterializeSession(auth: AuthContext): boolean {
    return auth.role !== "anonymous" || !hasConfiguredAccounts();
  }

  /**
   * Sharing default follows study designation (M7 §4). Hosted deployments
   * keep the pre-existing default (participants consented); a local install
   * defaults to private unless the install is designated at handout.
   */
  function defaultDraftVisibility(): "research" | "private" {
    if (hasConfiguredAccounts()) return "research";
    return readAppSettings(dataDir).participant?.designated
      ? "research"
      : "private";
  }

  function sendDraft(
    send: (msg: ServerMessage) => void,
    selectors: SessionSelectors,
    visibility: "research" | "private"
  ): void {
    send({
      type: "session_draft",
      payload: {
        status: "draft",
        projectId: selectors.projectId ?? null,
        visibility,
        currentDomain: selectors.kbDomain,
        rolePresetSlug: selectors.rolePresetSlug,
        soulSlug: selectors.soulSlug,
        customInstructionRef: selectors.customInstructionRef ?? null,
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
    let draftVisibility: "research" | "private" = defaultDraftVisibility();
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

    const attachToSession = (sessionId: string) => {
      detach();
      attachedSessionId = sessionId;
      detach = sessionService.attach(sessionId, (event) => {
        forwardServiceEvent(send, event);
      });
      send({ type: "session_opened", payload: sessionService.getSnapshot(sessionId) });
      send({ type: "session_metadata", payload: sessionService.getManifest(sessionId) });
      send({ type: "session_metrics", payload: sessionService.getMetrics(sessionId) });
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
    sendDraft(send, draftSelectors, draftVisibility);

    ws.on("message", async (data) => {
      let msg: ClientMessage;
      try {
        msg = JSON.parse(data.toString()) as ClientMessage;
      } catch {
        send({ type: "error", payload: { error: "Invalid JSON" } });
        return;
      }

      switch (msg.type) {
        case "prompt": {
          try {
            if (!attachedSessionId) {
              if (!canMaterializeSession(auth)) {
                sendError(
                  send,
                  new Error("Authentication required"),
                  "auth_required"
                );
                break;
              }
              const initial = await sessionService.createSession(
                draftSelectors,
                sessionCreationMetadataForAuth(auth, draftVisibility)
              );
              if (closed) return;
              attachToSession(initial.sessionId);
            }
            const currentSessionId = attachedSessionId;
            const run = sessionService.runPrompt(currentSessionId, msg.payload);
            await run.completion;
          } catch (error) {
            if (error instanceof SessionBusyError) {
              sendError(send, error, error.code);
            } else {
              send({
                type: "run_failed",
                payload: {
                  error: error instanceof Error ? error.message : String(error),
                },
              });
            }
          }
          break;
        }
        case "abort":
          if (!attachedSessionId) {
            sendDraft(send, draftSelectors, draftVisibility);
            break;
          }
          try {
            await sessionService.abort(attachedSessionId);
          } catch (error) {
            sendError(send, error);
          }
          break;
        case "switch_kb":
          if (!attachedSessionId) {
            if (
              msg.payload.domain !== KB_DISABLED_DOMAIN &&
              !isKnownKbDomain(kbDir, msg.payload.domain)
            ) {
              sendError(send, new Error(`Unknown KB domain: ${msg.payload.domain}`));
              break;
            }
            draftSelectors = { ...draftSelectors, kbDomain: msg.payload.domain };
            sendDraft(send, draftSelectors, draftVisibility);
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
            sendDraft(send, draftSelectors, draftVisibility);
            break;
          }
          const selectors = sessionService.getSelectors(attachedSessionId);
          try {
            const replacement = await sessionService.replaceSession(
              attachedSessionId,
              { ...selectors, rolePresetSlug },
              "role_preset_switch"
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
            sendDraft(send, draftSelectors, draftVisibility);
            break;
          }
          const selectors = sessionService.getSelectors(attachedSessionId);
          try {
            const replacement = await sessionService.replaceSession(
              attachedSessionId,
              { ...selectors, soulSlug },
              "soul_switch"
            );
            if (!closed) attachToSession(replacement.sessionId);
          } catch (error) {
            sendServiceError(send, error);
          }
          break;
        }
        case "switch_instruction": {
          const customInstructionRef = optionalSlug(
            msg.payload.customInstructionRef
          );
          if (!attachedSessionId) {
            draftSelectors = { ...draftSelectors, customInstructionRef };
            sendDraft(send, draftSelectors, draftVisibility);
            break;
          }
          const selectors = sessionService.getSelectors(attachedSessionId);
          try {
            const replacement = await sessionService.replaceSession(
              attachedSessionId,
              { ...selectors, customInstructionRef },
              "instruction_switch"
            );
            if (!closed) attachToSession(replacement.sessionId);
          } catch (error) {
            sendServiceError(send, error);
          }
          break;
        }
        case "switch_project": {
          const projectId = optionalSlug(msg.payload.projectId);
          const project = projectId ? getProject(dataDir, projectId) : null;
          if (projectId && !project) {
            sendError(send, new Error(`Unknown project: ${projectId}`));
            break;
          }
          if (!attachedSessionId) {
            draftSelectors = {
              ...draftSelectors,
              projectId,
              ...(project?.defaults.rolePresetSlug !== undefined
                ? { rolePresetSlug: project.defaults.rolePresetSlug }
                : {}),
              ...(project?.defaults.soulSlug !== undefined
                ? { soulSlug: project.defaults.soulSlug }
                : {}),
              ...(project?.defaults.kbDomain
                ? { kbDomain: project.defaults.kbDomain }
                : {}),
              ...(project?.defaults.customInstructionRef !== undefined
                ? {
                    customInstructionRef:
                      project.defaults.customInstructionRef,
                  }
                : {}),
            };
            sendDraft(send, draftSelectors, draftVisibility);
            break;
          }
          try {
            sessionService.setProjectId(attachedSessionId, projectId);
          } catch (error) {
            sendServiceError(send, error);
          }
          break;
        }
        case "switch_visibility": {
          if (
            msg.payload.visibility !== "research" &&
            msg.payload.visibility !== "private"
          ) {
            sendError(send, new Error("Invalid visibility"));
            break;
          }
          if (attachedSessionId) {
            try {
              const metadata = sessionCreationMetadataForAuth(
                auth,
                msg.payload.visibility
              );
              send({
                type: "session_updated",
                payload: sessionService.setVisibility(
                  attachedSessionId,
                  msg.payload.visibility,
                  metadata.consentSnapshot
                ),
              });
            } catch (error) {
              sendServiceError(send, error);
            }
            break;
          }
          draftVisibility = msg.payload.visibility;
          sendDraft(send, draftSelectors, draftVisibility);
          break;
        }
        case "set_study_tag": {
          if (!attachedSessionId) {
            sendError(send, new Error("A materialized session is required"));
            break;
          }
          try {
            send({
              type: "session_updated",
              payload: sessionService.setStudyTag(
                attachedSessionId,
                msg.payload.studyTag ?? null
              ),
            });
          } catch (error) {
            sendServiceError(send, error);
          }
          break;
        }
        case "set_session_model": {
          if (!attachedSessionId) {
            sendError(send, new Error("A materialized session is required"));
            break;
          }
          try {
            send({
              type: "session_updated",
              payload: await sessionService.setSessionModel(
                attachedSessionId,
                msg.payload.override ?? null
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
                  "auth_required"
                );
                break;
              }
              const initial = await sessionService.createSession(
                draftSelectors,
                sessionCreationMetadataForAuth(auth, draftVisibility)
              );
              if (closed) return;
              attachToSession(initial.sessionId);
            }
            const run = sessionService.invokeSkill(
              attachedSessionId,
              msg.payload.skillName,
              msg.payload.userText
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
            const run = sessionService.reviseLatest(
              attachedSessionId,
              msg.payload.text
            );
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
          if (!attachedSessionId) {
            sendError(send, new Error("A materialized session is required"));
            break;
          }
          if (msg.payload.mode !== "pure" && msg.payload.mode !== "full") {
            sendError(send, new Error("Unknown mode"));
            break;
          }
          try {
            const snapshot = await sessionService.switchMode(
              attachedSessionId,
              msg.payload.mode
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
          // Workspace directories are a Full/local-app concept (spec §5.1):
          // machine-local paths only make sense in the local form.
          if (!localMode) {
            sendError(
              send,
              new Error("Workspace directories are not enabled on this server")
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
              msg.payload.dir
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
          if (!attachedSessionId) {
            sendError(send, new Error("A materialized session is required"));
            break;
          }
          try {
            const forked = await sessionService.forkSession(
              attachedSessionId,
              msg.payload.purpose,
              msg.payload.forkPointEntryId
            );
            if (!closed) {
              attachToSession(forked.sessionId);
              send({
                type: "session_transcript",
                payload: {
                  messages: sessionService.getTranscript(forked.sessionId),
                },
              });
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
              msg.payload.forkPointEntryId
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
          sendDraft(send, draftSelectors, draftVisibility);
          break;
        }
        case "open_session": {
          const selectors = attachedSessionId
            ? sessionService.getSelectors(attachedSessionId)
            : draftSelectors;
          try {
            const opened = await sessionService.openSession(
              msg.payload.sessionId,
              selectors
            );
            if (closed) return;
            attachToSession(opened.sessionId);
            send({
              type: "session_transcript",
              payload: { messages: sessionService.getTranscript(opened.sessionId) },
            });
          } catch (error) {
            sendError(send, error);
          }
          break;
        }
        case "get_session_metadata":
          if (!attachedSessionId) {
            sendDraft(send, draftSelectors, draftVisibility);
            break;
          }
          send({
            type: "session_metadata",
            payload: sessionService.getManifest(attachedSessionId),
          });
          break;
        case "get_session_metrics":
          if (!attachedSessionId) {
            sendDraft(send, draftSelectors, draftVisibility);
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
      readOnly,
      modelProvider,
      modelId,
      modelsPath,
      promptMode,
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
        instance.config.modelsPath
    );
    console.log(`Alt Theory server running on http://${host}:${port}`);
    console.log(`  Data dir:          ${instance.config.dataDir}`);
    console.log(`  Agent assets:      ${assetPaths.rootDir}`);
    console.log(
      `  App context:       ${assetPaths.appContextPath} (${existsSync(assetPaths.appContextPath) ? "found" : "missing"})`
    );
    console.log(
      `  Soul dir:          ${assetPaths.soulDir} (${existsSync(assetPaths.soulDir) ? "found" : "missing"})`
    );
    console.log(
      `  Default soul:      ${assetPaths.soulPath ?? "(none)"} (${assetPaths.soulPath && existsSync(assetPaths.soulPath) ? "found" : "not loaded"})`
    );
    console.log(
      `  Role presets:      ${assetPaths.rolePresetsDir} (${existsSync(assetPaths.rolePresetsDir) ? "found" : "missing"})`
    );
    console.log(
      `  KB root:           ${instance.config.kbDir} (${existsSync(instance.config.kbDir) ? "found" : "missing"})`
    );
    console.log(
      `  Pi prompts:        ${assetPaths.piPromptTemplatesDir} (${existsSync(assetPaths.piPromptTemplatesDir) ? "found" : "missing"})`
    );
    console.log(`  Models path:       ${instance.config.modelsPath ?? "(Pi default)"}`);
    console.log(
      `  Provider/model:    ${instance.config.modelProvider ?? "(Pi default)"} / ${instance.config.modelId ?? "(Pi default)"}`
    );
    console.log(
      `  Model selection:   ${explicitModelSelection ? "explicit" : "Pi default or incomplete"}`
    );
    console.log(`  Prompt mode:       ${instance.config.promptMode}`);
    console.log(
      `  Resources:         ${instance.config.resourceDiscovery}${instance.config.skillsDir ? ` (${instance.config.skillsDir})` : ""}`
    );
    console.log(`  Run label:         ${instance.config.runLabel ?? "(none)"}`);
    console.log(`  Test batch:        ${instance.config.testBatch ?? "(none)"}`);
    if (
      (process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_BASE_URL) &&
      !explicitModelSelection
    ) {
      console.warn(
        "  Warning: ANTHROPIC_* env vars are set, but ALT_THEORY_MODEL_PROVIDER, ALT_THEORY_MODEL_ID, or ALT_THEORY_MODELS_PATH is missing. Alt Theory may launch with Pi defaults instead of the intended provider/model."
      );
    }
  });
}
