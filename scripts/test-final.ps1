# Clean-userData test of BOTH candidates after GPU/sandbox-off + data-dir de-isolation.
# This is the real verification: previously the portable crashed with 0x80000003 on
# a clean userData. If it no longer crashes, D4 works.
$ErrorActionPreference = 'Continue'

function Test-Exe($label, $exe, $isPortable) {
  Write-Host "`n========== $label =========="
  $testAppdata = Join-Path $env:TEMP "alttheory-final-$label"
  if (Test-Path $testAppdata) { Remove-Item $testAppdata -Recurse -Force }
  New-Item -ItemType Directory -Force -Path $testAppdata | Out-Null
  $env:APPDATA = $testAppdata
  $env:LOCALAPPDATA = $testAppdata

  $sw = [System.Diagnostics.Stopwatch]::StartNew()
  $p = Start-Process -FilePath $exe -PassThru -WindowStyle Minimized
  $reached = $false
  $crashed = $false
  for ($i = 0; $i -lt 60; $i++) {
    Start-Sleep -Seconds 2
    if ($p.HasExited) {
      $sw.Stop()
      Write-Host "  EXITED after $([math]::Round($sw.Elapsed.TotalSeconds))s, exitCode=$($p.ExitCode) (0x$('{0:X}' -f ($p.ExitCode -band 0xFFFFFFFF)))"
      $crashed = $true
      break
    }
    try {
      $r = Invoke-WebRequest -UseBasicParsing -Uri 'http://127.0.0.1:3000/api/config/status' -TimeoutSec 3
      $sw.Stop()
      Write-Host "  server reachable after $([math]::Round($sw.Elapsed.TotalSeconds))s"
      Write-Host "  status: $($r.Content)"
      $reached = $true
      break
    } catch {}
  }
  if ($reached) {
    # verify isolation state
    try {
      $r2 = Invoke-WebRequest -UseBasicParsing -Uri 'http://127.0.0.1:3000/api/sessions' -TimeoutSec 3
      Write-Host "  sessions(200): $($r2.Content.Substring(0,[Math]::Min(100,$r2.Content.Length)))"
    } catch { Write-Host "  sessions: $($_.Exception.Response.StatusCode.value__)" }
  }
  Stop-Process -Id $p.Id -Force -ErrorAction SilentlyContinue
  Get-Process AltTheory -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
  Start-Sleep -Seconds 2
  Remove-Item $testAppdata -Recurse -Force -ErrorAction SilentlyContinue
  return @{ reached = $reached; crashed = $crashed }
}

$repoRoot = Resolve-Path (Join-Path $PSScriptRoot '..')
$a = Test-Exe 'A-dir' (Join-Path $repoRoot 'dist\win-unpacked\AltTheory.exe') $false
$b = Test-Exe 'B-portable' (Join-Path $repoRoot 'dist\AltTheory-Portable-0.5.0-bundle.exe') $true

Write-Host "`n========== SUMMARY =========="
Write-Host "A (dir):      reached=$($a.reached) crashed=$($a.crashed)"
Write-Host "B (portable): reached=$($b.reached) crashed=$($b.crashed)"
