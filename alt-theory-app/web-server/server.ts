/**
 * Alt Theory Web Server
 *
 * Express + WebSocket backend. Static discovery uses REST; live session state
 * remains scoped to each WebSocket connection.
 */

import "dotenv/config";
import express from "express";
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
  type AssemblyManifest,
} from "../core/alt-theory-core.js";
import {
  createSessionDirs,
  resolveDataDir,
} from "../core/data-dir.js";
import {
  isKnownKbDomain,
  listKbDomains,
  listProfiles,
  resolveProfileSlug,
} from "./asset-registry.js";
import type {
  ClientMessage,
  ServerMessage,
  SessionMetrics,
  SessionSnapshot,
} from "./websocket-protocol.js";
import {
  buildSessionMetrics,
  persistSessionMetrics,
} from "./session-metrics.js";
import { appendSessionEvent } from "./session-events.js";

const PROJECT_ROOT = process.cwd();
const RUNTIME_DIR = resolve(
  PROJECT_ROOT,
  "agent-assets",
  "runtime",
  "pi-tui"
);
const PROFILES_DIR = resolve(PROJECT_ROOT, "agent-assets", "profiles");
const KB_DIR = resolve(
  PROJECT_ROOT,
  "alt-theory-app",
  "web-server",
  "assets",
  "kb"
);
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
  currentProfileSlug: string;
  messageCount: number;
  toolCallCount: number;
  turnCount: number;
}

export interface AltTheoryServerOptions {
  dataDir?: string;
  kbDir?: string;
  profilesDir?: string;
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
}

function parseCoreSoulModules(): string[] | undefined {
  const value = process.env.ALT_THEORY_CORE_SOUL_MODULES;
  if (!value) return undefined;
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

export function createAltTheoryServer(options: AltTheoryServerOptions = {}) {
  const dataDir = resolve(options.dataDir ?? resolveDataDir());
  const kbDir = resolve(options.kbDir ?? KB_DIR);
  const profilesDir = resolve(options.profilesDir ?? PROFILES_DIR);
  const publicDir = resolve(options.publicDir ?? PUBLIC_DIR);
  const readOnly = options.readOnly ?? false;

  const app = express();
  const httpServer = createServer(app);
  const wss = new WebSocketServer({ server: httpServer });

  app.use(express.static(publicDir));
  app.get("/api/profiles", (_req, res) => {
    res.json({ profiles: listProfiles(profilesDir) });
  });
  app.get("/api/kb-domains", (_req, res) => {
    res.json({ domains: listKbDomains(kbDir) });
  });

  async function createState(
    currentProfileSlug: string,
    currentDomain: string
  ): Promise<ConnectionState> {
    const profilePath = resolveProfileSlug(profilesDir, currentProfileSlug);
    if (!profilePath) {
      throw new Error(`Unknown profile slug: ${currentProfileSlug}`);
    }

    const sessionDirs = createSessionDirs(dataDir);
    const result = await createAltTheorySession({
      ...sessionDirs,
      kbDir,
      kbDomain: currentDomain,
      profilePath,
      runtimeDir: RUNTIME_DIR,
      coreSoulPath:
        options.coreSoulPath ?? process.env.ALT_THEORY_CORE_SOUL_PATH,
      coreSoulModulesDir:
        options.coreSoulModulesDir ??
        process.env.ALT_THEORY_CORE_SOUL_MODULES_DIR,
      coreSoulModules: options.coreSoulModules ?? parseCoreSoulModules(),
      modelProvider:
        options.modelProvider ?? process.env.ALT_THEORY_MODEL_PROVIDER,
      modelId: options.modelId ?? process.env.ALT_THEORY_MODEL_ID,
      modelsPath: options.modelsPath ?? process.env.ALT_THEORY_MODELS_PATH,
      runtimeApiKey:
        options.runtimeApiKey ?? process.env.ALT_THEORY_MODEL_API_KEY,
      thinkingLevel: options.thinkingLevel,
      readOnly,
    });

    const state: ConnectionState = {
      ...result,
      unsubscribe: () => {},
      currentDomain,
      currentProfileSlug,
      messageCount: 0,
      toolCallCount: 0,
      turnCount: 0,
    };
    appendSessionEvent(state.manifest.recordsDir, {
      sessionId: state.session.sessionId,
      type: "session_created",
      details: {
        kbDomain: currentDomain,
        profileSlug: currentProfileSlug,
        model: state.manifest.model,
        provider: state.manifest.provider,
      },
    });
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
      profileSlug: current.currentProfileSlug,
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
        case "switch_profile":
          if (!resolveProfileSlug(profilesDir, msg.payload.profileSlug)) {
            send({
              type: "error",
              payload: {
                error: `Unknown profile slug: ${msg.payload.profileSlug}`,
              },
            });
            break;
          }
          state.currentProfileSlug = msg.payload.profileSlug;
          appendSessionEvent(state.manifest.recordsDir, {
            sessionId: state.session.sessionId,
            type: "profile_selected_next_session",
            details: { profileSlug: msg.payload.profileSlug },
          });
          break;
        case "new_session": {
          const profileSlug = state.currentProfileSlug;
          const domain = state.currentDomain;
          const previousState = state;
          state = null;
          await disposeState(previousState);
          try {
            const replacementState = await createState(profileSlug, domain);
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
    config: { dataDir, kbDir, profilesDir, publicDir, readOnly },
  };
}

const isMain = process.argv[1]
  ? resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))
  : false;

if (isMain) {
  const port = Number.parseInt(process.env.PORT ?? "3000", 10);
  const instance = createAltTheoryServer();
  instance.httpServer.listen(port, () => {
    console.log(`Alt Theory server running on http://localhost:${port}`);
    console.log(`  Data dir: ${instance.config.dataDir}`);
    console.log(`  KB dir:   ${instance.config.kbDir}`);
  });
}
