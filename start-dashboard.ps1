# Starts the SU Meal Booking dashboard from the PRODUCTION build (`next start`),
# and opens it in your browser. start-app.ps1 is the dev-server equivalent.
#
# This does NOT build. It runs whatever is already in web/.next, so a launch is
# about a second. After changing the source, rebuild once by hand:
#
#     cd web
#     npm run build
#
# The server runs in this window: closing it (or Ctrl+C) stops the server.

$ErrorActionPreference = "Stop"

$webDir = Join-Path $PSScriptRoot "web"
$port = 3000
$url = "http://localhost:$port"

function Test-DashboardUp {
    # Any HTTP response means an instance is answering. Signed out, / redirects
    # to /login, which -MaximumRedirection 0 surfaces as an error rather than a
    # response object, so treat a response on the exception as "up" too.
    try {
        Invoke-WebRequest -Uri $url -UseBasicParsing -TimeoutSec 2 -MaximumRedirection 0 | Out-Null
        return $true
    } catch {
        return ($null -ne $_.Exception.Response)
    }
}

# Without this, a second double-click would fail with the port already in use.
if (Test-DashboardUp) {
    Write-Host "The dashboard is already running on $url - opening it." -ForegroundColor Green
    Start-Process $url
    Start-Sleep -Seconds 2
    exit 0
}

if (-not (Test-Path (Join-Path $webDir ".next\BUILD_ID"))) {
    Write-Host "No production build found in web\.next." -ForegroundColor Red
    Write-Host ""
    Write-Host "Build it once, then run this again:" -ForegroundColor Yellow
    Write-Host "    cd `"$webDir`"" -ForegroundColor Yellow
    Write-Host "    npm run build" -ForegroundColor Yellow
    Write-Host ""
    Read-Host "Press Enter to close"
    exit 1
}

$builtAt = (Get-Item (Join-Path $webDir ".next\BUILD_ID")).LastWriteTime
Write-Host "Starting the dashboard on $url (build from $($builtAt.ToString('yyyy-MM-dd HH:mm')))..." -ForegroundColor Cyan

# -NoNewWindow so the server's output lands in this window; taskkill /T below
# because npm spawns node as a child and killing the wrapper alone would leave
# the port held.
$server = Start-Process -FilePath "cmd.exe" `
    -ArgumentList "/c", "npm run start -- -p $port" `
    -WorkingDirectory $webDir -NoNewWindow -PassThru

try {
    $deadline = (Get-Date).AddSeconds(60)
    $ready = $false
    while ((Get-Date) -lt $deadline -and -not $server.HasExited) {
        if (Test-DashboardUp) { $ready = $true; break }
        Start-Sleep -Seconds 1
    }

    if ($server.HasExited) {
        Write-Host "The server exited before it came up (see the output above)." -ForegroundColor Red
        Read-Host "Press Enter to close"
        exit 1
    }

    if ($ready) {
        Write-Host "Ready. Opening $url" -ForegroundColor Green
    } else {
        Write-Host "Server hasn't responded yet; opening $url anyway." -ForegroundColor Yellow
    }
    Start-Process $url

    Write-Host ""
    Write-Host "Leave this window open. Close it or press Ctrl+C to stop the server." -ForegroundColor DarkGray
    Wait-Process -Id $server.Id
} finally {
    if (-not $server.HasExited) {
        Write-Host "Stopping the server..." -ForegroundColor DarkGray
        & taskkill.exe /F /T /PID $server.Id 2>&1 | Out-Null
    }
}
