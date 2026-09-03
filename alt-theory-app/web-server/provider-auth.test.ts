import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import test from "node:test";
import { getBuiltinProviders } from "@earendil-works/pi-ai/providers/all";
import {
  listProviderAuthStatus,
  PROVIDER_AUTH_IDS,
  PROVIDER_AUTH_NAMES,
} from "./provider-auth.js";

test("PROVIDER_AUTH_IDS stays exactly the subscription paths Alt offers", () => {
  // The ids must name real Pi builtin providers so login never hits an
  // "Unknown provider" 404, and Claude subscription stays closed (Anthropic
  // bills third-party harness usage from extra usage, not the plan).
  const builtins = getBuiltinProviders() as string[];
  for (const id of PROVIDER_AUTH_IDS) {
    assert.ok(
      builtins.includes(id),
      `${id} must be a Pi builtin provider (drift in PROVIDER_AUTH_IDS)`,
    );
  }
  assert.deepEqual([...PROVIDER_AUTH_IDS].sort(), [
    "github-copilot",
    "kimi-coding",
    "openai-codex",
    "openrouter",
    "xai",
  ]);
});

test("auth status lists every provider by name with connected flags", () => {
  const agentDir = mkdtempSync(join(tmpdir(), "alt-theory-auth-status-"));
  mkdirSync(agentDir, { recursive: true });
  writeFileSync(join(agentDir, "auth.json"), JSON.stringify({
    "openai-codex": { type: "oauth", access: "a", refresh: "r", expires: 0 },
    "github-copilot": {
      type: "oauth",
      access: "a",
      refresh: "r",
      expires: 0,
      availableModelIds: ["claude-sonnet-4.5"],
    },
  }));
  const status = listProviderAuthStatus(agentDir);
  assert.deepEqual(
    status.map((entry) => entry.provider),
    [...PROVIDER_AUTH_IDS],
  );
  assert.deepEqual(
    status.map((entry) => entry.name),
    PROVIDER_AUTH_IDS.map((id) => PROVIDER_AUTH_NAMES[id]),
  );
  assert.equal(
    status.find((entry) => entry.provider === "github-copilot")?.connected,
    true,
  );
  assert.equal(
    status.find((entry) => entry.provider === "kimi-coding")?.connected,
    false,
  );
});
