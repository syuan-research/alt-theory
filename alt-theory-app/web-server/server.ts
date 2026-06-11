/**
 * Alt Theory Web Server
 *
 * Express + WebSocket backend. Static discovery uses REST; live session state
 * remains scoped to each WebSocket connection.
 */

import "dotenv/config";
import express from "express";
import { existsSync } from "fs";
import { createServer } from "http";
import { resolve } from "path";
import { fileURLToPath } from "url";
import WebSocket, { WebSocketServer } from "ws";
import type {
  AgentSession,
  AgentSessionEvent,
} from "@mariozechner/pi-coding-agent";
import type { ThinkingLevel } from "@mariozechner/pi-agent-core";
import {
  createAltTheorySession,
  openAltTheorySession,
  type AssemblyManifest,
  type ResourceDiscoveryMode,
} from "../core/alt-theory-core.js";
import {
  createSessionDirs,
  getSessionDirs,
  resolveDataDir,
} from "../core/data-dir.js";
import {
  resolveAgentAssetPaths,
  type AgentAssetPaths,
} from "../core/agent-assets.js";
import {
  isKnownKbDomain,
  listKbDomains,
  listRolePresets,
  resolveRolePresetSlug,
} from "./asset-registry.js";
import type {
  ClientMessage,
  ServerMessage,
  SessionMetrics,
  SessionSnapshot,
  type TranscriptMessage,
} from "./websocket-protocol.js";
import {
  buildSessionMetrics,
  persistSessionMetrics,
} from "./session-metrics.js";
import { appendSessionEvent } from "./session-events.js";
import {
  getSessionRootForRequest,
  listSessionSummaries,
  readSessionDetail,
} from "./session-store.js";

const PROJECT_ROOT = process.cwd();
const PUBLIC_DIR = resolve(
  PROJECT_ROOT,
  "alt-theory-app",
  "web-server",
  "public"
);

interface ConnectionState {
  session: AgentSession;
  unsubscribe: () => void;
  manifest: AssemblyManifest;
  currentDomain: string;
  currentRolePresetSlug: string;
  openedFrom: "new" | "existing";
  resumeWarnings: string[];
  messageCount: number;
  toolCallCount: number;
  turnCount: number;
  transcript: TranscriptMessage[];
}

export interface AltTheoryServerOptions {
  agentAssetsDir?: string;
  appContextPath?: string;
  soulPath?: string;
  dataDir?: string;
  kbDir?: string;
  rolePresetsDir?: string;
  /** Deprecated compatibility option; use rolePresetsDir. */
  profilesDir?: string;
  piPromptTemplatesDir?: string;
  publicDir?: string;
  readOnly?: boolean;
  coreSoulPath?: string;
  coreSoulModulesDir?: string;
  coreSoulModules?: string[];
  modelProvider?: string;
  modelId?: string;
  modelsPath?: string;
  runtimeApiKey?: string;
  thinkingLevel?: ThinkingLevel;
  resourceDiscovery?: ResourceDiscoveryMode;
  skillsDir?: string;
}

