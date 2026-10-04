(function () {
  const context = window.FomoRouteContext;
  let routeLayer = null;
  let startMarker = null;
  let destinationMarker = null;
  let routeRequestId = 0;
  const routeStyles = {
    WALKING: { color: "#2f9e64", weight: 6, opacity: 0.92, dashArray: "8 7", lineCap: "round", lineJoin: "round" },
    TRANSIT: { color: "#3678db", weight: 6, opacity: 0.92, lineCap: "round", lineJoin: "round" },
    DRIVING: { color: "#e58a24", weight: 6, opacity: 0.92, lineCap: "round", lineJoin: "round" },
  };
  const routeLabels = {
    WALKING: "pe jos",
    TRANSIT: "cu transportul în comun",
    DRIVING: "cu mașina",
  };

  function createMarkerIcon(label, isDestination = false) {
    return L.divIcon({
      className: "",
      html: `<div class="route-marker${isDestination ? " destination" : ""}"><span>${label}</span></div>`,
      iconSize: [30, 30],
      iconAnchor: [15, 27],
    });
  }

  async function resolveOrigin() {
    const query = context.originInput.value.trim();
    if (!query || query === context.originInput.dataset.selectedQuery) {
      const currentOrigin = context.getOrigin();
      if (!Number.isFinite(currentOrigin.latitude) || !Number.isFinite(currentOrigin.longitude)) {
        throw new Error("Alege o locație de plecare sau folosește locația ta.");
      }
      return currentOrigin;
    }

    const data = await context.apiRequest(`/api/search?q=${encodeURIComponent(query)}`);
    const result = data.results[0];
    if (!result) {
      throw new Error(`Nu am găsit locația „${query}”. Încearcă o adresă sau un oraș mai precis.`);
    }

    const selectedOrigin = {
      latitude: Number(result.latitude),
      longitude: Number(result.longitude),
    };
    if (!Number.isFinite(selectedOrigin.latitude) || !Number.isFinite(selectedOrigin.longitude)) {
      throw new Error("Serviciul de căutare a întors coordonate invalide.");
    }

    context.originInput.value = result.displayName;
    context.originHint.textContent = "Punct de plecare selectat";
    context.setOrigin(selectedOrigin);
    return selectedOrigin;
  }

  function clearRoute() {
    if (routeLayer) context.map.removeLayer(routeLayer);
    if (startMarker) context.map.removeLayer(startMarker);
    if (destinationMarker) context.map.removeLayer(destinationMarker);
    routeLayer = null;
    startMarker = null;
    destinationMarker = null;
  }

  function getDirections(start, event, mode) {
    if (!window.google?.maps?.DirectionsService || !window.google.maps.TravelMode) {
      throw new Error("Google Maps DirectionsService nu este disponibil. Verifică încărcarea SDK-ului.");
    }
    if (!routeStyles[mode]) {
      throw new Error(`Mod de transport necunoscut: ${mode}.`);
    }

    const service = new google.maps.DirectionsService();
    const request = {
      origin: { lat: Number(start.latitude), lng: Number(start.longitude) },
      destination: { lat: Number(event.latitude), lng: Number(event.longitude) },
      travelMode: google.maps.TravelMode[mode],
      unitSystem: google.maps.UnitSystem.METRIC,
    };
    if (mode === "TRANSIT") {
      request.transitOptions = { departureTime: new Date() };
    }

    return new Promise((resolve, reject) => {
      service.route(request, (result, status) => {
        if (status !== google.maps.DirectionsStatus.OK) {
          const reason = status === "REQUEST_DENIED"
            ? "Activează Directions API (Legacy) în proiectul Google Maps folosit de aplicație."
            : `Google Maps a răspuns cu statusul ${status}.`;
          reject(new Error(`Nu s-a putut calcula ruta ${routeLabels[mode]}. ${reason}`));
          return;
        }
        const route = result?.routes?.[0];
        const leg = route?.legs?.[0];
        if (!route?.overview_path?.length || !leg?.distance || !leg?.duration) {
          reject(new Error("Google Maps a întors un traseu incomplet."));
          return;
        }
        resolve({
          coordinates: route.overview_path.map((point) => [point.lat(), point.lng()]),
          distanceMeters: leg.distance.value,
          durationSeconds: leg.duration.value,
        });
      });
    });
  }

  async function showRoute(event, mode = "WALKING") {
    const requestId = ++routeRequestId;
    if (!routeStyles[mode]) {
      context.setStatus(`Mod de transport necunoscut: ${mode}.`, "error");
      return null;
    }

    context.setStatus(`Calculăm ruta ${routeLabels[mode]} către ${event.title}...`);
    context.mapHint.textContent = "Se calculează traseul...";
    document.querySelectorAll(".event-route-button, .travel-mode-button").forEach((button) => {
      button.disabled = true;
    });

    try {
      const start = await resolveOrigin();
      const route = await getDirections(start, event, mode);
      if (requestId !== routeRequestId) return null;

      clearRoute();
      context.clearRoute();
      routeLayer = L.polyline(route.coordinates, routeStyles[mode]).addTo(context.map);
      startMarker = L.marker([start.latitude, start.longitude], {
        icon: createMarkerIcon("A"),
      }).addTo(context.map);
      destinationMarker = L.marker([event.latitude, event.longitude], {
        icon: createMarkerIcon("E", true),
      }).addTo(context.map);

      const bounds = L.featureGroup([routeLayer, startMarker, destinationMarker]).getBounds();
      context.map.fitBounds(bounds.pad(0.16), { maxZoom: 15 });
      const distance = context.formatDistance(route.distanceMeters);
      const duration = context.formatDuration(route.durationSeconds);
      const modeIcon = mode === "WALKING" ? "🚶" : mode === "TRANSIT" ? "🚌" : "🚗";
      context.mapHint.textContent = `${distance} · ${modeIcon} ${duration}`;
      context.setStatus(`Rută către „${event.title}” ${routeLabels[mode]}: ${distance}, ${duration}.`, "success");
      return {
        distanceMeters: route.distanceMeters,
        durationSeconds: route.durationSeconds,
        mode,
        coordinates: route.coordinates,
      };
    } catch (error) {
      if (requestId !== routeRequestId) return null;
      context.mapHint.textContent = `${event.title} · ${event.venue}`;
      context.setStatus(error instanceof Error ? error.message : String(error), "error");
      return null;
    } finally {
      if (requestId === routeRequestId) {
        document.querySelectorAll(".event-route-button, .travel-mode-button").forEach((button) => {
          button.disabled = false;
        });
      }
    }
  }

  window.FomoRoutePlanner = { showRoute };
})();
