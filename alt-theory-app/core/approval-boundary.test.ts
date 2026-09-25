import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  commandWriteTargets,
  criticalDeletionTarget,
  destructiveGitCommand,
  isDatabaseFile,
  isGitInternal,
  mentionsDatabaseFile,
  passesWithoutReview,
  systemFolderOf,
} from "./approval-boundary.js";
import { isPathInside } from "./path-verdict.js";
import { toolPath } from "./security-extension.js";

const project = mkdtempSync(join(tmpdir(), "alt-boundary-"));
mkdirSync(join(project, "src"));

const passes = (command: string, allowlist: string[] = []) =>
  passesWithoutReview({
    command,
    cwd: project,
    allowlist,
    isReadable: (path) => isPathInside(project, path),
    isWritable: (path) => isPathInside(project, path),
    resolvePath: toolPath,
  });

test("fast pass: narrow read-only shell over readable paths", () => {
  for (const command of [
    "ls",
    "ls -la src",
    "pwd",
    "cat src/a.txt | head -20",
    "grep -rn foo . 2>/dev/null",
    "git status && git log --oneline -5",
    "git branch --show-current",
    "find . -name '*.ts'",
    "wc -l src/*.ts",
    "mkdir -p out/figures",
    "python --version",
  ]) {
    assert.equal(passes(command), true, command);
  }
  for (const command of [
    "python cleanup.py",
    "cat /etc/hosts",
    "ls ~",
    "echo x > notes.txt",
    "cat a.txt | xargs rm",
    "find . -name '*.tmp' -delete",
    "find . -exec rm {} ;",
    "rg --pre=sh foo",
    "sort -o out.txt in.txt",
    "ls $(cat list)",
    "sleep 100 &",
    "git branch new-branch",
    "git diff --output=/tmp/x",
    "git push",
    "mkdir /tmp/elsewhere",
    "wc -l < data.csv",
    "tree -o out.txt",
    "sort --compress-program=sh a.txt",
    "file -C -m magic",
  ]) {
    assert.equal(passes(command), false, command);
  }
});

test("fast pass: the user's allowlist, per segment", () => {
  assert.equal(passes("npm test", ["npm test"]), true);
  assert.equal(passes("npm test -- --watch", ["npm test"]), true);
  assert.equal(passes("npm testify", ["npm test"]), false);
  assert.equal(passes("python scripts/plot.py", ["python scripts/*"]), true);
  assert.equal(passes("ls && npm test", ["npm test"]), true);
  assert.equal(passes("npm test > log.txt", ["npm test"]), false);
});

test("guardrail ①: deleting or moving a critical folder", () => {
  const critical = (command: string) =>
    criticalDeletionTarget(command, project, [project], toolPath);
  for (const command of [
    "rm -rf ~",
    "rm -rf $HOME",
    "rm -rf ~/",
    "rm -rf ~/Documents",
    "rm -r ~/Desktop/",
    "rm -rf ~/documents",
    "rm -rf /",
    "rm -rf *",
    "rm -rf ./*",
    "rm -rf ..",
    `rm -rf ${project}`,
    `mv ${project} /tmp/old`,
    "mv ~/Downloads ~/.Trash/",
    "find ~ -delete",
    "cd src && rm -rf ~/Library",
    "sudo rm -rf /",
    "cd ~ && rm -rf Documents",
    "cd ~; rm -rf *",
    "bash -c 'cd ~; rm -rf Desktop'",
    "rm -rf /*",
    "find ~ -maxdepth 1 -delete",
  ]) {
    assert.ok(critical(command), command);
  }
  for (const command of [
    "rm -rf build",
    "rm -rf src/*.tmp",
    "rm ~/Documents/old-draft.txt",
    "find . -name '*.pyc' -delete",
    "mv notes.md archive/",
    "rm -rf node_modules dist",
    "cd src && rm -rf build",
    "find ~ -empty -delete",
  ]) {
    assert.equal(critical(command), null, command);
  }
});

