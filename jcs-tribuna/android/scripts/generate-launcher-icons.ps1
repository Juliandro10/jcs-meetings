# Gera PNGs do icone JCS Read para tablets antigos (API 19+).
Add-Type -AssemblyName System.Drawing

function New-JcsReadLauncherIcon {
    param([int]$Size)

    $bmp = New-Object System.Drawing.Bitmap $Size, $Size
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
    $g.Clear([System.Drawing.Color]::FromArgb(0, 0, 0, 0))

    $margin = [Math]::Max(2, [int]($Size * 0.06))
    $radius = [Math]::Max(6, [int]($Size * 0.18))
    $rect = New-Object System.Drawing.Rectangle $margin, $margin, ($Size - 2 * $margin), ($Size - 2 * $margin)

    $path = New-Object System.Drawing.Drawing2D.GraphicsPath
    $d = $radius * 2
    $path.AddArc($rect.X, $rect.Y, $d, $d, 180, 90)
    $path.AddArc($rect.Right - $d, $rect.Y, $d, $d, 270, 90)
    $path.AddArc($rect.Right - $d, $rect.Bottom - $d, $d, $d, 0, 90)
    $path.AddArc($rect.X, $rect.Bottom - $d, $d, $d, 90, 90)
    $path.CloseFigure()

    $brush = New-Object System.Drawing.Drawing2D.LinearGradientBrush($rect, `
        [System.Drawing.Color]::FromArgb(255, 139, 92, 246), `
        [System.Drawing.Color]::FromArgb(255, 76, 29, 149), `
        135.0)
    $g.FillPath($brush, $path)

    $bookW = [int]($Size * 0.52)
    $bookH = [int]($Size * 0.38)
    $bookX = [int](($Size - $bookW) / 2)
    $bookY = [int](($Size - $bookH) / 2 + ($Size * 0.02))
    $spineW = [Math]::Max(2, [int]($bookW * 0.08))
    $leftW = [int](($bookW - $spineW) / 2)

    $leftRect = New-Object System.Drawing.Rectangle $bookX, $bookY, $leftW, $bookH
    $rightRect = New-Object System.Drawing.Rectangle ($bookX + $leftW + $spineW), $bookY, $leftW, $bookH
    $spineRect = New-Object System.Drawing.Rectangle ($bookX + $leftW), $bookY, $spineW, $bookH

    $g.FillRectangle([System.Drawing.Brushes]::White, $leftRect)
    $g.FillRectangle([System.Drawing.Brushes]::White, $spineRect)
    $g.FillRectangle((New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(255, 237, 233, 254))), $rightRect)

    $lineH = [Math]::Max(1, [int]($bookH * 0.06))
    $lineGap = [Math]::Max(2, [int]($bookH * 0.12))
    $lineX1 = $bookX + [int]($leftW * 0.18)
    $lineX2 = $bookX + [int]($leftW * 0.82)
    $lineX3 = $bookX + $leftW + $spineW + [int]($leftW * 0.18)
    $lineX4 = $bookX + $leftW + $spineW + [int]($leftW * 0.78)
    $purple = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(255, 109, 40, 217))

    $y = $bookY + [int]($bookH * 0.22)
    for ($i = 0; $i -lt 3; $i++) {
        $g.FillRectangle($purple, $lineX1, $y, ($lineX2 - $lineX1), $lineH)
        $g.FillRectangle($purple, $lineX3, $y, ($lineX4 - $lineX3), $lineH)
        $y += $lineGap
    }

    $g.Dispose()
    $brush.Dispose()
    $path.Dispose()
    $purple.Dispose()
    return $bmp
}

$root = Join-Path $PSScriptRoot '..\app\src\main\res'
$sizes = @{
    'mipmap-mdpi'    = 48
    'mipmap-hdpi'    = 72
    'mipmap-xhdpi'   = 96
    'mipmap-xxhdpi'  = 144
    'mipmap-xxxhdpi' = 192
}

foreach ($folder in $sizes.Keys) {
    $size = $sizes[$folder]
    $dir = Join-Path $root $folder
    New-Item -ItemType Directory -Force -Path $dir | Out-Null
    $bmp = New-JcsReadLauncherIcon -Size $size
    $out = Join-Path $dir 'ic_launcher.png'
    $bmp.Save($out, [System.Drawing.Imaging.ImageFormat]::Png)
    $bmp.Dispose()
    Write-Host "Wrote $out ($size x $size)"
}

Write-Host 'Done.'
