import assert from "node:assert/strict";
import { homedir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { lightPowerShellParse, type PowerShellParse } from "./powershell-evidence.js";
import { toolPath } from "./security-extension.js";
import { shellEvidence } from "./shell-evidence.js";

const cwd = join(homedir(), "alt-evidence-project");
const read = (command: string, parsePowerShell?: (code: string) => Promise<PowerShellParse | null>) =>
  shellEvidence(command, cwd, { resolvePath: toolPath, parsePowerShell });
const programs = async (command: string) => (await read(command)).invocations.map((invocation) => invocation.program);

test("quoted text, comments and quoted heredocs are data, not commands", async () => {
  assert.deepEqual(await programs("printf '%s' 'git push; rm -rf /; > /etc/hosts'"), ["printf"]);
  assert.deepEqual(await programs("echo \"git push && rm -rf ~\" # rm -rf /"), ["echo"]);
  assert.deepEqual(await programs("cat <<'EOF'\ngit push\nrm -rf /\nEOF"), ["cat"]);
  assert.deepEqual((await read("printf '%s' 'x > /etc/hosts'")).redirects, []);
});

test("newlines, chains, pipes and substitutions each run their commands", async () => {
  assert.deepEqual(await programs("printf x\nrm -rf ."), ["printf", "rm"]);
  assert.deepEqual(await programs("curl -s https://x.test | python -c 'print(1)' && Rscript a.R"), ["curl", "python", "rscript"]);
  const substituted = await read("echo \"$(git push)\" `ls` <(cat a)");
  assert.deepEqual(substituted.invocations.map((invocation) => invocation.program).sort(), ["cat", "echo", "git", "ls"]);
  assert.equal(substituted.substitution, true);
  assert.deepEqual(await programs("cat <<EOF > out.txt\n$(git push)\nEOF"), ["git", "cat"]);
  assert.equal((await read("sleep 5 &")).background, true);
});

test("cd moves what follows it, within its scope", async () => {
  const cwds = async (command: string) =>
    Object.fromEntries((await read(command)).invocations.map((invocation) => [invocation.program, invocation.cwds]));
  assert.deepEqual((await cwds("cd sub && rm -rf build")).rm, [join(cwd, "sub")]);
  assert.deepEqual((await cwds("cd sub\nrm -rf build")).rm, [join(cwd, "sub")]);
  // A subshell and a pipeline part keep their cd to themselves.
  assert.deepEqual((await cwds("(cd sub && ls); rm x")).rm, [cwd]);
  assert.deepEqual((await cwds("cd sub | ls; rm x")).rm, [cwd]);
  // A cd that may or may not happen leaves both folders possible.
  assert.deepEqual((await cwds("if [ -d sub ]; then cd sub; fi; rm x")).rm, [cwd, join(cwd, "sub")]);
  assert.deepEqual((await cwds("false || cd sub; rm x")).rm, [cwd, join(cwd, "sub")]);
  // An unreadable target leaves the folder unknown.
  assert.deepEqual((await cwds("cd \"$TARGET\" && rm x")).rm, ["\u0000unknown"]);
  assert.deepEqual((await cwds("cd && rm x")).rm, [homedir()]);
});

test("wrappers and nested shells are read through", async () => {
  const [sudo] = (await read("env A=1 nice -n 5 sudo -u bob rm -rf x")).invocations;
  assert.equal(sudo.program, "rm");
  assert.deepEqual(sudo.privileged, ["sudo"]);
  assert.deepEqual(await programs("timeout 10 git push"), ["git"]);
  assert.deepEqual(await programs("bash -lc 'cd /tmp && git push origin main'"), ["bash", "cd", "git"]);
  assert.deepEqual(await programs("eval 'git push'"), ["eval", "git"]);
  // Inline code for another language is not read as bash.
  assert.deepEqual(await programs("python -c 'import os; os.system(\"rm -rf /\")'"), ["python"]);
});

test("static words: quotes joined, HOME and USER known, the rest unknown", async () => {
  const [echo] = (await read("echo \"$HOME/a b\" '$HOME' x\\ y $OTHER \"${HOME}\"")).invocations;
  assert.deepEqual(echo.args, [`${homedir()}/a b`, "$HOME", "x y", null, homedir()]);
});

test("PowerShell inside a command: the light reader", async () => {
  const facts = await read(
    "powershell -NoProfile -Command \"Remove-Item -LiteralPath '.\\results' -Recurse -Force; Set-Location sub; 'x' | Set-Content -Path report.txt; git push origin main\"",
  );
  const inner = facts.invocations.filter((invocation) => invocation.shell === "powershell");
  assert.deepEqual(inner.map((invocation) => [invocation.program, invocation.args]), [
    ["rm", ["-r", ".\\results"]],
    ["touch", ["report.txt"]],
    ["git", ["push", "origin", "main"]],
  ]);
  assert.deepEqual(inner[1].cwds, [join(cwd, "sub")]);

  const parse = (code: string) => lightPowerShellParse(code).commands.map((command) => [command.name, command.elements]);
  assert.deepEqual(parse("Write-Output 'git push; Remove-Item C:\\Windows'"), [
    ["Write-Output", [{ kind: "value", text: "git push; Remove-Item C:\\Windows" }]],
  ]);
  assert.deepEqual(parse("$p = '.\\results'; Remove-Item $p -Recurse"), [
    [null, [{ kind: "value", text: ".\\results" }]],
    ["Remove-Item", [{ kind: "value", text: null }, { kind: "parameter", name: "recurse", text: "-Recurse" }]],
  ]);
  assert.deepEqual(parse("ri a,b"), [
    ["ri", [{ kind: "value", text: "a" }, { kind: "value", text: "b", continues: true }]],
  ]);
  assert.deepEqual(lightPowerShellParse("'x' > out.txt").commands, [
    { name: null, elements: [], redirects: [{ target: "out.txt", append: false }] },
  ]);
  assert.deepEqual(parse("Get-ChildItem | ForEach-Object { Remove-Item $_ }").map(([name]) => name), [
    "Get-ChildItem",
    "ForEach-Object",
    "Remove-Item",
  ]);
  assert.deepEqual(parse("Write-Output $(git push origin main)").map(([name]) => name), ["Write-Output", "git"]);
  assert.equal(lightPowerShellParse("Set-Content \"$HOME\\notes.txt\" x").commands[0].elements[0].kind, "value");
  assert.deepEqual(
    (lightPowerShellParse("Set-Content \"$HOME\\notes.txt\" x").commands[0].elements[0] as { text: string }).text,
    "~\\notes.txt",
  );
  assert.equal(lightPowerShellParse("Write-Output 'unterminated").ok, false);
});

test("PowerShell: a native parser's reading is used; a failing one falls back", async () => {
  const native = async (): Promise<PowerShellParse> => ({
    ok: true,
    commands: [{ name: "Remove-Item", elements: [{ kind: "parameter", name: "path", text: "-Path" }, { kind: "value", text: "native" }], redirects: [] }],
  });
  const fromNative = await read("pwsh -c 'Remove-Item -Path light'", native);
  assert.deepEqual(fromNative.invocations.at(-1)?.args, ["-r", "native"]);
  const failing = async () => {
    throw new Error("parser unavailable");
  };
  const fromLight = await read("pwsh -c 'Remove-Item -Path light'", failing);
  assert.deepEqual(fromLight.invocations.at(-1)?.args, ["-r", "light"]);
  // -EncodedCommand is base64 UTF-16LE code.
  const encoded = Buffer.from("Remove-Item -Path enc", "utf16le").toString("base64");
  assert.deepEqual((await read(`powershell -EncodedCommand ${encoded}`)).invocations.at(-1)?.args, ["-r", "enc"]);
});

test("cmd /c: a light reading of its commands", async () => {
  const facts = await read("cmd /c \"del /s /q build & rd /s /q dist & robocopy empty out /MIR\"");
  assert.deepEqual(
    facts.invocations.filter((invocation) => invocation.shell === "cmd").map((invocation) => [invocation.program, invocation.args]),
    [
      ["rm", ["-r", "build"]],
      ["rm", ["-r", "dist"]],
      ["cp", ["empty", "out"]],
      ["rm", ["-r", "out"]],
    ],
  );
});

test("a parse that runs out of budget is reported, not guessed", async () => {
  const facts = await read("echo x;".repeat(60_000));
  assert.equal(facts.status, "aborted");
});
