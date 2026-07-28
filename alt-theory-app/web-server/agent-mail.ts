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

import { existsSync, readFileSync, writeFileSync } from "fs";
import { join } from "path";

export interface AgentMailEnvelope {
  at: string;
  /** Sender: a sessionId, or "user" for rail-composer originated notes. */
  from: string;
  /** Receiver sessionId (owner of the inbox file this lives in). */
  to: string;
  kind: "message" | "lifecycle";
  event?: "spawned" | "completed" | "failed" | "interrupted" | "input-requested";
  body: string;
  delivered: boolean;
}

/** Tag wrapping envelope text injected into a receiver's LLM context. */
export const AGENT_MAIL_TAG = "agent-team-mail";

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
  writeFileSync(
    mailPath(recordsDir),
    `${all
      .map((envelope) => JSON.stringify({ ...envelope, delivered: true }))
      .join("\n")}\n`,
    "utf-8",
  );
}

/**
 * Render an envelope as the tagged user-role fragment the receiver's model
 * sees (Codex-style `<subagent_notification>` pattern). The transcript
 * builder detects the tag and renders a system line instead of a user bubble.
 */
export function formatEnvelopeForContext(
  envelope: AgentMailEnvelope,
  fromLabel: string,
): string {
  const header = envelope.event
    ? `from="${fromLabel}" event="${envelope.event}"`
    : `from="${fromLabel}"`;
  return `<${AGENT_MAIL_TAG} ${header}>\n${envelope.body}\n</${AGENT_MAIL_TAG}>`;
}

/** Extract display text from a tagged fragment; null when text is not one. */
export function parseAgentMailFragment(
  text: string,
): { fromLabel: string; event: string | null; body: string } | null {
  const match = text.match(
    new RegExp(
      `^<${AGENT_MAIL_TAG} from="([^"]*)"(?: event="([^"]*)")?>\\n([\\s\\S]*)\\n</${AGENT_MAIL_TAG}>$`,
    ),
  );
  if (!match) return null;
  return { fromLabel: match[1], event: match[2] ?? null, body: match[3] };
}
