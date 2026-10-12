import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  allowlisted,
  credentialRefs,
  credentialToken,
  criticalDeletionTarget,
  destructiveGit,
  gitPushes,
  installs,
  isDatabaseFile,
  isGitInternal,
  networkHosts,
  readTargets,
  strictFastPass,
  systemFolderOf,
  uploads,
  writeTargets,
} from "./approval-boundary.js";
import { isPathInside } from "./path-verdict.js";
import { toolPath } from "./security-extension.js";
import { shellEvidence } from "./shell-evidence.js";

const project = mkdtempSync(join(tmpdir(), "alt-boundary-"));
mkdirSync(join(project, "src"));

const evidence = (command: string, cwd = project) => shellEvidence(command, cwd, { resolvePath: toolPath });
const inProject = (path: string) => isPathInside(project, path);

const passes = async (command: string, allowlist: string[] = []) =>
  strictFastPass(await evidence(command), {
    allowlist,
    isReadable: inProject,
    isWritable: inProject,
    resolvePath: toolPath,
  });

test("strict profile: the narrow read-only fast pass", async () => {
  for (const command of [
    "ls",
    "ls -la src",
    "pwd",
    "cat src/a.txt | head -20",
    "grep -rn foo . 2>/dev/null",
    "git status && git log --oneline -5",
    "git -C src status",
    "git branch --show-current",
    "find . -name '*.ts'",
    "wc -l src/*.ts",
    "mkdir -p out/figures",
    "python --version",
  ]) {
    assert.equal(await passes(command), true, command);
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
    "bash -c 'ls'",
  ]) {
    assert.equal(await passes(command), false, command);
  }
});

test("strict profile: the user's allowlist, per command", async () => {
  assert.equal(await passes("npm test", ["npm test"]), true);
  assert.equal(await passes("npm test -- --watch", ["npm test"]), true);
  assert.equal(await passes("npm testify", ["npm test"]), false);
  assert.equal(await passes("python scripts/plot.py", ["python scripts/*"]), true);
  assert.equal(await passes("ls && npm test", ["npm test"]), true);
  assert.equal(await passes("npm test > log.txt", ["npm test"]), false);
  assert.equal(allowlisted("python  scripts/plot.py", ["python scripts/"]), true);
});

test("guardrail ①: deleting or moving a critical folder", async () => {
  const critical = async (command: string, roots = [project]) =>
    criticalDeletionTarget(await evidence(command), roots, toolPath);
  for (const command of [
    "rm -rf ~",
    "rm -rf $HOME",
    "rm -rf \"$HOME\"",
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
    "cd ~\nrm -rf Documents",
    "bash -c 'cd ~; rm -rf Desktop'",
    "rm -rf /*",
    "find ~ -maxdepth 1 -delete",
    "nice -n 10 rm -rf ~",
    "env A=1 timeout 5 rm -rf ~/Documents",
    "rm -rf /Users/$USER/Documents".replace("/Users", homedir().replace(/[\\/][^\\/]+$/, "")),
    "if true; then cd ~; fi; rm -rf Documents",
    "powershell -Command \"Remove-Item -Recurse -Force '~/Documents'\"",
  ]) {
    assert.ok(await critical(command), command);
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
    "printf '%s' 'rm -rf ~'",
    "cat <<'EOF'\nrm -rf ~\nEOF",
    "echo 'cd ~ && rm -rf Documents' > notes.md",
  ]) {
    assert.equal(await critical(command), null, command);
  }
  // A temp root counts as a root: its own content is fine, wiping it is not.
  const temp = mkdtempSync(join(tmpdir(), "alt-boundary-temp-"));
  assert.ok(await critical(`rm -rf ${temp}/*`, [project, temp]));
  assert.equal(await critical(`rm -rf ${temp}/conversion`, [project, temp]), null);
});

