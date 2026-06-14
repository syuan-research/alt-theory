import assert from "node:assert/strict";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { mkdtempSync } from "fs";
import { tmpdir } from "os";
import { join, resolve } from "path";
import test from "node:test";
import { createAltTheorySession } from "../core/alt-theory-core.js";
import { createSessionDirs } from "../core/data-dir.js";
import { SessionBusyError, SessionService } from "./session-service.js";
import { readSessionDetail } from "./session-store.js";

function setupFixture() {
  const root = mkdtempSync(join(tmpdir(), "alt-theory-session-service-"));
  const dataDir = join(root, "data");
  const rolePresetsDir = join(root, "role-presets");
  const soulDir = join(root, "soul");
  const kbDir = join(root, "kb");
  const skillsDir = join(root, "skills");
  const appContextPath = join(root, "ALTTHEORY.md");
  const piPromptTemplatesDir = resolve("agent-assets", "prompts", "pi");

  mkdirSync(rolePresetsDir, { recursive: true });
  mkdirSync(soulDir, { recursive: true });
  mkdirSync(join(kbDir, "ep-core"), { recursive: true });
  mkdirSync(skillsDir, { recursive: true });
  writeFileSync(appContextPath, "Session service app context", "utf-8");
  writeFileSync(join(rolePresetsDir, "default.md"), "Default role", "utf-8");
  writeFileSync(join(soulDir, "soul-latest.md"), "Latest soul", "utf-8");

  return {
    root,
    dataDir,
    rolePresetsDir,
    soulDir,
    kbDir,
    skillsDir,
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
    runLabel: null,
    testBatch: null,
  });
}

test("SessionService creates managed sessions with v0.4 foundation records", async () => {
  const fixture = setupFixture();
  const service = createTestService(fixture);
  const snapshot = await service.createSession({
    rolePresetSlug: "default",
    kbDomain: "ep-core",
    soulSlug: "soul-latest",
  });

  try {
    assert.match(
      snapshot.sessionId,
      /^\d{8}-\d{6}__default__soul-latest__default$/
    );
    assert.equal(snapshot.rolePresetSlug, "default");
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
        activeBranchId: sessionRecord.activeBranchId,
        recordModel: sessionRecord.recordModel,
      },
      {
        schemaVersion: 1,
        recordType: "session",
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
  } finally {
    await service.disposeAll();
  }
});

test("SessionService rejects concurrent same-session prompt mutations with session_busy", async () => {
  const fixture = setupFixture();
  const service = createTestService(fixture);
  const snapshot = await service.createSession({
    rolePresetSlug: "default",
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
    rolePresetSlug: "default",
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

test("session store marks sessions without v0.4 records as legacy projection", async () => {
  const fixture = setupFixture();
  const dirs = createSessionDirs(fixture.dataDir, "legacy-session");
  const created = await createAltTheorySession({
    ...dirs,
    appContextPath: fixture.appContextPath,
    soulPath: join(fixture.soulDir, "soul-latest.md"),
    soulSlug: "soul-latest",
    rolePresetPath: join(fixture.rolePresetsDir, "default.md"),
    rolePresetSlug: "default",
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
