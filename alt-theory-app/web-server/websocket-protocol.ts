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
  projectId: string | null;
  branchId?: string;
  status: "idle" | "running" | "error";
  visibility?: "research" | "private";
  currentDomain: string;
  rolePresetSlug: string | null;
  soulSlug: string | null;
  customInstructionRef?: string | null;
  mode?: "pure" | "full";
  openedFrom?: "new" | "existing";
  resumeWarnings?: string[];
  messageCount: number;
}

export interface SessionDraftSnapshot {
  status: "draft";
  projectId: string | null;
  visibility: "research" | "private";
  currentDomain: string;
  rolePresetSlug: string | null;
  soulSlug: string | null;
  customInstructionRef?: string | null;
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
  /** Pi entry id, for user messages. Used to identify a branch point. */
  entryId?: string | null;
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
  /** domain is a known KB domain, "all", or "none" to disable kb-folder retrieval. */
  | { type: "switch_kb"; payload: { domain: string } }
  | { type: "switch_role_preset"; payload: { rolePresetSlug: string | null } }
  | { type: "switch_soul"; payload: { soulSlug: string | null } }
  | {
      type: "switch_instruction";
      payload: { customInstructionRef: string | null };
    }
  | { type: "switch_project"; payload: { projectId: string | null } }
  | { type: "switch_visibility"; payload: { visibility: "research" | "private" } }
  | {
      type: "invoke_skill";
      payload: { skillName: string; userText?: string };
    }
  | { type: "revise_latest"; payload: { text: string } }
  | { type: "delete_latest" }
  | { type: "switch_mode"; payload: { mode: "pure" | "full" } }
  | {
      type: "fork_session";
      payload: {
        purpose: "collaboration" | "comparison";
        forkPointEntryId?: string;
      };
    }
  | { type: "new_session" }
  | { type: "open_session"; payload: { sessionId: string } }
  | { type: "get_session_metadata" }
  | { type: "get_session_metrics" };

// ---------------------------------------------------------------------------
// Server → Client
// ---------------------------------------------------------------------------

export type ServerMessage =
  | { type: "session_draft"; payload: SessionDraftSnapshot }
  | { type: "session_opened"; payload: SessionSnapshot }
  | { type: "session_updated"; payload: SessionSnapshot }
  | { type: "session_metadata"; payload: AssemblyManifest }
  | { type: "session_metrics"; payload: SessionMetrics }
  | { type: "session_transcript"; payload: { messages: TranscriptMessage[] } }
  | { type: "assistant_delta"; payload: { text: string } }
  | {
      type: "run_phase";
      payload: { phase: "connecting" | "thinking" | "idle" };
    }
  | { type: "tool_started"; payload: { toolName: string; callId: string; path?: string | null } }
  | { type: "tool_updated"; payload: { callId: string; text?: string; progress?: number } }
  | { type: "tool_finished"; payload: { callId: string; success: boolean; output?: unknown } }
  | { type: "run_completed"; payload: SessionSnapshot }
  | { type: "run_failed"; payload: { error: string } }
  | { type: "error"; payload: { error: string; code?: string } };
