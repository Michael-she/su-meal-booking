# Starts the SU Meal Booking dashboard as a PRODUCTION build (`next start`),
# not the dev server. start-app.ps1 is the dev-server equivalent.
#
# Builds into .next-prod rather than .next (see NEXT_DIST_DIR in
# web/next.config.ts) so this can run while `npm run dev` is up without
# `next build` wiping the dev server's output.
#
# Rebuilds only when there is no build yet, or when a build input is newer
# than the last build, so a normal launch is just a fast `next start`.
#
# The server runs in this window: closing it (or Ctrl+C) stops the server.

$ErrorActionPreference = "Stop"

$webDir = Join-Path $PSScriptRoot "web"
$port = 3000
$url = "http://localhost:$port"

$env:NEXT_DIST_DIR = ".next-prod"
$buildId = Join-Path $webDir "$($env:NEXT_DIST_DIR)\BUILD_ID"

# Any HTTP response on the port means an instance is already up (signed out,
# / redirects to /login, which -MaximumRedirection 0 surfaces as an error).
# Without this, a second double-click would just fail with the port in use.
$alreadyUp = $false
try {
    Invoke-WebRequest -Uri $url -UseBasicParsing -TimeoutSec 2 -MaximumRedirection 0 | Out-Null
    $alreadyUp = $true
} catch {
    if ($_.Exception.Response) { $alreadyUp = $true }
}
if ($alreadyUp) {
    Write-Host "The dashboard is already running on $url - opening it." -ForegroundColor Green
    Start-Process $url
    Start-Sleep -Seconds 2
    exit 0
}

if (-not (Test-Path (Join-Path $webDir "node_modules"))) {
    Write-Host "Installing dependencies (first run only)..." -ForegroundColor Cyan
    Push-Location $webDir
    try { & cmd.exe /c "npm install" } finally { Pop-Location }
}

# Decide whether the existing production build is still usable. Only inputs
# that actually affect the build are considered, so editing .env.local or a
# README doesn't force a needless rebuild.
$needsBuild = $true
if (Test-Path $buildId) {
    $builtAt = (Get-Item $buildId).LastWriteTime

    $inputDirs = @("src", "public") |
        ForEach-Object { Join-Path $webDir $_ } |
        Where-Object { Test-Path -LiteralPath $_ }
    $inputFiles = @("package.json", "next.config.ts", "tsconfig.json", "postcss.config.mjs") |
        ForEach-Object { Join-Path $webDir $_ } |
        Where-Object { Test-Path -LiteralPath $_ }

    # NB: -Recurse must not be used on the file paths. `Get-ChildItem -Path
    # web\package.json -Recurse` recurses web\ looking for anything *named*
    # package.json, which picks up .next\package.json and reports the build's
    # own output as a newer input — a rebuild every single launch.
    $candidates = @()
    if ($inputDirs) {
        $candidates += Get-ChildItem -Path $inputDirs -Recurse -File -Force -ErrorAction SilentlyContinue
    }
    if ($inputFiles) {
        $candidates += Get-Item -LiteralPath $inputFiles -Force -ErrorAction SilentlyContinue
    }

    $newest = $candidates | Sort-Object LastWriteTime -Descending | Select-Object -First 1
    $needsBuild = ($null -ne $newest) -and ($newest.LastWriteTime -gt $builtAt)
    if ($needsBuild) {
        Write-Host "$($newest.Name) changed since the last build; rebuilding..." -ForegroundColor Yellow
    } else {
        Write-Host "Using the existing build from $($builtAt.ToString('yyyy-MM-dd HH:mm'))." -ForegroundColor DarkGray
    }
} else {
    Write-Host "No production build found; building for the first time (this takes a minute)..." -ForegroundColor Yellow
}

if ($needsBuild) {
    Push-Location $webDir
    try {
        & cmd.exe /c "npm run build"
        $buildExit = $LASTEXITCODE
    } finally { Pop-Location }
    if ($buildExit -ne 0) {
        Write-Host ""
        Write-Host "Build failed. Fix the errors above, then run this again." -ForegroundColor Red
        Read-Host "Press Enter to close"
        exit 1
    }
}

Write-Host ""
Write-Host "Starting the dashboard on $url ..." -ForegroundColor Cyan

# -NoNewWindow so the server's output lands in this window; taskkill /T below
# because npm spawns node as a child and killing the wrapper alone would
# leave the port held.
$server = Start-Process -FilePath "cmd.exe" `
    -ArgumentList "/c", "npm run start -- -p $port" `
    -WorkingDirectory $webDir -NoNewWindow -PassThru

try {
    $deadline = (Get-Date).AddSeconds(90)
    $ready = $false
    while ((Get-Date) -lt $deadline -and -not $server.HasExited) {
        try {
            Invoke-WebRequest -Uri $url -UseBasicParsing -TimeoutSec 2 -MaximumRedirection 0 | Out-Null
            $ready = $true
        } catch {
            # Signed out, / redirects to /login, which -MaximumRedirection 0
            # surfaces as an error. Any HTTP response at all means it's up.
            if ($_.Exception.Response) { $ready = $true }
        }
        if ($ready) { break }
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
