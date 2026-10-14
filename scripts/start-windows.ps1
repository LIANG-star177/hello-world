$ErrorActionPreference = 'Stop'
Set-Location (Split-Path $PSScriptRoot -Parent)
Write-Host 'Present - local classroom attendance setup' -ForegroundColor Cyan
Write-Host 'This starts the application on this Windows computer only.'
function Find-Node {
    $nodeDir = Join-Path $env:ProgramFiles 'nodejs'
    if (Test-Path (Join-Path $nodeDir 'node.exe')) { $env:Path = "$nodeDir;$env:Path" }
    $nodeCommand = Get-Command node.exe -ErrorAction SilentlyContinue
    if (-not $nodeCommand) { return $false }
    $version = & node.exe --version
    return ($LASTEXITCODE -eq 0 -and [int]($version.TrimStart('v').Split('.')[0]) -ge 24)
}
try {
    if (-not (Find-Node)) {
        if (Get-Command winget.exe -ErrorAction SilentlyContinue) {
            Write-Host 'Installing Node.js LTS via Windows Package Manager. Windows may request installation permission.'
            & winget.exe install --id OpenJS.NodeJS.LTS --exact --source winget --accept-source-agreements --accept-package-agreements
            if ($LASTEXITCODE -ne 0) { throw 'Node.js installation did not complete. Install Node.js 24+ from https://nodejs.org, then double-click start-windows.cmd again.' }
        }
        if (-not (Find-Node)) {
            throw 'Node.js 24+ is required. Install the Windows LTS installer from https://nodejs.org, then reopen this launcher.'
        }
    }
    if (-not (Test-Path 'package-lock.json')) { throw 'Extract the entire ZIP before running this launcher.' }
    $listener = [System.Net.Sockets.TcpListener]::new([System.Net.IPAddress]::Loopback, 3000)
    try { $listener.Start() } catch { throw 'Port 3000 is already in use. Close the previous attendance terminal, or the application using that port, and retry.' } finally { $listener.Stop() }
    Write-Host 'Installing project dependencies using the lockfile...'
    & npm.cmd ci
    if ($LASTEXITCODE -ne 0) { throw 'Dependency installation failed. Check the error above and your network connection, then retry.' }
    $env:ENABLE_SIMULATION = 'true'
    Write-Host ''
    Write-Host 'Teacher demo password: teacher-demo (unless you changed .env.local)' -ForegroundColor Green
    Write-Host 'Keep this window open. Press Ctrl+C to stop the application.'
    Write-Host 'After Ready appears, open http://localhost:3000 if the browser does not open automatically.'
    $openBrowser = 'for ($i=0; $i -lt 90; $i++) { try { $r=Invoke-WebRequest -UseBasicParsing -Uri "http://localhost:3000" -TimeoutSec 3; if ($r.StatusCode -eq 200) { Start-Process "http://localhost:3000"; exit } } catch {}; Start-Sleep -Seconds 2 }'
    $encoded = [Convert]::ToBase64String([Text.Encoding]::Unicode.GetBytes($openBrowser))
    Start-Process powershell.exe -WindowStyle Hidden -ArgumentList @('-NoProfile', '-EncodedCommand', $encoded)
    & npm.cmd run dev -- --hostname 127.0.0.1 --port 3000
    if ($LASTEXITCODE -ne 0) { throw 'The server stopped with an error. Check the output above.' }
} catch {
    Write-Host $_.Exception.Message -ForegroundColor Red
    exit 1
}
