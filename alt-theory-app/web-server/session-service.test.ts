import assert from "node:assert/strict";
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "fs";
import { mkdtempSync } from "fs";
import { tmpdir } from "os";
import { join, resolve } from "path";
import test from "node:test";
import { createAltTheorySession } from "../core/alt-theory-core.js";
import { createSessionDirs } from "../core/data-dir.js";
import { omitIncidentalCwd } from "../core/prompt-cache-continuity.js";
import {
  APPROVAL_ALLOW_SESSION,
  APPROVAL_DENY,
} from "../core/security-extension.js";
import {
  displayUserTextFromPrompt,
  imageAttachmentsFor,
  isUnknownModelError,
  retryPromptFromStoredUserContent,
  SessionBusyError,
  SessionService,
  type SessionServiceEvent,
} from "./session-service.js";

test("retry reconstructs a persisted skill invocation", () => {
  assert.equal(
    retryPromptFromStoredUserContent(
      '<skill name="conversation-summary">expanded body</skill> Focus on decisions',
    ),
    "/skill:conversation-summary Focus on decisions",
  );
});
import { listSessionSummaries, readSessionDetail } from "./session-store.js";
import { readAbComparisonRecords } from "./ab-records.js";
import { readV4SessionHeader } from "./session-records.js";
import { hardDeleteExpiredPrivateSessions } from "./session-retention.js";
import { readConfigEvents } from "./config-events.js";
import {
  appendRunRecord,
  latestRunSnapshots,
  readRunRecords,
} from "./run-records.js";

