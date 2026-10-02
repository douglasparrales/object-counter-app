param(
    [Parameter(Mandatory=$true)][string]$Weights,
    [double]$Confidence = 0.7,
    [int]$ImageSize = 640,
    [int]$Port = 8001
)
$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path $PSScriptRoot -Parent
$resolvedWeights = (Resolve-Path -LiteralPath $Weights).Path
$previousWeights = $env:MONITOR_MODEL_PATH
$previousConfidence = $env:MONITOR_CONFIDENCE
$previousSize = $env:MONITOR_IMGSZ
try {
    $env:MONITOR_MODEL_PATH = $resolvedWeights
    $env:MONITOR_CONFIDENCE = $Confidence.ToString([Globalization.CultureInfo]::InvariantCulture)
    $env:MONITOR_IMGSZ = "$ImageSize"
    Push-Location (Join-Path $projectRoot 'backend')
    try {
        & (Join-Path $projectRoot 'object-counter-app\yolovenv\Scripts\python.exe') -m uvicorn main:app --host 127.0.0.1 --port $Port
    } finally { Pop-Location }
} finally {
    $env:MONITOR_MODEL_PATH = $previousWeights
    $env:MONITOR_CONFIDENCE = $previousConfidence
    $env:MONITOR_IMGSZ = $previousSize
}
