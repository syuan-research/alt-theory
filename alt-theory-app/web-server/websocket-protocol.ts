/**
 * Alt Theory WebSocket Protocol
 *
 * The wire shapes live in ONE place: `frontend/src/api/types.ts`. This module
 * re-exports them for the backend, the same cross-tree direction
 * `web-server/i18n.ts` already uses for the message catalogs, so a message
 * added on one side cannot silently go missing on the other — the compiler
 * sees a single definition.
 */

export type {
  ClientMessage,
  ServerMessage,
  SessionSnapshot,
  SessionDraftSnapshot,
  SessionMetrics,
  TurnRecovery,
  TranscriptMessage,
} from "../frontend/src/api/types.js";

export type { ToolDetail, ToolDetailKind } from "./tool-detail.js";

import type { ServerMessage } from "../frontend/src/api/types.js";
import type { SessionServiceEvent } from "./session-service.js";

/** A SessionService event as the message every window of the conversation receives. */
export function toServerMessage(event: SessionServiceEvent): ServerMessage {
  switch (event.type) {
    case "snapshot":
      return { type: "session_updated", payload: event.payload };
    case "assistant_delta":
      return { type: "assistant_delta", payload: event.payload };
    case "thinking_delta":
      return { type: "thinking_delta", payload: event.payload };
    case "run_phase":
      return { type: "run_phase", payload: event.payload };
    case "tool_started":
      return { type: "tool_started", payload: event.payload };
    case "tool_updated":
      return { type: "tool_updated", payload: event.payload };
    case "tool_finished":
      return { type: "tool_finished", payload: event.payload };
    case "run_completed":
      return { type: "run_completed", payload: event.payload };
    case "session_updated":
      return { type: "session_updated", payload: event.payload };
    case "run_failed":
      return { type: "run_failed", payload: event.payload };
    case "user_steered":
      return { type: "user_steered", payload: event.payload };
    case "queue_updated":
      return { type: "queue_updated", payload: event.payload };
    case "session_transcript":
      return { type: "session_transcript", payload: event.payload };
    case "session_metrics":
      return { type: "session_metrics", payload: event.payload };
    case "approval_requested":
      return { type: "approval_requested", payload: event.payload };
    case "approval_resolved":
      return { type: "approval_resolved", payload: event.payload };
    case "extension_notice":
      return { type: "extension_notice", payload: event.payload };
    case "related_session_created":
      return { type: "related_session_created", payload: event.payload };
  }
}
