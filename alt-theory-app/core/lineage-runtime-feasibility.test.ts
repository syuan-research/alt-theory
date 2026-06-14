import assert from "node:assert/strict";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { mkdtempSync } from "fs";
import { tmpdir } from "os";
import { join, resolve } from "path";
import test from "node:test";
import { SessionManager } from "@mariozechner/pi-coding-agent";
import {
  createAltTheorySession,
  openAltTheorySession,
} from "./alt-theory-core.js";
import { createSessionDirs, resolveSessionRoot } from "./data-dir.js";

type JsonRecord = Record<string, any>;

function userMessage(text: string): any {
  return {
    role: "user",
    content: [{ type: "text", text }],
    timestamp: Date.now(),
  };
}

function assistantMessage(text: string): any {
  return {
    role: "assistant",
    content: [{ type: "text", text }],
    api: "openai-completions",
    provider: "test-provider",
    model: "test-model",
    usage: {
      input: 0,
      output: 0,
      cacheRead: 0,
      cacheWrite: 0,
      totalTokens: 0,
      cost: {
        input: 0,
        output: 0,
        cacheRead: 0,
        cacheWrite: 0,
        total: 0,
      },
    },
    stopReason: "stop",
    timestamp: Date.now(),
  };
}

function textOf(message: any): string {
  return message.content
    .filter((part: any) => part.type === "text")
    .map((part: any) => part.text)
    .join("");
}

function appendExchange(
  manager: SessionManager,
  userText: string,
  assistantText: string
) {
  const userId = manager.appendMessage(userMessage(userText));
  const assistantId = manager.appendMessage(assistantMessage(assistantText));
  return { userId, assistantId };
}

function readJsonl(path: string): JsonRecord[] {
  return readFileSync(path, "utf-8")
    .trim()
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line));
}

function setupAssetFixture(root: string) {
  const appContextPath = join(root, "ALTTHEORY.md");
  const soulOnePath = join(root, "soul-one.md");
  const soulTwoPath = join(root, "soul-two.md");
  const rolePresets = join(root, "role-presets");
  const kb = join(root, "kb");
  const skills = join(root, "skills");

  mkdirSync(rolePresets, { recursive: true });
  mkdirSync(join(kb, "ep-core"), { recursive: true });
  mkdirSync(skills, { recursive: true });
  writeFileSync(appContextPath, "Lineage feasibility app context", "utf-8");
  writeFileSync(soulOnePath, "SOUL-ONE-MARKER", "utf-8");
  writeFileSync(soulTwoPath, "SOUL-TWO-MARKER", "utf-8");
  writeFileSync(join(rolePresets, "default.md"), "ROLE-DEFAULT-MARKER", "utf-8");
  writeFileSync(join(rolePresets, "alternate.md"), "ROLE-ALT-MARKER", "utf-8");
  writeFileSync(
    join(skills, "conversation-summary.md"),
    "# Conversation Summary\n\nUse uncertainty markers.",
    "utf-8"
  );

  return {
    appContextPath,
    soulOnePath,
    soulTwoPath,
    defaultRolePath: join(rolePresets, "default.md"),
    alternateRolePath: join(rolePresets, "alternate.md"),
    kb,
    skills,
  };
}

function candidateReadableSessionId({
  role,
  soul,
  model,
}: {
  role: string | null;
  soul: string | null;
  model: string | null;
}) {
  const normalize = (value: string | null) => {
    const normalized = (value ?? "none")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 24);
    return normalized || "none";
  };
  return [
    "20260614-153045",
    normalize(role),
    normalize(soul),
    normalize(model),
  ].join("__");
}

