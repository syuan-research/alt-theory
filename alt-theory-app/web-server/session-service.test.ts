import assert from "node:assert/strict";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "fs";
import { mkdtempSync } from "fs";
import { tmpdir } from "os";
import { join, resolve } from "path";
import test from "node:test";
import { createAltTheorySession } from "../core/alt-theory-core.js";
import { createSessionDirs } from "../core/data-dir.js";
import { SessionBusyError, SessionService } from "./session-service.js";
import { readSessionDetail } from "./session-store.js";
import { readConfigEvents } from "./config-events.js";

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
  writeFileSync(join(rolePresetsDir, "default.md"), "Default role", "utf-8");
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
    assert.deepEqual(
      readConfigEvents(manifest.recordsDir).map((event) => event.reason),
      ["creation"]
    );
  } finally {
    await service.disposeAll();
  }
});

test("SessionService switches role and soul inside the same materialized session", async () => {
  const fixture = setupFixture();
  const service = createTestService(fixture);
  const snapshot = await service.createSession({
    rolePresetSlug: "default",
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

test("SessionService switches custom instruction inside the same materialized session", async () => {
  const fixture = setupFixture();
  const service = createTestService(fixture);
  const created = await service.createSession({
    rolePresetSlug: "default",
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
    rolePresetSlug: "default",
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
      rolePresetSlug: "default",
      kbDomain: "ep-core",
      soulSlug: "soul-latest",
    });
    assert.equal(opened.rolePresetSlug, "default");
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
