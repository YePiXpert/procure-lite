param(
  [switch]$ReinstallVenv,
  [switch]$SkipExeBuild,
  [string]$AppVersion,
  [string]$IsccPath
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

function Write-Step {
  param([string]$Message)
  Write-Host "==> $Message" -ForegroundColor Cyan
}

function Add-CandidatePath {
  param(
    [System.Collections.Generic.List[string]]$Candidates,
    [string]$PathValue
  )
  if ([string]::IsNullOrWhiteSpace($PathValue)) {
    return
  }
  $trimmed = $PathValue.Trim().Trim('"')
  if (-not [string]::IsNullOrWhiteSpace($trimmed)) {
    $Candidates.Add($trimmed)
  }
}

function Resolve-Iscc {
  param([string]$ManualPath)

  $candidates = New-Object 'System.Collections.Generic.List[string]'
  Add-CandidatePath -Candidates $candidates -PathValue $ManualPath
  Add-CandidatePath -Candidates $candidates -PathValue $env:ISCC_PATH

  $fromPath = Get-Command "iscc.exe" -ErrorAction SilentlyContinue
  if ($fromPath -and $fromPath.Source) {
    Add-CandidatePath -Candidates $candidates -PathValue $fromPath.Source
  }

  $appPathsRegistry = @(
    "HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\App Paths\ISCC.exe",
    "HKCU:\SOFTWARE\Microsoft\Windows\CurrentVersion\App Paths\ISCC.exe"
  )
  foreach ($registryPath in $appPathsRegistry) {
    try {
      $item = Get-Item -Path $registryPath -ErrorAction Stop
      $defaultValue = $item.GetValue("")
      Add-CandidatePath -Candidates $candidates -PathValue $defaultValue
    } catch {
    }
  }

  $uninstallRegistry = @(
    "HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall\Inno Setup 6_is1",
    "HKLM:\SOFTWARE\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall\Inno Setup 6_is1",
    "HKCU:\SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall\Inno Setup 6_is1"
  )
  foreach ($registryPath in $uninstallRegistry) {
    try {
      $props = Get-ItemProperty -Path $registryPath -ErrorAction Stop
      $installLocation = $props.InstallLocation
      if (-not [string]::IsNullOrWhiteSpace($installLocation)) {
        Add-CandidatePath -Candidates $candidates -PathValue (Join-Path $installLocation "ISCC.exe")
      }
    } catch {
    }
  }

  if (${env:ProgramFiles(x86)}) {
    Add-CandidatePath -Candidates $candidates -PathValue (Join-Path ${env:ProgramFiles(x86)} "Inno Setup 6\ISCC.exe")
  }
  if ($env:ProgramFiles) {
    Add-CandidatePath -Candidates $candidates -PathValue (Join-Path $env:ProgramFiles "Inno Setup 6\ISCC.exe")
  }
  if ($env:LOCALAPPDATA) {
    Add-CandidatePath -Candidates $candidates -PathValue (Join-Path $env:LOCALAPPDATA "Programs\Inno Setup 6\ISCC.exe")
  }

  $checked = New-Object 'System.Collections.Generic.List[string]'
  $seen = @{}
  foreach ($candidate in $candidates) {
    if ([string]::IsNullOrWhiteSpace($candidate)) {
      continue
    }
    $normalized = $candidate.Trim()
    if ($seen.ContainsKey($normalized)) {
      continue
    }
    $seen[$normalized] = $true
    $checked.Add($normalized)
    if (Test-Path $normalized) {
      return (Resolve-Path $normalized).Path
    }
  }

  $checkedText = ($checked | ForEach-Object { " - $_" }) -join [Environment]::NewLine
  if ([string]::IsNullOrWhiteSpace($checkedText)) {
    $checkedText = " - (no candidate path found)"
  }

  throw @"
ISCC.exe not found.
Install Inno Setup 6 first (e.g. winget install JRSoftware.InnoSetup).
You can also pass -IsccPath "C:\Path\To\ISCC.exe".
Checked paths:
$checkedText
"@
}

function Invoke-AndCheck {
  param(
    [string]$Exe,
    [string[]]$CommandArgs,
    [string]$ErrorMessage
  )
  & $Exe @CommandArgs
  if ($LASTEXITCODE -ne 0) {
    throw $ErrorMessage
  }
}

$projectRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
Set-Location $projectRoot
$logDir = Join-Path $projectRoot "build_logs"
if (-not (Test-Path $logDir)) {
  New-Item -ItemType Directory -Path $logDir | Out-Null
}
$logPath = Join-Path $logDir ("build_windows_installer_{0}.log" -f (Get-Date -Format "yyyyMMdd_HHmmss"))
Start-Transcript -Path $logPath -Force | Out-Null

$buildScript = Join-Path $PSScriptRoot "build_windows.ps1"
$issScript = Join-Path $projectRoot "installer\OfficeSuppliesTracker.iss"
$distExe = Join-Path $projectRoot "dist\OfficeSuppliesTracker\OfficeSuppliesTracker.exe"

if (-not (Test-Path $buildScript)) {
  throw "Missing script: $buildScript"
}
if (-not (Test-Path $issScript)) {
  throw "Missing installer definition: $issScript"
}

if ([string]::IsNullOrWhiteSpace($AppVersion)) {
  $AppVersion = Get-Date -Format "yyyy.MM.dd"
}

try {
  if (-not $SkipExeBuild) {
    Write-Step "Building desktop executable..."
    $buildArgs = @()
    if ($ReinstallVenv) {
      $buildArgs += "-ReinstallVenv"
    }
    & $buildScript @buildArgs
    if ($LASTEXITCODE -ne 0) {
      throw "Desktop build failed."
    }
  } else {
    Write-Step "Skipping desktop executable build (using existing dist output)..."
  }

  if (-not (Test-Path $distExe)) {
    throw "Desktop executable not found: $distExe"
  }

  $mobileLauncher = Join-Path $projectRoot "scripts\start_mobile_access.bat"
  $distDir = Split-Path -Parent $distExe
  if (Test-Path $mobileLauncher) {
    Copy-Item -Path $mobileLauncher -Destination (Join-Path $distDir "StartMobileAccess.bat") -Force
  }

  Write-Step "Locating Inno Setup compiler..."
  $iscc = Resolve-Iscc -ManualPath $IsccPath
  Write-Host "ISCC: $iscc"

  Write-Step "Building installer package..."
  Invoke-AndCheck `
    -Exe $iscc `
    -CommandArgs @("/DMyAppVersion=$AppVersion", $issScript) `
    -ErrorMessage "Inno Setup build failed."

  $outputDir = Join-Path $projectRoot "dist-installer"
  $setupPath = Join-Path $outputDir "OfficeSuppliesTracker-Setup-$AppVersion.exe"
  if (-not (Test-Path $setupPath)) {
    throw "Installer build finished but setup file not found: $setupPath"
  }

  Write-Host ""
  Write-Host "Installer build success." -ForegroundColor Green
  Write-Host "SETUP: $setupPath"
  Write-Host "Log: $logPath"
  exit 0
}
catch {
  Write-Host ""
  Write-Host "[ERROR] $($_.Exception.Message)" -ForegroundColor Red
  Write-Host "Log: $logPath"
  exit 1
}
finally {
  Stop-Transcript | Out-Null
}
