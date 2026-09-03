import { randomUUID } from "crypto";
import { join } from "path";
import type { AuthEvent, AuthPrompt } from "@earendil-works/pi-ai";
import {
  ModelRuntime,
  readStoredCredential,
} from "@earendil-works/pi-coding-agent";

export const PROVIDER_AUTH_IDS = [
  // Keep this list to the subscription/OAuth paths Alt explicitly offers.
  // It is the single source every OAuth surface derives from (status, login
  // and logout routes, config-store's credential providers, and the settings
  // auth cards). Pi also ships anthropic (Claude subscription); it stays out
  // because Anthropic bills third-party harness usage from extra usage, not
  // the plan.
  "openrouter",
  "xai",
  "openai-codex",
  "github-copilot",
  "kimi-coding",
] as const;

export type ProviderAuthId = (typeof PROVIDER_AUTH_IDS)[number];

/** Display names for the ids above, in list order (v1.5 M7). */
export const PROVIDER_AUTH_NAMES: Record<ProviderAuthId, string> = {
  openrouter: "OpenRouter",
  xai: "Grok",
  "openai-codex": "ChatGPT (Codex)",
  "github-copilot": "GitHub Copilot",
  "kimi-coding": "Kimi For Coding",
};

export interface ProviderAuthPromptView {
  id: string;
  type: AuthPrompt["type"];
  message: string;
  placeholder?: string;
  options?: readonly {
    id: string;
    label: string;
    description?: string;
  }[];
}

export interface ProviderAuthFlowView {
  flowId: string;
  provider: ProviderAuthId;
  status: "running" | "connected" | "error" | "cancelled";
  events: AuthEvent[];
  prompt?: ProviderAuthPromptView;
  error?: string;
}

interface ProviderAuthJob {
  view: ProviderAuthFlowView;
  abort: AbortController;
  resolvePrompt?: (value: string) => void;
  rejectPrompt?: (error: Error) => void;
}

const jobs = new Map<string, ProviderAuthJob>();
const currentByProvider = new Map<ProviderAuthId, string>();

export function isProviderAuthId(value: string): value is ProviderAuthId {
  return (PROVIDER_AUTH_IDS as readonly string[]).includes(value);
}

export function listProviderAuthStatus(agentDir: string) {
  const authPath = join(agentDir, "auth.json");
  return PROVIDER_AUTH_IDS.map((provider) => ({
    provider,
    name: PROVIDER_AUTH_NAMES[provider],
    connected: readStoredCredential(provider, authPath)?.type === "oauth",
  }));
}

function snapshot(job: ProviderAuthJob): ProviderAuthFlowView {
  return {
    ...job.view,
    events: [...job.view.events],
    prompt: job.view.prompt ? { ...job.view.prompt } : undefined,
  };
}

function finishPrompt(job: ProviderAuthJob): void {
  job.resolvePrompt = undefined;
  job.rejectPrompt = undefined;
  delete job.view.prompt;
}

function requestPrompt(
  job: ProviderAuthJob,
  prompt: AuthPrompt
): Promise<string> {
  return new Promise((resolve, reject) => {
    const promptId = randomUUID();
    const abort = () => {
      finishPrompt(job);
      reject(new Error("Login cancelled"));
    };
    const signal = prompt.signal;
    signal?.addEventListener("abort", abort, { once: true });
    job.abort.signal.addEventListener("abort", abort, { once: true });
    job.view.prompt = {
      id: promptId,
      type: prompt.type,
      message: prompt.message,
      placeholder: "placeholder" in prompt ? prompt.placeholder : undefined,
      options: prompt.type === "select" ? prompt.options : undefined,
    };
    job.resolvePrompt = (value) => {
      signal?.removeEventListener("abort", abort);
      job.abort.signal.removeEventListener("abort", abort);
      finishPrompt(job);
      resolve(value);
    };
    job.rejectPrompt = reject;
  });
}

async function runLogin(agentDir: string, job: ProviderAuthJob): Promise<void> {
  try {
    const runtime = await ModelRuntime.create({
      authPath: join(agentDir, "auth.json"),
      modelsPath: join(agentDir, "models.json"),
    });
    await runtime.login(job.view.provider, "oauth", {
      signal: job.abort.signal,
      prompt: (prompt) => requestPrompt(job, prompt),
      notify: (event) => {
        job.view.events.push(event);
      },
    });
    finishPrompt(job);
    job.view.status = "connected";
  } catch (error) {
    finishPrompt(job);
    if (job.abort.signal.aborted) {
      job.view.status = "cancelled";
      return;
    }
    job.view.status = "error";
    job.view.error = error instanceof Error ? error.message : String(error);
  }
}

export function startProviderAuth(
  agentDir: string,
  provider: ProviderAuthId
): ProviderAuthFlowView {
  const previousId = currentByProvider.get(provider);
  if (previousId) {
    const previous = jobs.get(previousId);
    previous?.abort.abort();
    jobs.delete(previousId);
  }

  const job: ProviderAuthJob = {
    view: {
      flowId: randomUUID(),
      provider,
      status: "running",
      events: [],
    },
    abort: new AbortController(),
  };
  jobs.set(job.view.flowId, job);
  currentByProvider.set(provider, job.view.flowId);
  void runLogin(agentDir, job);
  return snapshot(job);
}

export function getProviderAuthFlow(
  flowId: string
): ProviderAuthFlowView | undefined {
  const job = jobs.get(flowId);
  return job ? snapshot(job) : undefined;
}

export function respondToProviderAuth(
  flowId: string,
  promptId: string,
  value: string
): ProviderAuthFlowView | undefined {
  const job = jobs.get(flowId);
  if (!job || job.view.prompt?.id !== promptId || !job.resolvePrompt) {
    return undefined;
  }
  job.resolvePrompt(value);
  return snapshot(job);
}

export function cancelProviderAuth(
  flowId: string
): ProviderAuthFlowView | undefined {
  const job = jobs.get(flowId);
  if (!job) return undefined;
  job.abort.abort();
  job.rejectPrompt?.(new Error("Login cancelled"));
  job.view.status = "cancelled";
  finishPrompt(job);
  return snapshot(job);
}

export async function logoutProviderAuth(
  agentDir: string,
  provider: ProviderAuthId
): Promise<void> {
  const runtime = await ModelRuntime.create({
    authPath: join(agentDir, "auth.json"),
    modelsPath: join(agentDir, "models.json"),
  });
  await runtime.logout(provider);
}