test("guardrail ④ and the data folder: visible write targets", async () => {
  const targets = async (command: string) => writeTargets(await evidence(command), toolPath);
  assert.deepEqual(await targets("ls 2>/dev/null"), []);
  assert.deepEqual(await targets("echo x 2>&1"), []);
  assert.deepEqual(await targets("cd ../outside && echo x > report.txt"), [join(project, "..", "outside", "report.txt")]);
  assert.deepEqual(await targets("(cd src && touch a); touch b"), [join(project, "src", "a"), join(project, "b")]);
  assert.deepEqual(await targets("curl -o ~/Downloads/paper.pdf https://example.com/p.pdf"), [join(homedir(), "Downloads", "paper.pdf")]);
  assert.deepEqual(await targets("printf '%s' '> /etc/hosts'"), []);
  if (process.platform !== "win32") {
    assert.deepEqual(await targets("echo x > /etc/hosts"), ["/etc/hosts"]);
    assert.deepEqual(await targets("cp a.txt /usr/local/bin/tool"), ["/usr/local/bin/tool"]);
    assert.deepEqual(await targets("cp /usr/share/dict/words ."), [project]);
    assert.deepEqual(await targets("sed -i 's/a/b/' /etc/profile"), ["/etc/profile"]);
    assert.deepEqual(await targets("cd /usr/local && rm -rf lib"), ["/usr/local/lib"]);
    assert.deepEqual(await targets("cat <<EOF > /etc/motd\nhi\nEOF"), ["/etc/motd"]);
    assert.equal((await targets("rm -rf /System/Library/x")).map(systemFolderOf).find(Boolean), "/System");
    assert.equal(systemFolderOf("/Applications/Foo.app"), "/Applications");
    assert.equal(systemFolderOf(join(homedir(), "Library", "x")), null);
    assert.equal(systemFolderOf("/usr/local/bin/x"), "/usr");
  } else {
    const windows = "C:\\Windows\\alt-theory-test-never-create.txt";
    const programFiles = "C:\\Program Files\\Alt Theory Test\\never-create.txt";
    assert.deepEqual(await targets(`echo x > ${windows}`), [windows]);
    assert.deepEqual(await targets(`echo x > "${programFiles}"`), [programFiles]);
    assert.deepEqual(await targets(`powershell -NoProfile -Command "Set-Content -Path ${windows} -Value x"`), [windows]);
    assert.ok((await targets(`cmd /c "del ${windows}"`)).includes(windows));
    assert.equal((await targets(`echo x > "${programFiles}"`)).map(systemFolderOf).find(Boolean), process.env.ProgramFiles ?? "C:\\Program Files");
  }
});

test("reads: read-only programs' path arguments and input redirections", async () => {
  const reads = async (command: string) => readTargets(await evidence(command), toolPath);
  assert.deepEqual(await reads("cat ~/Downloads/a.txt"), [join(homedir(), "Downloads", "a.txt")]);
  assert.deepEqual(await reads("wc -l < ../data.csv"), [join(project, "..", "data.csv")]);
  // Other programs' arguments are not guessed as reads.
  assert.deepEqual(await reads("markitdown ~/Downloads/paper.pdf"), []);
  assert.deepEqual(await reads("grep -rn pattern"), []);
});

test("Windows: a OneDrive-named folder under HOME is a critical deletion target", { skip: process.platform !== "win32" }, async () => {
  const fakeHome = mkdtempSync(join(tmpdir(), "alt-boundary-home-"));
  const cloud = join(fakeHome, "OneDrive - Example University");
  mkdirSync(cloud);
  const original = process.env.USERPROFILE;
  try {
    process.env.USERPROFILE = fakeHome;
    const critical = async (command: string) => criticalDeletionTarget(await evidence(command), [project], toolPath);
    assert.equal(await critical(`rm -rf "${cloud}"`), cloud);
    assert.equal(await critical(`powershell -Command "Remove-Item -LiteralPath '${cloud}' -Recurse -Force"`), cloud);
    assert.equal(await critical('cmd /c "rmdir /s /q %USERPROFILE%\\Desktop"'), join(fakeHome, "Desktop"));
  } finally {
    if (original === undefined) delete process.env.USERPROFILE;
    else process.env.USERPROFILE = original;
  }
});

test("Windows: a configured OneDrive root outside HOME is a critical deletion target", { skip: process.platform !== "win32" }, async () => {
  const cloud = mkdtempSync(join(tmpdir(), "alt-boundary-relocated-cloud-"));
  const original = process.env.OneDriveCommercial;
  try {
    process.env.OneDriveCommercial = cloud;
    assert.equal(criticalDeletionTarget(await evidence(`rmdir "${cloud}"`), [project], toolPath), cloud);
    assert.equal(criticalDeletionTarget(await evidence(`rm -rf "${join(cloud, "draft")}"`), [project], toolPath), null);
  } finally {
    if (original === undefined) delete process.env.OneDriveCommercial;
    else process.env.OneDriveCommercial = original;
  }
});

test("guardrail ②: work-discarding git and .git internals", async () => {
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
    "git status\ngit reset --hard",
    "git switch -f main",
    "git switch --discard-changes main",
    "git checkout HEAD~1 src/app.ts",
    "git branch -f main HEAD~3",
    "git worktree remove --force ../wt",
    "bash -c 'git reset --hard'",
    "echo \"$(git reset --hard)\"",
  ]) {
    assert.ok(destructiveGit(await evidence(command)), command);
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
    "echo 'git reset --hard' >> notes.md",
  ]) {
    assert.equal(destructiveGit(await evidence(command)), null, command);
  }
  assert.equal(isGitInternal(join(project, ".git", "HEAD")), true);
  assert.equal(isGitInternal(join(project, ".gitignore")), false);
});

