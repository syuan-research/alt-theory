import { randomUUID } from "crypto";
import { appendFileSync, mkdirSync } from "fs";
import { join, resolve } from "path";

export type SessionEventType =
  | "session_created"
  | "session_opened_existing"
  | "session_resumed"
  | "resume_warning"
  | "kb_selected"
  | "role_preset_selected"
  | "role_preset_selected_next_session"
  | "profile_selected_next_session"
  | "soul_selected"
  | "skill_invoked"
  | "session_forked"
  | "latest_turn_deleted"
  | "run_completed"
  | "run_failed"
  | "run_aborted";

export interface SessionEventInput {
  sessionId: string;
  type: SessionEventType;
  details?: Record<string, boolean | number | string | null>;
}

export interface SessionEvent extends SessionEventInput {
  eventId: string;
  timestamp: string;
}

export function appendSessionEvent(
  recordsDir: string,
  input: SessionEventInput
): SessionEvent {
  const resolvedRecordsDir = resolve(recordsDir);
  const event: SessionEvent = {
    eventId: randomUUID(),
    timestamp: new Date().toISOString(),
    ...input,
  };

  mkdirSync(resolvedRecordsDir, { recursive: true });
  appendFileSync(
    join(resolvedRecordsDir, "session-events.jsonl"),
    `${JSON.stringify(event)}\n`,
    "utf-8"
  );
  return event;
}
