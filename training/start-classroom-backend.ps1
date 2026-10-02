param(
    [Parameter(Mandatory=$true)][string]$Evaluation,
    [int]$Port = 8001,
    [string]$Python = "python"
)
$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path $PSScriptRoot -Parent
$report = Get-Content -LiteralPath $Evaluation -Raw | ConvertFrom-Json
$weightsPath = [string]$report.weights
if (-not [IO.Path]::IsPathRooted($weightsPath)) { $weightsPath = Join-Path $projectRoot $weightsPath }
$resolvedWeights = (Resolve-Path -LiteralPath $weightsPath).Path
$hasher = [Security.Cryptography.SHA256]::Create()
try {
    $digest = ([BitConverter]::ToString($hasher.ComputeHash([IO.File]::ReadAllBytes($resolvedWeights)))).Replace('-','').ToLowerInvariant()
} finally { $hasher.Dispose() }
if ($digest -ne $report.weights_sha256) { throw 'Los pesos no coinciden con la evaluación.' }
if ($null -ne $report.mouse_previous) { throw 'Para un perfil combinado use training/serve_backend.py --profile aula; este helper solo inicia un checkpoint.' }
if ($report.imgsz -ne 640 -or $report.nms_iou -ne 0.45) { throw 'Configuración de inferencia incompatible.' }
$settings = @{
    CLASSROOM_MODEL_PATH = $resolvedWeights
    CLASSROOM_MONITOR_CONFIDENCE = ([double]$report.thresholds.'0').ToString([Globalization.CultureInfo]::InvariantCulture)
    CLASSROOM_MOUSE_CONFIDENCE = ([double]$report.thresholds.'1').ToString([Globalization.CultureInfo]::InvariantCulture)
    CLASSROOM_KEYBOARD_CONFIDENCE = $(if ($null -ne $report.thresholds.'2') { ([double]$report.thresholds.'2').ToString([Globalization.CultureInfo]::InvariantCulture) } else { '0.5' })
    CLASSROOM_KEYBOARD_SOFT_NMS_SIGMA = $(if ($null -ne $report.keyboard_soft_nms_sigma) { ([double]$report.keyboard_soft_nms_sigma).ToString([Globalization.CultureInfo]::InvariantCulture) } else { $null })
    MONITOR_MODEL_PATH = $null
    OMP_NUM_THREADS = '2'
    MKL_NUM_THREADS = '2'
}
$previous = @{}
try {
    foreach ($key in $settings.Keys) {
        $previous[$key] = [Environment]::GetEnvironmentVariable($key,'Process')
        [Environment]::SetEnvironmentVariable($key,$settings[$key],'Process')
    }
    Push-Location (Join-Path $projectRoot 'backend')
    try {
        & $Python -m uvicorn main:app --host 127.0.0.1 --port $Port
    } finally { Pop-Location }
} finally {
    foreach ($key in $previous.Keys) { [Environment]::SetEnvironmentVariable($key,$previous[$key],'Process') }
}
