param([switch]$Build)
$ErrorActionPreference = 'Stop'
Set-Location -LiteralPath $PSScriptRoot
$nodeCommand = Get-Command node.exe -ErrorAction SilentlyContinue
$nodeExe = if ($nodeCommand) { $nodeCommand.Source } else { $null }

# A normal Node installation works on any machine. This optional fallback
# reuses the existing E-drive Codex runtime on this development computer.
if (-not $nodeExe) {
  $cursor = Get-Item -LiteralPath $PSScriptRoot
  while ($null -ne $cursor -and -not $nodeExe) {
    $candidate = Join-Path $cursor.FullName 'ChatGPT\CodexData\RuntimeCache\codex-primary-runtime\dependencies\node\bin\node.exe'
    if (Test-Path -LiteralPath $candidate) { $nodeExe = $candidate }
    $cursor = $cursor.Parent
  }
}
if (-not $nodeExe) { throw 'Node.js was not found. Install Node.js 24 LTS, reopen PowerShell, and try again.' }
$env:PATH = (Split-Path -Parent $nodeExe) + ';' + $env:PATH

if (-not (Test-Path -LiteralPath (Join-Path $PSScriptRoot 'node_modules\vite\bin\vite.js'))) {
  Write-Host 'Installing the locked dependencies. The first run needs internet.'
  $bundledPnpm = [System.IO.Path]::GetFullPath((Join-Path (Split-Path -Parent $nodeExe) '..\node_modules\pnpm\bin\pnpm.cjs'))
  $storePath = Join-Path $PSScriptRoot '.pnpm-store'
  $pnpmCommand = Get-Command pnpm.cmd -ErrorAction SilentlyContinue
  if ($pnpmCommand) {
    & $pnpmCommand.Source install --frozen-lockfile --store-dir $storePath
  } elseif (Test-Path -LiteralPath $bundledPnpm) {
    & $nodeExe $bundledPnpm install --frozen-lockfile --store-dir $storePath
  } else {
    $npxCommand = Get-Command npx.cmd -ErrorAction SilentlyContinue
    if (-not $npxCommand) { throw 'pnpm or npx was not found. Run pnpm install --frozen-lockfile after installing Node.js.' }
    & $npxCommand.Source --yes pnpm@11.25.0 install --frozen-lockfile --store-dir $storePath
  }
  if ($LASTEXITCODE -ne 0) { throw 'Dependency installation failed; the game has not started.' }
}
$vite = Join-Path $PSScriptRoot 'node_modules\vite\bin\vite.js'
if ($Build) {
  & $nodeExe $vite build
} else {
  Write-Host 'Museum Heist: http://127.0.0.1:5173/'
  Write-Host 'Leave this terminal open. Press Ctrl+C to stop.'
  & $nodeExe $vite --host 127.0.0.1 --port 5173 --strictPort
}
exit $LASTEXITCODE
