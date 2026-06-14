/**
 * Alt Theory WebSocket Protocol
 *
 * Shared type definitions for client ↔ server communication.
 */

import type { AssemblyManifest } from "../core/alt-theory-core.js";

// ---------------------------------------------------------------------------
// Session Snapshot
// ---------------------------------------------------------------------------

export interface SessionSnapshot {
  sessionId: string;
  status: "idle" | "running" | "error";
  currentDomain: string;
  rolePresetSlug: string | null;
  /** Deprecated compatibility field; use rolePresetSlug. */
  profileSlug?: string | null;
  soulSlug: string | null;
  openedFrom?: "new" | "existing";
  resumeWarnings?: string[];
  messageCount: number;
}

export interface SessionMetrics {
  turnCount: number;
  toolCallCount: number;
  messageCount: number;
  tokens: {
    input: number;
    output: number;
    cacheRead: number;
    cacheWrite: number;
    total: number;
  };
  cost: number;
  contextUsage: {
    tokens: number | null;
    contextWindow: number;
    percent: number | null;
  } | null;
}

export interface TranscriptMessage {
  role: "user" | "assistant" | "system" | "tool" | "other";
  text: string;
  timestamp: string | null;
  thinking?: string;
  toolType?: "call" | "result";
  toolCallId?: string;
  toolName?: string;
  toolPath?: string | null;
  success?: boolean;
  truncated?: boolean;
}

// ---------------------------------------------------------------------------
// Client → Server
// ---------------------------------------------------------------------------

export type ClientMessage =
  | { type: "prompt"; payload: string }
  | { type: "abort" }
  | { type: "switch_kb"; payload: { domain: string } }
  | { type: "switch_role_preset"; payload: { rolePresetSlug: string | null } }
  | { type: "switch_profile"; payload: { profileSlug: string | null } }
  | { type: "switch_soul"; payload: { soulSlug: string | null } }
  | { type: "new_session" }
  | { type: "open_session"; payload: { sessionId: string } }
  | { type: "get_session_metadata" }
  | { type: "get_session_metrics" };

// ---------------------------------------------------------------------------
// Server → Client
// ---------------------------------------------------------------------------

export type ServerMessage =
  | { type: "session_opened"; payload: SessionSnapshot }
  | { type: "session_updated"; payload: SessionSnapshot }
  | { type: "session_metadata"; payload: AssemblyManifest }
  | { type: "session_metrics"; payload: SessionMetrics }
  | { type: "session_transcript"; payload: { messages: TranscriptMessage[] } }
  | { type: "assistant_delta"; payload: { text: string } }
  | { type: "tool_started"; payload: { toolName: string; callId: string; path?: string | null } }
  | { type: "tool_updated"; payload: { callId: string; text?: string; progress?: number } }
  | { type: "tool_finished"; payload: { callId: string; success: boolean; output?: unknown } }
  | { type: "run_completed"; payload: SessionSnapshot }
  | { type: "run_failed"; payload: { error: string } }
  | { type: "error"; payload: { error: string } };
