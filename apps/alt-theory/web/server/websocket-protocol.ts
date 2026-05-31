/**
 * Alt Theory WebSocket Protocol
 *
 * Shared type definitions for client ↔ server communication.
 */

// ---------------------------------------------------------------------------
// Session Snapshot
// ---------------------------------------------------------------------------

export interface SessionSnapshot {
  sessionId: string;
  status: "idle" | "running" | "error";
  currentDomain: string;
  profilePath?: string;
  messageCount: number;
}

// ---------------------------------------------------------------------------
// Client → Server
// ---------------------------------------------------------------------------

export type ClientMessage =
  | { type: "prompt"; payload: string }
  | { type: "abort" }
  | { type: "switch_kb"; payload: { domain: string } }
  | { type: "switch_profile"; payload: { profilePath: string } }
  | { type: "new_session" };

// ---------------------------------------------------------------------------
// Server → Client
// ---------------------------------------------------------------------------

export type ServerMessage =
  | { type: "session_opened"; payload: SessionSnapshot }
  | { type: "session_updated"; payload: SessionSnapshot }
  | { type: "assistant_delta"; payload: { text: string } }
  | { type: "tool_started"; payload: { toolName: string; callId: string } }
  | { type: "tool_updated"; payload: { callId: string; text?: string; progress?: number } }
  | { type: "tool_finished"; payload: { callId: string; success: boolean; output?: unknown } }
  | { type: "run_completed"; payload: SessionSnapshot }
  | { type: "run_failed"; payload: { error: string } }
  | { type: "error"; payload: { error: string } };
