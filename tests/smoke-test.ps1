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

  $unauthorizedStatus = 0
  try {
    [void](Invoke-WebRequest -Method Post -Uri "$baseUrl/api/users/test-user/xp" -Body "{}" -ContentType "application/json" -UseBasicParsing -TimeoutSec 5)
  }
  catch {
    if ($null -ne $_.Exception.Response) {
      $unauthorizedStatus = [int]$_.Exception.Response.StatusCode
    }
  }
  if ($unauthorizedStatus -ne 401) {
    throw "XP award endpoint must reject requests without a Firebase ID token."
  }

  $invalidXpStatus = 0
  try {
    [void](Invoke-WebRequest -Method Post -Uri "$baseUrl/api/users/test-user/xp" -Headers @{ Authorization = "Bearer $([string]::new('A', 120))" } -Body '{"actionType":"invalid","actionId":"test"}' -ContentType "application/json" -UseBasicParsing -TimeoutSec 5)
  }
  catch {
    if ($null -ne $_.Exception.Response) {
      $invalidXpStatus = [int]$_.Exception.Response.StatusCode
    }
  }
  if ($invalidXpStatus -ne 400) {
    throw "XP award endpoint must reject unknown action types before calling Firebase."
  }

  foreach ($asset in @("app.js", "route-planner.js", "ride-sharing.js", "profile-xp-bar.js", "gamification.js", "styles.css", "firebase-config.js", "firebase-client.js", "account-panel.js", "account-panel.css", "buttons-ui/buttons-ui.js", "buttons-ui/buttons-ui.css", "event-workflow.js", "locations.json", "database.rules.json")) {

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
  $buttonsScript = Get-Content -LiteralPath (Join-Path $projectRoot "buttons-ui\buttons-ui.js") -Raw -Encoding UTF8
  $rideSharingScript = Get-Content -LiteralPath (Join-Path $projectRoot "ride-sharing.js") -Raw -Encoding UTF8
  $settingsScript = Get-Content -LiteralPath (Join-Path $projectRoot "settings-panel.js") -Raw -Encoding UTF8
  $routeScript = Get-Content -LiteralPath (Join-Path $projectRoot "route-planner.js") -Raw -Encoding UTF8
  $serverScriptContent = Get-Content -LiteralPath $serverScript -Raw -Encoding UTF8
  $xpComponentScript = Get-Content -LiteralPath (Join-Path $projectRoot "profile-xp-bar.js") -Raw -Encoding UTF8
  $gamificationScript = Get-Content -LiteralPath (Join-Path $projectRoot "gamification.js") -Raw -Encoding UTF8
  $workflowScript = Get-Content -LiteralPath (Join-Path $projectRoot "event-workflow.js") -Raw -Encoding UTF8
  $friendsScript = Get-Content -LiteralPath (Join-Path $projectRoot "buttons-ui\buttons-ui.js") -Raw -Encoding UTF8
  $indexHtml = Get-Content -LiteralPath (Join-Path $projectRoot "index.html") -Raw -Encoding UTF8
  $styleSheet = Get-Content -LiteralPath (Join-Path $projectRoot "styles.css") -Raw -Encoding UTF8
  if (-not $appScript.Contains("popup-action") -or
    -not $appScript.Contains("fomo-view-event") -or
    -not $appScript.Contains("createEventTravelActions") -or
    -not $buttonsScript.Contains("fomo-view-event") -or
    -not $buttonsScript.Contains("scrollIntoView") -or
    -not $appScript.Contains("TRANSIT") -or
    -not $rideSharingScript.Contains("toggle.textContent")) {
    throw "Event popups must open the event card and retain route, transit, and ride-booking actions."
  }
  $eventWorkflowScript = Get-Content -LiteralPath (Join-Path $projectRoot "event-workflow.js") -Raw -Encoding UTF8
  if (-not $appScript.Contains("function attendanceCountLabel(event)") -or
    -not $appScript.Contains("event.attendanceLoaded !== true") -or
    -not $appScript.Contains("Number.isSafeInteger(event.attendeesCount)") -or
    -not $appScript.Contains("button.disabled = countUnavailable") -or
    -not $eventWorkflowScript.Contains("attendanceData.has(event.id)") -or
    -not $eventWorkflowScript.Contains("currentEvent.attendanceLoaded = true") -or
    -not $eventWorkflowScript.Contains("currentEvent.attendanceError = error.message")) {
    throw "RSVP counts must wait for the Firebase snapshot and never show an unverified zero."
  }
  if (-not $appScript.Contains("function eventHasEnded(event, now = Date.now())") -or
    -not $appScript.Contains("window.setInterval(pruneExpiredEvents, 30_000)") -or
    -not $appScript.Contains('const markerCount = event.source === "community" ? attendanceCountLabel(event) :') -or
    -not $settingsScript.Contains("window.FomoSetPromotedVisibility?.(settings.showPromoted)") -or
    $settingsScript.Contains("renderEventsWithSettings") -or
    $settingsScript.Contains('<span>${event.votes}</span>')) {
    throw "Event markers must use attendee counts, respect visibility settings, and disappear after their end time."
  }
  if ($appScript -notmatch "function getApiBaseUrl\(\)" -or
    -not $appScript.Contains('fetch(`${window.location.origin}/health`') -or
    $appScript -notmatch 'window\.location\.protocol === "file:"' -or
    $appScript -notmatch 'window\.location\.port !== "5101"' -or
    $appScript -notmatch 'fetch\(apiUrl, options\)' -or
    -not $appScript.Contains("backendul FOMO")) {
    throw "Cererile API trebuie să folosească backendul local din Live Server și aceeași origine din aplicația găzduită."
  }
  if (-not $appScript.Contains('window.location.hostname.endsWith(".github.io")') -or
    -not $appScript.Contains("nominatim.openstreetmap.org/search") -or
    -not $routeScript.Contains("router.project-osrm.org/route/v1/driving/") -or
    -not $routeScript.Contains("context.isGitHubPages()")) {
    throw "GitHub Pages trebuie să poată geocoda plecarea și cere rute publice fără backend local."
  }
  foreach ($requiredGamificationFeature in @(
    "function Add-XpToUser",
    'user_rewards/$UserId',
    "Social Scout",
    "Party Starter",
    "VIP Connector",
    "FOMO Legend",
    "FIREBASE_DATABASE_ADMIN_TOKEN",
    "Get-VerifiedFirebaseUser",
    'event_joined',
    'id="profile-xp-bar"',
    "from-violet-500",
    "to-pink-400",
    "promo_code",
    'profile-xp-bar.js',
    'gamification.js'
  )) {
    $source = if ($requiredGamificationFeature -eq 'id="profile-xp-bar"' -or $requiredGamificationFeature -in @("profile-xp-bar.js", "gamification.js")) { $indexHtml } elseif ($requiredGamificationFeature -in @("Social Scout", "Party Starter", "VIP Connector", "FOMO Legend", "function Add-XpToUser", 'user_rewards/$UserId', "FIREBASE_DATABASE_ADMIN_TOKEN", "Get-VerifiedFirebaseUser", 'event_joined')) { $serverScriptContent } else { $xpComponentScript }
    if (-not $source.Contains($requiredGamificationFeature)) {
      throw "Gamification implementation is missing '$requiredGamificationFeature'."
    }
  }
  if (-not $workflowScript.Contains('awardXp("event_created"') -or
    -not $workflowScript.Contains("createdEvent.key") -or
    -not $friendsScript.Contains('awardXp("friend_connected"') -or
    -not $appScript.Contains('awardXp("event_joined"') -or
    -not $appScript.Contains('eventAttendance/${event.databaseEventId || event.id}') -or
    -not $serverScriptContent.Contains('eventAttendance/$ActionId/$UserId') -or
    -not $gamificationScript.Contains("Authorization:")) {
    throw "XP rewards must be connected to verified event creation, participation, friendship, and authenticated API calls."
  }
  $assistantScript = Get-Content -LiteralPath (Join-Path $projectRoot "ai-assistant.js") -Raw -Encoding UTF8
  if (-not $assistantScript.Contains('window.FomoRouteContext.apiRequest("/api/assistant"')) {
    throw "Asistentul trebuie să folosească aceeași origine API ca ruta și căutarea."
  }
  if (-not $appScript.Contains('L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png"') -or
    -not $appScript.Contains('attribution: ''&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors''') -or
    -not $styleSheet.Contains("--accent: #f49022") -or
    -not $styleSheet.Contains("--paper: #ffffff")) {
    throw "The map must use visible OpenStreetMap raster tiles and match the application palette."
  }
  if ($appScript -notmatch "navigator\.geolocation\.getCurrentPosition" -or
    $appScript -notmatch "Transport public" -or
    $appScript -notmatch "FomoRoutePlanner\.showRoute") {
    throw "Google Maps route actions and location selection must be available."
  }
  $invalidRouteFeatures = [System.Collections.Generic.List[string]]::new()
  foreach ($feature in @(
    @{ text = 'apiRequest("/api/routes"'; source = $routeScript },
    @{ text = "requestHostedRoute(coordinates.origin, coordinates.destination)"; source = $routeScript },
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
    -not $ownerRequestValidation.Contains("'companyName', 'companyType', 'companyCountry', 'companyCui', 'companyTradeRegister', 'companyAddress'") -or
    $ownerRequestRule.'$uid'.'$locationId'.'$other'.'.validate' -ne $false -or
    $null -eq $ownerRequestRule.'$uid'.'$locationId'.userId -or
    $null -eq $ownerRequestRule.'$uid'.'$locationId'.reviewedAt) {
    throw "Regulile cererilor de owner nu permit schema validă sau permit câmpuri nevalidate."
  }

  $userRules = $databaseRules.rules.users.'$uid'
  $rewardRules = $databaseRules.rules.rewards
  $userRewardRules = $databaseRules.rules.user_rewards.'$uid'.'$rewardId'
  $rewardReadRule = $rewardRules.'$rewardId'.'.read'
  $participantRules = $databaseRules.rules.eventAttendance.'$eventId'.'$uid'
  $firebaseClient = Get-Content -LiteralPath (Join-Path $projectRoot "firebase-client.js") -Raw -Encoding UTF8
  $signupScripts = @(
    (Get-Content -LiteralPath (Join-Path $projectRoot "account-panel.js") -Raw -Encoding UTF8),
    (Get-Content -LiteralPath (Join-Path $projectRoot "buttons-ui\buttons-ui.js") -Raw -Encoding UTF8)
  )
  if (-not $userRules.'.validate'.Contains("'xp', 'level', 'rank_title'") -or
    -not $userRules.'.write'.Contains("data.child('xp').val()") -or
    $userRules.'$other'.'.validate' -ne $false -or
    -not $rewardRules.'$rewardId'.'.validate'.Contains("'required_level'") -or
    -not $rewardRules.'.read'.Contains("root.child('admins')") -or
    -not $rewardReadRule.Contains('root.child(''user_rewards'').child(auth.uid).child($rewardId).exists()') -or
    -not $userRewardRules.'.validate'.Contains("root.child('rewards')") -or
    -not $userRewardRules.'.write'.Contains("root.child('admins')") -or
    -not $participantRules.'.write'.Contains("auth.uid == $uid") -or
    -not $participantRules.'.validate'.Contains("newData.isNumber()") -or
    -not $firebaseClient.Contains('rank_title: "FOMO Explorer"') -or
    -not $firebaseClient.Contains("profileRef.transaction") -or
    @($signupScripts | Where-Object { -not $_.Contains('rank_title: "FOMO Explorer"') }).Count -gt 0) {
    throw "Regulile sau profilurile Firebase nu includ schema gamification și migrarea sigură a profilurilor existente."
  }

  $eventPriceValidation = $databaseRules.rules.communityEvents.'$eventId'.ticketPriceCents.'.validate'
  $eventWorkflowScript = Get-Content -LiteralPath (Join-Path $projectRoot "event-workflow.js") -Raw -Encoding UTF8
  if (-not $eventWorkflowScript.Contains('ticketPrice.name = "ticketPrice"') -or
    -not $eventWorkflowScript.Contains("ticketPriceCents: Math.round") -or
    -not $eventWorkflowScript.Contains('endsAt.name = "endsAt"') -or
    -not $eventWorkflowScript.Contains('ticketUrl.name = "ticketUrl"') -or
    -not $eventWorkflowScript.Contains("Evenimentul apare pe hartă cu eticheta") -or
    -not $eventWorkflowScript.Contains('eventAttendance/${event.id}') -or
    -not $eventWorkflowScript.Contains("event.promotionStatus === 'paid'") -and
    -not $eventWorkflowScript.Contains('event.promotionStatus === "paid"') -or
    -not $eventWorkflowScript.Contains('promotionStatus: "requested"') -or
    -not $eventWorkflowScript.Contains('promotionStatus: "paid"') -or
    -not $eventPriceValidation.Contains("% 1 == 0") -or
    -not $eventPriceValidation.Contains("10000000") -or
    -not $databaseRules.rules.communityEvents.'$eventId'.'.write'.Contains("promotionRequestedBy") -or
    -not $databaseRules.rules.communityEvents.'$eventId'.'.write'.Contains("promotedBy")) {
    throw "Promovarea trebuie să folosească solicitare Owner și confirmare de către administrator, iar starea plătită nu poate fi setată de un utilizator."
  }
  $communityEventRules = $databaseRules.rules.communityEvents
  $eventChildRules = $communityEventRules.'$eventId'
  foreach ($eventField in @(
      "title", "category", "description", "locationId", "venue", "city",
      "latitude", "longitude", "startsAt", "startsAtMs", "endsAt", "venueType",
      "status", "submittedBy", "submittedByEmail", "submittedAt",
      "reviewedAt", "reviewedBy", "ticketUrl"
    )) {
    $fieldRules = $eventChildRules.$eventField
    if ($null -eq $fieldRules -or $fieldRules.PSObject.Properties.Name -notcontains ".validate") {
      throw "Câmpul $eventField al evenimentului trebuie să aibă un validator explicit."
    }
  }
  if ($eventChildRules.'$other'.'.validate' -ne $false) {
    throw "Câmpurile necunoscute ale evenimentelor trebuie respinse."
  }
  if (-not $eventWorkflowScript.Contains("Mesaje primite de user-vld") -or
    -not $eventWorkflowScript.Contains('const eventAdminUid = "QM6bRLP4OMZRo6CBNe6JkqClMrf1"') -or
    -not $eventWorkflowScript.Contains('api.db.ref("communityEvents").once("value")') -or
    -not $communityEventRules.'.read'.Contains("auth.uid == 'QM6bRLP4OMZRo6CBNe6JkqClMrf1'") -or
    -not $communityEventRules.'$eventId'.'.read'.Contains("auth.uid == 'QM6bRLP4OMZRo6CBNe6JkqClMrf1'") -or
    -not $communityEventRules.'.read'.Contains("query.equalTo == 'pending'") -or
    -not $communityEventRules.'.read'.Contains("query.orderByChild == 'locationId'") -or
    -not $communityEventRules.'$eventId'.'.read'.Contains("root.child('locations').child(data.child('locationId').val()).child('ownerUid')") -or
    -not $communityEventRules.'$eventId'.'.write'.Contains("root.child('locations').child(data.child('locationId').val()).child('ownerUid').val() == auth.uid") -or
    -not $databaseRules.rules.eventAttendance.'$eventId'.'$uid'.'.write'.Contains("auth.uid == $uid") -or
    -not $databaseRules.rules.eventAttendance.'$eventId'.'$uid'.'.validate'.Contains("newData.isNumber()")) {
    throw "Evenimentele trebuie să fie publice în verificare, iar aprobarea să fie disponibilă doar adminului sau ownerului locației."
  }
  foreach ($categoryFilter in @("socializing", "workshops", "charity", "exhibitions", "sports", "healthcare", "entertainment")) {
    if (-not $indexHtml.Contains("data-category=`"$categoryFilter`"") -or
      -not $eventWorkflowScript.Contains("`"$categoryFilter`"")) {
      throw "Căutarea și formularul trebuie să includă categoria '$categoryFilter'."
    }
  }
  foreach ($filterControl in @('id="event-sort-select"', 'id="venue-type-select"')) {
    if (-not $indexHtml.Contains($filterControl)) {
      throw "Filtrele hărții nu includ '$filterControl'."
    }
  }

  $accountPanelScript = Get-Content -LiteralPath (Join-Path $projectRoot "account-panel.js") -Raw -Encoding UTF8
  $accountPanelStyle = Get-Content -LiteralPath (Join-Path $projectRoot "account-panel.css") -Raw -Encoding UTF8
  foreach ($companyField in @("companyName", "companyType", "companyCountry", "companyCui", "companyTradeRegister", "companyAddress")) {
    if (-not $accountPanelScript.Contains($companyField)) {
      throw "Formularul de owner nu colectează '$companyField'."
    }
  }
  if (-not $accountPanelScript.Contains("adminNoticeBadge") -or
    -not $accountPanelScript.Contains("pendingCount ?") -or
    -not $accountPanelScript.Contains('requests.filter((request) => request.status === "pending")') -or
    -not $accountPanelScript.Contains('ui.adminSection.hidden = state.role !== "admin" || !state.emailVerified') -or
    -not $databaseRules.rules.ownerRequests.'.read'.Contains("root.child('admins').child(auth.uid).val() == true") -or
    -not $accountPanelStyle.Contains(".account-notification-badge")) {
    throw "Administratorii trebuie să primească un badge live pentru solicitările de owner."
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
  foreach ($requiredFriendFeature in @("getUsernameIndexKey", 'usernameIndex/${getUsernameIndexKey(query)}', 'friendRequests/${friendUser.uid}', 'friends/${friendUser.uid}', 'publicProfiles/${user.uid}', 'friends/${friendUser.uid}`)', 'friendRecords = friendsSnapshot.val() || {}', "friendRecordsLoaded = true", "friendRecordsLoaded = false", "if (friendUser && !friendRecordsLoaded)", "emailVerified", "getIdToken(true)", "friendsCount.textContent = String(friends.length)")) {
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
