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
import {
  SessionBusyError,
  SessionService,
  type SessionServiceEvent,
} from "./session-service.js";
import { readSessionDetail } from "./session-store.js";
import { readConfigEvents } from "./config-events.js";
import { latestRunSnapshots, readRunRecords } from "./lineage-records.js";

function setupFixture() {
  const root = mkdtempSync(join(tmpdir(), "alt-theory-session-service-"));
  const dataDir = join(root, "data");
  const rolePresetsDir = join(root, "role-presets");
  const soulDir = join(root, "soul");
  const kbDir = join(root, "kb");
  const skillsDir = join(root, "skills");
  const instructionsDir = join(root, "instructions");
  const appContextPath = join(root, "ALTTHEORY.md");
  const piPromptTemplatesDir = resolve("agent-assets", "prompts", "pi");

  mkdirSync(rolePresetsDir, { recursive: true });
  mkdirSync(soulDir, { recursive: true });
  mkdirSync(join(kbDir, "ep-core"), { recursive: true });
  mkdirSync(skillsDir, { recursive: true });
  mkdirSync(instructionsDir, { recursive: true });
  writeFileSync(appContextPath, "Session service app context", "utf-8");
  writeFileSync(join(rolePresetsDir, "role-conceptual-theory-companion.md"), "Conceptual theory role", "utf-8");
  writeFileSync(join(rolePresetsDir, "alternate.md"), "Alternate role", "utf-8");
  writeFileSync(join(soulDir, "soul-latest.md"), "Latest soul", "utf-8");
  writeFileSync(join(soulDir, "soul-test.md"), "Test soul", "utf-8");
  writeFileSync(
    join(instructionsDir, "research.rules"),
    "Do not overextend.",
    "utf-8"
  );
  writeFileSync(
    join(skillsDir, "summary.md"),
    "---\nname: conversation-summary\ndescription: Test summary\n---\nSummarize.",
    "utf-8"
  );

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
  };
}

