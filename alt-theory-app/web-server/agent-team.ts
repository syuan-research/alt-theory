/**
 * Agent team: model-facing tool surface (v1.3.0-alpha.5 M2).
 *
 * The lead conversation gets spawn/send/check/wait/interrupt/list tools;
 * subagent children get message_parent. Everything the tools DO lives in
 * SessionService behind the narrow AgentTeamBridge — this module owns only
 * the contract the model sees (design record
 * development/compound/2026-07-28-decision-v1.3-agent-team.md).
 *
 * Children are real Alt sessions (forkedFrom purpose "subagent"): durable,
 * inspectable in the right rail, user-messageable, promotable. Depth is 1:
 * subagents get no spawn tool.
 */

import { Type } from "typebox";
import type { ToolDefinition } from "@earendil-works/pi-coding-agent";
import type { AltMode } from "../core/alt-theory-core.js";

// ---------------------------------------------------------------------------
// Bridge — implemented by SessionService
// ---------------------------------------------------------------------------

export interface SpawnSubagentOptions {
  task: string;
  name?: string;
  context?: string;
  mode?: "understand" | "work";
  modelTier?: "lower" | "same" | "higher";
  /** true = caller blocks for the result, so no completion mail is sent. */
  wait?: boolean;
}

export interface AgentTeamBridge {
  spawnSubagent(
    parentSessionId: string,
    options: SpawnSubagentOptions,
  ): Promise<{ report: string; sessionId: string }>;
  /** Block until the subagent's current/queued first run settles; return its final answer. */
  waitForSubagentResult(parentSessionId: string, agent: string): Promise<string>;
  sendToSubagent(
    parentSessionId: string,
    agent: string,
    message: string,
    startTurn: boolean,
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
 * A child's Alt mode is clamped to the parent's (spec: an Understand
 * parent spawns only Understand children; a Work parent defaults to
 * Understand unless the task needs file work).
 */
export function clampSubagentMode(
  parentMode: AltMode,
  requested: "understand" | "work" | undefined,
): AltMode {
  if (parentMode === "understand") return "understand";
  return requested === "work" ? "work" : "understand";
}

export interface TierCandidate {
  provider: string;
  id: string;
  cost?: { input?: number; output?: number } | null;
}

function tierPrice(model: TierCandidate): number | null {
  const input = model.cost?.input;
  const output = model.cost?.output;
  if (typeof input !== "number" && typeof output !== "number") return null;
  return (input ?? 0) + (output ?? 0);
}

/**
 * Resolve a relative model tier against the models that are configured AND
 * usable right now. "lower"/"higher" pick the nearest cheaper/pricier model
 * by cost metadata; no priced candidate on the requested side -> null
 * (caller falls back to "same" and says so in the spawn report).
 */
export function resolveModelTier(
  available: readonly TierCandidate[],
  current: { provider: string; id: string },
  tier: "lower" | "same" | "higher",
): TierCandidate | null {
  if (tier === "same") return null;
  const currentModel = available.find(
    (model) => model.provider === current.provider && model.id === current.id,
  );
  const currentPrice = currentModel ? tierPrice(currentModel) : null;
  if (currentPrice === null) return null;
  const priced = available
    .map((model) => ({ model, price: tierPrice(model) }))
    .filter(
      (entry): entry is { model: TierCandidate; price: number } =>
        entry.price !== null &&
        !(entry.model.provider === current.provider && entry.model.id === current.id),
    );
  const side =
    tier === "lower"
      ? priced.filter((entry) => entry.price < currentPrice)
      : priced.filter((entry) => entry.price > currentPrice);
  if (side.length === 0) return null;
  side.sort((a, b) =>
    tier === "lower" ? b.price - a.price : a.price - b.price,
  );
  return side[0].model;
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
].join("\n");

export const SUBAGENT_PROMPT_SECTION = [
  "## Subagent Role",
  "This conversation was spawned by a lead conversation to complete one bounded task (your first message). Work autonomously; the user can watch and join at any time.",
  "- Use message_parent to report a blocker or an important interim update; do not use it for routine narration.",
  "- Your final answer is reported back to the lead conversation automatically — end with a clear, self-contained result.",
].join("\n");

// ---------------------------------------------------------------------------
// Tool definitions
// ---------------------------------------------------------------------------

const text = (value: string) => ({
  content: [{ type: "text" as const, text: value }],
  details: undefined,
});

const spawnSchema = Type.Object({
  task: Type.String({
    description:
      "The bounded task for the subagent. Self-contained: the subagent does not see this conversation.",
  }),
  name: Type.Optional(
    Type.String({ description: "Short display name for the subagent (shown to the user)" }),
  ),
  context: Type.Optional(
    Type.String({
      description: "Context packet the subagent needs (facts, file paths, constraints)",
    }),
  ),
  mode: Type.Optional(
    Type.Union([Type.Literal("understand"), Type.Literal("work")], {
      description:
        "Subagent Alt mode. Clamped to this conversation's mode; default Understand.",
    }),
  ),
  model_tier: Type.Optional(
    Type.Union(
      [Type.Literal("lower"), Type.Literal("same"), Type.Literal("higher")],
      {
        description:
          "Relative model strength for the subagent, resolved against usable configured models. Default same.",
      },
    ),
  ),
  wait: Type.Optional(
    Type.Boolean({
      description:
        "true = block until the subagent finishes and return its answer. Default false (background).",
    }),
  ),
});

const agentRef = Type.String({
  description: "Subagent reference: the name or sessionId from spawn_agent/list_agents",
});

export function createAgentTeamTools(
  bridge: AgentTeamBridge,
  sessionId: string,
  role: "lead" | "subagent",
): ToolDefinition<any, any>[] {
  if (role === "subagent") {
    const messageParentSchema = Type.Object({
      message: Type.String({ description: "The message for the lead conversation" }),
      kind: Type.Optional(
        Type.Union([Type.Literal("update"), Type.Literal("blocker")], {
          description:
            "update = interim progress worth relaying; blocker = you need input or a dependency to continue",
        }),
      ),
    });
    const messageParent: ToolDefinition<typeof messageParentSchema, undefined> = {
      name: "message_parent",
      label: "Message lead conversation",
      description:
        "Send a message to the lead conversation that spawned this subagent. Use kind=blocker when you cannot continue without input.",
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
    return [messageParent];
  }

  const spawnAgent: ToolDefinition<typeof spawnSchema, undefined> = {
    name: "spawn_agent",
    label: "Spawn subagent",
    description:
      "Delegate a bounded task to a background subagent (a real conversation the user can watch and join). Returns the subagent's name and status; its completion arrives in this conversation automatically. Use wait:true only for quick lookups you need before continuing.",
    parameters: spawnSchema,
    async execute(_id, params) {
      const spawned = await bridge.spawnSubagent(sessionId, {
        task: params.task,
        name: params.name,
        context: params.context,
        mode: params.mode,
        modelTier: params.model_tier,
        wait: params.wait ?? false,
      });
      if (!params.wait) return text(spawned.report);
      return text(await bridge.waitForSubagentResult(sessionId, spawned.sessionId));
    },
  };

  const sendSchema = Type.Object({
    agent: agentRef,
    message: Type.String({ description: "The message for the subagent" }),
    start_turn: Type.Optional(
      Type.Boolean({
        description:
          "true = make an idle subagent act on this message now. Default false: a running subagent sees it at its next step; an idle subagent sees it with its next turn.",
      }),
    ),
  });
  const sendToAgent: ToolDefinition<typeof sendSchema, undefined> = {
    name: "send_to_agent",
    label: "Message subagent",
    description:
      "Send a message to a subagent — steer a running subagent, or (with start_turn) wake an idle one.",
    parameters: sendSchema,
    async execute(_id, params) {
      return text(
        await bridge.sendToSubagent(
          sessionId,
          params.agent,
          params.message,
          params.start_turn ?? false,
        ),
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
    async execute(_id, params) {
      const timeout = Math.min(Math.max(params.timeout_s ?? 60, 1), 600);
      return text(
        await bridge.waitForSubagents(sessionId, params.agents ?? null, timeout),
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

  return [
    spawnAgent,
    sendToAgent,
    checkAgent,
    waitForAgents,
    interruptAgent,
    listAgents,
  ];
}