test("Pi same-file branching supports latest-turn revision mapping and restart recovery", () => {
  const root = mkdtempSync(join(tmpdir(), "alt-theory-lineage-tree-"));
  const cwd = join(root, "workspace");
  const history = join(root, "history");
  mkdirSync(cwd, { recursive: true });

  const manager = SessionManager.create(cwd, history);
  manager.newSession({ id: "lineage-main" });
  appendExchange(manager, "turn one", "answer one");
  const original = appendExchange(
    manager,
    "latest turn original",
    "original answer"
  );
  const sessionFile = manager.getSessionFile();
  assert.ok(sessionFile);
  assert.equal(existsSync(sessionFile), true);

  const originalUserEntry = manager.getEntry(original.userId);
  assert.ok(originalUserEntry);
  assert.ok(originalUserEntry.parentId);
  manager.branch(originalUserEntry.parentId);
  const revised = appendExchange(
    manager,
    "latest turn revised",
    "revised answer"
  );

  assert.equal(manager.getSessionFile(), sessionFile);
  assert.ok(manager.getEntry(original.assistantId));
  assert.ok(manager.getEntry(revised.assistantId));
  assert.deepEqual(
    manager.getChildren(originalUserEntry.parentId).map((entry) => {
      assert.equal(entry.type, "message");
      return textOf(entry.message);
    }),
    ["latest turn original", "latest turn revised"]
  );
  assert.deepEqual(
    manager.buildSessionContext().messages.map(textOf),
    ["turn one", "answer one", "latest turn revised", "revised answer"]
  );

  const reopened = SessionManager.open(sessionFile, history);
  assert.equal(reopened.getSessionId(), "lineage-main");
  assert.deepEqual(
    reopened.buildSessionContext().messages.map(textOf),
    ["turn one", "answer one", "latest turn revised", "revised answer"]
  );
  assert.ok(reopened.getEntry(original.assistantId));
});

test("Pi createBranchedSession creates a separate fork file with parent linkage", () => {
  const root = mkdtempSync(join(tmpdir(), "alt-theory-lineage-fork-"));
  const cwd = join(root, "workspace");
  const history = join(root, "history");
  mkdirSync(cwd, { recursive: true });

  const manager = SessionManager.create(cwd, history);
  manager.newSession({ id: "lineage-source" });
  const first = appendExchange(manager, "fork point user", "fork point answer");
  appendExchange(manager, "later user", "later answer");
  const sourceFile = manager.getSessionFile();
  assert.ok(sourceFile);
  assert.equal(existsSync(sourceFile), true);

  const forkFile = manager.createBranchedSession(first.assistantId);
  assert.ok(forkFile);
  assert.notEqual(resolve(forkFile), resolve(sourceFile));
  assert.equal(existsSync(forkFile), true);

  const forkRecords = readJsonl(forkFile);
  const forkHeader = forkRecords[0];
  assert.equal(forkHeader.type, "session");
  assert.equal(resolve(forkHeader.parentSession), resolve(sourceFile));
  assert.equal(resolve(forkHeader.cwd), resolve(cwd));
  assert.deepEqual(
    forkRecords
      .filter((record) => record.type === "message")
      .map((record) => textOf(record.message)),
    ["fork point user", "fork point answer"]
  );

  const reopenedFork = SessionManager.open(forkFile, history);
  assert.deepEqual(
    reopenedFork.buildSessionContext().messages.map(textOf),
    ["fork point user", "fork point answer"]
  );
  const reopenedSource = SessionManager.open(sourceFile, history);
  assert.deepEqual(reopenedSource.buildSessionContext().messages.map(textOf), [
    "fork point user",
    "fork point answer",
    "later user",
    "later answer",
  ]);
});

test("Pi custom message entries persist and rebuild as structured context", () => {
  const root = mkdtempSync(join(tmpdir(), "alt-theory-lineage-context-"));
  const cwd = join(root, "workspace");
  const history = join(root, "history");
  mkdirSync(cwd, { recursive: true });

  const manager = SessionManager.create(cwd, history);
  manager.newSession({ id: "lineage-context" });
  appendExchange(manager, "plain user text", "plain answer");
  manager.appendCustomMessageEntry(
    "alt-theory-context",
    "Structured KB context for the next turn",
    false,
    { policy: "kb-domain" }
  );
  const sessionFile = manager.getSessionFile();
  assert.ok(sessionFile);
  assert.equal(existsSync(sessionFile), true);

  const reopened = SessionManager.open(sessionFile, history);
  const custom = reopened
    .buildSessionContext()
    .messages.find((message: any) => message.role === "custom");
  assert.ok(custom);
  assert.equal(custom.customType, "alt-theory-context");
  assert.equal(custom.content, "Structured KB context for the next turn");
  assert.deepEqual(custom.details, { policy: "kb-domain" });
});

