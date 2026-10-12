/**
 * Agent-team mail (v1.3.0-alpha.5 M2).
 *
 * One durable JSONL inbox per session at recordsDir/agent-mail.jsonl.
 * Envelopes carry parent<->child messages and child lifecycle events; the
 * inbox is the source of truth that survives a closed receiver, so a wake
 * that cannot be delivered now is delivered on next open instead of lost
 * (design record 2026-07-28-decision-v1.3-agent-team.md).
 *
 * Single-process ownership: SessionService is the only writer, so
 * read-modify-write on delivery is safe without locking.
 */

import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "fs";
import { randomUUID } from "crypto";
import { dirname, join } from "path";
import type { InterruptionCause } from "./run-records.js";
import { frameAgentMail } from "../core/agent-mail-frame.js";

export interface AgentMailEnvelope {
  at: string;
  /** Sender: a sessionId, or "user" for rail-composer originated notes. */
  from: string;
  /** Receiver sessionId (owner of the inbox file this lives in). */
  to: string;
  kind: "message" | "lifecycle";
  event?:
    | "spawned"
    | "completed"
    | "failed"
    | "interrupted"
    | "input-requested"
    /** A message to this conversation could not be sent (approval timed out). */
    | "undelivered";
  /** Why an interrupted child stopped (card 8); absent for other events. */
  cause?: InterruptionCause | null;
  body: string;
  delivered: boolean;
  /**
   * Sent by another conversation rather than a lead or own subagent
   * (owner 2026-10-12). Peer mail counts against the pair's allowance and
   * never makes its sender a subagent's lead. Absent on older mail, which
   * only leads and subagents could send.
   */
  peer?: boolean;
}


const MAIL_FILE = "agent-mail.jsonl";

function mailPath(recordsDir: string): string {
  return join(recordsDir, MAIL_FILE);
}

export function readAgentMail(recordsDir: string): AgentMailEnvelope[] {
  const path = mailPath(recordsDir);
  if (!existsSync(path)) return [];
  return readFileSync(path, "utf-8")
    .split("\n")
    .filter((line) => line.trim())
    .flatMap((line) => {
      try {
        const value = JSON.parse(line) as AgentMailEnvelope;
        return typeof value?.body === "string" ? [value] : [];
      } catch {
        return [];
      }
    });
}

export function appendAgentMail(
  recordsDir: string,
  envelope: AgentMailEnvelope,
): void {
  writeFileSync(mailPath(recordsDir), `${JSON.stringify(envelope)}\n`, {
    flag: "a",
  });
}

export function undeliveredAgentMail(recordsDir: string): AgentMailEnvelope[] {
  return readAgentMail(recordsDir).filter((envelope) => !envelope.delivered);
}

/** Mark every currently-undelivered envelope as delivered. */
export function markAgentMailDelivered(recordsDir: string): void {
  const all = readAgentMail(recordsDir);
  if (!all.some((envelope) => !envelope.delivered)) return;
  // Temp + rename (the writeJsonAtomic pattern in core/data-dir.ts): a crash
  // mid-rewrite must leave the previous inbox intact, not a truncated file —
  // the inbox is the source of truth for undelivered wakes.
  const path = mailPath(recordsDir);
  const tempPath = `${path}.${randomUUID()}.tmp`;
  mkdirSync(dirname(path), { recursive: true });
  try {
    writeFileSync(
      tempPath,
      `${all
        .map((envelope) => JSON.stringify({ ...envelope, delivered: true }))
        .join("\n")}\n`,
      "utf-8",
    );
    renameSync(tempPath, path);
  } finally {
    rmSync(tempPath, { force: true });
  }
}

/** An envelope as the framed fragment its receiver's model sees (core/agent-mail-frame.ts). */
export function formatEnvelopeForContext(
  envelope: AgentMailEnvelope,
  fromLabel: string,
): string {
  return frameAgentMail({
    fromLabel,
    event: envelope.event,
    cause: envelope.cause,
    peer: envelope.peer,
    body: envelope.body,
  });
}