test("guardrail ④ and the data folder: visible write targets", () => {
  const targets = (command: string) => commandWriteTargets(command, project, toolPath);
  assert.deepEqual(targets("ls 2>/dev/null"), []);
  if (process.platform !== "win32") {
    assert.deepEqual(targets("echo x > /etc/hosts"), ["/etc/hosts"]);
    assert.deepEqual(targets("cp a.txt /usr/local/bin/tool"), ["/usr/local/bin/tool"]);
    assert.deepEqual(targets("cp /usr/share/dict/words ."), [project]);
    assert.deepEqual(targets("sed -i 's/a/b/' /etc/profile"), ["/etc/profile"]);
    assert.deepEqual(targets("cd /usr/local && rm -rf lib"), ["/usr/local/lib"]);
    assert.equal(targets("rm -rf /System/Library/x").map(systemFolderOf).find(Boolean), "/System");
    assert.equal(systemFolderOf("/Applications/Foo.app"), "/Applications");
    assert.equal(systemFolderOf(join(homedir(), "Library", "x")), null);
    assert.equal(systemFolderOf("/usr/local/bin/x"), "/usr");
  } else {
    const windows = "C:\\Windows\\alt-theory-test-never-create.txt";
    const programFiles = "C:\\Program Files\\Alt Theory Test\\never-create.txt";
    assert.deepEqual(targets(`echo x > ${windows}`), [windows]);
    assert.deepEqual(targets(`echo x > "${programFiles}"`), [programFiles]);
    assert.deepEqual(targets(`powershell -NoProfile -Command "Set-Content -Path ${windows} -Value x"`), [windows]);
    assert.ok(targets(`cmd /c "del ${windows}"`).includes(windows));
    assert.equal(targets(`echo x > "${programFiles}"`).map(systemFolderOf).find(Boolean), process.env.ProgramFiles ?? "C:\\Program Files");
  }
});

test("Windows: a OneDrive-named folder under HOME is a critical deletion target", { skip: process.platform !== "win32" }, () => {
  const fakeHome = mkdtempSync(join(tmpdir(), "alt-boundary-home-"));
  const cloud = join(fakeHome, "OneDrive - Example University");
  mkdirSync(cloud);
  const original = process.env.USERPROFILE;
  try {
    process.env.USERPROFILE = fakeHome;
    assert.equal(criticalDeletionTarget(`rm -rf "${cloud}"`, project, [project], toolPath), cloud);
    assert.equal(criticalDeletionTarget(`powershell -Command "Remove-Item -LiteralPath '${cloud}' -Recurse -Force"`, project, [project], toolPath), cloud);
    assert.equal(criticalDeletionTarget('cmd /c "rmdir /s /q %USERPROFILE%\\Desktop"', project, [project], toolPath), join(fakeHome, "Desktop"));
  } finally {
    if (original === undefined) delete process.env.USERPROFILE;
    else process.env.USERPROFILE = original;
  }
});

test("Windows: a configured OneDrive root outside HOME is a critical deletion target", { skip: process.platform !== "win32" }, () => {
  const cloud = mkdtempSync(join(tmpdir(), "alt-boundary-relocated-cloud-"));
  const original = process.env.OneDriveCommercial;
  try {
    process.env.OneDriveCommercial = cloud;
    assert.equal(criticalDeletionTarget(`rmdir "${cloud}"`, project, [project], toolPath), cloud);
    assert.equal(criticalDeletionTarget(`rm -rf "${join(cloud, "draft")}"`, project, [project], toolPath), null);
  } finally {
    if (original === undefined) delete process.env.OneDriveCommercial;
    else process.env.OneDriveCommercial = original;
  }
});

test("guardrail ②: work-discarding git and .git internals", () => {
  for (const command of [
    "git reset --hard HEAD~1",
    "git clean -fdx",
    "git push --force origin main",
    "git push -f",
    "git push origin +main",
    "git push origin --delete old",
    "git branch -D feature",
    "git checkout -- src/app.ts",
    "git checkout .",
    "git restore src/app.ts",
    "git stash clear",
    "git -C repo reset --hard",
    "rm -rf .git",
    "git status && git reset --hard",
    "git switch -f main",
    "git switch --discard-changes main",
    "git checkout HEAD~1 src/app.ts",
    "git branch -f main HEAD~3",
    "git worktree remove --force ../wt",
    "bash -c 'git reset --hard'",
  ]) {
    assert.ok(destructiveGitCommand(command), command);
  }
  for (const command of [
    "git status",
    "git reset HEAD file",
    "git checkout main",
    "git checkout -b feature",
    "git checkout -b feature origin/main",
    "git restore --staged src/app.ts",
    "git push origin main",
    "git stash",
    "git branch -d merged",
    "rm -rf build/.gitkeep",
  ]) {
    assert.equal(destructiveGitCommand(command), null, command);
  }
  assert.equal(isGitInternal(join(project, ".git", "HEAD")), true);
  assert.equal(isGitInternal(join(project, ".gitignore")), false);
});

test("guardrail ③: database files", () => {
  assert.equal(isDatabaseFile("data/survey.sqlite"), true);
  assert.equal(isDatabaseFile("x.DB"), true);
  assert.equal(isDatabaseFile("x.duckdb"), true);
  assert.equal(isDatabaseFile("notes.md"), false);
  assert.equal(mentionsDatabaseFile("python clean.py --db data/app.db"), true);
  assert.equal(mentionsDatabaseFile("python clean.py"), false);
});
