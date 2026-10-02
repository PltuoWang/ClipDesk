param([switch]$Update)
$ErrorActionPreference = 'Stop'
$candidates = @((Join-Path $PSScriptRoot 'tools\node.exe'), (Join-Path $env:USERPROFILE '.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe'))
$nodeCmd = Get-Command node -ErrorAction SilentlyContinue
if ($nodeCmd) { $candidates = @($nodeCmd.Source) + $candidates }
$runtime = $candidates | Where-Object { Test-Path -LiteralPath $_ } | Select-Object -First 1
if (!$runtime) { throw 'Install Node.js 24 LTS from https://nodejs.org and retry.' }
$env:NODE_USE_ENV_PROXY = '1'
if ($Update) { & $runtime (Join-Path $PSScriptRoot 'setup.mjs') --update } else { & $runtime (Join-Path $PSScriptRoot 'setup.mjs') }
if ($LASTEXITCODE -ne 0) { throw 'Dependency setup failed.' }
