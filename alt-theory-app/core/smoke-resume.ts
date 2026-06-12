import assert from "node:assert/strict";
import { existsSync } from "fs";
import { resolve } from "path";
import {
  readRequiredTextAsset,
  resolveAgentAssetPaths,
} from "./agent-assets.js";
import {
  AuthStorage,
  createAgentSession,
  DefaultResourceLoader,
  getAgentDir,
  ModelRegistry,
  SessionManager,
} from "@mariozechner/pi-coding-agent";

async function main() {
  const sessionFile = process.env.ALT_THEORY_RESUME_SESSION_FILE;
  const apiKey = process.env.MIMO_API_KEY;
  assert.ok(sessionFile, "ALT_THEORY_RESUME_SESSION_FILE is required");
  assert.ok(apiKey, "MIMO_API_KEY is required");
  assert.ok(existsSync(sessionFile), `Session file not found: ${sessionFile}`);

  const projectRoot = process.cwd();
  const assetPaths = resolveAgentAssetPaths(projectRoot);
  assert.ok(
    assetPaths.modelsPath,
    "ALT_THEORY_MODELS_PATH is required for the live resume smoke test"
  );
  const sessionManager = SessionManager.open(sessionFile);
  const cwd = sessionManager.getCwd();
  const beforeContext = sessionManager.buildSessionContext();
  const marker = "RESUME-ROLE-PRESET-ACTIVE";
  const rolePresetPath = resolve(assetPaths.rolePresetsDir, "default.md");
  const appContextContent = readRequiredTextAsset(
    assetPaths.appContextPath,
    "ALTTHEORY.md"
  );
  const soulContent = assetPaths.soulPath
    ? readRequiredTextAsset(assetPaths.soulPath, "soul")
    : null;
  const rolePresetContent = existsSync(rolePresetPath)
    ? readRequiredTextAsset(rolePresetPath, "role preset")
    : null;

  const loader = new DefaultResourceLoader({
    cwd,
    agentDir: getAgentDir(),
    additionalPromptTemplatePaths: [assetPaths.piPromptTemplatesDir],
    agentsFilesOverride: (base) => base,
    appendSystemPromptOverride: (base) => {
      const appended = [
        `## Alt Theory Application Context\n${appContextContent}`,
        ...(soulContent ? [`## Soul\n${soulContent}`] : []),
        ...(rolePresetContent ? [`## Role Preset\n${rolePresetContent}`] : []),
        [
          "## Resumed Role Preset Marker",
          "This role preset marker was selected at resume time.",
          `For the next identity check, reply with exactly: ${marker}`,
        ].join("\n"),
      ];
      return [...base, ...appended];
    },
  });
  await loader.reload();

  const authStorage = AuthStorage.create();
  authStorage.setRuntimeApiKey("xiaomi-mimo-token-plan", apiKey);
  const modelRegistry = ModelRegistry.create(
    authStorage,
    assetPaths.modelsPath
  );
  const model = modelRegistry.find(
    "xiaomi-mimo-token-plan",
    "mimo-v2.5-pro"
  );
  assert.ok(model, "MiMo model not found");

  const { session } = await createAgentSession({
    cwd,
    resourceLoader: loader,
    sessionManager,
    authStorage,
    modelRegistry,
    model,
    thinkingLevel: "off",
    noTools: "all",
    tools: ["read", "ls", "grep", "find"],
  });

  let response = "";
  const unsubscribe = session.subscribe((event) => {
    if (
      event.type === "message_update" &&
      event.assistantMessageEvent?.type === "text_delta"
    ) {
      response += event.assistantMessageEvent.delta ?? "";
    }
  });

  try {
    assert.equal(session.sessionFile, resolve(sessionFile));
    assert.equal(session.sessionManager.getCwd(), cwd);
    assert.ok(beforeContext.messages.length >= 6);
    assert.match(session.agent.state.systemPrompt, new RegExp(marker));

    await session.prompt(
      "Run the resumed role-preset identity check now. Output only the required marker."
    );
    assert.equal(response.trim(), marker);

    const afterContext = session.sessionManager.buildSessionContext();
    assert.ok(afterContext.messages.length > beforeContext.messages.length);

    console.log(
      JSON.stringify(
        {
          sessionFile: session.sessionFile,
          cwd,
          previousMessageCount: beforeContext.messages.length,
          resumedMessageCount: afterContext.messages.length,
          resumedSystemPromptContainsMarker:
            session.agent.state.systemPrompt.includes(marker),
          response: response.trim(),
          model: session.model?.id,
          provider: session.model?.provider,
        },
        null,
        2
      )
    );
  } finally {
    unsubscribe();
    session.dispose();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
