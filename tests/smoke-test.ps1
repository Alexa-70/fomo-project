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

  foreach ($asset in @("firebase-config.js", "firebase-client.js", "account-panel.js", "account-panel.css", "event-workflow.js", "locations.json", "database.rules.json")) {
    $assetResponse = Invoke-WebRequest -Uri "$baseUrl/$asset" -UseBasicParsing -TimeoutSec 5
    if ($assetResponse.StatusCode -ne 200) {
      throw "Resursa statică '$asset' nu a fost servită cu statusul 200."
    }
  }

  $databaseRules = Get-Content -LiteralPath (Join-Path $projectRoot "database.rules.json") -Raw -Encoding UTF8 | ConvertFrom-Json
  $ownerRequestRule = $databaseRules.rules.ownerRequests
  $ownerRequestValidation = $ownerRequestRule.'$uid'.'$locationId'.'.validate'
  if ($ownerRequestValidation -notmatch "newData\.numChildren\(\) == 8" -or
    $ownerRequestValidation -notmatch "newData\.numChildren\(\) == 10" -or
    $null -ne $ownerRequestRule.'$uid'.'$locationId'.'$other') {
    throw "Regulile cererilor de owner nu permit schema validă sau permit câmpuri nevalidate."
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
