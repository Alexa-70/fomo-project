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

  foreach ($asset in @("app.js", "route-planner.js", "ride-sharing.js", "styles.css", "firebase-config.js", "firebase-client.js", "account-panel.js", "account-panel.css", "buttons-ui/buttons-ui.js", "buttons-ui/buttons-ui.css", "event-workflow.js", "locations.json", "database.rules.json")) {

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
  $indexHtml = Get-Content -LiteralPath (Join-Path $projectRoot "index.html") -Raw -Encoding UTF8
  $styleSheet = Get-Content -LiteralPath (Join-Path $projectRoot "styles.css") -Raw -Encoding UTF8
  if ($appScript -notmatch "function getApiBaseUrl\(\)" -or
    $appScript -notmatch 'window\.location\.protocol === "file:"' -or
    $appScript -notmatch 'window\.location\.port !== "5101"' -or
    $appScript -notmatch 'fetch\(`\$\{API_BASE_URL\}\$\{path\}`, options\)') {
    throw "Cererile API trebuie să folosească backendul local din Live Server și aceeași origine din aplicația găzduită."
  }
  $assistantScript = Get-Content -LiteralPath (Join-Path $projectRoot "ai-assistant.js") -Raw -Encoding UTF8
  if (-not $assistantScript.Contains('window.FomoRouteContext.apiRequest("/api/assistant"')) {
    throw "Asistentul trebuie să folosească aceeași origine API ca ruta și căutarea."
  }
  if (-not $appScript.Contains("function applyFomoMapTheme()") -or
    -not $appScript.Contains('park: ["fill-color", "#f5d5b8"]') -or
    -not $appScript.Contains('vectorMap.on("style.load", () => requestAnimationFrame(applyFomoMapTheme))') -or
    -not $styleSheet.Contains("--accent: #f49022") -or
    -not $styleSheet.Contains("--paper: #ffffff")) {
    throw "The clean orange theme must style the map parks and match the application palette."
  }
  if ($appScript -notmatch "navigator\.geolocation\.getCurrentPosition" -or
    $appScript -notmatch "Transport public" -or
    $appScript -notmatch "FomoRoutePlanner\.showRoute") {
    throw "Google Maps route actions and location selection must be available."
  }
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
  if (-not $ownerRequestValidation.Contains("newData.hasChildren") -or
    -not $ownerRequestValidation.Contains("newData.child('reviewedAt').isNumber()") -or
    -not $ownerRequestValidation.Contains("newData.child('reviewedBy').isString()") -or
    $ownerRequestRule.'$uid'.'$locationId'.'$other'.'.validate' -ne $false -or
    $null -eq $ownerRequestRule.'$uid'.'$locationId'.userId -or
    $null -eq $ownerRequestRule.'$uid'.'$locationId'.reviewedAt) {
    throw "Regulile cererilor de owner nu permit schema validă sau permit câmpuri nevalidate."
  }

  $usernameIndexRules = $databaseRules.rules.usernameIndex
  $friendRequestRules = $databaseRules.rules.friendRequests
  $friendRules = $databaseRules.rules.friends
  $friendWriteRule = $friendRules.'$uid'.'$friendUid'.'.write'
  if (-not $usernameIndexRules.'$encodedUsernameKey'.'.read'.Contains("email_verified == true") -or
    -not $usernameIndexRules.'$encodedUsernameKey'.'.write'.Contains("newData.child('uid').val() == auth.uid") -or
    -not $usernameIndexRules.'$encodedUsernameKey'.'.validate'.Contains("root.child('publicProfiles')") -or
    -not $friendRequestRules.'$recipientUid'.'$requesterUid'.'.write'.Contains("newData.child('status').val() == 'accepted'") -or
    -not $friendRequestRules.'$recipientUid'.'$requesterUid'.'.write'.Contains("!newData.exists()") -or
    -not $friendRules.'$uid'.'.read'.Contains("auth.uid == $uid") -or
    -not $friendWriteRule.Contains('root.child(''friendRequests'').child($uid).child($friendUid)') -or
    -not $friendWriteRule.Contains('root.child(''friendRequests'').child($friendUid).child($uid)') -or
    -not $friendWriteRule.Contains('auth.uid == $uid || auth.uid == $friendUid')) {
    throw "Regulile Firebase pentru profiluri publice, cereri și prietenii nu permit fluxul sigur așteptat."
  }

  $friendsScript = Get-Content -LiteralPath (Join-Path $projectRoot "buttons-ui\buttons-ui.js") -Raw -Encoding UTF8
  $accountPanelScript = Get-Content -LiteralPath (Join-Path $projectRoot "account-panel.js") -Raw -Encoding UTF8
  foreach ($requiredFriendFeature in @("getUsernameIndexKey", 'usernameIndex/${getUsernameIndexKey(query)}', 'friendRequests/${friendUser.uid}', 'friends/${friendUser.uid}', 'publicProfiles/${user.uid}', 'friends/${friendUser.uid}`)', 'friendRecords = friendsSnapshot.val() || {}', "emailVerified", "getIdToken(true)", "friendsCount.textContent = String(friends.length)")) {
    if (-not $friendsScript.Contains($requiredFriendFeature)) {
      throw "Fluxul de prietenie nu include '$requiredFriendFeature'."
    }
  }
  if (-not $accountPanelScript.Contains('publicProfiles/${credential.user.uid}')) {
    throw "Înregistrarea alternativă nu creează profilul public căutabil."
  }
  if ($friendsScript.Contains("fomo-local-friends-v1")) {
    throw "Lista de prieteni nu trebuie să fie salvată doar local."
  }

  $serverSource = Get-Content -LiteralPath $serverScript -Raw -Encoding UTF8
  $catalogStart = $serverSource.IndexOf("function Get-PublicAssistantCatalog", [System.StringComparison]::Ordinal)
  $catalogEnd = $serverSource.IndexOf("function Get-VoteStore", [System.StringComparison]::Ordinal)
  if ($catalogStart -lt 0 -or $catalogEnd -le $catalogStart) {
    throw "Serverul nu definește citirea catalogului public pentru asistent."
  }
  $catalogFunction = $serverSource.Substring($catalogStart, $catalogEnd - $catalogStart)
  foreach ($requiredSource in @("locations.json", "communityEvents.json", "approvedEvents", "locationId", "category")) {
    if (-not $catalogFunction.Contains($requiredSource)) {
      throw "Contextul public al asistentului nu include '$requiredSource'."
    }
  }
  foreach ($privateField in @("email", "submittedBy", "reviewedBy", "ownerRequests")) {
    if ($catalogFunction -match "\b$privateField\b") {
      throw "Contextul asistentului nu trebuie să selecteze câmpul privat '$privateField'."
    }
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
