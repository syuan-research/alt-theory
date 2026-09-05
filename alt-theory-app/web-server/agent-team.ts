/**
 * Agent team: model-facing tool surface (v1.3.0-alpha.5 M2).
 *
 * Every ordinary agent conversation gets spawn/send/check/wait/interrupt/list;
 * spawned children also get message_parent. Everything the tools DO lives in
 * SessionService behind the narrow AgentTeamBridge — this module owns only
 * the contract the model sees (design record
 * development/compound/2026-07-28-decision-v1.3-agent-team.md).
 *
 * Children are real Alt sessions (forkedFrom purpose "subagent"): durable,
 * inspectable in the right rail, user-messageable, promotable, and able to
 * delegate another level.
 */

import { Type } from "typebox";
import type { ToolDefinition } from "@earendil-works/pi-coding-agent";
import type { AltMode } from "../core/alt-theory-core.js";

// ---------------------------------------------------------------------------
// Bridge — implemented by SessionService
// ---------------------------------------------------------------------------

export interface SpawnSubagentOptions {
  message: string;
  name?: string;
  agentType?: string;
  /** Existing role id (role-preset slug). Omit to inherit the parent's role. */
  role?: string;
  model?: string;
  mode?: "understand" | "work";
}

export interface AgentTeamBridge {
  spawnSubagent(
    parentSessionId: string,
    options: SpawnSubagentOptions,
  ): Promise<{ report: string; sessionId: string }>;
  sendToSubagent(
    parentSessionId: string,
    agent: string,
    message: string,
  ): Promise<string>;
  checkSubagent(
    parentSessionId: string,
    agent: string,
    verbose: boolean,
  ): Promise<string>;
  waitForSubagents(
    parentSessionId: string,
    agents: string[] | null,
    timeoutS: number,
    signal?: AbortSignal,
  ): Promise<string>;
  interruptSubagent(parentSessionId: string, agent: string): Promise<string>;
  listSubagents(parentSessionId: string): Promise<string>;
  messageParent(
    childSessionId: string,
    message: string,
    kind: "update" | "blocker",
  ): Promise<string>;
}

// ---------------------------------------------------------------------------
// Stateless helpers
// ---------------------------------------------------------------------------

/**
 * A child's Alt mode INHERITS the parent's and is clamped to it (owner
 * 2026-08-07: an Understand parent spawns only Understand children; a
 * Work parent's children are Work unless the spawn asks for less —
 * predictable inheritance over per-spawn model discretion).
 */
export function clampSubagentMode(
  parentMode: AltMode,
  requested: "understand" | "work" | undefined,
): AltMode {
  if (parentMode === "understand") return "understand";
  return requested === "understand" ? "understand" : "work";
}

// ---------------------------------------------------------------------------
// System-prompt sections
// ---------------------------------------------------------------------------

export const LEAD_DELEGATION_PROMPT_SECTION = [
  "## Delegation",
  "You can delegate bounded tasks to subagents with the spawn_agent tool. Subagents run in the background by default while you keep working; each subagent is a real conversation the user can watch and join from the right rail, so write subagent tasks as if the user may read them.",
  "Rules:",
  "- A subagent sees only the task and context you pass it, not this conversation.",
  "- Never state or assume a pending subagent's result; wait for its completion notification, or use check_agent / wait_for_agents. Use wait sparingly — prefer continuing your own work.",
  "- Subagents sharing your workspace can collide on files; partition file work explicitly in each task.",
  "- Message a running subagent with send_to_agent; stop one with interrupt_agent. A subagent's completion, failure, and messages arrive in this conversation automatically.",
  "- The user can also open a subagent's conversation and talk to it directly, without you. Do not assume you must relay everything, and do not be surprised when a subagent already knows something the user told it.",
].join("\n");

export const SUBAGENT_PROMPT_SECTION = [
  "## Subagent Role",
  "This conversation was spawned by a lead conversation to complete one bounded task (your first message). Work autonomously; the user can watch and join at any time.",
  "- Use message_parent to report a blocker or an important interim update; do not use it for routine narration.",
  "- You are a full agent conversation: when the work reveals independent follow-up tracks, you may delegate them with spawn_agent.",
  "- Your final answer is reported back to the lead conversation automatically — end with a clear, self-contained result.",
].join("\n");

// ---------------------------------------------------------------------------
// Tool definitions
// ---------------------------------------------------------------------------

const text = (value: string) => ({
  content: [{ type: "text" as const, text: value }],
  details: undefined,
});

function spawnSchema(availableRoles: string[]) {
  const roleList = availableRoles.length
    ? availableRoles.join(", ")
    : "(none installed)";
  return Type.Object({
    message: Type.String({
      description:
        "The complete bounded task packet for the subagent: instructions, facts, paths, and constraints. The subagent does not see this conversation.",
    }),
    name: Type.Optional(
      Type.String({ description: "Short display name for the subagent (shown to the user)" }),
    ),
    agent_type: Type.Optional(
      Type.String({
        description:
          "Configured subagent type from the Delegation section. Defaults to general-medium when omitted.",
      }),
    ),
    role: Type.Optional(
      Type.String({
        description:
          `Existing role id. Available: ${roleList}. Unknown id fails the spawn; no child is created. Omit to inherit this conversation's role.`,
      }),
    ),
    model: Type.Optional(
      Type.String({
        description:
          "Exact user-requested model override from the configured candidate list, in provider/model[:thinking] format. Normally omit this and use the agent type's model chain.",
      }),
    ),
    mode: Type.Optional(
      Type.Union([Type.Literal("understand"), Type.Literal("work")], {
        description:
          "Subagent Alt mode. Defaults to this conversation's mode (inherited); pass 'understand' to spawn a read-only child from a Work conversation. Never exceeds this conversation's mode.",
      }),
    ),
  });
}