function setupFixture() {
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

function createTestService(
  fixture: ReturnType<typeof setupFixture>,
  resourceDiscovery: "clean" | "internal" = "clean",
  localMode = true,
  runtimeModelConfig?: {
    modelProvider?: string;
    modelId?: string;
    modelsPath?: string;
    authPath?: string;
  },
) {
  return new SessionService({
    localMode,
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
    understandReadOnly: true,
    altMode: "understand",
    resourceDiscovery,
    skillsDir: fixture.skillsDir,
    instructionsDir: fixture.instructionsDir,
    runLabel: null,
    testBatch: null,
    resolveRuntimeModelConfig: () => runtimeModelConfig ?? fixture.runtimeModelConfig,
  });
}

function createDeferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

test("an explicit conversation model runs without a configured default", async () => {
  const fixture = setupFixture();
  const agentDir = join(fixture.root, "agent");
  const modelsPath = join(agentDir, "models.json");
  const authPath = join(agentDir, "auth.json");
  mkdirSync(agentDir, { recursive: true });
  writeFileSync(
    modelsPath,
    JSON.stringify({
      providers: {
        "manual-choice": {
          baseUrl: "https://example.test/v1",
          api: "openai-completions",
          apiKey: "manual-choice",
          models: [
            {
              id: "selected-model",
              name: "Selected model",
              contextWindow: 16_000,
              maxTokens: 4_000,
            },
          ],
        },
      },
    }),
    "utf-8",
  );
  writeFileSync(
    authPath,
    JSON.stringify({
      "manual-choice": { type: "api_key", key: "test-key" },
    }),
    "utf-8",
  );
  const service = createTestService(fixture, "clean", true, {
    modelsPath,
    authPath,
  });

  try {
    const snapshot = await service.createSession(
      {
        rolePresetSlug: "role-conceptual-theory-companion",
        kbDomain: "ep-core",
        soulSlug: "soul-latest",
      },
      {
        modelOverride: {
          provider: "manual-choice",
          modelId: "selected-model",
        },
      },
    );
    assert.deepEqual(snapshot.currentModel, {
      provider: "manual-choice",
      modelId: "selected-model",
    });
    const cleared = await service.setSessionModel(snapshot.sessionId, null);
    // Pi keeps the already loaded model live until reopen; clearing the saved
    // override must still succeed instead of blocking the conversation.
    assert.deepEqual(cleared.currentModel, {
      provider: "manual-choice",
      modelId: "selected-model",
    });
    assert.equal(
      readV4SessionHeader(service.getManifest(snapshot.sessionId).recordsDir)
        ?.modelOverride?.modelId,
      undefined,
    );
  } finally {
    await service.disposeAll();
  }
});

test("SessionService creates managed sessions with v0.4 foundation records", async () => {
  const fixture = setupFixture();
  const service = createTestService(fixture);
  const snapshot = await service.createSession({
    rolePresetSlug: "role-conceptual-theory-companion",
    kbDomain: "ep-core",
    soulSlug: "soul-latest",
  });

  try {
    assert.match(
      snapshot.sessionId,
      /^\d{8}-\d{6}__role-conceptual-theory-c__soul-latest__test-model$/,
    );
    assert.equal(snapshot.rolePresetSlug, "role-conceptual-theory-companion");
    assert.equal(snapshot.soulSlug, "soul-latest");
    assert.equal(snapshot.currentDomain, "ep-core");
    const liveModel = (service as any).sessions.get(snapshot.sessionId).session
      .model;
    assert.deepEqual(snapshot.currentModel, {
      provider: liveModel.provider,
      modelId: liveModel.id,
    });

    const manifest = service.getManifest(snapshot.sessionId);
    const sessionRecordPath = join(manifest.recordsDir, "session.json");
    const branchIndexPath = join(manifest.recordsDir, "branch-index.json");
    assert.equal(existsSync(sessionRecordPath), true);
    assert.equal(existsSync(branchIndexPath), false);

    const sessionRecord = JSON.parse(readFileSync(sessionRecordPath, "utf-8"));
    assert.deepEqual(
      {
        schemaVersion: sessionRecord.schemaVersion,
        recordType: sessionRecord.recordType,
        recordModel: sessionRecord.recordModel,
      },
      {
        schemaVersion: 1,
        recordType: "session",
        recordModel: "v0.4",
      },
    );

    const detail = readSessionDetail(fixture.dataDir, snapshot.sessionId);
    assert.equal(detail?.session.recordModel, "v0.4");
    assert.deepEqual(
      readConfigEvents(manifest.recordsDir).map((event) => event.reason),
      ["creation"],
    );
  } finally {
    await service.disposeAll();
  }
});

test("SessionService records ordinary run trajectory and Pi entry mappings", async () => {
  const fixture = setupFixture();
  const service = createTestService(fixture);
  const created = await service.createSession({
    rolePresetSlug: "role-conceptual-theory-companion",
    kbDomain: "ep-core",
    soulSlug: "soul-latest",
  });
  const managed = (
    service as unknown as {
      sessions: Map<
        string,
        {
          session: {
            prompt(text: string): Promise<void>;
            sessionManager: { appendMessage(message: unknown): string };
          };
        }
      >;
    }
  ).sessions.get(created.sessionId)!;
  let promptText = "";
  managed.session.prompt = async (text: string) => {
    promptText = text;
    managed.session.sessionManager.appendMessage({
      role: "user",
      content: [{ type: "text", text }],
      timestamp: Date.now(),
    });
    managed.session.sessionManager.appendMessage({
      role: "assistant",
      content: [{ type: "text", text: "answer" }],
      timestamp: Date.now(),
    });
  };
  try {
    const run = service.runPrompt(created.sessionId, "question");
    await run.completion;
    assert.equal(promptText, "question");
    assert.doesNotMatch(promptText, /\[Context:/);
    assert.doesNotMatch(promptText, /Search in/);
    const recordsDir = service.getManifest(created.sessionId).recordsDir;
    assert.equal(readRunRecords(recordsDir).length, 2);
    const latest = latestRunSnapshots(recordsDir)[0];
    assert.equal(latest.status, "completed");
    assert.equal(latest.branchId, "main");
    assert.match(latest.userEntryId ?? "", /^[a-f0-9-]+$/);
    assert.equal(latest.assistantEntryIds.length, 1);
    assert.deepEqual(run.ids, {
      sessionId: created.sessionId,
      branchId: "main",
      turnId: "turn-000001",
      revisionId: "rev-000001",
      runId: "run-000001",
    });
  } finally {
    await service.disposeAll();
  }
});

test("SessionService revises only the latest turn without creating a branch", async () => {
  const fixture = setupFixture();
  const service = createTestService(fixture);
  const created = await service.createSession({
    rolePresetSlug: "role-conceptual-theory-companion",
    kbDomain: "ep-core",
    soulSlug: "soul-latest",
  });
  const managed = (
    service as unknown as {
      sessions: Map<
        string,
        {
          session: {
            prompt(text: string): Promise<void>;
            sessionManager: {
              appendMessage(message: unknown): string;
              buildSessionContext(): {
                messages: Array<{
                  content: Array<{ type: string; text: string }>;
                }>;
              };
              getEntry(id: string): unknown;
            };
          };
        }
      >;
    }
  ).sessions.get(created.sessionId)!;
  managed.session.prompt = async (text: string) => {
    managed.session.sessionManager.appendMessage({
      role: "user",
      content: [{ type: "text", text }],
      timestamp: Date.now(),
    });
    managed.session.sessionManager.appendMessage({
      role: "assistant",
      content: [{ type: "text", text: `answer:${text}` }],
      timestamp: Date.now(),
    });
  };
  try {
    const original = service.runPrompt(created.sessionId, "original");
    await original.completion;
    const recordsDir = service.getManifest(created.sessionId).recordsDir;
    const originalRecord = latestRunSnapshots(recordsDir)[0];
    const revised = service.reviseLatest(created.sessionId, "revised");
    await revised.completion;

    assert.equal(revised.ids.sessionId, original.ids.sessionId);
    assert.equal(revised.ids.branchId, "main");
    assert.equal(revised.ids.turnId, original.ids.turnId);
    assert.notEqual(revised.ids.revisionId, original.ids.revisionId);
    assert.notEqual(revised.ids.runId, original.ids.runId);
    assert.ok(
      managed.session.sessionManager.getEntry(originalRecord.userEntryId!),
    );
    const latest = latestRunSnapshots(recordsDir);
    assert.equal(
      latest.find((run) => run.runId === original.ids.runId)?.status,
      "superseded",
    );
    assert.equal(
      latest.find((run) => run.runId === revised.ids.runId)?.supersedesRunId,
      original.ids.runId,
    );
    const text = managed.session.sessionManager
      .buildSessionContext()
      .messages.map((message) =>
        message.content
          .filter((part) => part.type === "text")
          .map((part) => part.text)
          .join(""),
      )
      .join("\n");
    assert.match(text, /revised/);
    assert.doesNotMatch(text, /original/);
    const detail = readSessionDetail(fixture.dataDir, created.sessionId);
    const transcriptText = (detail?.transcript ?? [])
      .map((message) => message.text)
      .join("\n");
    const userMessages = (detail?.transcript ?? []).filter(
      (message) => message.role === "user",
    );
    assert.equal(userMessages.length, 1);
    assert.equal(userMessages[0]?.text, "revised");
    assert.match(transcriptText, /revised/);
    assert.doesNotMatch(transcriptText, /original/);
    assert.equal(existsSync(join(recordsDir, "branch-index.json")), false);
  } finally {
    await service.disposeAll();
  }
});

test("SessionService deletes the latest turn from active context without forking", async () => {
  const fixture = setupFixture();
  const service = createTestService(fixture);
  const created = await service.createSession({
    rolePresetSlug: "role-conceptual-theory-companion",
    kbDomain: "ep-core",
    soulSlug: "soul-latest",
  });
  const managed = (
    service as unknown as {
      sessions: Map<
        string,
        {
          session: {
            prompt(text: string): Promise<void>;
            sessionManager: {
              appendMessage(message: unknown): string;
              buildSessionContext(): {
                messages: Array<{
                  content: Array<{ type: string; text: string }>;
                }>;
              };
              getLeafId(): string | null;
            };
          };
        }
      >;
    }
  ).sessions.get(created.sessionId)!;
  managed.session.prompt = async (text: string) => {
    managed.session.sessionManager.appendMessage({
      role: "user",
      content: [{ type: "text", text }],
      timestamp: Date.now(),
    });
    managed.session.sessionManager.appendMessage({
      role: "assistant",
      content: [{ type: "text", text: `answer:${text}` }],
      timestamp: Date.now(),
    });
  };

  try {
    const first = service.runPrompt(created.sessionId, "keep me");
    await first.completion;
    const second = service.runPrompt(created.sessionId, "delete me");
    await second.completion;
    const recordsDir = service.getManifest(created.sessionId).recordsDir;

    const deleted = service.deleteLatest(created.sessionId);

    assert.equal(deleted.sessionId, created.sessionId);
    assert.equal(deleted.branchId, undefined);
    assert.equal(
      latestRunSnapshots(recordsDir).find(
        (run) => run.runId === second.ids.runId,
      )?.status,
      "deleted",
    );
    assert.equal(
      latestRunSnapshots(recordsDir).find(
        (run) => run.runId === first.ids.runId,
      )?.status,
      "completed",
    );
    const contextText = managed.session.sessionManager
      .buildSessionContext()
      .messages.map((message) =>
        message.content
          .filter((part) => part.type === "text")
          .map((part) => part.text)
          .join(""),
      )
      .join("\n");
    assert.match(contextText, /keep me/);
    assert.doesNotMatch(contextText, /delete me/);
    assert.equal(existsSync(join(recordsDir, "branch-index.json")), false);
  } finally {
    await service.disposeAll();
  }
});

test("SessionService restores the active Pi leaf after reopen for conversation actions", async () => {
  const fixture = setupFixture();
  const service = createTestService(fixture);
  const created = await service.createSession({
    rolePresetSlug: "role-conceptual-theory-companion",
    kbDomain: "ep-core",
    soulSlug: "soul-latest",
  });
  const managed = (
    service as unknown as {
      sessions: Map<
        string,
        {
          session: {
            prompt(text: string): Promise<void>;
            sessionManager: {
              appendMessage(message: unknown): string;
              buildSessionContext(): {
                messages: Array<{
                  content: Array<{ type: string; text: string }>;
                }>;
              };
            };
          };
        }
      >;
    }
  ).sessions.get(created.sessionId)!;
  managed.session.prompt = async (text: string) => {
    managed.session.sessionManager.appendMessage({
      role: "user",
      content: [{ type: "text", text }],
      timestamp: Date.now(),
    });
    managed.session.sessionManager.appendMessage({
      role: "assistant",
      content: [{ type: "text", text: `answer:${text}` }],
      timestamp: Date.now(),
    });
  };

  try {
    const first = service.runPrompt(created.sessionId, "keep me");
    await first.completion;
    const second = service.runPrompt(created.sessionId, "delete me");
    await second.completion;
    service.deleteLatest(created.sessionId);
    const mainLeafAfterDelete = managed.session.sessionManager.getLeafId();
    await service.disposeAll();

    const reopenedService = createTestService(fixture);
    const reopened = await reopenedService.openSession(created.sessionId, {
      rolePresetSlug: "role-conceptual-theory-companion",
      kbDomain: "ep-core",
      soulSlug: "soul-latest",
    });
    const reopenedManaged = (
      reopenedService as unknown as {
        sessions: Map<
          string,
          {
            session: {
              prompt(text: string): Promise<void>;
              sessionManager: {
                appendMessage(message: unknown): string;
                buildSessionContext(): {
                  messages: Array<{
                    content: Array<{ type: string; text: string }>;
                  }>;
                };
                getLeafId(): string | null;
              };
            };
          }
        >;
      }
    ).sessions.get(reopened.sessionId)!;
    assert.equal(
      reopenedManaged.session.sessionManager.getLeafId(),
      mainLeafAfterDelete,
    );
    reopenedManaged.session.prompt = async (text: string) => {
      const contextText = reopenedManaged.session.sessionManager
        .buildSessionContext()
        .messages.map((message) =>
          message.content
            .filter((part) => part.type === "text")
            .map((part) => part.text)
            .join(""),
        )
        .join("\n");
      assert.match(contextText, /keep me/);
      assert.doesNotMatch(contextText, /delete me/);
      reopenedManaged.session.sessionManager.appendMessage({
        role: "user",
        content: [{ type: "text", text }],
        timestamp: Date.now(),
      });
      reopenedManaged.session.sessionManager.appendMessage({
        role: "assistant",
        content: [{ type: "text", text: `answer:${text}` }],
        timestamp: Date.now(),
      });
    };
    const continued = reopenedService.runPrompt(reopened.sessionId, "continue");
    await continued.completion;
    await reopenedService.disposeAll();
  } finally {
    await service.disposeAll();
  }
});

test("SessionService revise and default fork use restored Pi leaf after reopen", async () => {
  const fixture = setupFixture();
  const service = createTestService(fixture);
  const created = await service.createSession({
    rolePresetSlug: "role-conceptual-theory-companion",
    kbDomain: "ep-core",
    soulSlug: "soul-latest",
  });
  const managed = (service as any).sessions.get(created.sessionId);
  managed.session.prompt = async (text: string) => {
    managed.session.sessionManager.appendMessage({
      role: "user",
      content: [{ type: "text", text }],
      timestamp: Date.now(),
    });
    managed.session.sessionManager.appendMessage({
      role: "assistant",
      content: [{ type: "text", text: `answer:${text}` }],
      timestamp: Date.now(),
    });
  };

  try {
    const first = service.runPrompt(created.sessionId, "first");
    await first.completion;
    const second = service.runPrompt(created.sessionId, "second");
    await second.completion;
    service.deleteLatest(created.sessionId);
    await service.disposeAll();

    const reviseService = createTestService(fixture);
    const reopened = await reviseService.openSession(created.sessionId, {
      rolePresetSlug: "role-conceptual-theory-companion",
      kbDomain: "ep-core",
      soulSlug: "soul-latest",
    });
    const reviseManaged = (reviseService as any).sessions.get(
      reopened.sessionId,
    );
    reviseManaged.session.prompt = async (text: string) => {
      reviseManaged.session.sessionManager.appendMessage({
        role: "user",
        content: [{ type: "text", text }],
        timestamp: Date.now(),
      });
    };
    const revised = reviseService.reviseLatest(
      reopened.sessionId,
      "revised first",
    );
    await revised.completion;
    assert.equal(revised.ids.turnId, first.ids.turnId);
    await reviseService.disposeAll();

    const forkService = createTestService(fixture);
    const forkOpened = await forkService.openSession(created.sessionId, {
      rolePresetSlug: "role-conceptual-theory-companion",
      kbDomain: "ep-core",
      soulSlug: "soul-latest",
    });
    const piLeafBeforeFork = readSessionDetail(
      fixture.dataDir,
      created.sessionId,
    )?.transcript.at(-1)?.entryId;
    const forked = await forkService.forkSession(forkOpened.sessionId, "side");
    const sourceDetail = readSessionDetail(fixture.dataDir, created.sessionId);
    const forkDetail = readSessionDetail(fixture.dataDir, forked.sessionId);
    assert.notEqual(forked.sessionId, created.sessionId);
    assert.equal(sourceDetail?.session.sessionId, created.sessionId);
    assert.equal(forkDetail?.transcript.at(-1)?.entryId, piLeafBeforeFork);
    await forkService.disposeAll();
  } finally {
    await service.disposeAll();
  }
});

test("SessionService rejects latest-turn delete when no completed turn exists", async () => {
  const fixture = setupFixture();
  const service = createTestService(fixture);
  const created = await service.createSession({
    rolePresetSlug: "role-conceptual-theory-companion",
    kbDomain: "ep-core",
    soulSlug: "soul-latest",
  });
  try {
    assert.throws(
      () => service.deleteLatest(created.sessionId),
      /No completed latest user turn/,
    );
  } finally {
    await service.disposeAll();
  }
});

test("SessionService explicit forks create a new session with copied workspace", async () => {
  async function runCase(purpose: "side" | "ab-arm") {
    const fixture = setupFixture();
    const service = createTestService(fixture);
    const created = await service.createSession({
      rolePresetSlug: "role-conceptual-theory-companion",
      kbDomain: "ep-core",
      soulSlug: "soul-latest",
    });
    const manifest = service.getManifest(created.sessionId);
    writeFileSync(
      join(manifest.sessionCwd, "shared-note.txt"),
      "source",
      "utf-8",
    );
    const managed = (
      service as unknown as {
        sessions: Map<
          string,
          {
            session: {
              sessionManager: {
                appendMessage(message: unknown): string;
                getLeafId(): string | null;
              };
            };
          }
        >;
      }
    ).sessions.get(created.sessionId)!;
    managed.session.sessionManager.appendMessage({
      role: "user",
      content: [{ type: "text", text: "fork source" }],
      timestamp: Date.now(),
    });
    const forkPoint = managed.session.sessionManager.appendMessage({
      role: "assistant",
      content: [{ type: "text", text: "fork answer" }],
      timestamp: Date.now(),
    });
    const projectedForkPoint = readSessionDetail(
      fixture.dataDir,
      created.sessionId,
    )?.transcript.find(
      (message) =>
        message.role === "assistant" && message.text === "fork answer",
    )?.entryId;
    assert.equal(projectedForkPoint, forkPoint);

    try {
      const forked = await service.forkSession(
        created.sessionId,
        purpose,
        projectedForkPoint ?? undefined,
      );
      const sourceDetail = readSessionDetail(
        fixture.dataDir,
        created.sessionId,
      );
      const forkDetail = readSessionDetail(fixture.dataDir, forked.sessionId);
      const forkManifest = service.getManifest(forked.sessionId);
      assert.notEqual(forked.sessionId, created.sessionId);
      assert.equal(sourceDetail?.session.sessionId, created.sessionId);
      assert.equal(forkDetail?.session.sessionId, forked.sessionId);
      assert.notEqual(forkManifest.piSessionFile, manifest.piSessionFile);
      assert.notEqual(forkManifest.sessionCwd, manifest.sessionCwd);
      assert.equal(
        readFileSync(
          join(forkManifest.sessionCwd!, "shared-note.txt"),
          "utf-8",
        ),
        "source",
      );
      assert.equal(forkDetail?.transcript.at(-1)?.text, "fork answer");
    } finally {
      await service.disposeAll();
    }
  }

  await runCase("side");
  await runCase("ab-arm");
});

test("SessionService prepares an idle edit comparison before the target prompt", async () => {
  const fixture = setupFixture();
  const service = createTestService(fixture);
  const created = await service.createSession({
    rolePresetSlug: "role-conceptual-theory-companion",
    kbDomain: "ep-core",
    soulSlug: "soul-latest",
  });
  const managed = (service as any).sessions.get(created.sessionId);
  managed.session.sessionManager.appendMessage({
    role: "user",
    content: [{ type: "text", text: "first question" }],
    timestamp: Date.now(),
  });
  managed.session.sessionManager.appendMessage({
    role: "assistant",
    content: [{ type: "text", text: "first answer" }],
    timestamp: Date.now(),
  });
  const target = managed.session.sessionManager.appendMessage({
    role: "user",
    content: [{ type: "text", text: "edit this" }],
    timestamp: Date.now(),
  });
  managed.session.sessionManager.appendMessage({
    role: "assistant",
    content: [{ type: "text", text: "old answer" }],
    timestamp: Date.now(),
  });

  try {
    const forked = await service.prepareRevisionBranch(created.sessionId, target);
    assert.deepEqual(
      readSessionDetail(fixture.dataDir, forked.sessionId)?.transcript.map(
        (message) => [message.role, message.text],
      ),
      [
        ["user", "first question"],
        ["assistant", "first answer"],
      ],
    );
  } finally {
    await service.disposeAll();
  }
});

test("SessionService edit/retry forks preserve the cacheable conversation family", async () => {
  const fixture = setupFixture();
  const service = createTestService(fixture);
  const created = await service.createSession({
    rolePresetSlug: "role-conceptual-theory-companion",
    kbDomain: "ep-core",
    soulSlug: "soul-latest",
  });
  const parent = (service as any).sessions.get(created.sessionId);
  parent.session.sessionManager.appendMessage({
    role: "user",
    content: [{ type: "text", text: "original prompt" }],
    timestamp: Date.now(),
  });
  parent.session.sessionManager.appendMessage({
    role: "assistant",
    content: [{ type: "text", text: "original answer" }],
    timestamp: Date.now(),
  });
  const parentPrompt = parent.session.systemPrompt;
  let forkedSessionId = "";

  try {
    const forked = await service.forkSession(created.sessionId, "fork");
    forkedSessionId = forked.sessionId;
    const child = (service as any).sessions.get(forked.sessionId);
    const forkHeader = JSON.parse(
      readFileSync(child.manifest.piSessionFile, "utf-8").split(/\r?\n/, 1)[0],
    );
    assert.equal(
      omitIncidentalCwd(child.session.systemPrompt),
      omitIncidentalCwd(parentPrompt),
    );
    assert.notEqual(child.manifest.sessionCwd, parent.manifest.sessionCwd);
    assert.equal(
      forkHeader.promptCacheFamilyId,
      Array.from(created.sessionId).slice(0, 64).join(""),
    );
    const nested = await service.forkSession(forked.sessionId, "fork");
    forkedSessionId = nested.sessionId;
    const nestedChild = (service as any).sessions.get(nested.sessionId);
    const nestedHeader = JSON.parse(
      readFileSync(
        nestedChild.manifest.piSessionFile,
        "utf-8",
      ).split(/\r?\n/, 1)[0],
    );
    assert.equal(
      nestedHeader.promptCacheFamilyId,
      forkHeader.promptCacheFamilyId,
    );
  } finally {
    await service.disposeAll();
  }

  const reopenedService = createTestService(fixture);
  try {
    const reopened = await reopenedService.openSession(forkedSessionId, {
      rolePresetSlug: "role-conceptual-theory-companion",
      kbDomain: "ep-core",
      soulSlug: "soul-latest",
    });
    const reopenedChild = (reopenedService as any).sessions.get(
      reopened.sessionId,
    );
    assert.equal(
      omitIncidentalCwd(reopenedChild.session.systemPrompt),
      omitIncidentalCwd(parentPrompt),
    );
  } finally {
    await reopenedService.disposeAll();
  }
});

test("SessionService keeps imported Pi history as the active leaf before the first Alt Theory run", async () => {
  const fixture = setupFixture();
  const service = createTestService(fixture);
  const created = await service.createSession({
    rolePresetSlug: "role-conceptual-theory-companion",
    kbDomain: "ep-core",
    soulSlug: "soul-latest",
  });
  const managed = (service as any).sessions.get(created.sessionId);
  managed.session.sessionManager.appendMessage({
    role: "user",
    content: [{ type: "text", text: "imported history marker" }],
    timestamp: Date.now(),
  });
  managed.session.sessionManager.appendMessage({
    role: "assistant",
    content: [{ type: "text", text: "imported answer marker" }],
    timestamp: Date.now(),
  });
  const importedLeaf = managed.session.sessionManager.getLeafId();
  assert.match(
    service
      .getTranscript(created.sessionId)
      .map((message) => message.text)
      .join("\n"),
    /imported answer marker/,
  );
  await service.disposeAll();

  const reopenedService = createTestService(fixture);
  try {
    const reopened = await reopenedService.openSession(created.sessionId, {
      rolePresetSlug: "role-conceptual-theory-companion",
      kbDomain: "ep-core",
      soulSlug: "soul-latest",
    });
    const reopenedManaged = (reopenedService as any).sessions.get(
      reopened.sessionId,
    );
    assert.equal(
      reopenedManaged.session.sessionManager.getLeafId(),
      importedLeaf,
    );
    const context = reopenedManaged.session.sessionManager
      .buildSessionContext()
      .messages.map((message: any) => JSON.stringify(message))
      .join("\n");
    assert.match(context, /imported history marker/);
    assert.match(context, /imported answer marker/);
  } finally {
    await reopenedService.disposeAll();
  }
});

test("SessionService preserves imported history after an interrupted first run", async () => {
  const fixture = setupFixture();
  const service = createTestService(fixture);
  const created = await service.createSession({
    rolePresetSlug: "role-conceptual-theory-companion",
    kbDomain: "ep-core",
    soulSlug: "soul-latest",
  });
  const managed = (service as any).sessions.get(created.sessionId);
  managed.session.sessionManager.appendMessage({
    role: "user",
    content: [{ type: "text", text: "history before Alt" }],
    timestamp: Date.now(),
  });
  managed.session.prompt = async () => {
    managed.session.sessionManager.appendMessage({
      role: "user",
      content: [{ type: "text", text: "partial first Alt turn" }],
      timestamp: Date.now(),
    });
    managed.session.sessionManager.appendMessage({
      role: "assistant",
      content: [{ type: "text", text: "partial answer" }],
      timestamp: Date.now(),
    });
    // Interruption is only classified from a typed abort (or Alt's explicit
    // stop) — never from message text (v1.4.7).
    const abortError = new Error("Operation aborted");
    abortError.name = "AbortError";
    throw abortError;
  };
  await assert.rejects(
    service.runPrompt(created.sessionId, "first Alt turn").completion,
    /aborted/,
  );
  const abortedRun = latestRunSnapshots(
    service.getManifest(created.sessionId).recordsDir,
  ).at(-1)!;
  assert.equal(abortedRun.status, "interrupted");
  assert.equal(abortedRun.interruptionCause, "unknown");
  assert.ok(abortedRun.userEntryId);
  assert.equal(abortedRun.assistantEntryIds.length, 1);
  const failedLeaf = managed.session.sessionManager.getLeafId();
  await service.disposeAll();

  const reopened = createTestService(fixture);
  try {
    await reopened.openSession(created.sessionId, {
      rolePresetSlug: "role-conceptual-theory-companion",
      kbDomain: "ep-core",
      soulSlug: "soul-latest",
    });
    const reopenedManaged = (reopened as any).sessions.get(created.sessionId);
    assert.equal(reopenedManaged.session.sessionManager.getLeafId(), failedLeaf);
    assert.match(
      JSON.stringify(
        reopenedManaged.session.sessionManager.buildSessionContext().messages,
      ),
      /history before Alt/,
    );
  } finally {
    await reopened.disposeAll();
  }
});

test("SessionService records user Stop as interrupted with a user_abort cause", async () => {
  const fixture = setupFixture();
  const service = createTestService(fixture);
  const created = await service.createSession({
    rolePresetSlug: "role-conceptual-theory-companion",
    kbDomain: "ep-core",
    soulSlug: "soul-latest",
  });
  const managed = (service as any).sessions.get(created.sessionId);
  let rejectPrompt!: (error: Error) => void;
  managed.session.prompt = async (text: string) => {
    managed.session.sessionManager.appendMessage({
      role: "user",
      content: [{ type: "text", text }],
      timestamp: Date.now(),
    });
    await new Promise<void>((_resolve, reject) => {
      rejectPrompt = reject;
    });
  };
  managed.session.abort = async () => rejectPrompt(new Error("Operation aborted"));

  try {
    const run = service.runPrompt(created.sessionId, "stop me");
    await service.abort(created.sessionId, "user_stop", "user_abort");
    await assert.rejects(run.completion, /aborted/);
    const stopped = latestRunSnapshots(
      service.getManifest(created.sessionId).recordsDir,
    ).at(-1)!;
    assert.equal(stopped.status, "interrupted");
    assert.equal(stopped.interruptionCause, "user_abort");
    assert.equal(
      service.getSnapshot(created.sessionId).recovery?.canContinue,
      true,
    );
  } finally {
    await service.disposeAll();
  }
});

test("a provider error containing 'interrupt' without an explicit stop is a failure", async () => {
  const fixture = setupFixture();
  const service = createTestService(fixture);
  const created = await service.createSession({
    rolePresetSlug: "role-conceptual-theory-companion",
    kbDomain: "ep-core",
    soulSlug: "soul-latest",
  });
  const managed = (service as any).sessions.get(created.sessionId);
  managed.session.prompt = async (text: string) => {
    managed.session.sessionManager.appendMessage({
      role: "user",
      content: [{ type: "text", text }],
      timestamp: Date.now(),
    });
    throw new Error("Connection interrupted by provider");
  };

  try {
    await assert.rejects(
      service.runPrompt(created.sessionId, "go").completion,
      /interrupted by provider/,
    );
    const failedRun = latestRunSnapshots(
      service.getManifest(created.sessionId).recordsDir,
    ).at(-1)!;
    assert.equal(failedRun.status, "failed");
    assert.equal(failedRun.interruptionCause ?? null, null);
  } finally {
    await service.disposeAll();
  }
});

test("SessionService reconciles a crash-interrupted accepted run and continues from its durable tail", async () => {
  const fixture = setupFixture();
  const service = createTestService(fixture);
  const created = await service.createSession({
    rolePresetSlug: "role-conceptual-theory-companion",
    kbDomain: "ep-core",
    soulSlug: "soul-latest",
  });
  const managed = (service as any).sessions.get(created.sessionId);
  managed.session.prompt = async (text: string) => {
    managed.session.sessionManager.appendMessage({
      role: "user",
      content: [{ type: "text", text }],
      timestamp: Date.now(),
    });
    managed.session.sessionManager.appendMessage({
      role: "assistant",
      content: [{ type: "text", text: `answer:${text}` }],
      timestamp: Date.now(),
    });
  };
  await service.runPrompt(created.sessionId, "completed turn").completion;

  const recordsDir = service.getManifest(created.sessionId).recordsDir;
  const acceptedAt = new Date().toISOString();
  appendRunRecord(recordsDir, {
    sessionId: created.sessionId,
    branchId: "main",
    turnId: "turn-000002",
    revisionId: "rev-000002",
    runId: "run-000002",
    status: "accepted",
    piSessionFile: managed.session.sessionFile ?? null,
    userEntryId: null,
    assistantEntryIds: [],
    supersedesRunId: null,
    acceptedAt,
    completedAt: null,
  });
  const interruptedUserId = managed.session.sessionManager.appendMessage({
    role: "user",
    content: [{ type: "text", text: "long interrupted task" }],
    timestamp: Date.now(),
  });
  const interruptedAssistantId = managed.session.sessionManager.appendMessage({
    role: "assistant",
    content: [{ type: "text", text: "durable partial work" }],
    timestamp: Date.now(),
  });
  await service.disposeAll();

  const reopenedService = createTestService(fixture);
  try {
    await reopenedService.openSession(created.sessionId, {
      rolePresetSlug: "role-conceptual-theory-companion",
      kbDomain: "ep-core",
      soulSlug: "soul-latest",
    });
    const interrupted = latestRunSnapshots(recordsDir).at(-1)!;
    assert.equal(interrupted.status, "interrupted");
    assert.equal(interrupted.interruptionCause, "process_exit");
    assert.equal(interrupted.userEntryId, interruptedUserId);
    assert.deepEqual(interrupted.assistantEntryIds, [interruptedAssistantId]);
    assert.deepEqual(reopenedService.getSnapshot(created.sessionId).recovery, {
      outcome: "interrupted",
      interruptionCause: "process_exit",
      userEntryId: interruptedUserId,
      canContinue: true,
      canRetryFromStart: true,
    });

    const reopenedManaged = (reopenedService as any).sessions.get(
      created.sessionId,
    );
    assert.equal(
      reopenedManaged.session.sessionManager.getLeafId(),
      interruptedAssistantId,
    );
    assert.match(
      reopenedService
        .getTranscript(created.sessionId)
        .map((message) => message.text)
        .join("\n"),
      /durable partial work/,
    );

    let contextBeforeContinue = "";
    reopenedManaged.session.prompt = async (text: string) => {
      contextBeforeContinue = JSON.stringify(
        reopenedManaged.session.sessionManager.buildSessionContext().messages,
      );
      reopenedManaged.session.sessionManager.appendMessage({
        role: "user",
        content: [{ type: "text", text }],
        timestamp: Date.now(),
      });
      reopenedManaged.session.sessionManager.appendMessage({
        role: "assistant",
        content: [{ type: "text", text: "continued answer" }],
        timestamp: Date.now(),
      });
    };
    await reopenedService.runPrompt(created.sessionId, "continue").completion;
    assert.match(contextBeforeContinue, /long interrupted task/);
    assert.match(contextBeforeContinue, /durable partial work/);
  } finally {
    await reopenedService.disposeAll();
  }
});

test("related and root Helper sessions stay visible and invoke their skill once", async () => {
  const fixture = setupFixture();
  writeFileSync(
    join(fixture.skillsDir, "alt-theory-help.md"),
    "---\nname: alt-theory-help\ndescription: Test helper\n---\nCheck current docs.\n",
    "utf-8",
  );
  const service = createTestService(fixture, "internal");
  const parent = await service.createSession({
    rolePresetSlug: "role-conceptual-theory-companion",
    kbDomain: "ep-core",
    soulSlug: "soul-latest",
  });
  const managed = (service as any).sessions.get(parent.sessionId);
  managed.session.sessionManager.appendMessage({
    role: "user",
    content: [{ type: "text", text: "parent-only context" }],
    timestamp: Date.now(),
  });
  try {
    managed.busy = true;
    const helper = await service.createRelatedSession(
      parent.sessionId,
      "helper",
    );
    managed.busy = false;
    const helperDetail = readSessionDetail(fixture.dataDir, helper.sessionId);
    const helperHeader = readV4SessionHeader(
      service.getManifest(helper.sessionId).recordsDir,
    );
    assert.deepEqual(helperDetail?.transcript ?? [], []);
    assert.deepEqual(helperHeader?.forkedFrom, {
      sessionId: parent.sessionId,
      purpose: "helper",
    });
    assert.equal(
      service
        .getManifest(helper.sessionId)
        .skills?.some((skill) => skill.name === "alt-theory-help"),
      true,
    );
    assert.equal(
      latestRunSnapshots(service.getManifest(helper.sessionId).recordsDir)
        .length,
      0,
    );

    let helperPrompt = "";
    const helperManaged = (service as any).sessions.get(helper.sessionId);
    helperManaged.session.prompt = async (text: string) => {
      helperPrompt = text;
    };
    await service.runPrompt(helper.sessionId, "How do I start locally?")
      .completion;
    assert.equal(
      helperPrompt,
      "/skill:alt-theory-help How do I start locally?",
    );

    await service.runPrompt(helper.sessionId, "Where is that button?")
      .completion;
    assert.equal(helperPrompt, "Where is that button?");

    assert.equal(helperHeader?.forkedFrom?.purpose, "helper");

    const rootHelper = await service.createSession(
      {
        rolePresetSlug: "role-conceptual-theory-companion",
        kbDomain: "ep-core",
        soulSlug: "soul-latest",
      },
      { helper: true },
    );
    let rootPrompt = "";
    const rootManaged = (service as any).sessions.get(rootHelper.sessionId);
    rootManaged.session.prompt = async (text: string) => {
      rootPrompt = text;
    };
    await service.runPrompt(rootHelper.sessionId, "Help me configure a model.")
      .completion;
    assert.equal(
      rootPrompt,
      "/skill:alt-theory-help Help me configure a model.",
    );
    const rootHeader = readV4SessionHeader(
      service.getManifest(rootHelper.sessionId).recordsDir,
    );
    assert.equal(rootHeader?.helper, true);
    assert.equal(rootHeader?.forkedFrom, undefined);
  } finally {
    await service.disposeAll();
  }
});

test("imported session invokes imported-session-context skill once on first run", async () => {
  const fixture = setupFixture();
  writeFileSync(
    join(fixture.skillsDir, "imported-session-context.md"),
    "---\nname: imported-session-context\ndescription: Imported session context\n---\nExplain import losses.\n",
    "utf-8",
  );
  const service = createTestService(fixture, "internal");
  const created = await service.createSession({
    rolePresetSlug: "role-conceptual-theory-companion",
    kbDomain: "ep-core",
    soulSlug: "soul-latest",
  });
  const manifest = service.getManifest(created.sessionId);
  writeFileSync(
    join(manifest.recordsDir, "session-import-source.json"),
    JSON.stringify({
      schemaVersion: 1,
      recordType: "session-import-source",
      importedSessionId: null,
      harness: "codex",
      importedAt: new Date().toISOString(),
      transformations: [],
    }),
    "utf-8",
  );
  try {
    let prompt = "";
    const managed = (service as any).sessions.get(created.sessionId);
    managed.session.prompt = async (text: string) => {
      prompt = text;
    };
    await service.runPrompt(created.sessionId, "Continue the imported work.")
      .completion;
    assert.equal(
      prompt,
      "/skill:imported-session-context Continue the imported work.",
    );

    await service.runPrompt(created.sessionId, "Second turn stays plain.")
      .completion;
    assert.equal(prompt, "Second turn stays plain.");
  } finally {
    await service.disposeAll();
  }
});

test("imported session without a soul resumes with the current default soul", async () => {
  const fixture = setupFixture();
  const original = createTestService(fixture);
  const created = await original.createSession({
    rolePresetSlug: "role-conceptual-theory-companion",
    kbDomain: "ep-core",
    soulSlug: "soul-latest",
  });
  const managed = (original as any).sessions.get(created.sessionId);
  managed.session.prompt = async (text: string) => {
    managed.session.sessionManager.appendMessage({
      role: "user",
      content: [{ type: "text", text }],
      timestamp: Date.now(),
    });
    managed.session.sessionManager.appendMessage({
      role: "assistant",
      content: [{ type: "text", text: "Imported answer" }],
      timestamp: Date.now(),
    });
  };
  await original.runPrompt(created.sessionId, "Imported history").completion;
  await original.replaceSession(
    created.sessionId,
    {
      rolePresetSlug: "role-conceptual-theory-companion",
      kbDomain: "ep-core",
      soulSlug: null,
    },
    "soul_switch",
  );
  const recordsDir = original.getManifest(created.sessionId).recordsDir;
  writeFileSync(
    join(recordsDir, "session-import-source.json"),
    JSON.stringify({ recordType: "session-import-source" }),
    "utf-8",
  );
  await original.disposeAll();

  const reopened = createTestService(fixture);
  try {
    const snapshot = await reopened.openSession(created.sessionId, {
      rolePresetSlug: "role-conceptual-theory-companion",
      kbDomain: "ep-core",
      soulSlug: "soul-latest",
    });
    assert.equal(snapshot.soulSlug, "soul-latest");
    assert.equal(
      reopened.getManifest(created.sessionId).soul?.slug,
      "soul-latest",
    );
  } finally {
    await reopened.disposeAll();
  }
});

test("forkSession applies per-arm selector overrides (A/B substrate)", async () => {
  const fixture = setupFixture();
  const service = createTestService(fixture);
  const created = await service.createSession({
    rolePresetSlug: "role-conceptual-theory-companion",
    kbDomain: "ep-core",
    soulSlug: "soul-latest",
  });
  const managed = (service as any).sessions.get(created.sessionId);
  managed.session.sessionManager.appendMessage({
    role: "user",
    content: [{ type: "text", text: "ab source" }],
    timestamp: Date.now(),
  });
  const forkPoint = managed.session.sessionManager.appendMessage({
    role: "assistant",
    content: [{ type: "text", text: "ab answer" }],
    timestamp: Date.now(),
  });
  try {
    // A/B needs N arms off the SAME live parent: forking must copy the
    // parent's persisted path without mutating or restarting the parent.
    const arms = [];
    for (const overrides of [{ soulSlug: null }, {}, { kbDomain: "none" }]) {
      arms.push(
        await service.forkSession(
          created.sessionId,
          "ab-arm",
          forkPoint,
          overrides,
        ),
      );
    }
    assert.equal(new Set(arms.map((a) => a.sessionId)).size, 3);
    assert.equal(
      service.getManifest(created.sessionId).soul?.slug,
      "soul-latest",
    );
    assert.equal(service.getManifest(arms[0].sessionId).soul?.slug, null);
    assert.equal(service.getManifest(arms[2].sessionId).kb.domain, "none");
    for (const arm of arms) {
      const detail = readSessionDetail(fixture.dataDir, arm.sessionId);
      assert.equal(detail?.transcript.at(-1)?.text, "ab answer");
      assert.deepEqual(detail?.session.forkedFrom, {
        sessionId: created.sessionId,
        purpose: "ab-arm",
      });
    }
    assert.equal(
      readSessionDetail(fixture.dataDir, created.sessionId)?.session.forkedFrom,
      null,
    );
    // The parent was never disposed: same managed instance, still promptable.
    assert.equal((service as any).sessions.get(created.sessionId), managed);
    managed.session.prompt = async (text: string) => {
      managed.session.sessionManager.appendMessage({
        role: "user",
        content: [{ type: "text", text }],
        timestamp: Date.now(),
      });
    };
    await service.runPrompt(created.sessionId, "parent continues").completion;
    assert.equal(
      readSessionDetail(fixture.dataDir, created.sessionId)?.transcript.at(-1)
        ?.text,
      "parent continues",
    );
  } finally {
    await service.disposeAll();
  }
});

test("generateAbComparison runs Understand-pinned arms and records candidates on the parent", async () => {
  const fixture = setupFixture();
  const service = createTestService(fixture);
  const created = await service.createSession({
    rolePresetSlug: "role-conceptual-theory-companion",
    kbDomain: "ep-core",
    soulSlug: "soul-latest",
  });
  const managed = (service as any).sessions.get(created.sessionId);
  managed.session.sessionManager.appendMessage({
    role: "user",
    content: [{ type: "text", text: "compare source" }],
    timestamp: Date.now(),
  });
  managed.session.sessionManager.appendMessage({
    role: "assistant",
    content: [{ type: "text", text: "compare answer" }],
    timestamp: Date.now(),
  });
  // Arms are created inside the generator, so stub each one's prompt lazily
  // at run time instead of per-session up front.
  const realRun = (service as any).runPromptWithLineage.bind(service);
  (service as any).runPromptWithLineage = (
    armManaged: any,
    text: string,
    options?: any,
  ) => {
    armManaged.session.prompt = async (t: string) => {
      armManaged.session.sessionManager.appendMessage({
        role: "user",
        content: [{ type: "text", text: t }],
        timestamp: Date.now(),
      });
      armManaged.session.sessionManager.appendMessage({
        role: "assistant",
        content: [
          { type: "text", text: `arm:${armManaged.manifest.sessionId}` },
        ],
        timestamp: Date.now(),
      });
    };
    return realRun(armManaged, text, options);
  };
  try {
    const record = await service.generateAbComparison(
      created.sessionId,
      "which framing is better?",
      [
        { label: "with-soul" },
        { label: "no-soul", selectorOverrides: { soulSlug: null } },
      ],
    );
    assert.equal(record.candidates.length, 2);
    assert.equal(record.trigger, "backend_request");
    for (const candidate of record.candidates) {
      assert.equal(candidate.outputText, `arm:${candidate.candidateId}`);
      const armManaged = (service as any).sessions.get(candidate.candidateId);
      assert.equal(armManaged.getAltMode(), "understand");
    }
    assert.equal(record.candidates[0].role, "role-conceptual-theory-companion");
    // The record lands on the PARENT's records dir and the parent is untouched.
    const stored = readAbComparisonRecords(
      join(fixture.dataDir, "sessions", created.sessionId, "records"),
    );
    assert.equal(stored.length, 1);
    assert.equal(stored[0].comparisonId, record.comparisonId);
    assert.equal((service as any).sessions.get(created.sessionId), managed);
    // A bad arm fails the whole request before any arm is created.
    const sessionCountBefore = (service as any).sessions.size;
    await assert.rejects(
      () =>
        service.generateAbComparison(created.sessionId, "prompt", [
          { selectorOverrides: { kbDomain: "no-such-domain" } },
          {},
        ]),
      /Unknown KB domain/,
    );
    assert.equal((service as any).sessions.size, sessionCountBefore);
  } finally {
    await service.disposeAll();
  }
});

test("SessionService cleans unactivated comparison fork artifacts", async () => {
  const fixture = setupFixture();
  const service = createTestService(fixture);
  const created = await service.createSession({
    rolePresetSlug: "role-conceptual-theory-companion",
    kbDomain: "ep-core",
    soulSlug: "soul-latest",
  });
  const managed = (service as any).sessions.get(created.sessionId);
  managed.session.sessionManager.appendMessage({
    role: "user",
    content: [{ type: "text", text: "fork source" }],
    timestamp: Date.now(),
  });
  const forkPoint = managed.session.sessionManager.appendMessage({
    role: "assistant",
    content: [{ type: "text", text: "fork answer" }],
    timestamp: Date.now(),
  });
  (service as any).openManagedRuntime = async () => {
    throw new Error("forced fork open failure");
  };

  try {
    await assert.rejects(
      () => service.forkSession(created.sessionId, "ab-arm", forkPoint),
      /forced fork open failure/,
    );
    const detail = readSessionDetail(fixture.dataDir, created.sessionId);
    assert.equal(detail?.session.sessionId, created.sessionId);
    assert.equal(readdirSync(join(fixture.dataDir, "sessions")).length, 1);
  } finally {
    await service.disposeAll();
  }
});

test("SessionService creates owned sessions with role condition and consent snapshot", async () => {
  const fixture = setupFixture();
  const service = createTestService(fixture);
  const snapshot = await service.createSession(
    {
      rolePresetSlug: "role-conceptual-theory-companion",
      kbDomain: "ep-core",
      soulSlug: "soul-latest",
    },
    {
      ownerAccountId: "p01",
      roleCondition: "conceptual-theory",
      visibility: "research",
      consentSnapshot: {
        researcherReadable: true,
        quoteAfterAnonymization: true,
        privateOverride: false,
      },
    },
  );

  try {
    const manifest = service.getManifest(snapshot.sessionId);
    const sessionRecord = JSON.parse(
      readFileSync(join(manifest.recordsDir, "session.json"), "utf-8"),
    );
    assert.equal(sessionRecord.ownerAccountId, "p01");
    assert.equal(sessionRecord.roleCondition, "conceptual-theory");
    assert.equal(sessionRecord.visibility, "research");
    assert.deepEqual(sessionRecord.consentSnapshot, {
      researcherReadable: true,
      quoteAfterAnonymization: true,
      privateOverride: false,
    });
    assert.match(sessionRecord.lastActivityAt, /^\d{4}-\d{2}-\d{2}T/);
    assert.equal(sessionRecord.retentionDueAt, null);
  } finally {
    await service.disposeAll();
  }
});

test("hosted: private sessions carry a retention date and prompts refresh it", async () => {
  const fixture = setupFixture();
  const service = createTestService(fixture, "clean", false);
  const snapshot = await service.createSession(
    {
      rolePresetSlug: "role-conceptual-theory-companion",
      kbDomain: "ep-core",
      soulSlug: "soul-latest",
    },
    {
      ownerAccountId: "p01",
      roleCondition: "conceptual-theory",
      visibility: "private",
      consentSnapshot: {
        researcherReadable: true,
        quoteAfterAnonymization: true,
        privateOverride: false,
      },
    },
  );
  const managed = (
    service as unknown as {
      sessions: Map<
        string,
        {
          session: {
            prompt(text: string): Promise<void>;
            sessionManager: { appendMessage(message: unknown): string };
          };
        }
      >;
    }
  ).sessions.get(snapshot.sessionId)!;
  managed.session.prompt = async (text: string) => {
    managed.session.sessionManager.appendMessage({
      role: "user",
      content: [{ type: "text", text }],
      timestamp: Date.now(),
    });
  };

  try {
    const manifest = service.getManifest(snapshot.sessionId);
    const sessionPath = join(manifest.recordsDir, "session.json");
    const createdRecord = JSON.parse(readFileSync(sessionPath, "utf-8"));
    assert.equal(createdRecord.visibility, "private");
    assert.equal(createdRecord.consentSnapshot.privateOverride, true);
    assert.match(createdRecord.retentionDueAt, /^\d{4}-\d{2}-\d{2}T/);

    const stale = {
      ...createdRecord,
      lastActivityAt: "2026-06-01T00:00:00.000Z",
      retentionDueAt: "2026-06-08T00:00:00.000Z",
    };
    writeFileSync(sessionPath, `${JSON.stringify(stale, null, 2)}\n`, "utf-8");
    assert.equal(
      readSessionDetail(fixture.dataDir, snapshot.sessionId)?.session
        .visibility,
      "private",
    );
    const afterDetailRead = JSON.parse(readFileSync(sessionPath, "utf-8"));
    assert.equal(afterDetailRead.lastActivityAt, stale.lastActivityAt);
    assert.equal(afterDetailRead.retentionDueAt, stale.retentionDueAt);

    const run = service.runPrompt(snapshot.sessionId, "refresh private");
    await run.completion;
    const refreshed = JSON.parse(readFileSync(sessionPath, "utf-8"));
    assert.equal(refreshed.visibility, "private");
    assert.equal(refreshed.consentSnapshot.privateOverride, true);
    assert.notEqual(refreshed.lastActivityAt, stale.lastActivityAt);
    assert.notEqual(refreshed.retentionDueAt, stale.retentionDueAt);
  } finally {
    await service.disposeAll();
  }
});

test("hosted retention protects attached or running sessions, not idle cache entries", async () => {
  const fixture = setupFixture();
  const service = createTestService(fixture, "clean", false);
  const snapshot = await service.createSession(
    {
      rolePresetSlug: "role-conceptual-theory-companion",
      kbDomain: "ep-core",
      soulSlug: "soul-latest",
    },
    { visibility: "private" },
  );
  const manifest = service.getManifest(snapshot.sessionId);
  const sessionPath = join(manifest.recordsDir, "session.json");
  const stale = {
    ...JSON.parse(readFileSync(sessionPath, "utf-8")),
    lastActivityAt: "2026-06-01T00:00:00.000Z",
    retentionDueAt: "2026-06-08T00:00:00.000Z",
  };
  writeFileSync(sessionPath, `${JSON.stringify(stale, null, 2)}\n`, "utf-8");
  const now = new Date("2026-06-09T00:00:00.000Z");
  const detach = service.attach(snapshot.sessionId, () => {});

  try {
    assert.deepEqual(
      hardDeleteExpiredPrivateSessions(
        fixture.dataDir,
        now,
        (id) => service.isOpen(id),
      ).deleted.map((record) => record.sessionId),
      [],
    );
    detach();
    const managed = (service as any).sessions.get(snapshot.sessionId);
    managed.runState.begin();
    assert.deepEqual(
      hardDeleteExpiredPrivateSessions(
        fixture.dataDir,
        now,
        (id) => service.isOpen(id),
      ).deleted.map((record) => record.sessionId),
      [],
    );
    managed.runState.settle();
    assert.deepEqual(
      hardDeleteExpiredPrivateSessions(
        fixture.dataDir,
        now,
        (id) => service.isOpen(id),
      ).deleted.map((record) => record.sessionId),
      [snapshot.sessionId],
    );
  } finally {
    detach();
    await service.disposeAll();
  }
});

test("hosted private fork gets its own retention window", async () => {
  const fixture = setupFixture();
  const service = createTestService(fixture, "clean", false);
  const parent = await service.createSession(
    {
      rolePresetSlug: "role-conceptual-theory-companion",
      kbDomain: "ep-core",
      soulSlug: "soul-latest",
    },
    { visibility: "private" },
  );
  const parentPath = join(
    service.getManifest(parent.sessionId).recordsDir,
    "session.json",
  );
  const parentHeader = JSON.parse(readFileSync(parentPath, "utf-8"));
  writeFileSync(
    parentPath,
    `${JSON.stringify(
      {
        ...parentHeader,
        lastActivityAt: "2026-06-01T00:00:00.000Z",
        retentionDueAt: "2026-06-08T00:00:00.000Z",
      },
      null,
      2,
    )}\n`,
    "utf-8",
  );
  const managed = (service as any).sessions.get(parent.sessionId);
  managed.session.sessionManager.appendMessage({
    role: "user",
    content: [{ type: "text", text: "fork me" }],
    timestamp: Date.now(),
  });

  try {
    const fork = await service.forkSession(parent.sessionId, "side");
    const child = readV4SessionHeader(
      service.getManifest(fork.sessionId).recordsDir,
    );
    assert.equal(child?.visibility, "private");
    assert.notEqual(child?.retentionDueAt, "2026-06-08T00:00:00.000Z");
    assert.ok(
      Date.parse(child?.retentionDueAt ?? "") >
        Date.parse(child?.lastActivityAt ?? ""),
    );
  } finally {
    await service.disposeAll();
  }
});

/**
 * The regression this whole split exists to prevent: locally, marking a
 * conversation withheld must never give it an expiry. Before the fix, local
 * conversations defaulted to "private" AND "private" meant "delete after 7
 * inactive days" — so the safest-sounding default was the destructive one.
 */
test("local: a withheld conversation never gets a retention date", async () => {
  const fixture = setupFixture();
  const service = createTestService(fixture);
  const snapshot = await service.createSession(
    {
      rolePresetSlug: "role-conceptual-theory-companion",
      kbDomain: "ep-core",
      soulSlug: "soul-latest",
    },
    { visibility: "no-export" },
  );
  try {
    const sessionPath = join(
      service.getManifest(snapshot.sessionId).recordsDir,
      "session.json",
    );
    const created = JSON.parse(readFileSync(sessionPath, "utf-8"));
    assert.equal(created.visibility, "no-export");
    // Withheld from a future export, but consent-wise identical to hosted
    // private: never readable by a research team.
    assert.equal(created.consentSnapshot.privateOverride, true);
    assert.equal(created.retentionDueAt, null);

    // Even switching the marker by hand cannot introduce one.
    service.setVisibility(snapshot.sessionId, "exportable");
    service.setVisibility(snapshot.sessionId, "no-export");
    const after = JSON.parse(readFileSync(sessionPath, "utf-8"));
    assert.equal(after.visibility, "no-export");
    assert.equal(after.retentionDueAt, null);
  } finally {
    await service.disposeAll();
  }
});

test("SessionService switches role and soul inside the same materialized session", async () => {
  const fixture = setupFixture();
  const service = createTestService(fixture);
  const snapshot = await service.createSession({
    rolePresetSlug: "role-conceptual-theory-companion",
    kbDomain: "ep-core",
    soulSlug: "soul-latest",
  });

  try {
    const managed = (service as any).sessions.get(snapshot.sessionId);
    managed.session.sessionManager.appendMessage({
      role: "assistant",
      content: [{ type: "text", text: "history before config switch" }],
      api: "openai-completions",
      provider: "test",
      model: "test",
      usage: {
        input: 0,
        output: 0,
        cacheRead: 0,
        cacheWrite: 0,
        totalTokens: 0,
        cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
      },
      stopReason: "stop",
      timestamp: Date.now(),
    } as any);

    const beforeManifest = service.getManifest(snapshot.sessionId);
    const kbSwitched = service.setKbDomain(snapshot.sessionId, "all");
    assert.equal(kbSwitched.sessionId, snapshot.sessionId);
    assert.equal(kbSwitched.currentDomain, "all");
    const switchedRole = await service.replaceSession(
      snapshot.sessionId,
      {
        rolePresetSlug: "alternate",
        kbDomain: "all",
        soulSlug: "soul-latest",
      },
      "test_role_switch",
    );
    const switchedSoul = await service.replaceSession(
      snapshot.sessionId,
      {
        rolePresetSlug: "alternate",
        kbDomain: "all",
        soulSlug: "soul-test",
      },
      "test_soul_switch",
    );
    const afterManifest = service.getManifest(snapshot.sessionId);

    assert.equal(switchedRole.sessionId, snapshot.sessionId);
    assert.equal(switchedSoul.sessionId, snapshot.sessionId);
    assert.equal(afterManifest.sessionCwd, beforeManifest.sessionCwd);
    assert.equal(afterManifest.piSessionDir, beforeManifest.piSessionDir);
    assert.equal(afterManifest.rolePreset.slug, "alternate");
    assert.equal(afterManifest.soul.slug, "soul-test");

    const detail = readSessionDetail(fixture.dataDir, snapshot.sessionId);
    assert.equal(
      detail?.transcriptPreview.at(-1)?.text,
      "history before config switch",
    );
    assert.equal(detail?.effectiveConfig?.rolePresetSlug, "alternate");
    assert.equal(detail?.effectiveConfig?.soulSlug, "soul-test");
    assert.equal(detail?.configEvents.length, 4);
    assert.deepEqual(
      readConfigEvents(afterManifest.recordsDir).map((event) => ({
        reason: event.reason,
        changedFields: event.changedFields,
      })),
      [
        { reason: "creation", changedFields: [] },
        { reason: "user_change", changedFields: ["kbDomain"] },
        { reason: "user_change", changedFields: ["rolePresetSlug"] },
        { reason: "user_change", changedFields: ["soulSlug"] },
      ],
    );
  } finally {
    await service.disposeAll();
  }
});

test("SessionService can disable kb-folder retrieval without disabling the session", async () => {
  const fixture = setupFixture();
  const service = createTestService(fixture);
  const snapshot = await service.createSession({
    rolePresetSlug: "role-conceptual-theory-companion",
    kbDomain: "ep-core",
    soulSlug: "soul-latest",
  });

  try {
    const switched = service.setKbDomain(snapshot.sessionId, "none");
    assert.equal(switched.sessionId, snapshot.sessionId);
    assert.equal(switched.currentDomain, "none");

    const detail = readSessionDetail(fixture.dataDir, snapshot.sessionId);
    assert.equal(detail?.effectiveConfig?.kbDomain, "none");
    assert.deepEqual(detail?.configEvents.at(-1)?.changedFields, ["kbDomain"]);
  } finally {
    await service.disposeAll();
  }
});

test("SessionService preserves disabled kb-domain when resuming an existing session", async () => {
  const fixture = setupFixture();
  const service = createTestService(fixture);
  const created = await service.createSession({
    rolePresetSlug: "role-conceptual-theory-companion",
    kbDomain: "ep-core",
    soulSlug: "soul-latest",
  });

  try {
    service.setKbDomain(created.sessionId, "none");
    const managed = (
      service as unknown as {
        sessions: Map<
          string,
          {
            session: {
              sessionManager: { appendMessage(message: unknown): void };
            };
          }
        >;
      }
    ).sessions.get(created.sessionId)!;
    managed.session.sessionManager.appendMessage({
      role: "assistant",
      content: [{ type: "text", text: "existing conversation before resume" }],
      timestamp: Date.now(),
    });
  } finally {
    await service.disposeAll();
  }

  const resumedService = createTestService(fixture);
  try {
    const reopened = await resumedService.openSession(created.sessionId, {
      rolePresetSlug: "role-conceptual-theory-companion",
      kbDomain: "ep-core",
      soulSlug: "soul-latest",
    });
    assert.equal(reopened.currentDomain, "none");

    const detail = readSessionDetail(fixture.dataDir, created.sessionId);
    assert.equal(detail?.effectiveConfig?.kbDomain, "none");
  } finally {
    await resumedService.disposeAll();
  }
});

test("SessionService switches custom instruction inside the same materialized session", async () => {
  const fixture = setupFixture();
  const service = createTestService(fixture);
  const created = await service.createSession({
    rolePresetSlug: "role-conceptual-theory-companion",
    kbDomain: "ep-core",
    soulSlug: "soul-latest",
    customInstructionRef: null,
  });

  try {
    const session = (
      service as unknown as {
        sessions: Map<
          string,
          {
            session: {
              sessionManager: { appendMessage(message: unknown): void };
            };
          }
        >;
      }
    ).sessions.get(created.sessionId)!.session;
    session.sessionManager.appendMessage({
      role: "assistant",
      content: [{ type: "text", text: "existing history" }],
      timestamp: Date.now(),
    });

    const before = service.getManifest(created.sessionId);
    const changed = await service.replaceSession(
      created.sessionId,
      {
        ...service.getSelectors(created.sessionId),
        customInstructionRef: "research.rules",
      },
      "instruction_switch",
    );
    const after = service.getManifest(created.sessionId);
    const detail = readSessionDetail(fixture.dataDir, created.sessionId);

    assert.equal(changed.sessionId, created.sessionId);
    assert.equal(after.piSessionFile, before.piSessionFile);
    assert.equal(after.customInstruction.ref, "research.rules");
    assert.match(after.customInstruction.sha256 ?? "", /^[a-f0-9]{64}$/);
    assert.equal(
      detail?.effectiveConfig.customInstruction.ref,
      "research.rules",
    );
    assert.deepEqual(detail?.configEvents.at(-1)?.changedFields, [
      "customInstructionRef",
    ]);
  } finally {
    await service.disposeAll();
  }
});

test("SessionService validates explicit skill invocation against active Alt Theory skills", async () => {
  const fixture = setupFixture();
  const service = new SessionService({
    ...(
      createTestService(fixture) as unknown as {
        config: ConstructorParameters<typeof SessionService>[0];
      }
    ).config,
    resourceDiscovery: "internal",
    skillsDir: fixture.skillsDir,
  });
  const created = await service.createSession({
    rolePresetSlug: "role-conceptual-theory-companion",
    kbDomain: "ep-core",
    soulSlug: "soul-latest",
  });

  try {
    assert.deepEqual(
      service.getManifest(created.sessionId).skills.map((skill) => skill.name),
      ["conversation-summary"],
    );
    assert.throws(
      () => service.invokeSkill(created.sessionId, "debug-only"),
      /Unknown Alt Theory skill/,
    );
    const managed = (
      service as unknown as {
        sessions: Map<
          string,
          { session: { prompt(text: string): Promise<void> } }
        >;
      }
    ).sessions.get(created.sessionId)!;
    let promptText = "";
    managed.session.prompt = async (text: string) => {
      promptText = text;
    };
    const run = service.invokeSkill(
      created.sessionId,
      "conversation-summary",
      "Focus on decisions",
    );
    await run.completion;
    assert.ok(
      promptText.endsWith("/skill:conversation-summary Focus on decisions"),
    );
    const events = readFileSync(
      join(
        fixture.dataDir,
        "sessions",
        created.sessionId,
        "records",
        "session-events.jsonl",
      ),
      "utf-8",
    )
      .trim()
      .split(/\r?\n/)
      .map(
        (line) =>
          JSON.parse(line) as {
            type: string;
            details?: { skillName?: string };
          },
      );
    assert.equal(events.at(-1)?.type, "skill_invoked");
    assert.equal(events.at(-1)?.details?.skillName, "conversation-summary");
  } finally {
    await service.disposeAll();
  }
});

test("SessionService records resume_fallback config event when original assets are missing", async () => {
  const fixture = setupFixture();
  const dirs = createSessionDirs(fixture.dataDir, "resume-fallback-session");
  const original = await createAltTheorySession({
    ...dirs,
    appContextPath: fixture.appContextPath,
    soulPath: join(fixture.soulDir, "soul-test.md"),
    soulSlug: "soul-test",
    rolePresetPath: join(fixture.rolePresetsDir, "alternate.md"),
    rolePresetSlug: "alternate",
    kbDir: fixture.kbDir,
    kbDomain: "ep-core",
    piPromptTemplatesDir: fixture.piPromptTemplatesDir,
    understandReadOnly: true,
    altMode: "understand",
    resourceDiscovery: "clean",
  });

  try {
    original.session.sessionManager.appendMessage({
      role: "assistant",
      content: [{ type: "text", text: "fallback source history" }],
      api: "openai-completions",
      provider: "test",
      model: "test",
      usage: {
        input: 0,
        output: 0,
        cacheRead: 0,
        cacheWrite: 0,
        totalTokens: 0,
        cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
      },
      stopReason: "stop",
      timestamp: Date.now(),
    } as any);
  } finally {
    original.session.dispose();
  }
  rmSync(join(fixture.rolePresetsDir, "alternate.md"));
  rmSync(join(fixture.soulDir, "soul-test.md"));
  const service = createTestService(fixture);
  try {
    const opened = await service.openSession("resume-fallback-session", {
      rolePresetSlug: "role-conceptual-theory-companion",
      kbDomain: "ep-core",
      soulSlug: "soul-latest",
    });
    assert.equal(opened.rolePresetSlug, "role-conceptual-theory-companion");
    assert.equal(opened.soulSlug, "soul-latest");
    const events = readConfigEvents(dirs.recordsDir);
    assert.equal(events.at(-1)?.reason, "resume_fallback");
    assert.deepEqual(events.at(-1)?.changedFields, [
      "rolePresetSlug",
      "soulSlug",
    ]);
  } finally {
    await service.disposeAll();
  }
});

test("SessionService rejects concurrent same-session prompt mutations with session_busy", async () => {
  const fixture = setupFixture();
  const service = createTestService(fixture);
  const snapshot = await service.createSession({
    rolePresetSlug: "role-conceptual-theory-companion",
    kbDomain: "ep-core",
    soulSlug: "soul-latest",
  });

  try {
    let resolvePrompt: (() => void) | null = null;
    const managed = (service as any).sessions.get(snapshot.sessionId);
    managed.session.prompt = () =>
      new Promise<void>((resolve) => {
        resolvePrompt = resolve;
      });

    const run = service.runPrompt(
      snapshot.sessionId,
      "first prompt without configured model",
    );
    assert.throws(
      () => service.runPrompt(snapshot.sessionId, "second prompt"),
      (error) =>
        error instanceof SessionBusyError && error.code === "session_busy",
    );
    assert.throws(
      () => service.setKbDomain(snapshot.sessionId, "all"),
      (error) =>
        error instanceof SessionBusyError && error.code === "session_busy",
    );
    await assert.rejects(
      () =>
        service.replaceSession(
          snapshot.sessionId,
          {
            rolePresetSlug: "alternate",
            kbDomain: "ep-core",
            soulSlug: "soul-latest",
          },
          "busy_role_switch",
        ),
      (error) =>
        error instanceof SessionBusyError && error.code === "session_busy",
    );
    assert.throws(
      () => service.reviseLatest(snapshot.sessionId, "revised"),
      (error) =>
        error instanceof SessionBusyError && error.code === "session_busy",
    );
    assert.throws(
      () => service.deleteLatest(snapshot.sessionId),
      (error) =>
        error instanceof SessionBusyError && error.code === "session_busy",
    );
    await assert.rejects(
      () => service.forkSession(snapshot.sessionId, "side"),
      (error) =>
        error instanceof SessionBusyError && error.code === "session_busy",
    );
    assert.ok(resolvePrompt);
    resolvePrompt();
    await run.completion;
  } finally {
    await service.disposeAll();
  }
});

test("SessionService runs different conversations concurrently", async () => {
  const fixture = setupFixture();
  const service = createTestService(fixture);
  const first = await service.createSession({
    rolePresetSlug: "role-conceptual-theory-companion",
    kbDomain: "ep-core",
    soulSlug: "soul-latest",
  });
  const second = await service.createSession({
    rolePresetSlug: "role-conceptual-theory-companion",
    kbDomain: "ep-core",
    soulSlug: "soul-latest",
  });

  try {
    const releases: Array<() => void> = [];
    for (const sessionId of [first.sessionId, second.sessionId]) {
      const managed = (service as any).sessions.get(sessionId);
      managed.session.prompt = () =>
        new Promise<void>((resolve) => releases.push(resolve));
    }

    const firstRun = service.runPrompt(first.sessionId, "first");
    const secondRun = service.runPrompt(second.sessionId, "second");
    assert.deepEqual(
      new Set(service.runningSessionIds()),
      new Set([first.sessionId, second.sessionId]),
    );
    assert.equal(service.getSnapshot(first.sessionId).status, "running");
    assert.equal(service.getSnapshot(second.sessionId).status, "running");

    releases.forEach((release) => release());
    await Promise.all([firstRun.completion, secondRun.completion]);
    assert.deepEqual(service.runningSessionIds(), []);
  } finally {
    await service.disposeAll();
  }
});

test("SessionService returns to idle when compaction fails", async () => {
  const fixture = setupFixture();
  const service = createTestService(fixture);
  const snapshot = await service.createSession({
    rolePresetSlug: "role-conceptual-theory-companion",
    kbDomain: "ep-core",
    soulSlug: "soul-latest",
  });
  const managed = (service as any).sessions.get(snapshot.sessionId);
  managed.session.sessionManager.appendMessage({
    role: "user",
    content: [{ type: "text", text: "keep this branch" }],
    timestamp: Date.now(),
  });
  const leafBeforeCompact = managed.session.sessionManager.getLeafId();
  managed.session.compact = async () => {
    managed.session.sessionManager.resetLeaf();
    throw new Error("Nothing to compact (session too small)");
  };
  const events: SessionServiceEvent[] = [];
  service.attach(snapshot.sessionId, (event) => events.push(event));

  try {
    await assert.rejects(
      () => service.compact(snapshot.sessionId),
      /Nothing to compact/,
    );
    assert.equal(events.at(-1)?.type, "session_updated");
    assert.equal(
      events.at(-1)?.type === "session_updated"
        ? events.at(-1)?.payload.status
        : null,
      "idle",
    );
    assert.equal(
      managed.session.sessionManager.getLeafId(),
      leafBeforeCompact,
    );
  } finally {
    await service.disposeAll();
  }
});

test("live transcript projection hides internal skill commands", () => {
  assert.equal(
    displayUserTextFromPrompt("/skill:conversation-summary Focus on decisions"),
    "Focus on decisions",
  );
  assert.equal(
    displayUserTextFromPrompt("/skill:conversation-summary"),
    null,
  );
  assert.equal(
    displayUserTextFromPrompt(
      '<skill name="conversation-summary">expanded body</skill> Focus on decisions',
    ),
    "Focus on decisions",
  );
  assert.equal(displayUserTextFromPrompt("ordinary question"), "ordinary question");
});

test("SessionService publishes the compaction boundary from the live branch immediately", async () => {
  const fixture = setupFixture();
  const service = createTestService(fixture);
  const snapshot = await service.createSession({
    rolePresetSlug: "role-conceptual-theory-companion",
    kbDomain: "ep-core",
    soulSlug: "soul-latest",
  });
  const managed = (service as any).sessions.get(snapshot.sessionId);
  const userEntryId = managed.session.sessionManager.appendMessage({
    role: "user",
    content: [{ type: "text", text: "earlier context" }],
    timestamp: Date.now(),
  });
  managed.session.compact = async () => {
    managed.session.sessionManager.appendCompaction(
      "fresh compact summary",
      userEntryId,
      1200,
    );
  };
  const events: SessionServiceEvent[] = [];
  service.attach(snapshot.sessionId, (event) => events.push(event));

  try {
    await service.compact(snapshot.sessionId);
    const transcriptEvent = events.find(
      (event) => event.type === "session_transcript",
    );
    assert.ok(transcriptEvent?.type === "session_transcript");
    assert.ok(
      transcriptEvent.payload.messages.some(
        (message) =>
          message.marker === "compaction" &&
          message.text === "fresh compact summary",
      ),
    );
  } finally {
    await service.disposeAll();
  }
});

test("a threshold compaction_end publishes the boundary and clears stale context usage", async () => {
  const fixture = setupFixture();
  const service = createTestService(fixture);
  const snapshot = await service.createSession({
    rolePresetSlug: "role-conceptual-theory-companion",
    kbDomain: "ep-core",
    soulSlug: "soul-latest",
  });
  const managed = (service as any).sessions.get(snapshot.sessionId);
  const userEntryId = managed.session.sessionManager.appendMessage({
    role: "user",
    content: [{ type: "text", text: "long conversation" }],
    timestamp: Date.now(),
  });
  managed.session.sessionManager.appendMessage({
    role: "assistant",
    content: [{ type: "text", text: "old answer" }],
    usage: {
      input: 9000,
      output: 500,
      cacheRead: 0,
      cacheWrite: 0,
      totalTokens: 9500,
      cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
    },
    stopReason: "stop",
    timestamp: Date.now(),
  });
  const events: SessionServiceEvent[] = [];
  service.attach(snapshot.sessionId, (event) => events.push(event));

  try {
    // Pre-compaction: the context ring shows a real (stale-to-be) percentage.
    const before = (service as any).buildMetrics(managed).contextUsage;
    assert.ok(before && before.tokens !== null && before.percent !== null);

    (service as any).handleAgentEvent(managed, {
      type: "compaction_start",
      reason: "threshold",
    });
    assert.equal(
      events.at(-1)?.type === "run_phase" ? events.at(-1)?.payload.phase : null,
      "compacting",
    );

    // Pi appends the boundary entry, then emits the completed compaction.
    managed.session.sessionManager.appendCompaction(
      "threshold summary",
      userEntryId,
      9500,
    );
    (service as any).handleAgentEvent(managed, {
      type: "compaction_end",
      reason: "threshold",
      result: {
        summary: "threshold summary",
        firstKeptEntryId: userEntryId,
        tokensBefore: 9500,
      },
      aborted: false,
      willRetry: false,
    });

    const transcriptEvent = [...events]
      .reverse()
      .find((event) => event.type === "session_transcript");
    assert.ok(transcriptEvent?.type === "session_transcript");
    assert.ok(
      transcriptEvent.payload.messages.some(
        (message) =>
          message.marker === "compaction" &&
          message.text === "threshold summary",
      ),
    );
    const metricsEvent = [...events]
      .reverse()
      .find((event) => event.type === "session_metrics");
    assert.ok(metricsEvent?.type === "session_metrics");
    assert.equal(metricsEvent.payload.contextUsage?.tokens, null);
    assert.equal(metricsEvent.payload.contextUsage?.percent, null);
    const persisted = JSON.parse(
      readFileSync(
        join(managed.manifest.recordsDir, "session-metrics.json"),
        "utf-8",
      ),
    );
    assert.equal(persisted.contextUsage.tokens, null);

    // Reopening reproduces the persisted boundary.
    await service.disposeAll();
    const reopened = createTestService(fixture);
    try {
      await reopened.openSession(snapshot.sessionId, {
        rolePresetSlug: "role-conceptual-theory-companion",
        kbDomain: "ep-core",
        soulSlug: "soul-latest",
      });
      const detail = readSessionDetail(fixture.dataDir, snapshot.sessionId);
      assert.ok(
        detail?.transcript.some(
          (message) =>
            message.marker === "compaction" &&
            message.text === "threshold summary",
        ),
      );
    } finally {
      await reopened.disposeAll();
    }
  } finally {
    await service.disposeAll();
  }
});

test("an aborted compaction publishes nothing; an overflow retry keeps the boundary and the turn running", async () => {
  const fixture = setupFixture();
  const service = createTestService(fixture);
  const snapshot = await service.createSession({
    rolePresetSlug: "role-conceptual-theory-companion",
    kbDomain: "ep-core",
    soulSlug: "soul-latest",
  });
  const managed = (service as any).sessions.get(snapshot.sessionId);
  const userEntryId = managed.session.sessionManager.appendMessage({
    role: "user",
    content: [{ type: "text", text: "overflowing turn" }],
    timestamp: Date.now(),
  });
  managed.session.sessionManager.appendMessage({
    role: "assistant",
    content: [{ type: "text", text: "big answer" }],
    usage: {
      input: 15900,
      output: 100,
      cacheRead: 0,
      cacheWrite: 0,
      totalTokens: 16000,
      cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
    },
    stopReason: "stop",
    timestamp: Date.now(),
  });
  const events: SessionServiceEvent[] = [];
  service.attach(snapshot.sessionId, (event) => events.push(event));

  try {
    // Aborted compaction: no completed boundary, back to idle.
    (service as any).handleAgentEvent(managed, {
      type: "compaction_start",
      reason: "overflow",
    });
    (service as any).handleAgentEvent(managed, {
      type: "compaction_end",
      reason: "overflow",
      result: undefined,
      aborted: true,
      willRetry: false,
    });
    assert.equal(
      events.filter((event) => event.type === "session_transcript").length,
      0,
    );
    assert.equal(
      events.at(-1)?.type === "run_phase" ? events.at(-1)?.payload.phase : null,
      "idle",
    );

    // The retried overflow compaction completes: the boundary publishes and
    // the continuing turn keeps the run phase alive.
    managed.session.sessionManager.appendCompaction(
      "overflow summary",
      userEntryId,
      16000,
    );
    (service as any).handleAgentEvent(managed, {
      type: "compaction_end",
      reason: "overflow",
      result: {
        summary: "overflow summary",
        firstKeptEntryId: userEntryId,
        tokensBefore: 16000,
      },
      aborted: false,
      willRetry: true,
    });
    const transcriptEvent = [...events]
      .reverse()
      .find((event) => event.type === "session_transcript");
    assert.ok(transcriptEvent?.type === "session_transcript");
    assert.ok(
      transcriptEvent.payload.messages.some(
        (message) =>
          message.marker === "compaction" &&
          message.text === "overflow summary",
      ),
    );
    assert.equal(
      events.at(-1)?.type === "run_phase" ? events.at(-1)?.payload.phase : null,
      "processing",
    );
    const metricsEvent = [...events]
      .reverse()
      .find((event) => event.type === "session_metrics");
    assert.ok(metricsEvent?.type === "session_metrics");
    assert.equal(metricsEvent.payload.contextUsage?.tokens, null);
  } finally {
    await service.disposeAll();
  }
});

test("SessionService detach removes listeners without disposing the managed session", async () => {
  const fixture = setupFixture();
  const service = createTestService(fixture);
  const snapshot = await service.createSession({
    rolePresetSlug: "role-conceptual-theory-companion",
    kbDomain: "ep-core",
    soulSlug: "soul-latest",
  });

  try {
    let eventCount = 0;
    const detach = service.attach(snapshot.sessionId, () => {
      eventCount++;
    });
    detach();

    assert.equal(
      service.getManifest(snapshot.sessionId).sessionId,
      snapshot.sessionId,
    );
    assert.equal(
      service.getSnapshot(snapshot.sessionId).sessionId,
      snapshot.sessionId,
    );
    await service.abort(snapshot.sessionId, "detach-test");
    assert.equal(eventCount, 0);
  } finally {
    await service.disposeAll();
  }
});

test("SessionService does not re-emit processing for every text delta", async () => {
  const fixture = setupFixture();
  const service = createTestService(fixture);
  const snapshot = await service.createSession({
    rolePresetSlug: "role-conceptual-theory-companion",
    kbDomain: "ep-core",
    soulSlug: "soul-latest",
  });
  const events: SessionServiceEvent[] = [];
  const detach = service.attach(snapshot.sessionId, (event) => events.push(event));

  try {
    const internal = service as any;
    internal.handleAgentEvent(internal.sessions.get(snapshot.sessionId), {
      type: "message_update",
      assistantMessageEvent: { type: "text_delta", delta: "hello" },
    });
    assert.deepEqual(events, [
      { type: "assistant_delta", payload: { text: "hello" } },
    ]);
  } finally {
    detach();
    await service.disposeAll();
  }
});

test("SessionService keeps run completion and busy state open until fallback continuation finishes", async () => {
  const fixture = setupFixture();
  const fallbackConfigPath = join(fixture.root, "model-fallback.json");
  writeFileSync(
    fallbackConfigPath,
    JSON.stringify({
      enabled: true,
      provider: "qwen-bailian-beijing",
      chain: ["qwen3.7-max", "qwen3.7-plus"],
      maxFallbacksPerRun: 2,
      rules: [
        {
          id: "quota",
          action: "exclude_and_fallback",
          match: { anyPattern: ["quota has been exhausted"] },
        },
      ],
    }),
    "utf-8",
  );
  const service = new SessionService({
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
    understandReadOnly: true,
    altMode: "understand",
    resourceDiscovery: "clean",
    instructionsDir: fixture.instructionsDir,
    runLabel: null,
    testBatch: null,
    modelFallbackConfigPath: fallbackConfigPath,
  });
  const created = await service.createSession({
    rolePresetSlug: "role-conceptual-theory-companion",
    kbDomain: "ep-core",
    soulSlug: "soul-latest",
  });
  const internal = service as any;
  const managed = internal.sessions.get(created.sessionId);
  const events: SessionServiceEvent[] = [];
  const detachListener = service.attach(created.sessionId, (event) =>
    events.push(event),
  );
  const continueGate = createDeferred<void>();
  let completionSettled = false;

  let currentModel = {
    provider: "qwen-bailian-beijing",
    id: "qwen3.7-max",
  };
  Object.defineProperty(managed.session, "model", {
    configurable: true,
    get: () => currentModel,
  });
  managed.session.modelRuntime.getModel = (
    provider: string,
    modelId: string,
  ) => ({
    provider,
    id: modelId,
  });
  managed.session.setModel = async (model: unknown) => {
    currentModel = model as { provider: string; id: string };
  };
  managed.session.getSessionStats = () => ({
    tokens: {
      input: 0,
      output: 0,
      cacheRead: 0,
      cacheWrite: 0,
      totalTokens: 0,
    },
    cost: {
      input: 0,
      output: 0,
      cacheRead: 0,
      cacheWrite: 0,
      total: 0,
    },
    contextUsage: null,
  });
  managed.session.waitForRetry = async () => {};
  managed.session.prompt = async (text: string) => {
    managed.session.sessionManager.appendMessage({
      role: "user",
      content: [{ type: "text", text }],
      timestamp: Date.now(),
    });
    managed.session.state.errorMessage =
      "403 quota has been exhausted for this model";
    managed.session.state.messages = [
      { role: "user", content: [{ type: "text", text }] },
      { role: "assistant", content: [{ type: "text", text: "quota error" }] },
    ];
    internal.handleAgentEvent(managed, { type: "agent_end" });
  };
  managed.session.agent.continue = async () => {
    await continueGate.promise;
    managed.session.state.errorMessage = null;
    managed.session.state.messages = [
      { role: "user", content: [{ type: "text", text: "question" }] },
      {
        role: "assistant",
        content: [{ type: "text", text: "fallback answer" }],
      },
    ];
    managed.session.sessionManager.appendMessage({
      role: "assistant",
      content: [{ type: "text", text: "fallback answer" }],
      timestamp: Date.now(),
    });
    internal.handleAgentEvent(managed, { type: "agent_end" });
  };

  try {
    const run = service.runPrompt(created.sessionId, "question");
    void run.completion.finally(() => {
      completionSettled = true;
    });

    await new Promise((resolve) => setTimeout(resolve, 20));
    assert.equal(completionSettled, false);
    assert.throws(
      () => service.runPrompt(created.sessionId, "second question"),
      SessionBusyError,
    );

    continueGate.resolve();
    await run.completion;

    const latest = latestRunSnapshots(
      service.getManifest(created.sessionId).recordsDir,
    )[0];
    assert.equal(latest.status, "completed");
    assert.equal(latest.assistantEntryIds.length, 1);
    assert.equal(currentModel.id, "qwen3.7-plus");
    assert.ok(
      events.some(
        (event) =>
          event.type === "extension_notice" &&
          event.payload.message ===
            "Switched from qwen-bailian-beijing/qwen3.7-max to qwen-bailian-beijing/qwen3.7-plus after a model error.",
      ),
    );
  } finally {
    detachListener();
    await service.disposeAll();
  }
});

test("SessionService surfaces fallback continuation failure through run completion", async () => {
  const fixture = setupFixture();
  const fallbackConfigPath = join(fixture.root, "model-fallback.json");
  writeFileSync(
    fallbackConfigPath,
    JSON.stringify({
      enabled: true,
      provider: "qwen-bailian-beijing",
      chain: ["qwen3.7-max", "qwen3.7-plus"],
      maxFallbacksPerRun: 1,
      rules: [
        {
          id: "quota",
          action: "exclude_and_fallback",
          match: { anyPattern: ["quota has been exhausted"] },
        },
      ],
    }),
    "utf-8",
  );
  const service = new SessionService({
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
    understandReadOnly: true,
    altMode: "understand",
    resourceDiscovery: "clean",
    instructionsDir: fixture.instructionsDir,
    runLabel: null,
    testBatch: null,
    modelFallbackConfigPath: fallbackConfigPath,
  });
  const created = await service.createSession({
    rolePresetSlug: "role-conceptual-theory-companion",
    kbDomain: "ep-core",
    soulSlug: "soul-latest",
  });
  const events: SessionServiceEvent[] = [];
  const detach = service.attach(created.sessionId, (event) => {
    events.push(event);
  });
  const internal = service as any;
  const managed = internal.sessions.get(created.sessionId);

  let currentModel = {
    provider: "qwen-bailian-beijing",
    id: "qwen3.7-max",
  };
  Object.defineProperty(managed.session, "model", {
    configurable: true,
    get: () => currentModel,
  });
  managed.session.modelRuntime.getModel = (
    provider: string,
    modelId: string,
  ) => ({
    provider,
    id: modelId,
  });
  managed.session.setModel = async (model: unknown) => {
    currentModel = model as { provider: string; id: string };
  };
  managed.session.getSessionStats = () => ({
    tokens: {
      input: 0,
      output: 0,
      cacheRead: 0,
      cacheWrite: 0,
      totalTokens: 0,
    },
    cost: {
      input: 0,
      output: 0,
      cacheRead: 0,
      cacheWrite: 0,
      total: 0,
    },
    contextUsage: null,
  });
  managed.session.waitForRetry = async () => {};
  managed.session.prompt = async (text: string) => {
    managed.session.sessionManager.appendMessage({
      role: "user",
      content: [{ type: "text", text }],
      timestamp: Date.now(),
    });
    managed.session.state.errorMessage =
      "403 quota has been exhausted for this model";
    managed.session.state.messages = [
      { role: "user", content: [{ type: "text", text }] },
      { role: "assistant", content: [{ type: "text", text: "quota error" }] },
    ];
    internal.handleAgentEvent(managed, { type: "agent_end" });
  };
  managed.session.agent.continue = async () => {
    managed.session.state.errorMessage = "fallback continue failed";
    throw new Error("fallback continue failed");
  };

  try {
    const run = service.runPrompt(created.sessionId, "question");
    await assert.rejects(run.completion, /fallback continue failed/);

    const latest = latestRunSnapshots(
      service.getManifest(created.sessionId).recordsDir,
    )[0];
    assert.equal(latest.status, "failed");
    assert.equal(managed.runState.isIdle(), true);
    assert.equal(events.at(-1)?.type, "run_failed");
  } finally {
    detach();
    await service.disposeAll();
  }
});

test("session store marks sessions without v0.4 records as legacy projection", async () => {
  const fixture = setupFixture();
  const dirs = createSessionDirs(fixture.dataDir, "legacy-session");
  const created = await createAltTheorySession({
    ...dirs,
    appContextPath: fixture.appContextPath,
    soulPath: join(fixture.soulDir, "soul-latest.md"),
    soulSlug: "soul-latest",
    rolePresetPath: join(
      fixture.rolePresetsDir,
      "role-conceptual-theory-companion.md",
    ),
    rolePresetSlug: "role-conceptual-theory-companion",
    kbDir: fixture.kbDir,
    kbDomain: "ep-core",
    piPromptTemplatesDir: fixture.piPromptTemplatesDir,
    understandReadOnly: true,
    altMode: "understand",
    resourceDiscovery: "clean",
  });

  try {
    created.session.sessionManager.appendMessage({
      role: "assistant",
      content: [{ type: "text", text: "legacy projection" }],
      api: "openai-completions",
      provider: "test",
      model: "test",
      usage: {
        input: 0,
        output: 0,
        cacheRead: 0,
        cacheWrite: 0,
        totalTokens: 0,
        cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
      },
      stopReason: "stop",
      timestamp: Date.now(),
    } as any);
  } finally {
    created.session.dispose();
  }

  const detail = readSessionDetail(fixture.dataDir, "legacy-session");
  assert.equal(detail?.session.recordModel, "legacy-v0.3");
  assert.equal(detail?.session.hasSessionFile, true);
});

test("SessionService switches Alt mode in-session and restores it on reopen", async () => {
  const fixture = setupFixture();
  const service = createTestService(fixture);
  const created = await service.createSession({
    rolePresetSlug: "role-conceptual-theory-companion",
    kbDomain: "ep-core",
    soulSlug: "soul-latest",
  });

  const managed = (
    service as unknown as {
      sessions: Map<
        string,
        {
          session: {
            prompt(text: string): Promise<void>;
            sessionManager: { appendMessage(message: unknown): string };
          };
        }
      >;
    }
  ).sessions.get(created.sessionId)!;
  managed.session.prompt = async (text: string) => {
    managed.session.sessionManager.appendMessage({
      role: "user",
      content: [{ type: "text", text }],
      timestamp: Date.now(),
    });
    managed.session.sessionManager.appendMessage({
      role: "assistant",
      content: [{ type: "text", text: `answer:${text}` }],
      timestamp: Date.now(),
    });
  };

  try {
    assert.equal(created.mode, "understand");
    const run = service.runPrompt(created.sessionId, "hello");
    await run.completion;

    const switched = await service.switchMode(created.sessionId, "work");
    assert.equal(switched.mode, "work");
    assert.equal(switched.sessionId, created.sessionId);

    const manifest = service.getManifest(created.sessionId);
    const header = JSON.parse(
      readFileSync(join(manifest.recordsDir, "session.json"), "utf-8"),
    );
    assert.equal(header.mode, "work");
    const configReasons = readConfigEvents(manifest.recordsDir);
    assert.equal(configReasons.at(-1)?.reason, "user_change");
    assert.deepEqual(configReasons.at(-1)?.changedFields, ["altMode"]);
    assert.equal(configReasons.at(-1)?.effective.altMode, "work");
  } finally {
    await service.disposeAll();
  }

  const reopenedService = createTestService(fixture);
  try {
    const reopened = await reopenedService.openSession(created.sessionId, {
      rolePresetSlug: "role-conceptual-theory-companion",
      kbDomain: "ep-core",
      soulSlug: "soul-latest",
    });
    assert.equal(reopened.mode, "work");
  } finally {
    await reopenedService.disposeAll();
  }
});

test("SessionService materializes draft mode and study tag in the first snapshot", async () => {
  const fixture = setupFixture();
  const service = createTestService(fixture);
  try {
    const created = await service.createSession(
      {
        rolePresetSlug: "role-conceptual-theory-companion",
        kbDomain: "ep-core",
        soulSlug: "soul-latest",
      },
      {
        mode: "work",
        studyTag: { studyId: "draft-study", batch: "a" },
      },
    );
    assert.equal(created.mode, "work");
    assert.deepEqual(created.studyTag, {
      studyId: "draft-study",
      batch: "a",
    });
    const header = JSON.parse(
      readFileSync(
        join(service.getManifest(created.sessionId).recordsDir, "session.json"),
        "utf-8",
      ),
    );
    assert.equal(header.mode, "work");
    assert.deepEqual(header.studyTag, {
      studyId: "draft-study",
      batch: "a",
    });
  } finally {
    await service.disposeAll();
  }
});

test("SessionService creates workspace sessions and restores workspace on reopen", async () => {
  const fixture = setupFixture();
  const service = createTestService(fixture);
  const primaryDir = join(fixture.root, "user-project");
  const extraDir = join(fixture.root, "reference-material");
  const laterDir = join(fixture.root, "added-later");
  mkdirSync(primaryDir, { recursive: true });
  mkdirSync(extraDir, { recursive: true });
  mkdirSync(laterDir, { recursive: true });

  const created = await service.createSession(
    {
      rolePresetSlug: "role-conceptual-theory-companion",
      kbDomain: "ep-core",
      soulSlug: "soul-latest",
    },
    { workspace: { primaryDir, additionalDirs: [extraDir] } },
  );

  const managed = (
    service as unknown as {
      sessions: Map<
        string,
        {
          session: {
            prompt(text: string): Promise<void>;
            sessionManager: { appendMessage(message: unknown): string };
          };
        }
      >;
    }
  ).sessions.get(created.sessionId)!;
  managed.session.prompt = async (text: string) => {
    managed.session.sessionManager.appendMessage({
      role: "user",
      content: [{ type: "text", text }],
      timestamp: Date.now(),
    });
    managed.session.sessionManager.appendMessage({
      role: "assistant",
      content: [{ type: "text", text: `answer:${text}` }],
      timestamp: Date.now(),
    });
  };

  try {
    assert.deepEqual(created.workspace, {
      primaryDir: resolve(primaryDir),
      additionalDirs: [resolve(extraDir)],
    });
    const manifest = service.getManifest(created.sessionId);
    assert.equal(manifest.sessionCwd, resolve(primaryDir));
    const header = JSON.parse(
      readFileSync(join(manifest.recordsDir, "session.json"), "utf-8"),
    );
    assert.deepEqual(header.workspace, {
      primaryDir: resolve(primaryDir),
      additionalDirs: [resolve(extraDir)],
    });

    const run = service.runPrompt(created.sessionId, "hello");
    await run.completion;

    const updated = await service.addWorkspaceDir(created.sessionId, laterDir);
    assert.deepEqual(updated.workspace?.additionalDirs, [
      resolve(extraDir),
      resolve(laterDir),
    ]);
    const updatedHeader = JSON.parse(
      readFileSync(join(manifest.recordsDir, "session.json"), "utf-8"),
    );
    assert.deepEqual(updatedHeader.workspace.additionalDirs, [
      resolve(extraDir),
      resolve(laterDir),
    ]);

    await assert.rejects(
      () =>
        service.addWorkspaceDir(
          created.sessionId,
          join(fixture.root, "missing"),
        ),
      /does not exist/,
    );
  } finally {
    await service.disposeAll();
  }

  const reopenedService = createTestService(fixture);
  try {
    const reopened = await reopenedService.openSession(created.sessionId, {
      rolePresetSlug: "role-conceptual-theory-companion",
      kbDomain: "ep-core",
      soulSlug: "soul-latest",
    });
    assert.deepEqual(reopened.workspace, {
      primaryDir: resolve(primaryDir),
      additionalDirs: [resolve(extraDir), resolve(laterDir)],
    });
  } finally {
    await reopenedService.disposeAll();
  }
});

test("SessionService opens with a missing workspace and warns instead of pointing at a dead folder", async () => {
  const fixture = setupFixture();
  const service = createTestService(fixture);
  const primaryDir = join(fixture.root, "renamed-away");
  mkdirSync(primaryDir, { recursive: true });

  const created = await service.createSession(
    {
      rolePresetSlug: "role-conceptual-theory-companion",
      kbDomain: "ep-core",
      soulSlug: "soul-latest",
    },
    { workspace: { primaryDir, additionalDirs: [] } },
  );

  const managed = (
    service as unknown as {
      sessions: Map<
        string,
        {
          session: {
            prompt(text: string): Promise<void>;
            sessionManager: { appendMessage(message: unknown): string };
          };
        }
      >;
    }
  ).sessions.get(created.sessionId)!;
  managed.session.prompt = async (text: string) => {
    managed.session.sessionManager.appendMessage({
      role: "user",
      content: [{ type: "text", text }],
      timestamp: Date.now(),
    });
    managed.session.sessionManager.appendMessage({
      role: "assistant",
      content: [{ type: "text", text: `answer:${text}` }],
      timestamp: Date.now(),
    });
  };
  const run = service.runPrompt(created.sessionId, "hello");
  await run.completion;
  await service.disposeAll();

  // Simulate the user renaming/merging the folder away between sessions.
  rmSync(primaryDir, { recursive: true, force: true });

  const reopenedService = createTestService(fixture);
  try {
    const reopened = await reopenedService.openSession(created.sessionId, {
      rolePresetSlug: "role-conceptual-theory-companion",
      kbDomain: "ep-core",
      soulSlug: "soul-latest",
    });
    // Session opens (not thrown) and the dead folder is surfaced as a warning.
    assert.ok(reopened.sessionId);
    assert.ok(
      reopened.resumeWarnings.some((w) => /no longer exists/.test(w)),
      `expected a stale-workspace warning, got: ${JSON.stringify(reopened.resumeWarnings)}`,
    );
  } finally {
    await reopenedService.disposeAll();
  }
});

test("imageAttachmentsFor gates on model image input (item D)", () => {
  const fixture = setupFixture();
  const imgPath = join(fixture.root, "pic.png");
  writeFileSync(imgPath, Buffer.from([0x89, 0x50, 0x4e, 0x47])); // fake PNG bytes
  const txtPath = join(fixture.root, "note.txt");
  writeFileSync(txtPath, "hello");
  const vision = { input: ["text", "image"] } as never;
  const textOnly = { input: ["text"] } as never;

  // Text-only model → no images, even for an image file (degrades to text mention).
  assert.deepEqual(imageAttachmentsFor([imgPath], textOnly), []);
  // No model → none.
  assert.deepEqual(imageAttachmentsFor([imgPath], undefined), []);
  // Vision model + image file → one ImageContent with base64 data.
  const built = imageAttachmentsFor([imgPath, txtPath], vision);
  assert.equal(built.length, 1); // .txt skipped, stays a text mention
  assert.equal(built[0].type, "image");
  assert.equal(built[0].mimeType, "image/png");
  assert.equal(
    built[0].data,
    Buffer.from([0x89, 0x50, 0x4e, 0x47]).toString("base64"),
  );
  // Missing/unreadable image path → skipped, no throw.
  assert.deepEqual(
    imageAttachmentsFor([join(fixture.root, "gone.png")], vision),
    [],
  );
});

test("isUnknownModelError matches core's removed-model throw (item 2 resume fallback)", () => {
  // Must match the exact shape thrown by createAltTheorySession, else resume
  // won't fall back to the default model and the reopen stays broken.
  assert.equal(
    isUnknownModelError(new Error("Unknown model: minimax/minimax-m3")),
    true,
  );
  assert.equal(
    isUnknownModelError(
      new Error("Unknown model: x/y (models.json not found)"),
    ),
    true,
  );
  assert.equal(isUnknownModelError(new Error("some other failure")), false);
  assert.equal(isUnknownModelError("Unknown model: x/y"), false);
  assert.equal(isUnknownModelError(null), false);
});

test("approval bridge routes extension confirm dialogs through the service", async () => {
  const fixture = setupFixture();
  const service = new SessionService({
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
    understandReadOnly: true,
    altMode: "understand",
    resourceDiscovery: "clean",
    instructionsDir: fixture.instructionsDir,
    runLabel: null,
    testBatch: null,
    // A policy-style extension: every bash call must be user-approved.
    extensionFactories: [
      (pi) => {
        pi.on("tool_call", async (event, ctx) => {
          if (event.toolName !== "bash") return undefined;
          const approved = await ctx.ui.confirm(
            "Approve tool",
            `Run ${event.toolName}?`,
          );
          return approved
            ? undefined
            : { block: true, reason: "Denied by user" };
        });
      },
    ],
  });

  const created = await service.createSession({
    rolePresetSlug: "role-conceptual-theory-companion",
    kbDomain: "ep-core",
    soulSlug: "soul-latest",
  });

  const events: SessionServiceEvent[] = [];
  const globalApprovals: SessionServiceEvent[] = [];
  const detachListener = service.attach(created.sessionId, (event) =>
    events.push(event),
  );
  const detachGlobal = service.attachApprovals((event) =>
    globalApprovals.push(event),
  );
  const managed = (
    service as unknown as {
      sessions: Map<
        string,
        {
          session: {
            agent: {
              beforeToolCall?: (input: {
                toolCall: { id: string; name: string; arguments: unknown };
                args: Record<string, unknown>;
              }) => Promise<{ block?: boolean; reason?: string } | undefined>;
            };
          };
        }
      >;
    }
  ).sessions.get(created.sessionId)!;

  try {
    // Approved call: reply accept=true while the extension awaits confirm.
    const approvedCall = managed.session.agent.beforeToolCall!({
      toolCall: { id: "t1", name: "bash", arguments: {} },
      args: { command: "echo ok" },
    });
    // Wait for the request event to surface, then respond.
    for (
      let i = 0;
      i < 50 && !events.some((e) => e.type === "approval_requested");
      i++
    ) {
      await new Promise((r) => setTimeout(r, 10));
    }
    const request = events.find((e) => e.type === "approval_requested");
    assert.ok(request && request.type === "approval_requested");
    assert.equal(request.payload.kind, "confirm");
    assert.equal(request.payload.title, "Approve tool");
    assert.deepEqual(service.listPendingApprovals(), [request.payload]);
    assert.equal(globalApprovals.at(-1)?.type, "approval_requested");
    assert.equal(
      service.respondApproval(created.sessionId, request.payload.approvalId, {
        accept: true,
      }),
      true,
    );
    assert.equal(await approvedCall, undefined);
    assert.deepEqual(service.listPendingApprovals(), []);
    assert.ok(
      events.some(
        (e) =>
          e.type === "approval_resolved" &&
          e.payload.resolution === "responded",
      ),
    );

    // Denied call: reply accept=false → the extension blocks the tool.
    const deniedCall = managed.session.agent.beforeToolCall!({
      toolCall: { id: "t2", name: "bash", arguments: {} },
      args: { command: "rm -rf /" },
    });
    for (let i = 0; i < 50; i++) {
      const pending = events.filter((e) => e.type === "approval_requested");
      if (pending.length >= 2) break;
      await new Promise((r) => setTimeout(r, 10));
    }
    const second = events
      .filter((e) => e.type === "approval_requested")
      .at(-1)!;
    assert.ok(second.type === "approval_requested");
    service.respondApproval(created.sessionId, second.payload.approvalId, {
      accept: false,
    });
    const blocked = await deniedCall;
    assert.equal(blocked?.block, true);
    assert.match(blocked?.reason ?? "", /Denied by user/);

    // Unknown approval ids are a no-op.
    assert.equal(
      service.respondApproval(created.sessionId, "no-such-approval", {
        accept: true,
      }),
      false,
    );
  } finally {
    detachGlobal();
    detachListener();
    await service.disposeAll();
  }
});

test("security extension escalates risky commands through the approval bridge", async () => {
  const fixture = setupFixture();
  const service = createTestService(fixture);
  const created = await service.createSession({
    rolePresetSlug: "role-conceptual-theory-companion",
    kbDomain: "ep-core",
    soulSlug: "soul-latest",
  });

  const events: SessionServiceEvent[] = [];
  const detachListener = service.attach(created.sessionId, (event) =>
    events.push(event),
  );
  const managed = (
    service as unknown as {
      sessions: Map<
        string,
        {
          session: {
            agent: {
              beforeToolCall?: (input: {
                toolCall: { id: string; name: string; arguments: unknown };
                args: Record<string, unknown>;
              }) => Promise<{ block?: boolean; reason?: string } | undefined>;
            };
          };
        }
      >;
    }
  ).sessions.get(created.sessionId)!;
  const requested = () =>
    events.filter((event) => event.type === "approval_requested");

  try {
    // Escalated command: the user grants a session allowance.
    const first = managed.session.agent.beforeToolCall!({
      toolCall: { id: "sec-1", name: "bash", arguments: {} },
      args: { command: "rm -rf scratch" },
    });
    for (let i = 0; i < 50 && requested().length === 0; i++) {
      await new Promise((r) => setTimeout(r, 10));
    }
    const request = requested().at(-1)!;
    assert.ok(request.type === "approval_requested");
    assert.equal(request.payload.kind, "select");
    assert.match(request.payload.title, /rm -rf scratch/);
    assert.ok(request.payload.options?.includes(APPROVAL_ALLOW_SESSION));
    service.respondApproval(created.sessionId, request.payload.approvalId, {
      choice: APPROVAL_ALLOW_SESSION,
    });
    assert.equal(await first, undefined);

    // The allowance covers the repeat without a new dialog.
    assert.equal(
      await managed.session.agent.beforeToolCall!({
        toolCall: { id: "sec-2", name: "bash", arguments: {} },
        args: { command: "rm -rf scratch" },
      }),
      undefined,
    );
    assert.equal(requested().length, 1);
    assert.ok(
      events.some(
        (event) =>
          event.type === "extension_notice" &&
          event.payload.message.startsWith("Allowed for this session:"),
      ),
    );

    // The allowance survives a loader reload (mode switch): it lives in the
    // per-session closure, not the per-reload factory.
    await service.switchMode(created.sessionId, "work");
    assert.equal(
      await managed.session.agent.beforeToolCall!({
        toolCall: { id: "sec-reload", name: "bash", arguments: {} },
        args: { command: "rm -rf scratch" },
      }),
      undefined,
    );
    assert.equal(requested().length, 1);

    // Network allowances are keyed per host: granting one host does not cover
    // another.
    const grantHostA = managed.session.agent.beforeToolCall!({
      toolCall: { id: "net-1", name: "bash", arguments: {} },
      args: { command: "curl https://example.com/data" },
    });
    for (let i = 0; i < 50 && requested().length < 2; i++) {
      await new Promise((r) => setTimeout(r, 10));
    }
    const hostA = requested().at(-1)!;
    assert.ok(hostA.type === "approval_requested");
    service.respondApproval(created.sessionId, hostA.payload.approvalId, {
      choice: APPROVAL_ALLOW_SESSION,
    });
    assert.equal(await grantHostA, undefined);
    // Same host, covered without a new dialog.
    assert.equal(
      await managed.session.agent.beforeToolCall!({
        toolCall: { id: "net-2", name: "bash", arguments: {} },
        args: { command: "curl https://example.com/other" },
      }),
      undefined,
    );
    assert.equal(requested().length, 2);

    // A different host re-prompts, and denying it blocks the tool.
    const denied = managed.session.agent.beforeToolCall!({
      toolCall: { id: "net-3", name: "bash", arguments: {} },
      args: { command: "curl https://elsewhere.test/x" },
    });
    for (let i = 0; i < 50 && requested().length < 3; i++) {
      await new Promise((r) => setTimeout(r, 10));
    }
    const second = requested().at(-1)!;
    assert.ok(second.type === "approval_requested");
    service.respondApproval(created.sessionId, second.payload.approvalId, {
      choice: APPROVAL_DENY,
    });
    const blocked = await denied;
    assert.equal(blocked?.block, true);
    assert.match(blocked?.reason ?? "", /not approved/);
  } finally {
    detachListener();
    await service.disposeAll();
  }
});

test("SessionService continues a failed latest turn without losing earlier turns", async () => {
  const fixture = setupFixture();
  const service = createTestService(fixture);
  const created = await service.createSession({
    rolePresetSlug: "role-conceptual-theory-companion",
    kbDomain: "ep-core",
    soulSlug: "soul-latest",
  });
  const managed = (service as any).sessions.get(created.sessionId);
  let shouldFail = false;
  managed.session.prompt = async (text: string) => {
    managed.session.state.errorMessage = shouldFail
      ? "connection dropped"
      : null;
    managed.session.sessionManager.appendMessage({
      role: "user",
      content: [{ type: "text", text }],
      timestamp: Date.now(),
    });
    managed.session.sessionManager.appendMessage({
      role: "assistant",
      content: [{ type: "text", text: `answer:${text}` }],
      timestamp: Date.now(),
    });
  };
  managed.session.agent.continue = async () => {
    managed.session.state.errorMessage = shouldFail
      ? "connection dropped"
      : null;
    managed.session.sessionManager.appendMessage({
      role: "assistant",
      content: [{ type: "text", text: "answer:second" }],
      timestamp: Date.now(),
    });
  };
  const retryTranscripts: any[] = [];
  const detach = service.attach(created.sessionId, (event) => {
    if (event.type === "session_transcript") {
      retryTranscripts.push(event.payload.messages);
    }
  });

  try {
    await service.runPrompt(created.sessionId, "first").completion;
    shouldFail = true;
    await assert.rejects(
      service.runPrompt(created.sessionId, "second").completion,
      /connection dropped/,
    );

    const recordsDir = service.getManifest(created.sessionId).recordsDir;
    const failed = latestRunSnapshots(recordsDir).at(-1)!;
    assert.equal(failed.status, "failed");
    assert.ok(failed.userEntryId);
    assert.equal(failed.assistantEntryIds.length, 1);

    shouldFail = false;
    const retried = service.continueLatestFromBreakpoint(created.sessionId);
    assert.deepEqual(
      retryTranscripts
        .at(-1)
        ?.filter((message: any) => message.role === "user")
        .map((message: any) => message.text),
      ["first", "second"],
    );
    // Break-point retry (alpha.5 M0): the failed attempt's completed work is
    // adopted by the replacement run and stays visible, not hidden.
    assert.deepEqual(
      retryTranscripts
        .at(-1)
        ?.filter((message: any) => message.role === "assistant")
        .map((message: any) => message.text),
      ["answer:first", "answer:second"],
    );
    await retried.completion;

    const runs = latestRunSnapshots(recordsDir);
    assert.equal(
      runs.find((run) => run.runId === failed.runId)?.status,
      "superseded",
    );
    const retryRecord = runs.find((run) => run.runId === retried.ids.runId)!;
    assert.equal(retryRecord.status, "completed");
    assert.equal(retryRecord.turnId, failed.turnId);
    assert.equal(retryRecord.supersedesRunId, failed.runId);
    // The replacement run adopts the failed attempt's entries (preserved
    // work) in addition to its own continuation entries.
    for (const entryId of failed.assistantEntryIds) {
      assert.ok(retryRecord.assistantEntryIds.includes(entryId));
    }
    assert.ok(
      retryRecord.assistantEntryIds.length > failed.assistantEntryIds.length,
    );

    const detail = readSessionDetail(fixture.dataDir, created.sessionId);
    assert.deepEqual(
      (detail?.transcript ?? [])
        .filter((message) => message.role === "user")
        .map((message) => message.text),
      ["first", "second"],
    );
  } finally {
    detach();
    await service.disposeAll();
  }
});

test("SessionService retries the latest message from the start in the same session", async () => {
  const fixture = setupFixture();
  const service = createTestService(fixture);
  const created = await service.createSession({
    rolePresetSlug: "role-conceptual-theory-companion",
    kbDomain: "ep-core",
    soulSlug: "soul-latest",
  });
  const managed = (service as any).sessions.get(created.sessionId);
  let attempt = 0;
  let releaseRetry!: () => void;
  let markRetryStarted!: () => void;
  const retryGate = new Promise<void>((resolve) => {
    releaseRetry = resolve;
  });
  const retryStarted = new Promise<void>((resolve) => {
    markRetryStarted = resolve;
  });
  managed.session.prompt = async (text: string) => {
    attempt += 1;
    managed.session.state.errorMessage = null;
    if (attempt === 2) {
      markRetryStarted();
      await retryGate;
    }
    managed.session.sessionManager.appendMessage({
      role: "user",
      content: [{ type: "text", text }],
      timestamp: Date.now(),
    });
    managed.session.sessionManager.appendMessage({
      role: "assistant",
      content: [{ type: "text", text: `attempt ${attempt}` }],
      timestamp: Date.now(),
    });
  };
  const retryTranscripts: any[] = [];
  const detach = service.attach(created.sessionId, (event) => {
    if (event.type === "session_transcript") {
      retryTranscripts.push(event.payload.messages);
    }
  });

  try {
    await service.runPrompt(created.sessionId, "same question").completion;
    const retried = service.retryLatestFromStart(created.sessionId);
    await retryStarted;
    const visibleUsers = retryTranscripts
      .at(-1)
      ?.filter((message: any) => message.role === "user")
      .map((message: any) => message.text);
    assert.deepEqual(visibleUsers, ["same question"]);
    assert.deepEqual(
      service
        .getTranscript(created.sessionId)
        .filter((message) => message.role === "user")
        .map((message) => message.text),
      ["same question"],
    );
    releaseRetry();
    await retried.completion;
    const detail = readSessionDetail(fixture.dataDir, created.sessionId);
    assert.deepEqual(
      detail?.transcript
        .filter((message) => message.role === "user" || message.role === "assistant")
        .map((message) => [message.role, message.text]),
      [
        ["user", "same question"],
        ["assistant", "attempt 2"],
      ],
    );
  } finally {
    releaseRetry();
    detach();
    await service.disposeAll();
  }
});

test("SessionService reviseAt rewrites from an earlier turn and supersedes later runs", async () => {
  const fixture = setupFixture();
  const service = createTestService(fixture);
  const created = await service.createSession({
    rolePresetSlug: "role-conceptual-theory-companion",
    kbDomain: "ep-core",
    soulSlug: "soul-latest",
  });
  const managed = (
    service as unknown as {
      sessions: Map<
        string,
        {
          session: {
            prompt(text: string): Promise<void>;
            sessionManager: {
              appendMessage(message: unknown): string;
              buildSessionContext(): {
                messages: Array<{
                  content: Array<{ type: string; text: string }>;
                }>;
              };
            };
          };
        }
      >;
    }
  ).sessions.get(created.sessionId)!;
  managed.session.prompt = async (text: string) => {
    managed.session.sessionManager.appendMessage({
      role: "user",
      content: [{ type: "text", text }],
      timestamp: Date.now(),
    });
    managed.session.sessionManager.appendMessage({
      role: "assistant",
      content: [{ type: "text", text: `answer:${text}` }],
      timestamp: Date.now(),
    });
  };

  try {
    for (const prompt of ["first", "second", "third"]) {
      await service.runPrompt(created.sessionId, prompt).completion;
    }
    const recordsDir = service.getManifest(created.sessionId).recordsDir;
    const runs = latestRunSnapshots(recordsDir);
    assert.equal(runs.length, 3);
    const secondRun = runs[1];
    assert.equal(secondRun.status, "completed");

    const transcriptEvents: SessionServiceEvent[] = [];
    const detach = service.attach(created.sessionId, (event) => {
      if (event.type === "session_transcript") transcriptEvents.push(event);
    });
    const revised = service.reviseAt(
      created.sessionId,
      secondRun.userEntryId!,
      "revised-second",
    );
    const projected = transcriptEvents.at(-1);
    assert.equal(projected?.type, "session_transcript");
    if (projected?.type === "session_transcript") {
      assert.deepEqual(
        projected.payload.messages
          .filter((message) => message.role === "user")
          .map((message) => message.text),
        ["first", "revised-second"],
      );
      assert.deepEqual(
        projected.payload.messages
          .filter((message) => message.role === "assistant")
          .map((message) => message.text),
        ["answer:first"],
      );
    }
    await revised.completion;
    detach();

    const after = latestRunSnapshots(recordsDir);
    assert.equal(
      after.find((run) => run.runId === runs[0].runId)?.status,
      "completed",
    );
    assert.equal(
      after.find((run) => run.runId === runs[1].runId)?.status,
      "superseded",
    );
    assert.equal(
      after.find((run) => run.runId === runs[2].runId)?.status,
      "superseded",
    );
    assert.equal(
      after.find((run) => run.runId === revised.ids.runId)?.supersedesRunId,
      secondRun.runId,
    );
    assert.equal(revised.ids.turnId, secondRun.turnId);

    const text = managed.session.sessionManager
      .buildSessionContext()
      .messages.map((message) =>
        message.content
          .filter((part) => part.type === "text")
          .map((part) => part.text)
          .join(""),
      )
      .join("\n");
    assert.match(text, /first/);
    assert.match(text, /revised-second/);
    assert.doesNotMatch(text, /answer:second/);
    assert.doesNotMatch(text, /third/);

    const detail = readSessionDetail(fixture.dataDir, created.sessionId);
    const userMessages = (detail?.transcript ?? []).filter(
      (message) => message.role === "user",
    );
    assert.deepEqual(
      userMessages.map((message) => message.text),
      ["first", "revised-second"],
    );
  } finally {
    await service.disposeAll();
  }
});

test("SessionService setSessionWorkspace re-points a session's working folder", async () => {
  const fixture = setupFixture();
  const service = createTestService(fixture);
  const created = await service.createSession({
    rolePresetSlug: "role-conceptual-theory-companion",
    kbDomain: "ep-core",
    soulSlug: "soul-latest",
  });
  const folder = mkdtempSync(join(tmpdir(), "alt-theory-ws-repoint-"));
  const managed = (
    service as unknown as {
      sessions: Map<
        string,
        {
          session: {
            prompt(text: string): Promise<void>;
            sessionManager: { appendMessage(message: unknown): string };
          };
        }
      >;
    }
  ).sessions.get(created.sessionId)!;
  managed.session.prompt = async (text: string) => {
    managed.session.sessionManager.appendMessage({
      role: "user",
      content: [{ type: "text", text }],
      timestamp: Date.now(),
    });
    managed.session.sessionManager.appendMessage({
      role: "assistant",
      content: [{ type: "text", text: `answer:${text}` }],
      timestamp: Date.now(),
    });
  };

  try {
    await service.runPrompt(created.sessionId, "hello").completion;
    const snapshot = await service.setSessionWorkspace(
      created.sessionId,
      folder,
    );
    assert.equal(snapshot?.workspace?.primaryDir, resolve(folder));
    const recordsDir = service.getManifest(created.sessionId).recordsDir;
    const header = readV4SessionHeader(recordsDir);
    assert.equal(header?.workspace?.primaryDir, resolve(folder));
    assert.deepEqual(header?.workspace?.additionalDirs, []);

    // Clearing goes back to the managed default workspace.
    const cleared = await service.setSessionWorkspace(created.sessionId, null);
    assert.equal(cleared?.workspace?.primaryDir.includes(folder), false);
    const clearedHeader = readV4SessionHeader(recordsDir);
    assert.equal(clearedHeader?.workspace, undefined);

    // Nonexistent folders are rejected.
    await assert.rejects(
      () =>
        service.setSessionWorkspace(
          created.sessionId,
          join(folder, "does-not-exist"),
        ),
      /does not exist/,
    );
  } finally {
    await service.disposeAll();
  }
});

test("SessionService workspace re-point carries fork children and live listeners", async () => {
  const fixture = setupFixture();
  const service = createTestService(fixture);
  const created = await service.createSession({
    rolePresetSlug: "role-conceptual-theory-companion",
    kbDomain: "ep-core",
    soulSlug: "soul-latest",
  });
  const folder = mkdtempSync(join(tmpdir(), "alt-theory-ws-family-"));
  const sessions = (
    service as unknown as {
      sessions: Map<
        string,
        {
          listeners: Set<unknown>;
          session: {
            prompt(text: string): Promise<void>;
            sessionManager: { appendMessage(message: unknown): string };
          };
        }
      >;
    }
  ).sessions;
  const managed = sessions.get(created.sessionId)!;
  managed.session.prompt = async (text: string) => {
    managed.session.sessionManager.appendMessage({
      role: "user",
      content: [{ type: "text", text }],
      timestamp: Date.now(),
    });
    managed.session.sessionManager.appendMessage({
      role: "assistant",
      content: [{ type: "text", text: `answer:${text}` }],
      timestamp: Date.now(),
    });
  };

  try {
    await service.runPrompt(created.sessionId, "hello").completion;
    const forked = await service.forkSession(created.sessionId, "fork");
    const listener = () => {};
    const detach = service.attach(created.sessionId, listener);

    await service.setSessionWorkspace(created.sessionId, folder);

    // The fork child moved with its parent.
    const childHeader = readV4SessionHeader(
      service.getManifest(forked.sessionId).recordsDir,
    );
    assert.equal(childHeader?.workspace?.primaryDir, resolve(folder));

    // The WebSocket subscription survived the dispose+reopen, and the old
    // unsubscribe closure still detaches from the replacement session.
    const replacement = sessions.get(created.sessionId)!;
    assert.equal(replacement.listeners.has(listener), true);
    detach();
    assert.equal(replacement.listeners.has(listener), false);
  } finally {
    await service.disposeAll();
  }
});

test("SessionService reviseAt edits a turn inherited from the fork parent", async () => {
  const fixture = setupFixture();
  const service = createTestService(fixture);
  const created = await service.createSession({
    rolePresetSlug: "role-conceptual-theory-companion",
    kbDomain: "ep-core",
    soulSlug: "soul-latest",
  });
  const sessions = (
    service as unknown as {
      sessions: Map<
        string,
        {
          session: {
            prompt(text: string): Promise<void>;
            sessionManager: {
              appendMessage(message: unknown): string;
              getBranch(): Array<{
                id: string;
                type?: string;
                message?: { role?: string };
              }>;
              buildSessionContext(): {
                messages: Array<{
                  content: Array<{ type: string; text?: string }>;
                }>;
              };
            };
          };
        }
      >;
    }
  ).sessions;
  const mockPrompt = (sessionId: string) => {
    const target = sessions.get(sessionId)!;
    target.session.prompt = async (text: string) => {
      target.session.sessionManager.appendMessage({
        role: "user",
        content: [{ type: "text", text }],
        timestamp: Date.now(),
      });
      target.session.sessionManager.appendMessage({
        role: "assistant",
        content: [{ type: "text", text: `answer:${text}` }],
        timestamp: Date.now(),
      });
    };
  };

  try {
    mockPrompt(created.sessionId);
    await service.runPrompt(created.sessionId, "first").completion;
    const forked = await service.forkSession(created.sessionId, "fork");
    mockPrompt(forked.sessionId);

    // The inherited turn has no run record in the child; edit must still work.
    const child = sessions.get(forked.sessionId)!;
    const inheritedUser = child.session.sessionManager
      .getBranch()
      .find(
        (entry) => entry.type === "message" && entry.message?.role === "user",
      );
    assert.ok(inheritedUser, "fork should inherit the parent's user turn");
    const revised = service.reviseAt(
      forked.sessionId,
      inheritedUser.id,
      "revised-first",
    );
    await revised.completion;

    const text = child.session.sessionManager
      .buildSessionContext()
      .messages.map((message) =>
        message.content
          .filter((part) => part.type === "text")
          .map((part) => part.text)
          .join(""),
      )
      .join("\n");
    assert.match(text, /revised-first/);
    assert.doesNotMatch(text, /answer:first/);
    const originalText = sessions
      .get(created.sessionId)!
      .session.sessionManager.buildSessionContext()
      .messages.map((message) =>
        message.content
          .filter((part) => part.type === "text")
          .map((part) => part.text)
          .join(""),
      )
      .join("\n");
    assert.match(originalText, /answer:first/);
    assert.deepEqual(
      readSessionDetail(fixture.dataDir, forked.sessionId)?.session.forkedFrom,
      { sessionId: created.sessionId, purpose: "fork" },
    );
    // Fork must not rename via ui-alias to a bare "branch1" token — list
    // display adds "Branch N · …" in the frontend.
    const aliasPath = join(
      service.getManifest(forked.sessionId).recordsDir,
      "ui-alias.json",
    );
    assert.equal(existsSync(aliasPath), false);
  } finally {
    await service.disposeAll();
  }
});

test("fresh fork family satisfies the frontend promote-button preconditions while live", async () => {
  const fixture = setupFixture();
  const service = createTestService(fixture);
  const created = await service.createSession({
    rolePresetSlug: "role-conceptual-theory-companion",
    kbDomain: "ep-core",
    soulSlug: "soul-latest",
  });
  const parent = (service as any).sessions.get(created.sessionId);
  parent.session.sessionManager.appendMessage({
    role: "user",
    content: [{ type: "text", text: "q" }],
    timestamp: Date.now(),
  });
  parent.session.sessionManager.appendMessage({
    role: "assistant",
    content: [{ type: "text", text: "a" }],
    timestamp: Date.now(),
  });

  try {
    const branch = await service.forkSession(created.sessionId, "fork");
    const nested = await service.forkSession(branch.sessionId, "fork");

    // The exact data the frontend's canTakeMainline (lib/sessionList.ts)
    // needs, read the same way /api/sessions reads it — with every session
    // still LIVE (a brand-new family is exactly this state).
    const summaries = listSessionSummaries(fixture.dataDir).sessions;
    const byId = new Map(summaries.map((s) => [s.sessionId, s]));
    const root = byId.get(created.sessionId);
    assert.ok(root, "root summary missing from /api/sessions data");
    assert.equal(root.forkedFrom, null);
    assert.equal(root.deletedAt, null);
    assert.notEqual(root.delisted, true);
    for (const child of [branch, nested]) {
      const summary = byId.get(child.sessionId);
      assert.ok(summary, `fork summary missing: ${child.sessionId}`);
      assert.equal(summary.forkedFrom?.purpose, "fork");
      assert.ok(
        byId.has(summary.forkedFrom!.sessionId),
        "fork parent id must resolve within the same list payload",
      );
    }
    // Walk exactly like canTakeMainline: from each branch up to a visible,
    // delistable root.
    for (const child of [branch, nested]) {
      let cur = byId.get(byId.get(child.sessionId)!.forkedFrom!.sessionId);
      let promotable = false;
      while (cur) {
        if (!cur.deletedAt && !cur.forkedFrom && cur.delisted !== true) {
          promotable = true;
          break;
        }
        cur = cur.forkedFrom ? byId.get(cur.forkedFrom.sessionId) : undefined;
      }
      assert.equal(promotable, true, `no promote path for ${child.sessionId}`);
    }
  } finally {
    await service.disposeAll();
  }
});

test("auto-title asks the session model runtime and writes the alias", async () => {
  const fixture = setupFixture();
  const service = createTestService(fixture);
  try {
    const created = await service.createSession({
      rolePresetSlug: "role-conceptual-theory-companion",
      kbDomain: "ep-core",
      soulSlug: "soul-latest",
    });
    const managed = (service as any).sessions.get(created.sessionId);
    managed.session.sessionManager.appendMessage({
      role: "user",
      content: [
        { type: "text", text: "Please help me debug the login flow for the staging server." },
      ],
      timestamp: Date.now(),
    });
    // The runtime is the auth path: stubbing it (not the compat layer) both
    // proves the call routes through the runtime and keeps the test offline.
    let calls = 0;
    managed.session.modelRuntime.completeSimple = async () => {
      calls += 1;
      return {
        role: "assistant",
        content: [{ type: "text", text: '"Debugging the login flow."' }],
        timestamp: Date.now(),
      };
    };
    await (service as any).maybeAutoTitle(managed);
    assert.equal(calls, 1);
    const aliasPath = join(
      service.getManifest(created.sessionId).recordsDir,
      "ui-alias.json",
    );
    assert.equal(
      JSON.parse(readFileSync(aliasPath, "utf-8")).alias,
      "Debugging the login flow",
    );
  } finally {
    await service.disposeAll();
  }
});

// --- v1.5 round 1: run state, apply-when-idle, thinking resolver (M1) ---

function holdPrompt(managed: any): () => void {
  let release: () => void = () => {};
  managed.session.prompt = () =>
    new Promise<void>((resolve) => {
      release = resolve;
    });
  return () => release();
}

test("switches during a run are deferred and apply when the turn settles", async () => {
  const fixture = setupFixture();
  const service = createTestService(fixture);
  const created = await service.createSession({
    rolePresetSlug: "role-conceptual-theory-companion",
    kbDomain: "ep-core",
    soulSlug: "soul-latest",
  });
  const events: SessionServiceEvent[] = [];
  const detach = service.attach(created.sessionId, (event) => events.push(event));
  const managed = (service as any).sessions.get(created.sessionId);
  const release = holdPrompt(managed);
  try {
    const run = service.runPrompt(created.sessionId, "long turn");
    assert.equal(service.getSnapshot(created.sessionId).status, "running");

    const modeSnapshot = await service.switchMode(created.sessionId, "work");
    assert.equal(modeSnapshot.mode, "understand");
    assert.equal(modeSnapshot.pending?.mode, "work");

    const fullSnapshot = await service.setFullAccess(created.sessionId, true);
    assert.equal(fullSnapshot.fullAccess, false);
    assert.equal(fullSnapshot.pending?.fullAccess, true);

    const override = { provider: "test", modelId: "test-model", thinkingLevel: "low" as const };
    const modelSnapshot = await service.setSessionModel(created.sessionId, override);
    assert.deepEqual(modelSnapshot.pending?.model, override);
    assert.equal(modelSnapshot.modelOverride, null);
    // Nothing touched the session yet.
    assert.equal(managed.getAltMode(), "understand");
    assert.equal(managed.getFullAccess(), false);

    release();
    await run.completion;
    const settled = service.getSnapshot(created.sessionId);
    assert.equal(settled.status, "idle");
    assert.deepEqual(settled.pending, {});
    assert.equal(settled.mode, "work");
    assert.equal(settled.fullAccess, true);
    assert.deepEqual(settled.modelOverride, override);
    // The user's "low" is kept as the choice; the test model has no thinking
    // levels, so it is reported as clamped rather than silently replaced.
    assert.equal(settled.thinking?.chosen, "low");
    assert.equal(settled.thinking?.source, "clamped");
    assert.ok(
      events.some((event) => event.type === "session_updated" && event.payload.mode === "work"),
      "a session_updated snapshot follows the drain",
    );
  } finally {
    detach();
    await service.disposeAll();
  }
});

test("stop applies the pending switch; Full Access off is live during a run", async () => {
  const fixture = setupFixture();
  const service = createTestService(fixture);
  const created = await service.createSession(
    {
      rolePresetSlug: "role-conceptual-theory-companion",
      kbDomain: "ep-core",
      soulSlug: "soul-latest",
    },
    { mode: "work", fullAccess: true },
  );
  const managed = (service as any).sessions.get(created.sessionId);
  const release = holdPrompt(managed);
  managed.session.abort = async () => release();
  try {
    const run = service.runPrompt(created.sessionId, "long turn");
    const off = await service.setFullAccess(created.sessionId, false);
    assert.equal(off.fullAccess, false, "turning permissions down is immediate");
    assert.deepEqual(off.pending, {});

    await service.switchMode(created.sessionId, "understand");
    assert.equal(service.getSnapshot(created.sessionId).pending?.mode, "understand");
    await service.abort(created.sessionId, "user_stop", "user_abort");
    await run.completion.catch(() => {});
    const stopped = service.getSnapshot(created.sessionId);
    assert.equal(stopped.status, "idle");
    assert.equal(stopped.mode, "understand");
    assert.deepEqual(stopped.pending, {});
  } finally {
    await service.disposeAll();
  }
});

test("thinking resolver: a chosen level is kept or reported clamped; no choice → model midpoint", async () => {
  const fixture = setupFixture();
  const service = createTestService(fixture);
  const created = await service.createSession({
    rolePresetSlug: "role-conceptual-theory-companion",
    kbDomain: "ep-core",
    soulSlug: "soul-latest",
  });
  const managed = (service as any).sessions.get(created.sessionId);
  // A reasoning model whose provider supports off / medium / high only.
  const reasoner = (provider: string, id: string) => ({
    provider,
    id,
    reasoning: true,
    thinkingLevelMap: { minimal: null, low: null },
  });
  let currentModel: unknown = managed.session.model;
  Object.defineProperty(managed.session, "model", {
    configurable: true,
    get: () => currentModel,
  });
  managed.session.modelRuntime.getModel = reasoner;
  const set: string[] = [];
  managed.session.setModel = async (model: unknown) => {
    currentModel = model;
  };
  const original = managed.session.setThinkingLevel.bind(managed.session);
  managed.session.setThinkingLevel = (level: string) => {
    set.push(level);
    original(level);
  };
  try {
    const kept = await service.setSessionModel(created.sessionId, {
      provider: "r",
      modelId: "reasoner",
      thinkingLevel: "high",
    });
    assert.deepEqual(kept.thinking, { level: "high", source: "user", chosen: "high" });

    const clamped = await service.setSessionModel(created.sessionId, {
      provider: "r",
      modelId: "reasoner",
      thinkingLevel: "low",
    });
    assert.deepEqual(clamped.thinking, { level: "medium", source: "clamped", chosen: "low" });

    const defaulted = await service.setSessionModel(created.sessionId, {
      provider: "r",
      modelId: "reasoner",
    });
    assert.deepEqual(defaulted.thinking, { level: "medium", source: "model-default" });
    assert.deepEqual(set.slice(-3), ["high", "medium", "medium"]);

    // Pi moving the level on its own is reported, never hidden.
    (service as any).handleAgentEvent(managed, {
      type: "thinking_level_changed",
      level: "high",
    });
    assert.deepEqual(service.getSnapshot(created.sessionId).thinking, {
      chosen: "medium",
      level: "high",
      source: "clamped",
    });
  } finally {
    await service.disposeAll();
  }
});
