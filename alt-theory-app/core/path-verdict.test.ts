import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "fs";
import { homedir, tmpdir } from "os";
import { join } from "path";
import test from "node:test";
import {
  assertWritablePath,
  canonicalPathKey,
  isPathInside,
  samePath,
  verdict,
} from "./path-verdict.js";
import { sessionRoots, type Root } from "./root-policy.js";

function root(path: string, reason: Root["reason"] = "cwd"): Root {
  return { path, reason };
}

/** Junctions need no privilege on Windows; directory symlinks elsewhere. */
function linkDir(target: string, linkPath: string): void {
  symlinkSync(target, linkPath, process.platform === "win32" ? "junction" : "dir");
}

test("case A: a symlink in the workspace gates read and write alike", () => {
  const base = mkdtempSync(join(tmpdir(), "alt-theory-verdict-a-"));
  try {
    const ws = join(base, "ws");
    const documents = join(base, "documents");
    mkdirSync(ws);
    mkdirSync(documents);
    writeFileSync(join(documents, "secret.md"), "secret", "utf-8");
    linkDir(documents, join(ws, "link"));

    const through = join(ws, "link", "secret.md");
    assert.equal(verdict(through, "read", { readable: [root(ws)] }).outcome, "outside");
    assert.equal(verdict(through, "write", { writable: [root(ws)] }).outcome, "outside");
    assert.throws(
      () => assertWritablePath(through, [root(ws)]),
      /resolves outside Alt Theory writable roots/
    );

    // The same verdict says inside for a plain path, naming the root.
    writeFileSync(join(ws, "plain.md"), "x", "utf-8");
    const plain = verdict(join(ws, "plain.md"), "read", { readable: [root(ws)] });
    assert.equal(plain.outcome, "inside");
    assert.equal(plain.outcome === "inside" && plain.root.reason, "cwd");
    assert.equal(
      verdict(join(ws, "plain.md"), "write", { writable: [root(ws)] }).outcome,
      "inside"
    );
  } finally {
    rmSync(base, { recursive: true, force: true });
  }
});

test("case B: a symlink in a working folder refuses listing and preview alike", () => {
  const base = mkdtempSync(join(tmpdir(), "alt-theory-verdict-b-"));
  try {
    const primary = join(base, "primary");
    const etc = join(base, "etc");
    mkdirSync(primary);
    mkdirSync(etc);
    writeFileSync(join(etc, "passwd"), "root:x:0:0", "utf-8");
    linkDir(etc, join(primary, "link"));

    assert.equal(
      verdict(join(primary, "link"), "browse", { readable: [root(primary)] }).outcome,
      "outside"
    );
    assert.equal(
      verdict(join(primary, "link", "passwd"), "read", { readable: [root(primary)] }).outcome,
      "outside"
    );
  } finally {
    rmSync(base, { recursive: true, force: true });
  }
});

test("a write into a not-yet-existing granted folder applies through its existing ancestor", () => {
  const base = mkdtempSync(join(tmpdir(), "alt-theory-verdict-grant-"));
  try {
    const granted = join(base, "granted", "new-dir");
    mkdirSync(join(base, "granted"));

    // The approved folder does not exist yet; the write inside it is allowed
    // because the nearest existing ancestor of both sides resolves together.
    assert.doesNotThrow(() =>
      assertWritablePath(join(granted, "file.md"), [root(granted, "approved")])
    );

    // Lexical containment still bounds the grant itself.
    assert.throws(
      () =>
        assertWritablePath(join(base, "other", "file.md"), [root(granted, "approved")]),
      /is outside Alt Theory writable roots/
    );
  } finally {
    rmSync(base, { recursive: true, force: true });
  }
});

test("credential paths are sensitive for every intent, even inside a root", () => {
  const sshKey = join(homedir(), ".ssh", "id_rsa");
  assert.equal(
    verdict(sshKey, "read", { readable: [root(homedir())] }).outcome,
    "sensitive"
  );
  assert.equal(
    verdict(sshKey, "write", { writable: [root(homedir())] }).outcome,
    "sensitive"
  );
  assert.equal(
    verdict(sshKey, "browse", { readable: [root(homedir())] }).outcome,
    "sensitive"
  );
  assert.throws(
    () => assertWritablePath(sshKey, [root(homedir())]),
    /Access to credential path denied/
  );
});

test("a symlinked root itself is followed, not rejected", () => {
  const base = mkdtempSync(join(tmpdir(), "alt-theory-verdict-rootlink-"));
  try {
    const realWorkspace = join(base, "real-ws");
    const linkedRoot = join(base, "linked-ws");
    mkdirSync(realWorkspace);
    linkDir(realWorkspace, linkedRoot);

    const check = verdict(join(linkedRoot, "file.md"), "write", {
      writable: [root(linkedRoot)],
    });
    assert.equal(check.outcome, "inside");
    assert.doesNotThrow(() =>
      assertWritablePath(join(linkedRoot, "file.md"), [root(linkedRoot)])
    );
  } finally {
    rmSync(base, { recursive: true, force: true });
  }
});

test("isPathInside is containment with Windows case-insensitivity", () => {
  assert.ok(isPathInside("/a/b", "/a/b/c.txt"));
  assert.ok(isPathInside("/a/b", "/a/b"));
  assert.ok(!isPathInside("/a/b", "/a/bc/d.txt"));
  assert.ok(!isPathInside("/a/b", "/a/../b/c.txt")); // resolved forms decide
  assert.equal(isPathInside("C:\\A\\B", "c:\\a\\b\\c.txt"), process.platform === "win32");
});

