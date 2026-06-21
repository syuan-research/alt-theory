# Check whether the bundle test wrote anything to the real bundle data root,
# and clean it if it's only test artifacts (empty data/pi-agent dirs).
$root = Join-Path $env:APPDATA 'llm-theo'
Write-Host "=== real bundle data root: $root ==="
Write-Host "exists: $(Test-Path $root)"
if (Test-Path $root) {
  Write-Host "--- tree ---"
  Get-ChildItem $root -Recurse -ErrorAction SilentlyContinue | Select-Object @{N='Rel';E={$_.FullName.Substring($root.Length+1)}}, Length | Format-Table -AutoSize
  # The bundle test created empty 'data' and 'pi-agent' dirs. They are harmless
  # (empty), but remove them so the test leaves no trace on the real machine.
  $dataDir = Join-Path $root 'data'
  $piDir = Join-Path $root 'pi-agent'
  foreach ($d in @($dataDir, $piDir)) {
    if (Test-Path $d) {
      $count = (Get-ChildItem $d -Recurse -File -ErrorAction SilentlyContinue | Measure-Object).Count
      if ($count -eq 0) {
        Remove-Item $d -Recurse -Force
        Write-Host "removed empty: $d"
      } else {
        Write-Host "NOT empty ($count files), leaving: $d"
      }
    }
  }
  # Remove the parent if now empty
  $remaining = (Get-ChildItem $root -ErrorAction SilentlyContinue | Measure-Object).Count
  if ($remaining -eq 0) {
    Remove-Item $root -Force
    Write-Host "removed empty parent: $root"
  } else {
    Write-Host "parent still has $remaining items, leaving it"
  }
}
