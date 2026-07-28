/**
 * Turn-continuity context sanitation (alpha.5 M0).
 *
 * Pi keeps errored/aborted assistant messages in session history ("keep in
 * session for history", agent-session _prepareRetry), and Alt's break-point
 * retry/continue paths deliberately preserve a failed turn's completed work
 * in context. A partial assistant message can carry `toolCall` blocks that
 * were never executed — providers reject a `tool_use` with no matching
 * `tool_result` — so before each LLM call we drop tool calls that have no
 * result anywhere in the outgoing context, and drop assistant messages left
 * with no content at all.
 */

import type { AgentMessage } from "@earendil-works/pi-agent-core";
import type { ExtensionFactory } from "@earendil-works/pi-coding-agent";

export function sanitizeOrphanedToolCalls(
  messages: AgentMessage[],
): AgentMessage[] {
  const resultIds = new Set<string>();
  for (const message of messages) {
    if ("role" in message && message.role === "toolResult") {
      resultIds.add(message.toolCallId);
    }
  }
  let changed = false;
  const sanitized: AgentMessage[] = [];
  for (const message of messages) {
    if (!("role" in message) || message.role !== "assistant") {
      sanitized.push(message);
      continue;
    }
    const content = message.content.filter(
      (block) => block.type !== "toolCall" || resultIds.has(block.id),
    );
    if (content.length === message.content.length) {
      sanitized.push(message);
      continue;
    }
    changed = true;
    if (content.length > 0) {
      sanitized.push({ ...message, content });
    }
  }
  return changed ? sanitized : messages;
}

export function createTurnContinuityExtension(): ExtensionFactory {
  return (pi) => {
    pi.on("context", (event) => ({
      messages: sanitizeOrphanedToolCalls(event.messages),
    }));
  };
}