function parseCoreSoulModules(): string[] | undefined {
  const value = process.env.ALT_THEORY_CORE_SOUL_MODULES;
  if (!value) return undefined;
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function parseResourceDiscoveryMode(
  value: string | undefined
): ResourceDiscoveryMode {
  if (value === "clean" || value === "internal" || value === "dev-debug") {
    return value;
  }
  if (value) {
    console.warn(
      `Unknown ALT_THEORY_RESOURCE_DISCOVERY '${value}', using dev-debug`
    );
  }
  return "dev-debug";
}

export function createAltTheoryServer(options: AltTheoryServerOptions = {}) {
  const dataDir = resolve(options.dataDir ?? resolveDataDir());
  const assetPaths: AgentAssetPaths = resolveAgentAssetPaths(PROJECT_ROOT, {
    agentAssetsDir: options.agentAssetsDir,
    appContextPath: options.appContextPath,
    soulPath: options.soulPath,
    rolePresetsDir: options.rolePresetsDir ?? options.profilesDir,
    kbDir: options.kbDir,
    piPromptTemplatesDir: options.piPromptTemplatesDir,
    modelsPath: options.modelsPath,
  });
  const kbDir = assetPaths.kbDir;
  const rolePresetsDir = assetPaths.rolePresetsDir;
  const publicDir = resolve(options.publicDir ?? PUBLIC_DIR);
  const readOnly = options.readOnly ?? false;
  const modelProvider =
    options.modelProvider ?? process.env.ALT_THEORY_MODEL_PROVIDER;
  const modelId = options.modelId ?? process.env.ALT_THEORY_MODEL_ID;
  const modelsPath = assetPaths.modelsPath;
  const resourceDiscovery = parseResourceDiscoveryMode(
    options.resourceDiscovery ?? process.env.ALT_THEORY_RESOURCE_DISCOVERY
  );
  const skillsDir =
    options.skillsDir ??
    process.env.ALT_THEORY_SKILLS_DIR ??
    (resourceDiscovery === "internal"
      ? resolve(assetPaths.rootDir, "skills")
      : undefined);

  const app = express();
  const httpServer = createServer(app);
  const wss = new WebSocketServer({ server: httpServer });

  app.use(express.static(publicDir));
  app.get("/api/role-presets", (_req, res) => {
    res.json({ rolePresets: listRolePresets(rolePresetsDir) });
  });
  app.get("/api/profiles", (_req, res) => {
    res.json({ profiles: listRolePresets(rolePresetsDir) });
  });
  app.get("/api/kb-domains", (_req, res) => {
    res.json({ domains: listKbDomains(kbDir) });
  });
  app.get("/api/sessions", (_req, res) => {
    res.json(listSessionSummaries(dataDir));
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
    res.json(detail);
  });

  async function createState(
    currentRolePresetSlug: string,
    currentDomain: string
  ): Promise<ConnectionState> {
    const rolePresetPath = resolveRolePresetSlug(
      rolePresetsDir,
      currentRolePresetSlug
    );
    if (!rolePresetPath) {
      throw new Error(`Unknown role preset slug: ${currentRolePresetSlug}`);
    }

    const sessionDirs = createSessionDirs(dataDir);
    const result = await createAltTheorySession({
      ...sessionDirs,
      appContextPath: assetPaths.appContextPath,
      soulPath: assetPaths.soulPath,
      rolePresetPath,
      rolePresetSlug: currentRolePresetSlug,
      kbDir,
      kbDomain: currentDomain,
      piPromptTemplatesDir: assetPaths.piPromptTemplatesDir,
      coreSoulPath:
        options.coreSoulPath ?? process.env.ALT_THEORY_CORE_SOUL_PATH,
      coreSoulModulesDir:
        options.coreSoulModulesDir ??
        process.env.ALT_THEORY_CORE_SOUL_MODULES_DIR,
      coreSoulModules: options.coreSoulModules ?? parseCoreSoulModules(),
      modelProvider,
      modelId,
      modelsPath: modelsPath ?? undefined,
      runtimeApiKey:
        options.runtimeApiKey ?? process.env.ALT_THEORY_MODEL_API_KEY,
      thinkingLevel: options.thinkingLevel,
      resourceDiscovery,
      skillsDir,
      readOnly,
    });

    const state: ConnectionState = {
      ...result,
      unsubscribe: () => {},
      currentDomain,
      currentRolePresetSlug,
      openedFrom: "new",
      resumeWarnings: [],
      messageCount: 0,
      toolCallCount: 0,
      turnCount: 0,
      transcript: [],
    };
    appendSessionEvent(state.manifest.recordsDir, {
      sessionId: state.session.sessionId,
      type: "session_created",
      details: {
        kbDomain: currentDomain,
        rolePresetSlug: currentRolePresetSlug,
        model: state.manifest.model,
        provider: state.manifest.provider,
      },
    });
    return state;
  }

  async function createExistingState(
    sessionId: string,
    fallbackRolePresetSlug: string,
    fallbackDomain: string
  ): Promise<ConnectionState> {
    const root = getSessionRootForRequest(dataDir, sessionId);
    if (root.status === "invalid") {
      throw new Error(`Invalid session id: ${sessionId}`);
    }
    if (root.status === "missing") {
      throw new Error(`Unknown session id: ${sessionId}`);
    }

    const detail = readSessionDetail(dataDir, sessionId);
    if (!detail?.pi.sessionFile) {
      throw new Error(`Session cannot be opened because Pi JSONL is missing: ${sessionId}`);
    }

    const sessionDirs = getSessionDirs(dataDir, sessionId);
    if (!sessionDirs) {
      throw new Error(`Invalid session id: ${sessionId}`);
    }

    const originalRolePresetSlug = detail.manifest?.rolePreset?.slug ?? null;
    const activeRolePresetSlug =
      originalRolePresetSlug &&
      resolveRolePresetSlug(rolePresetsDir, originalRolePresetSlug)
        ? originalRolePresetSlug
        : fallbackRolePresetSlug;
    const rolePresetPath = resolveRolePresetSlug(
      rolePresetsDir,
      activeRolePresetSlug
    );
    if (!rolePresetPath) {
      throw new Error(`Unknown role preset slug: ${activeRolePresetSlug}`);
    }

    const originalDomain =
      detail.manifest?.kb?.domain ?? detail.manifest?.kbDomain ?? null;
    const activeDomain =
      originalDomain && isKnownKbDomain(kbDir, originalDomain)
        ? originalDomain
        : fallbackDomain;

    const result = await openAltTheorySession({
      ...sessionDirs,
      sessionFile: detail.pi.sessionFile,
      originalManifest: detail.manifest,
      appContextPath: assetPaths.appContextPath,
      soulPath: assetPaths.soulPath,
      rolePresetPath,
      rolePresetSlug: activeRolePresetSlug,
      kbDir,
      kbDomain: activeDomain,
      piPromptTemplatesDir: assetPaths.piPromptTemplatesDir,
      coreSoulPath:
        options.coreSoulPath ?? process.env.ALT_THEORY_CORE_SOUL_PATH,
      coreSoulModulesDir:
        options.coreSoulModulesDir ??
        process.env.ALT_THEORY_CORE_SOUL_MODULES_DIR,
      coreSoulModules: options.coreSoulModules ?? parseCoreSoulModules(),
      modelProvider,
      modelId,
      modelsPath: modelsPath ?? undefined,
      runtimeApiKey:
        options.runtimeApiKey ?? process.env.ALT_THEORY_MODEL_API_KEY,
      thinkingLevel: options.thinkingLevel,
      resourceDiscovery,
      skillsDir,
      readOnly,
    });

    const state: ConnectionState = {
      ...result,
      unsubscribe: () => {},
      currentDomain: activeDomain,
      currentRolePresetSlug: activeRolePresetSlug,
      openedFrom: "existing",
      resumeWarnings: result.resumeWarnings,
      messageCount: detail.metrics?.messageCount ?? 0,
      toolCallCount: detail.metrics?.toolCallCount ?? 0,
      turnCount: detail.metrics?.turnCount ?? 0,
      transcript: detail.transcript,
    };

    appendSessionEvent(state.manifest.recordsDir, {
      sessionId: state.session.sessionId,
      type: "session_opened_existing",
      details: {
        requestedSessionId: sessionId,
        kbDomain: activeDomain,
        rolePresetSlug: activeRolePresetSlug,
        warningCount: state.resumeWarnings.length,
      },
    });
    appendSessionEvent(state.manifest.recordsDir, {
      sessionId: state.session.sessionId,
      type: "session_resumed",
      details: {
        model: state.manifest.model,
        provider: state.manifest.provider,
      },
    });
    if (state.resumeWarnings.length > 0) {
      appendSessionEvent(state.manifest.recordsDir, {
        sessionId: state.session.sessionId,
        type: "resume_warning",
        details: {
          warningCount: state.resumeWarnings.length,
          warnings: state.resumeWarnings.join(" | "),
        },
      });
    }
    return state;
  }

  async function disposeState(state: ConnectionState): Promise<void> {
    state.unsubscribe();
    if (state.session.isStreaming) {
      await state.session.abort();
    }
    state.session.dispose();
  }

  function buildMetrics(state: ConnectionState): SessionMetrics {
    return buildSessionMetrics(state.session, {
      turnCount: state.turnCount,
      toolCallCount: state.toolCallCount,
      messageCount: state.messageCount,
    });
  }

  function persistMetrics(state: ConnectionState): SessionMetrics {
    const metrics = buildMetrics(state);
    persistSessionMetrics(state.manifest.recordsDir, metrics);
    return metrics;
  }

  wss.on("connection", async (ws: WebSocket) => {
    let state: ConnectionState | null = null;
    let closed = false;

    const send = (msg: ServerMessage) => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify(msg));
      }
    };

    const snapshot = (
      current: ConnectionState,
      overrides?: Partial<SessionSnapshot>
    ): SessionSnapshot => ({
      sessionId: current.session.sessionId,
      status: current.session.isStreaming ? "running" : "idle",
      currentDomain: current.currentDomain,
      rolePresetSlug: current.currentRolePresetSlug,
      profileSlug: current.currentRolePresetSlug,
      openedFrom: current.openedFrom,
      resumeWarnings: current.resumeWarnings,
      messageCount: current.messageCount,
      ...overrides,
    });

    ws.on("close", async () => {
      closed = true;
      if (state) {
        const ownedState = state;
        state = null;
        await disposeState(ownedState);
      }
    });

    const subscribeSession = (current: ConnectionState) =>
      current.session.subscribe((event: AgentSessionEvent) => {
        switch (event.type) {
          case "agent_start":
            send({
              type: "session_updated",
              payload: snapshot(current, { status: "running" }),
            });
            break;
          case "message_update":
            if (event.assistantMessageEvent?.type === "text_delta") {
              send({
                type: "assistant_delta",
                payload: { text: event.assistantMessageEvent.delta ?? "" },
              });
            }
            break;
          case "tool_execution_start":
            send({
              type: "tool_started",
              payload: {
                toolName: event.toolName,
                callId: event.toolCallId,
              },
            });
            break;
          case "tool_execution_update":
            send({
              type: "tool_updated",
              payload: { callId: event.toolCallId },
            });
            break;
          case "tool_execution_end":
            current.toolCallCount++;
            send({
              type: "tool_finished",
              payload: {
                callId: event.toolCallId,
                success: !event.isError,
              },
            });
            break;
          case "agent_end": {
            const error = current.session.state.errorMessage;
            if (error) {
              appendSessionEvent(current.manifest.recordsDir, {
                sessionId: current.session.sessionId,
                type: "run_failed",
                details: { error },
              });
              send({ type: "run_failed", payload: { error } });
            } else {
              current.turnCount++;
              const metrics = persistMetrics(current);
              appendSessionEvent(current.manifest.recordsDir, {
                sessionId: current.session.sessionId,
                type: "run_completed",
                details: {
                  turnCount: current.turnCount,
                  toolCallCount: current.toolCallCount,
                },
              });
              send({
                type: "run_completed",
                payload: snapshot(current, { status: "idle" }),
              });
              send({ type: "session_metrics", payload: metrics });
            }
            break;
          }
        }
      });

    try {
      const initialState = await createState("default", "ep-core");
      if (closed) {
        await disposeState(initialState);
        return;
      }
      state = initialState;
      state.unsubscribe = subscribeSession(state);
      send({ type: "session_opened", payload: snapshot(state) });
      send({ type: "session_metadata", payload: state.manifest });
      send({ type: "session_metrics", payload: buildMetrics(state) });
    } catch (error) {
      send({
        type: "error",
        payload: {
          error: error instanceof Error ? error.message : String(error),
        },
      });
      ws.close(1011, "Session creation failed");
      return;
    }

    ws.on("message", async (data) => {
      if (!state) return;

      let msg: ClientMessage;
      try {
        msg = JSON.parse(data.toString()) as ClientMessage;
      } catch {
        send({ type: "error", payload: { error: "Invalid JSON" } });
        return;
      }

      switch (msg.type) {
        case "prompt": {
          const contextPrefix =
            state.currentDomain !== "all"
              ? `[Context: Search in ${kbDir}/${state.currentDomain}/ unless user says otherwise.]\n`
              : "";
          state.messageCount++;
          try {
            await state.session.prompt(contextPrefix + msg.payload);
          } catch (error) {
            send({
              type: "run_failed",
              payload: {
                error: error instanceof Error ? error.message : String(error),
              },
            });
          }
          break;
        }
        case "abort":
          try {
            await state.session.abort();
            appendSessionEvent(state.manifest.recordsDir, {
              sessionId: state.session.sessionId,
              type: "run_aborted",
            });
          } catch (error) {
            send({
              type: "error",
              payload: {
                error: error instanceof Error ? error.message : String(error),
              },
            });
          }
          break;
        case "switch_kb":
          if (!isKnownKbDomain(kbDir, msg.payload.domain)) {
            send({
              type: "error",
              payload: { error: `Unknown KB domain: ${msg.payload.domain}` },
            });
            break;
          }
          state.currentDomain = msg.payload.domain;
          appendSessionEvent(state.manifest.recordsDir, {
            sessionId: state.session.sessionId,
            type: "kb_selected",
            details: { kbDomain: msg.payload.domain },
          });
          break;
        case "switch_role_preset":
        case "switch_profile": {
          const rolePresetSlug =
            msg.type === "switch_role_preset"
              ? msg.payload.rolePresetSlug
              : msg.payload.profileSlug;
          if (!resolveRolePresetSlug(rolePresetsDir, rolePresetSlug)) {
            send({
              type: "error",
              payload: {
                error: `Unknown role preset slug: ${rolePresetSlug}`,
              },
            });
            break;
          }
          state.currentRolePresetSlug = rolePresetSlug;
          appendSessionEvent(state.manifest.recordsDir, {
            sessionId: state.session.sessionId,
            type: "role_preset_selected_next_session",
            details: { rolePresetSlug },
          });
          break;
        }
        case "new_session": {
          const rolePresetSlug = state.currentRolePresetSlug;
          const domain = state.currentDomain;
          const previousState = state;
          state = null;
          await disposeState(previousState);
          try {
            const replacementState = await createState(rolePresetSlug, domain);
            if (closed) {
              await disposeState(replacementState);
              return;
            }
            state = replacementState;
            state.unsubscribe = subscribeSession(state);
            send({ type: "session_opened", payload: snapshot(state) });
            send({ type: "session_metadata", payload: state.manifest });
            send({ type: "session_metrics", payload: buildMetrics(state) });
          } catch (error) {
            send({
              type: "error",
              payload: {
                error: error instanceof Error ? error.message : String(error),
              },
            });
            ws.close(1011, "Session replacement failed");
          }
          break;
        }
        case "open_session": {
          const previousState = state;
          try {
            if (previousState.session.isStreaming) {
              await previousState.session.abort();
              appendSessionEvent(previousState.manifest.recordsDir, {
                sessionId: previousState.session.sessionId,
                type: "run_aborted",
                details: { reason: "open_session" },
              });
            }
            const replacementState = await createExistingState(
              msg.payload.sessionId,
              previousState.currentRolePresetSlug,
              previousState.currentDomain
            );
            if (closed) {
              await disposeState(replacementState);
              return;
            }
            await disposeState(previousState);
            state = replacementState;
            state.unsubscribe = subscribeSession(state);
            send({ type: "session_opened", payload: snapshot(state) });
            send({
              type: "session_transcript",
              payload: { messages: state.transcript },
            });
            send({ type: "session_metadata", payload: state.manifest });
            send({ type: "session_metrics", payload: buildMetrics(state) });
          } catch (error) {
            send({
              type: "error",
              payload: {
                error: error instanceof Error ? error.message : String(error),
              },
            });
          }
          break;
        }
        case "get_session_metadata":
          send({ type: "session_metadata", payload: state.manifest });
          break;
        case "get_session_metrics":
          send({ type: "session_metrics", payload: buildMetrics(state) });
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
      publicDir,
      readOnly,
      modelProvider,
      modelId,
      modelsPath,
      resourceDiscovery,
      skillsDir,
    },
  };
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
      `  Soul:              ${assetPaths.soulPath} (${existsSync(assetPaths.soulPath) ? "found" : "missing"})`
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
    console.log(
      `  Resources:         ${instance.config.resourceDiscovery}${instance.config.skillsDir ? ` (${instance.config.skillsDir})` : ""}`
    );
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
