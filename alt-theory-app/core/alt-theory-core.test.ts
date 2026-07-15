import assert from "node:assert/strict";
import test from "node:test";
import { mkdtempSync, mkdirSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { createSessionDirs } from "./data-dir.js";
import { createAltTheorySession } from "./alt-theory-core.js";

test("capability mode switches prompt layers and active tools on the live session", async () => {
  const root = mkdtempSync(join(tmpdir(), "alt-theory-core-mode-"));
  const appContextPath = join(root, "ALTTHEORY.md");
  const kbDir = join(root, "kb");
  mkdirSync(kbDir, { recursive: true });
  writeFileSync(appContextPath, "Mode-switch app context", "utf-8");

  const result = await createAltTheorySession({
    ...createSessionDirs(join(root, "data"), "mode-switch-test"),
    appContextPath,
    kbDir,
    kbDomain: "none",
    readOnly: true,
    promptMode: "alt-only",
    resourceDiscovery: "clean",
  });
  const { session } = result;

  // Pure: Alt assembly replaces Pi's prompt; session-bounded read-only tools.
  assert.equal(result.getMode(), "pure");
  const purePrompt = session.systemPrompt;
  assert.ok(purePrompt.includes("Alt Theory Application Context"));
  assert.ok(purePrompt.includes("Alt Theory Tool Harness"));
  assert.deepEqual(
    [...session.getActiveToolNames()].sort(),
    ["find", "grep", "ls", "read"]
  );

  // Full: Pi default prompt preserved, semantic sections appended,
  // Pi default tool set active. Applies without any session rebuild.
  await result.setMode("full");
  assert.equal(result.getMode(), "full");
  const fullPrompt = session.systemPrompt;
  assert.ok(fullPrompt.includes("Alt Theory Application Context"));
  assert.ok(!fullPrompt.includes("Alt Theory Tool Harness"));
  assert.notEqual(fullPrompt, purePrompt);
  assert.deepEqual(
    [...session.getActiveToolNames()].sort(),
    ["bash", "edit", "read", "write"]
  );

  // And back: the switch is symmetric.
  await result.setMode("pure");
  assert.equal(session.systemPrompt, purePrompt);
  assert.deepEqual(
    [...session.getActiveToolNames()].sort(),
    ["find", "grep", "ls", "read"]
  );

  await session.dispose();
});
