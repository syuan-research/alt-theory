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
