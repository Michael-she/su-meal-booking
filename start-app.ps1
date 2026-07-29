$webDir = Join-Path $PSScriptRoot "web"
$url = "http://localhost:3000"

Write-Host "Starting SU Meal Booking dev server in $webDir ..."
Start-Process -FilePath "cmd.exe" -ArgumentList "/k", "npm run dev" -WorkingDirectory $webDir

Write-Host "Waiting for the server to come up..."
$maxWaitSeconds = 90
$elapsed = 0
$ready = $false
while ($elapsed -lt $maxWaitSeconds) {
    try {
        $resp = Invoke-WebRequest -Uri $url -UseBasicParsing -TimeoutSec 2
        if ($resp.StatusCode -eq 200) {
            $ready = $true
            break
        }
    } catch {}
    Start-Sleep -Seconds 2
    $elapsed += 2
}

if ($ready) {
    Write-Host "Server is up, opening browser."
} else {
    Write-Host "Server didn't respond within $maxWaitSeconds seconds; opening browser anyway (it may still be compiling)."
}
Start-Process $url
