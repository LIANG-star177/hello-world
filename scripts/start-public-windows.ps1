$ErrorActionPreference = 'Stop'
Set-Location (Split-Path $PSScriptRoot -Parent)
$tunnel = $null
function Refresh-Path {
    $env:Path = [Environment]::GetEnvironmentVariable('Path', 'Machine') + ';' + [Environment]::GetEnvironmentVariable('Path', 'User') + ';' + $env:Path
}
function Install-Package($id) {
    if (-not (Get-Command winget.exe -ErrorAction SilentlyContinue)) { throw "Windows Package Manager is required to install $id automatically. Install it from the provider's official website, then retry." }
    & winget.exe install --id $id --exact --source winget --accept-source-agreements --accept-package-agreements
    if ($LASTEXITCODE -ne 0) { throw "Installation of $id failed. Check the installation output above." }
    Refresh-Path
}
function Random-Text($length) {
    $bytes = New-Object byte[] $length
    $rng = [Security.Cryptography.RandomNumberGenerator]::Create()
    try { $rng.GetBytes($bytes) } finally { $rng.Dispose() }
    return [BitConverter]::ToString($bytes).Replace('-', '').ToLowerInvariant()
}
try {
    Write-Host 'Present - public HTTPS phone testing' -ForegroundColor Cyan
    Write-Host 'Your computer must stay on. This temporary public address can change after restart.'
    Write-Host 'Cloudflare Quick Tunnels are for testing; they are not a permanent hosting service.'
    Refresh-Path
    $node = Get-Command node.exe -ErrorAction SilentlyContinue
    if (-not $node) { Install-Package 'OpenJS.NodeJS.LTS' }
    $nodeDir = Join-Path $env:ProgramFiles 'nodejs'
    if (Test-Path (Join-Path $nodeDir 'node.exe')) { $env:Path = "$nodeDir;$env:Path" }
    $version = & node.exe --version
    if ([int]($version.TrimStart('v').Split('.')[0]) -lt 24) { Install-Package 'OpenJS.NodeJS.LTS'; $version = & node.exe --version }
    if ([int]($version.TrimStart('v').Split('.')[0]) -lt 24) { throw 'Install Node.js 24+ from https://nodejs.org and retry.' }
    if (-not (Get-Command cloudflared.exe -ErrorAction SilentlyContinue)) { Install-Package 'Cloudflare.cloudflared' }
    $cloudflared = Get-Command cloudflared.exe -ErrorAction SilentlyContinue
    if (-not $cloudflared) {
        foreach ($dir in @((Join-Path $env:ProgramFiles 'cloudflared'), (Join-Path ${env:ProgramFiles(x86)} 'cloudflared'))) {
            if (Test-Path (Join-Path $dir 'cloudflared.exe')) { $env:Path = "$dir;$env:Path" }
        }
        $cloudflared = Get-Command cloudflared.exe -ErrorAction SilentlyContinue
    }
    if (-not $cloudflared) { throw 'Cloudflared was installed but is not on PATH. Close this window and reopen the launcher.' }
    $listener = [Net.Sockets.TcpListener]::new([Net.IPAddress]::Loopback, 3000)
    try { $listener.Start() } catch { throw 'Port 3000 is busy. Close the previous attendance server before starting public mode.' } finally { $listener.Stop() }
    Write-Host 'Installing locked dependencies...'
    & npm.cmd ci --include=dev --fetch-retries=5 --fetch-timeout=300000 --no-audit --no-fund
    if ($LASTEXITCODE -ne 0) { throw 'Dependency download failed. Check access to registry.npmjs.org; retry on another network if necessary.' }
    Write-Host 'Building production application...'
    & npm.cmd run build
    if ($LASTEXITCODE -ne 0) { throw 'Production build failed. Check the error above.' }
    if (-not (Test-Path 'data')) { New-Item -ItemType Directory 'data' | Out-Null }
    $settingsPath = Join-Path (Get-Location) 'data\public-settings.json'
    if (Test-Path $settingsPath) { $settings = Get-Content -Raw $settingsPath | ConvertFrom-Json }
    else {
        $settings = @{ authSecret = (Random-Text 32); teacherPassword = (Random-Text 10) }
        $settings | ConvertTo-Json | Set-Content -Encoding UTF8 $settingsPath
    }
    if ($settings.authSecret.Length -lt 32 -or $settings.teacherPassword.Length -lt 12) { throw 'Existing public-settings.json is invalid. Correct it without sharing its secrets.' }
    $env:AUTH_SECRET = $settings.authSecret
    $env:TEACHER_PASSWORD = $settings.teacherPassword
    $env:DATABASE_PATH = Join-Path (Get-Location) 'data\attendance.sqlite'
    $env:PORT = '3000'
    $env:LOCATION_RETENTION_DAYS = '30'
    $env:NODE_ENV = 'production'
    $env:ENABLE_SIMULATION = 'false'
    $log = Join-Path (Get-Location) 'data\public-tunnel.log'
    $outLog = Join-Path (Get-Location) 'data\public-tunnel.stdout.log'
    $tunnel = Start-Process -FilePath $cloudflared.Source -ArgumentList @('tunnel', '--url', 'http://127.0.0.1:3000', '--protocol', 'http2') -PassThru -WindowStyle Hidden -RedirectStandardError $log -RedirectStandardOutput $outLog
    $publicUrl = $null
    for ($i=0; $i -lt 90; $i++) {
        if ($tunnel.HasExited) { throw 'Cloudflare tunnel stopped. See data\public-tunnel.log for the connection error.' }
        if (Test-Path $log) {
            $match = [regex]::Match((Get-Content -Raw $log), 'https://[a-z0-9-]+\.trycloudflare\.com')
            if ($match.Success) { $publicUrl = $match.Value; break }
        }
        Start-Sleep -Seconds 1
    }
    if (-not $publicUrl) { throw 'No public URL was received. Check Cloudflare connectivity and data\public-tunnel.log. Do not disable TLS verification.' }
    $env:PUBLIC_BASE_URL = $publicUrl
    Write-Host ''
    Write-Host "PUBLIC HTTPS ADDRESS: $publicUrl" -ForegroundColor Green
    Write-Host "TEACHER PASSWORD: $($settings.teacherPassword)" -ForegroundColor Yellow
    Write-Host 'Use this HTTPS address on the teacher computer. Students may use mobile data or any Wi-Fi.'
    Write-Host 'Teacher password is saved locally in data\public-settings.json. Do not share this file.'
    Write-Host 'Keep this window open. Closing it stops public access.'
    $openBrowser = "for (`$i=0; `$i -lt 90; `$i++) { try { `$r=Invoke-WebRequest -UseBasicParsing -Uri 'http://localhost:3000/api/health' -TimeoutSec 3; if (`$r.StatusCode -eq 200) { Start-Process '$publicUrl'; exit } } catch {}; Start-Sleep -Seconds 2 }"
    $encoded = [Convert]::ToBase64String([Text.Encoding]::Unicode.GetBytes($openBrowser))
    Start-Process powershell.exe -WindowStyle Hidden -ArgumentList @('-NoProfile', '-EncodedCommand', $encoded)
    & npm.cmd run start:cloud
    if ($LASTEXITCODE -ne 0) { throw 'Application stopped with an error. Check the output above.' }
} catch {
    Write-Host $_.Exception.Message -ForegroundColor Red
    exit 1
} finally {
    if ($tunnel -and -not $tunnel.HasExited) { Stop-Process -Id $tunnel.Id -ErrorAction SilentlyContinue }
}
