# ============================================================
#  سكريبت توليد صور الموقع (مش محتاج تعدل فيه):
#   1) assets/social/og-cover.png  -> صورة المعاينة لما اللينك يتشارك (1200x630)
#   2) assets/icons/icon-512.png   -> أيقونة الموقع (512x512)
#  نصوص الصورة بتتقري من: assets/social/og-text.txt (UTF-8)
# ============================================================
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing

$root = Split-Path -Parent $MyInvocation.MyCommand.Path   # tools/
$proj = Split-Path -Parent $root

$texts = [System.IO.File]::ReadAllLines((Join-Path $proj 'assets\social\og-text.txt'), [System.Text.Encoding]::UTF8)
$tMain = $texts[0]
$tSub  = $texts[1]
$tFoot = $texts[2]

# ---------- رسم شكل القلب (Bezier) ----------
function Add-Heart([System.Drawing.Drawing2D.GraphicsPath]$path, [float]$ox, [float]$oy, [float]$s) {
    $segs = @(
        @(@(0.20,0.66), @(0.05,0.45), @(0.05,0.30)),
        @(@(0.05,0.12), @(0.20,0.04), @(0.32,0.04)),
        @(@(0.40,0.04), @(0.47,0.10), @(0.50,0.18)),
        @(@(0.53,0.10), @(0.60,0.04), @(0.68,0.04)),
        @(@(0.80,0.04), @(0.95,0.12), @(0.95,0.30)),
        @(@(0.95,0.45), @(0.80,0.66), @(0.50,0.92))
    )
    $px = $ox + 0.50*$s; $py = $oy + 0.92*$s
    foreach ($seg in $segs) {
        $c1x = $ox + $seg[0][0]*$s; $c1y = $oy + $seg[0][1]*$s
        $c2x = $ox + $seg[1][0]*$s; $c2y = $oy + $seg[1][1]*$s
        $ex  = $ox + $seg[2][0]*$s; $ey  = $oy + $seg[2][1]*$s
        $path.AddBezier(
            (New-Object System.Drawing.PointF($px, $py)),
            (New-Object System.Drawing.PointF($c1x, $c1y)),
            (New-Object System.Drawing.PointF($c2x, $c2y)),
            (New-Object System.Drawing.PointF($ex, $ey)))
        $px = $ex; $py = $ey
    }
    $path.CloseFigure()
}

# ---------- توهج ناعم ----------
function Draw-Glow([System.Drawing.Graphics]$g, [float]$cx, [float]$cy, [float]$r, [System.Drawing.Color]$color) {
    $gp = New-Object System.Drawing.Drawing2D.GraphicsPath
    $gp.AddEllipse(($cx - $r), ($cy - $r), (2*$r), (2*$r))
    $pgb = New-Object System.Drawing.Drawing2D.PathGradientBrush($gp)
    $pgb.CenterColor = $color
    $pgb.SurroundColors = @([System.Drawing.Color]::FromArgb(0, 0, 0, 0))
    $g.FillEllipse($pgb, ($cx - $r), ($cy - $r), (2*$r), (2*$r))
    $pgb.Dispose(); $gp.Dispose()
}

# ---------- رسم قلب بتدرج ----------
function Draw-Heart([System.Drawing.Graphics]$g, [float]$cx, [float]$cy, [float]$size) {
    $hp = New-Object System.Drawing.Drawing2D.GraphicsPath
    Add-Heart $hp ($cx - $size/2) ($cy - $size/2) $size
    $hRect = New-Object System.Drawing.RectangleF(($cx - $size/2), ($cy - $size/2), $size, $size)
    $hb = New-Object System.Drawing.Drawing2D.LinearGradientBrush($hRect,
        [System.Drawing.Color]::FromArgb(255, 255, 143, 177),
        [System.Drawing.Color]::FromArgb(255, 247, 200, 115), 45.0)
    $g.FillPath($hb, $hp)
    $hb.Dispose(); $hp.Dispose()
}

