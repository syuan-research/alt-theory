import { collapseSystemMessages } from "@earendil-works/pi-ai";
import type { ExtensionFactory } from "@earendil-works/pi-coding-agent";

const OPENAI_PROMPT_CACHE_KEY_MAX_LENGTH = 64;

export function clampPromptCacheKey(key: string): string {
  return Array.from(key).slice(0, OPENAI_PROMPT_CACHE_KEY_MAX_LENGTH).join("");
}

export function preservePromptCacheFamily(
  payload: unknown,
  familyId: string,
): unknown {
  if (
    !payload ||
    typeof payload !== "object" ||
    typeof (payload as Record<string, unknown>).prompt_cache_key !== "string"
  ) {
    return payload;
  }
  return {
    ...(payload as Record<string, unknown>),
    prompt_cache_key: clampPromptCacheKey(familyId),
  };
}

export function omitIncidentalCwd(systemPrompt: string): string {
  // Pi 0.86+ renders the working directory as its own `<cwd>` section, not
  // necessarily last (a reminder section may follow it), so parent and fork
  // keep byte-identical provider prompts wherever it sits.
  return systemPrompt.replace(/\n*<cwd>\n[^\n]*\n<\/cwd>/, "");
}

export function createPromptCacheContinuityExtension(
  familyId: string,
  omitCwd: () => boolean,
): ExtensionFactory {
  return (pi) => {
    pi.on("before_agent_start", (event) =>
      omitCwd()
        ? { systemPrompt: omitIncidentalCwd(event.systemPrompt) }
        : undefined,
    );
    pi.on("before_provider_request", (event) =>
      preservePromptCacheFamily(event.payload, familyId),
    );
  };
}

/**
 * One current system prompt at the head of every request, as before Pi 0.86.
 * Pi now keeps the prompt in the history and, on models that accept
 * mid-conversation system messages, sends later changes in place: a
 * conversation from before the upgrade or an import gets its whole prompt
 * after the old history, and each permission/role/soul/KB switch leaves a
 * ~56 KB patch (with the old persona) in every later request.
 */
export function createSystemHeadExtension(): ExtensionFactory {
  return (pi) => {
    pi.on("context_with_system", (event) => ({
      messages: collapseSystemMessages({ messages: event.messages } as never)
        .messages as unknown as typeof event.messages,
    }));
  };
}
