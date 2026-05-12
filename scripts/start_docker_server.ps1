param(
  [switch]$NoBuild
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

function Write-Step {
  param([string]$Message)
  Write-Host "==> $Message" -ForegroundColor Cyan
}

function Invoke-Checked {
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

function Resolve-PortValue {
  param(
    [string]$RawValue,
    [string]$DefaultPort
  )

  $candidate = ($RawValue -replace "\s+#.*$", "").Trim().Trim('"').Trim("'")
  if ([string]::IsNullOrWhiteSpace($candidate)) {
    return $DefaultPort
  }

  [int]$portNumber = 0
  if (-not [int]::TryParse($candidate, [ref]$portNumber) -or $portNumber -lt 1 -or $portNumber -gt 65535) {
    throw "Invalid OFFICE_SUPPLIES_PORT in .env: $candidate. Use a port from 1 to 65535."
  }

  return $candidate
}

function Get-EnvPort {
  param(
    [string]$EnvPath,
    [string]$DefaultPort = "8000"
  )

  if (-not (Test-Path $EnvPath)) {
    return $DefaultPort
  }

  foreach ($line in Get-Content -Path $EnvPath -Encoding UTF8) {
    if ($line -match "^\s*OFFICE_SUPPLIES_PORT\s*=\s*(.*?)\s*$") {
      return Resolve-PortValue -RawValue $Matches[1] -DefaultPort $DefaultPort
    }
  }

  return $DefaultPort
}

function Get-LanIPv4Addresses {
  $addresses = @()

  try {
    $addresses = Get-NetIPAddress -AddressFamily IPv4 -ErrorAction Stop |
      Where-Object {
        $_.IPAddress -notlike "127.*" -and
        $_.IPAddress -notlike "169.254.*" -and
        $_.InterfaceAlias -notmatch "(?i)loopback|vEthernet|docker|wsl|hyper-v"
      } |
      Select-Object -ExpandProperty IPAddress -Unique
  }
  catch {
    $addresses = @()
  }

  if (-not $addresses) {
    $addresses = [System.Net.Dns]::GetHostAddresses([System.Net.Dns]::GetHostName()) |
      Where-Object {
        $_.AddressFamily -eq [System.Net.Sockets.AddressFamily]::InterNetwork -and
        $_.IPAddressToString -notlike "127.*" -and
        $_.IPAddressToString -notlike "169.254.*"
      } |
      ForEach-Object { $_.IPAddressToString } |
      Select-Object -Unique
  }

  return @($addresses)
}

$projectRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
Set-Location $projectRoot

if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
  throw "Docker is not installed or not in PATH. Install Docker Desktop first."
}

Write-Step "Checking Docker..."
Invoke-Checked -Exe "docker" -CommandArgs @("version") -ErrorMessage "Docker is installed, but the Docker daemon is not running."
Invoke-Checked -Exe "docker" -CommandArgs @("compose", "version") -ErrorMessage "Docker Compose is not available."

$envPath = Join-Path $projectRoot ".env"
$envExamplePath = Join-Path $projectRoot ".env.example"
if (-not (Test-Path $envPath)) {
  if (-not (Test-Path $envExamplePath)) {
    throw "Missing .env.example; cannot create .env."
  }
  Copy-Item -Path $envExamplePath -Destination $envPath
  Write-Step "Created .env from .env.example"
}

$port = Get-EnvPort -EnvPath $envPath
$composeArgs = @("compose", "up", "-d")
if (-not $NoBuild) {
  $composeArgs += "--build"
}

Write-Step "Starting Office Supplies Tracker as a shared web service..."
Invoke-Checked -Exe "docker" -CommandArgs $composeArgs -ErrorMessage "Docker Compose failed to start the service."

$healthUrl = "http://127.0.0.1:$port/api/app/metadata"
Write-Step "Waiting for the service to become ready..."
for ($attempt = 1; $attempt -le 20; $attempt++) {
  try {
    Invoke-WebRequest -UseBasicParsing -Uri $healthUrl -TimeoutSec 2 | Out-Null
    break
  }
  catch {
    if ($attempt -eq 20) {
      Write-Host "Service started, but the health check did not respond yet." -ForegroundColor Yellow
    }
    Start-Sleep -Seconds 2
  }
}

Write-Host ""
Write-Host "Office Supplies Tracker is running." -ForegroundColor Green
Write-Host ""
Write-Host "Windows browser:"
Write-Host "  http://localhost:$port"

$lanAddresses = Get-LanIPv4Addresses
if ($lanAddresses.Count -gt 0) {
  Write-Host ""
  Write-Host "Phone or another computer on the same network:"
  foreach ($address in $lanAddresses) {
    Write-Host "  http://$($address):$port"
  }
}
else {
  Write-Host ""
  Write-Host "No LAN IPv4 address was detected. Run ipconfig and use the active adapter IPv4 address." -ForegroundColor Yellow
}

Write-Host ""
Write-Host "Data directory:"
Write-Host "  $(Join-Path $projectRoot 'office-supplies-state')"
Write-Host ""
Write-Host "Stop service:"
Write-Host "  docker compose down"
