$ErrorActionPreference = 'Stop'
$candidates = @((Join-Path $PSScriptRoot 'tools\node.exe'), (Join-Path $env:USERPROFILE '.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe'))
$nodeCmd = Get-Command node -ErrorAction SilentlyContinue
if ($nodeCmd) { $candidates = @($nodeCmd.Source) + $candidates }
$runtime = $candidates | Where-Object { Test-Path -LiteralPath $_ } | Select-Object -First 1
if (!$runtime) { throw 'Install Node.js 24 LTS from https://nodejs.org and retry.' }
$env:NODE_USE_ENV_PROXY = '1'
if (!(Test-Path (Join-Path $PSScriptRoot 'tools\yt-dlp.exe')) -or !(Test-Path (Join-Path $PSScriptRoot 'tools\ffmpeg.exe')) -or !(Test-Path (Join-Path $PSScriptRoot 'tools\ffprobe.exe'))) {
    & $runtime (Join-Path $PSScriptRoot 'setup.mjs')
    if ($LASTEXITCODE -ne 0) { throw 'Dependency setup failed. Check network and retry.' }
}
& $runtime (Join-Path $PSScriptRoot 'server.mjs') --open
if ($LASTEXITCODE -ne 0) { throw 'Downloader exited with an error.' }
