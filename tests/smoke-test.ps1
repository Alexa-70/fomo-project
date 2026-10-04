$ErrorActionPreference = "Stop"

$projectRoot = Split-Path -Parent $PSScriptRoot
$serverScript = Join-Path $projectRoot "server.ps1"
$portListener = [System.Net.Sockets.TcpListener]::new([System.Net.IPAddress]::Loopback, 0)
$portListener.Start()
$port = $portListener.LocalEndpoint.Port
$portListener.Stop()

$logId = [Guid]::NewGuid().ToString("N")
$stdoutPath = Join-Path $env:TEMP "fomo-smoke-$logId.out.log"
$stderrPath = Join-Path $env:TEMP "fomo-smoke-$logId.err.log"
$serverProcess = $null

try {
  $arguments = @(
    "-NoProfile",
    "-ExecutionPolicy", "Bypass",
    "-File", "`"$serverScript`"",
    "-Port", "$port"
  )
  $serverProcess = Start-Process `
    -FilePath "powershell.exe" `
    -ArgumentList $arguments `
    -WorkingDirectory $projectRoot `
    -RedirectStandardOutput $stdoutPath `
    -RedirectStandardError $stderrPath `
    -WindowStyle Hidden `
    -PassThru

  $baseUrl = "http://localhost:$port"
  $deadline = [DateTime]::UtcNow.AddSeconds(15)
  $health = $null
  while ([DateTime]::UtcNow -lt $deadline) {
    if ($serverProcess.HasExited) {
      break
    }

    try {
      $health = Invoke-RestMethod -Uri "$baseUrl/health" -TimeoutSec 2
      break
    }
    catch {
      Start-Sleep -Milliseconds 300
    }
  }

  if ($null -eq $health) {
    $details = @()
    if (Test-Path -LiteralPath $stdoutPath) {
      $details += Get-Content -LiteralPath $stdoutPath -Raw
    }
    if (Test-Path -LiteralPath $stderrPath) {
      $details += Get-Content -LiteralPath $stderrPath -Raw
    }
    throw "Backendul nu a pornit în 15 secunde. $($details -join "`n")"
  }

  if ($health.status -ne "ok") {
    throw "Endpointul /health a întors un status neașteptat."
  }

  foreach ($asset in @("app.js", "route-planner.js", "ride-sharing.js", "styles.css", "firebase-config.js", "firebase-client.js", "account-panel.js", "account-panel.css", "event-workflow.js", "locations.json", "database.rules.json")) {
    $assetResponse = Invoke-WebRequest -Uri "$baseUrl/$asset" -UseBasicParsing -TimeoutSec 5
    if ($assetResponse.StatusCode -ne 200) {
      throw "Resursa statică '$asset' nu a fost servită cu statusul 200."
    }
  }

  $assistantScript = Get-Content -LiteralPath (Join-Path $projectRoot "ai-assistant.js") -Raw -Encoding UTF8
  $assistantStyle = Get-Content -LiteralPath (Join-Path $projectRoot "ai-assistant.css") -Raw -Encoding UTF8
  if ($assistantScript -notmatch "pointerdown" -or
    $assistantScript -notmatch "pointermove" -or
    $assistantScript -notmatch "fomo-assistant-position-v1" -or
    $assistantScript -notmatch "ArrowLeft" -or
    $assistantStyle -notmatch "touch-action:\s*none") {
    throw "The assistant launcher must support pointer dragging, persisted positioning, and keyboard movement."
  }

  $appScript = Get-Content -LiteralPath (Join-Path $projectRoot "app.js") -Raw -Encoding UTF8
  $routeScript = Get-Content -LiteralPath (Join-Path $projectRoot "route-planner.js") -Raw -Encoding UTF8
  if ($appScript -match "http://localhost:5101" -or $appScript -notmatch "fetch\(path, options\)") {
    throw "Cererea API trebuie să folosească aceeași origine ca interfața."
  }
  if ($appScript -notmatch "navigator\.geolocation\.getCurrentPosition" -or
    $appScript -notmatch "Transport public" -or
    $appScript -notmatch "FomoRoutePlanner\.showRoute") {
    throw "Google Maps route actions and location selection must be available."
  }
  $indexHtml = Get-Content -LiteralPath (Join-Path $projectRoot "index.html") -Raw -Encoding UTF8
  $styleSheet = Get-Content -LiteralPath (Join-Path $projectRoot "styles.css") -Raw -Encoding UTF8
  $invalidRouteFeatures = [System.Collections.Generic.List[string]]::new()
  foreach ($feature in @(
    @{ text = 'apiRequest("/api/routes"'; source = $routeScript },
    @{ text = "L.geoJSON(route.geometry"; source = $routeScript },
    @{ text = "function cancelRoute()"; source = $routeScript },
    @{ text = 'travelmode: "transit"'; source = $routeScript },
    @{ text = "www.google.com/maps/dir/"; source = $routeScript },
    @{ text = 'id="cancel-route-button"'; source = $indexHtml },
    @{ text = ".map-route-cancel"; source = $styleSheet }
  )) {
    if (-not $feature.source.Contains($feature.text)) {
      $invalidRouteFeatures.Add("Missing $($feature.text)")
    }
  }
  if ($routeScript.Contains("renderRouteDetails") -or
    $routeScript.Contains("routeDetails") -or
    $indexHtml.Contains('id="route-details"') -or
    $styleSheet.Contains(".route-details")) {
    $invalidRouteFeatures.Add("Old route detail panel is still present")
  }
  if ($invalidRouteFeatures.Count -gt 0) {
    throw "Driving route UI validation failed: $($invalidRouteFeatures -join '; ')"
  }
  if ((Get-Content -LiteralPath (Join-Path $projectRoot "ai-assistant.js") -Raw -Encoding UTF8) -match 'FomoRoutePlanner\.showRoute') {
    throw "Asking the assistant about a route must not trigger navigation automatically."
  }
  $rideScript = Get-Content -LiteralPath (Join-Path $projectRoot "ride-sharing.js") -Raw -Encoding UTF8
  $missingUberFeatures = @(
    "https://m.uber.com/looking",
    'params.set("drop[0]"',
    "window.open(uberUrl"
  ) | Where-Object { -not $rideScript.Contains($_) }
  if (-not $appScript.Contains("FomoRideSharing.createActions") -or $missingUberFeatures.Count -gt 0) {
    throw "Rideshare actions must open Uber with the selected destination."
  }
  if ($rideScript.IndexOf("boltButton.disabled = true", [StringComparison]::Ordinal) -lt 0 -or
    $rideScript.IndexOf("ride-sharing-note", [StringComparison]::Ordinal) -lt 0) {
    throw "Unverified Bolt booking must remain disabled and explain the integration limitation."
  }

  $databaseRules = Get-Content -LiteralPath (Join-Path $projectRoot "database.rules.json") -Raw -Encoding UTF8 | ConvertFrom-Json
  $ownerRequestRule = $databaseRules.rules.ownerRequests
  $ownerRequestValidation = $ownerRequestRule.'$uid'.'$locationId'.'.validate'
  if ($ownerRequestValidation -notmatch "newData\.numChildren\(\) == 8" -or
    $ownerRequestValidation -notmatch "newData\.numChildren\(\) == 10" -or
    $null -ne $ownerRequestRule.'$uid'.'$locationId'.'$other') {
    throw "Regulile cererilor de owner nu permit schema validă sau permit câmpuri nevalidate."
  }

  $locations = ConvertFrom-Json -InputObject (Get-Content -LiteralPath (Join-Path $projectRoot "locations.json") -Raw -Encoding UTF8)
  if ($locations.Count -ne 90) {
    throw "Catalogul trebuie să conțină 90 de locații."
  }
  $cityGroups = @($locations | Group-Object -Property city)
  if ($cityGroups.Count -ne 9) {
    throw "Catalogul trebuie să conțină exact 9 orașe."
  }
  foreach ($cityGroup in $cityGroups) {
    if ($cityGroup.Count -ne 10) {
      throw "Orașul '$($cityGroup.Name)' trebuie să aibă exact 10 locații, nu $($cityGroup.Count)."
    }
  }

  $response = Invoke-RestMethod -Uri "$baseUrl/api/events" -TimeoutSec 5
  $eventResults = @($response.events)
  $requiredFields = @(
    "id", "title", "category", "description", "venue",
    "startsAt", "latitude", "longitude", "tier", "votes", "votedByMe"
  )
  foreach ($eventItem in $eventResults) {
    foreach ($field in $requiredFields) {
      if ($null -eq $eventItem.PSObject.Properties[$field]) {
        throw "Evenimentul '$($eventItem.id)' nu conține câmpul obligatoriu '$field'."
      }
    }
  }

  Write-Output "Smoke test passed: API, Firebase assets, empty demo event catalog and 90 seeded locations are valid."
}
finally {
  if ($null -ne $serverProcess -and -not $serverProcess.HasExited) {
    Stop-Process -Id $serverProcess.Id
    $serverProcess.WaitForExit()
  }
  if (Test-Path -LiteralPath $stdoutPath) {
    Remove-Item -LiteralPath $stdoutPath
  }
  if (Test-Path -LiteralPath $stderrPath) {
    Remove-Item -LiteralPath $stderrPath
  }
}