test("Alt Theory can reopen the same Pi history with changed prompt resources", async () => {
  const root = mkdtempSync(join(tmpdir(), "alt-theory-lineage-rebuild-"));
  const dataDir = join(root, "data");
  const assets = setupAssetFixture(root);
  const dirs = createSessionDirs(dataDir, "lineage-rebuild");

  const created = await createAltTheorySession({
    ...dirs,
    appContextPath: assets.appContextPath,
    soulPath: assets.soulOnePath,
    soulSlug: "soul-one",
    rolePresetPath: assets.defaultRolePath,
    rolePresetSlug: "default",
    kbDir: assets.kb,
    kbDomain: "ep-core",
    readOnly: true,
    promptMode: "alt-only",
    resourceDiscovery: "clean",
  });

  const sessionFile = created.session.sessionFile;
  assert.ok(sessionFile);
  try {
    appendExchange(created.session.sessionManager, "persisted user", "persisted answer");
    assert.match(created.session.agent.state.systemPrompt, /SOUL-ONE-MARKER/);
    assert.match(created.session.agent.state.systemPrompt, /ROLE-DEFAULT-MARKER/);
  } finally {
    created.session.dispose();
  }

  const originalManifest = JSON.parse(
    readFileSync(join(dirs.recordsDir, "assembly-manifest.json"), "utf-8")
  );
  const reopened = await openAltTheorySession({
    ...dirs,
    sessionFile,
    originalManifest,
    appContextPath: assets.appContextPath,
    soulPath: assets.soulTwoPath,
    soulSlug: "soul-two",
    rolePresetPath: assets.alternateRolePath,
    rolePresetSlug: "alternate",
    kbDir: assets.kb,
    kbDomain: "all",
    readOnly: true,
    promptMode: "alt-only",
    resourceDiscovery: "internal",
    skillsDir: assets.skills,
  });

  try {
    assert.equal(reopened.session.sessionId, "lineage-rebuild");
    assert.equal(resolve(reopened.session.sessionFile!), resolve(sessionFile));
    assert.deepEqual(
      reopened.session.sessionManager.buildSessionContext().messages.map(textOf),
      ["persisted user", "persisted answer"]
    );
    assert.match(reopened.session.agent.state.systemPrompt, /SOUL-TWO-MARKER/);
    assert.match(reopened.session.agent.state.systemPrompt, /ROLE-ALT-MARKER/);
    assert.ok(
      reopened.resumeWarnings.some((warning) => warning.includes("soul hash"))
    );
    assert.ok(
      reopened.resumeWarnings.some((warning) =>
        warning.includes("role preset hash")
      )
    );
    assert.equal(reopened.manifest.resourceDiscovery.mode, "internal");
    assert.equal(resolve(reopened.manifest.resourceDiscovery.skillsDir!), resolve(assets.skills));
  } finally {
    reopened.session.dispose();
  }
});

test("Candidate readable session IDs are accepted and bounded with realistic metadata", () => {
  const root = mkdtempSync(join(tmpdir(), "alt-theory-lineage-id-"));
  const id = candidateReadableSessionId({
    role: "Quant Methods Researcher With Long Launch Label",
    soul: "Stable Research Conversation Partner",
    model: "mimo-v2.5-pro-experimental-local-alias",
  });
  const sessionRoot = resolveSessionRoot(root, id);

  assert.equal(
    id,
    "20260614-153045__quant-methods-researcher__stable-research-conversa__mimo-v2-5-pro-experiment"
  );
  assert.ok(sessionRoot);
  assert.equal(sessionRoot.includes(".."), false);
  assert.equal(id.length <= 96, true);
  assert.equal(sessionRoot.length < 240, true);
});
