import assert from "node:assert/strict";
import { homedir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { lightPowerShellParse, type PowerShellParse } from "./powershell-evidence.js";
import { toolPath } from "./security-extension.js";
import { shellEvidence, UNKNOWN_FOLDER } from "./shell-evidence.js";

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
  assert.deepEqual(await programs("cat <<EOF > out.txt\n$(git push)\nEOF"), ["cat", "git"]);
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
  assert.deepEqual((await cwds("cd \"$TARGET\" && rm x")).rm, [UNKNOWN_FOLDER]);
  // Options before the folder (review L3).
  assert.deepEqual((await cwds("cd -- sub && rm x")).rm, [join(cwd, "sub")]);
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
    [null, []],
    ["Remove-Item", [{ kind: "value", text: null, expandable: "$p" }, { kind: "parameter", name: "recurse", text: "-Recurse" }]],
  ]);
  assert.deepEqual(parse("ri a,b"), [
    ["ri", [{ kind: "value", text: "a" }, { kind: "value", text: "b", continues: true }]],
  ]);
  assert.deepEqual(lightPowerShellParse("'x' > out.txt").commands, [
    { name: null, elements: [], redirects: [{ target: "out.txt", append: false }], pipeline: 0 },
  ]);
  assert.deepEqual(parse("Get-ChildItem | ForEach-Object { Remove-Item $_ }").map(([name]) => name), [
    "Get-ChildItem",
    "ForEach-Object",
    "Remove-Item",
  ]);
  assert.deepEqual(parse("Write-Output $(git push origin main)").map(([name]) => name), ["Write-Output", "git"]);
  assert.deepEqual(lightPowerShellParse("Set-Content \"$HOME\\notes.txt\" x").commands[0].elements[0], {
    kind: "value",
    text: null,
    expandable: "$HOME\\notes.txt",
  });
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

test("PowerShell native handoff: static code only, with the shell edition", async () => {
  const calls: Array<[string, string | undefined]> = [];
  const parser = async (code: string, _signal?: AbortSignal, shell?: "powershell" | "pwsh") => {
    calls.push([code, shell]);
    return lightPowerShellParse(code);
  };
  await shellEvidence("powershell -c 'Write-Output x'", cwd, { resolvePath: toolPath, parsePowerShell: parser });
  await shellEvidence("pwsh -c 'Write-Output y'", cwd, { resolvePath: toolPath, parsePowerShell: parser });
  assert.deepEqual(calls, [["Write-Output x", "powershell"], ["Write-Output y", "pwsh"]]);
  const dynamic = await shellEvidence('pwsh -c "Remove-Item -Recurse ~/Documents; $UNKNOWN"', cwd, { resolvePath: toolPath, parsePowerShell: parser });
  assert.equal(calls.length, 2);
  assert.ok(dynamic.invocations.some((invocation) => invocation.program === "rm"));
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

test("a heredoc's line goes on after it: commands, pipes and chains there are read (review H1)", async () => {
  assert.deepEqual(await programs("cat <<EOF > a.txt && rm -rf ~/Documents\nx\nEOF"), ["cat", "rm"]);
  assert.deepEqual(await programs("cat <<EOF | sudo tee /etc/hosts\nx\nEOF"), ["cat", "tee"]);
  assert.deepEqual((await read("cat <<EOF | sudo tee /etc/hosts\nx\nEOF")).invocations[1].privileged, ["sudo"]);
  const moved = await read("cat <<EOF; cd ~; rm -rf Documents\nhi\nEOF");
  assert.deepEqual(moved.invocations.find((invocation) => invocation.program === "rm")?.cwds, [homedir()]);
  assert.deepEqual(await programs("python3 - <<'PY' && git push origin main\nprint(1)\nPY"), ["python3", "git"]);
  assert.deepEqual((await read("cat <<EOF > notes.md\nhi\nEOF")).redirects.map((redirect) => redirect.target), ["notes.md"]);
});

test("code for PowerShell, bash -c and eval is still read past an unreadable $X (review H2)", async () => {
  const facts = await read('powershell -Command "Remove-Item -Recurse -Force ~/Documents; $null"');
  assert.deepEqual(facts.invocations.at(-1)?.args, ["-r", "~/Documents"]);
  const piped = await read('powershell -Command "Get-ChildItem *.tmp | ForEach-Object { $_ }; Remove-Item -Recurse ~/Documents"');
  assert.ok(piped.invocations.some((invocation) => invocation.program === "rm" && invocation.args.includes("~/Documents")));
  assert.deepEqual((await read('bash -c "rm -rf $DIR && git push"')).invocations.map((invocation) => invocation.program), ["bash", "rm", "git"]);
  // Windows PowerShell's first positional argument is code; pwsh's is a script file.
  assert.equal((await read('powershell "Remove-Item x"')).invocations.at(-1)?.program, "rm");
  assert.equal((await read("pwsh script.ps1")).invocations.length, 1);
});

test("PowerShell light reader: spaced arrays, assignments, literal arrays, pipelines, iex (review M1)", async () => {
  const args = async (code: string) =>
    (await read(`pwsh -c "${code}"`)).invocations.filter((invocation) => invocation.shell === "powershell").map((invocation) => [invocation.program, invocation.args]);
  assert.deepEqual(await args("Remove-Item -Recurse -Force 'tmp', '~/Documents'"), [["rm", ["-r", "tmp", "~/Documents"]]]);
  assert.deepEqual(await args("$null = Remove-Item -Recurse ~/Documents"), [["rm", ["-r", "~/Documents"]]]);
  assert.deepEqual(await args("Remove-Item -Path @('a', 'b')"), [["rm", ["-r", "a", "b"]]]);
  // `Get-ChildItem X | Remove-Item`: X's content.
  assert.deepEqual(await args("Get-ChildItem ~/Documents | Remove-Item -Recurse"), [
    ["ls", ["~/Documents"]],
    ["rm", ["-r", "~/Documents/*"]],
  ]);
  assert.deepEqual((await args("iex 'Remove-Item ~/Documents'")).at(-1), ["rm", ["-r", "~/Documents"]]);
  // An abbreviated parameter (`-Pa`, `-Dest`) binds like the full one.
  assert.deepEqual(await args("Move-Item -Pa a.txt -Dest b.txt"), [["mv", ["a.txt", "b.txt"]]]);
});

test("ANSI-C strings, cmd redirects and quoting, find -exec (review L2, M7, L8)", async () => {
  assert.deepEqual((await read("$'\\x73udo' ls")).invocations[0].privileged, ["sudo"]);
  assert.equal((await read("$'\\162m' -rf x")).invocations[0].program, "rm");
  const cmd = await read('cmd //c "type a > /etc/motd"');
  assert.deepEqual(cmd.redirects.map((redirect) => redirect.target), ["/etc/motd"]);
  const quoted = await read('cmd /c del "my file.txt"');
  assert.deepEqual(quoted.invocations.at(-1)?.args, ["-r", "my file.txt"]);
  assert.deepEqual(await programs("find . -name '*.log' -exec sudo rm {} +"), ["find", "rm"]);
});

test("the temp folder's variables are known (review M8)", async () => {
  const original = process.env.TMPDIR;
  process.env.TMPDIR = "/var/tmp-alt-test";
  try {
    assert.deepEqual((await read('rm -rf "$TMPDIR"/*')).invocations[0].args, ["-rf", "/var/tmp-alt-test/*"]);
  } finally {
    if (original === undefined) delete process.env.TMPDIR;
    else process.env.TMPDIR = original;
  }
});
