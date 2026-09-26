/**
 * Alt Theory Web Server
 *
 * Express + WebSocket backend. Static discovery uses REST; live session state
 * is owned by SessionService and WebSocket connections attach as clients.
 */

import "dotenv/config";
import express, { type Response } from "express";
import multer from "multer";
import { randomUUID } from "crypto";
import { copyFileSync, existsSync, mkdirSync, statSync } from "fs";
import { createServer } from "http";
import { homedir } from "os";
import { basename, join, resolve } from "path";
import { fileURLToPath } from "url";
import WebSocket, { WebSocketServer } from "ws";
import type { ThinkingLevel } from "@earendil-works/pi-agent-core";
import {
  toAltMode,
  type AltMode,
  type ResourceDiscoveryMode,
  type RuntimeMode,
  KB_DISABLED_DOMAIN,
} from "../core/alt-theory-core.js";
import { resolveDataDir } from "../core/data-dir.js";
import { samePath } from "../core/path-verdict.js";
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
import {
  toServerMessage,
  type ClientMessage,
  type NewConversationSettings,
  type ServerMessage,
} from "./websocket-protocol.js";
import {
  getSessionRootForRequest,
  familyMemberIds,
  listDeletedSessionSummaries,
  listSessionTextFiles,
  listSessionSummaries,
  permanentlyDeleteSession,
  restoreDeletedSession,
  readSessionTextFile,
  healFamilyInvariants,
  readSessionAccessSummary,
  readSessionDetail,
  readVisibleTranscript,
  visibleTranscriptMatches,
  readSessionDetailWithParts,
  readSessionChanges,
  type SessionSummary,
  sessionsAttachedToDeletion,
  softDeleteSession,
  softDeleteSessionFamily,
  sweepExpiredDeletedSessions,
  readToolResultText,
  writeSessionTextFile,
} from "./session-store.js";
import {
  deleteWorkspaceFile,
  isWorkspaceDownloadAllowed,
  listWorkspaceFiles,
  missingAttachmentPaths,
  retryWorkspaceExtraction,
  uploadWorkspaceFile,
  writeWorkingFolderTextFile,
} from "./workspace-files.js";
import { FileConflictError, type WriteTextFileOptions } from "./text-file-policy.js";
import {
  appendAbComparisonRecord,
  currentAbComparisonRecords,
  type AbComparisonCandidate,
  type AbComparisonInput,
  type AbComparisonScore,
} from "./ab-records.js";
import {
  SessionService,
  type SessionModelOverride,
  type SessionSelectors,
  type SessionServiceEvent,
  type StudyTag,
} from "./session-service.js";
import { resolveThinkingLevel, type ResolvedThinking } from "./thinking-level.js";
import { describeFailure } from "../core/failure.js";
import { listInstructionAssets } from "./instruction-assets.js";
import { sweepIdleRuntimes } from "./runtime-retention.js";
import {
  agentConfigDir,
  ConfigValidationError,
  testProviderConnectionFromDraft,
  deleteProvider,
  fetchProviderModels,
  fetchProviderModelsFromDraftResult,
  getRuntimeModelConfig,
  getVerifiedConfigStatus,
  thinkingLevelsForModel,
  listProviders,
  setActive,
  upsertProvider,
  type ApiType,
  type RuntimeModelConfig,
} from "./config-store.js";
import { refreshModelsDevMetadata, setModelsDevSnapshotPath } from "./models-dev-metadata.js";
import { localAccess } from "./access-policy.js";
import { ensureLocalModeDefaults } from "./local-mode-paths.js";
import {
  isSessionVisibility,
  withholdsFromResearch,
  type SessionVisibility,
} from "./session-records.js";
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
  getImportAdapter,
  isImportHarness,
} from "./session-import.js";
import { ImportRefusalError } from "./session-import-shared.js";
import {
  knownWorkspacesOf,
  readAppSettings,
  resolveExternalSkillPaths,
  defaultSessionPermission,
  normalizeCommandAllowlist,
  normalizeModelChain,
  PERMISSIONS,
  type Permission,
  writeAppSettings,
  SKILL_PRECEDENCE_VALUES,
  type AppSettings,
  type ProjectFolderSettings,
  type SkillPrecedence,
} from "./app-settings.js";
import { discoverSkillResources } from "./resource-discovery.js";
import { adoptStagedAttachments, stageAttachment } from "./attachment-staging.js";
import { reviewerRecommendations } from "./reviewer-recommendations.js";
import {
  readSubagentConfig,
  subagentConfigPath,
  subagentModelCandidates,
  THINKING_LEVELS,
  writeSubagentConfig,
} from "./subagent-config.js";
import {
  describeWorkingFolders,
  listWorkingFolderChildren,
  searchWorkingFolder,
  readWorkingFolderTextFile,
} from "./workspace-files.js";

ensureLocalModeDefaults();

const RESOURCE_ROOT = resolve(
  process.env.ALT_THEORY_RESOURCE_ROOT ?? process.cwd(),
);
const PUBLIC_DIR = resolve(
  process.env.ALT_THEORY_PUBLIC_DIR ??
    resolve(RESOURCE_ROOT, "alt-theory-app/web-server/public-v6"),
);

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
  // external skills are only ever enabled explicitly.
  return "internal";
}