test("Working folders page: a listed folder reads everywhere, the Edit tick writes only while work-capable, project second folders join like additional dirs", () => {
  const base = mkdtempSync(join(tmpdir(), "alt-theory-roots-global-"));
  try {
    const input = {
      writeDir: join(base, "workspace"),
      assetDir: join(base, "assets"),
      cwd: join(base, "project"),
      additionalDirs: [],
      approvedDirs: [],
      kbDir: join(base, "kb"),
      trustedReadRoots: [],
      skillsDir: null,
      workCapable: true,
      globalFolders: [
        { path: join(base, "vault"), writable: false },
        { path: join(base, "papers"), writable: true },
      ],
      projectSecondaryDirs: [join(base, "shared")],
    };
    const work = sessionRoots(input);
    assert.deepEqual(
      work.writable.map((r) => [r.path, r.reason]),
      [
        [input.writeDir, "session-write"],
        [input.assetDir, "asset"],
        [input.cwd, "cwd"],
        [join(base, "shared"), "project-secondary"],
        [join(base, "papers"), "global-list"],
      ],
    );
    assert.deepEqual(
      [...new Set(work.readable.filter((r) => r.reason === "global-list").map((r) => r.path))],
      [join(base, "papers"), join(base, "vault")],
    );
    const understand = sessionRoots({ ...input, workCapable: false });
    assert.deepEqual(understand.writable.map((r) => r.reason), ["session-write", "asset"]);
    assert.deepEqual(
      understand.readable.map((r) => r.reason),
      ["session-write", "asset", "cwd", "project-secondary", "global-list", "global-list", "kb"],
    );
  } finally {
    rmSync(base, { recursive: true, force: true });
  }
});

test("sessionRoots lists every root with its reason", () => {
  const base = mkdtempSync(join(tmpdir(), "alt-theory-roots-"));
  try {
    const input = {
      writeDir: join(base, "workspace"),
      assetDir: join(base, "assets"),
      cwd: join(base, "project"),
      additionalDirs: [join(base, "extra")],
      approvedDirs: [join(base, "approved")],
      kbDir: join(base, "kb"),
      trustedReadRoots: [join(base, "trusted")],
      skillsDir: join(base, "skills"),
      workCapable: true,
    };
    const { readable, writable } = sessionRoots(input);
    assert.deepEqual(
      writable.map((r) => [r.path, r.reason]),
      [
        [input.writeDir, "session-write"],
        [input.assetDir, "asset"],
        [input.cwd, "cwd"],
        [input.additionalDirs[0], "additional"],
        [input.approvedDirs[0], "approved"],
      ]
    );
    assert.deepEqual(
      readable.slice(writable.length).map((r) => [r.path, r.reason]),
      [
        [input.cwd, "cwd"],
        [input.kbDir, "kb"],
        [input.trustedReadRoots[0], "trusted"],
        [input.skillsDir, "skills"],
      ]
    );

    // Not work-capable: the workspace and additional folders drop out of the
    // writable set but the primary cwd stays readable.
    const bounded = sessionRoots({ ...input, workCapable: false });
    assert.deepEqual(
      bounded.writable.map((r) => r.reason),
      ["session-write", "asset", "approved"]
    );
    assert.ok(
      bounded.readable.some((r) => r.path === input.cwd && r.reason === "cwd")
    );
    // Reserved 1.5.x reasons are not produced.
    const allReasons = [...bounded.readable, ...bounded.writable].map((r) => r.reason);
    assert.ok(!allReasons.includes("global-list" as never));
    assert.ok(!allReasons.includes("project-secondary" as never));
  } finally {
    rmSync(base, { recursive: true, force: true });
  }
});

test("samePath folds case on win32 and not elsewhere", () => {
  if (process.platform === "win32") {
    const drive = process.cwd().slice(0, 2);
    assert.ok(samePath(drive + "\\Users\\a\\Note.MD", drive.toLowerCase() + "\\users\\A\\note.md"));
    assert.ok(!samePath(drive + "\\a\\f.txt", drive + "\\a\\g.txt"));
  } else {
    assert.ok(!samePath("/tmp/a/note.md", "/TMP/A/note.md"));
    assert.ok(samePath("/tmp/a/../a/note.md", "/tmp/a/note.md"));
  }
});

test("canonicalPathKey collapses a symlinked spelling onto the real one", () => {
  const base = mkdtempSync(join(tmpdir(), "alt-theory-verdict-key-"));
  try {
    mkdirSync(join(base, "real"));
    writeFileSync(join(base, "real", "f.txt"), "x");
    linkDir(join(base, "real"), join(base, "alias"));
    assert.equal(
      canonicalPathKey(join(base, "alias", "f.txt")),
      canonicalPathKey(join(base, "real", "f.txt")),
    );
    // A not-yet-existing tail is kept lexically but stays identity-stable.
    assert.equal(
      canonicalPathKey(join(base, "alias", "new.txt")),
      canonicalPathKey(join(base, "real", "new.txt")),
    );
  } finally {
    rmSync(base, { recursive: true, force: true });
  }
});
