# Crux Installer for Windows
# Usage: irm https://raw.githubusercontent.com/elfenlabs/crux/master/get-crux.ps1 | iex

$ErrorActionPreference = 'Stop'

$Repo = "https://github.com/elfenlabs/crux.git"
$CruxHome = Join-Path $env:APPDATA "crux"
$RepoDir  = Join-Path $CruxHome "repository"
$BinDir   = Join-Path $CruxHome "bin"

function Info($msg)    { Write-Host "-> $msg" -ForegroundColor Cyan }
function Success($msg) { Write-Host "[OK] $msg" -ForegroundColor Green }
function Fail($msg)    { Write-Host "[FAIL] $msg" -ForegroundColor Red; exit 1 }

# --- Check git ---
if (-not (Get-Command git -ErrorAction SilentlyContinue)) {
    Fail "git is required but not installed. Please install git first."
}

# --- Install bun if missing ---
if (-not (Get-Command bun -ErrorAction SilentlyContinue)) {
    Info "bun not found - installing..."
    irm bun.sh/install.ps1 | iex

    # Refresh PATH for this session
    $BunBin = Join-Path $env:USERPROFILE ".bun\bin"
    $env:PATH = "$BunBin;$env:PATH"

    if (-not (Get-Command bun -ErrorAction SilentlyContinue)) {
        Fail "Failed to install bun. Please install manually: https://bun.sh"
    }
    Success "bun installed"
} else {
    Success "bun found at $((Get-Command bun).Source)"
}

# --- Clone or update repo ---
if (-not (Test-Path $CruxHome)) {
    New-Item -ItemType Directory -Path $CruxHome -Force | Out-Null
}

if (Test-Path $RepoDir) {
    Info "Updating existing installation..."
    git -C $RepoDir pull --ff-only
    if ($LASTEXITCODE -ne 0) { Fail "Failed to update. Try removing $RepoDir and re-running." }
} else {
    Info "Cloning crux to $RepoDir..."
    git clone $Repo $RepoDir
    if ($LASTEXITCODE -ne 0) { Fail "Failed to clone repository." }
}

# --- Install dependencies ---
Info "Installing dependencies..."
Push-Location $RepoDir
try {
    bun install
    if ($LASTEXITCODE -ne 0) { Fail "Failed to install dependencies." }
} finally {
    Pop-Location
}

# --- Create global command ---
Info "Installing crux command to $BinDir..."

if (-not (Test-Path $BinDir)) {
    New-Item -ItemType Directory -Path $BinDir -Force | Out-Null
}

$WrapperContent = "@echo off`r`nbun run `"$RepoDir\src\index.ts`" %*"
Set-Content -Path (Join-Path $BinDir "crux.cmd") -Value $WrapperContent -Encoding ASCII

# Add to user PATH if not already present
$UserPath = [Environment]::GetEnvironmentVariable("Path", "User")
if ($UserPath -notlike "*$BinDir*") {
    [Environment]::SetEnvironmentVariable("Path", "$BinDir;$UserPath", "User")
    $env:PATH = "$BinDir;$env:PATH"
    Success "Added $BinDir to user PATH"
} else {
    Success "PATH already contains $BinDir"
}

# --- Set up default config ---
$ConfigFile = Join-Path $CruxHome "config.yaml"

if (-not (Test-Path $ConfigFile)) {
    $ConfigContent = @"
model:
  provider: openai
  base_url: https://api.openai.com
  model: gpt-4o
  api_key_env: OPENAI_API_KEY
  temperature: 0.3

agent:
  max_steps: 50
"@
    Set-Content -Path $ConfigFile -Value $ConfigContent -Encoding UTF8
    Success "Config created at $ConfigFile"
    Info "Edit it to set your provider, model, and API key env var."
} else {
    Success "Config already exists at $ConfigFile"
}

# --- Done ---
Write-Host ""
Success "crux installed successfully!"
Write-Host ""
Write-Host "  Open a new terminal and run 'crux' to get started."
Write-Host ""
