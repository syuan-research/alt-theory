/** Parse visible PowerShell code as data; never run the command being checked. */
import { execFile } from "node:child_process";
import type { PowerShellParse, PowerShellParser } from "./powershell-evidence.js";

// A fixed driver, passed as one argv entry. The source arrives only on stdin.
const DRIVER = String.raw`
$ErrorActionPreference = 'Stop'
[Console]::InputEncoding = [Text.Encoding]::UTF8
[Console]::OutputEncoding = [Text.Encoding]::UTF8
$source = ([Console]::In.ReadToEnd() | ConvertFrom-Json).code
$tokens = $null
$errors = $null
$tree = [Management.Automation.Language.Parser]::ParseInput($source, [ref]$tokens, [ref]$errors)

function Read-Value($node) {
  if ($node -is [Management.Automation.Language.StringConstantExpressionAst] -or
      $node -is [Management.Automation.Language.ConstantExpressionAst]) {
    return @{ kind = 'value'; text = [string]$node.Value }
  }
  if ($node -is [Management.Automation.Language.ExpandableStringExpressionAst]) {
    if ($node.NestedExpressions.Count -eq 0) { return @{ kind = 'value'; text = $node.Value } }
    return @{ kind = 'value'; text = $null; expandable = $node.Value }
  }
  if ($node -is [Management.Automation.Language.VariableExpressionAst]) {
    if ($node.Splatted) { return @{ kind = 'value'; text = $null } }
    return @{ kind = 'value'; text = $null; expandable = $node.Extent.Text }
  }
  return @{ kind = 'value'; text = $null }
}

function Read-Values($node) {
  if ($node -is [Management.Automation.Language.ArrayLiteralAst]) {
    $first = $true
    foreach ($item in $node.Elements) {
      foreach ($value in @(Read-Values $item)) {
        if (-not $first) { $value.continues = $true }
        $first = $false
        $value
      }
    }
  } elseif ($node -is [Management.Automation.Language.ArrayExpressionAst] -or
            $node -is [Management.Automation.Language.ParenExpressionAst]) {
    $body = if ($node -is [Management.Automation.Language.ArrayExpressionAst]) { $node.SubExpression.Statements } else { @($node.Pipeline) }
    $first = $true
    foreach ($statement in $body) {
      if ($statement -isnot [Management.Automation.Language.PipelineAst] -or
          $statement.PipelineElements.Count -ne 1 -or
          $statement.PipelineElements[0] -isnot [Management.Automation.Language.CommandExpressionAst]) {
        @{ kind = 'value'; text = $null }
        return
      }
      foreach ($value in @(Read-Values $statement.PipelineElements[0].Expression)) {
        if (-not $first) { $value.continues = $true }
        $first = $false
        $value
      }
    }
  } else { Read-Value $node }
}

$commands = @($tree.FindAll({ param($node)
  $node -is [Management.Automation.Language.CommandAst] -or
  ($node -is [Management.Automation.Language.CommandExpressionAst] -and $node.Redirections.Count -gt 0)
}, $true) | ForEach-Object {
  $node = $_
  $name = $null
  $elements = @()
  if ($node -is [Management.Automation.Language.CommandAst]) {
    $name = $node.GetCommandName()
    $elements = @($node.CommandElements | Select-Object -Skip 1 | ForEach-Object {
      if ($_ -is [Management.Automation.Language.CommandParameterAst]) {
        $parameter = @{ kind = 'parameter'; name = $_.ParameterName.ToLowerInvariant(); text = $_.Extent.Text }
        if ($null -ne $_.Argument) {
          $value = Read-Value $_.Argument
          $parameter.argument = $value.text
          if ($null -ne $value.expandable) { $parameter.expandable = $value.expandable }
        }
        $parameter
      } else { Read-Values $_ }
    })
  }
  $redirects = @($node.Redirections | Where-Object { $_ -is [Management.Automation.Language.FileRedirectionAst] } | ForEach-Object {
    $value = Read-Value $_.Location
    @{ target = $value.text; append = $_.Append; expandable = $value.expandable }
  })
  $parent = $node.Parent
  while ($null -ne $parent -and $parent -isnot [Management.Automation.Language.PipelineAst]) { $parent = $parent.Parent }
  $pipeline = if ($null -ne $parent) { $parent.Extent.StartOffset } else { $node.Extent.StartOffset }
  $conditional = $false
  for ($parent = $node.Parent; $null -ne $parent; $parent = $parent.Parent) {
    if ($parent -is [Management.Automation.Language.IfStatementAst] -or
        $parent -is [Management.Automation.Language.LoopStatementAst] -or
        $parent -is [Management.Automation.Language.SwitchStatementAst] -or
        $parent -is [Management.Automation.Language.ScriptBlockExpressionAst] -or
        $parent -is [Management.Automation.Language.FunctionDefinitionAst]) { $conditional = $true }
  }
  @{ name = $name; elements = $elements; redirects = $redirects; pipeline = $pipeline; conditional = $conditional }
})
@{ ok = ($errors.Count -eq 0); commands = $commands } | ConvertTo-Json -Depth 30 -Compress
`;

/** One parser per executable; cached syntax never includes a permission decision. */
export function createNativePowerShellParser(executable = "powershell.exe"): PowerShellParser {
  const cache = new Map<string, PowerShellParse>();
  return async (code, signal) => {
    if (signal?.aborted || code.length > 1_000_000) return null;
    const cached = cache.get(code);
    if (cached) return cached;
    return new Promise((resolve) => {
      const child = execFile(executable, ["-NoProfile", "-NonInteractive", "-Command", DRIVER], {
        windowsHide: true, encoding: "utf8", timeout: 5_000, maxBuffer: 2 * 1024 * 1024, signal,
      }, (error, stdout) => {
        if (error || signal?.aborted) return resolve(null);
        try {
          const parsed: PowerShellParse = JSON.parse(stdout.replace(/^\uFEFF/, ""));
          if (typeof parsed.ok !== "boolean" || !Array.isArray(parsed.commands)) return resolve(null);
          if (parsed.ok && code.length <= 65_536) {
            if (cache.size >= 32) cache.delete(cache.keys().next().value!);
            cache.set(code, parsed);
          }
          resolve(parsed);
        } catch { resolve(null); }
      });
      // A failed/aborted spawn may close stdin before the write completes.
      child.stdin?.on("error", () => {});
      child.stdin?.end(JSON.stringify({ code }));
    });
  };
}

const windowsParser = createNativePowerShellParser();
const pwshParser = createNativePowerShellParser("pwsh.exe");
export const nativePowerShellParse: PowerShellParser = (code, signal, shell) =>
  (shell === "pwsh" ? pwshParser : windowsParser)(code, signal);