export function createAltTheoryServer(options: AltTheoryServerOptions = {}) {
  const dataDir = resolve(options.dataDir ?? resolveDataDir());
  const assetPaths: AgentAssetPaths = resolveAgentAssetPaths(RESOURCE_ROOT, {
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
  // models.dev baseline for a first launch or no network (perf plan WP 1.6).
  setModelsDevSnapshotPath(join(assetPaths.rootDir, "model-presets", "models-dev-snapshot.json.gz"));
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
  // One owner on one machine sees everything (access-policy.ts). The hosted
  // study deployment's accounts, private content and retention were removed
  // on 2026-09-26; a multi-user deployment adapts at the policy.
  const access = localAccess;

  const discoverConfiguredSkills = () => {
    const discovered = discoverSkillResources({
      altSkillsDir: skillsDir,
      agentDir: getAgentDir(),
    });
    const externalPaths = discovered.skills
      .filter((skill) => skill.source !== "alt-theory")
      .map((skill) => skill.path);
    const enabled = new Set(
      resolveExternalSkillPaths(readAppSettings(dataDir), externalPaths),
    );
    return {
      ...discovered,
      skills: discovered.skills.map((skill) => ({
        ...skill,
        enabled: skill.source === "alt-theory" || enabled.has(skill.path),
      })),
    };
  };

  const app = express();
  const httpServer = createServer(app);
  const wss = new WebSocketServer({ server: httpServer });
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
    // Browsers send UTF-8 file names; multer's latin1 default mangles 论文.pdf.
    defParamCharset: "utf8",
    limits: { fileSize: 20 * 1024 * 1024 },
  });

  // The file-content save route carries up to a 1 MiB edit (JSON-escaped),
  // so it parses under its own larger limit before the global 600kb parser
  // would refuse it (body-parser skips already-parsed bodies).
  app.use(
    "/api/sessions/:sessionId/files/content",
    express.json({ limit: "2mb" })
  );
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
  // These routes manage this machine's own model keys: a multi-user
  // deployment must never expose them.
  app.get("/config", (_req, res) => {
    res.sendFile(resolve(publicDir, "index.html"));
  });
  app.get("/api/config/status", async (_req, res) => {
    res.json(await getVerifiedConfigStatus(agentConfigDir()));
  });
  // --- Resource discovery + external skill enablement (spec §6.1) ---
  app.get("/api/resources", (_req, res) => {
    const discovered = discoverConfiguredSkills();
    res.json({
      skills: discovered.skills,
      diagnostics: discovered.diagnostics,
      note: "Settings apply to new and reopened sessions, not running ones.",
    });
  });
  app.put("/api/resources/skills", (req, res) => {
    const body = req.body as { enabledPaths?: unknown };
    const parseList = (value: unknown): string[] | null =>
      Array.isArray(value)
        ? value.filter((entry): entry is string => typeof entry === "string")
        : null;
    const current = readAppSettings(dataDir);
    const next = {
      ...current,
      skills: { work: { enabledPaths: parseList(body.enabledPaths) } },
    };
    writeAppSettings(dataDir, next);
    res.json({ ok: true, settings: next });
  });
  // Data folder location, for "reveal in file manager" (local mode; v1.2.1 #5).
  app.get("/api/local/data-folder", (_req, res) => {
    res.json({ dataDir });
  });

  // Docs location for the external-AI setup prompt (null when the install
  // ships no docs, and the prompt omits the line).
  app.get("/api/config/docs-root", (_req, res) => {
    const docsRoot = join(RESOURCE_ROOT, "docs");
    res.json({ docsRoot: existsSync(docsRoot) ? docsRoot : null });
  });

  // --- Auto-naming of conversations (v1.2.1) ---
  app.get("/api/settings/auto-title", (_req, res) => {
    const s = readAppSettings(dataDir).autoTitle;
    res.json({
      enabled: s?.enabled !== false,
      model: s?.model ?? null,
      fallbackModels: s?.fallbackModels ?? [],
    });
  });
  app.put("/api/settings/auto-title", (req, res) => {
    const body = req.body as { enabled?: unknown; model?: unknown; fallbackModels?: unknown };
    const raw = body.model as { provider?: unknown; modelId?: unknown; thinkingLevel?: unknown } | null;
    const model =
      raw && typeof raw.provider === "string" && typeof raw.modelId === "string"
        ? {
            provider: raw.provider,
            modelId: raw.modelId,
            ...(THINKING_LEVELS.includes(raw.thinkingLevel as (typeof THINKING_LEVELS)[number])
              ? { thinkingLevel: raw.thinkingLevel as (typeof THINKING_LEVELS)[number] }
              : {}),
          }
        : null;
    const fallbacks = normalizeModelChain({ model: "-", fallbackModels: body.fallbackModels ?? [] });
    if (!fallbacks) {
      res.status(400).json({ error: "Invalid fallback models" });
      return;
    }
    const current = readAppSettings(dataDir);
    const next = {
      ...current,
      autoTitle: {
        enabled: body.enabled !== false,
        model,
        ...(fallbacks.fallbackModels.length ? { fallbackModels: fallbacks.fallbackModels } : {}),
      },
    };
    writeAppSettings(dataDir, next);
    res.json({ ok: true, autoTitle: next.autoTitle });
  });
  app.get("/api/settings/reviewer-recommendations", async (_req, res) => {
    res.json(await reviewerRecommendations(join(assetPaths.rootDir, "model-presets")));
  });
  // Smart approval's reviewer (2026-09-26): null = auto.
  app.get("/api/settings/approval-reviewer", (_req, res) => {
    const settings = readAppSettings(dataDir);
    res.json({
      reviewer: settings.approvalReviewer ?? null,
      hintDismissed: settings.smartApprovalHintDismissed === true,
    });
  });
  app.put("/api/settings/approval-reviewer", (req, res) => {
    const body = req.body as { reviewer?: unknown; hintDismissed?: unknown };
    const settings = readAppSettings(dataDir);
    if ("reviewer" in body) {
      const reviewer = body.reviewer === null ? null : normalizeModelChain(body.reviewer);
      if (body.reviewer !== null && !reviewer) {
        res.status(400).json({ error: "Invalid reviewer model chain" });
        return;
      }
      if (reviewer) settings.approvalReviewer = reviewer;
      else delete settings.approvalReviewer;
    }
    if (body.hintDismissed === true) settings.smartApprovalHintDismissed = true;
    writeAppSettings(dataDir, settings);
    res.json({
      reviewer: settings.approvalReviewer ?? null,
      hintDismissed: settings.smartApprovalHintDismissed === true,
    });
  });
  // Separate from app/Pi settings so a broken optional agent preset file can
  // never prevent Alt Theory from opening with general/inherit.
  app.get("/api/settings/subagents", (_req, res) => {
    const loaded = readSubagentConfig(dataDir);
    res.json({
      ...loaded,
      candidates: subagentModelCandidates(loaded.config),
      path: subagentConfigPath(dataDir),
    });
  });
  app.put("/api/settings/subagents", (req, res) => {
    try {
      const config = writeSubagentConfig(dataDir, req.body);
      res.json({
        ok: true,
        config,
        candidates: subagentModelCandidates(config),
        path: subagentConfigPath(dataDir),
      });
    } catch (error) {
      res.status(400).json({
        error: error instanceof Error ? error.message : String(error),
      });
    }
  });
  // --- Bundled-vs-user skill precedence (v1.3.0-alpha.3) ---
  app.get("/api/settings/skill-precedence", (_req, res) => {
    res.json({
      precedence: readAppSettings(dataDir).skillPrecedence ?? "prefer-bundled",
    });
  });
  app.put("/api/settings/skill-precedence", (req, res) => {
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
    const settings = readAppSettings(dataDir);
    res.json({
      userRolePresetsDir,
      extraRolePresetDirs: settings.extraRolePresetDirs ?? [],
      extraKbDirs: settings.extraKbDirs ?? [],
    });
  });
  app.put("/api/settings/asset-dirs", (req, res) => {
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
  // Working folders page (v1.5.1): projects (id, name, main folder,
  // companions) and the global readable list with its Edit ticks. Applied
  // live through the session assembly's folder-policy reader. `available`
  // says whether a folder exists on disk right now — a project survives its
  // main folder going missing (snapshot / renamed-folder case); starting a
  // conversation in it is refused until the folder returns.
  const projectRows = (
    projects: ProjectFolderSettings[]
  ): Array<ProjectFolderSettings & { available: boolean }> =>
    projects.map((project) => ({
      ...project,
      available:
        statSync(project.primaryDir, { throwIfNoEntry: false })?.isDirectory() ??
        false,
    }));
  const workingFoldersResponse = (settings: AppSettings) => ({
    knownWorkspaces: knownWorkspacesOf(settings),
    ...(settings.workingFolders ?? { global: [], projects: [] }),
    projects: projectRows(settings.workingFolders?.projects ?? []),
  });
  app.get("/api/settings/working-folders", (_req, res) => {
    res.json(workingFoldersResponse(readAppSettings(dataDir)));
  });
  app.put("/api/settings/working-folders", (req, res) => {
    const body = req.body as {
      global?: unknown;
      projects?: Array<{
        id?: unknown;
        name?: unknown;
        primaryDir?: unknown;
        secondaryDirs?: unknown;
      }>;
    };
    const current = readAppSettings(dataDir);
    const existing = current.workingFolders ?? { global: [], projects: [] };
    const dir = (value: unknown): string | null =>
      typeof value === "string" && value.trim() && existsSync(resolve(value)) ? resolve(value) : null;
    const global = Array.isArray(body.global)
      ? (body.global as Array<{ path?: unknown; writable?: unknown }>)
          .map((entry) => ({ path: dir(entry?.path), writable: entry?.writable === true }))
          .filter((entry): entry is { path: string; writable: boolean } => entry.path !== null)
      : existing.global;
    const projects = Array.isArray(body.projects)
      ? body.projects
          .map((entry): ProjectFolderSettings | null => {
            if (
              typeof entry?.primaryDir !== "string" ||
              !entry.primaryDir.trim()
            ) {
              return null;
            }
            // Companions dedupe case-insensitively (samePath) against each
            // other and the main folder; the main folder itself is not
            // existence-checked: a project whose main folder went missing
            // stays listed so the user can re-point it.
            const primaryDir = resolve(entry.primaryDir);
            const secondaryDirs: string[] = [];
            for (const candidate of (Array.isArray(entry.secondaryDirs)
              ? entry.secondaryDirs
              : []
            )
              .map(dir)
              .filter((path): path is string => path !== null)) {
              if (
                !samePath(candidate, primaryDir) &&
                !secondaryDirs.some((kept) => samePath(kept, candidate))
              ) {
                secondaryDirs.push(candidate);
              }
            }
            return {
              id:
                typeof entry.id === "string" && entry.id.trim()
                  ? entry.id
                  : randomUUID(),
              ...(typeof entry.name === "string" && entry.name.trim()
                ? { name: entry.name }
                : {}),
              primaryDir,
              secondaryDirs,
            };
          })
          .filter((entry): entry is ProjectFolderSettings => entry !== null)
      : existing.projects;
    writeAppSettings(dataDir, { ...current, workingFolders: { global, projects } });
    res.json(workingFoldersResponse(readAppSettings(dataDir)));
  });
  // Copy a picked .md file into the user's role folder — never touches the
  // bundled role-presets directory.
  app.post("/api/role-presets/upload", (req, res) => {
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
  app.get("/api/settings/session-list", (_req, res) => {
    res.json(
      readAppSettings(dataDir).sessionListSort ?? {
        folders: "name",
        conversations: "modified",
      },
    );
  });
  app.put("/api/settings/session-list", (req, res) => {
    const body = req.body as { folders?: unknown; conversations?: unknown };
    if (
      (body.folders !== "name" && body.folders !== "modified") ||
      (body.conversations !== "name" && body.conversations !== "modified")
    ) {
      res.status(400).json({ error: "Unknown session-list sort" });
      return;
    }
    const settings = readAppSettings(dataDir);
    settings.sessionListSort = {
      folders: body.folders,
      conversations: body.conversations,
    };
    writeAppSettings(dataDir, settings);
    res.json({ ok: true, ...settings.sessionListSort });
  });
  app.get("/api/settings/default-permission", (_req, res) => {
    res.json({ permission: readAppSettings(dataDir).defaultPermission ?? "ask" });
  });
  app.put("/api/settings/default-permission", (req, res) => {
    const permission = (req.body as { permission?: unknown }).permission as Permission;
    if (!PERMISSIONS.includes(permission)) {
      res.status(400).json({ error: "Unknown permission" });
      return;
    }
    const settings = readAppSettings(dataDir);
    settings.defaultPermission = permission;
    writeAppSettings(dataDir, settings);
    res.json({ ok: true, permission });
  });
  app.get("/api/settings/command-allowlist", (_req, res) => {
    res.json({ prefixes: readAppSettings(dataDir).commandAllowlist ?? [] });
  });
  app.put("/api/settings/command-allowlist", (req, res) => {
    const prefixes = (req.body as { prefixes?: unknown }).prefixes;
    if (!Array.isArray(prefixes)) {
      res.status(400).json({ error: "prefixes must be a list" });
      return;
    }
    const settings = readAppSettings(dataDir);
    settings.commandAllowlist = normalizeCommandAllowlist(prefixes);
    writeAppSettings(dataDir, settings);
    res.json({ ok: true, prefixes: settings.commandAllowlist });
  });
  app.get("/api/settings/model-hooks", (_req, res) => {
    res.json({ enabled: readAppSettings(dataDir).modelHooks !== false });
  });
  app.put("/api/settings/model-hooks", (req, res) => {
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
    const settings = readAppSettings(dataDir);
    res.json({
      mode: settings.runtimeMode ?? "alt-theory",
      nativePiScanAltSkills: settings.nativePiScanAltSkills !== false,
    });
  });
  app.put("/api/settings/runtime", async (req, res) => {
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
    res.json({ lang: readAppSettings(dataDir).lang ?? null });
  });
  app.put("/api/settings/lang", (req, res) => {
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
    // Answer from what is on disk and let models.dev catch up in the
    // background: awaiting a third-party host here made opening the model
    // settings page wait seconds on a stale cache or a slow network.
    void refreshModelsDevMetadata(agentConfigDir());
    res.json({ providers: listProviders(agentConfigDir()) });
  });
  app.get("/api/config/auth/providers", (_req, res) => {
    res.json({ providers: listProviderAuthStatus(agentConfigDir()) });
  });
  app.post("/api/config/auth/providers/:provider/login", (req, res) => {
    if (!isProviderAuthId(req.params.provider)) {
      res.status(400).json({ error: "Unsupported OAuth provider" });
      return;
    }
    res
      .status(202)
      .json(startProviderAuth(agentConfigDir(), req.params.provider));
  });
  app.post("/api/config/auth/providers/:provider/logout", async (req, res) => {
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
    const flow = getProviderAuthFlow(req.params.flowId);
    if (!flow) {
      res.status(404).json({ error: "Unknown auth flow" });
      return;
    }
    res.json(flow);
  });
  app.post("/api/config/auth/flows/:flowId/respond", (req, res) => {
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
    const flow = cancelProviderAuth(req.params.flowId);
    if (!flow) {
      res.status(404).json({ error: "Unknown auth flow" });
      return;
    }
    res.json(flow);
  });
  app.post("/api/config/fetch-models", async (req, res) => {
    const body = req.body as {
      provider?: unknown;
      baseUrl?: unknown;
      api?: unknown;
      apiKey?: unknown;
    };
    try {
      res.json({
        ...(await fetchProviderModelsFromDraftResult(agentConfigDir(), {
          provider: typeof body.provider === "string" ? body.provider : "",
          baseUrl: typeof body.baseUrl === "string" ? body.baseUrl : undefined,
          api: typeof body.api === "string" ? (body.api as ApiType) : undefined,
          apiKey: typeof body.apiKey === "string" ? body.apiKey : undefined,
        })),
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      res.status(error instanceof ConfigValidationError ? 400 : 500).json({
        error: message,
      });
    }
  });
  app.post("/api/config/test-connection", async (req, res) => {
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
      skills: discoverConfiguredSkills().skills,
    });
  });
  app.get("/api/app", async (_req, res) => {
    const settings = readAppSettings(dataDir);
    res.json({
      app: {
        runtimeMode: settings.runtimeMode ?? "alt-theory",
        nativePiScanAltSkills: settings.nativePiScanAltSkills !== false,
      },
      // Study designation (M7 §3): the install-level flag. Non-designated
      // installs get zero study surfaces.
      participant: settings.participant ?? null,
      localConfig: await getVerifiedConfigStatus(agentConfigDir()),
    });
  });
  app.get("/api/session-import/harnesses", (_req, res) => {
    res.json({
      harnesses: IMPORT_HARNESSES.map((harness) => ({
        harness,
        status: "ready",
      })),
    });
  });
  app.get("/api/session-import/:harness/sessions", async (req, res) => {
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
    const harness = req.params.harness;
    if (!isImportHarness(harness)) {
      res.status(400).json({ error: `Unknown import harness: ${harness}` });
      return;
    }
    const body = (req.body ?? {}) as {
      selection?: unknown;
      sourceIds?: unknown;
      changedSourcePolicy?: unknown;
      workspaceOverrides?: unknown;
      visibility?: unknown;
      preflightOnly?: unknown;
    };
    const selection = body.selection ?? "selected";
    // Imported conversations start from the default permission, never Full.
    const { mode } = defaultSessionPermission(readAppSettings(dataDir));
    const changedSourcePolicy = body.changedSourcePolicy ?? "skip";
    if (selection !== "all" && selection !== "selected") {
      res.status(400).json({ error: "selection must be 'all' or 'selected'" });
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

    try {
      const adapter = getImportAdapter(harness);
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
      const metadata = sessionCreationMetadata(visibility);
      const importSelectors = createDraftSelectors();
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
          const preflight = adapter.preflight(source);
          if (preflightOnly) {
            return {
              sourceId: source.sourceId,
              status: "ready" as const,
              sessionId: null,
              transformations: preflight.transformations,
            };
          }
          const registered = adapter.register({
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
    const list = listSessionSummaries(dataDir);
    const activity = sessionService.sessionActivity();
    res.json({
      ...list,
      sessions: list.sessions.filter((session) =>
        access.canList(req, session.sessionId),
      ).map((session) => ({
        ...session,
        runStatus: activity.get(session.sessionId) ?? "idle",
      })),
    });
  });
  app.get("/api/sessions/search-content", async (req, res) => {
    const query = typeof req.query.query === "string" ? req.query.query.trim() : "";
    if (query.length > 256) {
      res.status(400).json({ error: "Search query is too long" });
      return;
    }
    const terms = query.toLocaleLowerCase().split(/\s+/).filter(Boolean);
    if (!terms.length) {
      res.json({ sessionIds: [] });
      return;
    }
    const sessionIds: string[] = [];
    for (const summary of listSessionSummaries(dataDir).sessions) {
      if (res.destroyed) return;
      if (!access.canList(req, summary.sessionId) || !access.canReadContent(req, summary.sessionId)) continue;
      try {
        if (visibleTranscriptMatches(readVisibleTranscript(dataDir, summary.sessionId), terms)) {
          sessionIds.push(summary.sessionId);
        }
      } catch {
        // One damaged conversation must not hide the rest of the results.
      }
      // Keep the server responsive while scanning conversations on demand.
      await new Promise<void>((resolve) => setImmediate(resolve));
    }
    if (!res.destroyed) res.json({ sessionIds });
  });
  app.get("/api/sessions/trash", (req, res) => {
    const list = listDeletedSessionSummaries(dataDir);
    res.json({
      ...list,
      sessions: list.sessions.filter((session) =>
        access.canList(req, session.sessionId),
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

    const detail = readSessionDetail(dataDir, sessionId);
    if (!detail) {
      res.status(404).json({ error: `Unknown session id: ${sessionId}` });
      return;
    }
    if (!access.canList(req, detail.session.sessionId)) {
      res.status(404).json({ error: `Unknown session id: ${sessionId}` });
      return;
    }
    if (!access.canReadContent(req, detail.session.sessionId)) {
      res.status(403).json({ error: "Session content is private" });
      return;
    }
    res.json({ ...detail, sessionRoot: root.sessionRoot });
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
    const loaded = readSessionDetailWithParts(dataDir, sessionId);
    if (!loaded || !access.canList(req, loaded.detail.session.sessionId)) {
      res.status(404).json({ error: `Unknown session id: ${sessionId}` });
      return;
    }
    if (!access.canReadContent(req, loaded.detail.session.sessionId)) {
      res.status(403).json({ error: "Session content is private" });
      return;
    }
    const changes = readSessionChanges(dataDir, sessionId, loaded.parts);
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
    const detail = readSessionDetail(dataDir, sessionId);
    if (!detail || !access.canList(req, detail.session.sessionId)) {
      res.status(404).json({ error: `Unknown session id: ${sessionId}` });
      return;
    }
    if (!access.canReadContent(req, detail.session.sessionId)) {
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
      const deleted = softDeleteSession(dataDir, sessionId);
      sessionService.listChanged(sessionId);
      res.json({ deleted });
    } catch (error) {
      res.status(409).json({
        error: error instanceof Error ? error.message : String(error),
      });
    }
  });
  app.delete("/api/sessions/:sessionId/family", async (req, res) => {
    const sessionId = req.params.sessionId;
    if (!requireSessionRestContentAccess(req, res, sessionId)) return;
    try {
      const family = familyMemberIds(dataDir, sessionId);
      const activity = sessionService.sessionActivity();
      for (const memberId of family) {
        const state = activity.get(memberId);
        if (state === "running" || state === "awaiting-approval") {
          await sessionService.abort(memberId, "session_deleted");
        }
      }
      const deletedSessionIds = softDeleteSessionFamily(dataDir, sessionId);
      // One list change for the family: each window re-reads the list once.
      sessionService.listChanged(sessionId);
      res.json({ deletedSessionIds });
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
      const restored = restoreDeletedSession(dataDir, sessionId);
      sessionService.listChanged(sessionId);
      res.json({ restored });
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
      const deleted = permanentlyDeleteSession(
        dataDir,
        sessionId,
        (id) => sessionService.isOpen(id),
      );
      // Its summary is gone, so only windows that can still read one hear it.
      sessionService.listChanged(sessionId);
      res.json({ deleted });
    } catch (error) {
      res.status(409).json({
        error: error instanceof Error ? error.message : String(error),
      });
    }
  });
  // Card 11 follow-up: recall one queued message (edit or delete) without
  // interrupting the run. `not_found` = Pi already delivered it. The staged
  // attachment paths it was queued with come back for the editor.
  app.post("/api/sessions/:sessionId/queue/retract", async (req, res) => {
    const sessionId = req.params.sessionId;
    if (!requireSessionRestContentAccess(req, res, sessionId)) return;
    const text = (req.body as { text?: unknown } | undefined)?.text;
    if (typeof text !== "string") {
      res.status(400).json({
        failure: describeFailure(new Error("text is required"), "retract_queued"),
      });
      return;
    }
    try {
      res.json(await sessionService.retractQueued(sessionId, text));
    } catch (error) {
      res.status(409).json({ failure: describeFailure(error, "retract_queued") });
    }
  });
  app.post("/api/sessions/:sessionId/promote", (req, res) => {
    const sessionId = req.params.sessionId;
    if (!requireSessionRestContentAccess(req, res, sessionId)) return;
    try {
      const snapshot = sessionService.promoteRelatedSession(sessionId);
      sessionService.listChanged(sessionId);
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
      const promoted = sessionService.promoteToMainline(sessionId);
      sessionService.listChanged(sessionId);
      res.json({ sessionId, ...promoted });
    } catch (error) {
      res.status(409).json({
        error: error instanceof Error ? error.message : String(error),
      });
    }
  });
  // M2: a draft restored on this device drops staged files that are gone.
  // Attachments are a local-form feature, so absolute paths are checked only
  // there; relative ones need the conversation's content access.
  app.post("/api/attachments/missing", (req, res) => {
    const body = (req.body ?? {}) as { sessionId?: unknown; paths?: unknown };
    const paths = Array.isArray(body.paths)
      ? body.paths.filter((path): path is string => typeof path === "string")
      : [];
    const sessionId = typeof body.sessionId === "string" && body.sessionId ? body.sessionId : null;
    if (sessionId && !requireSessionRestContentAccess(req, res, sessionId)) return;
    try {
      res.json({ missing: missingAttachmentPaths(dataDir, sessionId, paths) });
    } catch (error) {
      sendFileApiError(res, error);
    }
  });

  // M4: re-point a session's working folder (local form only).
  // primaryDir null = back to the managed default.
  app.put("/api/sessions/:sessionId/workspace", async (req, res) => {
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
  // the list before any conversation exists in them. v1.5.1: the registry is
  // the project list — every project's main folder. POST creates a project
  // (a folder with no companions yet); DELETE removes the project.
  app.get("/api/workspaces", (_req, res) => {
    res.json({
      workspaces: knownWorkspacesOf(readAppSettings(dataDir)),
    });
  });
  app.post("/api/workspaces", (req, res) => {
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
    const projects = settings.workingFolders?.projects ?? [];
    if (
      !projects.some((project) => samePath(project.primaryDir, resolved))
    ) {
      const project: ProjectFolderSettings = {
        id: randomUUID(),
        primaryDir: resolved,
        secondaryDirs: [],
      };
      writeAppSettings(dataDir, {
        ...settings,
        workingFolders: {
          global: settings.workingFolders?.global ?? [],
          projects: [...projects, project],
        },
      });
    }
    res.json({ workspaces: knownWorkspacesOf(readAppSettings(dataDir)) });
  });
  app.delete("/api/workspaces", (req, res) => {
    const body = req.body as { path?: unknown };
    const raw = typeof body.path === "string" ? body.path.trim() : "";
    if (!raw) {
      res.status(400).json({ error: "path is required" });
      return;
    }
    const target = resolve(raw);
    const settings = readAppSettings(dataDir);
    const projects = settings.workingFolders?.projects ?? [];
    writeAppSettings(dataDir, {
      ...settings,
      workingFolders: {
        global: settings.workingFolders?.global ?? [],
        projects: projects.filter(
          (project) => !samePath(project.primaryDir, target),
        ),
      },
    });
    res.json({ workspaces: knownWorkspacesOf(readAppSettings(dataDir)) });
  });
  // v1.5.1: change a project's main folder. Every conversation of the
  // project moves through the ordinary re-point path; all must be idle or
  // nothing is written. Local form only, like the per-conversation move.
  app.put("/api/projects/:projectId/main-folder", async (req, res) => {
    const body = req.body as { primaryDir?: unknown };
    const primaryDir =
      typeof body.primaryDir === "string" && body.primaryDir.trim()
        ? body.primaryDir
        : null;
    if (!primaryDir) {
      res.status(400).json({ error: "primaryDir is required" });
      return;
    }
    try {
      const result = await sessionService.repointProjectMainFolder(
        req.params.projectId,
        primaryDir,
      );
      res.json({
        project: projectRows([result.project])[0],
        movedCount: result.movedCount,
        workspaces: knownWorkspacesOf(readAppSettings(dataDir)),
      });
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
  app.get("/api/sessions/:sessionId/tool-result/:toolCallId", (req, res) => {
    const { sessionId, toolCallId } = req.params;
    if (!requireSessionRestContentAccess(req, res, sessionId)) return;
    const after = typeof req.query.after === "string" ? req.query.after : undefined;
    const text = readToolResultText(dataDir, sessionId, toolCallId, after);
    if (text === null) {
      res.status(404).json({ error: `No result for tool call ${toolCallId}` });
      return;
    }
    res.json({ text });
  });
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
  app.get("/api/sessions/:sessionId/files", async (req, res) => {
    const sessionId = req.params.sessionId;
    const rootName =
      typeof req.query.root === "string" ? req.query.root : undefined;
    if (!requireSessionRestContentAccess(req, res, sessionId)) return;
    try {
      if (rootName === "workspace") {
        const workspace = listWorkspaceFiles(dataDir, sessionId);
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
        const folderId =
          typeof req.query.folderId === "string" ? req.query.folderId : null;
        if (!folderId) {
          res.json({ folders: describeWorkingFolders(dataDir, sessionId) });
          return;
        }
        const path = typeof req.query.path === "string" ? req.query.path : "";
        const search = typeof req.query.search === "string" ? req.query.search : "";
        if (!search) {
          res.json(listWorkingFolderChildren(dataDir, sessionId, folderId, path));
          return;
        }
        // A newer keystroke closes this request; stop working for it.
        const closed = new AbortController();
        res.on("close", () => closed.abort());
        const token = typeof req.query.searchToken === "string" ? req.query.searchToken : undefined;
        const result = await searchWorkingFolder(dataDir, sessionId, folderId, search, 200, {
          token,
          signal: closed.signal,
        });
        res.json(result);
        return;
      }
      res.json(listSessionTextFiles(dataDir, sessionId, rootName));
    } catch (error) {
      if (res.destroyed) return;
      sendFileApiError(res, error);
    }
  });
  app.post(
    "/api/sessions/:sessionId/files/upload",
    workspaceUpload.single("file"),
    async (req, res) => {
      const sessionId = req.params.sessionId;
      if (!requireSessionRestContentAccess(req, res, sessionId)) return;
      const file = req.file;
      if (!file) {
        res.status(400).json({ error: "file is required" });
        return;
      }
      try {
        const result = await uploadWorkspaceFile(
          dataDir,
          sessionId,
          file.originalname,
          file.buffer,
        );
        res.json(result);
      } catch (error) {
        sendFileApiError(res, error);
      }
    },
  );
  // Attached files (paperclip, read-only drop, pasted image): copied and
  // converted before any conversation exists; the send moves them into it.
  app.post("/api/attachments/stage", workspaceUpload.single("file"), async (req, res) => {
    if (!req.file) {
      res.status(400).json({ error: "file is required" });
      return;
    }
    try {
      res.json(await stageAttachment(dataDir, req.file.originalname, req.file.buffer));
    } catch (error) {
      sendFileApiError(res, error);
    }
  });
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
      expectedUpdatedAt?: unknown;
      expectedFolderPath?: unknown;
      force?: unknown;
      conflictCopy?: unknown;
    };
    if (
      typeof body?.root !== "string" ||
      typeof body.path !== "string" ||
      typeof body.content !== "string"
    ) {
      res.status(400).json({ error: "root, path, and content are required" });
      return;
    }
    const options: WriteTextFileOptions = {
      expectedUpdatedAt:
        typeof body.expectedUpdatedAt === "string" ? body.expectedUpdatedAt : undefined,
      expectedFolderPath:
        typeof body.expectedFolderPath === "string" ? body.expectedFolderPath : undefined,
      force: body.force === true,
      conflictCopy: body.conflictCopy === true,
    };
    if (!requireSessionRestContentAccess(req, res, sessionId)) return;
    try {
      if (body.root === "working") {
        // Writes the user's own folder on this machine; a multi-user
        // deployment must never reach this branch.
        res.json(
          writeWorkingFolderTextFile(dataDir, sessionId, body.path, body.content, options),
        );
        return;
      }
      const written = writeSessionTextFile(
        dataDir,
        sessionId,
        body.root,
        body.path,
        body.content,
        options,
      );
      // A rename is the ui-alias record: the list shows it.
      if (body.root === "records" && body.path === "ui-alias.json") sessionService.listChanged(sessionId);
      res.json(written);
    } catch (error) {
      if (error instanceof FileConflictError) {
        res.status(409).json({
          error: error.message,
          currentUpdatedAt: error.currentUpdatedAt,
        });
        return;
      }
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
    // The summary is all the guard reads (same check as the WebSocket
    // guard); routes that need the transcript read the detail themselves.
    const session = readSessionAccessSummary(dataDir, sessionId);
    if (!session || !access.canList(req, sessionId)) {
      res.status(404).json({ error: `Unknown session id: ${sessionId}` });
      return false;
    }
    if (!access.canReadContent(req, sessionId)) {
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
    modelProvider,
    modelId,
    modelsPath: modelsPath ?? undefined,
    authPath: options.authPath,
    runtimeApiKey:
      options.runtimeApiKey ?? process.env.ALT_THEORY_MODEL_API_KEY,
    thinkingLevel: options.thinkingLevel,
    resourceDiscovery,
    skillsDir,
    trustedReadRoots: [
      RESOURCE_ROOT,
      assetPaths.rootDir,
      agentConfigDir(),
      getAgentDir(),
      join(homedir(), ".agents"),
      join(homedir(), ".pi", "agent"),
    ],
    instructionsDir,
    runLabel,
    testBatch,
    resolveRuntimeModelConfig: () => resolveLocalRuntimeModelConfig(),
    resolveExternalSkillPaths: () => {
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
    },
  });

  const stopTrashSweep = sweepExpiredDeletedSessions(
    dataDir,
    (sessionId) => sessionService.isOpen(sessionId),
  );
  httpServer.on("close", stopTrashSweep);
  // Idle conversation runtimes are released and reopen silently (WP 2.1).
  const stopRuntimeSweep = sweepIdleRuntimes(() => {
    void sessionService.reclaimIdleRuntimes();
  });
  httpServer.on("close", stopRuntimeSweep);

  function resolveLocalRuntimeModelConfig(): RuntimeModelConfig {
    return getRuntimeModelConfig(agentConfigDir());
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
    send(toServerMessage(event));
  }

  /** Every refused request carries the one failure envelope (card 2). */
  function sendError(
    send: (msg: ServerMessage) => void,
    error: unknown,
    code?: string,
    operation = "request",
    requestId?: string,
  ): void {
    send({
      type: "error",
      payload: {
        failure: describeFailure(error, operation),
        ...(code ? { code } : {}),
        ...(requestId ? { requestId } : {}),
      },
    });
  }

  function createDraftSelectors(): SessionSelectors {
    return {
      rolePresetSlug: defaultRolePresetSlug(),
      kbDomain: "ep-core",
      soulSlug: defaultSoulSlug(),
      customInstructionRef: defaultInstructionRef(),
    };
  }

  /** A new conversation's marker; a withheld one records that no consent
   *  to research use was given. */
  function sessionCreationMetadata(visibility: SessionVisibility) {
    return {
      visibility,
      consentSnapshot: withholdsFromResearch(visibility)
        ? {
            researcherReadable: false,
            quoteAfterAnonymization: false,
            privateOverride: true,
          }
        : null,
    };
  }

  /**
   * Sharing default follows study designation (M7 §4): an install withholds
   * by default unless it was designated at handout — a marker for a future
   * export filter, never an expiry.
   */
  function defaultDraftVisibility(): SessionVisibility {
    return readAppSettings(dataDir).participant?.designated
      ? "exportable"
      : "no-export";
  }

  /**
   * The new-conversation defaults (M2: the draft itself — text, files and
   * settings — lives in the client). `thinking` answers for the model the
   * draft names, or the default model.
   */
  function sendDraftDefaults(
    send: (msg: ServerMessage) => void,
    modelOverride: SessionModelOverride | null = null,
  ): void {
    const selectors = createDraftSelectors();
    send({
      type: "session_draft",
      payload: {
        status: "draft",
        visibility: defaultDraftVisibility(),
        currentDomain: selectors.kbDomain,
        rolePresetSlug: selectors.rolePresetSlug,
        soulSlug: selectors.soulSlug,
        customInstructionRef: selectors.customInstructionRef ?? null,
        ...defaultSessionPermission(readAppSettings(dataDir)),
        modelOverride,
        thinking: draftThinking(modelOverride),
      },
    });
  }

  /** The chip computes nothing: the draft's thinking level is resolved here too. */
  function draftThinking(
    modelOverride: SessionModelOverride | null,
  ): ResolvedThinking | undefined {
    const runtime = modelOverride
      ? { modelProvider: modelOverride.provider, modelId: modelOverride.modelId }
      : resolveLocalRuntimeModelConfig();
    if (!runtime.modelProvider || !runtime.modelId) return undefined;
    return resolveThinkingLevel(
      thinkingLevelsForModel(agentConfigDir(), runtime.modelProvider, runtime.modelId) ?? [],
      modelOverride?.thinkingLevel,
    );
  }

  wss.on("connection", async (ws: WebSocket, req) => {
    const heartbeatSocket = ws as WebSocket & { isAlive?: boolean };
    heartbeatSocket.isAlive = true;
    heartbeatSocket.on("pong", () => {
      heartbeatSocket.isAlive = true;
    });

    let attachedSessionId: string | null = null;
    let detach = () => {};
    let detachApprovals = () => {};
    let detachActivity = () => {};
    let closed = false;

    const send = (msg: ServerMessage) => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify(msg));
      }
    };

    /**
     * What a new conversation is created with: the client's draft settings
     * (M2), each present field checked here, absent ones the defaults. The
     * connection holds nothing about a draft.
     */
    const creationFrom = (draft: NewConversationSettings = {}) => {
      const selectors = createDraftSelectors();
      const defaults = defaultSessionPermission(readAppSettings(dataDir));
      let mode: AltMode = defaults.mode;
      // Under Native Pi the Alt selectors are inactive but still recorded, so
      // the conversation has them once Native Pi is turned off.
      if (draft.kbDomain !== undefined) {
        if (draft.kbDomain !== KB_DISABLED_DOMAIN && !isKnownKbDomain(kbDir, draft.kbDomain)) {
          throw new Error(`Unknown KB domain: ${draft.kbDomain}`);
        }
        selectors.kbDomain = draft.kbDomain;
      }
      if (draft.rolePresetSlug !== undefined) selectors.rolePresetSlug = optionalSlug(draft.rolePresetSlug);
      if (draft.soulSlug !== undefined) selectors.soulSlug = optionalSlug(draft.soulSlug);
      if (draft.customInstructionRef !== undefined) {
        selectors.customInstructionRef = optionalSlug(draft.customInstructionRef);
      }
      // A draft saved before 2026-09-25 may still say "understand": retired
      // values read as work, like a stored header.
      if (draft.mode !== undefined) mode = toAltMode(draft.mode);
      const visibility = draft.visibility ?? defaultDraftVisibility();
      if (!isSessionVisibility(visibility)) throw new Error("Invalid visibility");
      let workspace: { primaryDir: string } | null = null;
      if (draft.workspacePrimaryDir) {
        const primaryDir = resolve(draft.workspacePrimaryDir);
        if (!statSync(primaryDir, { throwIfNoEntry: false })?.isDirectory()) {
          throw new Error(`Main folder does not exist:${primaryDir}`);
        }
        workspace = { primaryDir };
      }
      // Role, soul, instruction and model are checked by the assembly itself
      // (unknown slug / unknown model refuse the creation, nothing is left).
      return {
        selectors,
        metadata: {
          ...sessionCreationMetadata(visibility),
          mode,
          // Under read-only the value is held dormant.
          fullAccess: draft.fullAccess ?? defaults.fullAccess,
          smartApproval: draft.smartApproval ?? defaults.smartApproval,
          modelOverride: draft.modelOverride ?? null,
          studyTag: draft.studyTag ?? null,
          workspace,
        },
      };
    };

    const requireSessionWsContentAccess = (sessionId: string): SessionSummary => {
      const summary = readSessionAccessSummary(dataDir, sessionId);
      if (!summary || !access.canList(req, summary.sessionId)) {
        throw new Error(`Unknown session id: ${sessionId}`);
      }
      if (!access.canReadContent(req, summary.sessionId)) {
        throw new Error("Session content is private");
      }
      if (summary.deletedAt) {
        throw new Error("Conversation is in Trash");
      }
      return summary;
    };

    // The list's access rule (GET /api/sessions), over a wider set: trash
    // and conversations not yet on disk, so deletes and first runs are heard.
    const canSeeInList = (sessionId: string): boolean => access.canList(req, sessionId);

    const canReceiveApproval = (sessionId: string): boolean => {
      const summary = readSessionAccessSummary(dataDir, sessionId);
      return Boolean(
        summary &&
          !summary.deletedAt &&
          access.canList(req, summary.sessionId) &&
          access.canReadContent(req, summary.sessionId),
      );
    };

    const attachToSession = (sessionId: string) => {
      detach();
      attachedSessionId = sessionId;
      detach = sessionService.attach(sessionId, (event) => {
        if (event.type === "approval_requested" || event.type === "approval_resolved") {
          return;
        }
        forwardServiceEvent(send, event);
      });
      send({ type: "session_opened", payload: sessionService.getSnapshot(sessionId), });
      send({ type: "session_metadata", payload: sessionService.getManifest(sessionId), });
      send({ type: "session_metrics", payload: sessionService.getMetrics(sessionId), });
    };

    // Busy-refusal cure (2026-09-13): a mid-run role/soul/instruction
    // choice is acked as pending (chip + clock mark) instead of refused. An
    // idle switch swaps the instance inside the service; its snapshot reaches
    // every window of the conversation, and only the manifest is resent here.
    const switchAsset = async (
      patch: Parameters<SessionService["switchAssetSelectors"]>[1],
    ) => {
      if (!attachedSessionId) return;
      await sessionService.switchAssetSelectors(attachedSessionId, patch);
    };

    // SessionService owns the one displayable transcript projection, including
    // the in-flight user bubble. This layer only replays buffered stream events.
    const sendTranscriptWithLiveReplay = (sessionId: string) => {
      const live = sessionService.getLiveRun(sessionId);
      send({ type: "session_transcript", payload: sessionService.getTranscriptWindow(sessionId) });
      for (const event of live?.events ?? []) {
        forwardServiceEvent(send, event);
      }
    };

    ws.on("close", () => {
      closed = true;
      detach();
      detachApprovals();
      detachActivity();
      detach = () => {};
      detachApprovals = () => {};
      detachActivity = () => {};
      attachedSessionId = null;
    });

    sendDraftDefaults(send);
    detachApprovals = sessionService.attachApprovals((event) => {
      if (canReceiveApproval(event.payload.sessionId)) {
        forwardServiceEvent(send, event);
      }
    });
    send({
      type: "approval_snapshot",
      payload: sessionService
        .listPendingApprovals()
        .filter((request) => canReceiveApproval(request.sessionId)),
    });
    // List activity (WP-4): the whole picture now, then every change —
    // the list no longer polls.
    detachActivity = sessionService.attachActivity((event) => {
      if (canSeeInList(event.sessionId)) send({ type: "session_activity", payload: event });
    });
    send({
      type: "activity_snapshot",
      payload: {
        activity: Object.fromEntries(
          [...sessionService.sessionActivity()].filter(([sessionId]) => canSeeInList(sessionId)),
        ),
      },
    });

    ws.on("message", async (data) => {
      let msg: ClientMessage;
      try {
        msg = JSON.parse(data.toString()) as ClientMessage;
      } catch {
        sendError(send, new Error("Invalid JSON"), undefined, "message");
        return;
      }
      // Request receipt (M1): a message that carries a requestId is answered
      // exactly once — request_done when accepted (a run started or queued, a
      // navigation attached, a switch's snapshot sent) or an error that names
      // it. The finally below answers any path that returned without either.
      const requestId =
        typeof msg.requestId === "string" && msg.requestId ? msg.requestId : undefined;
      let answered = false;
      const done = () => {
        if (answered) return;
        answered = true;
        if (requestId) send({ type: "request_done", payload: { requestId } });
      };
      const fail = (error: unknown, code?: string) => {
        const first = !answered;
        answered = true;
        sendError(send, error, code, msg.type, first ? requestId : undefined);
      };
      try {
        if (
          readAppSettings(dataDir).runtimeMode === "native-pi" &&
          // The permission (switch_mode) applies under Native Pi too.
          ["switch_kb", "switch_role_preset", "switch_soul"].includes(
            msg.type,
          )
        ) {
          fail(new Error("This Alt Theory control is inactive while Native Pi is on"),
          );
          return;
        }
        if (
          attachedSessionId &&
          msg.type !== "new_session" &&
          msg.type !== "create_helper_session"
        ) {
          try {
            requireSessionWsContentAccess(attachedSessionId);
          } catch (error) {
            detach();
            detach = () => {};
            attachedSessionId = null;
            fail(error);
            return;
          }
        }

        switch (msg.type) {
          case "prompt": {
            try {
              if (!attachedSessionId) {
                const creation = creationFrom(msg.create);
                const initial = await sessionService.createSession(creation.selectors, creation.metadata);
                if (closed) return;
                attachToSession(initial.sessionId);
              }
              const currentSessionId = attachedSessionId;
              // Staged attached files move into this conversation's folder.
              const { text, attachments } = adoptStagedAttachments(
                dataDir,
                currentSessionId,
                msg.payload,
                msg.attachments,
              );
              if (sessionService.isRunning(currentSessionId)) {
                // Pi owns the queue (card 11): a message during a turn joins
                // Pi's steer queue — "queued = next API call" — unless the
                // composer asked for a follow-up after the turn.
                await sessionService.queuePrompt(
                  currentSessionId,
                  text,
                  attachments,
                  msg.deliverAs ?? "steer",
                );
                break;
              }
              // A refusal before the run starts (busy, no model) is an error
              // reply; once started, finishRun reports the outcome to every
              // window.
              sessionService.runPrompt(currentSessionId, text, attachments);
            } catch (error) {
              fail(error);
            }
            break;
          }
          case "abort":
            if (!attachedSessionId) break;
            try {
              await sessionService.abort(attachedSessionId, "user_stop", "user_abort");
            } catch (error) {
              fail(error);
            }
            break;
          case "send_queued_now": {
            if (!attachedSessionId) break;
            // Interrupt-and-send: the outcome arrives as events (the stopped
            // run's failure, the new run, the re-queued cards). A selection
            // already taken into the turn is a silent no-op by design.
            try {
              await sessionService.interruptAndSend(
                attachedSessionId,
                msg.payload.text,
              );
            } catch (error) {
              fail(error);
            }
            break;
          }
          case "compact": {
            if (!attachedSessionId) {
              fail(new Error("Open a conversation before compacting it"),
              );
              break;
            }
            let compaction: Promise<unknown>;
            try {
              compaction = sessionService.compact(attachedSessionId);
            } catch (error) {
              fail(error);
              break;
            }
            done();
            try {
              await compaction;
              send({
                type: "extension_notice",
                payload: { message: "Conversation compacted.", level: "info", code: "compacted" },
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
          }
          case "switch_kb":
            if (!attachedSessionId) {
              fail(new Error("A materialized session is required"));
              break;
            }
            try {
              // Idle applies now, mid-run the choice is pending (chip + clock
              // mark); either way the service publishes the snapshot to every
              // window — clients show what the server holds, not a guess.
              await sessionService.setKbDomain(attachedSessionId, msg.payload.domain);
            } catch (error) {
              fail(error);
            }
            break;
          case "switch_role_preset": {
            const rolePresetSlug = optionalSlug(msg.payload.rolePresetSlug);
            if (!attachedSessionId) {
              fail(new Error("A materialized session is required"));
              break;
            }
            try {
              await switchAsset({ rolePresetSlug });
            } catch (error) {
              fail(error);
            }
            break;
          }
          case "switch_soul": {
            const soulSlug = optionalSlug(msg.payload.soulSlug);
            if (!attachedSessionId) {
              fail(new Error("A materialized session is required"));
              break;
            }
            try {
              await switchAsset({ soulSlug });
            } catch (error) {
              fail(error);
            }
            break;
          }
          case "switch_instruction": {
            const customInstructionRef = optionalSlug(
              msg.payload.customInstructionRef,
            );
            if (!attachedSessionId) {
              fail(new Error("A materialized session is required"));
              break;
            }
            try {
              await switchAsset({ customInstructionRef });
            } catch (error) {
              fail(error);
            }
            break;
          }
          case "switch_visibility": {
            if (!isSessionVisibility(msg.payload.visibility)) {
              fail(new Error("Invalid visibility"));
              break;
            }
            if (!attachedSessionId) {
              fail(new Error("A materialized session is required"));
              break;
            }
            try {
              const metadata = sessionCreationMetadata(msg.payload.visibility);
              // Idle applies now; mid-run the published snapshot carries
              // the pending choice (no more busy refusal).
              await sessionService.setVisibility(
                attachedSessionId,
                msg.payload.visibility,
                metadata.consentSnapshot,
              );
            } catch (error) {
              fail(error);
            }
            break;
          }
          case "set_study_tag": {
            if (!attachedSessionId) {
              fail(new Error("A materialized session is required"));
              break;
            }
            try {
              sessionService.setStudyTag(attachedSessionId, msg.payload.studyTag ?? null);
            } catch (error) {
              fail(error);
            }
            break;
          }
          case "set_session_model": {
            if (!attachedSessionId) {
              fail(new Error("A materialized session is required"));
              break;
            }
            try {
              await sessionService.setSessionModel(attachedSessionId, msg.payload.override ?? null);
            } catch (error) {
              fail(error);
            }
            break;
          }
          case "invoke_skill": {
            try {
              if (!attachedSessionId) {
                const creation = creationFrom(msg.create);
                const initial = await sessionService.createSession(creation.selectors, creation.metadata);
                if (closed) return;
                attachToSession(initial.sessionId);
              }
              sessionService.invokeSkill(
                attachedSessionId,
                msg.payload.skillName,
                msg.payload.userText,
              );
            } catch (error) {
              fail(error);
            }
            break;
          }
          case "revise_latest": {
            if (!attachedSessionId) {
              fail(new Error("A materialized session is required"));
              break;
            }
            try {
              if (msg.payload.entryId) {
                sessionService.reviseAt(attachedSessionId, msg.payload.entryId, msg.payload.text);
              } else {
                sessionService.reviseLatest(attachedSessionId, msg.payload.text);
              }
            } catch (error) {
              fail(error);
            }
            break;
          }
          case "branch_revision": {
            if (!attachedSessionId) {
              fail(new Error("A materialized session is required"));
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
              sessionService.reviseAt(forked.sessionId, targetEntryId, msg.payload.text);
            } catch (error) {
              fail(error);
            }
            break;
          }
          case "prepare_branch_revision": {
            if (!attachedSessionId) {
              fail(new Error("A materialized session is required"));
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
              fail(error);
            }
            break;
          }
          case "retry_latest": {
            if (!attachedSessionId) {
              fail(new Error("A materialized session is required"));
              break;
            }
            try {
              sessionService.retryLatestFromStart(attachedSessionId);
            } catch (error) {
              fail(error);
            }
            break;
          }
          case "continue_latest": {
            if (!attachedSessionId) {
              fail(new Error("A materialized session is required"));
              break;
            }
            try {
              sessionService.continueLatestFromBreakpoint(attachedSessionId);
            } catch (error) {
              fail(error);
            }
            break;
          }
          case "delete_latest": {
            if (!attachedSessionId) {
              fail(new Error("A materialized session is required"));
              break;
            }
            try {
              // The service publishes the snapshot and the rows to every window.
              sessionService.deleteLatest(attachedSessionId);
            } catch (error) {
              fail(error);
            }
            break;
          }
          case "switch_mode": {
            if (msg.payload.mode !== "read-only" && msg.payload.mode !== "work") {
              fail(new Error("Unknown mode"));
              break;
            }
            if (!attachedSessionId) {
              fail(new Error("A materialized session is required"));
              break;
            }
            try {
              await sessionService.switchMode(attachedSessionId, msg.payload.mode);
            } catch (error) {
              fail(error);
            }
            break;
          }
          case "set_full_access": {
            if (typeof msg.payload?.enabled !== "boolean") {
              fail(new Error("enabled must be a boolean"));
              break;
            }
            // Full Access is a local-only control (v1.4.8); under read-only
            // the session runtime holds it dormant.
            if (!attachedSessionId) {
              fail(new Error("A materialized session is required"));
              break;
            }
            try {
              await sessionService.setFullAccess(attachedSessionId, msg.payload.enabled);
            } catch (error) {
              fail(error);
            }
            break;
          }
          case "set_smart_approval": {
            if (typeof msg.payload?.enabled !== "boolean") {
              fail(new Error("enabled must be a boolean"));
              break;
            }
            if (!attachedSessionId) {
              fail(new Error("A materialized session is required"));
              break;
            }
            try {
              await sessionService.setSmartApproval(attachedSessionId, msg.payload.enabled);
            } catch (error) {
              fail(error);
            }
            break;
          }
          case "respond_approval": {
            if (!attachedSessionId) {
              fail(new Error("A materialized session is required"));
              break;
            }
            if (typeof msg.payload?.approvalId !== "string") {
              fail(new Error("An approvalId is required"));
              break;
            }
            try {
              const { approvalId, accept, choice, text } = msg.payload;
              const responded = sessionService.respondApproval(attachedSessionId, approvalId, {
                accept,
                choice,
                text,
              });
              if (!responded) throw new Error("Approval is no longer pending");
            } catch (error) {
              fail(error);
            }
            break;
          }
          case "fork_session": {
            const forkSource = msg.payload.sourceSessionId ?? attachedSessionId;
            if (!forkSource) {
              fail(new Error("A materialized session is required"));
              break;
            }
            try {
              requireSessionWsContentAccess(forkSource);
              // A source not in memory (never opened this run, or its idle
              // runtime released) is opened first, like open_session does.
              await sessionService.openSession(
                forkSource,
                attachedSessionId
                  ? sessionService.getSelectors(attachedSessionId)
                  : createDraftSelectors(),
              );
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
                    payload: sessionService.getTranscriptWindow(forked.sessionId),
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
              fail(error);
            }
            break;
          }
          case "create_related_session": {
            if (!attachedSessionId) {
              fail(new Error("A materialized session is required"));
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
              fail(error);
            }
            break;
          }
          case "create_helper_session": {
            const parentSessionId = msg.payload.parentSessionId;
            try {
              // A root Helper takes the draft's settings (from the new-
              // conversation screen), or its parent's when there is one.
              // Full Access is never carried into a Helper. A draft setting
              // that no longer holds must not make Help disappear: defaults.
              let creation: ReturnType<typeof creationFrom>;
              try {
                creation = creationFrom(msg.create);
              } catch {
                creation = creationFrom();
              }
              let rootSelectors = creation.selectors;
              let rootMode = creation.metadata.mode;
              let rootModelOverride = creation.metadata.modelOverride;
              let rootWorkspace = creation.metadata.workspace?.primaryDir ?? null;
              if (parentSessionId) {
                try {
                  const parent = requireSessionWsContentAccess(parentSessionId);
                  rootSelectors = sessionService.getSelectors(parentSessionId);
                  const parentSnapshot = sessionService.getSnapshot(parentSessionId);
                  rootMode = parentSnapshot.mode;
                  rootModelOverride = parentSnapshot.modelOverride ?? null;
                  rootWorkspace = parent.workspacePrimaryDir ?? null;
                  const parentIsHelper =
                    parent.helper || parent.forkedFrom?.purpose === "helper";
                  if (!parentIsHelper) {
                    const related = await sessionService.createRelatedSession(
                      parentSessionId,
                      "helper",
                    );
                    if (!closed) {
                      send({
                        type: "related_session_created",
                        payload: { sessionId: related.sessionId, purpose: "helper" },
                      });
                    }
                    break;
                  }
                } catch {
                  // A stale, busy, trashed, or otherwise unusable parent must not
                  // make Help disappear. The root Helper below is the fallback.
                }
              }
              const root = await sessionService.createSession(rootSelectors, {
                ...creation.metadata,
                helper: true,
                fullAccess: false,
                mode: rootMode,
                modelOverride: rootModelOverride,
                workspace: rootWorkspace ? { primaryDir: rootWorkspace } : null,
              });
              if (!closed) attachToSession(root.sessionId);
            } catch (error) {
              fail(error);
            }
            break;
          }
          case "new_session":
            // Leave the conversation; the client shows its own draft.
            detach();
            detach = () => {};
            attachedSessionId = null;
            sendDraftDefaults(send);
            break;
          case "describe_draft":
            // The model chip's thinking level for the draft's model.
            sendDraftDefaults(send, msg.payload.modelOverride ?? null);
            break;
          case "open_session": {
            const selectors = attachedSessionId
              ? sessionService.getSelectors(attachedSessionId)
              : createDraftSelectors();
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
              fail(error);
            }
            break;
          }
          case "transcript_page": {
            if (!attachedSessionId) break;
            const before = msg.payload.before;
            if (!before) {
              sendTranscriptWithLiveReplay(attachedSessionId);
              break;
            }
            const page = sessionService.getTranscriptPage(
              attachedSessionId,
              before,
              msg.payload.limit,
              msg.payload.from,
            );
            if (!page) {
              fail(new Error(t("That part of the conversation is no longer there")));
              break;
            }
            send({ type: "transcript_page", payload: page });
            break;
          }
          case "get_session_metadata":
            if (!attachedSessionId) {
              sendDraftDefaults(send);
              break;
            }
            send({
              type: "session_metadata",
              payload: sessionService.getManifest(attachedSessionId),
            });
            break;
          case "get_session_metrics":
            if (!attachedSessionId) {
              sendDraftDefaults(send);
              break;
            }
            send({
              type: "session_metrics",
              payload: sessionService.getMetrics(attachedSessionId),
            });
            break;
        }
      } catch (error) {
        // An unexpected throw outside a case's own handling is a refusal,
        // never an acceptance.
        fail(error);
      } finally {
        done();
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
      modelProvider,
      modelId,
      modelsPath,
      resourceDiscovery,
      skillsDir,
      instructionsDir,
      runLabel,
      testBatch,
    },
  };
}

function sendFileApiError(res: Response, error: unknown): void {
  const message = error instanceof Error ? error.message : String(error);
  const status = /Unknown session|ENOENT|no such file or directory/.test(message)
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
