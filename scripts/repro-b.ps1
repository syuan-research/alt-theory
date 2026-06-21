# Reproduce B's failure cleanly: kill ALL AltTheory, unique port, real env
# (mimics double-click), capture the actual stack from bundle-debug.log.
$ErrorActionPreference = 'Continue'
Get-Process AltTheory -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
Start-Sleep -Seconds 2

# Use a fresh userData so no prior state contaminates, but REAL appdata root
# (mimic double-click). Clear bundle-debug.log first.
$userData = Join-Path $env:APPDATA 'AltTheory'
$log = Join-Path $userData 'bundle-debug.log'
if (Test-Path $log) { Remove-Item $log -Force }

# Unique port to avoid any lingering server on 3000
$env:ALT_THEORY_PORT = '3777'
$env:PORT = '3777'

$repoRoot = Resolve-Path (Join-Path $PSScriptRoot '..')
$exe = Join-Path $repoRoot 'dist\AltTheory-Portable-0.5.0-bundle.exe'
Write-Host "Launching B (port 3777, real env, fresh log)..."
$sw = [System.Diagnostics.Stopwatch]::StartNew()
$p = Start-Process -FilePath $exe -PassThru -WindowStyle Minimized
$reached = $false
for ($i = 0; $i -lt 90; $i++) {
  Start-Sleep -Seconds 2
  if ($p.HasExited) {
    $sw.Stop()
    Write-Host "EXITED after $([math]::Round($sw.Elapsed.TotalSeconds))s, exitCode=$($p.ExitCode)"
    break
  }
  try {
    $r = Invoke-WebRequest -UseBasicParsing -Uri 'http://127.0.0.1:3777/api/config/status' -TimeoutSec 3
    $sw.Stop()
    Write-Host "server reachable after $([math]::Round($sw.Elapsed.TotalSeconds))s"
    Write-Host $r.Content
    $reached = $true
    break
  } catch {}
}
Stop-Process -Id $p.Id -Force -ErrorAction SilentlyContinue
Get-Process AltTheory -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue

Write-Host "`n=== bundle-debug.log (full) ==="
if (Test-Path $log) { Get-Content $log } else { Write-Host "(no log written)" }
Write-Host "`nreached=$reached"
