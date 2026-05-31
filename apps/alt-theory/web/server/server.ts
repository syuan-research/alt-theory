/**
 * Alt Theory Web Server
 *
 * Express + WebSocket backend. Serves static frontend files and bridges
 * WebSocket messages to PI SDK AgentSession.
 *
 * Run from project root: npx tsx apps/alt-theory/web/server/server.ts
 */

import "dotenv/config";
import express from "express";
import { createServer } from "http";
import { WebSocketServer, type WebSocket } from "ws";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { createAltTheorySession } from "../../core/alt-theory-core.js";
import type { ClientMessage, ServerMessage, SessionSnapshot } from "./websocket-protocol.js";
import type { AgentSessionEvent } from "@mariozechner/pi-coding-agent";
import type { AgentSession } from "@mariozechner/pi-coding-agent";

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const PORT = parseInt(process.env.PORT ?? "3000", 10);

// Resolve paths relative to project root (cwd)
const PROJECT_ROOT = process.cwd();
const TUI_DIR = resolve(PROJECT_ROOT, "agent-assets", "runtime", "pi-tui");  // AGENTS.md + .pi/prompts live here
const KB_DIR = resolve(PROJECT_ROOT, "agent-assets", "kb");
const PUBLIC_DIR = resolve(PROJECT_ROOT, "apps", "alt-theory", "web", "frontend", "public");

// ---------------------------------------------------------------------------
// Server State
// ---------------------------------------------------------------------------

interface ServerState {
  currentDomain: string;
  currentProfilePath: string;
  messageCount: number;
}

const serverState: ServerState = {
  currentDomain: "ep-core",
  currentProfilePath: "./agent-assets/profiles/default.md",
  messageCount: 0,
};

// ---------------------------------------------------------------------------
// Express + HTTP + WebSocket
// ---------------------------------------------------------------------------

const app = express();
const server = createServer(app);
const wss = new WebSocketServer({ server });

// Serve static frontend files
app.use(express.static(PUBLIC_DIR));

wss.on("connection", async (ws: WebSocket) => {
  console.log("[ws] Client connected");

  // --- Create PI session ---
  let { session } = await createAltTheorySession({
    rootDir: TUI_DIR,
    kbDir: KB_DIR,
    readOnly: true,
  });

  let messageCount = 0;

  // --- Helper: send typed message to client ---
  const send = (msg: ServerMessage) => {
    if (ws.readyState === ws.OPEN) {
      ws.send(JSON.stringify(msg));
    }
  };

  // --- Helper: build snapshot ---
  const snapshot = (overrides?: Partial<SessionSnapshot>): SessionSnapshot => ({
    sessionId: session.sessionId,
    status: session.isStreaming ? "running" : "idle",
    currentDomain: serverState.currentDomain,
    profilePath: serverState.currentProfilePath,
    messageCount,
    ...overrides,
  });

  // --- Send session_opened ---
  send({ type: "session_opened", payload: snapshot() });

  // --- PI SDK events → WebSocket (extracted for reuse in new_session) ---
  let unsubscribe = subscribeSession(session);

  function subscribeSession(s: AgentSession) {
    return s.subscribe((event: AgentSessionEvent) => {
      console.log(`[event] ${event.type}`);
      switch (event.type) {
        case "agent_start":
          send({ type: "session_updated", payload: snapshot({ status: "running" }) });
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
            payload: { toolName: event.toolName, callId: event.toolCallId },
          });
          break;

        case "tool_execution_update":
          send({
            type: "tool_updated",
            payload: { callId: event.toolCallId },
          });
          break;

        case "tool_execution_end":
          send({
            type: "tool_finished",
            payload: {
              callId: event.toolCallId,
              success: !event.isError,
            },
          });
          break;

        case "agent_end": {
          const error = session.state.errorMessage;
          if (error) {
            send({ type: "run_failed", payload: { error } });
          } else {
            messageCount++;
            send({ type: "run_completed", payload: snapshot({ status: "idle" }) });
          }
          break;
        }
      }
    });
  }

  // --- WebSocket → PI SDK ---
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
        const contextPrefix =
          serverState.currentDomain !== "all"
            ? `[Context: Search in the selected KB domain under agent-assets/kb/${serverState.currentDomain}/ unless user says otherwise.]\n`
            : "";
        try {
          await session.prompt(contextPrefix + msg.payload);
        } catch (err: any) {
          send({ type: "run_failed", payload: { error: err.message ?? String(err) } });
        }
        break;
      }

      case "abort":
        try {
          await session.abort();
        } catch (err: any) {
          send({ type: "error", payload: { error: err.message ?? String(err) } });
        }
        break;

      case "switch_kb":
        serverState.currentDomain = msg.payload.domain;
        console.log(`[ws] KB domain switched to: ${msg.payload.domain}`);
        break;

      case "switch_profile":
        serverState.currentProfilePath = msg.payload.profilePath;
        console.log(`[ws] Profile switched to: ${msg.payload.profilePath}`);
        break;

      case "new_session": {
        unsubscribe();
        const result = await createAltTheorySession({
          rootDir: TUI_DIR,
          kbDir: KB_DIR,
          readOnly: true,
        });
        session = result.session;
        messageCount = 0;
        unsubscribe = subscribeSession(session);
        send({ type: "session_opened", payload: snapshot() });
        console.log(`[ws] New session created: ${session.sessionId}`);
        break;
      }
    }
  });

  // --- Cleanup on disconnect ---
  ws.on("close", () => {
    unsubscribe();
    console.log("[ws] Client disconnected");
  });
});

// ---------------------------------------------------------------------------
// Start
// ---------------------------------------------------------------------------

server.listen(PORT, () => {
  console.log(`Alt Theory server running on http://localhost:${PORT}`);
  console.log(`  Static files: ${PUBLIC_DIR}`);
  console.log(`  KB dir:       ${KB_DIR}`);
});