# ---------- صورة المعاينة 1200x630 ----------
$w = 1200; $h = 630
$bmp = New-Object System.Drawing.Bitmap($w, $h)
$g = [System.Drawing.Graphics]::FromImage($bmp)
$g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
$g.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::AntiAliasGridFit

$rect = New-Object System.Drawing.Rectangle(0, 0, $w, $h)
$bg = New-Object System.Drawing.Drawing2D.LinearGradientBrush($rect,
    [System.Drawing.Color]::FromArgb(255, 24, 9, 30),
    [System.Drawing.Color]::FromArgb(255, 58, 16, 44), 55.0)
$g.FillRectangle($bg, $rect)

Draw-Glow $g ($w*0.85) ($h*0.12) ($w*0.42) ([System.Drawing.Color]::FromArgb(70, 255, 92, 138))
Draw-Glow $g ($w*0.10) ($h*0.85) ($w*0.38) ([System.Drawing.Color]::FromArgb(55, 247, 200, 115))

Draw-Heart $g ($w/2) ($h*0.26) 260

$sf = New-Object System.Drawing.StringFormat
$sf.Alignment = [System.Drawing.StringAlignment]::Center
$sf.LineAlignment = [System.Drawing.StringAlignment]::Center

$fMain = New-Object System.Drawing.Font('Segoe UI', 58, [System.Drawing.FontStyle]::Bold, [System.Drawing.GraphicsUnit]::Pixel)
$rMain = New-Object System.Drawing.RectangleF(30, ($h*0.52), ($w-60), ($h*0.16))
$g.DrawString($tMain, $fMain, [System.Drawing.Brushes]::White, $rMain, $sf)

$fSub = New-Object System.Drawing.Font('Segoe UI', 30, [System.Drawing.FontStyle]::Regular, [System.Drawing.GraphicsUnit]::Pixel)
$cSub = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(255, 255, 179, 199))
$rSub = New-Object System.Drawing.RectangleF(30, ($h*0.70), ($w-60), ($h*0.10))
$g.DrawString($tSub, $fSub, $cSub, $rSub, $sf)

$fFoot = New-Object System.Drawing.Font('Segoe UI', 22, [System.Drawing.FontStyle]::Regular, [System.Drawing.GraphicsUnit]::Pixel)
$cFoot = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(200, 203, 178, 196))
$rFoot = New-Object System.Drawing.RectangleF(30, ($h*0.86), ($w-60), ($h*0.08))
$g.DrawString($tFoot, $fFoot, $cFoot, $rFoot, $sf)

$g.Dispose()
$bmp.Save((Join-Path $proj 'assets\social\og-cover.png'), [System.Drawing.Imaging.ImageFormat]::Png)
$bmp.Dispose()
Write-Output 'og-cover.png done'

# ---------- أيقونة 512x512 ----------
$s2 = 512
$bmp2 = New-Object System.Drawing.Bitmap($s2, $s2)
$g2 = [System.Drawing.Graphics]::FromImage($bmp2)
$g2.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias

$rect2 = New-Object System.Drawing.Rectangle(0, 0, $s2, $s2)
$bg2 = New-Object System.Drawing.Drawing2D.LinearGradientBrush($rect2,
    [System.Drawing.Color]::FromArgb(255, 29, 11, 38),
    [System.Drawing.Color]::FromArgb(255, 46, 14, 36), 55.0)
$g2.FillRectangle($bg2, $rect2)

Draw-Glow $g2 ($s2*0.78) ($s2*0.20) ($s2*0.45) ([System.Drawing.Color]::FromArgb(80, 255, 92, 138))

Draw-Heart $g2 ($s2/2) ($s2/2) 330

$g2.Dispose()
$bmp2.Save((Join-Path $proj 'assets\icons\icon-512.png'), [System.Drawing.Imaging.ImageFormat]::Png)
$bmp2.Dispose()
Write-Output 'icon-512.png done'
