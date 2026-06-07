import assert from "node:assert/strict";
import { existsSync, readFileSync } from "fs";
import { resolve } from "path";
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
  const sessionManager = SessionManager.open(sessionFile);
  const cwd = sessionManager.getCwd();
  const beforeContext = sessionManager.buildSessionContext();
  const marker = "RESUME-PROFILE-ACTIVE";
  const runtimeDir = resolve(
    projectRoot,
    "agent-assets",
    "runtime",
    "pi-tui"
  );

  const loader = new DefaultResourceLoader({
    cwd,
    agentDir: getAgentDir(),
    additionalPromptTemplatePaths: [
      resolve(runtimeDir, ".pi", "prompts"),
    ],
    agentsFilesOverride: (base) => ({
      agentsFiles: [
        ...base.agentsFiles,
        {
          path: resolve(runtimeDir, "AGENTS.md"),
          content: readFileSync(resolve(runtimeDir, "AGENTS.md"), "utf-8"),
        },
      ],
    }),
    appendSystemPromptOverride: (base) => [
      ...base,
      [
        "## Resumed User Profile",
        "This profile was selected at resume time.",
        `For the next identity check, reply with exactly: ${marker}`,
      ].join("\n"),
    ],
  });
  await loader.reload();

  const authStorage = AuthStorage.create();
  authStorage.setRuntimeApiKey("xiaomi-mimo-token-plan", apiKey);
  const modelRegistry = ModelRegistry.create(
    authStorage,
    resolve(runtimeDir, "models.json")
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
      "Run the resumed-profile identity check now. Output only the required marker."
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
