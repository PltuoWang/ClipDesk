$ErrorActionPreference = 'Stop'
$toolDir = Join-Path $PSScriptRoot 'tools'
Add-Type -AssemblyName System.IO.Compression.FileSystem
$archive = [IO.Compression.ZipFile]::OpenRead((Join-Path $toolDir 'ffmpeg.zip'))
try {
    foreach ($name in @('ffmpeg.exe','ffprobe.exe')) {
        $entry = $archive.Entries | Where-Object { $_.FullName -match "/bin/$([regex]::Escape($name))$" } | Select-Object -First 1
        if (!$entry) { throw "Missing $name in archive." }
        [IO.Compression.ZipFileExtensions]::ExtractToFile($entry, (Join-Path $toolDir $name), $true)
    }
    $license = $archive.Entries | Where-Object { $_.Name -match '^LICENSE' } | Select-Object -First 1
    if ($license) { [IO.Compression.ZipFileExtensions]::ExtractToFile($license, (Join-Path $toolDir 'FFmpeg-LICENSE.txt'), $true) }
} finally { $archive.Dispose() }
Write-Host 'FFmpeg and ffprobe installed.'
