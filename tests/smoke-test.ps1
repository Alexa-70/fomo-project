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

  foreach ($asset in @("app.js", "route-planner.js", "ride-sharing.js", "styles.css", "firebase-config.js", "firebase-client.js", "account-panel.js", "account-panel.css", "buttons-ui/buttons-ui.js", "buttons-ui/buttons-ui.css", "event-workflow.js", "promotion-payment.html", "promotion-payment.css", "promotion-payment.js", "ai-assistant.js", "assistant-config.js", "cloudflare/assistant-worker.js", "locations.json", "database.rules.json")) {

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
  $sharedAssistantConfig = Get-Content -LiteralPath (Join-Path $projectRoot "assistant-config.js") -Raw -Encoding UTF8
  $assistantWorker = Get-Content -LiteralPath (Join-Path $projectRoot "cloudflare\assistant-worker.js") -Raw -Encoding UTF8
  $wranglerConfig = Get-Content -LiteralPath (Join-Path $projectRoot "cloudflare\wrangler.toml") -Raw -Encoding UTF8
  if (-not $sharedAssistantConfig.Contains("FOMO_ASSISTANT_API_URL") -or
    -not $assistantScript.Contains("window.FOMO_ASSISTANT_API_URL") -or
    -not $assistantScript.Contains("response.ok") -or
    -not $assistantWorker.Contains("GROQ_API_KEY") -or
    -not $assistantWorker.Contains("api.groq.com/openai/v1/chat/completions") -or
    -not $assistantWorker.Contains("CF-Connecting-IP") -or
    -not $assistantWorker.Contains("RATE_LIMIT_MAX_REQUESTS") -or
    -not $assistantWorker.Contains("Access-Control-Allow-Origin") -or
    -not $wranglerConfig.Contains('GROQ_MODEL = "openai/gpt-oss-120b"') -or
    $assistantWorker -match "gsk_[A-Za-z0-9]{20,}") {
    throw "The shared Groq Worker must keep its key server-side and expose the configured shared assistant endpoint."
  }
  $appScript = Get-Content -LiteralPath (Join-Path $projectRoot "app.js") -Raw -Encoding UTF8
  $buttonsScript = Get-Content -LiteralPath (Join-Path $projectRoot "buttons-ui\buttons-ui.js") -Raw -Encoding UTF8
  $rideSharingScript = Get-Content -LiteralPath (Join-Path $projectRoot "ride-sharing.js") -Raw -Encoding UTF8
  $settingsScript = Get-Content -LiteralPath (Join-Path $projectRoot "settings-panel.js") -Raw -Encoding UTF8
  $routeScript = Get-Content -LiteralPath (Join-Path $projectRoot "route-planner.js") -Raw -Encoding UTF8
  $indexHtml = Get-Content -LiteralPath (Join-Path $projectRoot "index.html") -Raw -Encoding UTF8
  if ([regex]::Matches($indexHtml, '<script src="\./assistant-config\.js\?v=shared-groq-worker-v1"').Count -ne 1 -or
    [regex]::Matches($indexHtml, '<script src="\./ai-assistant\.js\?v=shared-groq-worker-v1"').Count -ne 1 -or
    $indexHtml.IndexOf('assistant-config.js?v=shared-groq-worker-v1', [StringComparison]::Ordinal) -gt $indexHtml.IndexOf('ai-assistant.js?v=shared-groq-worker-v1', [StringComparison]::Ordinal)) {
    throw "The shared assistant endpoint configuration must load before the assistant client."
  }
  $styleSheet = Get-Content -LiteralPath (Join-Path $projectRoot "styles.css") -Raw -Encoding UTF8
  $buttonsStyle = Get-Content -LiteralPath (Join-Path $projectRoot "buttons-ui\buttons-ui.css") -Raw -Encoding UTF8
  if ([regex]::Matches($indexHtml, '<script src="\./app\.js').Count -ne 1 -or
    [regex]::Matches($indexHtml, '<script src="\./buttons-ui/buttons-ui\.js').Count -ne 1 -or
    [regex]::Matches($indexHtml, '<link rel="stylesheet" href="\./styles\.css\?v=event-popup-layout-v1"').Count -ne 1 -or
    [regex]::Matches($indexHtml, '<script src="\./app\.js\?v=event-popup-layout-v1"').Count -ne 1 -or
    [regex]::Matches($indexHtml, '<script src="\./event-workflow\.js\?v=public-events-promotion-demo-v1"').Count -ne 1 -or
    $indexHtml -notmatch '<section class="profile-section" aria-labelledby="profile-badges-heading" hidden>' -or
    -not $buttonsScript.Contains('profileBadgesSection.hidden = !user;') -or
    -not $buttonsStyle.Contains('.profile-section[hidden]') -or
    -not $buttonsStyle.Contains('display: none;')) {
    throw "Aplicația trebuie încărcată o singură dată, iar insignele trebuie afișate numai utilizatorilor autentificați."
  }
  $githubPagesInitStart = $appScript.IndexOf("async function initialize()", [StringComparison]::Ordinal)
  $githubPagesInitEnd = $appScript.IndexOf("initialize();", $githubPagesInitStart, [StringComparison]::Ordinal)
  $githubPagesInit = if ($githubPagesInitStart -ge 0 -and $githubPagesInitEnd -gt $githubPagesInitStart) {
    $appScript.Substring($githubPagesInitStart, $githubPagesInitEnd - $githubPagesInitStart)
  } else {
    ""
  }
  $githubPagesGuardPosition = $githubPagesInit.IndexOf("if (isGitHubPages())", [StringComparison]::Ordinal)
  $githubPagesHealthRequestPosition = $githubPagesInit.IndexOf('await apiRequest("/health")', [StringComparison]::Ordinal)
  if (-not $githubPagesInit.Contains("if (isGitHubPages())") -or
    -not $githubPagesInit.Contains("Backendul local nu este necesar pe GitHub Pages.") -or
    $githubPagesGuardPosition -lt 0 -or
    $githubPagesHealthRequestPosition -le $githubPagesGuardPosition) {
    throw "GitHub Pages must initialize community events without requiring the local backend."
  }
  $popupRendererStart = $appScript.IndexOf("function appendEventPopupContent(container, event, includeVenue = true)", [StringComparison]::Ordinal)
  $popupRendererEnd = $appScript.IndexOf("function createEventPopupContent(event)", $popupRendererStart, [StringComparison]::Ordinal)
  $popupRenderer = if ($popupRendererStart -ge 0 -and $popupRendererEnd -gt $popupRendererStart) {
    $appScript.Substring($popupRendererStart, $popupRendererEnd - $popupRendererStart)
  } else {
    ""
  }
  $eventPopupChecks = [ordered]@{
    popupAction = $appScript.Contains("event-route-button")
    eventNavigation = $buttonsScript.Contains("fomo-view-event")
    travelActions = $appScript.Contains("createEventTravelActions")
    eventDateFormatter = $appScript.Contains("function formatCommunityEventDate(event)")
    eventHoursFormatter = $appScript.Contains("function formatEventHours(event)")
    combinedEventDate = $popupRenderer.Contains("formatEventTimeRange(event)")
    hoursLabel = $appScript.Contains("formatEventTimeRange(event)") -and $appScript.Contains("formatEventHours(event)")
    ticketPriceLabel = $popupRenderer.Contains('`Bilet: ${formatTicketPrice(event)}`')
    attendanceSummary = $popupRenderer.Contains("attendanceSummary") -and $appScript.Contains('${attendeeCount} persoane merg')
    attendanceCounter = $appScript.Contains('event-attendance-count${inlineCount ? " inline-count" : ""}')
    inlineAttendanceButton = $popupRenderer.Contains("createAttendanceButton(event, true)")
    attendanceMarkerScale = $appScript.Contains('Math.min(1.75, 1 + Math.log2(attendeeCount + 1) / 12)')
    grayEmptyMarker = $appScript.Contains('attendeeCount === 0 ? " no-attendees"')
    ticketLink = $appScript.Contains(('createElement("a", "event-ticket-link", "Cump' + [char]0x0103 + 'r' + [char]0x0103 + ' bilet'))
    eventExpiry = $appScript.Contains("endsAt.getTime() <= now")
    sharedPopupRenderer = $appScript.Contains("function appendEventPopupContent(container, event, includeVenue = true)")
    eventPopup = $appScript.Contains("appendEventPopupContent(popup, event)")
    locationPopup = $appScript.Contains("appendEventPopupContent(eventSection, event, false)")
    oneTravelActionSetPerEvent = [regex]::Matches($popupRenderer, "createEventTravelActions\(event").Count -eq 1
    noExtraPopupViewButton = -not $popupRenderer.Contains("Vezi evenimentul")
    locationTravelActionsOnlyWhenEmpty = $appScript.Contains('if (!upcomingEvents.length) {') -and
      $appScript.Contains("popup.append(...createEventTravelActions(routeDestination));")
    locationAssociation = $appScript.Contains("eventBelongsToLocation(event, location) && !eventHasEnded(event)")
    mapMarkerSync = $appScript.Contains("function syncEventMarkers()") -and $appScript.Contains("syncEventMarkers();")
    liveEventPopupRefresh = $appScript.Contains("marker.setPopupContent(createEventPopupContent(event))")
    locationNameNormalization = $appScript.Contains("normalizedVenue.includes(normalizedLocationName)")
    locationCoordinateAssociation = $appScript.Contains("Math.hypot(latitudeDistance, longitudeDistance) <= 100")
    liveLocationPopupRefresh = $appScript.Contains("marker.setPopupContent(createLocationPopup(location))")
    eventPopupContentFactory = $appScript.Contains("function createEventPopupContent(event)")
    locationPopupStyle = $styleSheet.Contains(".map-popup .map-popup-community-event") -and
      $styleSheet.Contains(".map-popup .event-attendance-button")
    eventCardNavigation = $buttonsScript.Contains("fomo-view-event") -and $buttonsScript.Contains("scrollIntoView")
    transitAction = $appScript.Contains("TRANSIT")
    rideshareAction = $rideSharingScript.Contains("toggle.textContent")
  }
  $failedEventPopupChecks = @($eventPopupChecks.GetEnumerator() |
    Where-Object { -not $_.Value } |
    ForEach-Object { $_.Key })
  if ($failedEventPopupChecks.Count -gt 0) {
    throw "Event popup validation failed: $($failedEventPopupChecks -join ', ')."
  }
  $eventWorkflowScript = Get-Content -LiteralPath (Join-Path $projectRoot "event-workflow.js") -Raw -Encoding UTF8
  $promotionPaymentScript = Get-Content -LiteralPath (Join-Path $projectRoot "promotion-payment.js") -Raw -Encoding UTF8
  $promotionPaymentHtml = Get-Content -LiteralPath (Join-Path $projectRoot "promotion-payment.html") -Raw -Encoding UTF8
  $eventPublicationPosition = $eventWorkflowScript.IndexOf("state.events = mergedPublicEvents", [StringComparison]::Ordinal)
  $locationLoadPosition = $eventWorkflowScript.IndexOf("locations = await api.locations()", [StringComparison]::Ordinal)
  $unverifiedGuardPosition = $eventWorkflowScript.IndexOf("if (!state.user.emailVerified)", [StringComparison]::Ordinal)
  $ownEventsQueryPosition = $eventWorkflowScript.IndexOf('.orderByChild("submittedBy")', [StringComparison]::Ordinal)
  $eventSubmitPosition = $eventWorkflowScript.IndexOf('await eventRef.set(eventData)', [StringComparison]::Ordinal)
  $eventPublishAfterSubmitPosition = $eventWorkflowScript.IndexOf("publishPublicEvents(state.events)", $eventSubmitPosition, [StringComparison]::Ordinal)
  if (-not $eventWorkflowScript.Contains("Could not load pending public events.") -or
    -not $eventWorkflowScript.Contains("Could not load event locations.") -or
    -not $eventWorkflowScript.Contains("function startPublicEventSubscriptions(initialEvents)") -or
    -not $eventWorkflowScript.Contains('ref.on("value"') -or
    -not $eventWorkflowScript.Contains('equalTo(status)') -or
    $eventPublicationPosition -lt 0 -or
    $locationLoadPosition -le $eventPublicationPosition -or
    $unverifiedGuardPosition -lt 0 -or
    $ownEventsQueryPosition -le $unverifiedGuardPosition -or
    $eventSubmitPosition -lt 0 -or
    $eventPublishAfterSubmitPosition -le $eventSubmitPosition) {
    throw "Approved and pending events must update the map live, newly submitted events must publish immediately, and unverified users must not run protected own-event queries."
  }
  if (-not $appScript.Contains("function attendanceCountLabel(event)") -or
    -not $appScript.Contains("event.attendanceLoaded !== true") -or
    -not $appScript.Contains("Number.isSafeInteger(event.attendeesCount)") -or
    -not $appScript.Contains('event-attendance-count${inlineCount ? " inline-count" : ""}') -or
    -not $appScript.Contains("function updateEventAttendanceSubscriptions()") -or
    -not $appScript.Contains('eventAttendance/${event.id}') -or
    -not $appScript.Contains("function updateEventAttendanceForUser(user)") -or
    -not $eventWorkflowScript.Contains("attendanceData.has(event.id)") -or
    -not $eventWorkflowScript.Contains("currentEvent.attendanceLoaded = true") -or
    -not $eventWorkflowScript.Contains("currentEvent.attendanceError = error.message")) {
    throw "RSVP counts must wait for the Firebase snapshot and never show an unverified zero."
  }
  $hasEventExpiry = $appScript.Contains("function eventHasEnded(event, now = Date.now())")
  $prunesExpiredEvents = $appScript.Contains("window.setInterval(pruneExpiredEvents, 30_000)")
  $eventMarkerUsesAttendance = $appScript.Contains("const markerCount = attendanceCountLabel(event);")
  $promotedVisibilityIsApplied = $settingsScript.Contains("window.FomoSetPromotedVisibility?.(settings.showPromoted)")
  $hasObsoleteSettingsRenderer = $settingsScript.Contains("renderEventsWithSettings")
  $usesObsoleteVoteMarkup = $appScript.Contains('<span>${event.votes}</span>')
  if (-not $hasEventExpiry -or
    -not $prunesExpiredEvents -or
    -not $eventMarkerUsesAttendance -or
    -not $promotedVisibilityIsApplied -or
    $hasObsoleteSettingsRenderer -or
    $usesObsoleteVoteMarkup) {
    throw "Event markers must use attendee counts, respect visibility settings, and disappear after their end time."
  }
  if ($appScript -notmatch "function getApiBaseUrl\(\)" -or
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

  $eventPriceValidation = $databaseRules.rules.communityEvents.'$eventId'.ticketPriceCents.'.validate'
  $eventWorkflowScript = Get-Content -LiteralPath (Join-Path $projectRoot "event-workflow.js") -Raw -Encoding UTF8
  $eventWriteRule = $databaseRules.rules.communityEvents.'$eventId'.'.write'
  $promotionChecks = [ordered]@{
    ticketPriceField = $eventWorkflowScript.Contains('ticketPrice.name = "ticketPrice"')
    ticketPriceStoredInCents = $eventWorkflowScript.Contains('const ticketPriceCents = Math.round(Number(values.get("ticketPrice")) * 100);')
    eventEndField = $eventWorkflowScript.Contains('endsAt.name = "endsAt"')
    ticketUrlField = $eventWorkflowScript.Contains('ticketUrl.name = "ticketUrl"')
    eventAttendance = $eventWorkflowScript.Contains('eventAttendance/${event.id}')
    paidStateDisplayed = $eventWorkflowScript.Contains("event.promotionStatus === 'paid'") -or
      $eventWorkflowScript.Contains('event.promotionStatus === "paid"')
    ownerRequestAction = $eventWorkflowScript.Contains('promotionStatus: "requested"')
    adminConfirmationAction = $eventWorkflowScript.Contains('promotionStatus: "paid"')
    promotionDemoLink = $eventWorkflowScript.Contains('promotion-payment.html?eventId=${encodeURIComponent(event.id)}')
    promotionDemoWritesRequest = $promotionPaymentScript.Contains('promotionStatus: "requested"')
    promotionDemoChecksOwner = $promotionPaymentScript.Contains("eventOwnerUid === user.uid")
    promotionDemoDisclaimsPayment = [regex]::IsMatch($promotionPaymentHtml, 'Nu se proceseaz.{1,80}nicio plat.{1,20}real')
    ticketPriceValidation = $eventPriceValidation.Contains("% 1 == 0") -and $eventPriceValidation.Contains("10000000")
    requestedStateRule = $eventWriteRule.Contains("promotionRequestedBy")
    paidStateRule = $eventWriteRule.Contains("promotedBy")
  }
  $failedPromotionChecks = @($promotionChecks.GetEnumerator() |
    Where-Object { -not $_.Value } |
    ForEach-Object { $_.Key })
  if ($failedPromotionChecks.Count -gt 0) {
    throw "Promotion validation failed: $($failedPromotionChecks -join ', ')."
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
    $databaseRules.rules.eventAttendance.'$eventId'.'.read' -ne $true -or
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

  Write-Output "Smoke test passed: API, shared Groq Worker configuration, Firebase assets, empty demo event catalog and 90 seeded locations are valid."
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
