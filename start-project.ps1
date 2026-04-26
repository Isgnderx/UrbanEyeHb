$ErrorActionPreference = 'Stop'

$rootPath = Split-Path -Parent $MyInvocation.MyCommand.Path
$backendPath = Join-Path $rootPath 'backend'
$frontPath = Join-Path $rootPath 'Front'
$pythonExe = 'C:/Users/loq/AppData/Local/Microsoft/WindowsApps/python3.13.exe'

if (-not (Test-Path (Join-Path $backendPath 'run.py'))) {
    throw "Backend entry file not found: $backendPath\\run.py"
}

if (-not (Test-Path (Join-Path $frontPath 'index.html'))) {
    throw "Frontend entry file not found: $frontPath\\index.html"
}

Start-Process powershell -ArgumentList @(
    '-NoExit',
    '-Command',
    "Set-Location '$backendPath'; & '$pythonExe' run.py"
)

Start-Process powershell -ArgumentList @(
    '-NoExit',
    '-Command',
    "& '$pythonExe' -m http.server 5500 --directory '$frontPath'"
)

Write-Host 'Project started.'
Write-Host 'Backend:  http://localhost:8000/health'
Write-Host 'Frontend: http://localhost:5500/index.html'
