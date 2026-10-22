import { existsSync, readFileSync } from "fs";
import { join } from "path";
import { writeJsonAtomic } from "../core/data-dir.js";

export const THINKING_LEVELS = [
  "off",
  "minimal",
  "low",
  "medium",
  "high",
  "xhigh",
  "max",
] as const;

export interface SubagentPreset {
  id: string;
  description?: string;
  model: string;
  fallbackModels: string[];
}

export interface SubagentConfig {
  schemaVersion: 1;
  defaultAgent: string;
  agents: SubagentPreset[];
}

export const DEFAULT_SUBAGENT_CONFIG: SubagentConfig = {
  schemaVersion: 1,
  defaultAgent: "general-medium",
  agents: [
    {
      id: "general-medium",
      description: "The lead uses this agent to repeatedly assess and act under ambiguity while preserving all goals. For example, reassess the problem as new evidence arrives, then adjust the next action.",
      model: "inherit:medium",
      fallbackModels: [],
    },
    {
      id: "general-low",
      description:
        "The lead uses this agent to work against clear criteria or produce independent candidates. For example, text editing, source summaries, data updates, knowledge questions, and brainstorming.",
      model: "inherit:low",
      fallbackModels: [],
    },
    {
      id: "general-high",
      description:
        "The lead uses this agent for particularly difficult judgments. For example, complex architecture decisions, difficult root-cause analysis, and strategic planning.",
      model: "inherit:high",
      fallbackModels: [],
    },
  ],
};

export const BUILTIN_SUBAGENT_IDS = [
  "general-medium",
  "general-low",
  "general-high",
] as const;

const LEGACY_DESCRIPTIONS = new Map<string, string[]>([
  ["general-medium", [
    "Default for most work and whenever the right level is uncertain",
    "Most writing, implementation, and analysis; default when the appropriate level is unclear.",
    "Integrate user intent, arguments, evidence, and context to assess the problem and cycle between judgment and action under ambiguity.",
  ]],
  ["general-low", [
    "High-volume, error-tolerant extraction, web search, and simple checks with clear criteria",
    "Extraction, search, and checks against supplied criteria, including checklist reviews.",
    "Local processing and checks against clear criteria, such as text editing, source summaries, data updates, knowledge questions, and brainstorming.",
  ]],
  ["general-high", [
    "Review, strategic planning, and complex framework or architecture analysis with unknown unknowns",
    "Strategic planning, difficult root-cause analysis, and complex architecture decisions. Finding facts or checking supplied criteria belongs to general-low.",
  ]],
]);