test("guardrail ③: database files", () => {
  assert.equal(isDatabaseFile("data/survey.sqlite"), true);
  assert.equal(isDatabaseFile("x.DB"), true);
  assert.equal(isDatabaseFile("x.duckdb"), true);
  assert.equal(isDatabaseFile("notes.md"), false);
});

test("pushes are keyed by repository and remote", async () => {
  const repo = mkdtempSync(join(tmpdir(), "alt-boundary-repo-"));
  mkdirSync(join(repo, ".git"));
  writeFileSync(join(repo, ".git", "HEAD"), "ref: refs/heads/main\n");
  writeFileSync(join(repo, ".git", "config"), '[branch "main"]\n\tremote = upstream\n\tmerge = refs/heads/main\n');
  mkdirSync(join(repo, "docs"));
  const pushes = async (command: string, cwd = repo) => gitPushes(await evidence(command, cwd), toolPath);
  assert.deepEqual((await pushes("git push origin main")).map((push) => push.key), [`push:${repo}:origin`]);
  // No remote named: the branch's own, from the repository's config.
  assert.deepEqual((await pushes("git push", join(repo, "docs"))).map((push) => push.key), [`push:${repo}:upstream`]);
  assert.deepEqual((await pushes(`git -C ${repo} push`, project)).map((push) => push.reason), ["Push to: upstream"]);
  assert.deepEqual((await pushes("git push -o ci.skip origin")).map((push) => push.key), [`push:${repo}:origin`]);
  assert.deepEqual(await pushes("git pull && git status"), []);
  assert.deepEqual(await pushes("echo 'git push'"), []);
});

test("uploads and publishing are keyed by destination", async () => {
  const keys = async (command: string) => uploads(await evidence(command)).map((upload) => upload.key);
  assert.deepEqual(await keys("curl -F file=@paper.pdf https://api.convert.test/v1"), ["upload:api.convert.test"]);
  assert.deepEqual(await keys("curl --upload-file ./paper.pdf https://upload.example.test/file"), ["upload:upload.example.test"]);
  assert.deepEqual(await keys("scp report.pdf me@server.example:~/inbox/"), ["upload:server.example"]);
  assert.deepEqual(await keys("rsync -av results/ lab:/data/"), ["upload:lab"]);
  assert.deepEqual(await keys("gh release upload v1 dist/app.zip -R me/app"), ["publish:github-release:me/app"]);
  assert.deepEqual(await keys("npm publish"), ["publish:npm"]);
  assert.deepEqual(await keys("python -m twine upload dist/*"), ["publish:pypi"]);
  assert.deepEqual(
    await keys(`powershell -Command "Invoke-RestMethod -Method Post -Uri https://api.convert.test/v1 -InFile paper.pdf"`),
    ["upload:api.convert.test"],
  );
  // Fetching, searching with a POST body, downloading: not uploads.
  for (const command of [
    "curl -s 'https://api.openalex.org/works?search=x'",
    "curl -X POST https://api.example.test/search -H 'Content-Type: application/json' --data '{\"q\":\"papers\"}'",
    "scp lab:/data/results.csv .",
    "curl -o paper.pdf https://example.com/p.pdf",
    "node browser-script.js",
  ]) {
    assert.deepEqual(await keys(command), [], command);
  }
});

test("installs into the computer are keyed by package manager; project installs run", async () => {
  const keys = async (command: string) => installs(await evidence(command), inProject, toolPath).map((install) => install.key);
  assert.deepEqual(await keys("pip install markitdown"), ["install:pip"]);
  assert.deepEqual(await keys("python3 -m pip install -U pandas"), ["install:pip"]);
  assert.deepEqual(await keys("npm install -g typescript"), ["install:npm"]);
  assert.deepEqual(await keys("brew install pandoc"), ["install:brew"]);
  assert.deepEqual(await keys("uv tool install ddgs"), ["install:uv tool"]);
  assert.deepEqual(await keys("winget install Pandoc.Pandoc"), ["install:winget"]);
  for (const command of [
    "npm install",
    "npm install lodash",
    "uv add pandas",
    "uv pip install pandas",
    ".venv/bin/pip install pandas",
    "python3 -m venv .venv && .venv/bin/python -m pip install pandas",
    "source .venv/bin/activate && pip install pandas",
    "pip list",
    "pip --version",
  ]) {
    assert.deepEqual(await keys(command), [], command);
  }
});

