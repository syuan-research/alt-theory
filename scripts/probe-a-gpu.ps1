# Probe candidate A with different GPU/sandbox args to locate B's crash root.
# A and B share the SAME Electron binary; GPU/sandbox behavior should match.
# If A does NOT crash with any arg, B's crash is in the portable-extract layer,
# not the GPU/sandbox layer. This is the high-fidelity probe the plan-record
# flagged as unresolved.
$ErrorActionPreference = 'Continue'
$repoRoot = Resolve-Path (Join-Path $PSScriptRoot '..')
$exe = Join-Path $repoRoot 'dist\win-unpacked\AltTheory.exe'
$testAppdata = Join-Path $env:TEMP 'alttheory-probe'
if (Test-Path $testAppdata) { Remove-Item $testAppdata -Recurse -Force }
New-Item -ItemType Directory -Force -Path $testAppdata | Out-Null
$env:APPDATA = $testAppdata
$env:LOCALAPPDATA = $testAppdata

$argsList = @(
  @{ name = 'no args (baseline)'; args = @() },
  @{ name = '--no-sandbox'; args = @('--no-sandbox') },
  @{ name = '--disable-gpu'; args = @('--disable-gpu') },
  @{ name = '--disable-gpu --disable-gpu-sandbox --in-process-gpu'; args = @('--disable-gpu','--disable-gpu-sandbox','--in-process-gpu') }
)

foreach ($case in $argsList) {
  Write-Host "`n========== $($case.name) =========="
  # fresh userData per case so GPU state doesn't carry over
  $env:APPDATA = $testAppdata
  $p = Start-Process -FilePath $exe -ArgumentList $case.args -PassThru -WindowStyle Minimized
  Start-Sleep -Seconds 8
  $alive = -not $p.HasExited
  Write-Host "process alive after 8s: $alive (exitCode=$($p.ExitCode))"
  if ($alive) {
    try {
      $r = Invoke-WebRequest -UseBasicParsing -Uri 'http://127.0.0.1:3000/api/config/status' -TimeoutSec 3
      Write-Host "  server reachable: $($r.Content.Substring(0,[Math]::Min(80,$r.Content.Length)))"
    } catch {
      Write-Host "  server not reachable (process alive but no server): $($_.Exception.Message)"
    }
  }
  Stop-Process -Id $p.Id -Force -ErrorAction SilentlyContinue
  Get-Process AltTheory -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
  Start-Sleep -Seconds 2
}

# clean probe temp
Remove-Item $testAppdata -Recurse -Force -ErrorAction SilentlyContinue
Write-Host "`n=== probe done ==="
