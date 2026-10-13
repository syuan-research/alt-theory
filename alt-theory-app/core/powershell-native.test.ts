import assert from "node:assert/strict";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { powerShellInvocations } from "./powershell-evidence.js";
import { createNativePowerShellParser } from "./powershell-native.js";
import { toolPath } from "./security-extension.js";

const windows = process.platform === "win32";
const executables = windows
  ? ["powershell.exe", ...(process.env.ProgramFiles && existsSync(join(process.env.ProgramFiles, "PowerShell", "7", "pwsh.exe"))
      ? [join(process.env.ProgramFiles, "PowerShell", "7", "pwsh.exe")] : [])]
  : [];

for (const executable of executables) {
  test(`native AST (${executable}): UTF-8, values, arrays, nested commands and redirects`, async () => {
    const parse = createNativePowerShellParser(executable);
    const reading = await parse(String.raw`
Write-Output '中文; git push; Remove-Item C:\Windows'
Remove-Item -LiteralPath @('a', 'b') -Recurse
Set-Content -Path:'报告.txt' -Value 'rm -rf /'
Write-Output $(git push origin main)
'x' > out.txt
Get-ChildItem 'data' | Remove-Item -Recurse
Get-ChildItem -Filter *.tmp | Remove-Item -Recurse
Set-Content -Path "$HOME\notes.txt" -Value x
'x' > "$env:USERPROFILE\redirect.txt"
`, undefined);
    assert.ok(reading?.ok);
    const [first, remove, write, outer, inner] = reading.commands;
    assert.deepEqual(first.elements, [{ kind: "value", text: "中文; git push; Remove-Item C:\\Windows" }]);
    assert.equal(remove.name, "Remove-Item");
    assert.deepEqual(remove.elements.slice(1, 3), [
      { kind: "value", text: "a" }, { kind: "value", text: "b", continues: true },
    ]);
    assert.equal((write.elements[0] as { argument?: string }).argument, "报告.txt");
    assert.equal(outer.name, "Write-Output");
    assert.equal(inner.name, "git");
    const cwd = join(tmpdir(), "alt-native-facts");
    const facts = powerShellInvocations(reading, [cwd], toolPath);
    const commands = facts.flatMap((fact) => "invocation" in fact ? [fact.invocation] : []);
    assert.deepEqual(commands.find((command) => command.program === "rm")?.args, ["-r", "a", "b"]);
    assert.ok(commands.some((command) => command.program === "rm" && command.args.join(" ") === "-r data/*"));
    assert.deepEqual(commands.filter((command) => command.program === "rm").at(-1)?.args, ["-r", "./*.tmp"]);
    assert.ok(facts.some((fact) => "redirect" in fact && fact.redirect.target === "~/redirect.txt"));
    assert.ok(commands.some((command) => command.program === "touch" && command.args[0] === "~/notes.txt"));
    assert.equal((await parse("Write-Output 'unterminated"))?.ok, false);
  });

  test(`native AST (${executable}): splatted parameters are unknown; quoted @p is a literal`, async () => {
    const reading = await createNativePowerShellParser(executable)("Remove-Item @p; Remove-Item '@p'");
    assert.ok(reading?.ok);
    const commands = powerShellInvocations(reading, [tmpdir()], toolPath)
      .flatMap((fact) => "invocation" in fact ? [fact.invocation] : []);
    assert.deepEqual(commands.map((command) => command.args), [["-r", null], ["-r", "@p"]]);
  });

  test(`native AST (${executable}): parsing never executes input; conditional cd keeps both folders`, async (t) => {
    const root = mkdtempSync(join(tmpdir(), "alt-native-"));
    t.after(() => rmSync(root, { recursive: true, force: true }));
    const sentinel = join(root, "must-not-exist.txt");
    const parse = createNativePowerShellParser(executable);
    assert.ok((await parse(`Set-Content -LiteralPath '${sentinel}' -Value x`))?.ok);
    assert.equal(existsSync(sentinel), false);
    const reading = await parse("if ($flag) { Set-Location sub }; Set-Content relative.txt x");
    assert.ok(reading?.ok);
    const write = powerShellInvocations(reading, [root], toolPath)
      .find((fact) => "invocation" in fact && fact.invocation.program === "touch");
    assert.deepEqual(write && "invocation" in write ? write.invocation.cwds : [], [root, join(root, "sub")]);
    assert.equal(await parse("Write-Output x", AbortSignal.abort()), null);
    const controller = new AbortController();
    const pending = parse("Write-Output uncached", controller.signal);
    controller.abort();
    assert.equal(await pending, null);
  });
}

test("native AST: an unavailable executable returns null for the light fallback", async () => {
  const parse = createNativePowerShellParser(join(tmpdir(), "alt-no-such-parser", "powershell.exe"));
  assert.equal(await parse("Write-Output x"), null);
});

test("native AST: oversized input returns to the light reader", async () => {
  assert.equal(await createNativePowerShellParser()("x".repeat(1_000_001)), null);
});
