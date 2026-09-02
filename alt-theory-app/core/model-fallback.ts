import { existsSync, mkdirSync, readFileSync } from "fs";
import { dirname, join, resolve } from "path";
import type { AgentSession } from "@earendil-works/pi-coding-agent";
import { writeJsonAtomic } from "./data-dir.js";
import { describeFailure, type Failure, type FailureKind } from "./failure.js";

export type FallbackAction = "fail" | "ignore" | "exclude_and_fallback";

/** A rule matches on the failure envelope's kind; `anyPattern` (text) stays for deployment-specific wording. */
export interface ModelFallbackRule {
  id: string;
  action: FallbackAction;
  match: {
    kinds?: FailureKind[];
    anyPattern?: string[];
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
  { id: "auth-failure", action: "fail", match: { kinds: ["auth"] } },
];

const FAILURE_KINDS: FailureKind[] = [
  "network",
  "auth",
  "rate-limit",
  "provider",
  "busy",
  "aborted",
  "unknown",
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function validateRule(value: unknown): ModelFallbackRule | null {
  if (!isRecord(value)) {
    return null;
  }
  const { id, action, match } = value;
  if (
    typeof id !== "string" ||
    id.trim().length === 0 ||
    (action !== "fail" &&
      action !== "ignore" &&
      action !== "exclude_and_fallback") ||
    !isRecord(match)
  ) {
    return null;
  }
  const { anyPattern, kinds } = match;
  const validPatterns =
    anyPattern === undefined ||
    (Array.isArray(anyPattern) &&
      anyPattern.every(
        (pattern) => typeof pattern === "string" && pattern.trim().length > 0
      ));
  const validKinds =
    kinds === undefined ||
    (Array.isArray(kinds) &&
      kinds.every((kind) => FAILURE_KINDS.includes(kind as FailureKind)));
  if (!validPatterns || !validKinds || (anyPattern === undefined && kinds === undefined)) {
    return null;
  }
  return {
    id,
    action,
    match: {
      ...(kinds ? { kinds: [...(kinds as FailureKind[])] } : {}),
      ...(anyPattern ? { anyPattern: [...(anyPattern as string[])] } : {}),
    },
  };
}

function validateConfig(value: unknown): ModelFallbackConfig | null {
  if (!isRecord(value)) {
    return null;
  }
  const { enabled, provider, chain, maxFallbacksPerRun, rules } = value;
  if (
    typeof enabled !== "boolean" ||
    typeof provider !== "string" ||
    provider.trim().length === 0 ||
    !Array.isArray(chain) ||
    chain.length === 0 ||
    chain.some(
      (modelId) => typeof modelId !== "string" || modelId.trim().length === 0
    ) ||
    new Set(chain).size !== chain.length ||
    !Number.isInteger(maxFallbacksPerRun) ||
    maxFallbacksPerRun < 1
  ) {
    return null;
  }

  let validatedRules: ModelFallbackRule[] = DEFAULT_RULES;
  if (rules !== undefined) {
    if (!Array.isArray(rules)) {
      return null;
    }
    validatedRules = rules.map(validateRule).filter(Boolean) as ModelFallbackRule[];
    if (validatedRules.length !== rules.length) {
      return null;
    }
    if (validatedRules.length === 0) {
      validatedRules = DEFAULT_RULES;
    }
  }

  return {
    enabled,
    provider: provider.trim(),
    chain: [...chain],
    maxFallbacksPerRun,
    rules: validatedRules,
  };
}

function validateState(value: unknown): ModelFallbackState | null {
  if (!isRecord(value)) {
    return null;
  }
  const { excluded } = value;
  if (excluded === undefined) {
    return { excluded: {} };
  }
  if (!isRecord(excluded)) {
    return null;
  }
  const normalized: Record<string, ExcludedModelRecord> = {};
  for (const [key, record] of Object.entries(excluded)) {
    if (!isRecord(record)) {
      continue;
    }
    const { excludedAt, ruleId, lastError } = record;
    if (
      typeof excludedAt !== "string" ||
      typeof ruleId !== "string" ||
      typeof lastError !== "string"
    ) {
      continue;
    }
    normalized[key] = {
      excludedAt,
      ruleId,
      lastError,
    };
  }
  return { excluded: normalized };
}

export function classifyModelError(
  error: Failure | string,
  rules: ModelFallbackRule[] = DEFAULT_RULES
): FallbackDecision {
  const failure = describeFailure(error, "run");
  for (const rule of rules) {
    if (
      rule.match.kinds?.includes(failure.kind) ||
      (rule.match.anyPattern &&
        matchesAnyPattern(failure.message, rule.match.anyPattern))
    ) {
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
  try {
    const parsed = JSON.parse(readFileSync(resolved, "utf-8")) as unknown;
    const config = validateConfig(parsed);
    if (!config) {
      console.error(
        `[model-fallback] invalid config at ${resolved}; fallback disabled`
      );
      return null;
    }
    return config;
  } catch (error) {
    console.error(
      `[model-fallback] failed to load config at ${resolved}:`,
      error instanceof Error ? error.message : String(error)
    );
    return null;
  }
}

export function loadModelFallbackState(statePath: string): ModelFallbackState {
  const resolved = resolve(statePath);
  if (!existsSync(resolved)) {
    return { excluded: {} };
  }
  try {
    const parsed = JSON.parse(readFileSync(resolved, "utf-8")) as unknown;
    const state = validateState(parsed);
    if (!state) {
      console.error(
        `[model-fallback] invalid state at ${resolved}; starting with empty exclusions`
      );
      return { excluded: {} };
    }
    return state;
  } catch (error) {
    console.error(
      `[model-fallback] failed to load state at ${resolved}:`,
      error instanceof Error ? error.message : String(error)
    );
    return { excluded: {} };
  }
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

  evaluate(error: Failure | string): FallbackDecision {
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

export function stripLastErrorAssistantMessage(session: AgentSession): void {
  // A session that auto-retried and still failed carries a CHAIN of trailing
  // errored assistant partials (Pi strips them from live state but keeps
  // them in the file, so a reopen restores all of them). Strip every one;
  // agent.continue() refuses an assistant-last context.
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
