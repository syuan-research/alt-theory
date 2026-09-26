/**
 * The SessionService test fixture: temporary data/asset dirs with a fake
 * provider, and a service over them. Shared by the service tests and the
 * client replay tests (conversation-replay.test.ts).
 */
import { mkdirSync, mkdtempSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join, resolve } from "path";
import { SessionService } from "./session-service.js";

export function setupFixture() {
  const root = mkdtempSync(join(tmpdir(), "alt-theory-session-service-"));
  const dataDir = join(root, "data");
  const rolePresetsDir = join(root, "role-presets");
  const soulDir = join(root, "soul");
  const kbDir = join(root, "kb");
  const skillsDir = join(root, "skills");
  const instructionsDir = join(root, "instructions");
  const agentDir = join(root, "agent");
  const modelsPath = join(agentDir, "models.json");
  const authPath = join(agentDir, "auth.json");
  const appContextPath = join(root, "ALTTHEORY.md");
  const piPromptTemplatesDir = resolve("agent-assets", "prompts", "pi");

  mkdirSync(rolePresetsDir, { recursive: true });
  mkdirSync(soulDir, { recursive: true });
  mkdirSync(join(kbDir, "ep-core"), { recursive: true });
  mkdirSync(skillsDir, { recursive: true });
  mkdirSync(instructionsDir, { recursive: true });
  mkdirSync(agentDir, { recursive: true });
  writeFileSync(appContextPath, "Session service app context", "utf-8");
  writeFileSync(
    join(rolePresetsDir, "role-conceptual-theory-companion.md"),
    "Conceptual theory role",
    "utf-8",
  );
  writeFileSync(
    join(rolePresetsDir, "alternate.md"),
    "Alternate role",
    "utf-8",
  );
  writeFileSync(join(soulDir, "soul-latest.md"), "Latest soul", "utf-8");
  writeFileSync(join(soulDir, "soul-test.md"), "Test soul", "utf-8");
  writeFileSync(
    join(instructionsDir, "research.rules"),
    "Do not overextend.",
    "utf-8",
  );
  writeFileSync(
    join(skillsDir, "summary.md"),
    "---\nname: conversation-summary\ndescription: Test summary\n---\nSummarize.",
    "utf-8",
  );
  writeFileSync(modelsPath, JSON.stringify({ providers: {
    test: {
      baseUrl: "https://example.test/v1",
      api: "openai-completions",
      apiKey: "test",
      models: [{ id: "test-model", contextWindow: 16_000, maxTokens: 4_000 }],
    },
  } }), "utf-8");
  writeFileSync(authPath, JSON.stringify({ test: { type: "api_key", key: "test-key" } }), "utf-8");

  return {
    root,
    dataDir,
    rolePresetsDir,
    soulDir,
    kbDir,
    skillsDir,
    instructionsDir,
    appContextPath,
    piPromptTemplatesDir,
    runtimeModelConfig: {
      modelProvider: "test",
      modelId: "test-model",
      modelsPath,
      authPath,
    },
  };
}

export function createTestService(
  fixture: ReturnType<typeof setupFixture>,
  resourceDiscovery: "clean" | "internal" = "clean",
  runtimeModelConfig?: {
    modelProvider?: string;
    modelId?: string;
    modelsPath?: string;
    authPath?: string;
  },
) {
  return new SessionService({
    dataDir: fixture.dataDir,
    assetPaths: {
      rootDir: fixture.root,
      appContextPath: fixture.appContextPath,
      instructionsDir: fixture.instructionsDir,
      skillsDir: fixture.skillsDir,
      soulDir: fixture.soulDir,
      soulPath: join(fixture.soulDir, "soul-latest.md"),
      rolePresetsDir: fixture.rolePresetsDir,
      kbDir: fixture.kbDir,
      piPromptTemplatesDir: fixture.piPromptTemplatesDir,
      modelsPath: null,
    },
    kbDir: fixture.kbDir,
    rolePresetsDir: fixture.rolePresetsDir,
    soulDir: fixture.soulDir,
    legacySoulPath: join(fixture.soulDir, "soul-latest.md"),
    resourceDiscovery,
    skillsDir: fixture.skillsDir,
    instructionsDir: fixture.instructionsDir,
    runLabel: null,
    testBatch: null,
    resolveRuntimeModelConfig: () => runtimeModelConfig ?? fixture.runtimeModelConfig,
  });
}
