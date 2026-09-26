import type { AgentSession } from "@earendil-works/pi-coding-agent";

/**
 * Resuming a turn on another model after the current one failed (the
 * subagent preset chain; a user's mid-run model switch).
 */

export function stripLastErrorAssistantMessage(session: AgentSession): void {
  // A session that auto-retried and still failed carries a CHAIN of trailing
  // errored assistant partials (kept in the file, so a reopen restores all of
  // them). Strip every one from live state: agent.continue() refuses an
  // assistant-last context. Since Pi 0.87 the request itself is built from
  // the session file, where pi-ai already skips errored/aborted assistants.
  let messages = session.messages;
  while (messages.length > 0) {
    const last = messages[messages.length - 1];
    if (!last || !("role" in last) || last.role !== "assistant") break;
    messages = messages.slice(0, -1);
  }
  if (messages !== session.messages) {
    session.state.messages = messages;
  }
}

export function continueAgentTurnAfterModelSwitch(
  session: AgentSession
): Promise<void> {
  stripLastErrorAssistantMessage(session);
  // session.agent and Agent.continue() are public Pi API — a rename in a Pi
  // upgrade must fail here at compile time, not at runtime.
  return new Promise((resolve, reject) => {
    setTimeout(() => {
      void session.agent.continue().then(resolve, reject);
    }, 0);
  });
}