export function subagentConfigPath(dataDir: string): string {
  return join(dataDir, "subagents.json");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function normalizeModelReference(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const ref = value.trim();
  if (!ref || /\s/.test(ref)) return null;
  if (ref === "inherit") return ref;
  if (ref.startsWith("inherit:")) {
    return THINKING_LEVELS.includes(
      ref.slice("inherit:".length) as (typeof THINKING_LEVELS)[number],
    )
      ? ref
      : null;
  }
  const slash = ref.indexOf("/");
  return slash > 0 && slash < ref.length - 1 ? ref : null;
}

function normalizeConfig(value: unknown): SubagentConfig | null {
  if (!isRecord(value) || value.schemaVersion !== 1 || !Array.isArray(value.agents)) {
    return null;
  }
  const agents: SubagentPreset[] = [];
  const ids = new Set<string>();
  for (const raw of value.agents) {
    if (!isRecord(raw)) return null;
    const id = typeof raw.id === "string" ? raw.id.trim() : "";
    const model = normalizeModelReference(raw.model);
    if (!/^[a-z0-9][a-z0-9_-]*$/.test(id) || ids.has(id) || !model) return null;
    const fallbackInput = raw.fallbackModels ?? [];
    if (!Array.isArray(fallbackInput)) return null;
    const fallbackModels = fallbackInput.map(normalizeModelReference);
    if (fallbackModels.some((entry) => !entry)) return null;
    const defaultDescription = DEFAULT_SUBAGENT_CONFIG.agents.find((agent) => agent.id === id)?.description;
    const description = (typeof raw.description === "string" ? raw.description.trim() : "") || defaultDescription;
    ids.add(id);
    agents.push({
      id,
      ...(description
        ? { description: LEGACY_DESCRIPTIONS.get(id)?.includes(description) ? defaultDescription : description }
        : {}),
      model,
      fallbackModels: fallbackModels as string[],
    });
  }
  if (BUILTIN_SUBAGENT_IDS.some((id) => !ids.has(id))) return null;
  const defaultAgent =
    typeof value.defaultAgent === "string" && ids.has(value.defaultAgent)
      ? value.defaultAgent
      : null;
  if (!defaultAgent) return null;
  return { schemaVersion: 1, defaultAgent, agents };
}

export function readSubagentConfig(dataDir: string): {
  config: SubagentConfig;
  warning: string | null;
} {
  const path = subagentConfigPath(dataDir);
  if (!existsSync(path)) {
    return { config: structuredClone(DEFAULT_SUBAGENT_CONFIG), warning: null };
  }
  try {
    const config = normalizeConfig(JSON.parse(readFileSync(path, "utf-8")));
    return config
      ? { config, warning: null }
      : {
          config: structuredClone(DEFAULT_SUBAGENT_CONFIG),
          warning: `Invalid subagent configuration at ${path}; using built-in general agents.`,
        };
  } catch (error) {
    return {
      config: structuredClone(DEFAULT_SUBAGENT_CONFIG),
      warning: `Could not read ${path}: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}

export function writeSubagentConfig(
  dataDir: string,
  value: unknown,
): SubagentConfig {
  const config = normalizeConfig(value);
  if (!config) throw new Error("Invalid subagent configuration");
  writeJsonAtomic(subagentConfigPath(dataDir), config);
  return config;
}

export function modelReferenceIdentity(reference: string): string {
  if (reference === "inherit" || reference.startsWith("inherit:")) return "inherit";
  const split = reference.lastIndexOf(":");
  return split > reference.indexOf("/") &&
    THINKING_LEVELS.includes(
      reference.slice(split + 1) as (typeof THINKING_LEVELS)[number],
    )
    ? reference.slice(0, split)
    : reference;
}

export function subagentModelCandidates(config: SubagentConfig): string[] {
  const candidates = new Set<string>(["inherit"]);
  for (const agent of config.agents) {
    for (const ref of [agent.model, ...agent.fallbackModels]) {
      candidates.add(modelReferenceIdentity(ref));
    }
  }
  return [...candidates];
}

export function formatSubagentConfigForPrompt(
  config: SubagentConfig,
  roleIds: string[] = [],
): string {
  const agents = config.agents.map((agent) => {
    const chain = [agent.model, ...agent.fallbackModels].join(" -> ");
    return `- ${agent.id}${agent.description ? `: ${agent.description}` : ""} [${chain}]`;
  });
  return [
    "Configured subagent types:",
    ...agents,
    `Default agent type when agent_type is omitted: ${config.defaultAgent}.`,
    `Model override candidates: ${subagentModelCandidates(config).join(", ")}.`,
    "Follow the user's custom subagent configuration first. Otherwise, use general-low, general-medium, and general-high as described above, preferring a lower configured tier that can reliably complete the whole task. Judge difficulty by the assessment–execution loop and drift risk, rather than by task domain or length.",
    "Prefer reusing an existing subagent for similar tasks over spawning another.",
    "Normally use the selected agent type's configured model chain. Use model overrides only when the user requests one; append :off|minimal|low|medium|high|xhigh|max to override thinking for this spawn.",
    `Available roles: ${roleIds.length ? roleIds.join(", ") : "(none)"}.`,
    "spawn_agent role names one of these; an unknown role fails and creates no child. Omit to inherit this conversation's role.",
  ].join("\n");
}