const agentRef = Type.String({
  description: "Subagent reference: the name or sessionId from spawn_agent/list_agents",
});

export function createAgentTeamTools(
  bridge: AgentTeamBridge,
  sessionId: string,
  role: "lead" | "subagent",
  availableRoles: string[] = [],
): ToolDefinition<any, any>[] {
  const parameters = spawnSchema(availableRoles);
  const spawnAgent: ToolDefinition<typeof parameters, undefined> = {
    name: "spawn_agent",
    label: "Spawn subagent",
    description:
      "Delegate a bounded task to a background subagent (a real conversation the user can watch and join). Returns the subagent's name and status; its completion arrives in this conversation automatically.",
    parameters,
    async execute(_id, params) {
      const spawned = await bridge.spawnSubagent(sessionId, {
        message: params.message,
        name: params.name,
        agentType: params.agent_type,
        role: params.role,
        model: params.model,
        mode: params.mode,
      });
      return text(spawned.report);
    },
  };

  const sendSchema = Type.Object({
    agent: agentRef,
    message: Type.String({ description: "The message for the subagent" }),
  });
  const sendToAgent: ToolDefinition<typeof sendSchema, undefined> = {
    name: "send_to_agent",
    label: "Message subagent",
    description:
      "Send a message to a subagent. A running subagent sees it at its next step; an idle subagent starts acting on it immediately.",
    parameters: sendSchema,
    async execute(_id, params) {
      return text(
        await bridge.sendToSubagent(sessionId, params.agent, params.message),
      );
    },
  };

  const checkSchema = Type.Object({
    agent: agentRef,
    verbose: Type.Optional(
      Type.Boolean({
        description: "true = include the subagent's recent transcript tail",
      }),
    ),
  });
  const checkAgent: ToolDefinition<typeof checkSchema, undefined> = {
    name: "check_agent",
    label: "Check subagent",
    description:
      "Get a subagent's status and last output without interrupting it.",
    parameters: checkSchema,
    async execute(_id, params) {
      return text(
        await bridge.checkSubagent(sessionId, params.agent, params.verbose ?? false),
      );
    },
  };

  const waitSchema = Type.Object({
    agents: Type.Optional(
      Type.Array(agentRef, {
        description: "Subagents to wait for; omit for all running subagents",
      }),
    ),
    timeout_s: Type.Optional(
      Type.Number({ description: "Max seconds to wait (default 60, max 600)" }),
    ),
  });
  const waitForAgents: ToolDefinition<typeof waitSchema, undefined> = {
    name: "wait_for_agents",
    label: "Wait for subagents",
    description:
      "Block until a watched subagent finishes its turn or the timeout passes; returns each watched subagent's status. Use sparingly — prefer continuing your own work and letting completions arrive.",
    parameters: waitSchema,
    async execute(_id, params, signal) {
      const timeout = Math.min(Math.max(params.timeout_s ?? 60, 1), 600);
      return text(
        await bridge.waitForSubagents(
          sessionId,
          params.agents ?? null,
          timeout,
          signal,
        ),
      );
    },
  };

  const interruptSchema = Type.Object({ agent: agentRef });
  const interruptAgent: ToolDefinition<typeof interruptSchema, undefined> = {
    name: "interrupt_agent",
    label: "Interrupt subagent",
    description:
      "Stop a subagent's current turn. Its completed work is kept; it stays messageable and can continue from the break point.",
    parameters: interruptSchema,
    async execute(_id, params) {
      return text(await bridge.interruptSubagent(sessionId, params.agent));
    },
  };

  const listSchema = Type.Object({});
  const listAgents: ToolDefinition<typeof listSchema, undefined> = {
    name: "list_agents",
    label: "List subagents",
    description: "List this conversation's subagents with their status.",
    parameters: listSchema,
    async execute() {
      return text(await bridge.listSubagents(sessionId));
    },
  };

  const messageParentSchema = Type.Object({
    message: Type.String({ description: "The message for the parent conversation" }),
    kind: Type.Optional(
      Type.Union([Type.Literal("update"), Type.Literal("blocker")], {
        description:
          "update = interim progress worth relaying; blocker = you need input or a dependency to continue",
      }),
    ),
  });
  const messageParent: ToolDefinition<typeof messageParentSchema, undefined> = {
    name: "message_parent",
    label: "Message parent conversation",
    description:
      "Send a message to the conversation that spawned this agent. Use kind=blocker when you cannot continue without input.",
    parameters: messageParentSchema,
    async execute(_id, params) {
      return text(
        await bridge.messageParent(
          sessionId,
          params.message,
          params.kind ?? "update",
        ),
      );
    },
  };

  return [
    spawnAgent,
    sendToAgent,
    checkAgent,
    waitForAgents,
    interruptAgent,
    listAgents,
    ...(role === "subagent" ? [messageParent] : []),
  ];
}