test("credentials and network destinations a command names", async () => {
  assert.deepEqual(credentialRefs(await evidence("cat ~/.ssh/id_rsa.pub")), [".ssh"]);
  assert.deepEqual(credentialRefs(await evidence("ls src")), []);
  const hosts = async (command: string) => networkHosts(await evidence(command));
  assert.deepEqual((await hosts("curl -s http://169.254.169.254/latest")).hosts, ["169.254.169.254"]);
  assert.ok((await hosts("ssh me@lab.example uptime")).hosts.includes("lab.example"));
  assert.deepEqual(await hosts("echo http://169.254.169.254"), { hosts: [], bare: [] });
  // No scheme, bare hosts and brackets (review M2).
  assert.ok((await hosts("curl 169.254.169.254/latest/meta-data")).bare.includes("169.254.169.254"));
  assert.ok((await hosts("nc 169.254.169.254 80")).hosts.includes("169.254.169.254"));
  assert.ok((await hosts("curl http://[::ffff:169.254.169.254]/")).hosts.includes("::ffff:169.254.169.254"));
});

test("review fixes: heredoc lines, PowerShell with $, rsync --delete and the temp variable under the brake", async () => {
  const critical = async (command: string, roots = [project]) => criticalDeletionTarget(await evidence(command), roots, toolPath);
  for (const command of [
    "cat <<EOF > a.txt && rm -rf ~/Documents\nx\nEOF",
    "cat <<EOF; cd ~; rm -rf Documents\nhi\nEOF",
    'powershell -Command "Remove-Item -Recurse -Force ~/Documents; $null"',
    "powershell -Command \"Remove-Item -Recurse -Force 'tmp', '~/Documents'\"",
    "rsync -a --delete empty/ ./",
    "rsync -a --delete empty/ ~/Documents/",
    "cd -- ~ && rm -rf Documents",
  ]) {
    assert.ok(await critical(command), command);
  }
  assert.equal(await critical("rsync -a --delete src/ build/"), null);
  assert.equal(await critical("rsync -a src/ ~/Documents/backup/"), null);
});

test("review fixes: reads skip patterns, find expressions and devices; writes skip devices", async () => {
  const reads = async (command: string) => readTargets(await evidence(command), toolPath);
  assert.deepEqual(await reads('grep -rn "/api/v1" src/'), [join(project, "src")]);
  // The pattern or expression is not a path ("." itself is not checked: it is the folder the command runs in).
  assert.deepEqual(await reads("rg '/users/:id' ."), []);
  assert.deepEqual(await reads("grep -rn -e '/etc/hosts' ."), []);
  assert.deepEqual(await reads("find . -path '/x' -prune"), []);
  assert.deepEqual(await reads("grep -rn pattern ~/notes"), [join(homedir(), "notes")]);
  assert.deepEqual(await reads("head -c 32 /dev/urandom"), []);
  assert.deepEqual(writeTargets(await evidence("echo err > /dev/stderr; tee /dev/null"), toolPath), []);
});

test("review fixes: uploads from file bodies, clustered options, rsync://, dry runs", async () => {
  const keys = async (command: string) => uploads(await evidence(command)).map((upload) => upload.key);
  assert.deepEqual(await keys("curl -X PUT --data-binary @paper.pdf https://bucket.example/up"), ["upload:bucket.example"]);
  assert.deepEqual(await keys("curl -sT notes.pdf https://up.example/"), ["upload:up.example"]);
  assert.deepEqual(await keys("curl -d @- https://api.example/search"), []);
  assert.deepEqual(await keys("rsync -a out/ rsync://mirror.example/data/"), ["upload:mirror.example"]);
  assert.deepEqual(await keys("npm publish --dry-run"), []);
  assert.deepEqual(gitPushes(await evidence("git push --dry-run origin main"), toolPath), []);
  assert.deepEqual(writeTargets(await evidence("curl -sLo /etc/x https://example.com/x"), toolPath), process.platform === "win32" ? writeTargets(await evidence("curl -sLo /etc/x https://example.com/x"), toolPath) : ["/etc/x"]);
});

test("review fixes: installs after an activation only, into the folders, or for real", async () => {
  const keys = async (command: string) => installs(await evidence(command), inProject, toolPath).map((install) => install.key);
  assert.deepEqual(await keys("pip install pandas && source .venv/bin/activate"), ["install:pip"]);
  assert.deepEqual(await keys("pip install -t ./vendor pandas"), []);
  assert.deepEqual(await keys("pip install --dry-run pandas"), []);
});

test("review fixes: an unknown folder keys a push by the remote only; credentials share one key", async () => {
  assert.deepEqual(gitPushes(await evidence('cd "$X" && git push origin main'), toolPath).map((push) => push.key), ["push:?:origin"]);
  assert.equal(credentialToken(join(homedir(), ".ssh")), ".ssh");
  // Strict fast pass: git -C into a folder that is not readable asks.
  assert.equal(await passes("git -C /etc log"), false);
});