function createTestService(fixture: ReturnType<typeof setupFixture>) {
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
    readOnly: true,
    promptMode: "alt-only",
    resourceDiscovery: "clean",
    instructionsDir: fixture.instructionsDir,
    runLabel: null,
    testBatch: null,
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

test("SessionService creates managed sessions with v0.4 foundation records", async () => {
  const fixture = setupFixture();
  const service = createTestService(fixture);
  const snapshot = await service.createSession({
    projectId: "manual-role-uat",
    rolePresetSlug: "role-conceptual-theory-companion",
    kbDomain: "ep-core",
    soulSlug: "soul-latest",
  });

  try {
    assert.match(
      snapshot.sessionId,
      /^\d{8}-\d{6}__role-conceptual-theory-c__soul-latest__default$/
    );
    assert.equal(snapshot.rolePresetSlug, "role-conceptual-theory-companion");
    assert.equal(snapshot.projectId, "manual-role-uat");
    assert.equal(snapshot.soulSlug, "soul-latest");
    assert.equal(snapshot.currentDomain, "ep-core");

    const manifest = service.getManifest(snapshot.sessionId);
    const sessionRecordPath = join(manifest.recordsDir, "session.json");
    const branchIndexPath = join(manifest.recordsDir, "branch-index.json");
    assert.equal(existsSync(sessionRecordPath), true);
    assert.equal(existsSync(branchIndexPath), true);

    const sessionRecord = JSON.parse(readFileSync(sessionRecordPath, "utf-8"));
    const branchIndex = JSON.parse(readFileSync(branchIndexPath, "utf-8"));
    assert.deepEqual(
      {
        schemaVersion: sessionRecord.schemaVersion,
        recordType: sessionRecord.recordType,
        projectId: sessionRecord.projectId,
        activeBranchId: sessionRecord.activeBranchId,
        recordModel: sessionRecord.recordModel,
      },
      {
        schemaVersion: 1,
        recordType: "session",
        projectId: "manual-role-uat",
        activeBranchId: "main",
        recordModel: "v0.4",
      }
    );
    assert.equal(branchIndex.schemaVersion, 1);
    assert.equal(branchIndex.recordType, "branch-index");
    assert.equal(branchIndex.activeBranchId, "main");
    assert.equal(branchIndex.branches[0].workspaceMode, "shared");
    assert.equal(branchIndex.branches[0].workspaceRef, manifest.sessionCwd);
    assert.equal(branchIndex.branches[0].activePiSessionFile, manifest.piSessionFile);

    const detail = readSessionDetail(fixture.dataDir, snapshot.sessionId);
    assert.equal(detail?.session.recordModel, "v0.4");
    assert.equal(detail?.session.projectId, "manual-role-uat");
    assert.equal(detail?.effectiveConfig?.projectId, "manual-role-uat");
    assert.deepEqual(
      readConfigEvents(manifest.recordsDir).map((event) => event.reason),
      ["creation"]
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
      sessions: Map<string, {
        session: {
          prompt(text: string): Promise<void>;
          sessionManager: { appendMessage(message: unknown): string };
        };
      }>;
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
      sessions: Map<string, {
        session: {
          prompt(text: string): Promise<void>;
          sessionManager: {
            appendMessage(message: unknown): string;
            buildSessionContext(): { messages: Array<{ content: Array<{ type: string; text: string }> }> };
            getEntry(id: string): unknown;
          };
        };
      }>;
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
      managed.session.sessionManager.getEntry(originalRecord.userEntryId!)
    );
    const latest = latestRunSnapshots(recordsDir);
    assert.equal(
      latest.find((run) => run.runId === original.ids.runId)?.status,
      "superseded"
    );
    assert.equal(
      latest.find((run) => run.runId === revised.ids.runId)?.supersedesRunId,
      original.ids.runId
    );
    const text = managed.session.sessionManager
      .buildSessionContext()
      .messages.map((message) =>
        message.content
          .filter((part) => part.type === "text")
          .map((part) => part.text)
          .join("")
      )
      .join("\n");
    assert.match(text, /revised/);
    assert.doesNotMatch(text, /original/);
    const detail = readSessionDetail(fixture.dataDir, created.sessionId);
    const transcriptText = (detail?.transcript ?? [])
      .map((message) => message.text)
      .join("\n");
    const userMessages = (detail?.transcript ?? []).filter(
      (message) => message.role === "user"
    );
    assert.equal(userMessages.length, 1);
    assert.equal(userMessages[0]?.text, "revised");
    assert.match(transcriptText, /revised/);
    assert.doesNotMatch(transcriptText, /original/);
    const branchIndex = JSON.parse(
      readFileSync(join(recordsDir, "branch-index.json"), "utf-8")
    );
    assert.deepEqual(
      branchIndex.branches.map((branch: { branchId: string }) => branch.branchId),
      ["main"]
    );
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
      sessions: Map<string, {
        session: {
          prompt(text: string): Promise<void>;
          sessionManager: {
            appendMessage(message: unknown): string;
            buildSessionContext(): { messages: Array<{ content: Array<{ type: string; text: string }> }> };
            getLeafId(): string | null;
          };
        };
      }>;
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
    const latestBeforeDelete = latestRunSnapshots(recordsDir).find(
      (run) => run.runId === second.ids.runId
    )!;

    const deleted = service.deleteLatest(created.sessionId);

    assert.equal(deleted.sessionId, created.sessionId);
    assert.equal(deleted.branchId, undefined);
    assert.equal(
      latestRunSnapshots(recordsDir).find((run) => run.runId === second.ids.runId)
        ?.status,
      "deleted"
    );
    assert.equal(
      latestRunSnapshots(recordsDir).find((run) => run.runId === first.ids.runId)
        ?.status,
      "completed"
    );
    const contextText = managed.session.sessionManager
      .buildSessionContext()
      .messages.map((message) =>
        message.content
          .filter((part) => part.type === "text")
          .map((part) => part.text)
          .join("")
      )
      .join("\n");
    assert.match(contextText, /keep me/);
    assert.doesNotMatch(contextText, /delete me/);
    const branchIndex = JSON.parse(
      readFileSync(join(recordsDir, "branch-index.json"), "utf-8")
    );
    assert.deepEqual(
      branchIndex.branches.map((branch: { branchId: string }) => branch.branchId),
      ["main"]
    );
    assert.equal(
      branchIndex.branches[0].activeLeafEntryId,
      latestBeforeDelete.userEntryId
        ? managed.session.sessionManager.getLeafId()
        : null
    );
    assert.notEqual(branchIndex.branches[0].activeLeafEntryId, latestBeforeDelete.userEntryId);
  } finally {
    await service.disposeAll();
  }
});

test("SessionService restores the active branch leaf after reopen for conversation actions", async () => {
  const fixture = setupFixture();
  const service = createTestService(fixture);
  const created = await service.createSession({
    rolePresetSlug: "role-conceptual-theory-companion",
    kbDomain: "ep-core",
    soulSlug: "soul-latest",
  });
  const managed = (
    service as unknown as {
      sessions: Map<string, {
        session: {
          prompt(text: string): Promise<void>;
          sessionManager: {
            appendMessage(message: unknown): string;
            buildSessionContext(): { messages: Array<{ content: Array<{ type: string; text: string }> }> };
          };
        };
      }>;
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
    const recordsDir = service.getManifest(created.sessionId).recordsDir;
    const mainLeafAfterDelete = JSON.parse(
      readFileSync(join(recordsDir, "branch-index.json"), "utf-8")
    ).branches[0].activeLeafEntryId;
    await service.disposeAll();

    const reopenedService = createTestService(fixture);
    const reopened = await reopenedService.openSession(created.sessionId, {
      rolePresetSlug: "role-conceptual-theory-companion",
      kbDomain: "ep-core",
      soulSlug: "soul-latest",
    });
    const reopenedManaged = (
      reopenedService as unknown as {
        sessions: Map<string, {
          session: {
            prompt(text: string): Promise<void>;
            sessionManager: {
              appendMessage(message: unknown): string;
              buildSessionContext(): { messages: Array<{ content: Array<{ type: string; text: string }> }> };
              getLeafId(): string | null;
            };
          };
        }>;
      }
    ).sessions.get(reopened.sessionId)!;
    assert.equal(
      reopenedManaged.session.sessionManager.getLeafId(),
      mainLeafAfterDelete
    );
    reopenedManaged.session.prompt = async (text: string) => {
      const contextText = reopenedManaged.session.sessionManager
        .buildSessionContext()
        .messages.map((message) =>
          message.content
            .filter((part) => part.type === "text")
            .map((part) => part.text)
            .join("")
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

test("SessionService revise and default fork use restored branch head after reopen", async () => {
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
    const reviseManaged = (reviseService as any).sessions.get(reopened.sessionId);
    reviseManaged.session.prompt = async (text: string) => {
      reviseManaged.session.sessionManager.appendMessage({
        role: "user",
        content: [{ type: "text", text }],
        timestamp: Date.now(),
      });
    };
    const revised = reviseService.reviseLatest(reopened.sessionId, "revised first");
    await revised.completion;
    assert.equal(revised.ids.turnId, first.ids.turnId);
    await reviseService.disposeAll();

    const forkService = createTestService(fixture);
    const forkOpened = await forkService.openSession(created.sessionId, {
      rolePresetSlug: "role-conceptual-theory-companion",
      kbDomain: "ep-core",
      soulSlug: "soul-latest",
    });
    const branchHeadBeforeFork =
      readSessionDetail(fixture.dataDir, created.sessionId)?.activeBranch
        ?.activeLeafEntryId;
    const forked = await forkService.forkSession(
      forkOpened.sessionId,
      "collaboration"
    );
    const sourceDetail = readSessionDetail(fixture.dataDir, created.sessionId);
    const forkDetail = readSessionDetail(fixture.dataDir, forked.sessionId);
    assert.notEqual(forked.sessionId, created.sessionId);
    assert.equal(sourceDetail?.activeBranch?.branchId, "main");
    assert.equal(forkDetail?.transcript.at(-1)?.entryId, branchHeadBeforeFork);
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
      /No completed latest user turn/
    );
  } finally {
    await service.disposeAll();
  }
});

test("SessionService explicit forks create a new session with copied workspace", async () => {
  async function runCase(purpose: "collaboration" | "comparison") {
    const fixture = setupFixture();
    const service = createTestService(fixture);
    const created = await service.createSession({
      rolePresetSlug: "role-conceptual-theory-companion",
      kbDomain: "ep-core",
      soulSlug: "soul-latest",
    });
    const manifest = service.getManifest(created.sessionId);
    writeFileSync(join(manifest.sessionCwd, "shared-note.txt"), "source", "utf-8");
    const managed = (
      service as unknown as {
        sessions: Map<string, {
          session: {
            sessionManager: {
              appendMessage(message: unknown): string;
              getLeafId(): string | null;
            };
          };
        }>;
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
      created.sessionId
    )?.transcript.find(
      (message) => message.role === "assistant" && message.text === "fork answer"
    )?.entryId;
    assert.equal(projectedForkPoint, forkPoint);

    try {
      const forked = await service.forkSession(
        created.sessionId,
        purpose,
        projectedForkPoint ?? undefined
      );
      const sourceDetail = readSessionDetail(fixture.dataDir, created.sessionId);
      const forkDetail = readSessionDetail(fixture.dataDir, forked.sessionId);
      const forkManifest = service.getManifest(forked.sessionId);
      assert.notEqual(forked.sessionId, created.sessionId);
      assert.equal(sourceDetail?.activeBranch?.branchId, "main");
      assert.equal(forkDetail?.activeBranch?.branchId, "main");
      assert.notEqual(forkManifest.piSessionFile, manifest.piSessionFile);
      assert.notEqual(forkManifest.sessionCwd, manifest.sessionCwd);
      assert.equal(
        readFileSync(join(forkManifest.sessionCwd!, "shared-note.txt"), "utf-8"),
        "source"
      );
      assert.equal(
        forkDetail?.transcript.at(-1)?.text,
        "fork answer"
      );
    } finally {
      await service.disposeAll();
    }
  }

  await runCase("collaboration");
  await runCase("comparison");
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
  const forkFile = join(fixture.root, "failed-fork.jsonl");
  writeFileSync(forkFile, "partial", "utf-8");
  managed.session.sessionManager.createBranchedSession = () => forkFile;
  (service as any).openManagedRuntime = async () => {
    throw new Error("forced fork open failure");
  };

  try {
    await assert.rejects(
      () => service.forkSession(created.sessionId, "comparison", forkPoint),
      /forced fork open failure/
    );
    const detail = readSessionDetail(fixture.dataDir, created.sessionId);
    assert.equal(existsSync(forkFile), false);
    assert.equal(detail?.branchIndex?.activeBranchId, "main");
    assert.equal(detail?.branchIndex?.branches.length, 1);
    assert.equal(
      readdirSync(join(fixture.dataDir, "sessions")).length,
      1
    );
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
    }
  );

  try {
    const manifest = service.getManifest(snapshot.sessionId);
    const sessionRecord = JSON.parse(
      readFileSync(join(manifest.recordsDir, "session.json"), "utf-8")
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

test("SessionService creates private sessions and refreshes private activity on prompt", async () => {
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
      visibility: "private",
      consentSnapshot: {
        researcherReadable: true,
        quoteAfterAnonymization: true,
        privateOverride: false,
      },
    }
  );
  const managed = (
    service as unknown as {
      sessions: Map<string, {
        session: {
          prompt(text: string): Promise<void>;
          sessionManager: { appendMessage(message: unknown): string };
        };
      }>;
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
      readSessionDetail(fixture.dataDir, snapshot.sessionId)?.session.visibility,
      "private"
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
      "test_role_switch"
    );
    const switchedSoul = await service.replaceSession(
      snapshot.sessionId,
      {
        rolePresetSlug: "alternate",
        kbDomain: "all",
        soulSlug: "soul-test",
      },
      "test_soul_switch"
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
      "history before config switch"
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
      ]
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
        sessions: Map<string, { session: { sessionManager: { appendMessage(message: unknown): void } } }>;
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
        sessions: Map<string, { session: { sessionManager: { appendMessage(message: unknown): void } } }>;
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
      "instruction_switch"
    );
    const after = service.getManifest(created.sessionId);
    const detail = readSessionDetail(fixture.dataDir, created.sessionId);

    assert.equal(changed.sessionId, created.sessionId);
    assert.equal(after.piSessionFile, before.piSessionFile);
    assert.equal(after.customInstruction.ref, "research.rules");
    assert.match(after.customInstruction.sha256 ?? "", /^[a-f0-9]{64}$/);
    assert.equal(detail?.effectiveConfig.customInstruction.ref, "research.rules");
    assert.deepEqual(
      detail?.configEvents.at(-1)?.changedFields,
      ["customInstructionRef"]
    );
  } finally {
    await service.disposeAll();
  }
});

test("SessionService reassigns project without changing runtime identity or config", async () => {
  const fixture = setupFixture();
  const service = createTestService(fixture);
  const created = await service.createSession({
    projectId: null,
    rolePresetSlug: "role-conceptual-theory-companion",
    kbDomain: "ep-core",
    soulSlug: "soul-latest",
  });

  try {
    const before = service.getManifest(created.sessionId);
    const changed = service.setProjectId(created.sessionId, "manual-role-uat");
    const after = service.getManifest(created.sessionId);
    const detail = readSessionDetail(fixture.dataDir, created.sessionId);

    assert.equal(changed.sessionId, created.sessionId);
    assert.equal(changed.projectId, "manual-role-uat");
    assert.equal(after.piSessionFile, before.piSessionFile);
    assert.equal(after.rolePreset.slug, before.rolePreset.slug);
    assert.equal(after.soul.slug, before.soul.slug);
    assert.equal(detail?.session.projectId, "manual-role-uat");
    assert.equal(detail?.effectiveConfig?.projectId, "manual-role-uat");
    assert.deepEqual(detail?.configEvents.at(-1)?.changedFields, ["projectId"]);
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
      ["conversation-summary"]
    );
    assert.throws(
      () => service.invokeSkill(created.sessionId, "debug-only"),
      /Unknown Alt Theory skill/
    );
    const managed = (
      service as unknown as {
        sessions: Map<string, { session: { prompt(text: string): Promise<void> } }>;
      }
    ).sessions.get(created.sessionId)!;
    let promptText = "";
    managed.session.prompt = async (text: string) => {
      promptText = text;
    };
    const run = service.invokeSkill(
      created.sessionId,
      "conversation-summary",
      "Focus on decisions"
    );
    await run.completion;
    assert.ok(
      promptText.endsWith(
        "/skill:conversation-summary Focus on decisions"
      )
    );
    const events = readFileSync(
      join(
        fixture.dataDir,
        "sessions",
        created.sessionId,
        "records",
        "session-events.jsonl"
      ),
      "utf-8"
    )
      .trim()
      .split(/\r?\n/)
      .map((line) => JSON.parse(line) as { type: string; details?: { skillName?: string } });
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
    readOnly: true,
    promptMode: "alt-only",
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

    const run = service.runPrompt(snapshot.sessionId, "first prompt without configured model");
    assert.throws(
      () => service.runPrompt(snapshot.sessionId, "second prompt"),
      (error) => error instanceof SessionBusyError && error.code === "session_busy"
    );
    assert.throws(
      () => service.setKbDomain(snapshot.sessionId, "all"),
      (error) => error instanceof SessionBusyError && error.code === "session_busy"
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
          "busy_role_switch"
        ),
      (error) => error instanceof SessionBusyError && error.code === "session_busy"
    );
    assert.throws(
      () => service.reviseLatest(snapshot.sessionId, "revised"),
      (error) => error instanceof SessionBusyError && error.code === "session_busy"
    );
    assert.throws(
      () => service.deleteLatest(snapshot.sessionId),
      (error) => error instanceof SessionBusyError && error.code === "session_busy"
    );
    await assert.rejects(
      () => service.forkSession(snapshot.sessionId, "collaboration"),
      (error) => error instanceof SessionBusyError && error.code === "session_busy"
    );
    assert.ok(resolvePrompt);
    resolvePrompt();
    await run.completion;
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

    assert.equal(service.getManifest(snapshot.sessionId).sessionId, snapshot.sessionId);
    assert.equal(service.getSnapshot(snapshot.sessionId).sessionId, snapshot.sessionId);
    await service.abort(snapshot.sessionId, "detach-test");
    assert.equal(eventCount, 0);
  } finally {
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
    "utf-8"
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
    readOnly: true,
    promptMode: "alt-only",
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
  managed.session.modelRegistry.find = (provider: string, modelId: string) => ({
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
      SessionBusyError
    );

    continueGate.resolve();
    await run.completion;

    const latest = latestRunSnapshots(
      service.getManifest(created.sessionId).recordsDir
    )[0];
    assert.equal(latest.status, "completed");
    assert.equal(latest.assistantEntryIds.length, 1);
    assert.equal(currentModel.id, "qwen3.7-plus");
  } finally {
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
    "utf-8"
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
    readOnly: true,
    promptMode: "alt-only",
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
  managed.session.modelRegistry.find = (provider: string, modelId: string) => ({
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
      service.getManifest(created.sessionId).recordsDir
    )[0];
    assert.equal(latest.status, "failed");
    assert.equal(managed.busy, false);
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
    rolePresetPath: join(fixture.rolePresetsDir, "role-conceptual-theory-companion.md"),
    rolePresetSlug: "role-conceptual-theory-companion",
    kbDir: fixture.kbDir,
    kbDomain: "ep-core",
    piPromptTemplatesDir: fixture.piPromptTemplatesDir,
    readOnly: true,
    promptMode: "alt-only",
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
