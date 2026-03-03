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
  [string]$Memory = "1Gi",
  [int]$Timeout = 900,
  [int]$Concurrency = 10,
  [int]$MinInstances = 0,
  [int]$MaxInstances = 3,
  [int]$JwtExpiresIn = 86400
)

$ErrorActionPreference = "Stop"

if (-not (Get-Command gcloud -ErrorAction SilentlyContinue)) {
  throw "gcloud CLI is required."
}

gcloud config set project $ProjectId | Out-Null

gcloud services enable `
  run.googleapis.com `
  cloudbuild.googleapis.com `
  artifactregistry.googleapis.com `
  secretmanager.googleapis.com | Out-Null

function Set-SecretValue {
  param(
    [string]$Name,
    [string]$Value
  )

  $exists = $true
  try {
    gcloud secrets describe $Name | Out-Null
  }
  catch {
    $exists = $false
  }

  if ($exists) {
    $Value | gcloud secrets versions add $Name --data-file=- | Out-Null
  }
  else {
    $Value | gcloud secrets create $Name --data-file=- | Out-Null
  }
}

Set-SecretValue -Name "DATABASE_URL" -Value $DatabaseUrl
Set-SecretValue -Name "JWT_SECRET" -Value $JwtSecret

Write-Host "Deploying $Service to Cloud Run ($Region)..."
gcloud run deploy $Service `
  --source . `
  --region $Region `
  --allow-unauthenticated `
  --execution-environment gen2 `
  --port $Port `
  --cpu $Cpu `
  --memory $Memory `
  --timeout $Timeout `
  --concurrency $Concurrency `
  --min-instances $MinInstances `
  --max-instances $MaxInstances `
  --no-cpu-throttling `
  --set-env-vars "NODE_ENV=production,PORT=$Port,JWT_EXPIRES_IN=$JwtExpiresIn" `
  --set-secrets "DATABASE_URL=DATABASE_URL:latest,JWT_SECRET=JWT_SECRET:latest" `
  --command npm `
  --args run,start:prod

$serviceUrl = gcloud run services describe $Service --region $Region --format "value(status.url)"
Write-Host "Done. Service URL: $serviceUrl"