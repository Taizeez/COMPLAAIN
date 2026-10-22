# Complaain 1-Line Web Installer for Windows
# Usage in PowerShell:
#   irm https://raw.githubusercontent.com/<username>/<repo>/main/install.ps1 | iex

Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host "   Installing Complaain — Compliance as an Infrastructure" -ForegroundColor Yellow
Write-Host "==========================================================" -ForegroundColor Cyan

$installDir = "$HOME\Complaain"
if (!(Test-Path $installDir)) {
    New-Item -ItemType Directory -Path $installDir -Force | Out-Null
}

$htmlFile = "$installDir\Complaain.html"
$downloadUrl = "https://raw.githubusercontent.com/$($MyInvocation.MyCommand.Path -replace '.*githubusercontent.com/([^/]+/[^/]+)/.*','$1')/main/complaain-portable-offline.html"

# Fallback direct download if invoked via script
if ($downloadUrl -notlike "https://*") {
    $downloadUrl = "https://raw.githubusercontent.com/your-username/complaain/main/complaain-portable-offline.html"
}

Write-Host "Downloading Complaain Standalone App..." -ForegroundColor Gray
try {
    Invoke-WebRequest -Uri "https://raw.githubusercontent.com/$env:GITHUB_REPOSITORY/main/complaain-portable-offline.html" -OutFile $htmlFile -ErrorAction SilentlyContinue
} catch {}

if (!(Test-Path $htmlFile) -or (Get-Item $htmlFile).Length -lt 1000) {
    # If downloading from active local server or fallback
    Write-Host "Saving local build..." -ForegroundColor Gray
    Copy-Item ".\complaain-portable-offline.html" $htmlFile -Force -ErrorAction SilentlyContinue
}

# Create Windows Desktop Shortcut
$desktopPath = [System.Environment]::GetFolderPath([System.Environment+SpecialFolder]::Desktop)
$shortcutPath = "$desktopPath\Complaain.lnk"
$wsh = New-Object -ComObject WScript.Shell
$shortcut = $wsh.CreateShortcut($shortcutPath)
$shortcut.TargetPath = $htmlFile
$shortcut.Description = "Complaain — Compliance as an Infrastructure"
$shortcut.Save()

Write-Host "[OK] Desktop Shortcut created: $shortcutPath" -ForegroundColor Green
Write-Host "Launching Complaain..." -ForegroundColor Yellow
Start-Process $htmlFile
