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
      description: "Default for most work and whenever the right level is uncertain",
      model: "inherit:medium",
      fallbackModels: [],
    },
    {
      id: "general-low",
      description:
        "High-volume, error-tolerant extraction, web search, and simple checks with clear criteria",
      model: "inherit:low",
      fallbackModels: [],
    },
    {
      id: "general-high",
      description:
        "Review, strategic planning, and complex framework or architecture analysis with unknown unknowns",
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
    ids.add(id);
    agents.push({
      id,
      ...(typeof raw.description === "string" && raw.description.trim()
        ? { description: raw.description.trim() }
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
    "Use general-low for high-volume, error-tolerant extraction, web search, and simple checks with clear criteria. Use general-medium for most other work and whenever uncertain. Use general-high for review, strategic planning, and complex framework or architecture analysis with interdependent internals or unknown unknowns.",
    "Normally use the selected agent type's configured model chain. Use model overrides only when the user requests one; append :off|minimal|low|medium|high|xhigh|max to override thinking for this spawn.",
    `Available roles: ${roleIds.length ? roleIds.join(", ") : "(none)"}.`,
    "spawn_agent role names one of these; an unknown role fails and creates no child. Omit to inherit this conversation's role.",
  ].join("\n");
}
