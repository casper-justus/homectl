#!/usr/bin/env pwsh
# homectl install script for Windows (PowerShell 5.1+ / PowerShell Core)
# Usage: iwr -useb https://raw.githubusercontent.com/casper-justus/homectl/main/install.ps1 | iex

$Repo = "casper-justus/homectl"
$Branch = if ($env:HOMECTL_BRANCH) { $env:HOMECTL_BRANCH } else { "main" }
$TmpDir = "$env:TEMP\homectl-install-$(Get-Random)"

function Write-Step($Label) { Write-Host "`n  $('-' * 50)" -ForegroundColor DarkGray; Write-Host "  $Label" -ForegroundColor Cyan; Write-Host "  $('-' * 50)" -ForegroundColor DarkGray }
function Write-OK($Msg) { Write-Host "  $([char]0x2713) $Msg" -ForegroundColor Green }
function Write-Info($Msg) { Write-Host "  $([char]0x2139) $Msg" -ForegroundColor DarkGray }
function Write-Warn($Msg) { Write-Host "  $([char]0x26A0) $Msg" -ForegroundColor Yellow }
function Write-Fail($Msg) { Write-Host "  $([char]0x2717) $Msg" -ForegroundColor Red; exit 1 }

Write-Host ""
Write-Host "  $('=' * 50)" -ForegroundColor Cyan
Write-Host "  homectl install (Windows)" -ForegroundColor Cyan
Write-Host "  $('=' * 50)" -ForegroundColor Cyan
Write-Host ""

# --- Check for Node.js ---
Write-Step "1/4 — Checking prerequisites"
$node = Get-Command "node" -ErrorAction SilentlyContinue
if ($node) {
  $ver = node --version
  $major = [int]$ver.TrimStart('v').Split('.')[0]
  if ($major -lt 18) { Write-Fail "Node.js >= 18 required, found $ver" }
  Write-OK "Node.js $ver"
} else {
  Write-Warn "Node.js not found."
  Write-Info "Downloading Node.js installer..."

  # Detect architecture
  $arch = if ([Environment]::Is64BitOperatingSystem) { "x64" } else { "x86" }
  $url = "https://nodejs.org/dist/v22.14.0/node-v22.14.0-$arch.msi"
  $msi = "$env:TEMP\node-install.msi"

  try {
    Invoke-WebRequest -Uri $url -OutFile $msi -UseBasicParsing
    Write-OK "Downloaded Node.js installer"
    Start-Process msiexec.exe -Wait -ArgumentList "/i `"$msi`" /quiet /norestart"
    Remove-Item $msi -Force -ErrorAction SilentlyContinue
    # Refresh PATH
    $env:Path = [Environment]::GetEnvironmentVariable("Path", "Machine") + ";" + [Environment]::GetEnvironmentVariable("Path", "User")
    $ver = & "node" --version 2>$null
    if (-not $ver) { Write-Fail "Node.js installation failed. Install manually from https://nodejs.org" }
    Write-OK "Node.js $ver installed"
  } catch {
    Write-Fail "Failed to install Node.js: $_`nInstall manually from https://nodejs.org"
  }
}

# --- Check for git ---
$gitCmd = Get-Command "git" -ErrorAction SilentlyContinue
if (-not $gitCmd) {
  Write-Warn "git not found, trying portable git..."
  $gitPortable = "$env:ProgramFiles\ani-cli-portable\portablegit\bin\git.exe"
  if (Test-Path $gitPortable) {
    $script:GitPath = $gitPortable
    Write-OK "Found portable git at $gitPortable"
  } else {
    Write-Warn "git not found. homectl will still install but updates via git won't work."
    Write-Info "Install git from https://git-scm.com"
  }
} else {
  $script:GitPath = "git"
  Write-OK "git found"
}

# --- Download ---
Write-Step "2/4 — Downloading homectl"
try {
  Remove-Item -Path $TmpDir -Recurse -Force -ErrorAction SilentlyContinue
  New-Item -ItemType Directory -Path $TmpDir -Force | Out-Null

  $zipUrl = "https://github.com/$Repo/archive/refs/heads/$Branch.zip"
  $zipFile = "$TmpDir\repo.zip"
  Write-Info "Downloading $zipUrl ..."
  Invoke-WebRequest -Uri $zipUrl -OutFile $zipFile -UseBasicParsing
  Expand-Archive -Path $zipFile -DestinationPath $TmpDir
  $SrcDir = Get-ChildItem -Path $TmpDir -Directory | Select-Object -First 1 -ExpandProperty FullName
  Write-OK "Downloaded homectl ($Branch)"
} catch {
  Write-Fail "Failed to download: $_"
}

# --- Install & Build ---
Write-Step "3/4 — Installing dependencies & building"
Set-Location -Path $SrcDir
try {
  npm install --no-audit --no-fund 2>&1 | Out-Null
  Write-OK "Dependencies installed"
} catch {
  Write-Fail "npm install failed: $_"
}

try {
  npm run build 2>&1 | Out-Null
  Write-OK "Build complete"
} catch {
  Write-Fail "Build failed: $_"
}

# --- Install globally ---
Write-Step "4/4 — Installing globally"
try {
  npm link 2>&1 | Out-Null
  Write-OK "Global install complete (npm link)"
} catch {
  Write-Warn "npm link failed. Trying alternate method..."
  $distPath = Join-Path $SrcDir "dist"
  $npmPrefix = npm config get prefix 2>$null
  if (-not $npmPrefix) { $npmPrefix = "$env:APPDATA\npm" }
  $targetDir = Join-Path $npmPrefix "node_modules\homectl"
  New-Item -ItemType Directory -Path $targetDir -Force | Out-Null
  Copy-Item -Path "$SrcDir\*" -Destination $targetDir -Recurse -Force
  $binDir = Join-Path $npmPrefix ""
  $cmdPath = Join-Path $binDir "homectl.cmd"
@"
@ECHO off
"%~dp0..\homectl\dist\index.js" %*
"@ | Out-File -FilePath $cmdPath -Encoding ascii
  Write-OK "Global install complete (manual)"
}

# --- Verify ---
$homectlCmd = Get-Command "homectl" -ErrorAction SilentlyContinue
if ($homectlCmd) {
  $hv = & homectl --version 2>&1
  Write-OK "homectl $hv installed!"
} else {
  Write-Warn "homectl not in PATH. Restart your terminal or add npm global bin to PATH."
  Write-Info "  npm prefix: $(npm config get prefix)"
}

# --- Cleanup ---
Set-Location -Path $env:TEMP
Remove-Item -Path $TmpDir -Recurse -Force -ErrorAction SilentlyContinue

Write-Host ""
Write-Host "  $('=' * 50)" -ForegroundColor Cyan
Write-Host "  Setup complete!" -ForegroundColor Cyan
Write-Host "  $('=' * 50)" -ForegroundColor Cyan
Write-Host ""
Write-Host "  Quick start:" -ForegroundColor Green
Write-Host "    homectl init"
Write-Host "    homectl host ls"
Write-Host "    homectl --help"
Write-Host ""
