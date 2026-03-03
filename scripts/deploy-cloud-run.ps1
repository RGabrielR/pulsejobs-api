param(
  [Parameter(Mandatory=$true)]
  [string]$ProjectId,

  [Parameter(Mandatory=$true)]
  [string]$DatabaseUrl,

  [Parameter(Mandatory=$true)]
  [string]$JwtSecret,

  [string]$Region = "us-central1",
  [string]$Service = "pulsejobs-api",
  [int]$Port = 3001,
  [int]$Cpu = 1,
  [string]$Memory = "512Mi",
  [int]$Timeout = 120,
  [int]$Concurrency = 80,
  [int]$MinInstances = 0,
  [int]$MaxInstances = 1,
  [int]$JwtExpiresIn = 86400,
  [string]$RuntimeServiceAccount = ""
)

$ErrorActionPreference = "Continue"
$PSNativeCommandUseErrorActionPreference = $false

if (-not (Get-Command gcloud.cmd -ErrorAction SilentlyContinue)) {
  throw "gcloud CLI is required."
}

function Invoke-Gcloud {
  param(
    [Parameter(Mandatory = $true)]
    [string[]]$Args
  )

  $escapedArgs = $Args | ForEach-Object {
    if ($_ -match '[\s"]') {
      '"' + ($_ -replace '"', '\"') + '"'
    }
    else {
      $_
    }
  }
  $commandLine = "gcloud " + ($escapedArgs -join " ")

  $stderrFile = [System.IO.Path]::GetTempFileName()
  $output = & cmd.exe /c $commandLine 2> $stderrFile
  $stderrOutput = ""
  if (Test-Path $stderrFile) {
    $stderrOutput = Get-Content -Path $stderrFile -Raw
    Remove-Item -Path $stderrFile -Force
  }

  if ($LASTEXITCODE -ne 0) {
    throw "gcloud failed: gcloud $($Args -join ' ')`n$stderrOutput`n$output"
  }

  return $output
}

Invoke-Gcloud -Args @("config", "set", "project", $ProjectId) | Out-Null

Invoke-Gcloud -Args @(
  "services", "enable",
  "run.googleapis.com",
  "cloudbuild.googleapis.com",
  "artifactregistry.googleapis.com",
  "secretmanager.googleapis.com"
) | Out-Null

$projectNumber = [string]::Join("", (Invoke-Gcloud -Args @("projects", "describe", $ProjectId, "--format=value(projectNumber)")))
$projectNumber = $projectNumber.Trim()
if (-not $RuntimeServiceAccount) {
  $RuntimeServiceAccount = "$projectNumber-compute@developer.gserviceaccount.com"
}

function Set-SecretValue {
  param(
    [string]$Name,
    [string]$Value
  )

  $tempFile = [System.IO.Path]::GetTempFileName()
  Set-Content -Path $tempFile -Value $Value -NoNewline

  & cmd.exe /c "gcloud secrets describe $Name" 1>$null 2>$null
  $exists = $LASTEXITCODE -eq 0

  if ($exists) {
    Invoke-Gcloud -Args @("secrets", "versions", "add", $Name, "--data-file=$tempFile") | Out-Null
  }
  else {
    Invoke-Gcloud -Args @("secrets", "create", $Name, "--data-file=$tempFile") | Out-Null
  }

  Remove-Item -Path $tempFile -Force
}

Set-SecretValue -Name "DATABASE_URL" -Value $DatabaseUrl
Set-SecretValue -Name "JWT_SECRET" -Value $JwtSecret

Invoke-Gcloud -Args @(
  "projects", "add-iam-policy-binding", $ProjectId,
  "--member=serviceAccount:$RuntimeServiceAccount",
  "--role=roles/secretmanager.secretAccessor"
) | Out-Null

Write-Host "Deploying $Service to Cloud Run ($Region)..."
$deployArgs = @(
  "run", "deploy", $Service,
  "--source", ".",
  "--region", $Region,
  "--allow-unauthenticated",
  "--execution-environment", "gen2",
  "--port", "$Port",
  "--cpu", "$Cpu",
  "--memory", $Memory,
  "--timeout", "$Timeout",
  "--concurrency", "$Concurrency",
  "--min-instances", "$MinInstances",
  "--max-instances", "$MaxInstances",
  "--cpu-throttling",
  "--no-cpu-boost",
  "--clear-base-image",
  "--set-env-vars", "NODE_ENV=production,JWT_EXPIRES_IN=$JwtExpiresIn",
  "--set-secrets", "DATABASE_URL=DATABASE_URL:latest,JWT_SECRET=JWT_SECRET:latest",
  "--service-account", $RuntimeServiceAccount
)
Invoke-Gcloud -Args $deployArgs | Out-Null

$serviceUrl = [string]::Join("", (Invoke-Gcloud -Args @("run", "services", "describe", $Service, "--region", $Region, "--format=value(status.url)")))
$serviceUrl = $serviceUrl.Trim()
Write-Host "Done. Service URL: $serviceUrl"
