import assert from "node:assert/strict";
import { readFileSync, rmSync, statSync, utimesSync, writeFileSync } from "fs";
import { mkdtempSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import test from "node:test";
import { createSessionDirs } from "../core/data-dir.js";
import {
  readV4SessionHeader,
  writeFoundationRecords,
  writeSessionHeader,
} from "./session-records.js";
import {
  readSessionTextFile,
  writeSessionTextFile,
} from "./session-store.js";
import {
  readWorkingFolderTextFile,
  writeWorkingFolderTextFile,
} from "./workspace-files.js";
import {
  applyTextFlags,
  checkStale,
  conflictCopyPath,
  FileConflictError,
  MAX_TEXT_EDIT_BYTES,
  readTextFlags,
} from "./text-file-policy.js";

const BOM_CHAR = String.fromCharCode(0xfeff);

function createSession(dataDir: string, sessionId: string) {
  const dirs = createSessionDirs(dataDir, sessionId);
  const manifest = {
    schemaVersion: 1,
    sessionId,
    createdAt: new Date().toISOString(),
    openedFrom: "new",
    recordsDir: dirs.recordsDir,
    sessionCwd: dirs.sessionCwd,
    piSessionDir: dirs.piSessionDir,
    piSessionFile: join(dirs.piSessionDir, "session.jsonl"),
    appContext: { path: null, exists: false },
    soul: { path: null, slug: null, exists: false },
    rolePreset: { path: null, slug: "default", exists: false },
    kb: { dir: "", domain: "ep-core" },
    kbDir: "",
    kbDomain: "ep-core",
    altMode: "understand",
    resourceDiscovery: { mode: "clean" },
    readonly: true,
    writableRoots: [],
    runtimeTools: [],
  } as any;
  writeFoundationRecords({
    sessionRoot: dirs.sessionRoot,
    recordsDir: dirs.recordsDir,
    manifest,
  });
  writeFileSync(manifest.piSessionFile, "{}\n", "utf-8");
  return dirs;
}

function setPrimaryDir(recordsDir: string, primaryDir: string) {
  const header = readV4SessionHeader(recordsDir)!;
  writeSessionHeader(recordsDir, { ...header, workspace: { primaryDir } });
}

function mtimeIso(path: string): string {
  return statSync(path).mtime.toISOString();
}

/** Move a file's mtime until it differs from `from` (filesystem timestamp
 *  granularity varies; the staleness check compares mtimes). */
function bumpMtime(path: string, from: string) {
  const base = new Date(from).getTime();
  for (let i = 1; i <= 1000; i++) {
    const next = new Date(base + i * 10);
    utimesSync(path, next, next);
    if (mtimeIso(path) !== from) return;
  }
  throw new Error("mtime refused to move");
}

test("text flags round-trip: CRLF and BOM from disk are restored on save", () => {
  const dir = mkdtempSync(join(tmpdir(), "alt-theory-text-policy-"));
  const crlfBom = join(dir, "crlf-bom.md");
  writeFileSync(
    crlfBom,
    Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from("a\r\nb\r\n", "utf-8")])
  );
  const flags = readTextFlags(crlfBom);
  assert.equal(flags.crlf, true);
  assert.equal(flags.bom, true);
  // The textarea hands back LF-only text with the BOM char gone.
  const restored = applyTextFlags("a\nb\n", flags);
  assert.equal(restored, BOM_CHAR + "a\r\nb\r\n");

  const lfPlain = join(dir, "lf-plain.md");
  writeFileSync(lfPlain, "a\nb\n");
  const plain = readTextFlags(lfPlain);
  assert.equal(plain.crlf, false);
  assert.equal(plain.bom, false);
  assert.equal(applyTextFlags("a\nb\n", plain), "a\nb\n");

  rmSync(dir, { recursive: true, force: true });
});

test("conflict copy naming walks (conflict), (conflict 2), …", () => {
  const dir = mkdtempSync(join(tmpdir(), "alt-theory-conflict-name-"));
  const target = join(dir, "notes.md");
  writeFileSync(target, "x");
  assert.equal(conflictCopyPath(target), join(dir, "notes (conflict).md"));
  writeFileSync(join(dir, "notes (conflict).md"), "x");
  assert.equal(conflictCopyPath(target), join(dir, "notes (conflict 2).md"));
  rmSync(dir, { recursive: true, force: true });
});

test("checkStale passes fresh, refuses touched and vanished files", () => {
  const dir = mkdtempSync(join(tmpdir(), "alt-theory-stale-"));
  const target = join(dir, "a.txt");
  writeFileSync(target, "x");
  const at = mtimeIso(target);
  checkStale(target, at); // fresh passes
  bumpMtime(target, at);
  assert.throws(() => checkStale(target, at), FileConflictError);
  rmSync(target, { force: true });
  assert.throws(() => checkStale(target, at), FileConflictError); // vanished
  rmSync(dir, { recursive: true, force: true });
});

