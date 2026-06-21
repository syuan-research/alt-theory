Add-Type -AssemblyName System.Drawing
$root = Resolve-Path (Join-Path $PSScriptRoot '..')
$bmp = New-Object System.Drawing.Bitmap(500, 300)
$g = [System.Drawing.Graphics]::FromImage($bmp)
$g.Clear([System.Drawing.Color]::FromArgb(248, 248, 249))
$g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
$titleFont = New-Object System.Drawing.Font('Segoe UI', 28, [System.Drawing.FontStyle]::Bold)
$subFont = New-Object System.Drawing.Font('Segoe UI', 14, [System.Drawing.FontStyle]::Regular)
$titleBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(60, 60, 64))
$subBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(138, 138, 144))
$g.DrawString('Alt Theory', $titleFont, $titleBrush, 140, 80)
$g.DrawString('Starting... please wait', $subFont, $subBrush, 110, 165)
New-Item -ItemType Directory -Force -Path (Join-Path $root 'build') | Out-Null
$out = Join-Path $root 'build\splash.bmp'
$bmp.Save($out, [System.Drawing.Imaging.ImageFormat]::Bmp)
$g.Dispose()
$bmp.Dispose()
Get-Item $out | Select-Object Name, Length
