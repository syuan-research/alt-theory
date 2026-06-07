import assert from "node:assert/strict";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  writeFileSync,
} from "fs";
import { tmpdir } from "os";
import { join, resolve } from "path";
import WebSocket from "ws";
import { createAltTheoryServer } from "./server.js";

function waitForType(
  ws: WebSocket,
  type: string,
  timeoutMs = 180_000
): Promise<any> {
  return new Promise((resolveMessage, reject) => {
    const timer = setTimeout(
      () => reject(new Error(`Timed out waiting for ${type}`)),
      timeoutMs
    );
    const listener = (data: WebSocket.RawData) => {
      const message = JSON.parse(data.toString());
      if (message.type === type) {
        clearTimeout(timer);
        ws.off("message", listener);
        resolveMessage(message);
      }
    };
    ws.on("message", listener);
  });
}

async function runTurn(ws: WebSocket, prompt: string): Promise<string> {
  let response = "";
  const deltaListener = (data: WebSocket.RawData) => {
    const message = JSON.parse(data.toString());
    if (message.type === "assistant_delta") {
      response += message.payload.text;
    }
  };
  ws.on("message", deltaListener);
  const completedPromise = waitForType(ws, "run_completed");
  const failedPromise = waitForType(ws, "run_failed").then((message) => {
    throw new Error(message.payload.error);
  });
  ws.send(JSON.stringify({ type: "prompt", payload: prompt }));

  try {
    await Promise.race([completedPromise, failedPromise]);
    return response.trim();
  } finally {
    ws.off("message", deltaListener);
  }
}

async function main() {
  const apiKey = process.env.MIMO_API_KEY;
  assert.ok(apiKey, "MIMO_API_KEY is required for the live smoke test");

  const projectRoot = process.cwd();
  const root = mkdtempSync(join(tmpdir(), "alt-theory-mimo-live-"));
  const dataDir = join(root, "data");
  const profilesDir = join(root, "profiles");
  const kbDir = join(root, "kb");
  const coreSoulDir = join(root, "core-soul");
  mkdirSync(profilesDir, { recursive: true });
  mkdirSync(join(kbDir, "ep-core"), { recursive: true });
  mkdirSync(coreSoulDir, { recursive: true });

  const coreSoulPath = join(coreSoulDir, "core-soul.md");
  writeFileSync(
    coreSoulPath,
    "You are a friendly assistant. Maintain a stable identity as an Alt Theory research assistant.\n",
    "utf-8"
  );
  writeFileSync(
    join(profilesDir, "default.md"),
    [
      "Keep responses concise.",
      "Prioritize knowledge-base evidence before relying on general knowledge.",
      "State uncertainty when the knowledge base does not support a claim.",
    ].join("\n"),
    "utf-8"
  );
  writeFileSync(
    join(kbDir, "ep-core", "live-smoke-fact.md"),
    [
      "# Live smoke fact",
      "",
      "The Alt Theory verification code is MIMO-KB-725.",
    ].join("\n"),
    "utf-8"
  );

  const instance = createAltTheoryServer({
    dataDir,
    profilesDir,
    kbDir,
    coreSoulPath,
    coreSoulModulesDir: coreSoulDir,
    modelsPath: resolve(
      projectRoot,
      "agent-assets",
      "runtime",
      "pi-tui",
      "models.json"
    ),
    modelProvider: "xiaomi-mimo-token-plan",
    modelId: "mimo-v2.5-pro",
    runtimeApiKey: apiKey,
    thinkingLevel: "off",
    readOnly: false,
  });
  await new Promise<void>((resolveListen) => {
    instance.httpServer.listen(0, "127.0.0.1", resolveListen);
  });
  const address = instance.httpServer.address();
  assert.ok(address && typeof address === "object");

  const ws = new WebSocket(`ws://127.0.0.1:${address.port}`);
  const openedPromise = waitForType(ws, "session_opened");
  const metadataPromise = waitForType(ws, "session_metadata");
  const initialMetricsPromise = waitForType(ws, "session_metrics");

  try {
    const [opened, metadata, initialMetrics] = await Promise.all([
      openedPromise,
      metadataPromise,
      initialMetricsPromise,
    ]);
    assert.equal(initialMetrics.payload.turnCount, 0);
    assert.equal(metadata.payload.provider, "xiaomi-mimo-token-plan");
    assert.equal(metadata.payload.model, "mimo-v2.5-pro");

    const identityResponse = await runTurn(
      ws,
      "In one short sentence, say who you are and the main rule you follow when answering."
    );
    const kbResponse = await runTurn(
      ws,
      "Search the knowledge base and reply with only the Alt Theory verification code."
    );
    const writeResponse = await runTurn(
      ws,
      "Use the write tool to create summary.md in the current workspace with two short bullets: your role and the verification code. Then reply DONE."
    );

    assert.match(kbResponse, /MIMO-KB-725/);
    const summaryPath = join(metadata.payload.sessionCwd, "summary.md");
    assert.ok(existsSync(summaryPath), "summary.md was not created in workspace");
    const summary = readFileSync(summaryPath, "utf-8");
    assert.match(summary, /MIMO-KB-725/);

    const metricsPromise = waitForType(ws, "session_metrics");
    ws.send(JSON.stringify({ type: "get_session_metrics" }));
    const metrics = (await metricsPromise).payload;
    assert.equal(metrics.turnCount, 3);
    assert.equal(metrics.messageCount, 3);
    assert.ok(metrics.tokens.total > 0);

    const metricsPath = join(
      metadata.payload.recordsDir,
      "session-metrics.json"
    );
    const eventsPath = join(
      metadata.payload.recordsDir,
      "session-events.jsonl"
    );
    assert.ok(existsSync(metadata.payload.piSessionFile));
    assert.ok(existsSync(metricsPath));
    assert.ok(existsSync(eventsPath));
    const eventTypes = readFileSync(eventsPath, "utf-8")
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line).type);
    assert.equal(
      eventTypes.filter((type) => type === "run_completed").length,
      3
    );

    console.log(
      JSON.stringify(
        {
          root,
          sessionId: opened.payload.sessionId,
          provider: metadata.payload.provider,
          model: metadata.payload.model,
          identityResponse,
          kbResponse,
          writeResponse,
          summaryPath,
          summary,
          sessionFile: metadata.payload.piSessionFile,
          metricsPath,
          eventsPath,
          metrics,
        },
        null,
        2
      )
    );
  } finally {
    ws.close();
    await new Promise<void>((resolveClose) => {
      instance.wss.close(() => {
        instance.httpServer.close(() => resolveClose());
      });
    });
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
