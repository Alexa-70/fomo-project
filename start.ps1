$serverScript = Join-Path $PSScriptRoot "server.ps1"
& powershell.exe -NoProfile -ExecutionPolicy Bypass -File $serverScript
