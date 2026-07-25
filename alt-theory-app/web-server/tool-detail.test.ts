import assert from "node:assert/strict";
import { test } from "node:test";
import { extractToolDetail, extractToolPath, skillNameFromPath } from "./tool-detail.js";

test("bash carries the command itself", () => {
  const detail = extractToolDetail("bash", { command: "Rscript locked.R" });
  assert.deepEqual(detail, { kind: "command", body: "Rscript locked.R" });
});

test("a new markdown document is prose, a new script is a diff", () => {
  assert.equal(
    extractToolDetail("write", { path: "plan/plan-record.md", content: "# Plan\nstep" })
      ?.kind,
    "prose"
  );
  const script = extractToolDetail("write", { path: "analysis/locked.R", content: "x <- 1" });
  assert.equal(script?.kind, "diff");
  assert.equal(script?.body, "+x <- 1");
});

test("prose edits come back as before/after passages, code edits as a diff", () => {
  const prose = extractToolDetail("edit", {
    path: "notes/plan.md",
    edits: [{ oldText: "we will pilot", newText: "we will pre-register" }],
  });
  assert.equal(prose?.kind, "prose");
  assert.deepEqual(prose?.passages, [
    { before: "we will pilot", after: "we will pre-register" },
  ]);

  const code = extractToolDetail("edit", {
    path: "analysis/locked.R",
    edits: [{ oldText: "a", newText: "b" }],
  });
  assert.equal(code?.kind, "diff");
  assert.ok(code?.body.length);
});

test("reading a SKILL.md under a skills dir is a skill load, not a file read", () => {
  assert.equal(skillNameFromPath("/opt/assets/skills/adaptive-aligning/SKILL.md"), "adaptive-aligning");
  assert.equal(skillNameFromPath("/home/me/notes/SKILL.md"), null);
  assert.equal(skillNameFromPath("/opt/assets/skills/x/README.md"), null);
  assert.deepEqual(
    extractToolDetail("read", { path: "~/.agents/skills/web-search/SKILL.md" }),
    { kind: "skill", body: "", skillName: "web-search" }
  );
});

test("a plain read has no payload, and path aliases still resolve", () => {
  assert.equal(extractToolDetail("read", { path: "data/raw.csv" }), null);
  assert.equal(extractToolPath({ file_path: "a/b.txt" }), "a/b.txt");
  assert.equal(extractToolPath("not an object"), null);
});
