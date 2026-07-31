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
  return systemPrompt.replace(/\nCurrent working directory: [^\n]*$/, "");
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
