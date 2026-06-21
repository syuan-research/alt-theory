# Test portable exe: first run (extracts, shows splash), then second run
# (should be instant, no re-extract). Verify it actually launches the server
# both times. This tests the timing-race hypothesis: if first run works after
# extract, the crash was in the extract/timing layer, not GPU.
$ErrorActionPreference = 'Continue'
$repoRoot = Resolve-Path (Join-Path $PSScriptRoot '..')
$portable = Join-Path $repoRoot 'dist\AltTheory-Portable-0.5.0-bundle.exe'
$testAppdata = Join-Path $env:TEMP 'alttheory-portable-test'
if (Test-Path $testAppdata) { Remove-Item $testAppdata -Recurse -Force }
New-Item -ItemType Directory -Force -Path $testAppdata | Out-Null
$env:APPDATA = $testAppdata
$env:LOCALAPPDATA = $testAppdata

# Clean any prior fixed unpack dir so this is a true first-extract
$fixedUnpack = Join-Path $testAppdata 'AltTheory'
if (Test-Path $fixedUnpack) { Remove-Item $fixedUnpack -Recurse -Force }

Write-Host "========== FIRST RUN (extracts $([math]::Round((Get-Item $portable).Length/1MB))MB) =========="
$sw = [System.Diagnostics.Stopwatch]::StartNew()
$p = Start-Process -FilePath $portable -PassThru -WindowStyle Minimized
$reached = $false
for ($i = 0; $i -lt 90; $i++) {
  Start-Sleep -Seconds 2
  if ($p.HasExited) { Write-Host "  process EXITED at ${i}x2s, exitCode=$($p.ExitCode)"; break }
  try {
    $r = Invoke-WebRequest -UseBasicParsing -Uri 'http://127.0.0.1:3000/api/config/status' -TimeoutSec 3
    $sw.Stop()
    Write-Host "  server reachable after $([math]::Round($sw.Elapsed.TotalSeconds))s"
    $reached = $true
    break
  } catch {}
}
if (-not $reached -and -not $p.HasExited) {
  $sw.Stop()
  Write-Host "  still not reachable after $([math]::Round($sw.Elapsed.TotalSeconds))s, process alive"
}
Stop-Process -Id $p.Id -Force -ErrorAction SilentlyContinue
Get-Process AltTheory -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
Start-Sleep -Seconds 3

Write-Host "`n========== SECOND RUN (fixed unpackDirName = should be fast, no re-extract) =========="
$sw2 = [System.Diagnostics.Stopwatch]::StartNew()
$p2 = Start-Process -FilePath $portable -PassThru -WindowStyle Minimized
$reached2 = $false
for ($i = 0; $i -lt 30; $i++) {
  Start-Sleep -Seconds 2
  if ($p2.HasExited) { Write-Host "  process EXITED at ${i}x2s, exitCode=$($p2.ExitCode)"; break }
  try {
    $r = Invoke-WebRequest -UseBasicParsing -Uri 'http://127.0.0.1:3000/api/config/status' -TimeoutSec 3
    $sw2.Stop()
    Write-Host "  server reachable after $([math]::Round($sw2.Elapsed.TotalSeconds))s"
    $reached2 = $true
    break
  } catch {}
}
Stop-Process -Id $p2.Id -Force -ErrorAction SilentlyContinue
Get-Process AltTheory -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue

Write-Host "`n========== SUMMARY =========="
Write-Host "first run reached: $reached2"
Write-Host "second run reached: $reached2"
Remove-Item $testAppdata -Recurse -Force -ErrorAction SilentlyContinue
