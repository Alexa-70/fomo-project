(function () {
  const context = window.FomoRouteContext;
  let routeLayer = null;
  let startMarker = null;
  let destinationMarker = null;

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

  async function showRoute(event) {
    context.setStatus(`Calculăm traseul către ${event.title}...`);
    context.mapHint.textContent = "Se calculează traseul...";
    document.querySelectorAll(".event-route-button").forEach((button) => {
      button.disabled = true;
    });

    try {
      const start = await resolveOrigin();
      const route = await context.apiRequest("/api/routes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          origin: start,
          destination: {
            latitude: Number(event.latitude),
            longitude: Number(event.longitude),
          },
        }),
      });

      clearRoute();
      context.clearRoute();
      routeLayer = L.geoJSON(route.geometry, {
        style: { color: "#b5dc38", weight: 6, opacity: 0.92, lineCap: "round", lineJoin: "round" },
      }).addTo(context.map);
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
      context.mapHint.textContent = `${distance} · ${duration} până la eveniment`;
      context.setStatus(`Traseu către „${event.title}”: ${distance}, aproximativ ${duration}.`, "success");

      const eventMarker = context.getEventMarker(event.id);
      if (eventMarker) eventMarker.closePopup();
      return {
        distanceMeters: route.distanceMeters,
        durationSeconds: route.durationSeconds,
        steps: route.steps,
      };
    } catch (error) {
      context.mapHint.textContent = `${event.title} · ${event.venue}`;
      context.setStatus(error.message || "Nu am putut calcula traseul.", "error");
      return null;
    } finally {
      document.querySelectorAll(".event-route-button").forEach((button) => {
        button.disabled = false;
      });
    }
  }

  window.FomoRoutePlanner = { showRoute };
})();
