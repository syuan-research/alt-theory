# Prep the electron-builder winCodeSign cache without admin/symlink privilege.
# app-builder deletes partial extractions on failure, so we pre-populate the
# canonical winCodeSign-2.6.0 dir. The .7z contains 2 macOS symlinks that 7-Zip
# cannot create without SeCreateSymbolicLinkPrivilege; those 2 files are
# irrelevant for Windows builds and are simply skipped.
$ErrorActionPreference = 'Stop'
$base = Join-Path $env:LOCALAPPDATA 'electron-builder\Cache\winCodeSign'
$dest = Join-Path $base 'winCodeSign-2.6.0'
$sevenZip = 'node_modules\7zip-bin\win\x64\7za.exe'
$tmp7z = Join-Path $base 'winCodeSign-2.6.0.7z'

if (-not (Test-Path $tmp7z)) {
  Write-Host "Downloading winCodeSign-2.6.0.7z ..."
  $url = 'https://github.com/electron-userland/electron-builder-binaries/releases/download/winCodeSign-2.6.0/winCodeSign-2.6.0.7z'
  Invoke-WebRequest -UseBasicParsing -Uri $url -OutFile $tmp7z
}

if (Test-Path $dest) { Remove-Item $dest -Recurse -Force }
# Use -snld to store symlinks as links; on failure those 2 macOS files error
# out but everything else extracts. PowerShell treats the non-zero exit / stderr
# as an error, so capture the exit code explicitly and tolerate the 2 known
# symlink failures.
$ErrorActionPreference = 'Continue'
& $sevenZip 'x' $tmp7z ("-o" + $dest) '-y' '-snld' 2>&1 | Out-Null
$exit = $LASTEXITCODE
$ErrorActionPreference = 'Stop'
# exit code 2 = "sub items errors" which is expected here.
if ($exit -ne 0 -and $exit -ne 2) {
  throw "7za extraction failed with exit code $exit"
}

# Create the 2 problematic macOS symlinks as empty regular files so the tree is
# "complete" (they are never used on Windows).
$dummy1 = Join-Path $dest 'darwin\10.12\lib\libcrypto.dylib'
$dummy2 = Join-Path $dest 'darwin\10.12\lib\libssl.dylib'
foreach ($f in @($dummy1, $dummy2)) {
  if (-not (Test-Path $f)) { New-Item -ItemType File -Path $f -Force | Out-Null }
}

Write-Host "rcedit-x64.exe present: $(Test-Path (Join-Path $dest 'rcedit-x64.exe'))"
Write-Host "signtool x64 present:   $(Test-Path (Join-Path $dest 'windows-10\x64\signtool.exe'))"
Write-Host "winCodeSign cache prepared at: $dest"