test("session write: staleness refusal, force, conflict copy, edit cap", () => {
  const dataDir = mkdtempSync(join(tmpdir(), "alt-theory-session-write-"));
  const dirs = createSession(dataDir, "s1");

  const first = writeSessionTextFile(dataDir, "s1", "records", "notes.md", "one");
  assert.equal(first.content, "one");

  // Stale expectation refuses…
  const loadedAt = mtimeIso(join(dirs.recordsDir, "notes.md"));
  bumpMtime(join(dirs.recordsDir, "notes.md"), loadedAt);
  assert.throws(
    () =>
      writeSessionTextFile(dataDir, "s1", "records", "notes.md", "two", {
        expectedUpdatedAt: loadedAt,
      }),
    FileConflictError
  );
  // …force overwrites anyway…
  const forced = writeSessionTextFile(dataDir, "s1", "records", "notes.md", "two", {
    force: true,
  });
  assert.equal(forced.content, "two");
  // …and a conflict copy leaves the original untouched.
  const copy = writeSessionTextFile(dataDir, "s1", "records", "notes.md", "mine", {
    conflictCopy: true,
  });
  assert.equal(copy.path, "notes (conflict).md");
  assert.equal(readSessionTextFile(dataDir, "s1", "records", "notes.md").content, "two");
  assert.equal(readSessionTextFile(dataDir, "s1", "records", "notes (conflict).md").content, "mine");

  // The edit cap is uniform (1 MiB) for every root.
  const big = "x".repeat(MAX_TEXT_EDIT_BYTES + 1);
  assert.throws(
    () => writeSessionTextFile(dataDir, "s1", "records", "big.md", big),
    /too large to write/
  );

  rmSync(dataDir, { recursive: true, force: true });
});

test("session write restores CRLF on an existing CRLF file", () => {
  const dataDir = mkdtempSync(join(tmpdir(), "alt-theory-crlf-restore-"));
  const dirs = createSession(dataDir, "s1");
  const target = join(dirs.recordsDir, "crlf.md");
  writeFileSync(target, "a\r\nb\r\n");
  writeSessionTextFile(dataDir, "s1", "records", "crlf.md", "a\nb\nc\n");
  assert.equal(readFileSync(target, "utf-8"), "a\r\nb\r\nc\r\n");
  rmSync(dataDir, { recursive: true, force: true });
});

test("working write: round trip, escape refused, staleness, copy naming", () => {
  const dataDir = mkdtempSync(join(tmpdir(), "alt-theory-working-write-"));
  const dirs = createSession(dataDir, "w1");
  const folder = mkdtempSync(join(tmpdir(), "alt-theory-user-folder-"));
  setPrimaryDir(dirs.recordsDir, folder);
  writeFileSync(join(folder, "plan.md"), "v1");

  // Round trip through the folderId address form primary/<rel>.
  const saved = writeWorkingFolderTextFile(dataDir, "w1", "primary/plan.md", "v2");
  assert.equal(saved.content, "v2");
  assert.equal(readFileSync(join(folder, "plan.md"), "utf-8"), "v2");

  // Escape and unknown folder refuse.
  assert.throws(
    () => writeWorkingFolderTextFile(dataDir, "w1", "primary/../escape.md", "x"),
    /stay inside/
  );
  assert.throws(
    () => writeWorkingFolderTextFile(dataDir, "w1", "nope/plan.md", "x"),
    /Invalid folder path/
  );

  // Staleness mirrors the session route.
  const fresh = readWorkingFolderTextFile(dataDir, "w1", "primary/plan.md");
  bumpMtime(join(folder, "plan.md"), fresh.updatedAt);
  assert.throws(
    () =>
      writeWorkingFolderTextFile(dataDir, "w1", "primary/plan.md", "v3", {
        expectedUpdatedAt: fresh.updatedAt,
      }),
    FileConflictError
  );

  // Conflict copy lands as a sibling with the ruled name.
  const copy = writeWorkingFolderTextFile(dataDir, "w1", "primary/plan.md", "mine", {
    conflictCopy: true,
  });
  assert.equal(copy.path, "primary/plan (conflict).md");
  assert.equal(readFileSync(join(folder, "plan (conflict).md"), "utf-8"), "mine");
  assert.equal(readFileSync(join(folder, "plan.md"), "utf-8"), "v2");

  rmSync(dataDir, { recursive: true, force: true });
  rmSync(folder, { recursive: true, force: true });
});
