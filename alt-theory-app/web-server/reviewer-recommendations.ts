/**
 * Smart approval's recommended reviewer models (ruling H). The list lives in
 * the public repository (agent-assets/model-presets/reviewer-models.json);
 * the app reads it online, keeps it for a day, and falls back to the copy it
 * ships with when offline. The page shows the list's date.
 */
import { readFileSync } from "fs";
import { join } from "path";

export interface ReviewerRecommendations {
  updatedAt: string;
  models: Array<{ modelId: string; aliases?: string[]; thinking: string; tag: "preferred" | "faster" }>;
  source: "online" | "bundled";
}

const ONLINE =
  "https://raw.githubusercontent.com/syuan-research/alt-theory/main/agent-assets/model-presets/reviewer-models.json";
const DAY_MS = 24 * 60 * 60_000;

export function parseRecommendations(
  value: unknown,
  source: ReviewerRecommendations["source"],
): ReviewerRecommendations | null {
  const raw = value as { schemaVersion?: unknown; updatedAt?: unknown; models?: unknown } | null;
  if (raw?.schemaVersion !== 1 || typeof raw.updatedAt !== "string" || !Array.isArray(raw.models)) return null;
  const models = raw.models.filter(
    (entry): entry is ReviewerRecommendations["models"][number] =>
      typeof entry?.modelId === "string" &&
      (entry?.aliases === undefined ||
        (Array.isArray(entry.aliases) && entry.aliases.every((alias: unknown) => typeof alias === "string"))) &&
      typeof entry?.thinking === "string" &&
      (entry?.tag === "preferred" || entry?.tag === "faster"),
  );
  return { updatedAt: raw.updatedAt, models, source };
}

// ponytail: one in-process cache; a restart re-reads online once.
let cached: { at: number; value: ReviewerRecommendations } | null = null;

export async function reviewerRecommendations(
  modelPresetsDir: string,
  fetchJson: (url: string) => Promise<unknown> = async (url) =>
    (await fetch(url, { signal: AbortSignal.timeout(5_000) })).json(),
): Promise<ReviewerRecommendations> {
  if (cached && Date.now() - cached.at < DAY_MS) return cached.value;
  const online = await fetchJson(ONLINE)
    .then((value) => parseRecommendations(value, "online"))
    .catch(() => null);
  if (online) {
    cached = { at: Date.now(), value: online };
    return online;
  }
  let bundled: ReviewerRecommendations | null = null;
  try {
    bundled = parseRecommendations(
      JSON.parse(readFileSync(join(modelPresetsDir, "reviewer-models.json"), "utf-8")),
      "bundled",
    );
  } catch {
    // Missing or unreadable: no recommendations.
  }
  return bundled ?? { updatedAt: "", models: [], source: "bundled" };
}
