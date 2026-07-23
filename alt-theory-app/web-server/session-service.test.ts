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
  APPROVAL_ALLOW_SESSION,
  APPROVAL_DENY,
} from "../core/security-extension.js";
import {
  SessionBusyError,
  SessionService,
  type SessionServiceEvent,
} from "./session-service.js";
import { readSessionDetail } from "./session-store.js";
import { readAbComparisonRecords } from "./ab-records.js";
import { readV4SessionHeader } from "./session-records.js";
import { readConfigEvents } from "./config-events.js";
import { latestRunSnapshots, readRunRecords } from "./run-records.js";

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

function createTestService(
  fixture: ReturnType<typeof setupFixture>,
  resourceDiscovery: "clean" | "internal" = "clean"
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
    readOnly: true,
    promptMode: "alt-only",
    resourceDiscovery,
    skillsDir: fixture.skillsDir,
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
    assert.equal(existsSync(branchIndexPath), false);

    const sessionRecord = JSON.parse(readFileSync(sessionRecordPath, "utf-8"));
    assert.deepEqual(
      {
        schemaVersion: sessionRecord.schemaVersion,
        recordType: sessionRecord.recordType,
        projectId: sessionRecord.projectId,
        recordModel: sessionRecord.recordModel,
      },
      {
        schemaVersion: 1,
        recordType: "session",
        projectId: "manual-role-uat",
        recordModel: "v0.4",
      }
    );

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
    const piLeafBeforeFork = readSessionDetail(
      fixture.dataDir,
      created.sessionId
    )?.transcript.at(-1)?.entryId;
    const forked = await forkService.forkSession(
      forkOpened.sessionId,
      "side"
    );
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
      /No completed latest user turn/
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
      assert.equal(sourceDetail?.session.sessionId, created.sessionId);
      assert.equal(forkDetail?.session.sessionId, forked.sessionId);
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

  await runCase("side");
  await runCase("ab-arm");
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
    service.getTranscript(created.sessionId).map((message) => message.text).join("\n"),
    /imported answer marker/
  );
  await service.disposeAll();

  const reopenedService = createTestService(fixture);
  try {
    const reopened = await reopenedService.openSession(created.sessionId, {
      rolePresetSlug: "role-conceptual-theory-companion",
      kbDomain: "ep-core",
      soulSlug: "soul-latest",
    });
    const reopenedManaged = (reopenedService as any).sessions.get(reopened.sessionId);
    assert.equal(reopenedManaged.session.sessionManager.getLeafId(), importedLeaf);
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

test("related Helper invokes its skill once before promotion", async () => {
  const fixture = setupFixture();
  writeFileSync(
    join(fixture.skillsDir, "alt-theory-help.md"),
    "---\nname: alt-theory-help\ndescription: Test helper\n---\nCheck current docs.\n",
    "utf-8"
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
    const helper = await service.createRelatedSession(parent.sessionId, "helper");
    const helperDetail = readSessionDetail(fixture.dataDir, helper.sessionId);
    const helperHeader = readV4SessionHeader(
      service.getManifest(helper.sessionId).recordsDir
    );
    assert.deepEqual(helperDetail?.transcript ?? [], []);
    assert.deepEqual(helperHeader?.forkedFrom, {
      sessionId: parent.sessionId,
      purpose: "helper",
    });
    assert.equal(
      service.getManifest(helper.sessionId).skills?.some(
        (skill) => skill.name === "alt-theory-help"
      ),
      true
    );
    assert.equal(
      latestRunSnapshots(service.getManifest(helper.sessionId).recordsDir).length,
      0
    );

    let helperPrompt = "";
    const helperManaged = (service as any).sessions.get(helper.sessionId);
    helperManaged.session.prompt = async (text: string) => {
      helperPrompt = text;
    };
    await service.runPrompt(helper.sessionId, "How do I start locally?").completion;
    assert.equal(
      helperPrompt,
      "/skill:alt-theory-help How do I start locally?"
    );

    await service.runPrompt(helper.sessionId, "Where is that button?").completion;
    assert.equal(helperPrompt, "Where is that button?");

    service.promoteRelatedSession(helper.sessionId);
    const promoted = readV4SessionHeader(
      service.getManifest(helper.sessionId).recordsDir
    );
    assert.equal(promoted?.forkedFrom?.purpose, "fork");
  } finally {
    await service.disposeAll();
  }
});

test("imported session invokes imported-session-context skill once on first run", async () => {
  const fixture = setupFixture();
  writeFileSync(
    join(fixture.skillsDir, "imported-session-context.md"),
    "---\nname: imported-session-context\ndescription: Imported session context\n---\nExplain import losses.\n",
    "utf-8"
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
    "utf-8"
  );
  try {
    let prompt = "";
    const managed = (service as any).sessions.get(created.sessionId);
    managed.session.prompt = async (text: string) => {
      prompt = text;
    };
    await service.runPrompt(created.sessionId, "Continue the imported work.").completion;
    assert.equal(
      prompt,
      "/skill:imported-session-context Continue the imported work."
    );

    await service.runPrompt(created.sessionId, "Second turn stays plain.").completion;
    assert.equal(prompt, "Second turn stays plain.");
  } finally {
    await service.disposeAll();
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
        await service.forkSession(created.sessionId, "ab-arm", forkPoint, overrides)
      );
    }
    assert.equal(new Set(arms.map((a) => a.sessionId)).size, 3);
    assert.equal(service.getManifest(created.sessionId).soul?.slug, "soul-latest");
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
      null
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
      readSessionDetail(fixture.dataDir, created.sessionId)?.transcript.at(-1)?.text,
      "parent continues"
    );
  } finally {
    await service.disposeAll();
  }
});

