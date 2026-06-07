import assert from "node:assert/strict";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { dirname, join } from "path";
import test from "node:test";
import { mkdtempSync } from "fs";
import { assembleCoreSoul } from "./core-soul.js";
import { createSessionDirs, writeJsonAtomic } from "./data-dir.js";

test("createSessionDirs creates workspace, history, and records", () => {
  const root = mkdtempSync(join(tmpdir(), "alt-theory-data-"));
  const dirs = createSessionDirs(root, "session-test");

  assert.equal(dirs.sessionId, "session-test");
  assert.ok(existsSync(dirs.sessionCwd));
  assert.ok(existsSync(dirs.piSessionDir));
  assert.ok(existsSync(dirs.recordsDir));
  assert.equal(dirs.writeDir, dirs.sessionCwd);
  assert.equal(existsSync(join(dirname(dirs.sessionCwd), "notes")), false);
  assert.throws(
    () => createSessionDirs(root, "session-test"),
    /Session directory already exists/
  );
});

test("writeJsonAtomic writes complete JSON", () => {
  const root = mkdtempSync(join(tmpdir(), "alt-theory-json-"));
  const path = join(root, "nested", "value.json");

  writeJsonAtomic(path, { value: 42 });

  assert.deepEqual(JSON.parse(readFileSync(path, "utf-8")), { value: 42 });
});

test("assembleCoreSoul selects and sorts modules with provenance", () => {
  const root = mkdtempSync(join(tmpdir(), "alt-theory-soul-"));
  const basePath = join(root, "core-soul.md");
  mkdirSync(root, { recursive: true });
  writeFileSync(basePath, "BASE", "utf-8");
  writeFileSync(join(root, "core-soul-zeta-on.md"), "ZETA", "utf-8");
  writeFileSync(join(root, "core-soul-alpha-full.md"), "ALPHA", "utf-8");

  const result = assembleCoreSoul({
    basePath,
    modulesDir: root,
    activeModules: ["zeta-on", "alpha-full"],
  });

  assert.equal(result.content, "BASE\n\nALPHA\n\nZETA");
  assert.deepEqual(
    result.modules.map(({ slug, variable, value }) => ({
      slug,
      variable,
      value,
    })),
    [
      { slug: "alpha-full", variable: "alpha", value: "full" },
      { slug: "zeta-on", variable: "zeta", value: "on" },
    ]
  );
});

test("assembleCoreSoul rejects unknown modules and duplicate variables", () => {
  const root = mkdtempSync(join(tmpdir(), "alt-theory-soul-errors-"));
  const basePath = join(root, "core-soul.md");
  writeFileSync(basePath, "BASE", "utf-8");
  writeFileSync(join(root, "core-soul-mode-a.md"), "A", "utf-8");
  writeFileSync(join(root, "core-soul-mode-b.md"), "B", "utf-8");

  assert.throws(
    () =>
      assembleCoreSoul({
        basePath,
        modulesDir: root,
        activeModules: ["missing-on"],
      }),
    /Unknown core-soul module/
  );
  assert.throws(
    () =>
      assembleCoreSoul({
        basePath,
        modulesDir: root,
        activeModules: ["mode-a", "mode-b"],
      }),
    /Multiple core-soul values/
  );
});
