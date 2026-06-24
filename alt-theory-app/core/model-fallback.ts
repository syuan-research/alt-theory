import { existsSync, mkdirSync, readFileSync } from "fs";
import { dirname, join, resolve } from "path";
import type { AgentSession } from "@mariozechner/pi-coding-agent";
import { writeJsonAtomic } from "./data-dir.js";

export type FallbackAction = "fail" | "ignore" | "exclude_and_fallback";

export interface ModelFallbackRule {
  id: string;
  action: FallbackAction;
  match: {
    anyPattern: string[];
  };
}

export interface ModelFallbackConfig {
  enabled: boolean;
  provider: string;
  chain: string[];
  maxFallbacksPerRun: number;
  rules: ModelFallbackRule[];
}

export interface FallbackDecision {
  action: FallbackAction;
  ruleId?: string;
}

export interface ExcludedModelRecord {
  excludedAt: string;
  ruleId: string;
  lastError: string;
}

export interface ModelFallbackState {
  excluded: Record<string, ExcludedModelRecord>;
}

export interface ModelRef {
  provider: string;
  modelId: string;
}

const DEFAULT_RULES: ModelFallbackRule[] = [
  {
    id: "auth-failure",
    action: "fail",
    match: {
      anyPattern: [
        "401",
        "invalid api key",
        "incorrect api key",
        "authentication",
        "unauthorized",
      ],
    },
  },
  {
    id: "dashscope-allocation-quota",
    action: "exclude_and_fallback",
    match: {
      anyPattern: [
        "allocationquota",
        "free quota",
        "free tier",
        "free tier of the model",
        "quota has been exhausted",
        "quota exhausted",
        "tier exhausted",
        "insufficient quota",
      ],
    },
  },
];

function modelKey(provider: string, modelId: string): string {
  return `${provider}/${modelId}`;
}

function normalizeError(error: string): string {
  return error.trim().toLowerCase();
}

function matchesAnyPattern(error: string, patterns: string[]): boolean {
  const normalized = normalizeError(error);
  return patterns.some((pattern) => normalized.includes(pattern.toLowerCase()));
}

export function classifyModelError(
  error: string,
  rules: ModelFallbackRule[] = DEFAULT_RULES
): FallbackDecision {
  for (const rule of rules) {
    if (matchesAnyPattern(error, rule.match.anyPattern)) {
      return { action: rule.action, ruleId: rule.id };
    }
  }
  return { action: "ignore" };
}

export function loadModelFallbackConfig(path: string): ModelFallbackConfig | null {
  const resolved = resolve(path);
  if (!existsSync(resolved)) {
    return null;
  }
  const parsed = JSON.parse(readFileSync(resolved, "utf-8")) as ModelFallbackConfig;
  if (!parsed.rules?.length) {
    parsed.rules = DEFAULT_RULES;
  }
  return parsed;
}

export function loadModelFallbackState(statePath: string): ModelFallbackState {
  const resolved = resolve(statePath);
  if (!existsSync(resolved)) {
    return { excluded: {} };
  }
  const parsed = JSON.parse(readFileSync(resolved, "utf-8")) as ModelFallbackState;
  return {
    excluded: parsed.excluded ?? {},
  };
}

export function saveModelFallbackState(
  statePath: string,
  state: ModelFallbackState
): void {
  const resolved = resolve(statePath);
  mkdirSync(dirname(resolved), { recursive: true });
  writeJsonAtomic(resolved, state);
}

function trySaveModelFallbackState(
  statePath: string,
  state: ModelFallbackState
): void {
  try {
    saveModelFallbackState(statePath, state);
  } catch (error) {
    console.error(
      `[model-fallback] failed to persist exclusion state at ${statePath}:`,
      error instanceof Error ? error.message : String(error)
    );
  }
}

export class ModelFallbackCoordinator {
  private state: ModelFallbackState;

  constructor(
    private readonly config: ModelFallbackConfig,
    private readonly statePath: string
  ) {
    this.state = loadModelFallbackState(statePath);
  }

  isEnabled(): boolean {
    return this.config.enabled;
  }

  get maxFallbacksPerRun(): number {
    return this.config.maxFallbacksPerRun;
  }

  get provider(): string {
    return this.config.provider;
  }

  evaluate(error: string): FallbackDecision {
    return classifyModelError(error, this.config.rules);
  }

  isExcluded(provider: string, modelId: string): boolean {
    return Boolean(this.state.excluded[modelKey(provider, modelId)]);
  }

  exclude(
    provider: string,
    modelId: string,
    ruleId: string,
    lastError: string
  ): void {
    const key = modelKey(provider, modelId);
    this.state.excluded[key] = {
      excludedAt: new Date().toISOString(),
      ruleId,
      lastError,
    };
    trySaveModelFallbackState(this.statePath, this.state);
  }

  resolveNext(currentModelId: string): ModelRef | null {
    const { provider, chain } = this.config;
    const startIndex = chain.indexOf(currentModelId);
    const searchFrom = startIndex === -1 ? 0 : startIndex + 1;
    for (let index = searchFrom; index < chain.length; index++) {
      const modelId = chain[index];
      if (!this.isExcluded(provider, modelId)) {
        return { provider, modelId };
      }
    }
    return null;
  }

  resolveFirstUsableModel(preferredModelId: string): ModelRef | null {
    const { provider, chain } = this.config;
    if (
      chain.includes(preferredModelId) &&
      !this.isExcluded(provider, preferredModelId)
    ) {
      return { provider, modelId: preferredModelId };
    }
    for (const modelId of chain) {
      if (!this.isExcluded(provider, modelId)) {
        return { provider, modelId };
      }
    }
    return null;
  }
}

interface AgentSessionWithContinue {
  agent: {
    continue: () => Promise<void>;
  };
}

export function stripLastErrorAssistantMessage(session: AgentSession): void {
  const messages = session.messages;
  const last = messages.at(-1);
  if (last && "role" in last && last.role === "assistant") {
    session.state.messages = messages.slice(0, -1);
  }
}

export function continueAgentTurnAfterModelSwitch(session: AgentSession): void {
  stripLastErrorAssistantMessage(session);
  const runtime = session as unknown as AgentSessionWithContinue;
  setTimeout(() => {
    void runtime.agent.continue().catch(() => {
      // Next agent_end will surface the error or another fallback attempt.
    });
  }, 0);
}

export function resolveModelFallbackStatePath(dataDir: string): string {
  return join(resolve(dataDir), "runtime", "model-fallback-state.json");
}

export function resolveDefaultModelFallbackConfigPath(): string | null {
  const fromEnv = process.env.ALT_THEORY_MODEL_FALLBACK_PATH;
  if (fromEnv) {
    return resolve(fromEnv);
  }
  return null;
}