test("generateAbComparison runs Pure-pinned arms and records candidates on the parent", async () => {
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
  (service as any).runPromptWithLineage = (armManaged: any, text: string, options?: any) => {
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
      [{ label: "with-soul" }, { label: "no-soul", selectorOverrides: { soulSlug: null } }]
    );
    assert.equal(record.candidates.length, 2);
    assert.equal(record.trigger, "backend_request");
    for (const candidate of record.candidates) {
      assert.equal(candidate.outputText, `arm:${candidate.candidateId}`);
      const armManaged = (service as any).sessions.get(candidate.candidateId);
      assert.equal(armManaged.getMode(), "pure");
    }
    assert.equal(record.candidates[0].role, "role-conceptual-theory-companion");
    // The record lands on the PARENT's records dir and the parent is untouched.
    const stored = readAbComparisonRecords(
      join(fixture.dataDir, "sessions", created.sessionId, "records")
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
      /Unknown KB domain/
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
      /forced fork open failure/
    );
    const detail = readSessionDetail(fixture.dataDir, created.sessionId);
    assert.equal(detail?.session.sessionId, created.sessionId);
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
      () => service.forkSession(snapshot.sessionId, "side"),
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

test("SessionService switches capability mode in-session and restores it on reopen", async () => {
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
    assert.equal(created.mode, "pure");
    const run = service.runPrompt(created.sessionId, "hello");
    await run.completion;

    const switched = await service.switchMode(created.sessionId, "full");
    assert.equal(switched.mode, "full");
    assert.equal(switched.sessionId, created.sessionId);

    const manifest = service.getManifest(created.sessionId);
    const header = JSON.parse(
      readFileSync(join(manifest.recordsDir, "session.json"), "utf-8")
    );
    assert.equal(header.mode, "full");
    const configReasons = readConfigEvents(manifest.recordsDir);
    assert.equal(configReasons.at(-1)?.reason, "user_change");
    assert.deepEqual(configReasons.at(-1)?.changedFields, ["promptMode"]);
    assert.equal(configReasons.at(-1)?.effective.promptMode, "pi-default");
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
    assert.equal(reopened.mode, "full");
  } finally {
    await reopenedService.disposeAll();
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
    { workspace: { primaryDir, additionalDirs: [extraDir] } }
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
      readFileSync(join(manifest.recordsDir, "session.json"), "utf-8")
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
      readFileSync(join(manifest.recordsDir, "session.json"), "utf-8")
    );
    assert.deepEqual(updatedHeader.workspace.additionalDirs, [
      resolve(extraDir),
      resolve(laterDir),
    ]);

    await assert.rejects(
      () => service.addWorkspaceDir(created.sessionId, join(fixture.root, "missing")),
      /does not exist/
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
    readOnly: true,
    promptMode: "alt-only",
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
            `Run ${event.toolName}?`
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
  const detachListener = service.attach(created.sessionId, (event) =>
    events.push(event)
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
    for (let i = 0; i < 50 && !events.some((e) => e.type === "approval_requested"); i++) {
      await new Promise((r) => setTimeout(r, 10));
    }
    const request = events.find((e) => e.type === "approval_requested");
    assert.ok(request && request.type === "approval_requested");
    assert.equal(request.payload.kind, "confirm");
    assert.equal(request.payload.title, "Approve tool");
    assert.equal(
      service.respondApproval(created.sessionId, request.payload.approvalId, {
        accept: true,
      }),
      true
    );
    assert.equal(await approvedCall, undefined);
    assert.ok(
      events.some(
        (e) =>
          e.type === "approval_resolved" &&
          e.payload.resolution === "responded"
      )
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
    const second = events.filter((e) => e.type === "approval_requested").at(-1)!;
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
      false
    );
  } finally {
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
    events.push(event)
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
      undefined
    );
    assert.equal(requested().length, 1);
    assert.ok(
      events.some(
        (event) =>
          event.type === "extension_notice" &&
          event.payload.message.startsWith("Allowed for this session:")
      )
    );

    // The allowance survives a loader reload (mode switch): it lives in the
    // per-session closure, not the per-reload factory.
    await service.switchMode(created.sessionId, "full");
    assert.equal(
      await managed.session.agent.beforeToolCall!({
        toolCall: { id: "sec-reload", name: "bash", arguments: {} },
        args: { command: "rm -rf scratch" },
      }),
      undefined
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
      undefined
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
    for (const prompt of ["first", "second", "third"]) {
      await service.runPrompt(created.sessionId, prompt).completion;
    }
    const recordsDir = service.getManifest(created.sessionId).recordsDir;
    const runs = latestRunSnapshots(recordsDir);
    assert.equal(runs.length, 3);
    const secondRun = runs[1];
    assert.equal(secondRun.status, "completed");

    const revised = service.reviseAt(
      created.sessionId,
      secondRun.userEntryId!,
      "revised-second"
    );
    await revised.completion;

    const after = latestRunSnapshots(recordsDir);
    assert.equal(
      after.find((run) => run.runId === runs[0].runId)?.status,
      "completed"
    );
    assert.equal(
      after.find((run) => run.runId === runs[1].runId)?.status,
      "superseded"
    );
    assert.equal(
      after.find((run) => run.runId === runs[2].runId)?.status,
      "superseded"
    );
    assert.equal(
      after.find((run) => run.runId === revised.ids.runId)?.supersedesRunId,
      secondRun.runId
    );
    assert.equal(revised.ids.turnId, secondRun.turnId);

    const text = managed.session.sessionManager
      .buildSessionContext()
      .messages.map((message) =>
        message.content
          .filter((part) => part.type === "text")
          .map((part) => part.text)
          .join("")
      )
      .join("\n");
    assert.match(text, /first/);
    assert.match(text, /revised-second/);
    assert.doesNotMatch(text, /answer:second/);
    assert.doesNotMatch(text, /third/);

    const detail = readSessionDetail(fixture.dataDir, created.sessionId);
    const userMessages = (detail?.transcript ?? []).filter(
      (message) => message.role === "user"
    );
    assert.deepEqual(
      userMessages.map((message) => message.text),
      ["first", "revised-second"]
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
      sessions: Map<string, {
        session: {
          prompt(text: string): Promise<void>;
          sessionManager: { appendMessage(message: unknown): string };
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
    await service.runPrompt(created.sessionId, "hello").completion;
    const snapshot = await service.setSessionWorkspace(
      created.sessionId,
      folder
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
          join(folder, "does-not-exist")
        ),
      /does not exist/
    );
  } finally {
    await service.disposeAll();
  }
});
