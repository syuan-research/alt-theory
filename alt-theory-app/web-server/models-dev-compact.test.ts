import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { gzipSync } from "node:zlib";
import {
  catalogModelMetadata,
  catalogSdkFamily,
  catalogThinkingLevels,
  compactCatalog,
  setModelsDevSnapshotPath,
} from "./models-dev-metadata.js";

const raw = {
  acme: {
    id: "acme",
    name: "Acme",
    doc: "https://acme.example/docs",
    env: ["ACME_KEY"],
    api: "https://api.acme.example/v1",
    npm: "@ai-sdk/openai-compatible",
    models: {
      "acme-1": {
        id: "acme-1",
        name: "Acme One",
        family: "acme",
        attachment: true,
        reasoning: true,
        reasoning_options: [{ type: "effort", values: ["none", "low", "high"], default: "low" }],
        tool_call: true,
        release_date: "2026-01-01",
        modalities: { input: ["text", "image", "pdf"], output: ["text"] },
        limit: { context: 200000, output: 16000, input: 180000 },
        cost: { input: 1, output: 2 },
        provider: { npm: "@ai-sdk/anthropic" },
      },
    },
  },
};

test("the compact catalog answers every lookup exactly as the full one", () => {
  const compact = compactCatalog(raw)!;
  assert.deepEqual(compact.acme, {
    api: "https://api.acme.example/v1",
    npm: "@ai-sdk/openai-compatible",
    models: {
      "acme-1": {
        name: "Acme One",
        reasoning: true,
        provider: { npm: "@ai-sdk/anthropic" },
        modalities: { input: ["text", "image", "pdf"] },
        limit: { context: 200000, output: 16000 },
        reasoning_options: [{ type: "effort", values: ["none", "low", "high"] }],
      },
    },
  });
  const agentDir = mkdtempSync(join(tmpdir(), "alt-theory-models-dev-"));
  writeFileSync(join(agentDir, "models-dev-cache.json"), JSON.stringify(raw));
  assert.equal(catalogSdkFamily(agentDir, "acme", undefined, "acme-1"), "anthropic");
  assert.deepEqual(catalogThinkingLevels(agentDir, "custom", "https://api.acme.example", "acme-1"), ["off", "low", "high"]);
  assert.deepEqual(catalogModelMetadata(agentDir, "acme", undefined, "acme-1"), {
    name: "Acme One",
    reasoning: true,
    availableThinkingLevels: ["off", "low", "high"],
    input: ["text", "image"],
    contextWindow: 200000,
    maxTokens: 16000,
  });
});

test("without a models.dev cache the shipped snapshot answers", () => {
  const assets = mkdtempSync(join(tmpdir(), "alt-theory-models-dev-snapshot-"));
  const snapshot = join(assets, "models-dev-snapshot.json.gz");
  writeFileSync(snapshot, gzipSync(JSON.stringify(compactCatalog(raw))));
  const agentDir = mkdtempSync(join(tmpdir(), "alt-theory-models-dev-"));
  assert.equal(catalogSdkFamily(agentDir, "acme", undefined, "acme-1"), undefined);
  setModelsDevSnapshotPath(snapshot);
  try {
    const fresh = mkdtempSync(join(tmpdir(), "alt-theory-models-dev-"));
    assert.equal(catalogSdkFamily(fresh, "acme", undefined, "acme-1"), "anthropic");
  } finally {
    setModelsDevSnapshotPath(null);
  }
});
