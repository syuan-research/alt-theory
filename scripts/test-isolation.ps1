# Launch candidate A in isolation and verify: no login page (anonymous workbench),
# and config dir + data dir point at the bundle-owned paths, not pilot's.
$ErrorActionPreference = 'Continue'
$repoRoot = Resolve-Path (Join-Path $PSScriptRoot '..')
$exe = Join-Path $repoRoot 'dist\win-unpacked\AltTheory.exe'

# Use a throwaway APPDATA so Electron userData is isolated from the real machine.
$testAppdata = Join-Path $env:TEMP 'alttheory-iso-test'
if (Test-Path $testAppdata) { Remove-Item $testAppdata -Recurse -Force }
New-Item -ItemType Directory -Force -Path $testAppdata | Out-Null
$env:APPDATA = $testAppdata
$env:LOCALAPPDATA = $testAppdata

$p = Start-Process -FilePath $exe -PassThru -WindowStyle Minimized
$up = $false
for ($i = 0; $i -lt 20; $i++) {
  Start-Sleep -Seconds 2
  try {
    $r = Invoke-WebRequest -UseBasicParsing -Uri 'http://127.0.0.1:3000/api/config/status' -TimeoutSec 3
    Write-Host "STATUS: $($r.Content)"
    $up = $true
    break
  } catch {
    if ($i % 4 -eq 0) { Write-Host "  attempt ${i} not up" }
  }
}

# Check the anonymous gate: does /api/sessions require auth now?
if ($up) {
  try {
    $r2 = Invoke-WebRequest -UseBasicParsing -Uri 'http://127.0.0.1:3000/api/sessions' -TimeoutSec 3
    Write-Host "SESSIONS (no auth): status $($r2.StatusCode) -> $($r2.Content.Substring(0,[Math]::Min(120,$r2.Content.Length)))"
    Write-Host "  => anonymous access ALLOWED (no login page expected)"
  } catch {
    $code = $_.Exception.Response.StatusCode.value__
    Write-Host "SESSIONS (no auth): status $code => AUTH REQUIRED (login page would show)"
  }
}

# Inspect what userData the bundle actually created
$userData = Join-Path $testAppdata 'AltTheory'
Write-Host "`n=== userData tree ($userData) ==="
if (Test-Path $userData) {
  Get-ChildItem $userData -Recurse -ErrorAction SilentlyContinue | Select-Object @{N='Rel';E={$_.FullName.Substring($userData.Length+1)}} | Format-Table -AutoSize
} else {
  Write-Host "  (no userData created yet)"
}

Write-Host "`n=== bundle-debug.log tail ==="
$log = Join-Path $userData 'bundle-debug.log'
if (Test-Path $log) { Get-Content $log -Tail 15 } else { Write-Host '  (no log)' }

Stop-Process -Id $p.Id -Force -ErrorAction SilentlyContinue
Get-Process AltTheory -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
Remove-Item $testAppdata -Recurse -Force -ErrorAction SilentlyContinue
